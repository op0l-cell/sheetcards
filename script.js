// ==========================================
// 1. FIREBASE BACKEND SETUP (SAFE MODE)
// ==========================================
let auth = null;
let db = null;
let googleProvider = null;
let currentUser = null;


const firebaseConfig = {
  apiKey: "AIzaSyBHwlsjsHh51S63NZfvgIwbsvyv4asU6bE",
  authDomain: "sheetcards-a5fa8.firebaseapp.com",
  projectId: "sheetcards-a5fa8",
  storageBucket: "sheetcards-a5fa8.firebasestorage.app",
  messagingSenderId: "650005457943",
  appId: "1:650005457943:web:9619342ab3e99785f70052",
  measurementId: "G-TGR1XWX6JT"
};
try {
  if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    googleProvider = new firebase.auth.GoogleAuthProvider();
  }
} catch (e) {
  console.warn("Firebase Safe-Mode Active:", e);
}

// ==========================================
// 2. STATE & DEFAULT DATA
// ==========================================
const SAMPLE_N5_CARDS = [
  { front: "食べる (taberu)", back: "กิน, รับประทาน", hint: "คำกริยา กลุ่ม 2" },
  { front: "飲む (nomu)", back: "ดื่ม", hint: "คำกริยา กลุ่ม 1" },
  { front: "行く (iku)", back: "ไป", hint: "คำช่วย に / へ" },
  { front: "本 (hon)", back: "หนังสือ", hint: "คำนาม" }
];

const DEFAULT_STATE = {
  user: {
    name: "ผู้ใช้งานทั่วไป",
    type: "local",
    avatar: "🌸",
    theme: "vanilla-pink"
  },
  savedSheets: [
    {
      id: "sample_sheet_1",
      name: "ตารางคำศัพท์ JLPT N5",
      url: "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing",
      createdAt: 1700000000000
    }
  ],
  tags: ["ทั้งหมด", "✨ เสร็จสิ้น", "🔁 ทบทวน", "🔥 เร่งด่วน"],
  folders: [
    {
      id: "jp",
      name: "📁 ภาษาญี่ปุ่น",
      createdAt: 1700000000000,
      isCollapsed: false,
      decks: [
        {
          id: "jp-n5",
          name: "🌸 N5 คำกริยา",
          cards: [...SAMPLE_N5_CARDS],
          sheetUrl: "",
          tag: "🔁 ทบทวน",
          createdAt: 1700000000000
        }
      ]
    }
  ]
};

let appState = JSON.parse(localStorage.getItem('sheetcards_state')) || DEFAULT_STATE;
if (!appState.savedSheets) appState.savedSheets = [...DEFAULT_STATE.savedSheets];

let activeFolderId = appState.folders[0]?.id || "";
let activeDeckId = appState.folders[0]?.decks[0]?.id || "";
let selectedTag = "ทั้งหมด";

let currentCards = [...SAMPLE_N5_CARDS];
let currentIndex = 0;
let isReversed = false;

// Selection & Sort Modes
let selectedSheetsIds = new Set();
let selectedFoldersIds = new Set();
let selectedDecksIds = new Set();
let isCustomSorting = false;
let dateSortAscending = true;
let currentCreateMode = 'paste';

// ==========================================
// ระบบบันทึกและสลับบัญชีแยกอิสระ (ISOLATED STORAGE)
// ==========================================
function saveState() {
  if (appState.user.type === 'google' && currentUser) {
    localStorage.setItem(`sheetcards_google_state_${currentUser.uid}`, JSON.stringify(appState));
  } else {
    localStorage.setItem('sheetcards_local_state', JSON.stringify(appState));
  }
  localStorage.setItem('sheetcards_state', JSON.stringify(appState));
  syncDataToCloud();
}

function updateAuthUI() {
  const btnGoogle = document.getElementById('btn-login-google');
  const btnLocal = document.getElementById('btn-create-local-user');
  const btnLogout = document.getElementById('btn-logout');
  const profileStatus = document.getElementById('profile-status');
  const profileName = document.getElementById('profile-name');

  if (appState.user.type === 'google') {
    if (btnGoogle) btnGoogle.style.display = 'none';
    if (btnLocal) btnLocal.style.display = 'none';
    if (btnLogout) btnLogout.style.display = 'block';
    if (profileStatus) profileStatus.textContent = '🔗 บัญชี Google (เชื่อมต่อออนไลน์)';
  } else {
    if (btnGoogle) btnGoogle.style.display = 'block';
    if (btnLocal) btnLocal.style.display = 'block';
    if (btnLogout) btnLogout.style.display = 'none';
    if (profileStatus) profileStatus.textContent = '👤 บัญชีในเครื่อง (Local)';
  }
  if (profileName) profileName.textContent = appState.user.name;
}

async function loginWithGoogle() {
  if (!auth || !googleProvider) {
    alert("⚠️ ระบบล็อกอิน Google จะทำงานเมื่อนำเว็บขึ้นโฮสติ้งจริง (เช่น GitHub Pages) ตอนนี้สามารถใช้โหมด 'สร้างตัวตนใหม่ในเว็บ' ได้ตามปกติครับ");
    return;
  }
  try {
    const result = await auth.signInWithPopup(googleProvider);
    currentUser = result.user;

    localStorage.setItem('sheetcards_local_state', JSON.stringify(appState));

    const savedGoogleState = localStorage.getItem(`sheetcards_google_state_${currentUser.uid}`);
    if (savedGoogleState) {
      appState = JSON.parse(savedGoogleState);
    } else {
      appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
      appState.user.name = currentUser.displayName || "Google User";
      appState.user.type = "google";
    }

    await loadUserDataFromCloud(currentUser.uid);
    saveState();
    
    activeFolderId = appState.folders[0]?.id || "";
    activeDeckId = appState.folders[0]?.decks[0]?.id || "";
    renderAll();
    if (activeDeckId) selectDeck(activeDeckId);
    updateAuthUI();

    closeModal('profile-modal');
    alert(`✅ ยินดีต้อนรับคุณ ${appState.user.name}!`);
  } catch (error) {
    console.error("Login Error:", error);
    alert("❌ การล็อกอินขัดข้อง: " + error.message);
  }
}

function logoutUser() {
  if (!confirm("คุณต้องการออกจากระบบ Google ใช่หรือไม่?\n(ระบบจะสลับกลับไปยังบัญชีในเครื่อง)")) return;

  if (currentUser) {
    localStorage.setItem(`sheetcards_google_state_${currentUser.uid}`, JSON.stringify(appState));
  }

  if (auth) auth.signOut();
  currentUser = null;

  const localState = localStorage.getItem('sheetcards_local_state');
  if (localState) {
    appState = JSON.parse(localState);
  } else {
    appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    appState.user.type = 'local';
  }

  saveState();
  activeFolderId = appState.folders[0]?.id || "";
  activeDeckId = appState.folders[0]?.decks[0]?.id || "";
  renderAll();
  if (activeDeckId) selectDeck(activeDeckId);
  updateAuthUI();

  closeModal('profile-modal');
  alert("🚪 ออกจากระบบเรียบร้อยแล้ว");
}

