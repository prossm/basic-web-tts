// My Library page logic

// DOM Elements
const libraryList = document.getElementById('library-list');
const authLinks = document.getElementById('auth-links');
const userInfo = document.getElementById('user-info');

let firebaseApp = null;
let firebaseAuth = null;
let firebaseUser = null;

let accountDropdownOpen = false;
let accountDropdown = null;
let accountDropdownCloseHandler = null;

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

function updateAuthUI(user) {
  if (user) {
    authLinks.style.display = 'none';
    userInfo.style.display = 'inline';
    userInfo.innerHTML = '<a href="#" id="account-link" style="font-weight:bold;">Account</a>';
    attachAccountDropdownHandler();
  } else {
    userInfo.style.display = 'none';
    authLinks.style.display = 'inline';
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

function createKebabMenu(rec, audioUrl, onDelete) {
    // Remove any existing kebab menu
    const existing = document.getElementById('kebab-menu');
    if (existing) existing.remove();
    const menu = document.createElement('div');
    menu.id = 'kebab-menu';
    menu.style.position = 'absolute';
    menu.style.background = '#fff';
    menu.style.boxShadow = '0 4px 24px rgba(0,0,0,0.13)';
    menu.style.borderRadius = '8px';
    menu.style.padding = '0.5em 0';
    menu.style.zIndex = '2000';
    menu.style.minWidth = '140px';
    menu.innerHTML = `
      <button id="download-audio" style="display:block; width:100%; padding:0.7em 1.2em; background:none; border:none; text-align:left; cursor:pointer; font-size:1em;">Download</button>
      <button id="delete-audio" style="display:block; width:100%; padding:0.7em 1.2em; background:none; border:none; text-align:left; color:#dc3545; cursor:pointer; font-size:1em;">Delete</button>
    `;
    document.body.appendChild(menu);
    // Position menu below the kebab button
    const rect = rec.kebabBtn.getBoundingClientRect();
    menu.style.top = (window.scrollY + rect.bottom + 4) + 'px';
    menu.style.left = (window.scrollX + rect.left - 60) + 'px';
    // Download
    menu.querySelector('#download-audio').onclick = () => {
        const a = document.createElement('a');
        a.href = audioUrl;
        a.download = rec.id + '.wav';
        document.body.appendChild(a);
        a.click();
        a.remove();
        menu.remove();
    };
    // Delete
    menu.querySelector('#delete-audio').onclick = () => {
        menu.remove();
        showDeleteModal(rec, onDelete);
    };
    // Close menu on outside click
    function closeMenu(e) {
        if (!menu.contains(e.target) && e.target !== rec.kebabBtn) {
            menu.remove();
            document.removeEventListener('mousedown', closeMenu);
        }
    }
    setTimeout(() => {
        document.addEventListener('mousedown', closeMenu);
    }, 0);
}
function showDeleteModal(rec, onDelete) {
    // Remove any existing modal
    const existing = document.getElementById('delete-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'delete-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.4)';
    modal.style.zIndex = '3000';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.innerHTML = `
      <div style="background:#fff; padding:2em; border-radius:10px; max-width:350px; width:100%; box-shadow:0 2px 16px rgba(0,0,0,0.12); text-align:center;">
        <h3 style="margin-bottom:1em;">Delete this recording?</h3>
        <p style="color:#666; margin-bottom:2em;">This action cannot be undone.</p>
        <button id="confirm-delete" style="background:#dc3545; color:#fff; border:none; border-radius:6px; padding:0.7em 1.5em; font-size:1em; margin-right:1em; cursor:pointer;">Yes, Delete</button>
        <button id="cancel-delete" style="background:none; color:#337ab7; border:2px solid #337ab7; border-radius:6px; padding:0.7em 1.5em; font-size:1em; cursor:pointer;">Cancel</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#confirm-delete').onclick = async () => {
        modal.remove();
        await onDelete(rec);
    };
    modal.querySelector('#cancel-delete').onclick = () => {
        modal.remove();
    };
}

function showPlayModal(audioUrl) {
    // Remove any existing play modal
    const existing = document.getElementById('play-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'play-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.4)';
    modal.style.zIndex = '3000';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.innerHTML = `
      <div style="background:#fff; padding:2em; border-radius:10px; max-width:400px; width:100%; box-shadow:0 2px 16px rgba(0,0,0,0.12); text-align:center; position:relative;">
        <button id="close-play-modal" aria-label="Close" style="position:absolute; top:10px; right:16px; font-size:1.5em; background:none; border:none; color:#888; cursor:pointer;">&times;</button>
        <h3 style="margin-bottom:1em;">Play Recording</h3>
        <audio controls style="width:100%; margin-bottom:1em;" src="${audioUrl}"></audio>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#close-play-modal').onclick = () => {
        modal.remove();
    };
    // Close modal on outside click
    function closeModal(e) {
        if (e.target === modal) {
            modal.remove();
            document.removeEventListener('mousedown', closeModal);
        }
    }
    setTimeout(() => {
        document.addEventListener('mousedown', closeModal);
    }, 0);
}

async function loadLibraryList() {
  libraryList.innerHTML = '<li>Loading...</li>';
  try {
    const firebaseIdToken = await firebaseAuth.currentUser.getIdToken();
    const res = await fetch('/recordings', {
      headers: { 'Authorization': 'Bearer ' + firebaseIdToken }
    });
    if (!res.ok) {
      libraryList.innerHTML = '<li>Failed to load recordings.</li>';
      return;
    }
    let recordings = await res.json();
    // Filter out deleted recordings
    recordings = recordings.filter(r => !r.deleted);
    // Sort recordings reverse chronologically (most recent first)
    recordings.sort((a, b) => (b.created || 0) - (a.created || 0));
    if (!recordings.length) {
      libraryList.innerHTML = '<li>No recordings yet.</li>';
      return;
    }
    libraryList.innerHTML = '';
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
      playBtn.onclick = (e) => {
        e.preventDefault();
        showPlayModal(rec.audioUrl);
      };
      // Kebab icon (SVG)
      const kebabBtn = document.createElement('button');
      kebabBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>`;
      kebabBtn.style.background = 'none';
      kebabBtn.style.border = 'none';
      kebabBtn.style.cursor = 'pointer';
      kebabBtn.onclick = (e) => {
        e.preventDefault();
        rec.kebabBtn = kebabBtn;
        createKebabMenu(rec, rec.audioUrl, async (recToDelete) => {
          // Call backend to mark as deleted
          const firebaseIdToken = await firebaseAuth.currentUser.getIdToken();
          await fetch(`/recordings/${recToDelete.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + firebaseIdToken }
          });
          // Remove from UI
          li.remove();
        });
      };
      iconsDiv.appendChild(playBtn);
      iconsDiv.appendChild(kebabBtn);
      li.appendChild(iconsDiv);
      libraryList.appendChild(li);
    });
  } catch (err) {
    libraryList.innerHTML = '<li>Failed to load recordings.</li>';
  }
}

// Dropdown logic for Account (copied from app.js for now)
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

(async function() {
  await loadFirebase();
  firebaseAuth.onAuthStateChanged(user => {
    firebaseUser = user;
    updateAuthUI(user);
    if (user) {
      loadLibraryList();
    } else {
      libraryList.innerHTML = '<li>Please log in to view your library.</li>';
    }
  });
})(); 