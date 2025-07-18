document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const textInput = document.getElementById('text-input');
    const voiceSelect = document.getElementById('voice-select');
    const convertButton = document.getElementById('convert-button');
    const audioPlayer = document.getElementById('audio-player');
    const statusMessage = document.getElementById('status-message');
    const progressContainer = document.querySelector('.progress-container');
    const progressText = document.querySelector('.progress-text');

    // Firebase dynamic config and auth logic
    let firebaseApp = null;
    let firebaseAuth = null;
    let firebaseUser = null;
    let firebaseIdToken = null;

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

        // Google Analytics event tracking
        if (typeof gtag === 'function') {
            gtag('event', 'convert_to_speech_click', {
                'event_category': 'TTS',
                'event_label': voice,
                'voice': voice,
                'text_length': text.length
            });
        }
        
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
            const firebaseIdToken = await firebaseAuth.currentUser.getIdToken();
            const response = await fetch('/synthesize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + firebaseIdToken 
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


    async function loadFirebase() {
      // Dynamically load Firebase SDK
      if (!window.firebase) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      // Fetch config
      const res = await fetch('/firebase-config');
      const config = await res.json();
      firebaseApp = firebase.initializeApp(config);
      firebaseAuth = firebase.auth();
    }

    // UI Elements
    let signupModal, signupLink, loginLink, closeSignupModal, signupEmail, signupCTA, signupError, signupConfirmation, authLinks, userInfo, recordingsSection, recordingsList;

    function setupAuthUI() {
      signupModal = document.getElementById('signup-modal');
      signupLink = document.getElementById('signup-link');
      loginLink = document.getElementById('login-link');
      closeSignupModal = document.getElementById('close-signup-modal');
      signupEmail = document.getElementById('signup-email');
      signupCTA = document.getElementById('signup-cta');
      signupError = document.getElementById('signup-error');
      signupConfirmation = document.getElementById('signup-confirmation');
      authLinks = document.getElementById('auth-links');
      userInfo = document.getElementById('user-info');
      recordingsSection = document.getElementById('recordings-section');
      recordingsList = document.getElementById('recordings-list');

      // Show modal
      signupLink.onclick = (e) => { e.preventDefault(); showSignupModal(); };
      loginLink.onclick = (e) => { e.preventDefault(); showSignupModal(true); };
      closeSignupModal.onclick = () => { signupModal.style.display = 'none'; resetSignupModal(); };
      window.onclick = (e) => { if (e.target === signupModal) { signupModal.style.display = 'none'; resetSignupModal(); } };
      signupCTA.onclick = handleSignup;

      // Accessibility: allow Enter key to trigger sign up
      signupEmail.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          signupCTA.click();
        }
      });

      // Accessibility: focus management
      signupModal.addEventListener('transitionend', function() {
        if (signupModal.style.display === 'flex') {
          signupEmail.focus();
        }
      });
    }

    function showSignupModal(isLogin) {
      signupModal.style.display = 'flex';
      signupModal.setAttribute('aria-modal', 'true');
      signupModal.setAttribute('role', 'dialog');
      signupModal.setAttribute('aria-labelledby', 'signup-modal-title');
      signupEmail.setAttribute('aria-label', 'Email Address');
      signupCTA.setAttribute('aria-label', isLogin ? 'Send Magic Link' : 'Create Account');
      signupEmail.value = '';
      signupError.style.display = 'none';
      signupConfirmation.style.display = 'none';
      signupCTA.textContent = isLogin ? 'Send Magic Link' : 'Create Account';
      signupModal.querySelector('h2').id = 'signup-modal-title';
      signupModal.querySelector('h2').textContent = isLogin ? 'Log In' : 'Sign Up';
      setTimeout(() => signupEmail.focus(), 100);
    }
    function resetSignupModal() {
      signupEmail.value = '';
      signupError.style.display = 'none';
      signupConfirmation.style.display = 'none';
    }

    function validateEmail(email) {
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    }

    async function handleSignup() {
      const email = signupEmail.value.trim();
      if (!validateEmail(email)) {
        signupError.textContent = 'Please enter a valid email address.';
        signupError.style.display = 'block';
        return;
      }
      signupError.style.display = 'none';
      signupCTA.disabled = true;
      try {
        let actionUrl;
        if (window.location.hostname === 'basictts.com') {
          actionUrl = 'https://basictts.com';
        } else if (window.location.hostname === 'staging.basictts.com') {
          actionUrl = 'https://staging.basictts.com';
        } else {
          actionUrl = window.location.origin;
        }
        await firebaseAuth.sendSignInLinkToEmail(email, {
          url: actionUrl,
          handleCodeInApp: true
        });
        window.localStorage.setItem('emailForSignIn', email);
        signupConfirmation.style.display = 'block';
        signupCTA.style.display = 'none';
        signupEmail.style.display = 'none';
        signupModal.querySelector('label[for="signup-email"]').style.display = 'none';
      } catch (err) {
        signupError.textContent = err.message || 'Failed to send magic link.';
        signupError.style.display = 'block';
      } finally {
        signupCTA.disabled = false;
      }
    }

    async function checkMagicLink() {
      if (firebaseAuth.isSignInWithEmailLink(window.location.href)) {
        let email = window.localStorage.getItem('emailForSignIn');
        if (!email) {
          email = window.prompt('Please provide your email for confirmation');
        }
        try {
          const result = await firebaseAuth.signInWithEmailLink(email, window.location.href);
          window.localStorage.removeItem('emailForSignIn');
          window.history.replaceState({}, document.title, window.location.pathname);
          return result.user;
        } catch (err) {
          alert('Sign-in failed: ' + (err.message || 'Unknown error'));
        }
      }
      return null;
    }

    function updateAuthUI(user) {
      if (user) {
        authLinks.style.display = 'none';
        userInfo.style.display = 'inline';
        userInfo.innerHTML = `Signed in as <b>${user.email}</b> | <a href="#" id="logout-link">Log Out</a>`;
        document.getElementById('logout-link').onclick = async (e) => {
          e.preventDefault();
          await firebaseAuth.signOut();
          userInfo.style.display = 'none';
          authLinks.style.display = 'inline';
          recordingsSection.style.display = 'none';
        };
        recordingsSection.style.display = 'block';
        loadUserRecordings();
      } else {
        userInfo.style.display = 'none';
        authLinks.style.display = 'inline';
        recordingsSection.style.display = 'none';
      }
    }

    async function loadUserRecordings() {
      recordingsList.innerHTML = '<li>Loading...</li>';
      firebaseIdToken = await firebaseAuth.currentUser.getIdToken();
      const res = await fetch('/recordings', {
        headers: { 'Authorization': 'Bearer ' + firebaseIdToken }
      });
      if (!res.ok) {
        recordingsList.innerHTML = '<li>Failed to load recordings.</li>';
        return;
      }
      const recordings = await res.json();
      if (!recordings.length) {
        recordingsList.innerHTML = '<li>No recordings yet.</li>';
        return;
      }
      recordingsList.innerHTML = '';
      recordings.forEach(rec => {
        const li = document.createElement('li');
        li.textContent = `${rec.voice || ''}: ${rec.text ? rec.text.slice(0, 40) + (rec.text.length > 40 ? '...' : '') : ''}`;
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete';
        delBtn.className = 'btn btn-secondary';
        delBtn.style.marginLeft = '1em';
        delBtn.onclick = async () => {
          if (confirm('Delete this recording?')) {
            await fetch(`/recordings/${rec.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': 'Bearer ' + firebaseIdToken }
            });
            loadUserRecordings();
          }
        };
        li.appendChild(delBtn);
        recordingsList.appendChild(li);
      });
    }

    // Event listeners
    convertButton.addEventListener('click', convertToSpeech);
    
    // Load voices when the page loads
    loadVoices();

    // On DOMContentLoaded, initialize everything
    (async function() {
      await loadFirebase();
      setupAuthUI();
      firebaseAuth.onAuthStateChanged(user => {
        firebaseUser = user;
        updateAuthUI(user);
      });
      await checkMagicLink();
    })();
}); 