async function syncDataToCloud() {
  if (currentUser && appState.user.type === 'google' && db) {
    try {
      await db.collection("users").doc(currentUser.uid).set({
        folders: appState.folders,
        tags: appState.tags,
        savedSheets: appState.savedSheets,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.error("Sync Error:", e);
    }
  }
}

async function loadUserDataFromCloud(uid) {
  if (!db) return;
  try {
    const doc = await db.collection("users").doc(uid).get();
    if (doc.exists) {
      const data = doc.data();
      if (data.folders) appState.folders = data.folders;
      if (data.tags) appState.tags = data.tags;
      if (data.savedSheets) appState.savedSheets = data.savedSheets;
    }
  } catch (e) {
    console.error("Load Data Error:", e);
  }
}

// ==========================================
// 4. SECURITY & HELPERS
// ==========================================
function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderCardContent(content) {
  if (!content) return "";
  const trimmed = content.trim();
  const isImage = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp|svg))/i.test(trimmed);
  if (isImage) {
    return `<img src="${encodeURI(trimmed)}" class="card-image-display" alt="card image" />`;
  }
  return escapeHTML(trimmed);
}

function parseSheetUrl(url) {
  const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = url.match(/[#&]gid=([0-9]+)/);
  return {
    sheetId: idMatch ? idMatch[1] : null,
    gid: gidMatch ? gidMatch[1] : "0"
  };
}

// ==========================================
// 5. PARSER & DUAL-MODE CREATOR
// ==========================================
function switchCreateMode(mode) {
  currentCreateMode = mode;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.create-mode-panel').forEach(p => p.classList.remove('active'));

  if (mode === 'paste') {
    document.getElementById('tab-mode-paste').classList.add('active');
    document.getElementById('mode-paste-content').classList.add('active');
  } else {
    document.getElementById('tab-mode-sheet').classList.add('active');
    document.getElementById('mode-sheet-content').classList.add('active');
  }
}

function parsePastedText(rawText) {
if (!rawText || !rawText.trim()) return [];
const lines = rawText.trim().split(/\r?\n/);
const headerKeywords = [
"front", "back", "hint", "english", "thai", "vocab",
"vocabulary", "คำศัพท์", "ความหมาย", "คำแปล", "คำอ่าน"
];
const parsedCards = [];
lines.forEach((line, idx) => {
const trimmedLine = line.trim();
if (!trimmedLine) return;
let cols = [];
// ลำดับที่ 1: Tab จาก Excel/Sheets
if (trimmedLine.includes('\t')) {
cols = trimmedLine.split('\t');
}
// ลำดับที่ 2: เครื่องหมายเท่ากับ (=)
else if (trimmedLine.includes('=')) {
cols = trimmedLine.split('=');
}
// ลำดับที่ 3: เครื่องหมายขีดคั่นกลาง ( - )
else if (trimmedLine.includes(' - ')) {
cols = trimmedLine.split(' - ');
}
// ลำดับที่ 4: เคาะเว้นวรรคตั้งแต่ 2 เคาะขึ้นไป
else if (/\s{2,}/.test(trimmedLine)) {
cols = trimmedLine.split(/\s{2,}/);
}
// ลำดับที่ 5: คอมมา (,)
else if (trimmedLine.includes(',')) {
cols = trimmedLine.split(',');
}
cols = cols.map(c => c.trim()).filter(c => c.length > 0);
// ตรวจจับและตัดแถวหัวตาราง
if (idx === 0 && cols.length >= 2) {
const firstCol = cols[0].toLowerCase();
const secondCol = cols[1].toLowerCase();
const isHeader = headerKeywords.some(k => firstCol.includes(k) || secondCol.includes(k));
if (isHeader) return;
}
if (cols.length >= 2) {
parsedCards.push({
front: cols[0],
back: cols[1],
hint: cols[2] || ""
});
}
});
return parsedCards;
}

// ==========================================
// 6. FETCH GOOGLE SHEETS
// ==========================================
async function fetchSheetData(sheetUrl) {
  const { sheetId, gid } = parseSheetUrl(sheetUrl);
  if (!sheetId) {
    clearCardDisplay("ลิงก์ชีตไม่ถูกต้อง");
    return;
  }

  const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;

  try {
    const response = await fetch(gvizUrl);
    const text = await response.text();
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const data = JSON.parse(jsonString);
    const rows = data.table.rows;

    if (!rows || rows.length === 0) {
      clearCardDisplay("ไม่พบข้อมูลในชีตนี้");
      return;
    }

    const firstFront = (rows[0].c && rows[0].c[0] ? String(rows[0].c[0].v) : "").toLowerCase().trim();
    const firstBack = (rows[0].c && rows[0].c[1] ? String(rows[0].c[1].v) : "").toLowerCase().trim();
    const headerKeywords = ["front", "back", "hint", "english", "thai", "vocab", "คำศัพท์", "ความหมาย", "คำแปล", "คำอ่าน"];
    const isHeader = headerKeywords.some(k => firstFront.includes(k) || firstBack.includes(k));
    const dataRows = isHeader ? rows.slice(1) : rows;

    const loaded = [];
    dataRows.forEach(row => {
      const front = row.c && row.c[0] ? String(row.c[0].v).trim() : "";
      const back = row.c && row.c[1] ? String(row.c[1].v).trim() : "";
      const hint = row.c && row.c[2] ? String(row.c[2].v).trim() : "";
      if (front && back) loaded.push({ front, back, hint });
    });

    if (loaded.length > 0) {
      currentCards = loaded;
      currentIndex = 0;
      renderCard();
    } else {
      clearCardDisplay("ไม่พบคำศัพท์ในตาราง");
    }
  } catch (error) {
    console.warn("ดึงข้อมูลชีตไม่สำเร็จ:", error);
    clearCardDisplay("ไม่สามารถโหลดข้อมูลชีตได้");
  }
}

// ==========================================
// 7. CARD PLAY ENGINE & SPACED REPETITION
// ==========================================
function clearCardDisplay(message = "ไม่มีชุดคำศัพท์", showRestartBtn = false) {
  currentCards = [];
  currentIndex = 0;
  
  if (showRestartBtn) {
    document.getElementById('front-text').innerHTML = `
      <div>${message}</div>
      <button type="button" class="btn-restart-deck" onclick="restartCurrentDeck()">🔄 เริ่มท่องใหม่ตั้งแต่ต้น</button>
    `;
  } else {
    document.getElementById('front-text').textContent = message;
  }
  
  document.getElementById('back-text').textContent = "-";
  document.getElementById('hint-text').textContent = "";
  document.getElementById('card-counter').textContent = "0 / 0";
  document.getElementById('study-progress-bar').style.width = "0%";
  const flashcard = document.getElementById('flashcard');
  if (flashcard) flashcard.classList.remove('is-flipped');
}
function restartCurrentDeck() {
if (activeDeckId) {
selectDeck(activeDeckId);
}
}
function renderCard() {
  if (currentCards.length === 0) {
    clearCardDisplay();
    return;
  }

  const card = currentCards[currentIndex];
  const frontContent = isReversed ? card.back : card.front;
  const backContent = isReversed ? card.front : card.back;

  document.getElementById('front-text').innerHTML = renderCardContent(frontContent);
  document.getElementById('back-text').innerHTML = renderCardContent(backContent);
  document.getElementById('hint-text').textContent = card.hint || "";
  document.getElementById('card-counter').textContent = `${currentIndex + 1} / ${currentCards.length}`;

  const progressPercent = ((currentIndex + 1) / currentCards.length) * 100;
  document.getElementById('study-progress-bar').style.width = `${progressPercent}%`;

  document.getElementById('flashcard').classList.remove('is-flipped');
}

function changeCard(newIndex) {
  if (currentCards.length <= 1 && currentIndex === newIndex) return;
  if (!currentCards[newIndex]) return;

  const flashcard = document.getElementById('flashcard');
  const wasFlipped = flashcard.classList.contains('is-flipped');

  if (wasFlipped) {
    flashcard.classList.remove('is-flipped');
    setTimeout(() => {
      currentIndex = newIndex;
      renderCard();
    }, 250);
  } else {
    currentIndex = newIndex;
    renderCard();
  }
}

function shuffleCurrentDeck() {
  if (currentCards.length <= 1) return;
  for (let i = currentCards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [currentCards[i], currentCards[j]] = [currentCards[j], currentCards[i]];
  }
  currentIndex = 0;
  renderCard();
}

function reverseCurrentDeck() {
  isReversed = !isReversed;
  renderCard();
}

function handleSpacedPass() {
if (currentCards.length === 0) return;
currentCards.splice(currentIndex, 1);
if (currentCards.length === 0) {
clearCardDisplay("🎉 ยอดเยี่ยม! ทบทวนครบทุกคำแล้ว", true);
} else {
if (currentIndex >= currentCards.length) currentIndex = 0;
renderCard();
}
}

function handleSpacedRepeat() {
  if (currentCards.length <= 1) return;
  const card = currentCards.splice(currentIndex, 1)[0];
  currentCards.push(card);
  if (currentIndex >= currentCards.length) currentIndex = 0;
  renderCard();
}

// ==========================================
// 8. GESTURES & ACCORDION & TOUCH DRAG-DROP
// ==========================================
function bindItemGestures(containerEl, contentEl, options) {
  let touchStartX = 0;
  let touchStartY = 0;
  let isScrolling = false;
  let longPressTimer = null;
  let isLongPressed = false;

  if (options.canSwipe) {
    containerEl.addEventListener('scroll', () => {
      if (selectedFoldersIds.size > 0 || isCustomSorting) containerEl.scrollLeft = 0;
    });

    containerEl.addEventListener('touchend', () => {
      if (selectedFoldersIds.size > 0 || isCustomSorting) return;
      const maxScroll = containerEl.scrollWidth - containerEl.clientWidth;
      if (containerEl.scrollLeft > 35) {
        containerEl.scrollTo({ left: maxScroll, behavior: 'smooth' });
      } else {
        containerEl.scrollTo({ left: 0, behavior: 'smooth' });
      }
    });
  }

  contentEl.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isScrolling = false;
    isLongPressed = false;

    if (!isCustomSorting && options.onLongPress) {
      longPressTimer = setTimeout(() => {
        isLongPressed = true;
        if (navigator.vibrate) navigator.vibrate(40);
        options.onLongPress();
      }, 550);
    }
  }, { passive: true });

  contentEl.addEventListener('touchmove', (e) => {
    const diffX = Math.abs(e.touches[0].clientX - touchStartX);
    const diffY = Math.abs(e.touches[0].clientY - touchStartY);
    if (diffY > 8 || diffX > 8) {
      isScrolling = true;
      if (longPressTimer) clearTimeout(longPressTimer);
    }
  }, { passive: true });

  contentEl.addEventListener('touchend', (e) => {
    if (longPressTimer) clearTimeout(longPressTimer);
    if (isLongPressed) return;
    if (!isScrolling && options.onTap) options.onTap(e);
  });
}

