// Superuser Dashboard logic

const dashboardList = document.getElementById('dashboard-list');

let currentPage = 1;
let totalPages = 1;
let currentSearch = '';
let currentVoiceFilter = '';
let currentUserFilter = '';
let currentDurationFilter = '';

let firebaseApp = null;
let firebaseAuth = null;

// Modal navigation state
let currentRecordings = [];
let currentRecordingIndex = -1;

function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}
function truncateText(txt, n) {
  if (!txt) return '';
  return txt.length > n ? txt.slice(0, n) + '…' : txt;
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function loadFirebase() {
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
  const res = await fetch('/firebase-config');
  const config = await res.json();
  firebaseApp = firebase.initializeApp(config);
  firebaseAuth = firebase.auth();
}

async function loadDashboardList(page = 1) {
  dashboardList.innerHTML = '<li>Loading...</li>';
  try {
    const firebaseIdToken = await firebaseAuth.currentUser.getIdToken();
    
    // Build query parameters
    const params = new URLSearchParams({
      page: page.toString(),
      limit: '50'
    });
    
    if (currentSearch) params.append('search', currentSearch);
    if (currentVoiceFilter) params.append('voice', currentVoiceFilter);
    if (currentUserFilter) params.append('user_email', currentUserFilter);
    if (currentDurationFilter) params.append('duration', currentDurationFilter);
    
    const res = await fetch(`/dashboard-recordings?${params.toString()}`, {
      headers: { 'Authorization': 'Bearer ' + firebaseIdToken }
    });
    if (!res.ok) {
      dashboardList.innerHTML = '<li>Access denied or failed to load recordings.</li>';
      return;
    }
    const data = await res.json();
    const recordings = data.recordings;
    const pagination = data.pagination;
    
    currentPage = pagination.page;
    totalPages = pagination.total_pages;
    
    // Store recordings for modal navigation
    currentRecordings = recordings;
    
    if (!recordings.length) {
      dashboardList.innerHTML = '<li>No recordings found.</li>';
      updatePaginationControls();
      return;
    }
    dashboardList.innerHTML = '';
    recordings.forEach((rec, index) => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.justifyContent = 'space-between';
      li.style.padding = '0.7em 0';
      li.style.borderBottom = '1px solid #eee';
      // Info
      const infoDiv = document.createElement('div');
      infoDiv.style.flex = '1';
      // Use blobCreated if created is missing
      const dateStr = rec.created ? formatDateTime(rec.created) : (rec.blobCreated ? formatDateTime(rec.blobCreated) : '');
      // Use blobName if text is missing
      const textStr = rec.text ? truncateText(rec.text, 20) : (rec.blobName ? rec.blobName : '(no text)');
      // Show (anonymous) if no user_email
      const userStr = rec.user_email ? 'User: ' + rec.user_email : '(anonymous)';
      const durationStr = rec.duration ? formatDuration(rec.duration) : '';
      infoDiv.innerHTML = `
        <div style="font-size:0.98em; color:#333;">${dateStr}${durationStr ? ' • ' + durationStr : ''}</div>
        <div style="font-size:0.97em; color:#666;">${rec.voice || ''}</div>
        <div style="font-size:1.05em; color:#222; margin-top:0.2em;">${textStr}</div>
        <div style="font-size:0.97em; color:#4a90e2; margin-top:0.2em;">${userStr}</div>
      `;
      li.appendChild(infoDiv);
      // Play icon (SVG)
      const iconsDiv = document.createElement('div');
      iconsDiv.style.display = 'flex';
      iconsDiv.style.alignItems = 'center';
      const playBtn = document.createElement('button');
      playBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4a90e2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      playBtn.style.background = 'none';
      playBtn.style.border = 'none';
      playBtn.style.cursor = 'pointer';
      playBtn.style.marginRight = '0.7em';
      playBtn.onclick = (e) => {
        e.preventDefault();
        currentRecordingIndex = index;
        if (rec.audioUrl) {
          showPlayModal(rec, true); // true for auto-play
        } else {
          showPlayModal(rec, false, 'Audio unavailable for this recording.');
        }
      };
      iconsDiv.appendChild(playBtn);
      li.appendChild(iconsDiv);
      dashboardList.appendChild(li);
    });
    updatePaginationControls();
  } catch (err) {
    dashboardList.innerHTML = '<li>Access denied or failed to load recordings.</li>';
  }
}

