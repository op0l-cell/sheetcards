const firebaseConfig = {
  apiKey: "AIzaSyBHwlsjsHh51S63NZfvgIwbsvyv4asU6bE",
  authDomain: "sheetcards-a5fa8.firebaseapp.com",
  projectId: "sheetcards-a5fa8",
  storageBucket: "sheetcards-a5fa8.firebasestorage.app",
  messagingSenderId: "650005457943",
  appId: "1:650005457943:web:9619342ab3e99785f70052",
  measurementId: "G-TGR1XWX6JT"
};

// เริ่มต้นระบบ Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

let currentUser = null; 

// ==========================================
// 1. สถานะและการจัดเก็บข้อมูล (State Management)
// ==========================================
const DEFAULT_STATE = {
  user: {
    name: "ผู้ใช้งานทั่วไป",
    type: "local", // "local" หรือ "google"
    avatar: "🌸",
    theme: "vanilla-pink"
  },
  tags: ["ทั้งหมด", "✨ เสร็จสิ้น", "🔁 ทบทวน", "🔥 เร่งด่วน"],
  folders: [
    {
      id: "jp",
      name: "📁 ภาษาญี่ปุ่น",
      decks: [
        {
          id: "jp-n5",
          name: "🌸 N5 คำกริยา",
          sheetUrl: "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing",
          tag: "🔁 ทบทวน"
        }
      ]
    }
  ]
};

// โหลดข้อมูลจาก LocalStorage[span_1](start_span)[span_1](end_span)
let appState = JSON.parse(localStorage.getItem('sheetcards_state')) || DEFAULT_STATE;
let activeFolderId = appState.folders[0]?.id || "";
let activeDeckId = appState.folders[0]?.decks[0]?.id || "";
let selectedTag = "ทั้งหมด";

let currentCards = [];
let currentIndex = 0;

function saveState() {
  localStorage.setItem('sheetcards_state', JSON.stringify(appState)); //[span_2](start_span)[span_2](end_span)
}

// ==========================================
// 2. การจัดการธีมสี & ไอคอนโปรไฟล์
// ==========================================
function applyTheme(themeName) {
  document.body.setAttribute('data-theme', themeName);
  appState.user.theme = themeName;
  saveState();
}

function updateAvatar(newAvatar) {
  appState.user.avatar = newAvatar;
  document.getElementById('profile-avatar').innerText = newAvatar;
  document.getElementById('bottom-avatar-icon').innerText = newAvatar;
  saveState();
}

// ==========================================
// 3. ฟังก์ชัน Modal
// ==========================================
function openModal(id) { 
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open'); 
}

function closeModal(id) { 
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open'); 
}

// ==========================================
// 4. วาดอินเทอร์เฟซ (Rendering)
// ==========================================
function renderFolderDropdowns() {
  const select = document.getElementById('folder-select');
  const modalSelect = document.getElementById('modal-folder-select');
  select.innerHTML = '';
  modalSelect.innerHTML = '';

  appState.folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    if (f.id === activeFolderId) opt.selected = true;
    select.appendChild(opt);

    const modalOpt = document.createElement('option');
    modalOpt.value = f.id;
    modalOpt.textContent = `บันทึกลงใน: ${f.name}`;
    modalSelect.appendChild(modalOpt);
  });
}

function renderTags() {
  const container = document.getElementById('tag-container');
  container.innerHTML = '';

  appState.tags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = `tag-chip ${tag === selectedTag ? 'active' : ''}`;
    chip.textContent = tag;
    chip.onclick = () => filterByTag(tag);
    container.appendChild(chip);
  });

  const addTagBtn = document.createElement('button');
  addTagBtn.className = 'btn-small';
  addTagBtn.style.padding = '2px 8px';
  addTagBtn.textContent = '+ แท็ก';
  addTagBtn.onclick = () => openModal('tag-modal');
  container.appendChild(addTagBtn);
}

