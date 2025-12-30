package esillen.multiplayer_voice_game.service

import esillen.multiplayer_voice_game.model.*
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.web.socket.WebSocketSession
import java.util.concurrent.ConcurrentHashMap

@Service
class GameService {
    
    companion object {
        const val NUM_COURTS = 5
    }

    // Create 5 courts
    private val courts = (1..NUM_COURTS).map { Court(it) }.associateBy { it.id }
    
    // Track which court each session belongs to
    private val sessionToCourt = ConcurrentHashMap<WebSocketSession, Int>()
    
    // Callbacks for WebSocket broadcasts (now include courtId)
    var onStateUpdate: ((Int, GameStateDto) -> Unit)? = null
    var onPlayerJoined: ((Int, Player) -> Unit)? = null
    var onPlayerLeft: ((Int, Player) -> Unit)? = null
    var onPlayerReady: ((Int, Player) -> Unit)? = null
    var onGameOver: ((Int, String) -> Unit)? = null
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
        
        val player = court.playerDisconnected(session)
        if (player != null) {
            onPlayerLeft?.invoke(courtId, player)
            
            // Check for walkover win
            if (court.gameState.walkover && court.gameState.winner != null) {
                onGameOver?.invoke(courtId, court.gameState.winner!!)
            }
            
            onCourtUpdate?.invoke(getAllCourtSummaries())
        }
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
            
            // Check if game just ended
            if (wasPlaying && court.gameState.status == GameStatus.FINISHED && court.gameState.winner != null) {
                onGameOver?.invoke(court.id, court.gameState.winner!!)
                
                // Disconnect all players (they'll see final state on client before disconnect)
                val playerSessions = court.disconnectAllPlayers()
                playerSessions.forEach { session ->
                    sessionToCourt.remove(session)
                }
                
                // Notify handler to close player WebSocket sessions
                onDisconnectPlayers?.invoke(court.id, playerSessions)
                
                // Reset court to 0-0 immediately (final state saved for spectators)
                court.resetGameAfterWin()
                
                // Notify court update for lobby
                onCourtUpdate?.invoke(getAllCourtSummaries())
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
