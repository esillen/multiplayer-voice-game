package esillen.multiplayer_voice_game.model

import org.springframework.web.socket.WebSocketSession

enum class PaddleSide {
    LEFT, RIGHT
}

enum class PitchState {
    HIGH, MEDIUM, LOW, OFF
}

data class Player(
    val id: String,
    val name: String,
    val side: PaddleSide,
    var session: WebSocketSession? = null,
    var isReady: Boolean = false,
    var pitchState: PitchState = PitchState.OFF,
    var paddleY: Double = 250.0 // Center of 500px height canvas
)

