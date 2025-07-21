// Superuser Dashboard logic

const dashboardList = document.getElementById('dashboard-list');

let firebaseApp = null;
let firebaseAuth = null;

function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}
function truncateText(txt, n) {
  if (!txt) return '';
  return txt.length > n ? txt.slice(0, n) + '…' : txt;
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

async function loadDashboardList() {
  dashboardList.innerHTML = '<li>Loading...</li>';
  try {
    const firebaseIdToken = await firebaseAuth.currentUser.getIdToken();
    const res = await fetch('/dashboard-recordings', {
      headers: { 'Authorization': 'Bearer ' + firebaseIdToken }
    });
    if (!res.ok) {
      dashboardList.innerHTML = '<li>Access denied or failed to load recordings.</li>';
      return;
    }
    let recordings = await res.json();
    if (!recordings.length) {
      dashboardList.innerHTML = '<li>No recordings found.</li>';
      return;
    }
    dashboardList.innerHTML = '';
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
      // Use blobCreated if created is missing
      const dateStr = rec.created ? formatDateTime(rec.created) : (rec.blobCreated ? formatDateTime(rec.blobCreated) : '');
      // Use blobName if text is missing
      const textStr = rec.text ? truncateText(rec.text, 20) : (rec.blobName ? rec.blobName : '(no text)');
      // Show (anonymous) if no user_email
      const userStr = rec.user_email ? 'User: ' + rec.user_email : '(anonymous)';
      infoDiv.innerHTML = `
        <div style="font-size:0.98em; color:#333;">${dateStr}</div>
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
        if (rec.audioUrl) {
          showPlayModal(rec.audioUrl);
        } else {
          showPlayModal(null, 'Audio unavailable for this recording.');
        }
      };
      iconsDiv.appendChild(playBtn);
      li.appendChild(iconsDiv);
      dashboardList.appendChild(li);
    });
  } catch (err) {
    dashboardList.innerHTML = '<li>Access denied or failed to load recordings.</li>';
  }
}

function showPlayModal(audioUrl, errorMsg) {
  // Simple modal for playback or error
  let modal = document.getElementById('play-modal');
  if (modal) modal.remove();
  modal = document.createElement('div');
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
    <div style="background:#fff; padding:2em; border-radius:10px; max-width:400px; min-width:350px; margin:auto; position:relative;">
      <span id="close-play-modal" style="position:absolute; top:10px; right:16px; font-size:1.5em; cursor:pointer;">&times;</span>
      ${audioUrl ? `<audio src="${audioUrl}" controls style="width:100%; margin-top:1em;"></audio>` : `<div style='color:#b00; margin-top:2em;'>${errorMsg || 'Audio unavailable.'}</div>`}
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('close-play-modal').onclick = () => { modal.remove(); };
  window.onclick = (e) => { if (e.target === modal) { modal.remove(); } };
}

(async function() {
  await loadFirebase();
  firebaseAuth.onAuthStateChanged(user => {
    if (user) {
      loadDashboardList();
    } else {
      dashboardList.innerHTML = '<li>Please log in as a superuser to view the dashboard.</li>';
    }
  });
})(); 