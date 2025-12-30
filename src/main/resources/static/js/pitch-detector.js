/**
 * Robust Pitch Detector using YIN Algorithm
 * 
 * Uses the YIN algorithm (de Cheveigné & Kawahara, 2002) which is considered
 * one of the most accurate algorithms for monophonic pitch detection.
 * 
 * Features:
 * - YIN algorithm with cumulative mean normalized difference
 * - Parabolic interpolation for sub-sample accuracy
 * - Median filter for temporal smoothing
 * - Adaptive noise floor estimation
 * - Confidence-based detection rejection
 */
class PitchDetector {
    constructor(options = {}) {
        this.onPitchChange = options.onPitchChange || (() => {});
        this.onVolumeChange = options.onVolumeChange || (() => {});
        this.onFrequencyDetected = options.onFrequencyDetected || (() => {});
        
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.isRunning = false;
        
        // Load calibrated thresholds or use defaults
        const calibration = this.loadCalibration();
        this.highThreshold = calibration.highThreshold;
        this.lowThreshold = calibration.lowThreshold;
        
        console.log(`Pitch thresholds - High: ${this.highThreshold}Hz, Low: ${this.lowThreshold}Hz`);
        
        // YIN algorithm parameters
        this.yinThreshold = 0.15; // Lower = more strict, typical range 0.1-0.2
        this.probabilityThreshold = 0.7; // Minimum confidence to accept pitch
        
        // Noise and volume parameters
        this.volumeThreshold = 0.015; // RMS threshold for voice detection
        this.noiseFloor = 0.01; // Adaptive noise floor
        this.noiseFloorAlpha = 0.995; // Noise floor adaptation rate
        
        // Frequency range for human voice (Hz)
        this.minFrequency = 70;
        this.maxFrequency = 500;
        
        // Smoothing and stability
        this.medianFilterSize = 5; // Odd number for median filter
        this.frequencyHistory = [];
        this.exponentialAlpha = 0.5; // For exponential smoothing (0-1, higher = more responsive)
        this.lastSmoothedFrequency = 0;
        
        // Pitch stability (require consistent readings)
        this.stablePitchCount = 0;
        this.stablePitchThreshold = 1; // Reduced since jump detection handles transitions
        this.pendingPitch = null;
        
        this.currentPitch = 'OFF';
        this.currentFrequency = 0;
        this.dataArray = null;
        this.bufferLength = 0;
        
        // Pre-allocated buffers for YIN
        this.yinBuffer = null;
    }
    
    /**
     * Load calibration from localStorage
     */
    loadCalibration() {
        const defaults = { highThreshold: 280, lowThreshold: 180 };
        
        try {
            const saved = localStorage.getItem('voiceCalibration');
            if (saved) {
                const data = JSON.parse(saved);
                return {
                    highThreshold: data.highThreshold || defaults.highThreshold,
                    lowThreshold: data.lowThreshold || defaults.lowThreshold
                };
            }
        } catch (e) {
            console.warn('Failed to load voice calibration:', e);
        }
        
        return defaults;
    }
    
    /**
     * Check if calibration exists
     */
    static isCalibrated() {
        return localStorage.getItem('voiceCalibration') !== null;
    }
    
