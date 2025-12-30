/**
 * Space Invaders Game
 * Vertical clone controlled by voice pitch
 */
document.addEventListener('DOMContentLoaded', () => {
    // Check if voice is calibrated
    if (!PitchDetector.isCalibrated()) {
        const calibratePrompt = document.createElement('div');
        calibratePrompt.className = 'calibrate-prompt';
        calibratePrompt.innerHTML = `
            <span>Voice not calibrated</span>
            <a href="/calibrate">Calibrate now</a>
            <button class="dismiss-btn">X</button>
        `;
        document.body.appendChild(calibratePrompt);
        
        calibratePrompt.querySelector('.dismiss-btn').addEventListener('click', () => {
            calibratePrompt.remove();
        });
    }
    
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const overlay = document.getElementById('gameOverlay');
    const overlayContent = document.getElementById('overlayContent');
    const startBtn = document.getElementById('startBtn');
    const scoreEl = document.getElementById('score');
    const waveEl = document.getElementById('wave');
    const livesEl = document.getElementById('lives');
    
    // Pitch meter elements
    const pitchMeterBar = document.getElementById('pitchMeterBar');
    const pitchMarker = document.getElementById('pitchMarker');
    const highThresholdEl = document.getElementById('highThreshold');
    const lowThresholdEl = document.getElementById('lowThreshold');
    const lowZoneFill = document.getElementById('lowZoneFill');
    const highZoneFill = document.getElementById('highZoneFill');
    const currentFrequencyEl = document.getElementById('currentFrequency');
    const currentPitchLabel = document.getElementById('currentPitchLabel');
    
    // Constants (rotated 90 degrees - enemies from right)
    const MIN_FREQ = 60;
    const MAX_FREQ = 500;
    const CANVAS_WIDTH = 600;  // Swapped
    const CANVAS_HEIGHT = 800; // Swapped
    const PLAYER_SPEED = 4;  // Match paddle speed from singleplayer
    const BULLET_SPEED = 8;
    const ENEMY_BULLET_SPEED = 4;  // Slower than player bullets
    const ENEMY_SPEED = 1;
    const ENEMY_ROWS = 10;  // Swapped (was cols)
    const ENEMY_COLS = 5;   // Swapped (was rows)
    const ENEMY_WIDTH = 30;  // Swapped
    const ENEMY_HEIGHT = 40; // Swapped
    const PLAYER_WIDTH = 30;  // Swapped
    const PLAYER_HEIGHT = 50; // Swapped
    const BULLET_WIDTH = 10;  // Swapped
    const BULLET_HEIGHT = 4;  // Swapped
    
    // Game state
    let gameState = 'MENU'; // MENU, PLAYING, PAUSED, GAME_OVER
    let score = 0;
    let wave = 1;
    let lives = 3;
    let playerX = 50;  // On the left side
    let playerY = CANVAS_HEIGHT / 2;  // Center vertically
    let bullets = [];  // Player bullets
    let enemyBullets = [];  // Enemy bullets
    let enemies = [];
    let enemyDirection = 1; // 1 = down, -1 = up (vertical movement)
    let lastShotTime = 0;
    let shotCooldown = 300; // ms between shots
    let lastEnemyShotTime = 0;
    const ENEMY_SHOOT_INTERVAL = 500; // Minimum ms between enemy shots
    const ENEMY_SHOOT_PROBABILITY = 0.002; // Probability per frame when interval passed (very low)
    
    let pitchDetector = null;
    let currentPitch = 'OFF';
    
    // Load calibration
    let calibrationData = loadCalibration();
    updateThresholdPositions();
    
    // Initialize pitch detector
    startMicrophone();
    
    async function startMicrophone() {
        pitchDetector = new PitchDetector({
            onPitchChange: (pitch) => {
                currentPitch = pitch;
                handlePitchInput(pitch);
                updatePitchDisplay(pitch);
            },
            onFrequencyDetected: (frequency, probability) => {
                updateFrequencyDisplay(frequency, probability);
            }
        });
        
        const success = await pitchDetector.start();
        if (!success) {
            showOverlay('Microphone Required', 'Please allow microphone access and reload the page.');
        }
    }
    
    function handlePitchInput(pitch) {
        if (gameState !== 'PLAYING') return;
        
        // Only handle shooting on pitch change (to avoid continuous shooting)
        if (pitch === 'MEDIUM') {
            shoot();
        }
    }
    
    function updatePlayer() {
        if (gameState !== 'PLAYING') return;
        
        // Move player continuously based on current pitch (like paddle in singleplayer)
        let direction = 0;
        if (currentPitch === 'HIGH') direction = -1;
        else if (currentPitch === 'LOW') direction = 1;
        
        const newY = playerY + (direction * PLAYER_SPEED);
        playerY = Math.max(PLAYER_HEIGHT / 2, 
            Math.min(CANVAS_HEIGHT - PLAYER_HEIGHT / 2, newY));
    }
    
    function shoot() {
        const now = Date.now();
        if (now - lastShotTime < shotCooldown) return;
        
        bullets.push({
            x: playerX + PLAYER_WIDTH / 2,  // Start from right side of player
            y: playerY,
            width: BULLET_WIDTH,
            height: BULLET_HEIGHT
        });
        lastShotTime = now;
    }
    
    function initEnemies() {
        enemies = [];
        enemyDirection = 1; // Reset to moving down
        const startX = CANVAS_WIDTH - 80;  // Start closer to right edge
        const startY = 50;
        const spacingX = 40;  // Vertical spacing (was horizontal)
        const spacingY = 60;  // Horizontal spacing (was vertical)
        
        for (let row = 0; row < ENEMY_ROWS; row++) {
            for (let col = 0; col < ENEMY_COLS; col++) {
                enemies.push({
                    x: startX - col * spacingY,  // Move left from right
                    y: startY + row * spacingX,   // Move down
                    width: ENEMY_WIDTH,
                    height: ENEMY_HEIGHT,
                    alive: true
                });
            }
        }
    }
    
    function updateGame() {
        if (gameState !== 'PLAYING') return;
        
        // Update player position continuously (like paddle movement)
        updatePlayer();
        
        // Move enemies vertically (up/down), step left when hitting edges
        let hitEdge = false;
        enemies.forEach(enemy => {
            if (!enemy.alive) return;
            
            // Move vertically
            enemy.y += ENEMY_SPEED * enemyDirection * (1 + wave * 0.1);
            
            // Check if any enemy hit top or bottom edge
            if (enemy.y <= ENEMY_HEIGHT / 2 || enemy.y >= CANVAS_HEIGHT - ENEMY_HEIGHT / 2) {
                hitEdge = true;
            }
        });
        
        // If hit edge, reverse direction and move all enemies left one step
        if (hitEdge) {
            enemyDirection *= -1;  // Reverse vertical direction
            enemies.forEach(enemy => {
                if (enemy.alive) {
                    enemy.x -= 30;  // Step left toward player
                    // Clamp Y position to stay in bounds
                    enemy.y = Math.max(ENEMY_HEIGHT / 2, Math.min(CANVAS_HEIGHT - ENEMY_HEIGHT / 2, enemy.y));
                }
            });
        }
        
        // Enemy shooting (random, not very often)
        const now = Date.now();
        if (now - lastEnemyShotTime > ENEMY_SHOOT_INTERVAL) {
            // Find alive enemies
            const aliveEnemies = enemies.filter(e => e.alive);
            if (aliveEnemies.length > 0 && Math.random() < ENEMY_SHOOT_PROBABILITY) {
                // Pick a random enemy to shoot
                const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
                enemyBullets.push({
                    x: shooter.x - ENEMY_WIDTH / 2,  // Start from left side of enemy
                    y: shooter.y,
                    width: BULLET_WIDTH,
                    height: BULLET_HEIGHT
                });
                lastEnemyShotTime = now;
            }
        }
        
        // Move player bullets (rightward)
        bullets = bullets.filter(bullet => {
            bullet.x += BULLET_SPEED;  // Move right
            return bullet.x < CANVAS_WIDTH + BULLET_WIDTH;
        });
        
        // Move enemy bullets (leftward toward player)
        enemyBullets = enemyBullets.filter(bullet => {
            bullet.x -= ENEMY_BULLET_SPEED;  // Move left (slower than player bullets)
            return bullet.x > -BULLET_WIDTH;
        });
        
        // Check bullet-enemy collisions
        bullets.forEach((bullet, bi) => {
            enemies.forEach((enemy, ei) => {
                if (!enemy.alive) return;
                
                if (bullet.x < enemy.x + enemy.width / 2 &&
                    bullet.x > enemy.x - enemy.width / 2 &&
                    bullet.y < enemy.y + enemy.height / 2 &&
                    bullet.y > enemy.y - enemy.height / 2) {
                    // Hit!
                    enemy.alive = false;
                    bullets.splice(bi, 1);
                    score += 10;
                    scoreEl.textContent = score;
                }
            });
        });
        
        // Check enemy bullet-player collisions
        enemyBullets.forEach((bullet, bi) => {
            if (bullet.x < playerX + PLAYER_WIDTH / 2 &&
                bullet.x > playerX - PLAYER_WIDTH / 2 &&
                bullet.y < playerY + PLAYER_HEIGHT / 2 &&
                bullet.y > playerY - PLAYER_HEIGHT / 2) {
                // Player hit!
                enemyBullets.splice(bi, 1);
                loseLife();
            }
        });
        
        // Check if enemies reached left side (where player is)
        let enemyReachedLeft = false;
        enemies.forEach(enemy => {
            if (enemy.alive && enemy.x <= playerX + PLAYER_WIDTH / 2) {
                enemyReachedLeft = true;
            }
        });
        
        if (enemyReachedLeft) {
            loseLife();
        }
        
        // Check if all enemies destroyed
        const aliveEnemies = enemies.filter(e => e.alive).length;
        if (aliveEnemies === 0) {
            wave++;
            waveEl.textContent = wave;
            initEnemies();
        }
    }
    
    function loseLife() {
        lives--;
        updateLivesDisplay();
        
        if (lives <= 0) {
            gameOver();
        } else {
            // Reset position
            playerX = 50;
            playerY = CANVAS_HEIGHT / 2;
            bullets = [];
            enemyBullets = [];  // Clear enemy bullets too
            // Pause briefly
            gameState = 'PAUSED';
            setTimeout(() => {
                if (gameState === 'PAUSED') {
                    gameState = 'PLAYING';
                }
            }, 1000);
        }
    }
    
    function updateLivesDisplay() {
        const hearts = '❤️'.repeat(lives);
        livesEl.textContent = hearts || '0';
    }
    
    function gameOver() {
        gameState = 'GAME_OVER';
        showOverlay('GAME OVER', `Final Score: ${score}<br>Wave: ${wave}`, true);
    }
    
    function render() {
        // Clear canvas
        ctx.fillStyle = '#050508';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        if (gameState === 'MENU' || gameState === 'GAME_OVER') {
            return;
        }
        
        // Draw stars background
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 50; i++) {
            const x = (i * 17) % CANVAS_WIDTH;
            const y = (i * 23 + Date.now() * 0.01) % CANVAS_HEIGHT;
            ctx.fillRect(x, y, 1, 1);
        }
        
        // Draw player (rotated 90 degrees - pointing right)
        ctx.fillStyle = '#00f5ff';
        ctx.shadowColor = '#00f5ff';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(playerX + PLAYER_HEIGHT / 2, playerY);  // Right point
        ctx.lineTo(playerX - PLAYER_HEIGHT / 2, playerY - PLAYER_WIDTH / 2);  // Top-left
        ctx.lineTo(playerX - PLAYER_HEIGHT / 2 + 10, playerY);  // Left center
        ctx.lineTo(playerX - PLAYER_HEIGHT / 2, playerY + PLAYER_WIDTH / 2);  // Bottom-left
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Draw player bullets (horizontal, going right)
        ctx.fillStyle = '#ffff00';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 10;
        bullets.forEach(bullet => {
            ctx.fillRect(bullet.x, bullet.y - bullet.height / 2, bullet.width, bullet.height);
        });
        ctx.shadowBlur = 0;
        
        // Draw enemy bullets (horizontal, going left)
        ctx.fillStyle = '#ff3366';
        ctx.shadowColor = '#ff3366';
        ctx.shadowBlur = 10;
        enemyBullets.forEach(bullet => {
            ctx.fillRect(bullet.x, bullet.y - bullet.height / 2, bullet.width, bullet.height);
        });
        ctx.shadowBlur = 0;
        
        // Draw enemies
        enemies.forEach(enemy => {
            if (!enemy.alive) return;
            
            ctx.fillStyle = '#ff3366';
            ctx.shadowColor = '#ff3366';
            ctx.shadowBlur = 15;
            ctx.fillRect(
                enemy.x - enemy.width / 2,
                enemy.y - enemy.height / 2,
                enemy.width,
                enemy.height
            );
            ctx.shadowBlur = 0;
            
            // Draw enemy details
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(enemy.x - 5, enemy.y - 5, 10, 10);
        });
    }
    
    function gameLoop() {
        updateGame();
        render();
        requestAnimationFrame(gameLoop);
    }
    
    // Start button
    startBtn.addEventListener('click', () => {
        if (gameState === 'MENU' || gameState === 'GAME_OVER') {
            startGame();
        }
    });
    
    function startGame() {
        gameState = 'PLAYING';
        score = 0;
        wave = 1;
        lives = 3;
        playerX = 50;
        playerY = CANVAS_HEIGHT / 2;
        bullets = [];
        enemyBullets = [];
        scoreEl.textContent = score;
        waveEl.textContent = wave;
        updateLivesDisplay();
        initEnemies();
        hideOverlay();
    }
    
    function showOverlay(title, message, isGameOver = false) {
        overlayContent.innerHTML = `
            <h2 ${isGameOver ? 'class="winner-text"' : ''}>${title}</h2>
            <p>${message}</p>
            ${isGameOver ? '<button class="btn btn-primary" onclick="location.reload()">PLAY AGAIN</button>' : ''}
        `;
        overlay.classList.remove('hidden');
    }
    
    function hideOverlay() {
        overlay.classList.add('hidden');
    }
    
    // Pitch threshold bar functions
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
    
    // Start game loop
    gameLoop();
});

