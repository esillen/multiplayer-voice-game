/**
 * Pitch Detector using Web Audio API
 * Detects if voice is HIGH, MEDIUM, LOW, or OFF
 */
class PitchDetector {
    constructor(options = {}) {
        this.onPitchChange = options.onPitchChange || (() => {});
        this.onVolumeChange = options.onVolumeChange || (() => {});
        
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.isRunning = false;
        
        // Pitch thresholds (in Hz) - tuned for voice
        this.highThreshold = 280;  // Above this = HIGH
        this.lowThreshold = 180;   // Below this = LOW
        
        // Volume threshold for detecting silence
        this.volumeThreshold = 0.02;
        
        this.currentPitch = 'OFF';
        this.dataArray = null;
        this.bufferLength = 0;
    }
    
    async start() {
        try {
            // Request microphone access
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
            
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            
            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Float32Array(this.bufferLength);
            
            this.isRunning = true;
            this.analyze();
            
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
    
    analyze() {
        if (!this.isRunning) return;
        
        this.analyser.getFloatTimeDomainData(this.dataArray);
        
        // Calculate RMS volume
        let sum = 0;
        for (let i = 0; i < this.bufferLength; i++) {
            sum += this.dataArray[i] * this.dataArray[i];
        }
        const rms = Math.sqrt(sum / this.bufferLength);
        
        // Normalize volume to 0-1 range (roughly)
        const normalizedVolume = Math.min(rms * 10, 1);
        this.onVolumeChange(normalizedVolume);
        
        let newPitch = 'OFF';
        
        if (rms > this.volumeThreshold) {
            // Detect pitch using autocorrelation
            const frequency = this.detectPitch();
            
            if (frequency > 0) {
                if (frequency > this.highThreshold) {
                    newPitch = 'HIGH';
                } else if (frequency < this.lowThreshold) {
                    newPitch = 'LOW';
                } else {
                    newPitch = 'MEDIUM';
                }
            }
        }
        
        if (newPitch !== this.currentPitch) {
            this.currentPitch = newPitch;
            this.onPitchChange(newPitch);
        }
        
        requestAnimationFrame(() => this.analyze());
    }
    
    /**
     * Autocorrelation-based pitch detection
     */
    detectPitch() {
        const sampleRate = this.audioContext.sampleRate;
        const SIZE = this.bufferLength;
        
        // Find the first point where the signal crosses zero going up
        let start = 0;
        for (let i = 0; i < SIZE / 2; i++) {
            if (this.dataArray[i] < 0 && this.dataArray[i + 1] >= 0) {
                start = i;
                break;
            }
        }
        
        // Autocorrelation
        const correlations = new Array(SIZE / 2).fill(0);
        
        for (let lag = 0; lag < SIZE / 2; lag++) {
            let sum = 0;
            for (let i = 0; i < SIZE / 2; i++) {
                sum += this.dataArray[i] * this.dataArray[i + lag];
            }
            correlations[lag] = sum;
        }
        
        // Find the first peak in correlation (skip the initial peak at lag=0)
        let maxCorrelation = -1;
        let maxLag = -1;
        
        // Start looking after the first zero crossing of correlation
        let foundFirstPeak = false;
        let foundValley = false;
        
        for (let i = 1; i < correlations.length - 1; i++) {
            if (!foundValley && correlations[i] < correlations[i - 1]) {
                foundValley = true;
            }
            
            if (foundValley) {
                if (correlations[i] > correlations[i - 1] && correlations[i] > correlations[i + 1]) {
                    if (correlations[i] > maxCorrelation) {
                        maxCorrelation = correlations[i];
                        maxLag = i;
                        foundFirstPeak = true;
                        break; // Take the first significant peak
                    }
                }
            }
        }
        
        if (!foundFirstPeak || maxLag <= 0) {
            return -1;
        }
        
        // Convert lag to frequency
        const frequency = sampleRate / maxLag;
        
        // Filter out unrealistic frequencies for human voice (80Hz - 400Hz typical)
        if (frequency < 80 || frequency > 500) {
            return -1;
        }
        
        return frequency;
    }
    
    getCurrentPitch() {
        return this.currentPitch;
    }
}

// Export for use
window.PitchDetector = PitchDetector;