function showPlayModal(recording, autoPlay = false, errorMsg = null) {
  // Remove existing modal
  let modal = document.getElementById('play-modal');
  if (modal) modal.remove();
  
  modal = document.createElement('div');
  modal.id = 'play-modal';
  modal.className = 'modal';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100vw';
  modal.style.height = '100vh';
  modal.style.background = 'rgba(15, 23, 42, 0.8)';
  modal.style.backdropFilter = 'blur(12px) saturate(180%)';
  modal.style.webkitBackdropFilter = 'blur(12px) saturate(180%)';
  modal.style.zIndex = '3000';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.animation = 'fadeIn 0.3s ease';
  
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';
  modalContent.style.background = 'rgba(255, 255, 255, 0.25)';
  modalContent.style.backdropFilter = 'blur(40px) saturate(180%)';
  modalContent.style.webkitBackdropFilter = 'blur(40px) saturate(180%)';
  modalContent.style.padding = '2.5rem 3.5rem';
  modalContent.style.borderRadius = '24px';
  modalContent.style.maxWidth = '640px';
  modalContent.style.width = '90%';
  modalContent.style.margin = 'auto';
  modalContent.style.position = 'relative';
  modalContent.style.boxShadow = '0 8px 32px rgba(31, 38, 135, 0.37)';
  modalContent.style.border = '1px solid rgba(255, 255, 255, 0.18)';
  modalContent.style.animation = 'slideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
  modalContent.id = 'modal-content';
  
  if (errorMsg) {
    modalContent.innerHTML = `
      <span id="close-play-modal" style="position:absolute; top:20px; right:24px; font-size:1.75rem; cursor:pointer; color:#64748b; transition:all 0.3s ease; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:rgba(255,255,255,0.1); backdrop-filter:blur(10px);">&times;</span>
      <div style='color:#ef4444; margin-top:2rem; text-align:center; font-size:1.1rem;'>${errorMsg}</div>
    `;
  } else {
    const dateStr = recording.created ? formatDateTime(recording.created) : (recording.blobCreated ? formatDateTime(recording.blobCreated) : '');
    const textStr = recording.text || (recording.blobName ? recording.blobName : '(no text)');
    const userStr = recording.user_email ? recording.user_email : '(anonymous)';
    const durationStr = recording.duration ? formatDuration(recording.duration) : '';
    const voiceStr = recording.voice || 'Unknown voice';
    
    modalContent.innerHTML = `
      <span id="close-play-modal" style="position:absolute; top:20px; right:24px; font-size:1.75rem; cursor:pointer; color:#64748b; transition:all 0.3s ease; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:rgba(255,255,255,0.1); backdrop-filter:blur(10px);">&times;</span>
      
      <!-- Navigation arrows -->
      <button id="prev-recording" style="position:absolute; left:20px; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.2); border:none; border-radius:50%; width:48px; height:48px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:1.5rem; transition:all 0.3s ease; backdrop-filter:blur(10px);" ${currentRecordingIndex <= 0 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>‹</button>
      <button id="next-recording" style="position:absolute; right:20px; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.2); border:none; border-radius:50%; width:48px; height:48px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:1.5rem; transition:all 0.3s ease; backdrop-filter:blur(10px);" ${currentRecordingIndex >= currentRecordings.length - 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>›</button>
      
      <!-- Metadata above player -->
      <div style="text-align:center; margin-bottom:2rem; position: relative;">
        <!-- Gradient spotlight background -->
        <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 320px; height: 140px; background: radial-gradient(ellipse at center, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.2) 40%, rgba(255,255,255,0) 70%); border-radius: 50%; z-index: -1; animation: fadeInSpotlight 0.8s ease-out;"></div>
        
        <h3 style="margin-bottom:1rem; font-size:1.3rem; font-weight:600; color:#0f172a; text-shadow: 0 1px 2px rgba(255,255,255,0.8); position: relative; z-index: 1;">${voiceStr}</h3>
        <div style="margin-bottom:0.5rem; color:#1e293b; font-size:0.9rem; font-weight:500; text-shadow: 0 1px 1px rgba(255,255,255,0.6); position: relative; z-index: 1;">${dateStr}${durationStr ? ' • ' + durationStr : ''}</div>
        <div style="margin-bottom:0.5rem; color:#1e293b; font-size:0.9rem; font-weight:500; text-shadow: 0 1px 1px rgba(255,255,255,0.6); position: relative; z-index: 1;">User: ${userStr}</div>
        <div style="background:rgba(255,255,255,0.6); padding:1rem; border-radius:12px; margin-top:1rem; text-align:left; max-height:120px; overflow-y:auto; font-size:0.95rem; line-height:1.5; color:#0f172a; border: 1px solid rgba(255,255,255,0.4); position: relative; z-index: 1;">${textStr}</div>
      </div>
      
      <!-- Audio player -->
      <audio id="modal-audio" src="${recording.audioUrl}" controls style="width:100%; margin:1rem 0; border-radius:12px; background:rgba(255,255,255,0.5);" ${autoPlay ? 'autoplay' : ''}></audio>
    `;
  }
  
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  // Event handlers
  document.getElementById('close-play-modal').onclick = () => { 
    modal.style.animation = 'fadeOut 0.2s ease';
    setTimeout(() => modal.remove(), 200);
  };
  
  modal.onclick = (e) => { 
    if (e.target === modal) { 
      modal.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => modal.remove(), 200);
    } 
  };
  
  // Navigation handlers
  if (!errorMsg) {
    const prevBtn = document.getElementById('prev-recording');
    const nextBtn = document.getElementById('next-recording');
    
    if (prevBtn && !prevBtn.disabled) {
      prevBtn.onclick = () => navigateRecording(-1);
      prevBtn.onmouseover = () => { if (!prevBtn.disabled) prevBtn.style.background = 'rgba(255,255,255,0.3)'; };
      prevBtn.onmouseout = () => { if (!prevBtn.disabled) prevBtn.style.background = 'rgba(255,255,255,0.2)'; };
    }
    
    if (nextBtn && !nextBtn.disabled) {
      nextBtn.onclick = () => navigateRecording(1);
      nextBtn.onmouseover = () => { if (!nextBtn.disabled) nextBtn.style.background = 'rgba(255,255,255,0.3)'; };
      nextBtn.onmouseout = () => { if (!nextBtn.disabled) nextBtn.style.background = 'rgba(255,255,255,0.2)'; };
    }
  }
  
  // Keyboard navigation
  document.addEventListener('keydown', handleKeyboardNavigation);
}

