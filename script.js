const themeToggle = document.getElementById('theme-toggle');
const sunIcon = document.querySelector('.sun-icon');
const moonIcon = document.querySelector('.moon-icon');
const cameraSelect = document.getElementById('camera-select');
const microphoneSelect = document.getElementById('microphone-select');

function setTheme(isDark) {
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
    sunIcon.style.display = isDark ? 'none' : 'block';
    moonIcon.style.display = isDark ? 'block' : 'none';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
    setTheme(savedTheme === 'dark');
}

themeToggle.addEventListener('click', () => {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    setTheme(!isDark);
});

const cameraButton = document.getElementById('camera-button');
const audioButton = document.getElementById('audio-button');
const recordButton = document.getElementById('record-button');
const video = document.getElementById('video');
const waveformCanvas = document.getElementById('waveform');
const recordingsList = document.getElementById('recordings-list');
const errorMessage = document.getElementById('error-message');

let mediaRecorder;
let audioContext;
let analyser;
let dataArray;
let animationId;
let recordings = [];
let videoStream;
let audioStream;

async function getConnectedDevices(type) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === type);
}

async function updateDeviceList() {
    const cameras = await getConnectedDevices('videoinput');
    const microphones = await getConnectedDevices('audioinput');
    
    cameraSelect.innerHTML = '<option value="">Select Camera</option>';
    microphoneSelect.innerHTML = '<option value="">Select Microphone</option>';
    
    cameras.forEach(camera => {
        const option = document.createElement('option');
        option.value = camera.deviceId;
        option.text = camera.label || `Camera ${cameraSelect.length}`;
        cameraSelect.appendChild(option);
    });
    
    microphones.forEach(microphone => {
        const option = document.createElement('option');
        option.value = microphone.deviceId;
        option.text = microphone.label || `Microphone ${microphoneSelect.length}`;
        microphoneSelect.appendChild(option);
    });
    
    cameraSelect.style.display = cameras.length > 1 ? 'block' : 'none';
    microphoneSelect.style.display = microphones.length > 1 ? 'block' : 'none';
}

cameraButton.addEventListener('click', async () => {
    if (!videoStream) {
        try {
            const constraints = {
                video: cameraSelect.value ? { deviceId: { exact: cameraSelect.value } } : true
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            videoStream = stream;
            cameraButton.textContent = 'Disable Camera';
            errorMessage.textContent = '';
            await updateDeviceList();
            cameraSelect.value = stream.getVideoTracks()[0].getSettings().deviceId;
        } catch (error) {
            errorMessage.textContent = `Error accessing camera: ${error.message}`;
        }
    } else {
        videoStream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        videoStream = null;
        cameraButton.textContent = 'Enable Camera';
    }
    updateButtonState(cameraButton, videoStream !== null);
});

audioButton.addEventListener('click', async () => {
    if (!audioStream) {
        try {
            const constraints = {
                audio: microphoneSelect.value ? { deviceId: { exact: microphoneSelect.value } } : true
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            audioStream = stream;
            audioContext = new AudioContext();
            analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 2048;
            dataArray = new Uint8Array(analyser.frequencyBinCount);

            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = handleDataAvailable;
            mediaRecorder.onstop = handleStop;

            audioButton.textContent = 'Disable Microphone';
            recordButton.disabled = false;
            errorMessage.textContent = '';
            
            await updateDeviceList();
            microphoneSelect.value = stream.getAudioTracks()[0].getSettings().deviceId;
            
            drawWaveform();
        } catch (error) {
            errorMessage.textContent = `Error accessing microphone: ${error.message}`;
        }
    } else {
        audioStream.getTracks().forEach(track => track.stop());
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        if (audioContext) {
            audioContext.close();
        }
        const ctx = waveformCanvas.getContext('2d');
        ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
        
        audioStream = null;
        audioContext = null;
        analyser = null;
        mediaRecorder = null;

        audioButton.textContent = 'Enable Microphone';
        recordButton.disabled = true;
        recordButton.textContent = 'Start Recording';
    }
    updateButtonState(audioButton, audioStream !== null);
});

recordButton.addEventListener('click', () => {
    if (!audioStream) {
        errorMessage.textContent = 'Microphone access is required for recording';
        return;
    }
    
    if (mediaRecorder.state === 'inactive') {
        chunks = [];
        mediaRecorder.start();
        recordButton.textContent = 'Stop Recording';
    } else {
        mediaRecorder.stop();
        recordButton.textContent = 'Start Recording';
    }
});

function handleDataAvailable(event) {
    chunks.push(event.data);
}

function handleStop() {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const recording = {
        url: url,
        timestamp: new Date().toLocaleString()
    };
    recordings.push(recording);
    updateRecordingsList();
}

function updateRecordingsList() {
    recordingsList.innerHTML = '';
    recordings.forEach((recording, index) => {
        const li = document.createElement('li');
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = recording.url;
        
        const label = document.createElement('div');
        label.textContent = `Recording ${index + 1} - ${recording.timestamp}`;
        
        li.appendChild(label);
        li.appendChild(audio);
        recordingsList.appendChild(li);
    });
}

function drawWaveform() {
    const ctx = waveformCanvas.getContext('2d');
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;
    
    function draw() {
        animationId = requestAnimationFrame(draw);
        
        analyser.getByteTimeDomainData(dataArray);
        
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-color');
        ctx.fillRect(0, 0, width, height);
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--waveform-color');
        ctx.beginPath();
        
        const sliceWidth = width / dataArray.length;
        let x = 0;
        
        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * height / 2;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        ctx.lineTo(width, height / 2);
        ctx.stroke();
    }
    
    draw();
}

function resizeCanvas() {
    waveformCanvas.width = waveformCanvas.offsetWidth;
    waveformCanvas.height = waveformCanvas.offsetHeight;
}

function updateButtonState(button, enabled) {
    button.classList.toggle('enabled', enabled);
    if (enabled) {
        button.style.backgroundColor = '#dc3545';
    } else {
        button.style.backgroundColor = '';
    }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

cameraSelect.addEventListener('change', async () => {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        const constraints = {
            video: { deviceId: { exact: cameraSelect.value } }
        };
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            videoStream = stream;
        } catch (error) {
            errorMessage.textContent = `Error switching camera: ${error.message}`;
        }
    }
});

microphoneSelect.addEventListener('change', async () => {
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        const constraints = {
            audio: { deviceId: { exact: microphoneSelect.value } }
        };
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            audioStream = stream;
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = handleDataAvailable;
            mediaRecorder.onstop = handleStop;
        } catch (error) {
            errorMessage.textContent = `Error switching microphone: ${error.message}`;
        }
    }
});

navigator.mediaDevices.addEventListener('devicechange', updateDeviceList);
updateDeviceList();