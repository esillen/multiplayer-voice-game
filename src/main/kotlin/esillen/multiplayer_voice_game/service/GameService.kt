package esillen.multiplayer_voice_game.service

import esillen.multiplayer_voice_game.model.*
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.web.socket.WebSocketSession
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Service
class GameService {
    
    companion object {
        const val NUM_COURTS = 5
    }

    // Create 5 courts
    private val courts = (1..NUM_COURTS).map { Court(it) }.associateBy { it.id }
    
    // Track which court each session belongs to
    private val sessionToCourt = ConcurrentHashMap<WebSocketSession, Int>()
    
    // Track sessions that should be disconnected after game end timeout
    private val sessionsToDisconnect = ConcurrentHashMap<WebSocketSession, Long>()
    
    private val scheduler = Executors.newScheduledThreadPool(1)
    
    // Callbacks for WebSocket broadcasts (now include courtId)
    var onStateUpdate: ((Int, GameStateDto) -> Unit)? = null
    var onPlayerJoined: ((Int, Player) -> Unit)? = null
    var onPlayerLeft: ((Int, Player) -> Unit)? = null
    var onPlayerReady: ((Int, Player) -> Unit)? = null
    var onGameOver: ((Int, String) -> Unit)? = null
    var onGameEndWithScore: ((Int, GameEndResult) -> Unit)? = null
    var onCourtUpdate: ((List<CourtSummaryDto>) -> Unit)? = null
    var onDisconnectPlayers: ((Int, List<WebSocketSession>) -> Unit)? = null

    fun getCourt(courtId: Int): Court? = courts[courtId]
    
    fun getAllCourts(): List<Court> = courts.values.toList()
    
    fun getAllCourtSummaries(): List<CourtSummaryDto> = courts.values.map { it.getCourtSummary() }

    fun joinGame(courtId: Int, name: String, side: PaddleSide, session: WebSocketSession): Result<Player> {
        val court = courts[courtId] 
            ?: return Result.failure(Exception("Invalid court ID: $courtId"))
            
        val result = court.joinGame(name, side, session)
        result.onSuccess { player ->
            sessionToCourt[session] = courtId
            onPlayerJoined?.invoke(courtId, player)
            onCourtUpdate?.invoke(getAllCourtSummaries())
        }
        return result
    }

    fun addSpectator(courtId: Int, session: WebSocketSession): String? {
        val court = courts[courtId] ?: return null
        val id = court.addSpectator(session)
        sessionToCourt[session] = courtId
        onCourtUpdate?.invoke(getAllCourtSummaries())
        return id
    }

    fun removeSpectator(courtId: Int, id: String) {
        courts[courtId]?.removeSpectator(id)
        onCourtUpdate?.invoke(getAllCourtSummaries())
    }

    fun playerReady(courtId: Int, playerId: String) {
        val court = courts[courtId] ?: return
        val player = court.playerReady(playerId)
        if (player != null) {
            onPlayerReady?.invoke(courtId, player)
        }
    }

    fun updatePitch(courtId: Int, playerId: String, pitch: PitchState) {
        courts[courtId]?.updatePitch(playerId, pitch)
    }

    fun playerDisconnected(session: WebSocketSession) {
        val courtId = sessionToCourt.remove(session) ?: return
        val court = courts[courtId] ?: return
        
        // Remove from scheduled disconnect if present
        sessionsToDisconnect.remove(session)
        
        val player = court.getPlayerBySession(session)
        
        // If player is marked as finished, don't treat as walkover
        if (player != null && player.gameFinished) {
            // Just remove the player, no walkover
            court.players.remove(player.id)
            return
        }
        
        // Normal disconnect handling
        val wasPlaying = court.gameState.status == GameStatus.PLAYING
        val disconnectedPlayer = court.playerDisconnected(session)
        if (disconnectedPlayer != null) {
            onPlayerLeft?.invoke(courtId, disconnectedPlayer)
            
            // Check for walkover win (only if game was playing and not finished)
            if (wasPlaying && court.gameState.status == GameStatus.FINISHED && court.gameState.walkover && court.gameState.winner != null) {
                // Handle walkover the same way as normal game end
                handleGameEnd(court)
            }
            
            onCourtUpdate?.invoke(getAllCourtSummaries())
        }
    }
    
    private fun handleGameEnd(court: Court) {
        // Prevent duplicate handling
        if (court.gameEndHandled) {
            return
        }
        court.gameEndHandled = true
        
        // Call game over callback
        if (court.gameState.winner != null) {
            onGameOver?.invoke(court.id, court.gameState.winner!!)
        }
        
        // Mark players as finished and get final score
        val (playerSessions, gameEndResult) = court.markPlayersAsFinished()
        
        // Send game end message with final score to all (players and spectators)
        onGameEndWithScore?.invoke(court.id, gameEndResult)
        
        // Schedule disconnect of player sessions after 10 seconds
        val disconnectTime = System.currentTimeMillis() + 10000
        playerSessions.forEach { session ->
            sessionsToDisconnect[session] = disconnectTime
        }
        
        scheduler.schedule({
            playerSessions.forEach { session ->
                if (sessionsToDisconnect.containsKey(session)) {
                    sessionsToDisconnect.remove(session)
                    // Force disconnect
                    val player = court.getPlayerBySession(session)
                    if (player != null) {
                        court.players.remove(player.id)
                        sessionToCourt.remove(session)
                        onDisconnectPlayers?.invoke(court.id, listOf(session))
                    }
                }
            }
            
            // Reset court after disconnecting players
            court.resetGameAfterWin()
            court.gameEndHandled = false // Reset flag for next game
            onCourtUpdate?.invoke(getAllCourtSummaries())
        }, 10, TimeUnit.SECONDS)
    }

    fun getCourtForSession(session: WebSocketSession): Int? = sessionToCourt[session]

    fun getPlayer(courtId: Int, playerId: String): Player? = courts[courtId]?.getPlayer(playerId)

    fun getPlayerBySession(session: WebSocketSession): Pair<Int, Player>? {
        val courtId = sessionToCourt[session] ?: return null
        val court = courts[courtId] ?: return null
        val player = court.getPlayerBySession(session) ?: return null
        return Pair(courtId, player)
    }

    fun isSpectator(session: WebSocketSession): Boolean {
        val courtId = sessionToCourt[session] ?: return false
        return courts[courtId]?.isSpectator(session) ?: false
    }

    fun getAllSessionsForCourt(courtId: Int): List<WebSocketSession> {
        return courts[courtId]?.getAllSessions() ?: emptyList()
    }

    fun getCurrentStateDto(courtId: Int): GameStateDto? {
        return courts[courtId]?.getCurrentStateDto()
    }

    @Scheduled(fixedRate = 16) // ~60fps
    fun gameLoop() {
        courts.values.forEach { court ->
            val wasPlaying = court.gameState.status == GameStatus.PLAYING
            court.gameLoop()
            
            // Check if game just ended (by score, not walkover)
            if (wasPlaying && court.gameState.status == GameStatus.FINISHED && court.gameState.winner != null && !court.gameState.walkover) {
                onGameOver?.invoke(court.id, court.gameState.winner!!)
                handleGameEnd(court)
            }
            
            // Broadcast state update for this court
            onStateUpdate?.invoke(court.id, court.getCurrentStateDto())
        }
    }

    fun resetGame(courtId: Int) {
        courts[courtId]?.resetGame()
        onCourtUpdate?.invoke(getAllCourtSummaries())
    }
}
