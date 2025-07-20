// My Library page logic

// DOM Elements
const libraryList = document.getElementById('library-list');
const authLinks = document.getElementById('auth-links');
const userInfo = document.getElementById('user-info');

let firebaseApp = null;
let firebaseAuth = null;
let firebaseUser = null;

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
    const recordings = await res.json();
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
      // Kebab icon (SVG)
      const kebabBtn = document.createElement('button');
      kebabBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>`;
      kebabBtn.style.background = 'none';
      kebabBtn.style.border = 'none';
      kebabBtn.style.cursor = 'pointer';
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
    let dropdown = document.getElementById('account-modal');
    const accountLinkEl = document.getElementById('account-link');
    if (dropdown && dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
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
    // Close dropdown if click outside or on Account again
    function closeDropdown(e) {
        if (!dropdown.contains(e.target) && e.target !== accountLinkEl) {
            dropdown.style.display = 'none';
            document.removeEventListener('mousedown', closeDropdown);
        }
    }
    setTimeout(() => {
        document.addEventListener('mousedown', closeDropdown);
    }, 0);
    // Close dropdown on link click
    dropdown.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            dropdown.style.display = 'none';
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