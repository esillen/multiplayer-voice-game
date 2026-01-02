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
            <span>Voice not calibrated</span>
            <a href="/calibrate">Calibrate now</a>
            <button class="dismiss-btn">X</button>
        `;
        document.body.appendChild(calibratePrompt);
        
        calibratePrompt.querySelector('.dismiss-btn').addEventListener('click', () => {
            calibratePrompt.remove();
        });
    }
    
    // Get player info from hidden fields
    const playerName = document.getElementById('playerName').value;
    const playerSide = document.getElementById('playerSide').value;
    const courtId = parseInt(document.getElementById('courtId').value) || 1;
    const visualSeed = parseInt(document.getElementById('visualSeed').value) || 0;
    
    // DOM elements
    const canvas = document.getElementById('gameCanvas');
    const gameOverlay = document.getElementById('gameOverlay');
    const overlayContent = document.getElementById('overlayContent');
    const readyBtn = document.getElementById('readyBtn');
    const leftPlayerName = document.getElementById('leftPlayerName');
    const rightPlayerName = document.getElementById('rightPlayerName');
    const leftScore = document.getElementById('leftScore');
    const rightScore = document.getElementById('rightScore');
    const leftReady = document.getElementById('leftReady');
    const rightReady = document.getElementById('rightReady');
    const gameStatus = document.getElementById('gameStatus');
    
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
    
    // Initialize components
    const renderer = new GameRenderer(canvas, visualSeed);
    let pitchDetector = null;
    let currentPitch = 'OFF';
    let isReady = false;
    let gameState = null;
    let previousGameStatus = null;
    let animationFrameId = null;
    
    // Load calibration for threshold display
    let calibrationData = loadCalibration();
    updateThresholdPositions();
    
    // Initialize WebSocket
    const ws = new GameWebSocket({
        onConnected: () => {
            console.log('Connected, joining court', courtId, 'as', playerName, playerSide);
            ws.join(playerName, playerSide, courtId);
        },
        
        onDisconnected: () => {
            showOverlay('Disconnected', 'Attempting to reconnect...');
        },
        
        onJoinResult: (success, playerId, error, joinedCourtId) => {
            if (success) {
                console.log('Joined court', joinedCourtId, 'with ID:', playerId);
                readyBtn.disabled = false;
            } else {
                console.error('Failed to join:', error);
                showOverlay('Failed to Join', error || 'Unknown error');
            }
        },
        
        onStateUpdate: (state, stateCourtId) => {
            // Only process updates for our court
            if (stateCourtId !== courtId) return;
            
            // Check for READY_CHECK -> PLAYING transition to show arrow
            if (previousGameStatus === 'READY_CHECK' && state.status === 'PLAYING') {
                // Game just started, show arrow indicator
                renderer.startArrow(state.ballVelocityX, state.ballVelocityY);
            }
            
            // Update ball position for interpolation
            if (state.status === 'PLAYING') {
                renderer.updateBallPosition(state.ballX, state.ballY, state.ballVelocityX, state.ballVelocityY);
            }
            
            previousGameStatus = state.status;
            gameState = state;
            updateUI(state);
            
            if (state.status === 'PLAYING') {
                hideOverlay();
                // Start animation loop if not already running
                if (!animationFrameId) {
                    startAnimationLoop();
                }
            } else {
                // Stop animation loop when not playing
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
                // Render once for non-playing states
                renderer.render(state);
                
                if (state.status === 'FINISHED') {
                    const isWinner = state.winner === playerName;
                    if (state.walkover) {
                        if (isWinner) {
                            showOverlay('YOU WIN!', 'Victory by walkover - opponent left the game', true);
                        } else {
                            showOverlay(`${state.winner} WINS!`, 'Victory by walkover', true);
                        }
                    } else {
                        showOverlay(`${state.winner} WINS!`, 'Game over!', true);
                    }
                } else if (state.status === 'WAITING') {
                    updateOverlayForWaiting();
                } else if (state.status === 'READY_CHECK') {
                    updateOverlayForReadyCheck();
                }
            }
        },
        
        onPlayerJoined: (name, side, eventCourtId) => {
            if (eventCourtId !== courtId) return;
            console.log('Player joined:', name, side);
        },
        
        onPlayerLeft: (name, side, eventCourtId) => {
            if (eventCourtId !== courtId) return;
            console.log('Player left:', name, side);
            showOverlay('Player Disconnected', `${name} has left the game`);
        },
        
        onPlayerReady: (name, side, eventCourtId) => {
            if (eventCourtId !== courtId) return;
            console.log('Player ready:', name, side);
        },
        
        onGameOver: (winner, eventCourtId) => {
            if (eventCourtId !== courtId) return;
            console.log('Game over! Winner:', winner);
            // Overlay handled by onStateUpdate for walkover support
        },
        
        onGameFinished: (message) => {
            console.log('Game finished:', message);
            // Don't override the overlay - onStateUpdate already shows it with the button
            // Just ensure the button is there if overlay is already showing
            setTimeout(() => {
                const joinBtn = document.getElementById('joinAnotherCourtBtn');
                if (!joinBtn && gameState && gameState.status === 'FINISHED') {
                    // If button is missing but game is finished, re-show overlay
                    const isWinner = gameState.winner === playerName;
                    if (gameState.walkover) {
                        if (isWinner) {
                            showOverlay('YOU WIN!', 'Victory by walkover - opponent left the game', true);
                        } else {
                            showOverlay(`${gameState.winner} WINS!`, 'Victory by walkover', true);
                        }
                    } else {
                        showOverlay(`${gameState.winner} WINS!`, 'Game over!', true);
                    }
                }
            }, 100);
        },
        
        onGameEndWithScore: (message) => {
            console.log('Game ended with score:', message);
            // Mark WebSocket as finished to prevent reconnection
            ws.gameFinished = true;
            
            // Show final score overlay
            const isWinner = message.winner === playerName;
            const scoreText = `${message.leftScore} - ${message.rightScore}`;
            let title, messageText;
            
            if (message.walkover) {
                if (isWinner) {
                    title = 'YOU WIN!';
                    messageText = `Victory by walkover - Final Score: ${scoreText}`;
                } else {
                    title = `${message.winner} WINS!`;
                    messageText = `Victory by walkover - Final Score: ${scoreText}`;
                }
            } else {
                title = isWinner ? 'YOU WIN!' : `${message.winner} WINS!`;
                messageText = `Final Score: ${scoreText}`;
            }
            
            showOverlay(title, messageText, true);
            
            // Disconnect WebSocket after a short delay
            setTimeout(() => {
                ws.disconnect();
            }, 500);
        },
        
        onError: (message) => {
            console.error('Error:', message);
            alert('Error: ' + message);
        }
    });
    
    // Connect WebSocket
    ws.connect();
    
    // Auto-start microphone
    startMicrophone();
    
    async function startMicrophone() {
        pitchDetector = new PitchDetector({
            onPitchChange: (pitch) => {
                currentPitch = pitch;
                ws.sendPitch(pitch);
                updatePitchDisplay(pitch);
            },
            onVolumeChange: (volume) => {
                // Volume indicator in marker brightness
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
    
    function updatePitchDisplay(pitch) {
        currentPitchLabel.textContent = pitch;
        currentPitchLabel.className = 'pitch-state ' + pitch.toLowerCase();
    }
    
    function updateFrequencyDisplay(frequency, probability) {
        if (frequency > 0) {
            const confidenceStr = probability ? ` (${Math.round(probability * 100)}%)` : '';
            currentFrequencyEl.textContent = `${Math.round(frequency)} Hz${confidenceStr}`;
            
            // Update pitch marker position
            const position = freqToPercent(frequency);
            pitchMarker.style.left = `${position}%`;
            pitchMarker.classList.add('active');
        } else {
            currentFrequencyEl.textContent = '-- Hz';
            pitchMarker.classList.remove('active');
        }
    }
    
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
    
    // UI update function
    function updateUI(state) {
        leftPlayerName.textContent = state.leftPlayerName || 'Waiting...';
        rightPlayerName.textContent = state.rightPlayerName || 'Waiting...';
        
        leftScore.textContent = state.leftScore;
        rightScore.textContent = state.rightScore;
        
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
        const hasButton = isWinner;
        overlayContent.innerHTML = `
            <h2 ${isWinner ? 'class="winner-text"' : ''}>${title}</h2>
            <p>${message}</p>
            ${hasButton ? '<button id="joinAnotherCourtBtn" class="btn btn-primary" style="cursor: pointer; margin-top: 20px;">Join Another Court</button>' : ''}
        `;
        readyBtn.style.display = isWinner ? 'none' : 'inline-flex';
        gameOverlay.classList.remove('hidden');
        
        // Add event listener for the button if it exists
        if (hasButton) {
            // Use requestAnimationFrame to ensure DOM is updated
            requestAnimationFrame(() => {
                const joinBtn = document.getElementById('joinAnotherCourtBtn');
                if (joinBtn) {
                    // Remove any existing listeners
                    const newBtn = joinBtn.cloneNode(true);
                    joinBtn.parentNode.replaceChild(newBtn, joinBtn);
                    
                    // Add click handler
                    newBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Join Another Court button clicked');
                        window.location.href = '/join';
                    });
                } else {
                    console.error('Join Another Court button not found in DOM');
                }
            });
        }
    }
    
    function hideOverlay() {
        gameOverlay.classList.add('hidden');
    }
    
    function updateOverlayForWaiting() {
        overlayContent.innerHTML = `
            <h2>Waiting for opponent...</h2>
            <p>Share this link with a friend!</p>
        `;
        readyBtn.style.display = 'none';
        gameOverlay.classList.remove('hidden');
    }
    
    function updateOverlayForReadyCheck() {
        overlayContent.innerHTML = `
            <h2>Both players connected!</h2>
            <p>Click the button when you're ready to play</p>
        `;
        readyBtn.style.display = 'inline-flex';
        gameOverlay.classList.remove('hidden');
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
        
        // Update pitch detector thresholds
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
    let activeTouchId = null;
    
    function getClientX(e) {
        if (e.touches && e.touches.length > 0) {
            return e.touches[0].clientX;
        }
        if (e.changedTouches && e.changedTouches.length > 0) {
            return e.changedTouches[0].clientX;
        }
        return e.clientX;
    }
    
    function handleDragStart(e, type) {
        e.preventDefault();
        e.stopPropagation();
        
        // Find the marker element
        draggedMarker = e.target.closest('.threshold-marker');
        if (!draggedMarker) {
            // Try finding by ID if closest didn't work
            draggedMarker = type === 'low' ? lowThresholdEl : highThresholdEl;
        }
        
        dragType = type;
        draggedMarker.classList.add('dragging');
        
        // Track touch ID for touch events
        if (e.touches && e.touches.length > 0) {
            activeTouchId = e.touches[0].identifier;
        }
        
        // Prevent text selection and scrolling
        document.body.style.userSelect = 'none';
        document.body.style.touchAction = 'none';
    }
    
    function handleDrag(e) {
        if (!draggedMarker) return;
        
        // For touch events, only process if it's the active touch
        if (e.touches && e.touches.length > 0) {
            const touch = Array.from(e.touches).find(t => t.identifier === activeTouchId);
            if (!touch) return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        const rect = pitchMeterBar.getBoundingClientRect();
        const clientX = getClientX(e);
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
    
    function handleDragEnd(e) {
        if (!draggedMarker) return;
        
        // For touch events, only end if it's the active touch
        if (e.changedTouches && e.changedTouches.length > 0) {
            const touch = Array.from(e.changedTouches).find(t => t.identifier === activeTouchId);
            if (!touch && activeTouchId !== null) return;
        }
        
        if (draggedMarker) {
            draggedMarker.classList.remove('dragging');
            saveCalibration();
        }
        
        // Restore text selection and scrolling
        document.body.style.userSelect = '';
        document.body.style.touchAction = '';
        
        draggedMarker = null;
        dragType = null;
        activeTouchId = null;
    }
    
    // Mouse events
    lowThresholdEl.addEventListener('mousedown', (e) => handleDragStart(e, 'low'));
    highThresholdEl.addEventListener('mousedown', (e) => handleDragStart(e, 'high'));
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('mouseleave', handleDragEnd); // Handle mouse leaving window
    
    // Touch events
    lowThresholdEl.addEventListener('touchstart', (e) => handleDragStart(e, 'low'), { passive: false });
    highThresholdEl.addEventListener('touchstart', (e) => handleDragStart(e, 'high'), { passive: false });
    document.addEventListener('touchmove', handleDrag, { passive: false });
    document.addEventListener('touchend', handleDragEnd);
    document.addEventListener('touchcancel', handleDragEnd); // Handle touch cancellation
    
    // Animation loop for smooth interpolated rendering
    function startAnimationLoop() {
        function animate() {
            if (gameState && gameState.status === 'PLAYING') {
                renderer.render(gameState);
                animationFrameId = requestAnimationFrame(animate);
            } else {
                animationFrameId = null;
            }
        }
        animate();
    }
    
    // Initial render
    renderer.renderWaiting('CONNECTING...');
});
