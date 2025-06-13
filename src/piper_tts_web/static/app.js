document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const textInput = document.getElementById('text-input');
    const voiceSelect = document.getElementById('voice-select');
    const convertButton = document.getElementById('convert-button');
    const audioPlayer = document.getElementById('audio-player');
    const statusMessage = document.getElementById('status-message');
    const progressContainer = document.querySelector('.progress-container');
    const progressText = document.querySelector('.progress-text');

    // Load available voices from the server
    async function loadVoices() {
        try {
            statusMessage.textContent = 'Loading voices...';
            const response = await fetch('/voices');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const voices = await response.json();
            
            if (!voices || voices.length === 0) {
                statusMessage.textContent = 'No voices found. Please check server logs.';
                return;
            }
            
            // Clear and populate voice dropdown
            voiceSelect.innerHTML = '';
            voices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.name;
                // Format display name for better readability
                const displayName = voice.name
                    .replace(/_/g, ' ')
                    .replace(/-/g, ' - ')
                    .replace(/\b\w/g, l => l.toUpperCase());
                const languageCode = voice.language.replace('_', '-').toUpperCase();
                option.textContent = `${displayName} (${languageCode})`;
                voiceSelect.appendChild(option);
            });
            
            convertButton.disabled = false;
            statusMessage.textContent = '';
        } catch (error) {
            console.error('Error loading voices:', error);
            statusMessage.textContent = 'Error loading voices. Please check server logs.';
        }
    }

    // Convert text to speech using the selected voice
    async function convertToSpeech() {
        const text = textInput.value.trim();
        const voice = voiceSelect.value;
        
        if (!text) {
            statusMessage.textContent = 'Please enter some text to convert.';
            return;
        }
        
        if (!voice) {
            statusMessage.textContent = 'Please select a voice.';
            return;
        }
        
        try {
            statusMessage.textContent = 'Converting text to speech...';
            convertButton.disabled = true;
            
            // Initialize progress bar
            progressContainer.style.display = 'block';
            const progressFill = document.querySelector('.progress-fill');
            progressFill.style.width = '0%';
            progressText.textContent = '0%';
            
            // Add pauses at line breaks for more natural speech
            const processedText = text.split('\n').map(line => {
                // Add extra spaces for empty lines to create longer pauses
                if (line.trim() === '') {
                    return '   ';
                }
                return line;
            }).join(' ');
            
            // Animate progress bar while processing
            let progress = 0;
            const progressInterval = setInterval(() => {
                if (progress < 50) {
                    progress += 0.2;
                    progressFill.style.width = progress + '%';
                    progressText.textContent = Math.round(progress) + '%';
                }
            }, 100);
            
            // Send text to server for processing
            const response = await fetch('/synthesize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: processedText,
                    voice: voice
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            
            // Complete progress bar animation
            clearInterval(progressInterval);
            progressFill.style.width = '100%';
            progressText.textContent = '100%';
            
            // Hide progress bar after a short delay
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 1000);
            
            // Play the generated audio
            audioPlayer.src = audioUrl;
            audioPlayer.style.display = 'block';
            statusMessage.textContent = '';
        } catch (error) {
            console.error('Error converting text to speech:', error);
            statusMessage.textContent = 'Error converting text to speech. Please try again.';
            progressContainer.style.display = 'none';
        } finally {
            convertButton.disabled = false;
        }
    }

    // Event listeners
    convertButton.addEventListener('click', convertToSpeech);
    
    // Load voices when the page loads
    loadVoices();
}); 