package esillen.multiplayer_voice_game.model

enum class GameStatus {
    WAITING,      // Waiting for players to join
    READY_CHECK,  // Both players joined, waiting for ready
    PLAYING,      // Game in progress
    PAUSED,       // Player disconnected
    FINISHED      // Game over
}

data class Ball(
    var x: Double = 400.0,      // Center of 800px width
    var y: Double = 250.0,      // Center of 500px height
    var velocityX: Double = 5.0,
    var velocityY: Double = 2.0
)

data class GameState(
    var status: GameStatus = GameStatus.WAITING,
    var leftScore: Int = 0,
    var rightScore: Int = 0,
    var ball: Ball = Ball(),
    var leftPaddleY: Double = 250.0,
    var rightPaddleY: Double = 250.0,
    var winner: String? = null,
    var walkover: Boolean = false
) {
    companion object {
        const val CANVAS_WIDTH = 800.0
        const val CANVAS_HEIGHT = 500.0
        const val PADDLE_HEIGHT = 80.0
        const val PADDLE_WIDTH = 15.0
        const val PADDLE_MARGIN = 20.0
        const val BALL_SIZE = 15.0
        const val PADDLE_SPEED = 6.0
        const val WINNING_SCORE = 11
    }
}

