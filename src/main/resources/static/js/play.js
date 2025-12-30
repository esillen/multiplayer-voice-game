/**
 * Play page logic
 * Connects voice input, WebSocket, and game rendering
 */
document.addEventListener('DOMContentLoaded', () => {
    // Check if voice is calibrated
    if (!PitchDetector.isCalibrated()) {
        const calibratePrompt = document.createElement('div');
        calibratePrompt.className = 'calibrate-prompt';
        calibratePrompt.innerHTML = `
            <span>⚠️ Voice not calibrated</span>
            <a href="/calibrate">Calibrate now</a>
            <button class="dismiss-btn">✕</button>
        `;
        document.body.appendChild(calibratePrompt);
        
        calibratePrompt.querySelector('.dismiss-btn').addEventListener('click', () => {
            calibratePrompt.remove();
        });
    }
    
    // Get player info from hidden fields
    const playerName = document.getElementById('playerName').value;
    const playerSide = document.getElementById('playerSide').value;
    
    // DOM elements
    const canvas = document.getElementById('gameCanvas');
    const gameOverlay = document.getElementById('gameOverlay');
    const overlayContent = document.getElementById('overlayContent');
    const micStatus = document.getElementById('micStatus');
    const micText = micStatus.querySelector('.mic-text');
    const pitchLevel = document.getElementById('pitchLevel');
    const pitchLabel = document.getElementById('pitchLabel');
    const readyBtn = document.getElementById('readyBtn');
    const leftPlayerName = document.getElementById('leftPlayerName');
    const rightPlayerName = document.getElementById('rightPlayerName');
    const leftScore = document.getElementById('leftScore');
    const rightScore = document.getElementById('rightScore');
    const leftReady = document.getElementById('leftReady');
    const rightReady = document.getElementById('rightReady');
    const gameStatus = document.getElementById('gameStatus');
    
    // Initialize components
    const renderer = new GameRenderer(canvas);
    let pitchDetector = null;
    let currentPitch = 'OFF';
    let isReady = false;
    let gameState = null;
    
    // Initialize WebSocket
    const ws = new GameWebSocket({
        onConnected: () => {
            console.log('Connected, joining game as', playerName, playerSide);
            ws.join(playerName, playerSide);
        },
        
        onDisconnected: () => {
            showOverlay('Disconnected', 'Attempting to reconnect...');
        },
        
        onJoinResult: (success, playerId, error) => {
            if (success) {
                console.log('Joined game with ID:', playerId);
                readyBtn.disabled = false;
            } else {
                console.error('Failed to join:', error);
                showOverlay('Failed to Join', error || 'Unknown error');
            }
        },
        
        onStateUpdate: (state) => {
            gameState = state;
            updateUI(state);
            renderer.render(state);
            
            // Handle overlay visibility based on game status
            if (state.status === 'PLAYING') {
                hideOverlay();
            } else if (state.status === 'FINISHED') {
                showOverlay(`${state.winner} WINS!`, 'Game over!', true);
            }
        },
        
        onPlayerJoined: (name, side) => {
            console.log('Player joined:', name, side);
        },
        
        onPlayerLeft: (name, side) => {
            console.log('Player left:', name, side);
            showOverlay('Player Disconnected', `${name} has left the game`);
        },
        
        onPlayerReady: (name, side) => {
            console.log('Player ready:', name, side);
        },
        
        onGameOver: (winner) => {
            console.log('Game over! Winner:', winner);
            showOverlay(`${winner} WINS!`, 'Game over!', true);
        },
        
        onError: (message) => {
            console.error('Error:', message);
            alert('Error: ' + message);
        }
    });
    
    // Connect WebSocket
    ws.connect();
    
    // Microphone button handler
    micStatus.addEventListener('click', async () => {
        if (pitchDetector && pitchDetector.isRunning) {
            // Stop pitch detection
            pitchDetector.stop();
            micStatus.classList.remove('active');
            micText.textContent = 'Click to enable microphone';
            pitchLabel.textContent = 'OFF';
            pitchLabel.className = 'pitch-label';
            pitchLevel.style.height = '0%';
            currentPitch = 'OFF';
            ws.sendPitch('OFF');
        } else {
            // Start pitch detection
            pitchDetector = new PitchDetector({
                onPitchChange: (pitch) => {
                    currentPitch = pitch;
                    pitchLabel.textContent = pitch;
                    pitchLabel.className = 'pitch-label ' + pitch.toLowerCase();
                    ws.sendPitch(pitch);
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
                alert('Failed to access microphone. Please allow microphone access and try again.');
            }
        }
    });
    
    // Ready button handler
    readyBtn.addEventListener('click', () => {
        if (!isReady) {
            ws.sendReady();
            isReady = true;
            readyBtn.classList.add('pressed');
            readyBtn.textContent = 'READY!';
            readyBtn.disabled = true;
        }
    });
    
    // Keyboard controls (fallback)
    let keyboardPitch = 'OFF';
    
    document.addEventListener('keydown', (e) => {
        let newPitch = keyboardPitch;
        
        if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
            newPitch = 'HIGH';
        } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
            newPitch = 'LOW';
        }
        
        if (newPitch !== keyboardPitch) {
            keyboardPitch = newPitch;
            // Only use keyboard if mic is not active
            if (!pitchDetector || !pitchDetector.isRunning) {
                ws.sendPitch(newPitch);
                pitchLabel.textContent = newPitch;
                pitchLabel.className = 'pitch-label ' + newPitch.toLowerCase();
            }
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp' ||
            e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
            keyboardPitch = 'OFF';
            // Only use keyboard if mic is not active
            if (!pitchDetector || !pitchDetector.isRunning) {
                ws.sendPitch('OFF');
                pitchLabel.textContent = 'OFF';
                pitchLabel.className = 'pitch-label';
            }
        }
    });
    
    // UI update function
    function updateUI(state) {
        // Player names
        leftPlayerName.textContent = state.leftPlayerName || 'Waiting...';
        rightPlayerName.textContent = state.rightPlayerName || 'Waiting...';
        
        // Scores
        leftScore.textContent = state.leftScore;
        rightScore.textContent = state.rightScore;
        
        // Ready indicators
        if (state.leftPlayerReady) {
            leftReady.textContent = 'READY';
            leftReady.classList.add('ready');
        } else {
            leftReady.textContent = 'NOT READY';
            leftReady.classList.remove('ready');
        }
        
        if (state.rightPlayerReady) {
            rightReady.textContent = 'READY';
            rightReady.classList.add('ready');
        } else {
            rightReady.textContent = 'NOT READY';
            rightReady.classList.remove('ready');
        }
        
        // Game status
        const statusMessages = {
            'WAITING': 'WAITING FOR PLAYERS',
            'READY_CHECK': 'WAITING FOR READY',
            'PLAYING': 'GAME IN PROGRESS',
            'PAUSED': 'GAME PAUSED',
            'FINISHED': 'GAME OVER'
        };
        gameStatus.textContent = statusMessages[state.status] || state.status;
    }
    
    // Overlay functions
    function showOverlay(title, message, isWinner = false) {
        overlayContent.innerHTML = `
            <h2 ${isWinner ? 'class="winner-text"' : ''}>${title}</h2>
            <p>${message}</p>
            ${isWinner ? '<button class="btn btn-primary" onclick="window.location.href=\'/join\'">Play Again</button>' : ''}
        `;
        gameOverlay.classList.remove('hidden');
    }
    
    function hideOverlay() {
        gameOverlay.classList.add('hidden');
    }
    
    // Initial render
    renderer.renderWaiting('CONNECTING...');
});

