/**
 * Voice Calibration Logic
 */
document.addEventListener('DOMContentLoaded', () => {
    // Canvas elements
    const spectrogramCanvas = document.getElementById('spectrogramCanvas');
    const waveformCanvas = document.getElementById('waveformCanvas');
    const frequencyCanvas = document.getElementById('frequencyCanvas');
    
    // UI elements
    const pitchMarker = document.getElementById('pitchMarker');
    const currentFrequency = document.getElementById('currentFrequency');
    const currentPitchLabel = document.getElementById('currentPitchLabel');
    const testPaddle = document.getElementById('testPaddle');
    const testSection = document.getElementById('testSection');
    const calibrationModal = document.getElementById('calibrationModal');
    
    // Step elements
    const steps = document.querySelectorAll('.step');
    const progressDots = document.querySelectorAll('.progress-dot');
    
    // Buttons
    const startBtn = document.getElementById('startCalibration');
    const recordHighBtn = document.getElementById('recordHigh');
    const retryHighBtn = document.getElementById('retryHigh');
    const recordLowBtn = document.getElementById('recordLow');
    const retryLowBtn = document.getElementById('retryLow');
    const recalibrateBtn = document.getElementById('recalibrate');
    const testCalibrationBtn = document.getElementById('testCalibration');
    
    // Recording indicators
    const highRecording = document.getElementById('highRecording');
    const lowRecording = document.getElementById('lowRecording');
    const highCountdown = document.getElementById('highCountdown');
    const lowCountdown = document.getElementById('lowCountdown');
    const highValue = document.getElementById('highValue');
    const lowValue = document.getElementById('lowValue');
    
    // Summary
    const summaryHigh = document.getElementById('summaryHigh');
    const summaryLow = document.getElementById('summaryLow');
    
    // State
    let currentStep = 0;
    let visualizer = null;
    let calibrationData = {
        highPitches: [],
        lowPitches: [],
        highThreshold: 280,
        lowThreshold: 180
    };
    let isRecording = false;
    let recordingType = null;
    let recordingTimeout = null;
    
    // Load existing calibration
    loadCalibration();
    
    // Modal functions
    function showModal() {
        calibrationModal.classList.remove('hidden');
    }
    
    function hideModal() {
        calibrationModal.classList.add('hidden');
    }
    
    // Initialize visualizer
    function initVisualizer() {
        visualizer = new AudioVisualizer({
            spectrogramCanvas,
            waveformCanvas,
            frequencyCanvas,
            onPitchDetected: handlePitchDetected
        });
    }
    
    function handlePitchDetected(data) {
        const { frequency, rms } = data;
        
        // Update frequency display
        if (frequency > 0) {
            currentFrequency.textContent = `${Math.round(frequency)} Hz`;
            
            // Update pitch marker position (0-100%)
            const minFreq = 60;
            const maxFreq = 500;
            const position = Math.min(100, Math.max(0, ((frequency - minFreq) / (maxFreq - minFreq)) * 100));
            pitchMarker.style.left = `${position}%`;
            pitchMarker.classList.add('active');
            
            // Determine pitch category based on calibration
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
            
            // Update test paddle if testing
            if (testPaddle && testSection && testSection.style.display !== 'none') {
                updateTestPaddle(pitchCategory);
            }
            
            // Record pitch if recording
            if (isRecording && frequency > 0) {
                if (recordingType === 'high') {
                    calibrationData.highPitches.push(frequency);
                } else if (recordingType === 'low') {
                    calibrationData.lowPitches.push(frequency);
                }
            }
        } else {
            currentFrequency.textContent = '-- Hz';
            currentPitchLabel.textContent = 'SILENT';
            currentPitchLabel.className = 'pitch-state';
            pitchMarker.classList.remove('active');
            
            if (testPaddle && testSection && testSection.style.display !== 'none') {
                updateTestPaddle('OFF');
            }
        }
    }
    
    function updateTestPaddle(pitch) {
        const paddle = testPaddle;
        let targetPosition;
        
        switch (pitch) {
            case 'HIGH':
                targetPosition = 10; // Top
                break;
            case 'LOW':
                targetPosition = 90; // Bottom
                break;
            default:
                targetPosition = 50; // Middle
        }
        
        paddle.style.top = `${targetPosition}%`;
        paddle.className = `paddle-indicator ${pitch.toLowerCase()}`;
    }
    
    // Step navigation
    function goToStep(stepNum) {
        currentStep = stepNum;
        
        steps.forEach((step, index) => {
            step.classList.toggle('active', index === stepNum);
        });
        
        progressDots.forEach((dot, index) => {
            dot.classList.toggle('active', index <= stepNum);
            dot.classList.toggle('completed', index < stepNum);
        });
    }
    
    // Recording functions
    function startRecording(type, duration = 3000) {
        isRecording = true;
        recordingType = type;
        
        const recordingEl = type === 'high' ? highRecording : lowRecording;
        const countdownEl = type === 'high' ? highCountdown : lowCountdown;
        const recordBtn = type === 'high' ? recordHighBtn : recordLowBtn;
        
        // Clear previous data
        if (type === 'high') {
            calibrationData.highPitches = [];
        } else {
            calibrationData.lowPitches = [];
        }
        
        // Hide modal during recording so user can see visualizations
        hideModal();
        
        recordingEl.classList.add('active');
        recordBtn.disabled = true;
        
        // Countdown
        let countdown = 3;
        countdownEl.textContent = countdown;
        
        const countdownInterval = setInterval(() => {
            countdown--;
            countdownEl.textContent = countdown;
            if (countdown <= 0) {
                clearInterval(countdownInterval);
            }
        }, 1000);
        
        // Stop recording after duration
        recordingTimeout = setTimeout(() => {
            stopRecording(type);
        }, duration);
    }
    
    function stopRecording(type) {
        isRecording = false;
        recordingType = null;
        
        const recordingEl = type === 'high' ? highRecording : lowRecording;
        const valueEl = type === 'high' ? highValue : lowValue;
        const recordBtn = type === 'high' ? recordHighBtn : recordLowBtn;
        const retryBtn = type === 'high' ? retryHighBtn : retryLowBtn;
        const pitches = type === 'high' ? calibrationData.highPitches : calibrationData.lowPitches;
        
        recordingEl.classList.remove('active');
        recordBtn.disabled = false;
        
        // Show modal again
        showModal();
        
        if (pitches.length > 0) {
            // Calculate average pitch
            const avgPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;
            valueEl.querySelector('.value').textContent = `${Math.round(avgPitch)} Hz`;
            valueEl.classList.add('recorded');
            
            // Store threshold
            if (type === 'high') {
                calibrationData.highThreshold = Math.round(avgPitch * 0.85); // 85% of high pitch
            } else {
                calibrationData.lowThreshold = Math.round(avgPitch * 1.15); // 115% of low pitch
            }
            
            // Show retry button and next step after delay
            retryBtn.style.display = 'inline-flex';
            recordBtn.style.display = 'none';
            
            setTimeout(() => {
                if (type === 'high') {
                    goToStep(2);
                } else {
                    finishCalibration();
                }
            }, 1000);
        } else {
            valueEl.querySelector('.value').textContent = 'No voice detected';
            valueEl.classList.add('error');
        }
    }
    
    function finishCalibration() {
        // Update summary
        summaryHigh.textContent = `${calibrationData.highThreshold} Hz`;
        summaryLow.textContent = `${calibrationData.lowThreshold} Hz`;
        
        // Save calibration
        saveCalibration();
        
        // Go to final step
        goToStep(3);
    }
    
    function saveCalibration() {
        localStorage.setItem('voiceCalibration', JSON.stringify({
            highThreshold: calibrationData.highThreshold,
            lowThreshold: calibrationData.lowThreshold,
            calibratedAt: new Date().toISOString()
        }));
    }
    
    function loadCalibration() {
        const saved = localStorage.getItem('voiceCalibration');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                calibrationData.highThreshold = data.highThreshold || 280;
                calibrationData.lowThreshold = data.lowThreshold || 180;
            } catch (e) {
                console.error('Failed to load calibration:', e);
            }
        }
    }
    
    function resetCalibration() {
        calibrationData = {
            highPitches: [],
            lowPitches: [],
            highThreshold: 280,
            lowThreshold: 180
        };
        
        // Reset UI
        highValue.classList.remove('recorded', 'error');
        highValue.querySelector('.value').textContent = '-- Hz';
        lowValue.classList.remove('recorded', 'error');
        lowValue.querySelector('.value').textContent = '-- Hz';
        
        retryHighBtn.style.display = 'none';
        retryLowBtn.style.display = 'none';
        recordHighBtn.style.display = 'inline-flex';
        recordLowBtn.style.display = 'inline-flex';
        
        // Hide test section
        if (testSection) testSection.style.display = 'none';
        
        // Show modal
        showModal();
        goToStep(0);
    }
    
    // Event listeners
    startBtn.addEventListener('click', async () => {
        initVisualizer();
        const success = await visualizer.start();
        if (success) {
            goToStep(1);
        } else {
            alert('Failed to access microphone. Please allow microphone access and try again.');
        }
    });
    
    recordHighBtn.addEventListener('click', () => {
        startRecording('high');
    });
    
    retryHighBtn.addEventListener('click', () => {
        highValue.classList.remove('recorded', 'error');
        highValue.querySelector('.value').textContent = '-- Hz';
        retryHighBtn.style.display = 'none';
        recordHighBtn.style.display = 'inline-flex';
        calibrationData.highPitches = [];
    });
    
    recordLowBtn.addEventListener('click', () => {
        startRecording('low');
    });
    
    retryLowBtn.addEventListener('click', () => {
        lowValue.classList.remove('recorded', 'error');
        lowValue.querySelector('.value').textContent = '-- Hz';
        retryLowBtn.style.display = 'none';
        recordLowBtn.style.display = 'inline-flex';
        calibrationData.lowPitches = [];
    });
    
    recalibrateBtn.addEventListener('click', () => {
        resetCalibration();
    });
    
    // Test button - hide modal and show test paddle
    testCalibrationBtn.addEventListener('click', () => {
        hideModal();
        if (testSection) testSection.style.display = 'block';
    });
    
    // Back button - show modal again
    const backToModalBtn = document.getElementById('backToModal');
    if (backToModalBtn) {
        backToModalBtn.addEventListener('click', () => {
            showModal();
            if (testSection) testSection.style.display = 'none';
        });
    }
});

