/**
 * Spectate page logic
 * View-only mode for watching the game
 */
document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const canvas = document.getElementById('gameCanvas');
    const gameOverlay = document.getElementById('gameOverlay');
    const overlayContent = document.getElementById('overlayContent');
    const leftPlayerName = document.getElementById('leftPlayerName');
    const rightPlayerName = document.getElementById('rightPlayerName');
    const leftScore = document.getElementById('leftScore');
    const rightScore = document.getElementById('rightScore');
    const leftReady = document.getElementById('leftReady');
    const rightReady = document.getElementById('rightReady');
    const gameStatus = document.getElementById('gameStatus');
    
    // Initialize renderer
    const renderer = new GameRenderer(canvas);
    let gameState = null;
    
    // Initialize WebSocket
    const ws = new GameWebSocket({
        onConnected: () => {
            console.log('Connected, joining as spectator');
            ws.spectate();
        },
        
        onDisconnected: () => {
            showOverlay('Disconnected', 'Attempting to reconnect...');
        },
        
        onJoinResult: (success, spectatorId, error) => {
            if (success) {
                console.log('Spectating with ID:', spectatorId);
            } else {
                console.error('Failed to spectate:', error);
            }
        },
        
        onStateUpdate: (state) => {
            gameState = state;
            updateUI(state);
            renderer.render(state);
            
            // Handle overlay visibility
            if (state.status === 'PLAYING') {
                hideOverlay();
            } else if (state.status === 'FINISHED') {
                if (state.walkover) {
                    showOverlay(`${state.winner} WINS!`, 'Victory by walkover - opponent left the game', true);
                } else {
                    showOverlay(`${state.winner} WINS!`, 'Game over!', true);
                }
            } else if (state.status === 'WAITING') {
                showOverlay('Waiting for Players', 'The game will start when two players join and ready up!');
            } else if (state.status === 'READY_CHECK') {
                showOverlay('Players Joined', 'Waiting for both players to ready up...');
            } else if (state.status === 'PAUSED') {
                showOverlay('Game Paused', 'A player has disconnected');
            }
        },
        
        onPlayerJoined: (name, side) => {
            console.log('Player joined:', name, side);
        },
        
        onPlayerLeft: (name, side) => {
            console.log('Player left:', name, side);
        },
        
        onPlayerReady: (name, side) => {
            console.log('Player ready:', name, side);
        },
        
        onGameOver: (winner) => {
            console.log('Game over! Winner:', winner);
            // Overlay handled by onStateUpdate for walkover support
        },
        
        onError: (message) => {
            console.error('Error:', message);
        }
    });
    
    // Connect WebSocket
    ws.connect();
    
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
        `;
        gameOverlay.classList.remove('hidden');
    }
    
    function hideOverlay() {
        gameOverlay.classList.add('hidden');
    }
    
    // Initial render
    renderer.renderWaiting('CONNECTING...');
});

