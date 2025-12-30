/**
 * Audio Visualizer - Spectrogram, Waveform, and Frequency Spectrum
 */
class AudioVisualizer {
    constructor(options = {}) {
        this.spectrogramCanvas = options.spectrogramCanvas;
        this.waveformCanvas = options.waveformCanvas;
        this.frequencyCanvas = options.frequencyCanvas;
        
        this.spectrogramCtx = this.spectrogramCanvas?.getContext('2d');
        this.waveformCtx = this.waveformCanvas?.getContext('2d');
        this.frequencyCtx = this.frequencyCanvas?.getContext('2d');
        
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.isRunning = false;
        
        // Spectrogram data
        this.spectrogramData = [];
        this.spectrogramWidth = this.spectrogramCanvas?.width || 400;
        this.spectrogramHeight = this.spectrogramCanvas?.height || 200;
        
        // Colors
        this.colors = {
            background: '#050508',
            waveform: '#00f5ff',
            frequencyLow: '#ff3366',
            frequencyMid: '#ffff00',
            frequencyHigh: '#00ff88',
            grid: 'rgba(0, 245, 255, 0.1)',
            text: 'rgba(255, 255, 255, 0.5)'
        };
        
        // Callbacks
        this.onPitchDetected = options.onPitchDetected || (() => {});
    }
    
    async start() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.8;
            
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            
            this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
            this.timeDomainData = new Float32Array(this.analyser.fftSize);
            
            // Initialize spectrogram
            this.spectrogramData = [];
            
            this.isRunning = true;
            this.draw();
            
