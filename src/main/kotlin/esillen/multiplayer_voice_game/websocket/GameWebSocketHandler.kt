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

@Component
class GameWebSocketHandler(
    private val gameService: GameService,
    private val objectMapper: ObjectMapper
) : TextWebSocketHandler() {

    private val logger = LoggerFactory.getLogger(GameWebSocketHandler::class.java)

    @PostConstruct
    fun init() {
        gameService.onStateUpdate = { state -> broadcastStateUpdate(state) }
        gameService.onPlayerJoined = { player -> broadcastPlayerJoined(player) }
        gameService.onPlayerLeft = { player -> broadcastPlayerLeft(player) }
        gameService.onPlayerReady = { player -> broadcastPlayerReady(player) }
        gameService.onGameOver = { winner -> broadcastGameOver(winner) }
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
                "join" -> handleJoin(session, json.get("name").asText(), json.get("side").asText())
                "pitch" -> handlePitch(session, json.get("pitch").asText())
                "ready" -> handleReady(session)
                "spectate" -> handleSpectate(session)
                else -> sendError(session, "Unknown message type: $type")
            }
        } catch (e: Exception) {
            logger.error("Error handling message: ${e.message}", e)
            sendError(session, "Error processing message: ${e.message}")
        }
    }

    override fun afterConnectionClosed(session: WebSocketSession, status: CloseStatus) {
        logger.info("WebSocket connection closed: ${session.id}, status: $status")
        gameService.playerDisconnected(session)
    }

    private fun handleJoin(session: WebSocketSession, name: String, sideStr: String) {
        val side = try {
            PaddleSide.valueOf(sideStr.uppercase())
        } catch (e: IllegalArgumentException) {
            sendError(session, "Invalid side: $sideStr")
            return
        }

        val result = gameService.joinGame(name, side, session)
        result.fold(
            onSuccess = { player ->
                sendMessage(session, mapOf(
                    "type" to "joinResult",
                    "success" to true,
                    "playerId" to player.id
                ))
                // Send current state immediately
                sendMessage(session, mapOf(
                    "type" to "stateUpdate",
                    "state" to gameService.getCurrentStateDto()
                ))
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
        val player = gameService.getPlayerBySession(session)
        if (player == null) {
            sendError(session, "Not registered as a player")
            return
        }

        val pitch = try {
            PitchState.valueOf(pitchStr.uppercase())
        } catch (e: IllegalArgumentException) {
            sendError(session, "Invalid pitch: $pitchStr")
            return
        }

        gameService.updatePitch(player.id, pitch)
    }

    private fun handleReady(session: WebSocketSession) {
        val player = gameService.getPlayerBySession(session)
        if (player == null) {
            sendError(session, "Not registered as a player")
            return
        }
        gameService.playerReady(player.id)
    }

    private fun handleSpectate(session: WebSocketSession) {
        val spectatorId = gameService.addSpectator(session)
        sendMessage(session, mapOf(
            "type" to "spectateResult",
            "success" to true,
            "spectatorId" to spectatorId
        ))
        // Send current state immediately
        sendMessage(session, mapOf(
            "type" to "stateUpdate",
            "state" to gameService.getCurrentStateDto()
        ))
    }

    private fun broadcastStateUpdate(state: GameStateDto) {
        val message = mapOf("type" to "stateUpdate", "state" to state)
        broadcast(message)
    }

    private fun broadcastPlayerJoined(player: Player) {
        val message = mapOf(
            "type" to "playerJoined",
            "name" to player.name,
            "side" to player.side.name
        )
        broadcast(message)
    }

    private fun broadcastPlayerLeft(player: Player) {
        val message = mapOf(
            "type" to "playerLeft",
            "name" to player.name,
            "side" to player.side.name
        )
        broadcast(message)
    }

    private fun broadcastPlayerReady(player: Player) {
        val message = mapOf(
            "type" to "playerReady",
            "name" to player.name,
            "side" to player.side.name
        )
        broadcast(message)
    }

    private fun broadcastGameOver(winner: String) {
        val message = mapOf("type" to "gameOver", "winner" to winner)
        broadcast(message)
    }

    private fun broadcast(message: Any) {
        val textMessage = TextMessage(objectMapper.writeValueAsString(message))
        gameService.getAllSessions().forEach { session ->
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

