package esillen.multiplayer_voice_game.model

import esillen.multiplayer_voice_game.model.GameState.Companion.BALL_SIZE
import esillen.multiplayer_voice_game.model.GameState.Companion.CANVAS_HEIGHT
import esillen.multiplayer_voice_game.model.GameState.Companion.CANVAS_WIDTH
import esillen.multiplayer_voice_game.model.GameState.Companion.PADDLE_HEIGHT
import esillen.multiplayer_voice_game.model.GameState.Companion.PADDLE_MARGIN
import esillen.multiplayer_voice_game.model.GameState.Companion.PADDLE_SPEED
import esillen.multiplayer_voice_game.model.GameState.Companion.PADDLE_WIDTH
import esillen.multiplayer_voice_game.model.GameState.Companion.WINNING_SCORE
import org.springframework.web.socket.WebSocketSession
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.abs
import kotlin.math.sign

/**
 * Represents a single game court with its own state, players, and spectators
 */
class Court(val id: Int) {
    val gameState = GameState()
    val players = ConcurrentHashMap<String, Player>()
    val spectators = ConcurrentHashMap<String, WebSocketSession>()
    
    // Visual variation seed for this court (used by frontend)
    val visualSeed = id * 12345L + 42
    
    // Store final game state for spectators after reset
    private var finalStateForSpectators: GameStateDto? = null
    
    // Track if game end has been handled (to prevent duplicate handling)
    var gameEndHandled: Boolean = false

    fun joinGame(name: String, side: PaddleSide, session: WebSocketSession): Result<Player> {
        // Don't allow joining if game is finished (waiting for reset)
        if (gameState.status == GameStatus.FINISHED) {
            return Result.failure(Exception("Game has ended. Please wait for the next game to start."))
        }
        
        val existingPlayer = players.values.find { it.side == side }
        if (existingPlayer != null) {
            return Result.failure(Exception("${side.name} paddle is already taken by ${existingPlayer.name}"))
        }

        // If court was reset and new players are joining, clear final state for spectators
        if (players.isEmpty()) {
            finalStateForSpectators = null
        }

        val player = Player(
            id = UUID.randomUUID().toString(),
            name = name,
            side = side,
            session = session,
            paddleY = CANVAS_HEIGHT / 2
        )
        players[player.id] = player

        if (players.size == 2 && gameState.status == GameStatus.WAITING) {
            gameState.status = GameStatus.READY_CHECK
        }

        return Result.success(player)
    }

    fun addSpectator(session: WebSocketSession): String {
        val id = UUID.randomUUID().toString()
        spectators[id] = session
        return id
    }

    fun removeSpectator(id: String) {
        spectators.remove(id)
    }

    fun playerReady(playerId: String): Player? {
        val player = players[playerId] ?: return null
        player.isReady = true

        if (players.size == 2 && players.values.all { it.isReady }) {
            startGame()
        }
        return player
    }

    fun updatePitch(playerId: String, pitch: PitchState) {
        val player = players[playerId] ?: return
        player.pitchState = pitch
    }

    fun playerDisconnected(session: WebSocketSession): Player? {
        val player = players.values.find { it.session == session }
        if (player != null) {
            // If player is marked as finished, just remove them (no walkover)
            if (player.gameFinished) {
                players.remove(player.id)
                return player
            }
            
            players.remove(player.id)
            
            // Only treat as walkover if game is still playing and player wasn't finished
            if (gameState.status == GameStatus.PLAYING) {
                val remainingPlayer = players.values.firstOrNull()
                if (remainingPlayer != null) {
                    gameState.status = GameStatus.FINISHED
                    gameState.winner = remainingPlayer.name
                    gameState.walkover = true
                } else {
                    gameState.status = GameStatus.WAITING
                }
            } else {
                gameState.status = GameStatus.WAITING
            }
            return player
        }

        spectators.entries.find { it.value == session }?.let {
            spectators.remove(it.key)
        }
        return null
    }

    fun getPlayer(playerId: String): Player? = players[playerId]

    fun getPlayerBySession(session: WebSocketSession): Player? =
        players.values.find { it.session == session }

    fun isSpectator(session: WebSocketSession): Boolean =
        spectators.values.any { it == session }

    fun getAllSessions(): List<WebSocketSession> {
        val sessions = mutableListOf<WebSocketSession>()
        players.values.mapNotNull { it.session }.forEach { sessions.add(it) }
        spectators.values.forEach { sessions.add(it) }
        return sessions
    }