function navigateRecording(direction) {
  const newIndex = currentRecordingIndex + direction;
  if (newIndex >= 0 && newIndex < currentRecordings.length) {
    currentRecordingIndex = newIndex;
    const recording = currentRecordings[currentRecordingIndex];
    
    // Animate transition
    const modalContent = document.getElementById('modal-content');
    if (modalContent) {
      modalContent.style.animation = direction > 0 ? 'slideOutLeft 0.3s ease' : 'slideOutRight 0.3s ease';
      setTimeout(() => {
        if (recording.audioUrl) {
          showPlayModal(recording, true); // Auto-play on navigation
        } else {
          showPlayModal(recording, false, 'Audio unavailable for this recording.');
        }
      }, 300);
    }
  }
}

function handleKeyboardNavigation(e) {
  const modal = document.getElementById('play-modal');
  if (!modal) return;
  
  const audio = document.getElementById('modal-audio');
  
  switch(e.key) {
    case 'Escape':
      modal.click(); // Close modal
      break;
    case 'ArrowLeft':
      if (currentRecordingIndex > 0) {
        navigateRecording(-1);
      }
      break;
    case 'ArrowRight':
      if (currentRecordingIndex < currentRecordings.length - 1) {
        navigateRecording(1);
      }
      break;
    case ' ':
    case 'Spacebar':
      e.preventDefault(); // Prevent page scrolling
      if (audio) {
        if (audio.paused) {
          audio.play();
        } else {
          audio.pause();
        }
      }
      break;
  }
}

// Clean up keyboard listener when modal is removed
const originalRemove = Element.prototype.remove;
Element.prototype.remove = function() {
  if (this.id === 'play-modal') {
    document.removeEventListener('keydown', handleKeyboardNavigation);
  }
  originalRemove.call(this);
};

function updatePaginationControls() {
  const paginationControls = document.getElementById('pagination-controls');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const pageInfo = document.getElementById('page-info');
  
  if (totalPages <= 1) {
    paginationControls.style.display = 'none';
    return;
  }
  
  paginationControls.style.display = 'block';
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages;
  
  prevBtn.style.opacity = currentPage === 1 ? '0.5' : '1';
  nextBtn.style.opacity = currentPage === totalPages ? '0.5' : '1';
  prevBtn.style.cursor = currentPage === 1 ? 'not-allowed' : 'pointer';
  nextBtn.style.cursor = currentPage === totalPages ? 'not-allowed' : 'pointer';
  
  prevBtn.onclick = () => {
    if (currentPage > 1) {
      loadDashboardList(currentPage - 1);
    }
  };
  
  nextBtn.onclick = () => {
    if (currentPage < totalPages) {
      loadDashboardList(currentPage + 1);
    }
  };
}

async function loadVoicesForFilter() {
  try {
    const firebaseIdToken = await firebaseAuth.currentUser.getIdToken();
    const res = await fetch('/dashboard-voices', {
      headers: { 'Authorization': 'Bearer ' + firebaseIdToken }
    });
    if (res.ok) {
      const data = await res.json();
      const voiceSelect = document.getElementById('voice-filter');
      
      // Clear existing options except "All voices"
      voiceSelect.innerHTML = '<option value="">All voices</option>';
      
      // Add voice options
      data.voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice;
        // Format display name for better readability
        const displayName = voice
          .replace(/_/g, ' ')
          .replace(/-/g, ' - ')
          .replace(/\b\w/g, l => l.toUpperCase());
        option.textContent = displayName;
        voiceSelect.appendChild(option);
      });
    }
  } catch (err) {
    console.error('Failed to load voices for filter:', err);
  }
}

