document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const textInput = document.getElementById('text-input');
    const voiceSelect = document.getElementById('voice-select');
    const convertButton = document.getElementById('convert-button');
    const audioPlayer = document.getElementById('audio-player');
    const downloadButton = document.getElementById('download-button');
    const statusMessage = document.getElementById('status-message');
    const progressContainer = document.querySelector('.progress-container');
    const progressText = document.querySelector('.progress-text');

    // Ensure download button is hidden initially on mobile
    downloadButton.classList.remove('show-mobile');

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
        try {
            convertButton.disabled = true;
            statusMessage.textContent = '';
            progressContainer.style.display = 'block';
            // Hide download button until new audio is generated
            downloadButton.classList.remove('show-mobile');
            const progressFill = document.querySelector('.progress-fill');
            progressFill.style.width = '0%';
            progressText.textContent = '0%';
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress = Math.min(progress + Math.random() * 10, 95);
                progressFill.style.width = progress + '%';
                progressText.textContent = Math.floor(progress) + '%';
            }, 200);

            const voice = voiceSelect.value;
            const text = textInput.value.trim();
            if (!voice) {
                statusMessage.textContent = 'Please select a voice.';
                convertButton.disabled = false;
                clearInterval(progressInterval);
                progressContainer.style.display = 'none';
                return;
            }
            if (!text) {
                statusMessage.textContent = 'Please enter some text.';
                convertButton.disabled = false;
                clearInterval(progressInterval);
                progressContainer.style.display = 'none';
                return;
            }

            // Send text to server for processing
            let headers = { 'Content-Type': 'application/json' };
            let firebaseIdToken = null;
            if (firebaseAuth && firebaseAuth.currentUser) {
                firebaseIdToken = await firebaseAuth.currentUser.getIdToken();
                headers['Authorization'] = 'Bearer ' + firebaseIdToken;
            }
            const response = await fetch('/synthesize', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    text: text,
                    voice: voice
                })
            });
            if (!response.ok) {
                console.log('Response not OK:', response.status, response.statusText);
                
                // Try to get response body for debugging
                try {
                    const responseText = await response.text();
                    console.log('Response body:', responseText);
                    
                    // Parse the JSON response
                    const errorData = JSON.parse(responseText);
                    
                    // Check for 402 Payment Required (either direct 402 or 500 with 402 detail)
                    if (response.status === 402 || (response.status === 500 && errorData.detail && errorData.detail.includes('402:'))) {
                        console.log('Payment Required detected - showing paywall');
                        clearInterval(progressInterval);
                        progressContainer.style.display = 'none';
                        
                        // Extract usage data from the detail string if it's wrapped in 500
                        let paymentErrorDetail;
                        if (response.status === 500 && errorData.detail.includes('402:')) {
                            // Parse the embedded data from the string
                            const match = errorData.detail.match(/402: (.+)/);
                            if (match) {
                                try {
                                    // The server response has the usage data in the error detail
                                    console.log('Raw match from server:', match[1]);
                                    
                                    // Fix the malformed JSON by replacing single quotes with double quotes
                                    let fixedJson = match[1];
                                    
                                    // More robust JSON fixing
                                    fixedJson = fixedJson
                                        .replace(/'/g, '"')                    // Replace single quotes
                                        .replace(/\\"/g, "'")                  // Temporarily replace escaped quotes
                                        .replace(/([a-zA-Z_][a-zA-Z0-9_]*): /g, '"$1": ')  // Add quotes to keys
                                        .replace(/'/g, '"');                   // Convert back to double quotes
                                    
                                    console.log('Attempting to parse:', fixedJson);
                                    paymentErrorDetail = JSON.parse(fixedJson);
                                    console.log('Successfully parsed payment error detail:', paymentErrorDetail);
                                } catch (innerParseError) {
                                    console.error('Failed to parse embedded JSON, using fallback:', innerParseError);
                                    console.log('Original text that failed:', match[1]);
                                    
                                    // Extract numbers manually as fallback
                                    const usedMatch = match[1].match(/used_duration['":\s]*([0-9.]+)/);
                                    const countMatch = match[1].match(/recordings_count['":\s]*([0-9]+)/);
                                    
                                    paymentErrorDetail = {
                                        error: 'usage_limit_exceeded',
                                        message: "You've reached your free usage limit. Please upgrade to continue.",
                                        usage: { 
                                            used_duration: usedMatch ? parseFloat(usedMatch[1]) : 900,
                                            free_duration: 900,
                                            recordings_count: countMatch ? parseInt(countMatch[1]) : 20
                                        }
                                    };
                                    console.log('Fallback payment error detail:', paymentErrorDetail);
                                }
                            }
                        } else {
                            paymentErrorDetail = errorData.detail;
                        }
                        
                        showPaywall(paymentErrorDetail);
                        return;
                    }
                } catch (parseError) {
                    console.error('Error parsing response:', parseError);
                }
                
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            let audioUrl = data.audioUrl;
            if (!audioUrl) {
                throw new Error('No audio URL returned from server.');
            }
            
            // Complete progress bar animation
            clearInterval(progressInterval);
            progressFill.style.width = '100%';
            progressText.textContent = '100%';
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 1000);
            
            // Show audio player
            audioPlayer.src = audioUrl;
            audioPlayer.style.display = 'block';
            statusMessage.textContent = '';
            
            // Set up download button (only visible on mobile via CSS)
            downloadButton.href = audioUrl;
            downloadButton.download = `speech-${Date.now()}.wav`;
            downloadButton.style.display = 'block';
            downloadButton.classList.add('show-mobile');
            
            // Refresh usage display after successful generation
            if (firebaseAuth && firebaseAuth.currentUser) {
                initializeUsageDisplay();
            }
            
            // Check if we should show paywall after generation
            if (data.show_paywall) {
                console.log('Showing post-generation paywall');
                console.log('Usage data from server:', data.usage);
                // Wait a moment for user to see the audio was generated
                setTimeout(() => {
                    const paywallData = {
                        error: 'usage_limit_exceeded',
                        message: data.message || "You've now reached your free usage limit. Upgrade to continue creating more audio.",
                        usage: data.usage
                    };
                    console.log('Paywall data being passed:', paywallData);
                    showPaywall(paywallData);
                }, 2000); // 2 second delay to let user see the audio was created
            }
        } catch (error) {
            console.error('Error converting text to speech:', error);
            statusMessage.textContent = 'Error converting text to speech. Please try again.';
            progressContainer.style.display = 'none';
            // Hide download button on error
            downloadButton.classList.remove('show-mobile');
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
      window.firebaseApp = firebaseApp;
      window.firebaseAuth = firebaseAuth;
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

      // Always attach event handlers for signup/login
      if (signupLink) signupLink.onclick = (e) => { e.preventDefault(); showSignupModal(); };
      if (loginLink) loginLink.onclick = (e) => { e.preventDefault(); showSignupModal(true); };
      if (closeSignupModal) closeSignupModal.onclick = () => { signupModal.style.display = 'none'; resetSignupModal(); };
      window.onclick = (e) => { if (e.target === signupModal) { signupModal.style.display = 'none'; resetSignupModal(); } };
      if (signupCTA) signupCTA.onclick = handleSignup;

      // Accessibility: allow Enter key to trigger sign up
      if (signupEmail) {
        signupEmail.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            signupCTA.click();
          }
        });
      }

      // Accessibility: focus management
      if (signupModal) {
        signupModal.addEventListener('transitionend', function() {
          if (signupModal.style.display === 'flex') {
            signupEmail.focus();
          }
        });
      }
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
      console.log('[updateAuthUI] Called with user:', user);
      if (user) {
        // Hide auth links, show Account
        if (authLinks) authLinks.style.display = 'none';
        if (userInfo) {
          userInfo.style.display = 'inline';
          userInfo.innerHTML = '<a href="#" id="account-link" style="font-weight:bold;">Account</a>';
          attachAccountDropdownHandler();
        }
        setupAccountUI(); // Only for dropdown/modal logic
        // Hide library page if visible
        var libraryPage = document.getElementById('library-page');
        if (libraryPage) libraryPage.style.display = 'none';
        // Hide homepage recordings section if present
        if (recordingsSection) recordingsSection.style.display = 'none';
        
        // Initialize usage display for logged in users
        initializeUsageDisplay();
      } else {
        // Show auth links, hide Account
        if (userInfo) userInfo.style.display = 'none';
        if (authLinks) authLinks.style.display = 'inline';
        // Hide library page if visible
        var libraryPage = document.getElementById('library-page');
        if (libraryPage) libraryPage.style.display = 'none';
        // Hide homepage recordings section if present
        if (recordingsSection) recordingsSection.style.display = 'none';
      }
    }

    // Add Account/Settings UI logic
    let accountModal, accountLink, accountOptions, logoutButton;

    function createAccountDropdown() {
        // Remove any existing modal
        const oldModal = document.getElementById('account-modal');
        if (oldModal) oldModal.remove();
        // Find the Account link position
        const accountLinkEl = document.getElementById('account-link');
        const rect = accountLinkEl.getBoundingClientRect();
        // Create dropdown
        const dropdown = document.createElement('div');
        dropdown.id = 'account-modal';
        dropdown.className = 'modal';
        dropdown.style.display = 'none';
        dropdown.style.position = 'absolute';
        dropdown.style.top = (window.scrollY + rect.bottom + 8) + 'px';
        dropdown.style.left = (window.scrollX + rect.right - 240) + 'px'; // right-align
        dropdown.style.width = '240px';
        dropdown.style.background = '#fff';
        dropdown.style.borderRadius = '10px';
        dropdown.style.boxShadow = '0 4px 24px rgba(0,0,0,0.13)';
        dropdown.style.zIndex = '1000';
        dropdown.style.padding = '1.2em 0 0.5em 0';
        dropdown.innerHTML = `
          <ul id="account-options" style="list-style:none; padding:0 0 0.5em 0; margin:0;">
            <li><a href="/library" id="my-library-link" class="account-link" style="display:block; padding:0.7em 1.5em;">My Library</a></li>
            <li><a href="/terms" class="account-link" style="display:block; padding:0.7em 1.5em;">Terms of Service</a></li>
            <li><a href="/privacy" class="account-link" style="display:block; padding:0.7em 1.5em;">Privacy Policy</a></li>
          </ul>
          <button id="logout-button" class="btn btn-secondary" style="margin:0.5em 1.5em 0.5em 1.5em; width:calc(100% - 3em);">Log Out</button>
        `;
        document.body.appendChild(dropdown);
        accountModal = dropdown;
        accountOptions = dropdown.querySelector('#account-options');
        logoutButton = dropdown.querySelector('#logout-button');
        // Attach My Library link handler here
        const myLibraryLink = dropdown.querySelector('#my-library-link');
        myLibraryLink.setAttribute('href', '/library');
        myLibraryLink.onclick = null;
        // Close dropdown logic
        function closeDropdown(e) {
            if (!dropdown.contains(e.target) && e.target !== accountLinkEl) {
                dropdown.style.display = 'none';
                document.removeEventListener('mousedown', closeDropdown);
            }
        }
        setTimeout(() => {
            document.addEventListener('mousedown', closeDropdown);
        }, 0);
    }

    function showAccountDropdown() {
        createAccountDropdown();
        accountModal.style.display = 'block';
    }

    // Add My Library modal logic
    let libraryModal;

    function createLibraryModal() {
        if (document.getElementById('library-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'library-modal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.background = 'rgba(0,0,0,0.4)';
        modal.style.zIndex = '1001';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.innerHTML = `
          <div class="modal-content" style="background:#fff; padding:2em; border-radius:10px; max-width:500px; margin:auto; position:relative; min-height:300px;">
            <span id="close-library-modal" style="position:absolute; top:10px; right:16px; font-size:1.5em; cursor:pointer;" tabindex="0" aria-label="Close dialog">&times;</span>
            <h2 style="margin-bottom:1.5em;">My Library</h2>
            <ul id="library-list" style="list-style:none; padding:0; margin:0;"></ul>
          </div>
        `;
        document.body.appendChild(modal);
        libraryModal = modal;
        // Close modal logic
        modal.querySelector('#close-library-modal').onclick = () => { modal.style.display = 'none'; };
        window.onclick = (e) => { if (e.target === modal) { modal.style.display = 'none'; } };
    }

    async function showLibraryModal() {
        createLibraryModal();
        libraryModal.style.display = 'flex';
        const list = libraryModal.querySelector('#library-list');
        list.innerHTML = '<li>Loading...</li>';
        try {
            const firebaseIdToken = await firebaseAuth.currentUser.getIdToken();
            const res = await fetch('/recordings', {
                headers: { 'Authorization': 'Bearer ' + firebaseIdToken }
            });
            if (!res.ok) {
                list.innerHTML = '<li>Failed to load recordings.</li>';
                return;
            }
            const recordings = await res.json();
            if (!recordings.length) {
                list.innerHTML = '<li>No recordings yet.</li>';
                return;
            }
            list.innerHTML = '';
            recordings.forEach(rec => {
                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                li.style.justifyContent = 'space-between';
                li.style.padding = '0.7em 0';
                li.style.borderBottom = '1px solid #eee';
                // Info
                const infoDiv = document.createElement('div');
                infoDiv.style.flex = '1';
                infoDiv.innerHTML = `
                  <div style="font-size:0.98em; color:#333;">${formatDateTime(rec.created)}</div>
                  <div style="font-size:0.97em; color:#666;">${rec.voice || ''}</div>
                  <div style="font-size:1.05em; color:#222; margin-top:0.2em;">${truncateText(rec.text, 20)}</div>
                `;
                li.appendChild(infoDiv);
                // Icons
                const iconsDiv = document.createElement('div');
                iconsDiv.style.display = 'flex';
                iconsDiv.style.alignItems = 'center';
                // Play icon (SVG)
                const playBtn = document.createElement('button');
                playBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4a90e2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
                playBtn.style.background = 'none';
                playBtn.style.border = 'none';
                playBtn.style.cursor = 'pointer';
                playBtn.style.marginRight = '0.7em';
                // Kebab icon (SVG)
                const kebabBtn = document.createElement('button');
                kebabBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>`;
                kebabBtn.style.background = 'none';
                kebabBtn.style.border = 'none';
                kebabBtn.style.cursor = 'pointer';
                iconsDiv.appendChild(playBtn);
                iconsDiv.appendChild(kebabBtn);
                li.appendChild(iconsDiv);
                list.appendChild(li);
            });
        } catch (err) {
            list.innerHTML = '<li>Failed to load recordings.</li>';
        }
    }

    function formatDateTime(ts) {
        if (!ts) return '';
        const d = new Date(ts * 1000);
        return d.toLocaleString();
    }
    function truncateText(txt, n) {
        if (!txt) return '';
        return txt.length > n ? txt.slice(0, n) + '…' : txt;
    }

    // Hook up My Library link in Account modal
    function setupAccountUI() {
        // Only handle dropdown/modal logic, not header link injection
        createAccountDropdown();
        // Log Out button logic
        logoutButton.onclick = async () => {
            await firebaseAuth.signOut();
            accountModal.style.display = 'none';
            userInfo.style.display = 'none';
            authLinks.style.display = 'inline';
            recordingsSection.style.display = 'none';
            window.location.href = '/';
        };
        // Remove My Library link handler from here
    }

    let accountDropdownOpen = false;
    let accountDropdown = null;
    let accountDropdownCloseHandler = null;

    function createOrToggleAccountDropdown() {
        const accountLinkEl = document.getElementById('account-link');
        let dropdown = document.getElementById('account-modal');
        if (dropdown && accountDropdownOpen) {
            dropdown.style.display = 'none';
            accountDropdownOpen = false;
            if (accountDropdownCloseHandler) {
                document.removeEventListener('mousedown', accountDropdownCloseHandler);
                accountDropdownCloseHandler = null;
            }
            return;
        }
        if (dropdown) dropdown.remove();
        // Create dropdown
        const rect = accountLinkEl.getBoundingClientRect();
        dropdown = document.createElement('div');
        dropdown.id = 'account-modal';
        dropdown.className = 'modal';
        dropdown.style.display = 'block';
        dropdown.style.position = 'absolute';
        dropdown.style.top = (window.scrollY + rect.bottom + 8) + 'px';
        dropdown.style.left = (window.scrollX + rect.right - 240) + 'px';
        dropdown.style.width = '240px';
        dropdown.style.background = '#fff';
        dropdown.style.borderRadius = '10px';
        dropdown.style.boxShadow = '0 4px 24px rgba(0,0,0,0.13)';
        dropdown.style.zIndex = '1000';
        dropdown.style.padding = '1.2em 0 0.5em 0';
        dropdown.innerHTML = `
          <ul id="account-options" style="list-style:none; padding:0 0 0.5em 0; margin:0;">
            <li><a href="/library" id="my-library-link" class="account-link" style="display:block; padding:0.7em 1.5em;">My Library</a></li>
            <li><a href="/terms" class="account-link" style="display:block; padding:0.7em 1.5em;">Terms of Service</a></li>
            <li><a href="/privacy" class="account-link" style="display:block; padding:0.7em 1.5em;">Privacy Policy</a></li>
          </ul>
          <button id="logout-button" class="btn btn-secondary" style="margin:0.5em 1.5em 0.5em 1.5em; width:calc(100% - 3em);">Log Out</button>
        `;
        document.body.appendChild(dropdown);
        accountDropdownOpen = true;
        accountDropdown = dropdown;
        // Close dropdown if click outside or on Account again
        accountDropdownCloseHandler = function(e) {
            if (!dropdown.contains(e.target) && e.target !== accountLinkEl) {
                dropdown.style.display = 'none';
                accountDropdownOpen = false;
                document.removeEventListener('mousedown', accountDropdownCloseHandler);
                accountDropdownCloseHandler = null;
            }
        };
        setTimeout(() => {
            document.addEventListener('mousedown', accountDropdownCloseHandler);
        }, 0);
        // Close dropdown on link click
        dropdown.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                dropdown.style.display = 'none';
                accountDropdownOpen = false;
                if (accountDropdownCloseHandler) {
                    document.removeEventListener('mousedown', accountDropdownCloseHandler);
                    accountDropdownCloseHandler = null;
                }
            });
        });
        // Log Out button logic
        const logoutButton = dropdown.querySelector('#logout-button');
        if (logoutButton) {
            logoutButton.onclick = async () => {
                if (window.firebase && window.firebase.auth) {
                    await firebaseAuth.signOut();
                }
                dropdown.style.display = 'none';
                accountDropdownOpen = false;
                if (accountDropdownCloseHandler) {
                    document.removeEventListener('mousedown', accountDropdownCloseHandler);
                    accountDropdownCloseHandler = null;
                }
                userInfo.style.display = 'none';
                authLinks.style.display = 'inline';
                window.location.href = '/';
            };
        }
    }
    function attachAccountDropdownHandler() {
        const accountLink = document.getElementById('account-link');
        if (accountLink) {
            accountLink.onclick = (e) => {
                e.preventDefault();
                createOrToggleAccountDropdown();
            };
        }
    }
    // Close dropdown on popstate (back/forward navigation)
    window.addEventListener('popstate', function() {
        const dropdown = document.getElementById('account-modal');
        if (dropdown) {
            dropdown.style.display = 'none';
            accountDropdownOpen = false;
            if (accountDropdownCloseHandler) {
                document.removeEventListener('mousedown', accountDropdownCloseHandler);
                accountDropdownCloseHandler = null;
            }
        }
    });

    // 3. Make My Library a page (not a modal)
    // Remove showLibraryPage, loadLibraryList, and related popstate logic

    // 4. Logo click navigates to home
    const logoLink = document.getElementById('logo-link');
    if (logoLink) {
        logoLink.onclick = (e) => {
            e.preventDefault();
            if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
                window.location.reload();
            } else {
                window.location.href = '/';
            }
        };
    }

    // 5. Nav/header is consistent (handled in index.html)

    // 6. Remove homepage recordings section if present (declare only once)
    if (recordingsSection) {
        recordingsSection.style.display = 'none';
    }

    // Event listeners
    if (typeof convertButton !== 'undefined' && convertButton) {
      convertButton.addEventListener('click', convertToSpeech);
    }
    // Load voices when the page loads
    if (typeof loadVoices === 'function' && typeof voiceSelect !== 'undefined' && voiceSelect) {
      loadVoices();
    }

    // On DOMContentLoaded, initialize everything
    (async function() {
      await loadFirebase();
      setupAuthUI();
      firebaseAuth.onAuthStateChanged(user => {
        firebaseUser = user;
        updateAuthUI(user);
        setTimeout(() => checkSuperuserAndShowDashboardLink(user), 0);
        
        // Check for upgrade URL parameter and show paywall
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('upgrade') === '1' && user) {
          // Get actual usage data and show paywall
          setTimeout(async () => {
            try {
              const firebaseIdToken = await firebaseAuth.currentUser.getIdToken();
              const response = await fetch('/user-usage', {
                headers: { 'Authorization': 'Bearer ' + firebaseIdToken }
              });
              if (response.ok) {
                const data = await response.json();
                showPaywall({
                  error: 'usage_limit_exceeded',
                  message: "You've reached your free usage limit. Please upgrade to continue.",
                  usage: data.usage
                });
              } else {
                // Fallback to example over-limit usage
                showPaywall({
                  error: 'usage_limit_exceeded',
                  message: "You've reached your free usage limit. Please upgrade to continue.",
                  usage: { total_duration: 1200, recordings_count: 20 }
                });
              }
            } catch (error) {
              // Fallback to example over-limit usage
              showPaywall({
                error: 'usage_limit_exceeded',
                message: "You've reached your free usage limit. Please upgrade to continue.",
                usage: { total_duration: 1200, recordings_count: 20 }
              });
            }
          }, 1000);
        }
      });
      await checkMagicLink();
      attachAccountDropdownHandler(); // Call this after auth state is set
    })();

    var aboutLink = document.getElementById('about-link');
    if (aboutLink) {
      aboutLink.href = '/about';
    }
}); 

async function checkSuperuserAndShowDashboardLink(user) {
  console.log('[checkSuperuserAndShowDashboardLink] Called with user:', user);
  if (!user) {
    console.log('[checkSuperuserAndShowDashboardLink] No user, returning');
    return;
  }
  if (!window.firebaseAuth) {
    console.log('[checkSuperuserAndShowDashboardLink] No firebaseAuth, returning');
    return;
  }
  try {
    const firebaseIdToken = await window.firebaseAuth.currentUser.getIdToken();
    const res = await fetch(`/user-info`, {
      headers: { 'Authorization': 'Bearer ' + firebaseIdToken }
    });
    if (!res.ok) {
      console.log('[checkSuperuserAndShowDashboardLink] /user-info not ok:', res.status);
      return;
    }
    const userInfoData = await res.json();
    console.log('[checkSuperuserAndShowDashboardLink] userInfoData:', userInfoData);
    if (userInfoData.superuser) {
      let aboutLink = document.getElementById('about-link');
      if (aboutLink && !document.getElementById('dashboard-link')) {
        const dashLink = document.createElement('a');
        dashLink.href = '/dashboard';
        dashLink.id = 'dashboard-link';
        dashLink.textContent = 'Dashboard';
        dashLink.style.textDecoration = 'none';
        dashLink.style.fontWeight = '500';
        dashLink.style.fontSize = '1.1em';
        dashLink.style.color = '#222';
        dashLink.style.marginLeft = '1.5em';
        // Insert after About link
        if (aboutLink.nextSibling) {
          aboutLink.parentNode.insertBefore(dashLink, aboutLink.nextSibling);
        } else {
          aboutLink.parentNode.appendChild(dashLink);
        }
        console.log('[checkSuperuserAndShowDashboardLink] Dashboard link injected');
      } else {
        console.log('[checkSuperuserAndShowDashboardLink] Dashboard link already present or About link missing');
      }
    } else {
      console.log('[checkSuperuserAndShowDashboardLink] Not a superuser');
    }
  } catch (err) {
    console.error('[checkSuperuserAndShowDashboardLink] Error:', err);
  }
}

// RevenueCat and Paywall functionality
function showPaywall(errorDetails) {
    console.log('showPaywall called with:', errorDetails);
    
    // Remove only the existing paywall modal to prevent conflicts
    const existingPaywall = document.getElementById('paywall-modal');
    if (existingPaywall) {
        existingPaywall.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'paywall-modal';
    modal.className = 'modal';
    modal.style.cssText = `
        display: flex;
        z-index: 2000;
    `;

    const usage = errorDetails.usage || {};
    console.log('Usage object in showPaywall:', usage);
    const usedMinutes = Math.round((usage.total_duration || usage.used_duration || 0) / 60);
    const freeMinutes = Math.round((15 * 60) / 60); // 15 minutes
    console.log('Calculated minutes - used:', usedMinutes, 'free:', freeMinutes);

    // Determine the message based on whether they're over or at the limit
    const isOverLimit = usedMinutes >= freeMinutes;
    const primaryMessage = isOverLimit 
        ? `🎉 Your audio was created successfully! You've now used <strong>${usedMinutes} minutes</strong> of your <strong>${freeMinutes} minutes</strong> of free audio generation.`
        : `You've used <strong>${usedMinutes} minutes</strong> of your <strong>${freeMinutes} minutes</strong> of free audio generation.`;

    modal.innerHTML = `
        <div style="
            background: white;
            padding: 2em;
            border-radius: 12px;
            max-width: 500px;
            margin: 2em;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        ">
            <h2 style="color: #333; margin-bottom: 1em;">🚀 Upgrade to Continue</h2>
            <p style="color: #666; margin-bottom: 1.5em; line-height: 1.5;">
                ${primaryMessage}
            </p>
            <p style="color: #666; margin-bottom: 2em; line-height: 1.5;">
                Upgrade to unlimited audio generation and support the development of BasicTTS!
            </p>
            
            <div style="margin-bottom: 2em;">
                <div id="rc-purchase-button" style="
                    background: #007AFF;
                    color: white;
                    padding: 1em 2em;
                    border-radius: 8px;
                    cursor: pointer;
                    display: inline-block;
                    font-weight: 500;
                    margin: 0.5em;
                ">
                    Upgrade Now - $4.99/month
                </div>
            </div>
            
            <button id="close-paywall" style="
                background: #f0f0f0;
                border: none;
                padding: 0.8em 1.5em;
                border-radius: 6px;
                cursor: pointer;
                color: #666;
            ">
                Maybe Later
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    // Close button functionality
    document.getElementById('close-paywall').onclick = () => {
        modal.remove();
    };

    // Click outside to close functionality
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    };

    // Initialize RevenueCat purchase flow
    initRevenueCatPurchase();
}

async function initRevenueCatPurchase() {
    console.log('initRevenueCatPurchase called');
    
    // Load RevenueCat Web SDK
    if (!window.Purchases) {
        console.log('RevenueCat SDK not loaded, attempting to load...');
        try {
            // Try to import from the installed npm package
            if (typeof importScripts === 'undefined') {
                // We're in a regular browser environment
                await loadRevenueCatSDK();
            }
            console.log('RevenueCat SDK loaded successfully');
        } catch (error) {
            console.error('Failed to load RevenueCat SDK:', error);
            // Fallback to placeholder functionality
            setupPlaceholderPurchase();
            return;
        }
    } else {
        console.log('RevenueCat SDK already loaded');
    }
    
    // Get RevenueCat API key from backend
    let revenueCatApiKey;
    try {
        const response = await fetch('/revenuecat-config');
        const config = await response.json();
        revenueCatApiKey = config.apiKey;
    } catch (error) {
        console.error('Failed to fetch RevenueCat config:', error);
        setupPlaceholderPurchase();
        return;
    }

    if (!revenueCatApiKey) {
        console.error('RevenueCat API key not configured');
        setupPlaceholderPurchase();
        return;
    }

    console.log('Configuring RevenueCat with API key:', revenueCatApiKey);
    
    try {
        // Get user ID or use anonymous
        const appUserId = (firebaseAuth && firebaseAuth.currentUser) 
            ? firebaseAuth.currentUser.uid 
            : null; // null for anonymous users
        
        console.log('Using app user ID:', appUserId || 'anonymous');
        console.log('Purchases object structure:', window.Purchases);
        console.log('Available methods on Purchases:', Object.keys(window.Purchases));
        
        // Initialize RevenueCat - try different API formats
        let purchases;
        if (window.Purchases.Purchases && typeof window.Purchases.Purchases.configure === 'function') {
            // Nested format
            purchases = await window.Purchases.Purchases.configure({
                apiKey: revenueCatApiKey,
                appUserId: appUserId,
                // Force test/sandbox mode
                sandbox: true,
            });
            console.log('RevenueCat configured with nested format (sandbox mode)');
        } else if (typeof window.Purchases.configure === 'function') {
            // Direct format
            purchases = await window.Purchases.configure({
                apiKey: revenueCatApiKey,
                appUserId: appUserId,
                // Force test/sandbox mode
                sandbox: true,
            });
            console.log('RevenueCat configured with direct format (sandbox mode)');
        } else {
            throw new Error('No valid configure method found on Purchases object');
        }
        
        // Store the configured instance
        window.PurchasesInstance = purchases;
        
        setupActualPurchaseFlow();
        console.log('RevenueCat purchase flow set up');
    } catch (error) {
        console.error('Failed to configure RevenueCat:', error);
        setupPlaceholderPurchase();
    }
}

async function loadRevenueCatSDK() {
    console.log('Loading RevenueCat SDK from unpkg CDN...');
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/@revenuecat/purchases-js';
        script.onload = () => {
            console.log('RevenueCat SDK loaded successfully from unpkg');
            
            // The SDK should now be available as a global
            console.log('Checking what Purchases object looks like:', window.Purchases);
            console.log('Purchases keys:', Object.keys(window.Purchases || {}));
            
            if (window.Purchases) {
                resolve();
            } else {
                console.error('RevenueCat SDK loaded but Purchases not available');
                reject(new Error('RevenueCat SDK loaded but Purchases object not found'));
            }
        };
        script.onerror = (error) => {
            console.error('Failed to load RevenueCat SDK from unpkg:', error);
            reject(error);
        };
        document.head.appendChild(script);
    });
}

function setupActualPurchaseFlow() {
    console.log('Setting up actual RevenueCat purchase flow');
    const purchaseButton = document.getElementById('rc-purchase-button');
    if (purchaseButton) {
        purchaseButton.onclick = async () => {
            try {
                // Get available offerings - try different formats
                let offerings;
                if (window.PurchasesInstance && typeof window.PurchasesInstance.getOfferings === 'function') {
                    offerings = await window.PurchasesInstance.getOfferings();
                    console.log('Got offerings from PurchasesInstance');
                } else if (window.Purchases.Purchases && typeof window.Purchases.Purchases.getOfferings === 'function') {
                    offerings = await window.Purchases.Purchases.getOfferings();
                    console.log('Got offerings from nested Purchases');
                } else if (typeof window.Purchases.getOfferings === 'function') {
                    offerings = await window.Purchases.getOfferings();
                    console.log('Got offerings from direct Purchases');
                } else {
                    throw new Error('No valid getOfferings method found');
                }
                
                console.log('Available offerings:', offerings);
                console.log('Offerings.all:', offerings.all);
                console.log('Offerings.current:', offerings.current);
                
                let packageToPurchase = null;
                
                // Try to find the premium_monthly offering
                if (offerings.all && offerings.all['premium_monthly']) {
                    const premiumOffering = offerings.all['premium_monthly'];
                    // Try the monthly property first (RevenueCat standard)
                    packageToPurchase = premiumOffering.monthly;
                }
                // Fallback to current offering
                else if (offerings.current && offerings.current.monthly) {
                    packageToPurchase = offerings.current.monthly;
                }
                // Last resort - any available package
                else if (offerings.current && offerings.current.availablePackages && offerings.current.availablePackages.length > 0) {
                    packageToPurchase = offerings.current.availablePackages[0];
                }
                
                if (packageToPurchase) {
                    console.log('Purchasing package:', packageToPurchase);

                    // Update button text to show processing
                    purchaseButton.textContent = 'Processing...';
                    purchaseButton.style.opacity = '0.7';

                    // Call RevenueCat purchase without specifying target - let it handle the UI
                    const purchaseResult = await window.PurchasesInstance.purchase({
                        rcPackage: packageToPurchase
                    });

                    console.log('Purchase completed:', purchaseResult);

                    // Check if the purchase was successful
                    if (purchaseResult.customerInfo.entitlements.active['premium']) {
                        console.log('Purchase successful!');

                        // Close paywall modal
                        const paywallModal = document.getElementById('paywall-modal');
                        if (paywallModal) paywallModal.remove();

                        // Show success message
                        showPurchaseSuccess();

                        // Refresh user usage status
                        await checkSubscriptionStatus();
                    } else {
                        throw new Error('Purchase completed but entitlement not found');
                    }
                } else {
                    throw new Error('No packages available for purchase');
                }
            } catch (error) {
                console.error('Purchase failed:', error);
                console.error('Error details:', error.message);
                console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

                // Restore the original paywall modal
                showPaywall();

                // Find the button again and reset its state
                const resetButton = document.getElementById('rc-purchase-button');
                if (resetButton) {
                    resetButton.textContent = 'Upgrade Now - $4.99/month';
                    resetButton.style.opacity = '1';
                }

                // Show error message
                if (error.userCancelled || (error.message && error.message.includes('cancelled'))) {
                    console.log('User cancelled purchase');
                } else {
                    alert('Purchase failed. Please try again.');
                }
            }
        };
    }
}

function setupPlaceholderPurchase() {
    console.log('Setting up placeholder purchase flow (RevenueCat failed to load)');
    const purchaseButton = document.getElementById('rc-purchase-button');
    if (purchaseButton) {
        purchaseButton.onclick = () => {
            alert('Subscription functionality coming soon! Please check back later.');
        };
    }
}


function showPurchaseSuccess() {
    // Remove any existing success modal
    const existingSuccess = document.getElementById('purchase-success-modal');
    if (existingSuccess) {
        existingSuccess.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'purchase-success-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0,0,0,0.5);
        z-index: 2001;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box;
        overflow: hidden;
    `;

    modal.innerHTML = `
        <div style="
            background: white;
            padding: 2em;
            border-radius: 12px;
            max-width: 400px;
            margin: 2em;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        ">
            <h2 style="color: #28a745; margin-bottom: 1em;">🎉 Welcome to Premium!</h2>
            <p style="color: #666; margin-bottom: 2em; line-height: 1.5;">
                Your subscription is now active. Enjoy unlimited audio generation!
            </p>
            
            <button id="close-success" style="
                background: #007AFF;
                color: white;
                padding: 0.8em 2em;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 500;
            ">
                Start Creating Audio
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    // Close button functionality
    document.getElementById('close-success').onclick = () => {
        modal.remove();
    };

    // Auto-close after 5 seconds
    setTimeout(() => {
        if (modal.parentNode) {
            modal.remove();
        }
    }, 5000);
}

async function checkSubscriptionStatus() {
    // Check user's subscription status and update UI accordingly
    if (!firebaseAuth || !firebaseAuth.currentUser) {
        return false;
    }

    try {
        const firebaseIdToken = await firebaseAuth.currentUser.getIdToken();
        const response = await fetch('/user-usage', {
            headers: { 'Authorization': 'Bearer ' + firebaseIdToken }
        });

        if (response.ok) {
            const data = await response.json();
            return data.can_generate?.can_generate || false;
        }
    } catch (error) {
        console.error('Error checking subscription status:', error);
    }
    
    return false;
}

// Show usage info to users
async function showUsageInfo() {
    if (!firebaseAuth || !firebaseAuth.currentUser) {
        return;
    }

    try {
        const firebaseIdToken = await firebaseAuth.currentUser.getIdToken();
        const response = await fetch('/user-usage', {
            headers: { 'Authorization': 'Bearer ' + firebaseIdToken }
        });

        if (response.ok) {
            const data = await response.json();
            const usage = data.usage;
            const usedMinutes = Math.round(usage.total_duration / 60);
            const freeMinutes = Math.round(data.limits.free_duration / 60);
            
            console.log(`Usage: ${usedMinutes}/${freeMinutes} minutes used`);
            
            // Optionally show this in the UI
            const statusElement = document.getElementById('usage-status');
            if (statusElement) {
                statusElement.textContent = `${usedMinutes}/${freeMinutes} minutes used`;
            }
            
            // Update usage display in header if it exists
            updateUsageDisplay(data);
        }
    } catch (error) {
        console.error('Error fetching usage info:', error);
    }
}

function updateUsageDisplay(usageData) {
    // Create or update usage display in the header
    const existingUsage = document.getElementById('usage-display');
    if (existingUsage) {
        existingUsage.remove();
    }
    
    if (!firebaseAuth || !firebaseAuth.currentUser) {
        return; // Don't show usage for anonymous users
    }
    
    const usage = usageData.usage;
    const usedMinutes = Math.round(usage.total_duration / 60);
    const freeMinutes = Math.round(usageData.limits.free_duration / 60);
    const canGenerate = usageData.can_generate?.can_generate;
    
    // Find the user info section to add usage display
    const userInfo = document.getElementById('user-info');
    if (userInfo && userInfo.style.display !== 'none') {
        const usageDisplay = document.createElement('span');
        usageDisplay.id = 'usage-display';
        
        // Set content and CSS class based on state
        if (usage.recordings_count === 0) {
            usageDisplay.textContent = 'First file free!';
            usageDisplay.className = 'first-free';
        } else if (canGenerate) {
            usageDisplay.textContent = `${usedMinutes}/${freeMinutes}min used`;
            usageDisplay.className = 'can-generate';
        } else {
            usageDisplay.textContent = 'Upgrade needed';
            usageDisplay.className = 'upgrade-needed';
            // Make upgrade needed clickable
            usageDisplay.onclick = () => {
                showPaywall({
                    error: 'usage_limit_exceeded',
                    message: "You've reached your free usage limit. Please upgrade to continue.",
                    usage: usage
                });
            };
        }
        
        userInfo.appendChild(usageDisplay);
        
        // Add class to body for mobile responsive handling
        document.body.classList.add('has-usage-display');
    }
}

// Call showUsageInfo when user logs in or page loads
function initializeUsageDisplay() {
    if (firebaseAuth && firebaseAuth.currentUser) {
        showUsageInfo();
    }
} 