function bindTouchDragAndDrop(container) {
  let draggedEl = null;
  let ghostEl = null;
  let autoScrollTimer = null;
  let startOffsetY = 0;

  const handleTouchStart = (e) => {
    const target = e.target.closest('.reorder-active');
    if (!target) return;

    draggedEl = target;
    const touch = e.touches[0];
    const rect = draggedEl.getBoundingClientRect();
    startOffsetY = touch.clientY - rect.top;

    ghostEl = draggedEl.cloneNode(true);
    ghostEl.classList.add('drag-ghost');
    ghostEl.style.left = `${rect.left}px`;
    ghostEl.style.top = `${rect.top}px`;
    ghostEl.style.width = `${rect.width}px`;
    document.body.appendChild(ghostEl);

    draggedEl.classList.add('is-dragging');
  };

  const handleTouchMove = (e) => {
    if (!draggedEl || !ghostEl) return;
    e.preventDefault();

    const touch = e.touches[0];
    const clientY = touch.clientY;
    ghostEl.style.top = `${clientY - startOffsetY}px`;

    const edgeThreshold = 80;
    if (autoScrollTimer) clearInterval(autoScrollTimer);

    if (clientY < edgeThreshold) {
      autoScrollTimer = setInterval(() => window.scrollBy(0, -8), 16);
    } else if (clientY > window.innerHeight - edgeThreshold) {
      autoScrollTimer = setInterval(() => window.scrollBy(0, 8), 16);
    }

    ghostEl.style.display = 'none';
    const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
    ghostEl.style.display = 'block';

    if (!elementBelow) return;

    const dropTarget = elementBelow.closest('.reorder-active');
    if (dropTarget && dropTarget !== draggedEl && dropTarget.parentNode === draggedEl.parentNode) {
      const parent = draggedEl.parentNode;
      const children = Array.from(parent.children);
      const draggedIndex = children.indexOf(draggedEl);
      const targetIndex = children.indexOf(dropTarget);

      if (draggedIndex < targetIndex) {
        parent.insertBefore(draggedEl, dropTarget.nextSibling);
      } else {
        parent.insertBefore(draggedEl, dropTarget);
      }
    }
  };

  const handleTouchEnd = () => {
    if (autoScrollTimer) clearInterval(autoScrollTimer);
    if (ghostEl) { ghostEl.remove(); ghostEl = null; }
    if (draggedEl) {
      draggedEl.classList.remove('is-dragging');
      draggedEl = null;
      syncDomOrderToState();
    }
  };

  container.addEventListener('touchstart', handleTouchStart, { passive: false });
  container.addEventListener('touchmove', handleTouchMove, { passive: false });
  container.addEventListener('touchend', handleTouchEnd);
}

