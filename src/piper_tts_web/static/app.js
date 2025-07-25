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
        try {
            convertButton.disabled = true;
            statusMessage.textContent = '';
            progressContainer.style.display = 'block';
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
        // After everything is ready, show library if at /library
        if (window.location.pathname === '/library') {
            // This logic is now handled by the library page's JS
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