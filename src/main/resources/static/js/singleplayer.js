/**
 * Single Player Mode
 * Complete game running client-side with AI opponent
 */
document.addEventListener('DOMContentLoaded', () => {
    // Canvas and renderer
    const canvas = document.getElementById('gameCanvas');
    const renderer = new GameRenderer(canvas);
    
    // UI elements
    const gameOverlay = document.getElementById('gameOverlay');
    const overlayContent = document.getElementById('overlayContent');
    const micStatus = document.getElementById('micStatus');
    const micText = micStatus.querySelector('.mic-text');
    const pitchLevel = document.getElementById('pitchLevel');
    const pitchLabel = document.getElementById('pitchLabel');
    const playerScoreEl = document.getElementById('playerScore');
    const aiScoreEl = document.getElementById('aiScore');
    const gameStatusEl = document.getElementById('gameStatus');
    const startBtn = document.getElementById('startGame');
    const pauseBtn = document.getElementById('pauseBtn');
    const difficultyBtns = document.querySelectorAll('.diff-btn');
    
    // Game constants
    const CANVAS_WIDTH = 800;
    const CANVAS_HEIGHT = 500;
    const PADDLE_HEIGHT = 80;
    const PADDLE_WIDTH = 15;
    const PADDLE_MARGIN = 20;
    const BALL_SIZE = 15;
    const PADDLE_SPEED = 6;
    const WINNING_SCORE = 11;
    
    // AI difficulty settings
    const AI_SETTINGS = {
        easy: { reactionSpeed: 3, errorMargin: 40, predictionError: 0.3 },
        medium: { reactionSpeed: 4.5, errorMargin: 20, predictionError: 0.15 },
        hard: { reactionSpeed: 5.5, errorMargin: 5, predictionError: 0.05 }
    };
    
    // Game state
    let gameState = {
        status: 'WAITING', // WAITING, PLAYING, PAUSED, FINISHED
        playerScore: 0,
        aiScore: 0,
        playerPaddleY: CANVAS_HEIGHT / 2,
        aiPaddleY: CANVAS_HEIGHT / 2,
        ball: {
            x: CANVAS_WIDTH / 2,
            y: CANVAS_HEIGHT / 2,
            velocityX: 5,
            velocityY: 2
        },
        difficulty: 'easy',
        winner: null
    };
    
    // Input state
    let currentPitch = 'OFF';
    let pitchDetector = null;
    let keyboardInput = 'OFF';
    let animationFrameId = null;
    
    // Check calibration
    if (!PitchDetector.isCalibrated()) {
        const hint = document.createElement('div');
        hint.className = 'calibrate-prompt';
        hint.innerHTML = `
            <span>⚠️ Voice not calibrated</span>
            <a href="/calibrate">Calibrate now</a>
            <button class="dismiss-btn">✕</button>
        `;
        document.body.appendChild(hint);
        hint.querySelector('.dismiss-btn').addEventListener('click', () => hint.remove());
    }
    
    // Difficulty selection
    difficultyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            difficultyBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gameState.difficulty = btn.dataset.difficulty;
        });
    });
    
    // Start button
    startBtn.addEventListener('click', async () => {
        // Try to start mic if not already running
        if (!pitchDetector || !pitchDetector.isRunning) {
            await startMicrophone();
        }
        startGame();
    });
    
    // Pause button
    pauseBtn.addEventListener('click', () => {
        if (gameState.status === 'PLAYING') {
            pauseGame();
        } else if (gameState.status === 'PAUSED') {
            resumeGame();
        }
    });
    
    // Microphone control
    micStatus.addEventListener('click', async () => {
        if (pitchDetector && pitchDetector.isRunning) {
            pitchDetector.stop();
            micStatus.classList.remove('active');
            micText.textContent = 'Click to enable microphone';
            pitchLabel.textContent = 'OFF';
            pitchLabel.className = 'pitch-label';
            pitchLevel.style.height = '0%';
            currentPitch = 'OFF';
        } else {
            await startMicrophone();
        }
    });
    
    async function startMicrophone() {
        pitchDetector = new PitchDetector({
            onPitchChange: (pitch) => {
                currentPitch = pitch;
                pitchLabel.textContent = pitch;
                pitchLabel.className = 'pitch-label ' + pitch.toLowerCase();
            },
            onVolumeChange: (volume) => {
                pitchLevel.style.height = (volume * 100) + '%';
            }
        });
        
        const success = await pitchDetector.start();
        if (success) {
            micStatus.classList.add('active');
            micText.textContent = 'Microphone active';
        } else {
            alert('Failed to access microphone. You can still use keyboard controls.');
        }
    }
    
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
            keyboardInput = 'HIGH';
        } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
            keyboardInput = 'LOW';
        } else if (e.key === 'Escape') {
            if (gameState.status === 'PLAYING') pauseGame();
            else if (gameState.status === 'PAUSED') resumeGame();
        } else if (e.key === ' ' && gameState.status === 'WAITING') {
            startGame();
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp' ||
            e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
            keyboardInput = 'OFF';
        }
    });
    
    // Game functions
    function startGame() {
        gameState.status = 'PLAYING';
        gameState.playerScore = 0;
        gameState.aiScore = 0;
        gameState.playerPaddleY = CANVAS_HEIGHT / 2;
        gameState.aiPaddleY = CANVAS_HEIGHT / 2;
        gameState.winner = null;
        
        resetBall(Math.random() > 0.5);
        
        hideOverlay();
        pauseBtn.style.display = 'inline-flex';
        gameStatusEl.textContent = 'GAME ON!';
        
        if (!animationFrameId) {
            gameLoop();
        }
    }
    
    function pauseGame() {
        gameState.status = 'PAUSED';
        pauseBtn.querySelector('span').textContent = '▶️ RESUME';
        gameStatusEl.textContent = 'PAUSED';
        showOverlay('PAUSED', 'Press ESC or click Resume to continue');
    }
    
    function resumeGame() {
        gameState.status = 'PLAYING';
        pauseBtn.querySelector('span').textContent = '⏸️ PAUSE';
        gameStatusEl.textContent = 'GAME ON!';
        hideOverlay();
    }
    
    function endGame(winner) {
        gameState.status = 'FINISHED';
        gameState.winner = winner;
        pauseBtn.style.display = 'none';
        
        const isPlayerWin = winner === 'player';
        const message = isPlayerWin ? '🎉 YOU WIN!' : '🤖 CPU WINS';
        const submessage = isPlayerWin 
            ? 'Congratulations! You beat the AI!' 
            : 'Better luck next time!';
        
        gameStatusEl.textContent = message;
        showOverlay(message, submessage, true);
    }
    
    function resetBall(towardsPlayer) {
        gameState.ball.x = CANVAS_WIDTH / 2;
        gameState.ball.y = CANVAS_HEIGHT / 2;
        const speed = 5;
        gameState.ball.velocityX = towardsPlayer ? -speed : speed;
        gameState.ball.velocityY = (Math.random() - 0.5) * 4;
    }
    
    // Game loop
    function gameLoop() {
        if (gameState.status === 'PLAYING') {
            update();
        }
        render();
        animationFrameId = requestAnimationFrame(gameLoop);
    }
    
    function update() {
        updatePlayerPaddle();
        updateAIPaddle();
        updateBall();
        checkCollisions();
        checkScoring();
    }
    
    function updatePlayerPaddle() {
        // Combine voice and keyboard input (voice takes priority if active)
        const input = (pitchDetector && pitchDetector.isRunning && currentPitch !== 'OFF') 
            ? currentPitch 
            : keyboardInput;
        
        let direction = 0;
        if (input === 'HIGH') direction = -1;
        else if (input === 'LOW') direction = 1;
        
        const newY = gameState.playerPaddleY + (direction * PADDLE_SPEED);
        gameState.playerPaddleY = Math.max(PADDLE_HEIGHT / 2, 
            Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT / 2, newY));
    }
    
    function updateAIPaddle() {
        const settings = AI_SETTINGS[gameState.difficulty];
        const ball = gameState.ball;
        
        // Predict where ball will be when it reaches AI paddle
        let targetY = ball.y;
        
        if (ball.velocityX > 0) { // Ball moving towards AI
            const timeToReach = (CANVAS_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH - ball.x) / ball.velocityX;
            targetY = ball.y + (ball.velocityY * timeToReach);
            
            // Add prediction error
            targetY += (Math.random() - 0.5) * settings.predictionError * CANVAS_HEIGHT;
            
            // Bounce prediction
            while (targetY < 0 || targetY > CANVAS_HEIGHT) {
                if (targetY < 0) targetY = -targetY;
                if (targetY > CANVAS_HEIGHT) targetY = 2 * CANVAS_HEIGHT - targetY;
            }
        }
        
        // Add some randomness (error margin)
        targetY += (Math.random() - 0.5) * settings.errorMargin;
        
        // Move towards target
        const diff = targetY - gameState.aiPaddleY;
        const moveAmount = Math.sign(diff) * Math.min(Math.abs(diff), settings.reactionSpeed);
        
        const newY = gameState.aiPaddleY + moveAmount;
        gameState.aiPaddleY = Math.max(PADDLE_HEIGHT / 2, 
            Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT / 2, newY));
    }
    
    function updateBall() {
        gameState.ball.x += gameState.ball.velocityX;
        gameState.ball.y += gameState.ball.velocityY;
    }
    
    function checkCollisions() {
        const ball = gameState.ball;
        
        // Top/bottom walls
        if (ball.y - BALL_SIZE / 2 <= 0 || ball.y + BALL_SIZE / 2 >= CANVAS_HEIGHT) {
            ball.velocityY = -ball.velocityY;
            ball.y = Math.max(BALL_SIZE / 2, Math.min(CANVAS_HEIGHT - BALL_SIZE / 2, ball.y));
        }
        
        // Player paddle (left)
        const playerPaddleX = PADDLE_MARGIN;
        if (ball.x - BALL_SIZE / 2 <= playerPaddleX + PADDLE_WIDTH &&
            ball.x + BALL_SIZE / 2 >= playerPaddleX &&
            ball.velocityX < 0) {
            const paddleTop = gameState.playerPaddleY - PADDLE_HEIGHT / 2;
            const paddleBottom = gameState.playerPaddleY + PADDLE_HEIGHT / 2;
            
            if (ball.y >= paddleTop && ball.y <= paddleBottom) {
                ball.velocityX = -ball.velocityX * 1.05;
                const hitPos = (ball.y - gameState.playerPaddleY) / (PADDLE_HEIGHT / 2);
                ball.velocityY = hitPos * 5;
                ball.x = playerPaddleX + PADDLE_WIDTH + BALL_SIZE / 2;
            }
        }
        
        // AI paddle (right)
        const aiPaddleX = CANVAS_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH;
        if (ball.x + BALL_SIZE / 2 >= aiPaddleX &&
            ball.x - BALL_SIZE / 2 <= aiPaddleX + PADDLE_WIDTH &&
            ball.velocityX > 0) {
            const paddleTop = gameState.aiPaddleY - PADDLE_HEIGHT / 2;
            const paddleBottom = gameState.aiPaddleY + PADDLE_HEIGHT / 2;
            
            if (ball.y >= paddleTop && ball.y <= paddleBottom) {
                ball.velocityX = -ball.velocityX * 1.05;
                const hitPos = (ball.y - gameState.aiPaddleY) / (PADDLE_HEIGHT / 2);
                ball.velocityY = hitPos * 5;
                ball.x = aiPaddleX - BALL_SIZE / 2;
            }
        }
        
        // Cap ball speed
        const maxSpeed = 15;
        ball.velocityX = Math.sign(ball.velocityX) * Math.min(Math.abs(ball.velocityX), maxSpeed);
        ball.velocityY = Math.sign(ball.velocityY) * Math.min(Math.abs(ball.velocityY), maxSpeed);
    }
    
    function checkScoring() {
        const ball = gameState.ball;
        
        // Ball past player paddle
        if (ball.x < 0) {
            gameState.aiScore++;
            aiScoreEl.textContent = gameState.aiScore;
            
            if (gameState.aiScore >= WINNING_SCORE) {
                endGame('ai');
            } else {
                resetBall(true);
            }
        }
        
        // Ball past AI paddle
        if (ball.x > CANVAS_WIDTH) {
            gameState.playerScore++;
            playerScoreEl.textContent = gameState.playerScore;
            
            if (gameState.playerScore >= WINNING_SCORE) {
                endGame('player');
            } else {
                resetBall(false);
            }
        }
    }
    
    function render() {
        // Convert game state to renderer format
        const state = {
            status: gameState.status,
            leftScore: gameState.playerScore,
            rightScore: gameState.aiScore,
            ballX: gameState.ball.x,
            ballY: gameState.ball.y,
            leftPaddleY: gameState.playerPaddleY,
            rightPaddleY: gameState.aiPaddleY
        };
        
        renderer.render(state);
    }
    
    // Overlay functions
    function showOverlay(title, message, isGameOver = false) {
        overlayContent.innerHTML = `
            <h2 ${isGameOver ? 'class="winner-text"' : ''}>${title}</h2>
            <p>${message}</p>
            ${isGameOver ? `
                <div class="game-over-buttons">
                    <button class="btn btn-primary" onclick="location.reload()">
                        <span>🔄 PLAY AGAIN</span>
                    </button>
                    <a href="/join" class="btn btn-secondary">
                        <span>👥 MULTIPLAYER</span>
                    </a>
                </div>
            ` : ''}
        `;
        gameOverlay.classList.remove('hidden');
    }
    
    function hideOverlay() {
        gameOverlay.classList.add('hidden');
    }
    
    // Initial render
    render();
});