function syncDomOrderToState() {
  const container = document.getElementById('folders-view-container');
  if (!container) return;

  const folderNodes = container.querySelectorAll('.folder-acc-item');
  const newFolders = [];

  folderNodes.forEach(fNode => {
    const fId = fNode.dataset.folderId;
    const folder = appState.folders.find(f => f.id === fId);
    if (!folder) return;
const deckNodes = fNode.querySelectorAll('.swipe-item-container[data-deck-id]');
    const newDecks = [];
    deckNodes.forEach(dNode => {
      const dId = dNode.dataset.deckId;
      const deck = folder.decks.find(d => d.id === dId);
      if (deck) newDecks.push(deck);
    });

    folder.decks = newDecks;
    newFolders.push(folder);
  });

  appState.folders = newFolders;
  saveState();
}

// ==========================================
// 9. RENDERING FUNCTIONS
// ==========================================
function renderFolderDropdowns() {
  const select = document.getElementById('folder-select');
  const modalSelect = document.getElementById('modal-folder-select');
  if (!select) return;
  select.innerHTML = '';
  if (modalSelect) modalSelect.innerHTML = '';

  appState.folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    if (f.id === activeFolderId) opt.selected = true;
    select.appendChild(opt);

    if (modalSelect) {
      const modalOpt = document.createElement('option');
      modalOpt.value = f.id;
      modalOpt.textContent = `บันทึกลงใน: ${f.name}`;
      if (f.id === activeFolderId) modalOpt.selected = true;
      modalSelect.appendChild(modalOpt);
    }
  });
}

