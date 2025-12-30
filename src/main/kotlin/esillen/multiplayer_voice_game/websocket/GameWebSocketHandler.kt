package esillen.multiplayer_voice_game.websocket

import tools.jackson.databind.ObjectMapper
import esillen.multiplayer_voice_game.model.*
import esillen.multiplayer_voice_game.service.GameService
import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.handler.TextWebSocketHandler
import java.util.concurrent.ConcurrentHashMap

@Component
class GameWebSocketHandler(
    private val gameService: GameService,
    private val objectMapper: ObjectMapper
) : TextWebSocketHandler() {

    private val logger = LoggerFactory.getLogger(GameWebSocketHandler::class.java)
    
    // Track lobby sessions (for receiving court summaries)
    private val lobbySessions = ConcurrentHashMap.newKeySet<WebSocketSession>()

    @PostConstruct
    fun init() {
        gameService.onStateUpdate = { courtId, state -> broadcastStateUpdate(courtId, state) }
        gameService.onPlayerJoined = { courtId, player -> broadcastPlayerJoined(courtId, player) }
        gameService.onPlayerLeft = { courtId, player -> broadcastPlayerLeft(courtId, player) }
        gameService.onPlayerReady = { courtId, player -> broadcastPlayerReady(courtId, player) }
        gameService.onGameOver = { courtId, winner -> broadcastGameOver(courtId, winner) }
        gameService.onGameEndWithScore = { courtId, result -> broadcastGameEndWithScore(courtId, result) }
        gameService.onCourtUpdate = { summaries -> broadcastCourtSummaries(summaries) }
        gameService.onDisconnectPlayers = { courtId, sessions -> disconnectPlayerSessions(sessions) }
    }

    override fun afterConnectionEstablished(session: WebSocketSession) {
        logger.info("WebSocket connection established: ${session.id}")
    }

    override fun handleTextMessage(session: WebSocketSession, message: TextMessage) {
        try {
            val payload = message.payload
            val json = objectMapper.readTree(payload)
            val type = json.get("type")?.asText()

            when (type) {
                "join" -> {
                    val courtId = json.get("courtId")?.asInt() ?: 1
                    handleJoin(session, courtId, json.get("name").asText(), json.get("side").asText())
                }
                "pitch" -> handlePitch(session, json.get("pitch").asText())
                "ready" -> handleReady(session)
                "spectate" -> {
                    val courtId = json.get("courtId")?.asInt() ?: 1
                    handleSpectate(session, courtId)
                }
                "lobby" -> handleLobby(session)
                "leaveLobby" -> handleLeaveLobby(session)
                else -> sendError(session, "Unknown message type: $type")
            }
        } catch (e: Exception) {
            logger.error("Error handling message: ${e.message}", e)
            sendError(session, "Error processing message: ${e.message}")
        }
    }

    override fun afterConnectionClosed(session: WebSocketSession, status: CloseStatus) {
        logger.info("WebSocket connection closed: ${session.id}, status: $status")
        lobbySessions.remove(session)
        gameService.playerDisconnected(session)
    }

    private fun handleJoin(session: WebSocketSession, courtId: Int, name: String, sideStr: String) {
        // Remove from lobby if joining a game
        lobbySessions.remove(session)
        
        val side = try {
            PaddleSide.valueOf(sideStr.uppercase())
        } catch (e: IllegalArgumentException) {
            sendError(session, "Invalid side: $sideStr")
            return
        }

        val result = gameService.joinGame(courtId, name, side, session)
        result.fold(
            onSuccess = { player ->
                sendMessage(session, mapOf(
                    "type" to "joinResult",
                    "success" to true,
                    "playerId" to player.id,
                    "courtId" to courtId
                ))
                // Send current state immediately
                gameService.getCurrentStateDto(courtId)?.let { state ->
                    sendMessage(session, mapOf(
                        "type" to "stateUpdate",
                        "courtId" to courtId,
                        "state" to state
                    ))
                }
            },
            onFailure = { error ->
                sendMessage(session, mapOf(
                    "type" to "joinResult",
                    "success" to false,
                    "error" to error.message
                ))
            }
        )
    }

    private fun handlePitch(session: WebSocketSession, pitchStr: String) {
        val (courtId, player) = gameService.getPlayerBySession(session) ?: run {
            sendError(session, "Not registered as a player")
            return
        }

        val pitch = try {
            PitchState.valueOf(pitchStr.uppercase())
        } catch (e: IllegalArgumentException) {
            sendError(session, "Invalid pitch: $pitchStr")
            return
        }

        gameService.updatePitch(courtId, player.id, pitch)
    }

    private fun handleReady(session: WebSocketSession) {
        val (courtId, player) = gameService.getPlayerBySession(session) ?: run {
            sendError(session, "Not registered as a player")
            return
        }
        gameService.playerReady(courtId, player.id)
    }

    private fun handleSpectate(session: WebSocketSession, courtId: Int) {
        // Remove from lobby if spectating a game
        lobbySessions.remove(session)
        
        val spectatorId = gameService.addSpectator(courtId, session)
        if (spectatorId != null) {
            sendMessage(session, mapOf(
                "type" to "spectateResult",
                "success" to true,
                "spectatorId" to spectatorId,
                "courtId" to courtId
            ))
            // Send current state immediately
            gameService.getCurrentStateDto(courtId)?.let { state ->
                sendMessage(session, mapOf(
                    "type" to "stateUpdate",
                    "courtId" to courtId,
                    "state" to state
                ))
            }
        } else {
            sendMessage(session, mapOf(
                "type" to "spectateResult",
                "success" to false,
                "error" to "Invalid court"
            ))
        }
    }
    
    private fun handleLobby(session: WebSocketSession) {
        lobbySessions.add(session)
        // Send current court summaries immediately
        sendMessage(session, mapOf(
            "type" to "courtSummaries",
            "courts" to gameService.getAllCourtSummaries()
        ))
    }
    
    private fun handleLeaveLobby(session: WebSocketSession) {
        lobbySessions.remove(session)
    }

    private fun broadcastStateUpdate(courtId: Int, state: GameStateDto) {
        val message = mapOf("type" to "stateUpdate", "courtId" to courtId, "state" to state)
        broadcastToCourt(courtId, message)
    }

    private fun broadcastPlayerJoined(courtId: Int, player: Player) {
        val message = mapOf(
            "type" to "playerJoined",
            "courtId" to courtId,
            "name" to player.name,
            "side" to player.side.name
        )
        broadcastToCourt(courtId, message)
    }

    private fun broadcastPlayerLeft(courtId: Int, player: Player) {
        val message = mapOf(
            "type" to "playerLeft",
            "courtId" to courtId,
            "name" to player.name,
            "side" to player.side.name
        )
        broadcastToCourt(courtId, message)
    }

    private fun broadcastPlayerReady(courtId: Int, player: Player) {
        val message = mapOf(
            "type" to "playerReady",
            "courtId" to courtId,
            "name" to player.name,
            "side" to player.side.name
        )
        broadcastToCourt(courtId, message)
    }

    private fun broadcastGameOver(courtId: Int, winner: String) {
        val message = mapOf("type" to "gameOver", "courtId" to courtId, "winner" to winner)
        broadcastToCourt(courtId, message)
    }
    
    private fun broadcastGameEndWithScore(courtId: Int, result: GameEndResult) {
        val message = mapOf(
            "type" to "gameEndWithScore",
            "courtId" to courtId,
            "winner" to result.winner,
            "leftScore" to result.leftScore,
            "rightScore" to result.rightScore,
            "leftPlayerName" to result.leftPlayerName,
            "rightPlayerName" to result.rightPlayerName,
            "walkover" to result.walkover
        )
        broadcastToCourt(courtId, message)
    }
    
    private fun disconnectPlayerSessions(sessions: List<WebSocketSession>) {
        sessions.forEach { session ->
            try {
                if (session.isOpen) {
                    // Send a final message before closing
                    sendMessage(session, mapOf(
                        "type" to "gameFinished",
                        "message" to "Game ended. Returning to lobby..."
                    ))
                    // Close the session
                    session.close()
                }
            } catch (e: Exception) {
                logger.error("Error disconnecting player session ${session.id}: ${e.message}")
            }
        }
    }
    
    private fun broadcastCourtSummaries(summaries: List<CourtSummaryDto>) {
        val message = mapOf("type" to "courtSummaries", "courts" to summaries)
        val textMessage = TextMessage(objectMapper.writeValueAsString(message))
        lobbySessions.forEach { session ->
            try {
                if (session.isOpen) {
                    session.sendMessage(textMessage)
                }
            } catch (e: Exception) {
                logger.error("Error broadcasting to lobby session ${session.id}: ${e.message}")
            }
        }
    }

    private fun broadcastToCourt(courtId: Int, message: Any) {
        val textMessage = TextMessage(objectMapper.writeValueAsString(message))
        gameService.getAllSessionsForCourt(courtId).forEach { session ->
            try {
                if (session.isOpen) {
                    session.sendMessage(textMessage)
                }
            } catch (e: Exception) {
                logger.error("Error broadcasting to session ${session.id}: ${e.message}")
            }
        }
    }

    private fun sendMessage(session: WebSocketSession, message: Any) {
        try {
            if (session.isOpen) {
                session.sendMessage(TextMessage(objectMapper.writeValueAsString(message)))
            }
        } catch (e: Exception) {
            logger.error("Error sending message to session ${session.id}: ${e.message}")
        }
    }

    private fun sendError(session: WebSocketSession, errorMessage: String) {
        sendMessage(session, mapOf("type" to "error", "message" to errorMessage))
    }
}