    fun getCurrentStateDto(): GameStateDto {
        // If court is reset (WAITING) but we have spectators, show them the final state
        if (gameState.status == GameStatus.WAITING && finalStateForSpectators != null && spectators.isNotEmpty()) {
            return finalStateForSpectators!!
        }
        
        val leftPlayer = players.values.find { it.side == PaddleSide.LEFT }
        val rightPlayer = players.values.find { it.side == PaddleSide.RIGHT }

        return GameStateDto(
            status = gameState.status.name,
            leftScore = gameState.leftScore,
            rightScore = gameState.rightScore,
            ballX = gameState.ball.x,
            ballY = gameState.ball.y,
            ballVelocityX = gameState.ball.velocityX,
            ballVelocityY = gameState.ball.velocityY,
            leftPaddleY = gameState.leftPaddleY,
            rightPaddleY = gameState.rightPaddleY,
            leftPlayerName = leftPlayer?.name,
            rightPlayerName = rightPlayer?.name,
            leftPlayerReady = leftPlayer?.isReady ?: false,
            rightPlayerReady = rightPlayer?.isReady ?: false,
            winner = gameState.winner,
            walkover = gameState.walkover
        )
    }

    fun getCourtSummary(): CourtSummaryDto {
        val leftPlayer = players.values.find { it.side == PaddleSide.LEFT }
        val rightPlayer = players.values.find { it.side == PaddleSide.RIGHT }
        
        // If court is reset but has final state for spectators, show that score
        val displayScore = if (gameState.status == GameStatus.WAITING && finalStateForSpectators != null) {
            Pair(finalStateForSpectators!!.leftScore, finalStateForSpectators!!.rightScore)
        } else {
            Pair(gameState.leftScore, gameState.rightScore)
        }
        
        return CourtSummaryDto(
            courtId = id,
            status = gameState.status.name,
            leftPlayerName = leftPlayer?.name,
            rightPlayerName = rightPlayer?.name,
            leftPlayerReady = leftPlayer?.isReady ?: false,
            rightPlayerReady = rightPlayer?.isReady ?: false,
            spectatorCount = spectators.size,
            visualSeed = visualSeed,
            leftScore = displayScore.first,
            rightScore = displayScore.second
        )
    }

    private fun startGame() {
        gameState.status = GameStatus.PLAYING
        resetBall(towardsLeft = Math.random() > 0.5)
    }

    private fun resetBall(towardsLeft: Boolean) {
        gameState.ball.x = CANVAS_WIDTH / 2
        gameState.ball.y = CANVAS_HEIGHT / 2
        val speed = 5.0
        gameState.ball.velocityX = if (towardsLeft) -speed else speed
        gameState.ball.velocityY = (Math.random() - 0.5) * 4
    }

    fun gameLoop() {
        if (gameState.status != GameStatus.PLAYING) {
            return
        }

        updatePaddles()
        updateBall()
        checkCollisions()
        checkScoring()
    }

    private fun updatePaddles() {
        players.values.forEach { player ->
            val direction = when (player.pitchState) {
                PitchState.HIGH -> -1.0
                PitchState.LOW -> 1.0
                else -> 0.0
            }

            val newY = player.paddleY + (direction * PADDLE_SPEED)
            player.paddleY = newY.coerceIn(PADDLE_HEIGHT / 2, CANVAS_HEIGHT - PADDLE_HEIGHT / 2)

            when (player.side) {
                PaddleSide.LEFT -> gameState.leftPaddleY = player.paddleY
                PaddleSide.RIGHT -> gameState.rightPaddleY = player.paddleY
            }
        }
    }

    private fun updateBall() {
        gameState.ball.x += gameState.ball.velocityX
        gameState.ball.y += gameState.ball.velocityY
    }

    private fun checkCollisions() {
        val ball = gameState.ball

        if (ball.y - BALL_SIZE / 2 <= 0 || ball.y + BALL_SIZE / 2 >= CANVAS_HEIGHT) {
            ball.velocityY = -ball.velocityY
            ball.y = ball.y.coerceIn(BALL_SIZE / 2, CANVAS_HEIGHT - BALL_SIZE / 2)
        }

        val leftPaddleX = PADDLE_MARGIN
        if (ball.x - BALL_SIZE / 2 <= leftPaddleX + PADDLE_WIDTH &&
            ball.x + BALL_SIZE / 2 >= leftPaddleX &&
            ball.velocityX < 0
        ) {
            val paddleTop = gameState.leftPaddleY - PADDLE_HEIGHT / 2
            val paddleBottom = gameState.leftPaddleY + PADDLE_HEIGHT / 2
            if (ball.y >= paddleTop && ball.y <= paddleBottom) {
                ball.velocityX = -ball.velocityX * 1.05
                val hitPos = (ball.y - gameState.leftPaddleY) / (PADDLE_HEIGHT / 2)
                ball.velocityY = hitPos * 5
                ball.x = leftPaddleX + PADDLE_WIDTH + BALL_SIZE / 2
            }
        }

        val rightPaddleX = CANVAS_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH
        if (ball.x + BALL_SIZE / 2 >= rightPaddleX &&
            ball.x - BALL_SIZE / 2 <= rightPaddleX + PADDLE_WIDTH &&
            ball.velocityX > 0
        ) {
            val paddleTop = gameState.rightPaddleY - PADDLE_HEIGHT / 2
            val paddleBottom = gameState.rightPaddleY + PADDLE_HEIGHT / 2
            if (ball.y >= paddleTop && ball.y <= paddleBottom) {
                ball.velocityX = -ball.velocityX * 1.05
                val hitPos = (ball.y - gameState.rightPaddleY) / (PADDLE_HEIGHT / 2)
                ball.velocityY = hitPos * 5
                ball.x = rightPaddleX - BALL_SIZE / 2
            }
        }

        val maxSpeed = 15.0
        if (abs(ball.velocityX) > maxSpeed) {
            ball.velocityX = maxSpeed * ball.velocityX.sign
        }
        if (abs(ball.velocityY) > maxSpeed) {
            ball.velocityY = maxSpeed * ball.velocityY.sign
        }
    }

