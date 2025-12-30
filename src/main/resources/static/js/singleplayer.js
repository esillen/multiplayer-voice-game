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
    const playerScoreEl = document.getElementById('playerScore');
    const aiScoreEl = document.getElementById('aiScore');
    const gameStatusEl = document.getElementById('gameStatus');
    const startBtn = document.getElementById('startGame');
    const pauseBtn = document.getElementById('pauseBtn');
    const difficultyBtns = document.querySelectorAll('.diff-btn');
    
    // Pitch meter elements
    const pitchMeterBar = document.getElementById('pitchMeterBar');
    const pitchMarker = document.getElementById('pitchMarker');
    const highThresholdEl = document.getElementById('highThreshold');
    const lowThresholdEl = document.getElementById('lowThreshold');
    const lowZoneFill = document.getElementById('lowZoneFill');
    const highZoneFill = document.getElementById('highZoneFill');
    const currentFrequencyEl = document.getElementById('currentFrequency');
    const currentPitchLabel = document.getElementById('currentPitchLabel');
    
    // Constants
    const MIN_FREQ = 60;
    const MAX_FREQ = 500;
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
        status: 'WAITING',
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
    let animationFrameId = null;
    
    // Load calibration for threshold display
    let calibrationData = loadCalibration();
    updateThresholdPositions();
    
    // Check calibration
    if (!PitchDetector.isCalibrated()) {
        const hint = document.createElement('div');
        hint.className = 'calibrate-prompt';
        hint.innerHTML = `
            <span>Voice not calibrated</span>
            <a href="/calibrate">Calibrate now</a>
            <button class="dismiss-btn">X</button>
        `;
        document.body.appendChild(hint);
        hint.querySelector('.dismiss-btn').addEventListener('click', () => hint.remove());
    }
    
    // Auto-start microphone
    startMicrophone();
    
    async function startMicrophone() {
        pitchDetector = new PitchDetector({
            onPitchChange: (pitch) => {
                currentPitch = pitch;
                updatePitchDisplay(pitch);
            },
            onVolumeChange: (volume) => {
                // Volume indicator
            },
            onFrequencyDetected: (frequency, probability) => {
                updateFrequencyDisplay(frequency, probability);
            }
        });
        
        const success = await pitchDetector.start();
        if (!success) {
            alert('Failed to access microphone. Please allow microphone access and reload.');
        }
    }
    
    function updatePitchDisplay(pitch) {
        currentPitchLabel.textContent = pitch;
        currentPitchLabel.className = 'pitch-state ' + pitch.toLowerCase();
    }
    
    function updateFrequencyDisplay(frequency, probability) {
        if (frequency > 0) {
            const confidenceStr = probability ? ` (${Math.round(probability * 100)}%)` : '';
            currentFrequencyEl.textContent = `${Math.round(frequency)} Hz${confidenceStr}`;
            
            const position = freqToPercent(frequency);
            pitchMarker.style.left = `${position}%`;
            pitchMarker.classList.add('active');
        } else {
            currentFrequencyEl.textContent = '-- Hz';
            pitchMarker.classList.remove('active');
        }
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
    startBtn.addEventListener('click', () => {
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
    
    // Escape key for pause
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (gameState.status === 'PLAYING') pauseGame();
            else if (gameState.status === 'PAUSED') resumeGame();
        } else if (e.key === ' ' && gameState.status === 'WAITING') {
            startGame();
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
        pauseBtn.querySelector('span').textContent = 'RESUME';
        gameStatusEl.textContent = 'PAUSED';
        showOverlay('PAUSED', 'Press ESC or click Resume to continue');
    }
    
    function resumeGame() {
        gameState.status = 'PLAYING';
        pauseBtn.querySelector('span').textContent = 'PAUSE';
        gameStatusEl.textContent = 'GAME ON!';
        hideOverlay();
    }
    
    function endGame(winner) {
        gameState.status = 'FINISHED';
        gameState.winner = winner;
        pauseBtn.style.display = 'none';
        
        const isPlayerWin = winner === 'player';
        const message = isPlayerWin ? 'YOU WIN!' : 'CPU WINS';
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
        // Voice only - no keyboard fallback
        let direction = 0;
        if (currentPitch === 'HIGH') direction = -1;
        else if (currentPitch === 'LOW') direction = 1;
        
        const newY = gameState.playerPaddleY + (direction * PADDLE_SPEED);
        gameState.playerPaddleY = Math.max(PADDLE_HEIGHT / 2, 
            Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT / 2, newY));
    }
    
    function updateAIPaddle() {
        const settings = AI_SETTINGS[gameState.difficulty];
        const ball = gameState.ball;
        
        let targetY = ball.y;
        
        if (ball.velocityX > 0) {
            const timeToReach = (CANVAS_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH - ball.x) / ball.velocityX;
            targetY = ball.y + (ball.velocityY * timeToReach);
            
            targetY += (Math.random() - 0.5) * settings.predictionError * CANVAS_HEIGHT;
            
            while (targetY < 0 || targetY > CANVAS_HEIGHT) {
                if (targetY < 0) targetY = -targetY;
                if (targetY > CANVAS_HEIGHT) targetY = 2 * CANVAS_HEIGHT - targetY;
            }
        }
        
        targetY += (Math.random() - 0.5) * settings.errorMargin;
        
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
        
        if (ball.y - BALL_SIZE / 2 <= 0 || ball.y + BALL_SIZE / 2 >= CANVAS_HEIGHT) {
            ball.velocityY = -ball.velocityY;
            ball.y = Math.max(BALL_SIZE / 2, Math.min(CANVAS_HEIGHT - BALL_SIZE / 2, ball.y));
        }
        
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
        
        const maxSpeed = 15;
        ball.velocityX = Math.sign(ball.velocityX) * Math.min(Math.abs(ball.velocityX), maxSpeed);
        ball.velocityY = Math.sign(ball.velocityY) * Math.min(Math.abs(ball.velocityY), maxSpeed);
    }
    
    function checkScoring() {
        const ball = gameState.ball;
        
        if (ball.x < 0) {
            gameState.aiScore++;
            aiScoreEl.textContent = gameState.aiScore;
            
            if (gameState.aiScore >= WINNING_SCORE) {
                endGame('ai');
            } else {
                resetBall(true);
            }
        }
        
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
                        <span>PLAY AGAIN</span>
                    </button>
                    <a href="/join" class="btn btn-secondary">
                        <span>MULTIPLAYER</span>
                    </a>
                </div>
            ` : ''}
        `;
        gameOverlay.classList.remove('hidden');
    }
    
    function hideOverlay() {
        gameOverlay.classList.add('hidden');
    }
    
    // ============================================
    // PITCH THRESHOLD BAR
    // ============================================
    
    function freqToPercent(freq) {
        return Math.min(100, Math.max(0, ((freq - MIN_FREQ) / (MAX_FREQ - MIN_FREQ)) * 100));
    }
    
    function percentToFreq(percent) {
        return MIN_FREQ + (percent / 100) * (MAX_FREQ - MIN_FREQ);
    }
    
    function loadCalibration() {
        const defaults = { lowThreshold: 180, highThreshold: 280 };
        try {
            const saved = localStorage.getItem('voiceCalibration');
            if (saved) {
                const data = JSON.parse(saved);
                return {
                    lowThreshold: data.lowThreshold || defaults.lowThreshold,
                    highThreshold: data.highThreshold || defaults.highThreshold
                };
            }
        } catch (e) {
            console.error('Failed to load calibration:', e);
        }
        return defaults;
    }
    
    function saveCalibration() {
        localStorage.setItem('voiceCalibration', JSON.stringify({
            lowThreshold: calibrationData.lowThreshold,
            highThreshold: calibrationData.highThreshold,
            calibratedAt: new Date().toISOString()
        }));
        
        if (pitchDetector) {
            pitchDetector.setThresholds(calibrationData.lowThreshold, calibrationData.highThreshold);
        }
    }
    
    function updateThresholdPositions() {
        const lowPos = freqToPercent(calibrationData.lowThreshold);
        const highPos = freqToPercent(calibrationData.highThreshold);
        
        lowThresholdEl.style.left = `${lowPos}%`;
        highThresholdEl.style.left = `${highPos}%`;
        
        lowZoneFill.style.width = `${lowPos}%`;
        highZoneFill.style.left = `${highPos}%`;
        highZoneFill.style.width = `${100 - highPos}%`;
    }
    
    // Drag and drop for threshold markers
    let draggedMarker = null;
    let dragType = null;
    
    function handleDragStart(e, type) {
        draggedMarker = e.target.closest('.threshold-marker');
        dragType = type;
        draggedMarker.classList.add('dragging');
        if (e.type === 'touchstart') e.preventDefault();
    }
    
    function handleDrag(e) {
        if (!draggedMarker) return;
        e.preventDefault();
        
        const rect = pitchMeterBar.getBoundingClientRect();
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        let percent = ((clientX - rect.left) / rect.width) * 100;
        percent = Math.min(100, Math.max(0, percent));
        
        const freq = percentToFreq(percent);
        
        if (dragType === 'low') {
            if (freq < calibrationData.highThreshold - 20) {
                calibrationData.lowThreshold = Math.round(freq);
            }
        } else {
            if (freq > calibrationData.lowThreshold + 20) {
                calibrationData.highThreshold = Math.round(freq);
            }
        }
        
        updateThresholdPositions();
    }
    
    function handleDragEnd() {
        if (draggedMarker) {
            draggedMarker.classList.remove('dragging');
            saveCalibration();
        }
        draggedMarker = null;
        dragType = null;
    }
    
    // Mouse events
    lowThresholdEl.addEventListener('mousedown', (e) => handleDragStart(e, 'low'));
    highThresholdEl.addEventListener('mousedown', (e) => handleDragStart(e, 'high'));
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', handleDragEnd);
    
    // Touch events
    lowThresholdEl.addEventListener('touchstart', (e) => handleDragStart(e, 'low'));
    highThresholdEl.addEventListener('touchstart', (e) => handleDragStart(e, 'high'));
    document.addEventListener('touchmove', handleDrag, { passive: false });
    document.addEventListener('touchend', handleDragEnd);
    
    // Initial render
    render();
});