    async start() {
        try {
            // Request microphone access with specific constraints
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: false, // We handle noise ourselves for better pitch detection
                    autoGainControl: true,
                    channelCount: 1,
                    sampleRate: { ideal: 44100 }
                }
            });
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Use larger FFT for better low frequency resolution
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 4096; // Larger buffer for better frequency resolution
            this.analyser.smoothingTimeConstant = 0; // No smoothing, we do our own
            
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            
            this.bufferLength = this.analyser.fftSize;
            this.dataArray = new Float32Array(this.bufferLength);
            
            // Pre-allocate YIN buffer (half the size of input)
            this.yinBuffer = new Float32Array(this.bufferLength / 2);
            
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
        const rms = this.calculateRMS(this.dataArray);
        
        // Adapt noise floor (slowly tracks the minimum energy)
        if (rms < this.noiseFloor * 1.5) {
            this.noiseFloor = this.noiseFloorAlpha * this.noiseFloor + 
                             (1 - this.noiseFloorAlpha) * rms;
        }
        
        // Normalize volume relative to noise floor
        const effectiveVolume = Math.max(0, rms - this.noiseFloor);
        const normalizedVolume = Math.min(effectiveVolume * 15, 1);
        this.onVolumeChange(normalizedVolume);
        
        let newPitch = 'OFF';
        let detectedFrequency = -1;
        
        // Only attempt pitch detection if volume is above threshold
        if (effectiveVolume > this.volumeThreshold) {
            const result = this.detectPitchYIN();
            
            if (result.frequency > 0 && result.probability > this.probabilityThreshold) {
                detectedFrequency = result.frequency;
                
                // Apply median filter for stability
                const smoothedFrequency = this.applySmoothing(detectedFrequency);
                this.currentFrequency = smoothedFrequency;
                
                // Report frequency
                this.onFrequencyDetected(smoothedFrequency, result.probability);
                
                // Determine pitch category
                if (smoothedFrequency > this.highThreshold) {
                    newPitch = 'HIGH';
                } else if (smoothedFrequency < this.lowThreshold) {
                    newPitch = 'LOW';
                } else {
                    newPitch = 'MEDIUM';
                }
            }
        } else {
            // Clear history when silent to avoid stale data
            if (this.frequencyHistory.length > 0) {
                this.frequencyHistory = [];
                this.lastSmoothedFrequency = 0;
            }
        }
        
        // Require stable readings before changing pitch (reduces jitter)
        if (newPitch !== this.currentPitch) {
            if (newPitch === this.pendingPitch) {
                this.stablePitchCount++;
                if (this.stablePitchCount >= this.stablePitchThreshold) {
                    this.currentPitch = newPitch;
                    this.onPitchChange(newPitch);
                    this.stablePitchCount = 0;
                    this.pendingPitch = null;
                }
            } else {
                this.pendingPitch = newPitch;
                this.stablePitchCount = 1;
            }
        } else {
            this.pendingPitch = null;
            this.stablePitchCount = 0;
        }
        
        requestAnimationFrame(() => this.analyze());
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
     * Based on: "YIN, a fundamental frequency estimator for speech and music"
     * by de Cheveigné & Kawahara (2002)
     */
    detectPitchYIN() {
        const sampleRate = this.audioContext.sampleRate;
        const bufferSize = this.dataArray.length;
        const yinBufferSize = bufferSize / 2;
        
        // Calculate min and max tau (lag) based on frequency range
        const minTau = Math.floor(sampleRate / this.maxFrequency);
        const maxTau = Math.floor(sampleRate / this.minFrequency);
        
        // Step 1 & 2: Compute the difference function
        // d(tau) = sum of squared differences
        this.yinBuffer[0] = 1;
        
        let runningSum = 0;
        
        for (let tau = 1; tau < yinBufferSize; tau++) {
            let delta = 0;
            for (let i = 0; i < yinBufferSize; i++) {
                const diff = this.dataArray[i] - this.dataArray[i + tau];
                delta += diff * diff;
            }
            
            // Step 3: Cumulative mean normalized difference function
            runningSum += delta;
            this.yinBuffer[tau] = delta * tau / runningSum;
        }
        
        // Step 4: Absolute threshold
        // Find the first tau where CMND drops below threshold
        let tau = minTau;
        let foundTau = -1;
        
        while (tau < maxTau) {
            if (this.yinBuffer[tau] < this.yinThreshold) {
                // Step 5: Find the local minimum
                while (tau + 1 < maxTau && this.yinBuffer[tau + 1] < this.yinBuffer[tau]) {
                    tau++;
                }
                foundTau = tau;
                break;
            }
            tau++;
        }
        
        // If no pitch found below threshold, find the global minimum
        if (foundTau === -1) {
            let minVal = this.yinBuffer[minTau];
            foundTau = minTau;
            
            for (let i = minTau + 1; i < maxTau; i++) {
                if (this.yinBuffer[i] < minVal) {
                    minVal = this.yinBuffer[i];
                    foundTau = i;
                }
            }
            
            // Reject if minimum is still too high
            if (minVal > 0.5) {
                return { frequency: -1, probability: 0 };
            }
        }
        
        // Step 6: Parabolic interpolation for sub-sample accuracy
        let betterTau = foundTau;
        
        if (foundTau > 0 && foundTau < yinBufferSize - 1) {
            const s0 = this.yinBuffer[foundTau - 1];
            const s1 = this.yinBuffer[foundTau];
            const s2 = this.yinBuffer[foundTau + 1];
            
            // Parabolic interpolation
            const adjustment = (s2 - s0) / (2 * (2 * s1 - s2 - s0));
            
            if (Math.abs(adjustment) < 1) {
                betterTau = foundTau + adjustment;
            }
        }
        
        // Calculate frequency and probability (confidence)
        const frequency = sampleRate / betterTau;
        const probability = 1 - this.yinBuffer[foundTau];
        
        // Additional validation
        if (frequency < this.minFrequency || frequency > this.maxFrequency) {
            return { frequency: -1, probability: 0 };
        }
        
        return { frequency, probability };
    }
    
    /**
     * Apply median filter + exponential smoothing
     */
    applySmoothing(frequency) {
        this.frequencyHistory.push(frequency);
        
        // Keep history limited
        if (this.frequencyHistory.length > this.medianFilterSize) {
            this.frequencyHistory.shift();
        }
        
        // Need enough samples for median filter
        if (this.frequencyHistory.length < 3) {
            this.lastSmoothedFrequency = frequency;
            return frequency;
        }
        
        // Apply median filter
        const sorted = [...this.frequencyHistory].sort((a, b) => a - b);
        const medianIndex = Math.floor(sorted.length / 2);
        const medianFrequency = sorted[medianIndex];
        
        // Apply exponential smoothing with octave error correction
        if (this.lastSmoothedFrequency === 0) {
            this.lastSmoothedFrequency = medianFrequency;
        } else {
            const ratio = medianFrequency / this.lastSmoothedFrequency;
            
            // Only correct exact octave errors
            if (ratio > 1.9 && ratio < 2.1) {
                this.lastSmoothedFrequency = medianFrequency / 2;
            } else if (ratio > 0.47 && ratio < 0.53) {
                this.lastSmoothedFrequency = medianFrequency * 2;
            } else {
                this.lastSmoothedFrequency = this.exponentialAlpha * medianFrequency + 
                                            (1 - this.exponentialAlpha) * this.lastSmoothedFrequency;
            }
        }
        
        return this.lastSmoothedFrequency;
    }
    
    getCurrentPitch() {
        return this.currentPitch;
    }
    
    getCurrentFrequency() {
        return this.currentFrequency;
    }
    
    /**
     * Update thresholds (for calibration UI)
     */
    setThresholds(low, high) {
        this.lowThreshold = low;
        this.highThreshold = high;
    }
}

// Export for use
window.PitchDetector = PitchDetector;