function renderDecks() {
  const container = document.getElementById('deck-container');
  container.innerHTML = '';

  const currentFolder = appState.folders.find(f => f.id === activeFolderId);
  if (!currentFolder) return;

  const filteredDecks = currentFolder.decks.filter(deck => {
    if (selectedTag === "ทั้งหมด") return true;
    return deck.tag === selectedTag;
  });

  filteredDecks.forEach(deck => {
    const pill = document.createElement('button');
    pill.className = `deck-pill ${deck.id === activeDeckId ? 'active' : ''}`;
    pill.textContent = deck.name;
    pill.onclick = () => selectDeck(deck.id);
    container.appendChild(pill);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-small';
  addBtn.id = 'btn-add-deck-inline';
  addBtn.textContent = '➕ ชุดคำ';
  addBtn.onclick = () => openModal('create-modal');
  container.appendChild(addBtn);
}

function filterByTag(tag) {
  selectedTag = tag;
  renderTags();
  renderDecks();

  const currentFolder = appState.folders.find(f => f.id === activeFolderId);
  const matchedDeck = currentFolder?.decks.find(d => selectedTag === "ทั้งหมด" || d.tag === selectedTag);

  if (matchedDeck) {
    selectDeck(matchedDeck.id);
  } else {
    currentCards = [];
    document.getElementById('front-text').innerText = "ไม่พบชุดคำในแท็กนี้";
    document.getElementById('back-text').innerText = "-";
    document.getElementById('card-counter').innerText = "0 / 0";
  }
}

function selectDeck(deckId) {
  activeDeckId = deckId;
  renderDecks();

  const currentFolder = appState.folders.find(f => f.id === activeFolderId);
  const deck = currentFolder?.decks.find(d => d.id === deckId);

  if (deck) {
    document.getElementById('card-tag').innerText = `${currentFolder.name.replace('📁 ', '')} • ${deck.name} • ${deck.tag || ''}`;
    fetchSheetData(deck.sheetUrl);
  }
}

// ==========================================
// 5. ดึงข้อมูลจาก Google Sheets
// ==========================================
function extractSheetId(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

async function fetchSheetData(sheetUrl) {
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) {
    alert("❌ รูปแบบลิงก์ Google Sheet ไม่ถูกต้อง");
    return;
  }

  const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;

  try {
    const response = await fetch(gvizUrl);
    const text = await response.text();
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const data = JSON.parse(jsonString);
    
    const rows = data.table.rows;
    currentCards = [];

    rows.forEach(row => {
      const front = row.c[0] ? row.c[0].v : "";
      const back = row.c[1] ? row.c[1].v : "";
      const hint = row.c[2] ? row.c[2].v : "";
      if (front && back) currentCards.push({ front, back, hint });
    });

    if (currentCards.length > 0) {
      currentIndex = 0;
      renderCard();
    } else {
      document.getElementById('front-text').innerText = "ไม่พบคำศัพท์ในชีตนี้";
      document.getElementById('back-text').innerText = "-";
      document.getElementById('card-counter').innerText = "0 / 0";
    }
  } catch (error) {
    console.error(error);
    alert("❌ ไม่สามารถดึงข้อมูลได้ โปรดตรวจสอบว่าชีตตั้งค่าแชร์เป็น 'ทุกคนที่มีลิงก์มีสิทธิ์อ่าน' หรือยัง");
  }
}

function renderCard() {
  if (currentCards.length === 0) return;
  const card = currentCards[currentIndex];
  document.getElementById('front-text').innerText = card.front;
  document.getElementById('back-text').innerText = card.back;
  document.getElementById('hint-text').innerText = card.hint || "";
  document.getElementById('card-counter').innerText = `${currentIndex + 1} / ${currentCards.length}`;
  document.getElementById('flashcard').classList.remove('is-flipped');
}

function changeCard(newIndex) {
  const flashcard = document.getElementById('flashcard');
  const wasFlipped = flashcard.classList.contains('is-flipped');
  const nextCardData = currentCards[newIndex];

  if (!nextCardData) return;

  if (wasFlipped) {
    document.getElementById('front-text').innerText = nextCardData.front;
    flashcard.classList.remove('is-flipped');
    currentIndex = newIndex;
    document.getElementById('card-counter').innerText = `${currentIndex + 1} / ${currentCards.length}`;
    
    setTimeout(() => {
      document.getElementById('back-text').innerText = nextCardData.back;
      document.getElementById('hint-text').innerText = nextCardData.hint || "";
    }, 300);
  } else {
    currentIndex = newIndex;
    renderCard();
  }
}

// ==========================================
// 6. การผูกเหตุการณ์ (Event Listeners)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const flashcard = document.getElementById('flashcard');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const folderSelect = document.getElementById('folder-select');

  // นำธีมและไอคอนเดิมมาแสดง
  applyTheme(appState.user.theme || "vanilla-pink");
  updateAvatar(appState.user.avatar || "🌸");
  document.getElementById('profile-name').innerText = appState.user.name || "ผู้ใช้งานทั่วไป";

  // พลิกการ์ด
  flashcard.addEventListener('click', () => flashcard.classList.toggle('is-flipped'));

  // สลับการ์ด
  btnPrev.addEventListener('click', () => { if (currentIndex > 0) changeCard(currentIndex - 1); });
  btnNext.addEventListener('click', () => { if (currentIndex < currentCards.length - 1) changeCard(currentIndex + 1); });

  // สลับโฟลเดอร์
  folderSelect.addEventListener('change', (e) => {
    activeFolderId = e.target.value;
    const folder = appState.folders.find(f => f.id === activeFolderId);
    activeDeckId = folder?.decks[0]?.id || "";
    renderDecks();
    if (activeDeckId) selectDeck(activeDeckId);
  });

  // ปุ่มเปิด Popups
  document.getElementById('btn-add-folder').addEventListener('click', () => openModal('folder-modal'));
  document.getElementById('btn-open-create').addEventListener('click', () => openModal('create-modal'));

  // เปิดหน้าโปรไฟล์
  document.getElementById('nav-profile').addEventListener('click', () => {
    let totalDecks = 0;
    appState.folders.forEach(f => totalDecks += f.decks.length);
    document.getElementById('stat-folders').innerText = appState.folders.length;
    document.getElementById('stat-decks').innerText = totalDecks;
    document.getElementById('profile-name').innerText = appState.user.name;
    document.getElementById('profile-status').innerText = appState.user.type === 'google' 
      ? '🔗 บัญชี Google (เชื่อมต่อชีตโดยตรง)' 
      : '👤 บัญชีในเครื่อง (คัดลอกลิงก์ชีตมาวาง)';
    openModal('profile-modal');
  });

  // เปลี่ยนธีมสี
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });

  // เปลี่ยนไอคอน Avatar
  document.querySelectorAll('.avatar-btn').forEach(btn => {
    btn.addEventListener('click', () => updateAvatar(btn.dataset.avatar));
  });

  // เลือกสร้างตัวตนใหม่ในเว็บ
  document.getElementById('btn-create-local-user').addEventListener('click', () => {
    closeModal('profile-modal');
    openModal('local-user-modal');
  });

  document.getElementById('btn-confirm-local-user').addEventListener('click', () => {
    const username = document.getElementById('input-username').value.trim();
    if (username) {
      appState.user.name = username;
      appState.user.type = 'local';
      saveState();
      document.getElementById('profile-name').innerText = username;
      closeModal('local-user-modal');
      alert(`✅ สร้างบัญชีตัวตน "${username}" สำเร็จแล้ว!`);
    }
  });

  // ปุ่มล็อกอิน Google (จำลองการทำงาน)
  document.getElementById('btn-login-google').addEventListener('click', () => {
    appState.user.name = "Google User";
    appState.user.type = "google";
    saveState();
    document.getElementById('profile-name').innerText = "Google User";
    document.getElementById('profile-status').innerText = '🔗 บัญชี Google (เชื่อมต่อชีตโดยตรง)';
    alert("✅ จำลองการเข้าสู่ระบบด้วย Google สำเร็จ!");
  });

  // บันทึกแท็กใหม่
  document.getElementById('btn-save-tag').addEventListener('click', () => {
    const tagInput = document.getElementById('new-tag-name');
    const tagName = tagInput.value.trim();
    if (tagName && !appState.tags.includes(tagName)) {
      appState.tags.push(`🏷️ ${tagName}`);
      saveState();
      renderTags();
      tagInput.value = '';
      closeModal('tag-modal');
    }
  });

  // บันทึกโฟลเดอร์ใหม่
  document.getElementById('btn-save-folder').addEventListener('click', () => {
    const nameInput = document.getElementById('new-folder-name');
    const name = nameInput.value.trim();
    if (name) {
      const newFolder = { id: "folder_" + Date.now(), name: `📁 ${name}`, decks: [] };
      appState.folders.push(newFolder);
      activeFolderId = newFolder.id;
      activeDeckId = "";
      saveState();
      renderFolderDropdowns();
      renderDecks();
      nameInput.value = '';
      closeModal('folder-modal');
    }
  });

  // บันทึกชุดคำใหม่
  document.getElementById('btn-save-deck').addEventListener('click', () => {
    const targetFolderId = document.getElementById('modal-folder-select').value;
    const deckName = document.getElementById('modal-deck-name').value.trim();
    const sheetUrl = document.getElementById('modal-sheet-url').value.trim();
    const tag = document.getElementById('modal-deck-tag').value.trim();

    if (!deckName || !sheetUrl) {
      alert("กรุณากรอกชื่อชุดคำและลิงก์ Google Sheets");
      return;
    }

    const folder = appState.folders.find(f => f.id === targetFolderId);
    if (folder) {
      const newDeck = {
        id: "deck_" + Date.now(),
        name: `🌸 ${deckName}`,
        sheetUrl: sheetUrl,
        tag: tag ? (tag.startsWith("🏷️") || tag.startsWith("✨") || tag.startsWith("🔁") || tag.startsWith("🔥") ? tag : `🏷️ ${tag}`) : ""
      };
      folder.decks.push(newDeck);
      saveState();

      activeFolderId = targetFolderId;
      renderFolderDropdowns();
      selectDeck(newDeck.id);

      document.getElementById('modal-deck-name').value = '';
      document.getElementById('modal-sheet-url').value = '';
      document.getElementById('modal-deck-tag').value = '';
      closeModal('create-modal');
    }
  });

  // เริ่มต้นทำงาน
  renderFolderDropdowns();
  renderTags();
  renderDecks();
  if (activeDeckId) selectDeck(activeDeckId);
});