            return true;
        } catch (error) {
            console.error('Failed to access microphone:', error);
            return false;
        }
    }
    
    stop() {
        this.isRunning = false;
        if (this.microphone) {
            this.microphone.disconnect();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
    
    draw() {
        if (!this.isRunning) return;
        
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.analyser.getFloatTimeDomainData(this.timeDomainData);
        
        this.drawSpectrogram();
        this.drawWaveform();
        this.drawFrequencySpectrum();
        
        // Detect pitch and notify
        const pitch = this.detectPitch();
        this.onPitchDetected(pitch);
        
        requestAnimationFrame(() => this.draw());
    }
    
    drawSpectrogram() {
        if (!this.spectrogramCtx) return;
        
        const ctx = this.spectrogramCtx;
        const width = this.spectrogramWidth;
        const height = this.spectrogramHeight;
        
        // Create column of frequency data
        const column = [];
        const binCount = Math.min(this.frequencyData.length, height);
        
        for (let i = 0; i < binCount; i++) {
            // Focus on lower frequencies (voice range)
            const freqIndex = Math.floor(i * (this.frequencyData.length * 0.25) / binCount);
            column.push(this.frequencyData[freqIndex]);
        }
        
        this.spectrogramData.push(column);
        
        // Keep only last 'width' columns
        if (this.spectrogramData.length > width) {
            this.spectrogramData.shift();
        }
        
        // Clear and redraw
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, width, height);
        
        // Draw spectrogram
        for (let x = 0; x < this.spectrogramData.length; x++) {
            const col = this.spectrogramData[x];
            for (let y = 0; y < col.length; y++) {
                const value = col[y];
                const hue = 180 - (value / 255) * 180; // Cyan to red
                const lightness = (value / 255) * 50;
                ctx.fillStyle = `hsl(${hue}, 100%, ${lightness}%)`;
                ctx.fillRect(x, height - y - 1, 1, 1);
            }
        }
        
        // Draw frequency labels
        ctx.fillStyle = this.colors.text;
        ctx.font = '10px VT323';
        ctx.fillText('500Hz', 5, 20);
        ctx.fillText('250Hz', 5, height / 2);
        ctx.fillText('0Hz', 5, height - 5);
    }
    
    drawWaveform() {
        if (!this.waveformCtx) return;
        
        const ctx = this.waveformCtx;
        const width = this.waveformCanvas.width;
        const height = this.waveformCanvas.height;
        
        // Clear
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, width, height);
        
        // Draw grid
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        
        // Draw waveform
        ctx.strokeStyle = this.colors.waveform;
        ctx.lineWidth = 2;
        ctx.shadowColor = this.colors.waveform;
        ctx.shadowBlur = 10;
        
        ctx.beginPath();
        const sliceWidth = width / this.timeDomainData.length;
        let x = 0;
        
        for (let i = 0; i < this.timeDomainData.length; i++) {
            const v = this.timeDomainData[i];
            const y = (v + 1) / 2 * height;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            x += sliceWidth;
        }
        
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
    
    drawFrequencySpectrum() {
        if (!this.frequencyCtx) return;
        
        const ctx = this.frequencyCtx;
        const width = this.frequencyCanvas.width;
        const height = this.frequencyCanvas.height;
        
        // Clear
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, width, height);
        
        // Draw grid lines
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Focus on voice frequencies (0-1000Hz roughly)
        const voiceFreqBins = Math.floor(this.frequencyData.length * 0.2);
        const barWidth = width / voiceFreqBins;
        
        for (let i = 0; i < voiceFreqBins; i++) {
            const value = this.frequencyData[i];
            const barHeight = (value / 255) * height;
            const x = i * barWidth;
            
            // Color based on frequency range
            const freq = (i / voiceFreqBins) * 1000;
            let color;
            if (freq < 180) {
                color = this.colors.frequencyLow;
            } else if (freq < 280) {
                color = this.colors.frequencyMid;
            } else {
                color = this.colors.frequencyHigh;
            }
            
            // Create gradient
            const gradient = ctx.createLinearGradient(x, height, x, height - barHeight);
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, 'rgba(0,0,0,0.5)');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
        }
        
        // Frequency labels
        ctx.fillStyle = this.colors.text;
        ctx.font = '12px VT323';
        ctx.fillText('0', 5, height - 5);
        ctx.fillText('250Hz', width * 0.25, height - 5);
        ctx.fillText('500Hz', width * 0.5, height - 5);
        ctx.fillText('750Hz', width * 0.75, height - 5);
        ctx.fillText('1kHz', width - 30, height - 5);
    }
    
    detectPitch() {
        const sampleRate = this.audioContext.sampleRate;
        const SIZE = this.timeDomainData.length;
        
        // Check if there's enough signal
        let sum = 0;
        for (let i = 0; i < SIZE; i++) {
            sum += this.timeDomainData[i] * this.timeDomainData[i];
        }
        const rms = Math.sqrt(sum / SIZE);
        
        if (rms < 0.02) {
            return { frequency: 0, rms: rms };
        }
        
        // Autocorrelation
        const correlations = new Array(SIZE / 2).fill(0);
        
        for (let lag = 0; lag < SIZE / 2; lag++) {
            let correlation = 0;
            for (let i = 0; i < SIZE / 2; i++) {
                correlation += this.timeDomainData[i] * this.timeDomainData[i + lag];
            }
            correlations[lag] = correlation;
        }
        
        // Find first peak after initial decay
        let foundValley = false;
        let maxCorrelation = -1;
        let maxLag = -1;
        
        for (let i = 1; i < correlations.length - 1; i++) {
            if (!foundValley && correlations[i] < correlations[i - 1]) {
                foundValley = true;
            }
            
            if (foundValley) {
                if (correlations[i] > correlations[i - 1] && correlations[i] > correlations[i + 1]) {
                    if (correlations[i] > maxCorrelation) {
                        maxCorrelation = correlations[i];
                        maxLag = i;
                        break;
                    }
                }
            }
        }
        
        if (maxLag <= 0) {
            return { frequency: 0, rms: rms };
        }
        
        const frequency = sampleRate / maxLag;
        
        // Filter unrealistic frequencies
        if (frequency < 60 || frequency > 600) {
            return { frequency: 0, rms: rms };
        }
        
        return { frequency: frequency, rms: rms };
    }
}

window.AudioVisualizer = AudioVisualizer;

