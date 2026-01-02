/**
 * WebSocket client for Voice Pong game
 */
class GameWebSocket {
    constructor(options = {}) {
        this.onStateUpdate = options.onStateUpdate || (() => {});
        this.onPlayerJoined = options.onPlayerJoined || (() => {});
        this.onPlayerLeft = options.onPlayerLeft || (() => {});
        this.onPlayerReady = options.onPlayerReady || (() => {});
        this.onGameOver = options.onGameOver || (() => {});
        this.onGameFinished = options.onGameFinished || (() => {});
        this.onGameEndWithScore = options.onGameEndWithScore || (() => {});
        this.onError = options.onError || (() => {});
        this.onConnected = options.onConnected || (() => {});
        this.onDisconnected = options.onDisconnected || (() => {});
        this.onJoinResult = options.onJoinResult || (() => {});
        this.onCourtSummaries = options.onCourtSummaries || (() => {});
        
        this.socket = null;
        this.playerId = null;
        this.courtId = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.autoReconnectEnabled = true; // Can be disabled to prevent reconnection
    }
    
    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/game-ws`;
        
        console.log('Connecting to WebSocket:', wsUrl);
        
        this.socket = new WebSocket(wsUrl);
        
        this.socket.onopen = () => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.onConnected();
        };
        
        this.socket.onclose = (event) => {
            console.log('WebSocket disconnected:', event.code, event.reason);
            this.isConnected = false;
            this.onDisconnected();
            
            // Don't reconnect if auto-reconnect is disabled
            if (!this.autoReconnectEnabled) {
                console.log('Auto-reconnect disabled, not reconnecting');
                return;
            }
            
            // Attempt reconnection
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                console.log(`Reconnecting... attempt ${this.reconnectAttempts}`);
                setTimeout(() => this.connect(), 2000);
            }
        };
        
        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.onError('Connection error');
        };
        
        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error('Failed to parse message:', error);
            }
        };
    }
    
    handleMessage(message) {
        switch (message.type) {
            case 'joinResult':
                if (message.success) {
                    this.playerId = message.playerId;
                    this.courtId = message.courtId;
                }
                this.onJoinResult(message.success, message.playerId, message.error, message.courtId);
                break;
                
            case 'spectateResult':
                this.courtId = message.courtId;
                this.onJoinResult(message.success, message.spectatorId, message.error, message.courtId);
                break;
                
            case 'stateUpdate':
                this.onStateUpdate(message.state, message.courtId);
                break;
                
            case 'playerJoined':
                this.onPlayerJoined(message.name, message.side, message.courtId);
                break;
                
            case 'playerLeft':
                this.onPlayerLeft(message.name, message.side, message.courtId);
                break;
                
            case 'playerReady':
                this.onPlayerReady(message.name, message.side, message.courtId);
                break;
                
            case 'gameOver':
                this.onGameOver(message.winner, message.courtId);
                break;
                
            case 'gameFinished':
                // Game ended, player will be disconnected
                this.onGameFinished(message.message);
                break;
                
            case 'gameEndWithScore':
                // Game ended with final score - disconnect players
                this.onGameEndWithScore(message);
                break;
                
            case 'courtSummaries':
                this.onCourtSummaries(message.courts);
                break;
                
            case 'error':
                this.onError(message.message);
                break;
                
            default:
                console.warn('Unknown message type:', message.type);
        }
    }
    
    send(message) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket not connected, cannot send message');
        }
    }
    
    join(name, side, courtId = 1) {
        this.send({
            type: 'join',
            name: name,
            side: side,
            courtId: courtId
        });
    }
    
    spectate(courtId = 1) {
        this.send({
            type: 'spectate',
            courtId: courtId
        });
    }
    
    joinLobby() {
        this.send({
            type: 'lobby'
        });
    }
    
    leaveLobby() {
        this.send({
            type: 'leaveLobby'
        });
    }
    
    sendPitch(pitch) {
        this.send({
            type: 'pitch',
            pitch: pitch
        });
    }
    
    sendReady() {
        this.send({
            type: 'ready'
        });
    }
    
    disableAutoReconnect() {
        this.autoReconnectEnabled = false;
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.close();
        }
    }
}

// Export for use
window.GameWebSocket = GameWebSocket;