function renderTags() {
  const container = document.getElementById('tag-container');
  if (!container) return;
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
  if (!container) return;
  container.innerHTML = '';

  const currentFolder = appState.folders.find(f => f.id === activeFolderId);
  if (!currentFolder) return;

  const filteredDecks = (currentFolder.decks || []).filter(deck => {
    if (selectedTag === "ทั้งหมด") return true;
    return deck.tag === selectedTag;
  });

  filteredDecks.forEach(deck => {
    const wrapper = document.createElement('div');
    wrapper.className = 'deck-pill-wrapper';

    const pill = document.createElement('button');
    pill.className = `deck-pill ${deck.id === activeDeckId ? 'active' : ''}`;
    
    const titleSpan = document.createElement('span');
    titleSpan.textContent = deck.name;
    pill.appendChild(titleSpan);

    pill.onclick = () => selectDeck(deck.id);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete-deck';
    delBtn.textContent = '✕';
    delBtn.title = 'ลบชุดคำนี้';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteDeck(deck.id, deck.name);
    };

    pill.appendChild(delBtn);
    wrapper.appendChild(pill);
    container.appendChild(wrapper);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-small';
  addBtn.id = 'btn-add-deck-inline';
  addBtn.textContent = '➕ ชุดคำ';
  addBtn.onclick = () => {
    document.getElementById('deck-modal-title').textContent = "🌸 สร้างชุดคำศัพท์ใหม่";
    document.getElementById('edit-deck-id').value = "";
    document.getElementById('modal-deck-name').value = "";
    document.getElementById('modal-paste-raw').value = "";
    document.getElementById('modal-sheet-url').value = "";
    document.getElementById('modal-deck-tag').value = "";
    renderFolderDropdowns();
    openModal('create-modal');
  };
  container.appendChild(addBtn);
}

function filterByTag(tag) {
  selectedTag = tag;
  renderTags();
  renderDecks();

  const currentFolder = appState.folders.find(f => f.id === activeFolderId);
  const matchedDeck = currentFolder?.decks?.find(d => selectedTag === "ทั้งหมด" || d.tag === selectedTag);
  if (matchedDeck) selectDeck(matchedDeck.id);
}

function selectDeck(deckId) {
  activeDeckId = deckId;
  renderDecks();

  const currentFolder = appState.folders.find(f => f.id === activeFolderId);
  const deck = currentFolder?.decks?.find(d => d.id === deckId);

  if (deck) {
    const cleanFolder = currentFolder.name.replace('📁 ', '');
    document.getElementById('card-tag').textContent = `${cleanFolder} • ${deck.name} • ${deck.tag || ''}`;

    if (deck.cards && deck.cards.length > 0) {
      currentCards = [...deck.cards];
      currentIndex = 0;
      renderCard();
    } else if (deck.sheetUrl) {
      fetchSheetData(deck.sheetUrl);
    } else {
      currentCards = [...SAMPLE_N5_CARDS];
      currentIndex = 0;
      renderCard();
    }
  } else {
    clearCardDisplay();
  }
}

// ==========================================
// 10. SAVED SHEETS & FOLDERS VIEW
// ==========================================
function renderSavedSheets() {
  const container = document.getElementById('sheets-list-container');
  const headerActions = document.getElementById('sheets-header-actions');
  const selectActions = document.getElementById('sheets-selection-actions');
  const countLabel = document.getElementById('sheets-selected-count');

  if (!container) return;
  container.innerHTML = '';

  if (selectedSheetsIds.size > 0) {
    headerActions.style.display = 'none';
    selectActions.style.display = 'flex';
    countLabel.textContent = `เลือก ${selectedSheetsIds.size}`;
  } else {
    headerActions.style.display = 'flex';
    selectActions.style.display = 'none';
  }

  if (appState.savedSheets.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:13px; margin-top:20px;">ยังไม่มีลิงก์ชีตที่บันทึกไว้</p>';
    return;
  }

  appState.savedSheets.forEach(item => {
    const itemContainer = document.createElement('div');
    const isSelected = selectedSheetsIds.has(item.id);
    itemContainer.className = `swipe-item-container ${isSelected ? 'selected' : ''}`;

    itemContainer.innerHTML = `
      <div class="swipe-item-wrapper">
        <div class="swipe-content" id="sheet-item-${item.id}">
          <div class="swipe-title">${escapeHTML(item.name || 'ชีตไม่มีชื่อ')}</div>
          <div class="swipe-sub">${escapeHTML(item.url)}</div>
        </div>
        <div class="swipe-actions">
          <button type="button" class="swipe-btn copy" onclick="copySheetUrl('${escapeHTML(item.url)}')">📋 ก็อป</button>
          <button type="button" class="swipe-btn delete" onclick="deleteSavedSheet('${item.id}')">🗑️ ลบ</button>
        </div>
      </div>
    `;

    const contentEl = itemContainer.querySelector(`#sheet-item-${item.id}`);
    bindItemGestures(itemContainer, contentEl, {
      canSwipe: true,
      onLongPress: () => {
        selectedSheetsIds.add(item.id);
        renderSavedSheets();
      },
      onTap: () => {
        if (selectedSheetsIds.size > 0) {
          if (selectedSheetsIds.has(item.id)) selectedSheetsIds.delete(item.id);
          else selectedSheetsIds.add(item.id);
          renderSavedSheets();
        }
      }
    });

    container.appendChild(itemContainer);
  });
}

function renderFoldersView() {
  const container = document.getElementById('folders-view-container');
  const headerActions = document.getElementById('folders-header-actions');
  const selectActions = document.getElementById('folders-selection-actions');
  const countLabel = document.getElementById('folders-selected-count');

  if (!container) return;
  container.innerHTML = '';

  const totalSelected = selectedFoldersIds.size + selectedDecksIds.size;
  if (totalSelected > 0 || isCustomSorting) {
    headerActions.style.display = 'none';
    selectActions.style.display = 'flex';
    countLabel.textContent = isCustomSorting ? '✋ ลากย้ายลำดับ' : `เลือก ${totalSelected}`;
  } else {
    headerActions.style.display = 'flex';
    selectActions.style.display = 'none';
  }

  appState.folders.forEach(folder => {
    const folderBox = document.createElement('div');
    const isFolderSelected = selectedFoldersIds.has(folder.id);
    folderBox.className = `folder-acc-item ${isFolderSelected ? 'selected' : ''} ${isCustomSorting ? 'reorder-active' : ''}`;
    folderBox.dataset.folderId = folder.id;

    const header = document.createElement('div');
    header.className = 'folder-acc-header';
    header.innerHTML = `
      <span>${escapeHTML(folder.name)} (${folder.decks?.length || 0})</span>
      <button type="button" class="btn-toggle-accordion ${folder.isCollapsed ? 'collapsed' : ''}">▼</button>
    `;

    const toggleBtn = header.querySelector('.btn-toggle-accordion');
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      folder.isCollapsed = !folder.isCollapsed;
      saveState();
      renderFoldersView();
    };

    bindItemGestures(folderBox, header, {
      canSwipe: false,
      onLongPress: () => {
        selectedFoldersIds.add(folder.id);
        renderFoldersView();
      },
      onTap: () => {
        if (totalSelected > 0) {
          if (selectedFoldersIds.has(folder.id)) selectedFoldersIds.delete(folder.id);
          else selectedFoldersIds.add(folder.id);
          renderFoldersView();
        }
      }
    });

    const body = document.createElement('div');
    body.className = `folder-acc-body ${folder.isCollapsed ? 'hidden' : ''}`;

    (folder.decks || []).forEach(d => {
      const deckEl = document.createElement('div');
      const isDeckSelected = selectedDecksIds.has(d.id);
      deckEl.className = `swipe-item-container ${isDeckSelected ? 'selected' : ''} ${isCustomSorting ? 'reorder-active' : ''}`;
      deckEl.dataset.deckId = d.id;

      deckEl.innerHTML = `
        <div class="swipe-item-wrapper">
          <div class="swipe-content" id="deck-item-${d.id}">
            <div class="swipe-title">${escapeHTML(d.name)}</div>
            <div class="swipe-sub">${escapeHTML(d.tag || 'ไม่มีแท็ก')}</div>
          </div>
          <div class="swipe-actions">
            <button type="button" class="swipe-btn edit" onclick="editDeck('${folder.id}', '${d.id}')">✏️ แก้ไข</button>
            <button type="button" class="swipe-btn delete" onclick="deleteDeck('${d.id}', '${escapeHTML(d.name)}')">🗑️ ลบ</button>
          </div>
        </div>
      `;

      const contentEl = deckEl.querySelector(`#deck-item-${d.id}`);
      bindItemGestures(deckEl, contentEl, {
        canSwipe: true,
        onLongPress: () => {
          selectedDecksIds.add(d.id);
          renderFoldersView();
        },
        onTap: () => {
          if (totalSelected > 0) {
            if (selectedDecksIds.has(d.id)) selectedDecksIds.delete(d.id);
            else selectedDecksIds.add(d.id);
            renderFoldersView();
          } else if (!isCustomSorting) {
                  // เปลี่ยนจากเดิม switchAndPlayDeck เป็นเปิดหน้าต่าง Preview
        openDeckPreview(folder.id, d.id);
          }
        }
      });

      body.appendChild(deckEl);
    });

    folderBox.appendChild(header);
    folderBox.appendChild(body);
    container.appendChild(folderBox);
  });

  if (isCustomSorting) {
    bindTouchDragAndDrop(container);
  }
}
let pendingPlayFolderId = "";
let pendingPlayDeckId = "";

function openDeckPreview(folderId, deckId) {
  const folder = appState.folders.find(f => f.id === folderId);
  const deck = folder?.decks?.find(d => d.id === deckId);
  if (!deck) return;

  pendingPlayFolderId = folderId;
  pendingPlayDeckId = deckId;

  document.getElementById('preview-modal-title').textContent = `📖 รายการคำศัพท์: ${deck.name}`;
  const container = document.getElementById('preview-cards-table-container');

  if (deck.cards && deck.cards.length > 0) {
    let tableHtml = `
      <table class="preview-table">
        <thead>
          <tr>
            <th>ด้านหน้า (คำศัพท์)</th>
            <th>ด้านหลัง (คำแปล)</th>
            <th>คำใบ้</th>
          </tr>
        </thead>
        <tbody>
    `;
    deck.cards.forEach(c => {
      tableHtml += `
        <tr>
          <td>${renderCardContent(c.front)}</td>
          <td>${renderCardContent(c.back)}</td>
          <td>${escapeHTML(c.hint || '-')}</td>
        </tr>
      `;
    });
    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
  } else if (deck.sheetUrl) {
    container.innerHTML = `
      <div style="padding:16px; text-align:center;">
        <p style="font-size:13px; color:var(--text-dark); margin-bottom:8px;">ชุดคำนี้เชื่อมต่อกับ Google Sheets</p>
        <small style="font-size:11px; color:var(--text-muted); word-break:break-all;">${escapeHTML(deck.sheetUrl)}</small>
      </div>
    `;
  } else {
    container.innerHTML = '<p style="padding:16px; text-align:center; color:var(--text-muted);">ไม่พบข้อมูลคำศัพท์</p>';
  }

  openModal('preview-deck-modal');
}