function setupSearchHandlers() {
  const searchInput = document.getElementById('search-input');
  const voiceFilter = document.getElementById('voice-filter');
  const durationFilter = document.getElementById('duration-filter');
  const userFilter = document.getElementById('user-filter');
  const searchBtn = document.getElementById('search-btn');
  const clearBtn = document.getElementById('clear-btn');
  
  function performSearch() {
    currentSearch = searchInput.value.trim();
    currentVoiceFilter = voiceFilter.value.trim();
    currentDurationFilter = durationFilter.value.trim();
    currentUserFilter = userFilter.value.trim();
    currentPage = 1;
    loadDashboardList(1);
  }
  
  function clearSearch() {
    searchInput.value = '';
    voiceFilter.value = '';
    durationFilter.value = '';
    userFilter.value = '';
    currentSearch = '';
    currentVoiceFilter = '';
    currentDurationFilter = '';
    currentUserFilter = '';
    currentPage = 1;
    loadDashboardList(1);
  }
  
  searchBtn.addEventListener('click', performSearch);
  clearBtn.addEventListener('click', clearSearch);
  
  // Change events for dropdowns
  voiceFilter.addEventListener('change', performSearch);
  durationFilter.addEventListener('change', performSearch);
  
  // Enter key support
  [searchInput, userFilter].forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        performSearch();
      }
    });
  });
}

// Add CSS animations to the page
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(30px) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  
  @keyframes slideOutLeft {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(-100%);
    }
  }
  
  @keyframes slideOutRight {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }
  
  @keyframes fadeInSpotlight {
    from {
      opacity: 0;
      transform: translateX(-50%) scale(0.8);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }
  }
`;
document.head.appendChild(style);

// Account dropdown and usage display functions (same as library.js)
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
        <li><a href="/library" class="account-link" style="display:block; padding:0.7em 1.5em;">My Library</a></li>
        <li><a href="/terms" class="account-link" style="display:block; padding:0.7em 1.5em;">Terms of Service</a></li>
        <li><a href="/privacy" class="account-link" style="display:block; padding:0.7em 1.5em;">Privacy Policy</a></li>
      </ul>
      <button id="logout-button" class="btn btn-secondary" style="margin:0.5em 1.5em 0.5em 1.5em; width:calc(100% - 3em);">Log Out</button>
    `;
    document.body.appendChild(dropdown);
    
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
    
    // Logout button functionality
    const logoutButton = dropdown.querySelector('#logout-button');
    if (logoutButton) {
        logoutButton.onclick = async () => {
            await firebaseAuth.signOut();
            dropdown.style.display = 'none';
            window.location.href = '/';
        };
    }
    
    return dropdown;
}

function showAccountDropdown() {
    const dropdown = createAccountDropdown();
    dropdown.style.display = 'block';
}

function attachAccountDropdownHandler() {
    const accountLink = document.getElementById('account-link');
    if (accountLink) {
        accountLink.onclick = (e) => {
            e.preventDefault();
            showAccountDropdown();
        };
    }
}

function updateAuthUI(user) {
  const authLinks = document.getElementById('auth-links');
  const userInfo = document.getElementById('user-info');
  
  if (user) {
    if (authLinks) authLinks.style.display = 'none';
    if (userInfo) {
      userInfo.style.display = 'inline';
      userInfo.innerHTML = '<a href="#" id="account-link" style="font-weight:bold;">Account</a>';
      attachAccountDropdownHandler();
      
      // Initialize usage display for logged in users
      initializeUsageDisplay();
    }
    
    setupSearchHandlers();
    loadVoicesForFilter();
    loadDashboardList();
  } else {
    if (authLinks) authLinks.style.display = 'inline';
    if (userInfo) userInfo.style.display = 'none';
    dashboardList.innerHTML = '<li>Please log in as a superuser to view the dashboard.</li>';
  }
}

// Usage display functions
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
            // Make upgrade needed clickable - redirect to homepage to show paywall
            usageDisplay.onclick = () => {
                window.location.href = '/?upgrade=1';
            };
        }
        
        userInfo.appendChild(usageDisplay);
        
        // Add class to body for mobile responsive handling
        document.body.classList.add('has-usage-display');
    }
}

function initializeUsageDisplay() {
    if (firebaseAuth && firebaseAuth.currentUser) {
        showUsageInfo();
    }
}

(async function() {
  await loadFirebase();
  firebaseAuth.onAuthStateChanged(user => {
    updateAuthUI(user);
  });
})();