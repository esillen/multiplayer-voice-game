/**
 * Audio Visualizer with Robust YIN Pitch Detection
 * Spectrogram, Waveform, Frequency Spectrum, and accurate pitch tracking
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
        
        // YIN algorithm parameters
        this.yinThreshold = 0.15;
        this.probabilityThreshold = 0.6;
        this.minFrequency = 70;
        this.maxFrequency = 500;
        
        // Noise handling
        this.noiseFloor = 0.01;
        this.noiseFloorAlpha = 0.995;
        this.volumeThreshold = 0.015;
        
        // Smoothing
        this.medianFilterSize = 5;
        this.frequencyHistory = [];
        this.exponentialAlpha = 0.35;
        this.lastSmoothedFrequency = 0;
        
        // Callbacks
        this.onPitchDetected = options.onPitchDetected || (() => {});
    }
    
    async start() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: false, // We handle noise ourselves
                    autoGainControl: true,
                    channelCount: 1
                }
            });
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 4096; // Larger for better frequency resolution
            this.analyser.smoothingTimeConstant = 0.3;
            
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            
            this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
            this.timeDomainData = new Float32Array(this.analyser.fftSize);
            
            // Pre-allocate YIN buffer
            this.yinBuffer = new Float32Array(this.analyser.fftSize / 2);
            
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
        const pitch = this.detectPitchYIN();
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
    
    /**
     * Calculate RMS (Root Mean Square) of audio buffer
     */
    calculateRMS(buffer) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i] * buffer[i];
        }
        return Math.sqrt(sum / buffer.length);
    }
    
    /**
     * YIN Algorithm for robust pitch detection
     */
    detectPitchYIN() {
        const sampleRate = this.audioContext.sampleRate;
        const bufferSize = this.timeDomainData.length;
        const yinBufferSize = bufferSize / 2;
        
        // Calculate RMS for volume
        const rms = this.calculateRMS(this.timeDomainData);
        
        // Adapt noise floor
        if (rms < this.noiseFloor * 1.5) {
            this.noiseFloor = this.noiseFloorAlpha * this.noiseFloor + 
                             (1 - this.noiseFloorAlpha) * rms;
        }
        
        const effectiveVolume = Math.max(0, rms - this.noiseFloor);
        
        // Check if volume is too low
        if (effectiveVolume < this.volumeThreshold) {
            // Clear history when silent
            if (this.frequencyHistory.length > 0) {
                this.frequencyHistory = [];
                this.lastSmoothedFrequency = 0;
            }
            return { frequency: 0, rms: rms, probability: 0 };
        }
        
        // Calculate min and max tau based on frequency range
        const minTau = Math.floor(sampleRate / this.maxFrequency);
        const maxTau = Math.min(Math.floor(sampleRate / this.minFrequency), yinBufferSize - 1);
        
        // Step 1 & 2: Compute difference function with cumulative mean normalization
        this.yinBuffer[0] = 1;
        let runningSum = 0;
        
        for (let tau = 1; tau < yinBufferSize; tau++) {
            let delta = 0;
            for (let i = 0; i < yinBufferSize; i++) {
                const diff = this.timeDomainData[i] - this.timeDomainData[i + tau];
                delta += diff * diff;
            }
            
            // Cumulative mean normalized difference
            runningSum += delta;
            this.yinBuffer[tau] = delta * tau / runningSum;
        }
        
        // Step 4: Find first tau below threshold (absolute threshold)
        let tau = minTau;
        let foundTau = -1;
        
        while (tau < maxTau) {
            if (this.yinBuffer[tau] < this.yinThreshold) {
                // Step 5: Find local minimum
                while (tau + 1 < maxTau && this.yinBuffer[tau + 1] < this.yinBuffer[tau]) {
                    tau++;
                }
                foundTau = tau;
                break;
            }
            tau++;
        }
        
        // If no pitch found below threshold, find global minimum
        if (foundTau === -1) {
            let minVal = this.yinBuffer[minTau];
            foundTau = minTau;
            
            for (let i = minTau + 1; i < maxTau; i++) {
                if (this.yinBuffer[i] < minVal) {
                    minVal = this.yinBuffer[i];
                    foundTau = i;
                }
            }
            
            // Reject if minimum is too high
            if (minVal > 0.5) {
                return { frequency: 0, rms: rms, probability: 0 };
            }
        }
        
        // Step 6: Parabolic interpolation
        let betterTau = foundTau;
        
        if (foundTau > 0 && foundTau < yinBufferSize - 1) {
            const s0 = this.yinBuffer[foundTau - 1];
            const s1 = this.yinBuffer[foundTau];
            const s2 = this.yinBuffer[foundTau + 1];
            
            const adjustment = (s2 - s0) / (2 * (2 * s1 - s2 - s0));
            
            if (Math.abs(adjustment) < 1) {
                betterTau = foundTau + adjustment;
            }
        }
        
        // Calculate frequency and probability
        const frequency = sampleRate / betterTau;
        const probability = 1 - this.yinBuffer[foundTau];
        
        // Validate frequency range
        if (frequency < this.minFrequency || frequency > this.maxFrequency) {
            return { frequency: 0, rms: rms, probability: 0 };
        }
        
        // Reject low confidence detections
        if (probability < this.probabilityThreshold) {
            return { frequency: 0, rms: rms, probability: probability };
        }
        
        // Apply smoothing
        const smoothedFrequency = this.applySmoothing(frequency);
        
        return { 
            frequency: smoothedFrequency, 
            rms: rms, 
            probability: probability,
            rawFrequency: frequency
        };
    }
    
    /**
     * Apply median filter + exponential smoothing
     */
    applySmoothing(frequency) {
        this.frequencyHistory.push(frequency);
        
        if (this.frequencyHistory.length > this.medianFilterSize) {
            this.frequencyHistory.shift();
        }
        
        if (this.frequencyHistory.length < 3) {
            this.lastSmoothedFrequency = frequency;
            return frequency;
        }
        
        // Median filter
        const sorted = [...this.frequencyHistory].sort((a, b) => a - b);
        const medianIndex = Math.floor(sorted.length / 2);
        const medianFrequency = sorted[medianIndex];
        
        // Exponential smoothing with octave error correction
        if (this.lastSmoothedFrequency === 0) {
            this.lastSmoothedFrequency = medianFrequency;
        } else {
            const ratio = medianFrequency / this.lastSmoothedFrequency;
            
            // Correct octave errors
            if (ratio > 1.8 && ratio < 2.2) {
                this.lastSmoothedFrequency = this.exponentialAlpha * (medianFrequency / 2) + 
                                            (1 - this.exponentialAlpha) * this.lastSmoothedFrequency;
            } else if (ratio > 0.45 && ratio < 0.55) {
                this.lastSmoothedFrequency = this.exponentialAlpha * (medianFrequency * 2) + 
                                            (1 - this.exponentialAlpha) * this.lastSmoothedFrequency;
            } else {
                this.lastSmoothedFrequency = this.exponentialAlpha * medianFrequency + 
                                            (1 - this.exponentialAlpha) * this.lastSmoothedFrequency;
            }
        }
        
        return this.lastSmoothedFrequency;
    }
}

window.AudioVisualizer = AudioVisualizer;