function copySheetUrl(url) {
  navigator.clipboard.writeText(url).then(() => alert("📋 คัดลอกลิงก์เรียบร้อยแล้ว"));
}

function deleteSavedSheet(id) {
  if (!confirm("คุณต้องการลบลิงก์นี้ใช่หรือไม่?")) return;
  appState.savedSheets = appState.savedSheets.filter(s => s.id !== id);
  selectedSheetsIds.delete(id);
  saveState();
  renderSavedSheets();
}

function switchAndPlayDeck(folderId, deckId) {
  activeFolderId = folderId;
  activeDeckId = deckId;
  renderFolderDropdowns();
  renderDecks();
  selectDeck(deckId);
  switchTab('view-play');
}

function editDeck(folderId, deckId) {
  const folder = appState.folders.find(f => f.id === folderId);
  const deck = folder?.decks?.find(d => d.id === deckId);
  if (!deck) return;

  document.getElementById('deck-modal-title').textContent = "✏️ แก้ไขชุดคำศัพท์";
  document.getElementById('modal-folder-select').value = folderId;
  document.getElementById('modal-deck-name').value = deck.name.replace('🌸 ', '');
  document.getElementById('modal-sheet-url').value = deck.sheetUrl || "";
  document.getElementById('modal-paste-raw').value = (deck.cards || []).map(c => `${c.front}\t${c.back}\t${c.hint || ''}`).join('\n');
  document.getElementById('modal-deck-tag').value = deck.tag ? deck.tag.replace(/^[🏷️✨🔁🔥]\s*/, '') : "";
  document.getElementById('edit-deck-id').value = deck.id;

  switchCreateMode(deck.sheetUrl ? 'sheet' : 'paste');
  openModal('create-modal');
}

function deleteDeck(deckId, deckName) {
  if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบชุดคำ "${deckName}" ?`)) return;

  appState.folders.forEach(f => {
    f.decks = (f.decks || []).filter(d => d.id !== deckId);
  });

  const currentFolder = appState.folders.find(f => f.id === activeFolderId);
  if (activeDeckId === deckId) {
    activeDeckId = currentFolder?.decks[0]?.id || "";
  }

  saveState();
  renderAll();
  if (activeDeckId) selectDeck(activeDeckId);
  else clearCardDisplay();
}

function deleteFolderById(folderId) {
  if (appState.folders.length <= 1) {
    alert("⚠️ ต้องมีโฟลเดอร์เหลืออยู่อย่างน้อย 1 โฟลเดอร์");
    return;
  }
  const folder = appState.folders.find(f => f.id === folderId);
  if (!folder || !confirm(`คุณต้องการลบโฟลเดอร์ "${folder.name}" และชุดคำทั้งหมดใช่หรือไม่?`)) return;

  appState.folders = appState.folders.filter(f => f.id !== folderId);
  activeFolderId = appState.folders[0].id;
  activeDeckId = appState.folders[0].decks[0]?.id || "";

  saveState();
  renderAll();
  if (activeDeckId) selectDeck(activeDeckId);
  else clearCardDisplay();
}
// ==========================================
// 11. EXPORT / IMPORT BACKUP
// ==========================================
function exportBackupJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `sheetcards_backup_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importBackupJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      if (imported && imported.folders) {
        appState = imported;
        saveState();
        activeFolderId = appState.folders[0]?.id || "";
        activeDeckId = appState.folders[0]?.decks[0]?.id || "";
        renderAll();
        if (activeDeckId) selectDeck(activeDeckId);
        alert("✅ นำเข้าข้อมูลสำรองสำเร็จ!");
        closeModal('profile-modal');
      } else {
        alert("❌ รูปแบบไฟล์สำรองไม่ถูกต้อง");
      }
    } catch (err) {
      alert("❌ เกิดข้อผิดพลาดในการอ่านไฟล์");
    }
  };
  reader.readAsText(file);
}

// ==========================================
// 12. GENERAL HELPERS & NAVIGATION
// ==========================================
function openModal(id) { const m = document.getElementById(id); if (m) m.classList.add('open'); }
function closeModal(id) { const m = document.getElementById(id); if (m) m.classList.remove('open'); }

function applyTheme(themeName) {
  document.body.setAttribute('data-theme', themeName);
  appState.user.theme = themeName;
  saveState();
}

