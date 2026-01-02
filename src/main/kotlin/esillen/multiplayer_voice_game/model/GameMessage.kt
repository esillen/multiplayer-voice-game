package esillen.multiplayer_voice_game.model

// Messages from client to server
sealed class ClientMessage {
    data class Join(val name: String, val side: PaddleSide) : ClientMessage()
    data class PitchUpdate(val pitch: PitchState) : ClientMessage()
    data object Ready : ClientMessage()
    data object Spectate : ClientMessage()
}

// Messages from server to client
sealed class ServerMessage {
    data class JoinResult(val success: Boolean, val playerId: String?, val error: String?) : ServerMessage()
    data class StateUpdate(val state: GameStateDto) : ServerMessage()
    data class PlayerJoined(val name: String, val side: PaddleSide) : ServerMessage()
    data class PlayerLeft(val name: String, val side: PaddleSide) : ServerMessage()
    data class PlayerReady(val name: String, val side: PaddleSide) : ServerMessage()
    data class GameStarting(val countdown: Int) : ServerMessage()
    data class GameOver(val winner: String) : ServerMessage()
    data class Error(val message: String) : ServerMessage()
}

// DTO for game state to send to clients
data class GameStateDto(
    val status: String,
    val leftScore: Int,
    val rightScore: Int,
    val ballX: Double,
    val ballY: Double,
    val ballVelocityX: Double = 0.0,
    val ballVelocityY: Double = 0.0,
    val leftPaddleY: Double,
    val rightPaddleY: Double,
    val leftPlayerName: String?,
    val rightPlayerName: String?,
    val leftPlayerReady: Boolean,
    val rightPlayerReady: Boolean,
    val winner: String?,
    val walkover: Boolean = false
)