    private fun checkScoring(): Boolean {
        val ball = gameState.ball
        var scored = false

        if (ball.x < 0) {
            gameState.rightScore++
            scored = true
            if (!checkWinner()) {
                resetBall(towardsLeft = true)
            }
        }

        if (ball.x > CANVAS_WIDTH) {
            gameState.leftScore++
            scored = true
            if (!checkWinner()) {
                resetBall(towardsLeft = false)
            }
        }
        
        return scored
    }

    private fun checkWinner(): Boolean {
        val leftPlayer = players.values.find { it.side == PaddleSide.LEFT }
        val rightPlayer = players.values.find { it.side == PaddleSide.RIGHT }

        when {
            gameState.leftScore >= WINNING_SCORE -> {
                gameState.status = GameStatus.FINISHED
                gameState.winner = leftPlayer?.name ?: "Left Player"
                return true
            }
            gameState.rightScore >= WINNING_SCORE -> {
                gameState.status = GameStatus.FINISHED
                gameState.winner = rightPlayer?.name ?: "Right Player"
                return true
            }
        }
        return false
    }

    fun markPlayersAsFinished(): Pair<List<WebSocketSession>, GameEndResult> {
        // Mark all players as finished
        players.values.forEach { it.gameFinished = true }
        
        // Get final score info
        val leftPlayer = players.values.find { it.side == PaddleSide.LEFT }
        val rightPlayer = players.values.find { it.side == PaddleSide.RIGHT }
        
        val result = GameEndResult(
            winner = gameState.winner ?: "",
            leftScore = gameState.leftScore,
            rightScore = gameState.rightScore,
            leftPlayerName = leftPlayer?.name,
            rightPlayerName = rightPlayer?.name,
            walkover = gameState.walkover
        )
        
        // Return sessions but don't clear players yet (they'll disconnect themselves)
        return Pair(players.values.mapNotNull { it.session }.toList(), result)
    }
    
    fun disconnectAllPlayers(): List<WebSocketSession> {
        val playerSessions = players.values.mapNotNull { it.session }.toList()
        players.clear()
        return playerSessions
    }

    fun resetGameAfterWin() {
        // Save final state for spectators before resetting
        if (spectators.isNotEmpty()) {
            val leftPlayer = players.values.find { it.side == PaddleSide.LEFT }
            val rightPlayer = players.values.find { it.side == PaddleSide.RIGHT }
            finalStateForSpectators = GameStateDto(
                status = gameState.status.name,
                leftScore = gameState.leftScore,
                rightScore = gameState.rightScore,
                ballX = gameState.ball.x,
                ballY = gameState.ball.y,
                ballVelocityX = gameState.ball.velocityX,
                ballVelocityY = gameState.ball.velocityY,
                leftPaddleY = gameState.leftPaddleY,
                rightPaddleY = gameState.rightPaddleY,
                leftPlayerName = leftPlayer?.name,
                rightPlayerName = rightPlayer?.name,
                leftPlayerReady = leftPlayer?.isReady ?: false,
                rightPlayerReady = rightPlayer?.isReady ?: false,
                winner = gameState.winner,
                walkover = gameState.walkover
            )
        }
        
        // Reset the court
        resetGame()
    }

    fun resetGame() {
        gameState.status = GameStatus.WAITING
        gameState.leftScore = 0
        gameState.rightScore = 0
        gameState.winner = null
        gameState.walkover = false
        gameState.leftPaddleY = CANVAS_HEIGHT / 2
        gameState.rightPaddleY = CANVAS_HEIGHT / 2
        resetBall(towardsLeft = Math.random() > 0.5)
        gameEndHandled = false

        players.values.forEach {
            it.isReady = false
            it.paddleY = CANVAS_HEIGHT / 2
        }
    }
}

// DTO for court summary (lobby view)
data class CourtSummaryDto(
    val courtId: Int,
    val status: String,
    val leftPlayerName: String?,
    val rightPlayerName: String?,
    val leftPlayerReady: Boolean,
    val rightPlayerReady: Boolean,
    val spectatorCount: Int,
    val visualSeed: Long,
    val leftScore: Int = 0,
    val rightScore: Int = 0
)

data class GameEndResult(
    val winner: String,
    val leftScore: Int,
    val rightScore: Int,
    val leftPlayerName: String?,
    val rightPlayerName: String?,
    val walkover: Boolean
)