function updateAvatar(newAvatar) {
  appState.user.avatar = newAvatar;
  document.getElementById('profile-avatar').textContent = newAvatar;
  document.getElementById('bottom-avatar-icon').textContent = newAvatar;
  saveState();
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.bottom-nav .nav-item').forEach(i => i.classList.remove('active'));

  const targetView = document.getElementById(tabId);
  if (targetView) targetView.classList.add('active');

  const navBtn = document.querySelector(`.bottom-nav .nav-item[data-target="${tabId}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (tabId === 'view-sheets') renderSavedSheets();
  if (tabId === 'view-folders') renderFoldersView();
}

function renderAll() {
  renderFolderDropdowns();
  renderTags();
  renderDecks();
  renderSavedSheets();
  renderFoldersView();
   }
     
  // ==========================================
// 13. DOM INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const flashcard = document.getElementById('flashcard');
  const folderSelect = document.getElementById('folder-select');

  applyTheme(appState.user.theme || "vanilla-pink");
  updateAvatar(appState.user.avatar || "🌸");
  document.getElementById('profile-name').textContent = appState.user.name || "ผู้ใช้งานทั่วไป";

  // พลิกการ์ด
  if (flashcard) {
    flashcard.addEventListener('click', () => flashcard.classList.toggle('is-flipped'));
  }

  // ปุ่มควบคุมการ์ด 4 ปุ่ม
  const btnFirst = document.getElementById('btn-first');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnLast = document.getElementById('btn-last');

  if (btnFirst) btnFirst.addEventListener('click', () => { if (currentCards.length > 0 && currentIndex !== 0) changeCard(0); });
  if (btnPrev) btnPrev.addEventListener('click', () => { if (currentCards.length === 0) return; changeCard(currentIndex > 0 ? currentIndex - 1 : currentCards.length - 1); });
  if (btnNext) btnNext.addEventListener('click', () => { if (currentCards.length === 0) return; changeCard(currentIndex < currentCards.length - 1 ? currentIndex + 1 : 0); });
  if (btnLast) btnLast.addEventListener('click', () => { if (currentCards.length > 0 && currentIndex !== currentCards.length - 1) changeCard(currentCards.length - 1); });

  // ปุ่มสุ่ม & Reverse & Spaced Repetition
  document.getElementById('btn-shuffle-deck').addEventListener('click', shuffleCurrentDeck);
  document.getElementById('btn-reverse-deck').addEventListener('click', reverseCurrentDeck);
  document.getElementById('btn-spaced-pass').addEventListener('click', handleSpacedPass);
  document.getElementById('btn-spaced-repeat').addEventListener('click', handleSpacedRepeat);

  // ปุ่มคัดลอก Template มาตรฐาน
  document.getElementById('btn-copy-template').addEventListener('click', () => {
    const template = "คำศัพท์ (Front)\tคำแปล (Back)\tคำใบ้ (Hint)\nstudent\tนักเรียน, นักศึกษา\tคำนาม\nhttps://example.com/image.png\tคำแปลรูปภาพ\tคำใบ้";
    navigator.clipboard.writeText(template).then(() => alert("📋 คัดลอกตารางแม่แบบเรียบร้อยแล้ว"));
  });

  // คีย์บอร์ดชอร์ตคัตสำหรับคอมพิวเตอร์
  window.addEventListener('keydown', (e) => {
    if (['input', 'textarea'].includes(document.activeElement.tagName.toLowerCase())) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (flashcard) flashcard.classList.toggle('is-flipped');
    } else if (e.code === 'ArrowLeft') {
      if (btnPrev) btnPrev.click();
    } else if (e.code === 'ArrowRight') {
      if (btnNext) btnNext.click();
    } else if (e.key.toLowerCase() === 's') {
      shuffleCurrentDeck();
    }
  });

  // จัดการแท็บแถบล่าง
  document.querySelectorAll('.bottom-nav .nav-item[data-target]').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.target));
  });

  // ปุ่มกากบาทออกจากโหมดเต็มจอแนวนอน
  const btnExitLandscape = document.getElementById('btn-exit-landscape');
  if (btnExitLandscape) {
    btnExitLandscape.addEventListener('click', () => {
      document.body.classList.toggle('exit-fullscreen-landscape');
    });
  }
// ปุ่มโหมดการ์ดเดี่ยว (Focus Mode)
const btnFocusMode = document.getElementById('btn-focus-mode');
if (btnFocusMode) {
btnFocusMode.addEventListener('click', () => {
document.body.classList.toggle('focus-single-card');
});
}
// แตะปุ่มกากบาทเพื่อออกจาก Focus Mode
if (btnExitLandscape) {
btnExitLandscape.addEventListener('click', () => {
document.body.classList.remove('focus-single-card');
});
}
// แตะแท็บเล่นการ์ดซ้ำเพื่อรีเซ็ตสำรับ
const navPlay = document.getElementById('nav-play');
if (navPlay) {
navPlay.addEventListener('click', () => {
if (document.getElementById('view-play').classList.contains('active')) {
restartCurrentDeck();
}
});
}
// ปุ่มเริ่มเล่นการ์ดจาก Modal พรีวิว
const btnStartPlay = document.getElementById('btn-start-play-deck');
if (btnStartPlay) {
btnStartPlay.addEventListener('click', () => {
closeModal('preview-deck-modal');
if (pendingPlayFolderId && pendingPlayDeckId) {
switchAndPlayDeck(pendingPlayFolderId, pendingPlayDeckId);
}
});
}
// ผูกปุ่มออกจากระบบ
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
btnLogout.addEventListener('click', logoutUser);
}
// อัปเดตสถานะปุ่มล็อกอิน/ออกจากระบบเริ่มต้น
updateAuthUI();
  // ลบหลายรายการในคลังชีต
  document.getElementById('btn-delete-selected-sheets').addEventListener('click', () => {
    if (selectedSheetsIds.size === 0) return;
    if (!confirm(`คุณต้องการลบลิงก์ชีตที่เลือกทั้งหมด ${selectedSheetsIds.size} รายการใช่หรือไม่?`)) return;
    appState.savedSheets = appState.savedSheets.filter(s => !selectedSheetsIds.has(s.id));
    selectedSheetsIds.clear();
    saveState();
    renderSavedSheets();
  });

  document.getElementById('btn-cancel-sheets-selection').addEventListener('click', () => {
    selectedSheetsIds.clear();
    renderSavedSheets();
  });

  // ลบหลายรายการในหน้าโฟลเดอร์
  document.getElementById('btn-delete-selected-folders').addEventListener('click', () => {
    const total = selectedFoldersIds.size + selectedDecksIds.size;
    if (total === 0 || !confirm(`คุณต้องการลบรายการที่เลือกทั้งหมด ${total} รายการใช่หรือไม่?`)) return;

    if (selectedFoldersIds.size > 0) {
      if (appState.folders.length - selectedFoldersIds.size < 1) {
        alert("⚠️ ต้องมีโฟลเดอร์เหลืออยู่อย่างน้อย 1 โฟลเดอร์");
        return;
      }
      appState.folders = appState.folders.filter(f => !selectedFoldersIds.has(f.id));
      activeFolderId = appState.folders[0]?.id || "";
    }

    if (selectedDecksIds.size > 0) {
      appState.folders.forEach(f => {
        f.decks = (f.decks || []).filter(d => !selectedDecksIds.has(d.id));
      });
    }

    selectedFoldersIds.clear();
    selectedDecksIds.clear();
    saveState();
    renderAll();
    if (activeDeckId) selectDeck(activeDeckId);
  });

  document.getElementById('btn-cancel-folders-selection').addEventListener('click', () => {
    selectedFoldersIds.clear();
    selectedDecksIds.clear();
    isCustomSorting = false;
    renderFoldersView();
  });

  // เมนูเรียงลำดับ
  document.getElementById('btn-open-sort-menu').addEventListener('click', () => openModal('sort-modal'));
  document.getElementById('btn-sort-alphabet').addEventListener('click', () => {
    appState.folders.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    appState.folders.forEach(f => (f.decks || []).sort((a, b) => a.name.localeCompare(b.name, 'th')));
    saveState();
    renderAll();
    closeModal('sort-modal');
  });

  document.getElementById('btn-sort-date').addEventListener('click', () => {
    dateSortAscending = !dateSortAscending;
    document.getElementById('date-sort-indicator').textContent = dateSortAscending ? 'แรก ➔ ท้าย' : 'ท้าย ➔ แรก';
    appState.folders.sort((a, b) => dateSortAscending ? (a.createdAt||0) - (b.createdAt||0) : (b.createdAt||0) - (a.createdAt||0));
    saveState();
    renderAll();
    closeModal('sort-modal');
  });

  document.getElementById('btn-sort-custom').addEventListener('click', () => {
    isCustomSorting = true;
    closeModal('sort-modal');
    renderFoldersView();
  });

  // สลับโฟลเดอร์หลัก
  if (folderSelect) {
    folderSelect.addEventListener('change', (e) => {
      activeFolderId = e.target.value;
      const folder = appState.folders.find(f => f.id === activeFolderId);
      activeDeckId = folder?.decks[0]?.id || "";
      renderDecks();
      if (activeDeckId) selectDeck(activeDeckId);
      else clearCardDisplay();
    });
  }

  // ลบโฟลเดอร์ปัจจุบัน
  const btnDeleteFolder = document.getElementById('btn-delete-folder');
  if (btnDeleteFolder) {
    btnDeleteFolder.addEventListener('click', () => deleteFolderById(activeFolderId));
  }

  // บันทึกฝากลิงก์ชีต
  document.getElementById('btn-open-add-sheet').addEventListener('click', () => openModal('add-sheet-modal'));
  document.getElementById('btn-confirm-save-sheet').addEventListener('click', (e) => {
    e.preventDefault();
    const name = document.getElementById('input-saved-sheet-name').value.trim();
    const url = document.getElementById('input-saved-sheet-url').value.trim();
    if (!url) { alert("กรุณาวางลิงก์ชีต"); return; }

    appState.savedSheets.unshift({ id: "sheet_" + Date.now(), name: name || "ชีตไม่มีชื่อ", url: url, createdAt: Date.now() });
    saveState();
    renderSavedSheets();
    closeModal('add-sheet-modal');
  });

  // บันทึกสร้าง/แก้ไขโฟลเดอร์
  document.getElementById('btn-add-folder').addEventListener('click', () => {
    document.getElementById('folder-modal-title').textContent = "📁 สร้างโฟลเดอร์ใหม่";
    document.getElementById('edit-folder-id').value = "";
    document.getElementById('new-folder-name').value = "";
    openModal('folder-modal');
  });

  document.getElementById('btn-folder-view-add').addEventListener('click', () => {
    document.getElementById('folder-modal-title').textContent = "📁 สร้างโฟลเดอร์ใหม่";
    document.getElementById('edit-folder-id').value = "";
    document.getElementById('new-folder-name').value = "";
    openModal('folder-modal');
  });

  document.getElementById('btn-save-folder').addEventListener('click', (e) => {
    e.preventDefault();
    const name = document.getElementById('new-folder-name').value.trim();
    const editId = document.getElementById('edit-folder-id').value;
    if (!name) return;

    if (editId) {
      const f = appState.folders.find(x => x.id === editId);
      if (f) f.name = `📁 ${name}`;
    } else {
      const newF = { id: "folder_" + Date.now(), name: `📁 ${name}`, createdAt: Date.now(), isCollapsed: false, decks: [] };
      appState.folders.push(newF);
      activeFolderId = newF.id;
      activeDeckId = "";
    }

    saveState();
    renderAll();
    closeModal('folder-modal');
  });

  // บันทึกสร้าง/แก้ไขชุดคำ (Dual-Mode)
  document.getElementById('btn-save-deck').addEventListener('click', (e) => {
    e.preventDefault();

    const targetFolderId = document.getElementById('modal-folder-select').value;
    const deckName = document.getElementById('modal-deck-name').value.trim();
    const pasteRaw = document.getElementById('modal-paste-raw').value;
    const sheetUrl = document.getElementById('modal-sheet-url').value.trim();
    const tag = document.getElementById('modal-deck-tag').value.trim();
    const editId = document.getElementById('edit-deck-id').value;

    if (!deckName) { alert("กรุณากรอกชื่อชุดคำ"); return; }

    let parsedCards = [];
    if (currentCreateMode === 'paste' && pasteRaw) {
      parsedCards = parsePastedText(pasteRaw);
    }

    const folder = appState.folders.find(f => f.id === targetFolderId);
    if (folder) {
      const formattedTag = tag ? (tag.startsWith("🏷️") || tag.startsWith("✨") || tag.startsWith("🔁") || tag.startsWith("🔥") ? tag : `🏷️ ${tag}`) : "";

      if (editId) {
        const deck = folder.decks.find(d => d.id === editId);
        if (deck) {
          deck.name = `🌸 ${deckName}`;
          deck.tag = formattedTag;
          if (currentCreateMode === 'paste') {
            deck.cards = parsedCards;
            deck.sheetUrl = "";
          } else {
            deck.sheetUrl = sheetUrl;
            deck.cards = [];
          }
        }
      } else {
        const newDeck = {
          id: "deck_" + Date.now(),
          name: `🌸 ${deckName}`,
          cards: currentCreateMode === 'paste' ? parsedCards : [],
          sheetUrl: currentCreateMode === 'sheet' ? sheetUrl : "",
          tag: formattedTag,
          createdAt: Date.now()
        };
        if (!folder.decks) folder.decks = [];
        folder.decks.push(newDeck);
        activeDeckId = newDeck.id;
      }

      saveState();
      activeFolderId = targetFolderId;
      renderAll();
      selectDeck(activeDeckId || folder.decks[0]?.id);
      closeModal('create-modal');
    }
  });

  // บันทึกแท็ก
  document.getElementById('btn-save-tag').addEventListener('click', () => {
    const tagName = document.getElementById('new-tag-name').value.trim();
    if (tagName && !appState.tags.includes(tagName)) {
      appState.tags.push(`🏷️ ${tagName}`);
      saveState();
      renderTags();
      closeModal('tag-modal');
    }
  });

  // หน้าโปรไฟล์ & Backup
  document.getElementById('nav-profile').addEventListener('click', () => {
    let totalDecks = 0;
    appState.folders.forEach(f => totalDecks += (f.decks ? f.decks.length : 0));
    document.getElementById('stat-folders').textContent = appState.folders.length;
    document.getElementById('stat-decks').textContent = totalDecks;
    document.getElementById('profile-name').textContent = appState.user.name;
    document.getElementById('profile-status').textContent = appState.user.type === 'google' 
      ? '🔗 บัญชี Google (เชื่อมต่อชีตโดยตรง)' 
      : '👤 บัญชีในเครื่อง (Local)';
    openModal('profile-modal');
  });

  document.getElementById('btn-export-backup').addEventListener('click', exportBackupJSON);
  document.getElementById('import-backup-file').addEventListener('change', importBackupJSON);

  // สร้างบัญชีในเครื่อง
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
      document.getElementById('profile-name').textContent = username;
      closeModal('local-user-modal');
      alert(`✅ บันทึกตัวตน "${username}" สำเร็จ`);
    }
  });

  // ผูกปุ่มล็อกอิน Google
  document.getElementById('btn-login-google').addEventListener('click', loginWithGoogle);

  // เปลี่ยนธีม & Avatar
  document.querySelectorAll('.theme-btn').forEach(btn => btn.addEventListener('click', () => applyTheme(btn.dataset.theme)));
  document.querySelectorAll('.avatar-btn').forEach(btn => btn.addEventListener('click', () => updateAvatar(btn.dataset.avatar)));

  // เริ่มต้นแสดงผลระบบทั้งหมด
  renderAll();
  if (activeDeckId) selectDeck(activeDeckId);
  else renderCard();
});
