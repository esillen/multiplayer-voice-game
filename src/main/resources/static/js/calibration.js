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
    let currentPitchState = 'OFF';
    
    // Drag state
    let draggedMarker = null;
    let dragType = null;
    let activeTouchId = null;
    
    // Test paddle state (like game paddle)
    const TRACK_HEIGHT = 300; // matches CSS
    const PADDLE_HEIGHT = 60; // matches CSS
    const PADDLE_SPEED = 4;   // pixels per frame (similar to game)
    let paddleY = TRACK_HEIGHT / 2; // center position
    let animationRunning = false;
    
    // Load saved calibration
    loadCalibration();
    updateThresholdDisplay();
    updateThresholdPositions();
    
    // Initialize visualizer and start immediately
    initVisualizer();
    
    // Start paddle animation loop
    startPaddleAnimation();
    
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
        // Store current pitch state for animation loop
        currentPitchState = pitch;
        
        // Update paddle color based on pitch
        testPaddle.className = `test-paddle ${pitch.toLowerCase()}`;
    }
    
    function startPaddleAnimation() {
        if (animationRunning) return;
        animationRunning = true;
        
        function animatePaddle() {
            if (!animationRunning) return;
            
            // Calculate direction based on pitch
            let direction = 0;
            if (currentPitchState === 'HIGH') direction = -1; // Move up
            else if (currentPitchState === 'LOW') direction = 1; // Move down
            
            // Update paddle position
            paddleY += direction * PADDLE_SPEED;
            
            // Clamp to track bounds
            const minY = PADDLE_HEIGHT / 2;
            const maxY = TRACK_HEIGHT - PADDLE_HEIGHT / 2;
            paddleY = Math.max(minY, Math.min(maxY, paddleY));
            
            // Convert to percentage for CSS
            const percentage = (paddleY / TRACK_HEIGHT) * 100;
            testPaddle.style.top = `${percentage}%`;
            
            requestAnimationFrame(animatePaddle);
        }
        
        animatePaddle();
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
    // draggedMarker, dragType, and activeTouchId are already declared above
    
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
    
    // ============================================
    // ADVANCED SETTINGS
    // ============================================
    
    const advancedToggle = document.getElementById('advancedToggle');
    const advancedPanel = document.getElementById('advancedPanel');
    const resetAdvancedBtn = document.getElementById('resetAdvanced');
    const saveAdvancedBtn = document.getElementById('saveAdvanced');
    
    // Default advanced settings
    const DEFAULT_ADVANCED = {
        yinThreshold: 0.15,
        probabilityThreshold: 0.70,
        volumeThreshold: 0.015,
        minFrequency: 70,
        maxFrequency: 500,
        smoothingAlpha: 0.50,
        medianFilterSize: 5,
        stabilityFrames: 1
    };
    
    let advancedSettings = { ...DEFAULT_ADVANCED };
    
    // Advanced setting elements
    const advancedInputs = {
        yinThreshold: document.getElementById('yinThreshold'),
        probabilityThreshold: document.getElementById('probabilityThreshold'),
        volumeThreshold: document.getElementById('volumeThreshold'),
        minFrequency: document.getElementById('minFrequency'),
        maxFrequency: document.getElementById('maxFrequency'),
        smoothingAlpha: document.getElementById('smoothingAlpha'),
        medianFilterSize: document.getElementById('medianFilterSize'),
        stabilityFrames: document.getElementById('stabilityFrames')
    };
    
    const advancedValues = {
        yinThreshold: document.getElementById('yinThresholdVal'),
        probabilityThreshold: document.getElementById('probabilityThresholdVal'),
        volumeThreshold: document.getElementById('volumeThresholdVal'),
        minFrequency: document.getElementById('minFrequencyVal'),
        maxFrequency: document.getElementById('maxFrequencyVal'),
        smoothingAlpha: document.getElementById('smoothingAlphaVal'),
        medianFilterSize: document.getElementById('medianFilterSizeVal'),
        stabilityFrames: document.getElementById('stabilityFramesVal')
    };
    
    // Toggle advanced panel
    advancedToggle.addEventListener('click', () => {
        advancedToggle.classList.toggle('open');
        advancedPanel.classList.toggle('open');
    });
    
    // Load advanced settings
    function loadAdvancedSettings() {
        try {
            const saved = localStorage.getItem('voiceAdvancedSettings');
            if (saved) {
                const data = JSON.parse(saved);
                advancedSettings = { ...DEFAULT_ADVANCED, ...data };
            }
        } catch (e) {
            console.error('Failed to load advanced settings:', e);
        }
        
        // Update UI
        updateAdvancedUI();
    }
    
    // Save advanced settings
    function saveAdvancedSettings() {
        localStorage.setItem('voiceAdvancedSettings', JSON.stringify(advancedSettings));
        applyAdvancedSettings();
        console.log('Advanced settings saved:', advancedSettings);
    }
    
    // Update UI from settings
    function updateAdvancedUI() {
        for (const [key, input] of Object.entries(advancedInputs)) {
            if (input && advancedSettings[key] !== undefined) {
                input.value = advancedSettings[key];
                if (advancedValues[key]) {
                    advancedValues[key].textContent = formatSettingValue(key, advancedSettings[key]);
                }
            }
        }
    }
    
    // Format display values
    function formatSettingValue(key, value) {
        if (key === 'minFrequency' || key === 'maxFrequency') {
            return Math.round(value);
        }
        if (key === 'medianFilterSize' || key === 'stabilityFrames' || key === 'jumpConfirmFrames') {
            return Math.round(value);
        }
        return value.toFixed(2);
    }
    
    // Apply settings to visualizer
    function applyAdvancedSettings() {
        if (!visualizer) return;
        
        // Apply all settings to the visualizer
        visualizer.yinThreshold = advancedSettings.yinThreshold;
        visualizer.probabilityThreshold = advancedSettings.probabilityThreshold;
        visualizer.volumeThreshold = advancedSettings.volumeThreshold;
        visualizer.minFrequency = advancedSettings.minFrequency;
        visualizer.maxFrequency = advancedSettings.maxFrequency;
        visualizer.exponentialAlpha = advancedSettings.smoothingAlpha;
        visualizer.medianFilterSize = advancedSettings.medianFilterSize;
        
        // Clear history when settings change to avoid stale data
        visualizer.frequencyHistory = [];
        visualizer.lastSmoothedFrequency = 0;
        
        console.log('Applied advanced settings to visualizer');
    }
    
    // Set up slider event listeners
    for (const [key, input] of Object.entries(advancedInputs)) {
        if (input) {
            input.addEventListener('input', () => {
                const value = parseFloat(input.value);
                advancedSettings[key] = value;
                if (advancedValues[key]) {
                    advancedValues[key].textContent = formatSettingValue(key, value);
                }
            });
        }
    }
    
    // Reset advanced settings
    resetAdvancedBtn.addEventListener('click', () => {
        advancedSettings = { ...DEFAULT_ADVANCED };
        updateAdvancedUI();
        saveAdvancedSettings();
    });
    
    // Save button
    saveAdvancedBtn.addEventListener('click', () => {
        saveAdvancedSettings();
        
        // Visual feedback
        saveAdvancedBtn.querySelector('span').textContent = 'Saved!';
        setTimeout(() => {
            saveAdvancedBtn.querySelector('span').textContent = 'Save Settings';
        }, 1500);
    });
    
    // Initialize advanced settings
    loadAdvancedSettings();
    
    // Apply settings once visualizer is ready
    const applyOnceReady = setInterval(() => {
        if (visualizer && visualizer.isRunning) {
            applyAdvancedSettings();
            clearInterval(applyOnceReady);
        }
    }, 100);
});
