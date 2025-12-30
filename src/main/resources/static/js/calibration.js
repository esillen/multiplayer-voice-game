/**
 * Voice Calibration - Interactive Mode
 * Allows calibrating high/low notes and dragging threshold markers
 */
document.addEventListener('DOMContentLoaded', () => {
    // Canvas elements
    const spectrogramCanvas = document.getElementById('spectrogramCanvas');
    const waveformCanvas = document.getElementById('waveformCanvas');
    const frequencyCanvas = document.getElementById('frequencyCanvas');
    
    // Pitch meter elements
    const pitchMeterBar = document.getElementById('pitchMeterBar');
    const pitchMarker = document.getElementById('pitchMarker');
    const highThresholdEl = document.getElementById('highThreshold');
    const lowThresholdEl = document.getElementById('lowThreshold');
    const lowZoneFill = document.getElementById('lowZoneFill');
    const highZoneFill = document.getElementById('highZoneFill');
    
    // Display elements
    const currentFrequency = document.getElementById('currentFrequency');
    const currentPitchLabel = document.getElementById('currentPitchLabel');
    const lowThresholdValue = document.getElementById('lowThresholdValue');
    const highThresholdValue = document.getElementById('highThresholdValue');
    const lowValue = document.getElementById('lowValue');
    const highValue = document.getElementById('highValue');
    const testPaddle = document.getElementById('testPaddle');
    
    // Buttons
    const calibrateLowBtn = document.getElementById('calibrateLow');
    const calibrateHighBtn = document.getElementById('calibrateHigh');
    const resetBtn = document.getElementById('resetCalibration');
    
    // Recording rings
    const lowRecordingRing = document.getElementById('lowRecordingRing');
    const highRecordingRing = document.getElementById('highRecordingRing');
    
    // Constants
    const MIN_FREQ = 60;
    const MAX_FREQ = 500;
    const DEFAULT_LOW = 180;
    const DEFAULT_HIGH = 280;
    
    // State
    let visualizer = null;
    let calibrationData = {
        lowThreshold: DEFAULT_LOW,
        highThreshold: DEFAULT_HIGH
    };
    let isRecording = false;
    let recordingType = null;
    let recordedPitches = [];
    let currentFreq = 0;
    
    // Load saved calibration
    loadCalibration();
    updateThresholdDisplay();
    updateThresholdPositions();
    
    // Initialize visualizer and start immediately
    initVisualizer();
    
    async function initVisualizer() {
        visualizer = new AudioVisualizer({
            spectrogramCanvas,
            waveformCanvas,
            frequencyCanvas,
            onPitchDetected: handlePitchDetected
        });
        
        const success = await visualizer.start();
        if (!success) {
            alert('Failed to access microphone. Please allow microphone access and reload.');
        }
    }
    
    function handlePitchDetected(data) {
        const { frequency, rms, probability } = data;
        currentFreq = frequency;
        
        if (frequency > 0) {
            // Show frequency with confidence indicator
            const confidenceStr = probability ? ` (${Math.round(probability * 100)}%)` : '';
            currentFrequency.textContent = `${Math.round(frequency)} Hz${confidenceStr}`;
            
            // Update pitch marker position
            const position = freqToPercent(frequency);
            pitchMarker.style.left = `${position}%`;
            pitchMarker.classList.add('active');
            
            // Determine pitch category
            let pitchCategory;
            if (frequency >= calibrationData.highThreshold) {
                pitchCategory = 'HIGH';
                currentPitchLabel.className = 'pitch-state high';
            } else if (frequency <= calibrationData.lowThreshold) {
                pitchCategory = 'LOW';
                currentPitchLabel.className = 'pitch-state low';
            } else {
                pitchCategory = 'MEDIUM';
                currentPitchLabel.className = 'pitch-state medium';
            }
            currentPitchLabel.textContent = pitchCategory;
            
            // Update test paddle
            updateTestPaddle(pitchCategory);
            
            // Record pitch if calibrating (only record high-confidence readings)
            if (isRecording && frequency > 0 && (!probability || probability > 0.6)) {
                recordedPitches.push(frequency);
            }
        } else {
            currentFrequency.textContent = '-- Hz';
            currentPitchLabel.textContent = 'SILENT';
            currentPitchLabel.className = 'pitch-state';
            pitchMarker.classList.remove('active');
            updateTestPaddle('OFF');
        }
    }
    
    function updateTestPaddle(pitch) {
        let position;
        switch (pitch) {
            case 'HIGH': position = 90; break;
            case 'LOW': position = 10; break;
            default: position = 50;
        }
        testPaddle.style.left = `${position}%`;
        testPaddle.className = `paddle-indicator ${pitch.toLowerCase()}`;
    }
    
    // Frequency to percentage conversion
    function freqToPercent(freq) {
        return Math.min(100, Math.max(0, ((freq - MIN_FREQ) / (MAX_FREQ - MIN_FREQ)) * 100));
    }
    
    function percentToFreq(percent) {
        return MIN_FREQ + (percent / 100) * (MAX_FREQ - MIN_FREQ);
    }
    
    // Update threshold marker positions
    function updateThresholdPositions() {
        const lowPos = freqToPercent(calibrationData.lowThreshold);
        const highPos = freqToPercent(calibrationData.highThreshold);
        
        lowThresholdEl.style.left = `${lowPos}%`;
        highThresholdEl.style.left = `${highPos}%`;
        
        // Update zone fills
        lowZoneFill.style.width = `${lowPos}%`;
        highZoneFill.style.left = `${highPos}%`;
        highZoneFill.style.width = `${100 - highPos}%`;
    }
    
    function updateThresholdDisplay() {
        lowThresholdValue.textContent = `${Math.round(calibrationData.lowThreshold)} Hz`;
        highThresholdValue.textContent = `${Math.round(calibrationData.highThreshold)} Hz`;
        lowValue.textContent = `${Math.round(calibrationData.lowThreshold)} Hz`;
        highValue.textContent = `${Math.round(calibrationData.highThreshold)} Hz`;
    }
    
    // Calibration recording
    function startRecording(type) {
        if (isRecording) return;
        
        isRecording = true;
        recordingType = type;
        recordedPitches = [];
        
        const btn = type === 'low' ? calibrateLowBtn : calibrateHighBtn;
        const ring = type === 'low' ? lowRecordingRing : highRecordingRing;
        
        btn.classList.add('recording');
        ring.classList.add('active');
        
        // Record for 2 seconds
        setTimeout(() => {
            stopRecording(type);
        }, 2000);
    }
    
    function stopRecording(type) {
        isRecording = false;
        
        const btn = type === 'low' ? calibrateLowBtn : calibrateHighBtn;
        const ring = type === 'low' ? lowRecordingRing : highRecordingRing;
        
        btn.classList.remove('recording');
        ring.classList.remove('active');
        
        if (recordedPitches.length >= 3) {
            // Use median instead of average for robustness against outliers
            const sorted = [...recordedPitches].sort((a, b) => a - b);
            
            // Remove top and bottom 10% as outliers
            const trimAmount = Math.floor(sorted.length * 0.1);
            const trimmed = sorted.slice(trimAmount, sorted.length - trimAmount);
            
            // Get median of trimmed data
            const medianPitch = trimmed.length > 0 
                ? trimmed[Math.floor(trimmed.length / 2)]
                : sorted[Math.floor(sorted.length / 2)];
            
            console.log(`Calibration ${type}: recorded ${recordedPitches.length} samples, median: ${medianPitch.toFixed(1)} Hz`);
            
            if (type === 'low') {
                // Set low threshold above the recorded low pitch (with some margin)
                calibrationData.lowThreshold = Math.round(medianPitch * 1.1);
            } else {
                // Set high threshold below the recorded high pitch (with some margin)
                calibrationData.highThreshold = Math.round(medianPitch * 0.9);
            }
            
            // Ensure minimum gap between thresholds
            const minGap = 40;
            if (calibrationData.highThreshold - calibrationData.lowThreshold < minGap) {
                const mid = (calibrationData.lowThreshold + calibrationData.highThreshold) / 2;
                calibrationData.lowThreshold = Math.round(mid - minGap / 2);
                calibrationData.highThreshold = Math.round(mid + minGap / 2);
            }
            
            updateThresholdDisplay();
            updateThresholdPositions();
            saveCalibration();
        } else {
            console.warn(`Calibration ${type}: not enough samples (${recordedPitches.length})`);
        }
        
        recordingType = null;
    }
    
    // Button event listeners
    calibrateLowBtn.addEventListener('click', () => startRecording('low'));
    calibrateHighBtn.addEventListener('click', () => startRecording('high'));
    
    resetBtn.addEventListener('click', () => {
        calibrationData.lowThreshold = DEFAULT_LOW;
        calibrationData.highThreshold = DEFAULT_HIGH;
        updateThresholdDisplay();
        updateThresholdPositions();
        saveCalibration();
    });
    
    // Drag and drop for threshold markers
    let draggedMarker = null;
    let dragType = null;
    
    function handleDragStart(e, type) {
        draggedMarker = e.target.closest('.threshold-marker');
        dragType = type;
        draggedMarker.classList.add('dragging');
        
        // For touch events
        if (e.type === 'touchstart') {
            e.preventDefault();
        }
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
            // Don't allow low to exceed high
            if (freq < calibrationData.highThreshold - 20) {
                calibrationData.lowThreshold = Math.round(freq);
            }
        } else {
            // Don't allow high to go below low
            if (freq > calibrationData.lowThreshold + 20) {
                calibrationData.highThreshold = Math.round(freq);
            }
        }
        
        updateThresholdDisplay();
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
    
    // Storage functions
    function saveCalibration() {
        localStorage.setItem('voiceCalibration', JSON.stringify({
            lowThreshold: calibrationData.lowThreshold,
            highThreshold: calibrationData.highThreshold,
            calibratedAt: new Date().toISOString()
        }));
    }
    
    function loadCalibration() {
        try {
            const saved = localStorage.getItem('voiceCalibration');
            if (saved) {
                const data = JSON.parse(saved);
                calibrationData.lowThreshold = data.lowThreshold || DEFAULT_LOW;
                calibrationData.highThreshold = data.highThreshold || DEFAULT_HIGH;
            }
        } catch (e) {
            console.error('Failed to load calibration:', e);
        }
    }
});
