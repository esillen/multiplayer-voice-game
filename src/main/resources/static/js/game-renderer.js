/**
 * Pong Game Renderer
 * Handles canvas drawing for the game
 */
class GameRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Game dimensions (match server constants)
        this.width = 800;
        this.height = 500;
        this.paddleWidth = 15;
        this.paddleHeight = 80;
        this.paddleMargin = 20;
        this.ballSize = 15;
        
        // Colors
        this.colors = {
            background: '#050508',
            paddle: '#00f5ff',
            ball: '#ffff00',
            centerLine: '#00f5ff',
            text: '#ffffff',
            glow: 'rgba(0, 245, 255, 0.3)'
        };
        
        // Trail effect for ball
        this.ballTrail = [];
        this.maxTrailLength = 8;
    }
    
    clear() {
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }
    
    drawCenterLine() {
        this.ctx.strokeStyle = this.colors.centerLine;
        this.ctx.lineWidth = 4;
        this.ctx.setLineDash([15, 10]);
        this.ctx.globalAlpha = 0.3;
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.width / 2, 0);
        this.ctx.lineTo(this.width / 2, this.height);
        this.ctx.stroke();
        
        this.ctx.setLineDash([]);
        this.ctx.globalAlpha = 1;
    }
    
    drawPaddle(x, y, side) {
        const paddleX = side === 'left' 
            ? this.paddleMargin 
            : this.width - this.paddleMargin - this.paddleWidth;
        
        const paddleY = y - this.paddleHeight / 2;
        
        // Glow effect
        this.ctx.shadowColor = this.colors.paddle;
        this.ctx.shadowBlur = 20;
        
        // Paddle
        this.ctx.fillStyle = this.colors.paddle;
        this.ctx.fillRect(paddleX, paddleY, this.paddleWidth, this.paddleHeight);
        
        // Inner highlight
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.fillRect(paddleX + 2, paddleY + 2, this.paddleWidth - 4, this.paddleHeight - 4);
        
        this.ctx.shadowBlur = 0;
    }
    
    drawBall(x, y) {
        // Add to trail
        this.ballTrail.push({ x, y });
        if (this.ballTrail.length > this.maxTrailLength) {
            this.ballTrail.shift();
        }
        
        // Draw trail
        this.ctx.shadowBlur = 0;
        for (let i = 0; i < this.ballTrail.length - 1; i++) {
            const pos = this.ballTrail[i];
            const alpha = (i / this.ballTrail.length) * 0.3;
            const size = (this.ballSize / 2) * (i / this.ballTrail.length);
            
            this.ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`;
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Glow effect
        this.ctx.shadowColor = this.colors.ball;
        this.ctx.shadowBlur = 25;
        
        // Ball
        this.ctx.fillStyle = this.colors.ball;
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.ballSize / 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Inner highlight
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.beginPath();
        this.ctx.arc(x - 2, y - 2, this.ballSize / 4, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.shadowBlur = 0;
    }
    
    drawScore(leftScore, rightScore) {
        this.ctx.font = '48px "Press Start 2P", monospace';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.textAlign = 'center';
        
        // Left score
        this.ctx.fillText(leftScore.toString(), this.width / 4, 60);
        
        // Right score
        this.ctx.fillText(rightScore.toString(), (this.width * 3) / 4, 60);
    }
    
    drawWaitingMessage(message) {
        this.ctx.font = '20px "Press Start 2P", monospace';
        this.ctx.fillStyle = this.colors.paddle;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(message, this.width / 2, this.height / 2);
    }
    
    render(state) {
        this.clear();
        this.drawCenterLine();
        this.drawScore(state.leftScore, state.rightScore);
        this.drawPaddle(this.paddleMargin, state.leftPaddleY, 'left');
        this.drawPaddle(this.width - this.paddleMargin - this.paddleWidth, state.rightPaddleY, 'right');
        
        if (state.status === 'PLAYING') {
            this.drawBall(state.ballX, state.ballY);
        } else {
            // Reset trail when not playing
            this.ballTrail = [];
        }
    }
    
    renderWaiting(message = 'WAITING...') {
        this.clear();
        this.drawCenterLine();
        
        // Draw paddles at center
        this.drawPaddle(this.paddleMargin, this.height / 2, 'left');
        this.drawPaddle(this.width - this.paddleMargin - this.paddleWidth, this.height / 2, 'right');
        
        this.drawWaitingMessage(message);
    }
}

// Export for use
window.GameRenderer = GameRenderer;

