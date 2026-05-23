/* ============================================================
   저메추 룰렛 — index.js
   Vanilla JS + Canvas API  |  No external dependencies
   ============================================================ */

'use strict';

/* ── 상수 ────────────────────────────────────────────────── */
const DEFAULT_MENUS = [
  '제육볶음', '돈까스', '초밥', '치킨', '삼겹살', '짜장면',
  '부대찌개', '마라탕', '파스타', '햄버거', '떡볶이', '연어샐러드'
];

/*
 * ── 프리셋 키워드 분석 큐레이션 ─────────────────────────
 * office : 직장인 점심·저녁 | 빠른 한식, 회식 단골, 가성비
 * solo   : 자취생 초간단   | 혼자·빠르게·저렴하게, 인스턴트 허용
 * health : 건강·다이어트   | 저칼로리·고단백·식이섬유 중심
 * night  : 침샘자극 야식   | 자극적·배달·포장마차 분위기
 */
const PRESETS = {
  office: ['국밥', '삼겹살', '된장찌개', '갈비탕', '제육볶음', '김치찌개', '냉면', '돈까스'],
  solo:   ['라면', '계란볶음밥', '냉동만두', '참치마요밥', '토스트', '짜파게티', '즉석카레', '컵라면'],
  health: ['닭가슴살', '두부구이', '연어샐러드', '채소비빔밥', '아보카도토스트', '귀리죽', '그릭요거트', '현미밥'],
  night:  ['치킨', '피자', '떡볶이', '마라탕', '족발', '순대볶음', '라볶이', '양념갈비'],
};

const WHEEL_COLORS = [
  '#ff5e62', '#ff9966', '#ffde17', '#56ab2f',
  '#a8ff78', '#00c6ff', '#0072ff', '#fbc7d4',
  '#9796f0', '#b06ab3',
];

const MAX_ITEMS    = 12;
const STORAGE_KEY  = 'dinner_todos';
const MY_MENU_KEY  = 'my_menu_preset';
const CANVAS_SIZE  = 450; // CSS px (논리 해상도)

/* ── 상태 ────────────────────────────────────────────────── */
let menuItems    = [];   // { id: number, text: string, isEnabled: boolean }
let myMenuPreset = [];   // string[]
let currentAngle = -Math.PI / 2; // 룰렛 현재 각도 (0번 슬라이스 = 상단)
let isSpinning   = false;
let animFrameId  = null;
let idSeed       = 0;    // 고유 ID 생성용
let activePreset = null; // 현재 활성 프리셋 키 ('office'|'solo'|'health'|'night'|'my'|null)

/* ── DPR 대응 Canvas 설정 ────────────────────────────────── */
const canvas = document.getElementById('rouletteCanvas');
const ctx    = canvas.getContext('2d');
const DPR    = window.devicePixelRatio || 1;

(function setupCanvas() {
  // 드로잉 버퍼: 고해상도 (DPR 배율)로 설정 — 좌표계는 0~CANVAS_SIZE(450)로 유지
  canvas.width  = CANVAS_SIZE * DPR;
  canvas.height = CANVAS_SIZE * DPR;
  // ↑ 인라인 style.width/height 는 설정하지 않음.
  //   CSS `width/height: var(--wheel-size)` 가 표시 크기를 담당 →
  //   브레이크포인트별로 450 / 380 / 300 / 270px 로 자동 축소.
  //   canvas 내부 드로잉은 항상 450px 좌표계에서 진행하고,
  //   브라우저가 CSS 크기에 맞춰 비율 유지하며 스케일링함.
  ctx.scale(DPR, DPR);
})();

/* ── DOM 참조 ─────────────────────────────────────────────── */
const spinBtn        = document.getElementById('spinBtn');
const quickPickBtn   = document.getElementById('quickPickBtn');
const menuForm       = document.getElementById('menuForm');
const menuInput      = document.getElementById('menuInput');
const addBtn         = document.getElementById('addBtn');
const badgeContainer = document.getElementById('badgeContainer');
const activeCountEl  = document.getElementById('activeCount');
const clearAllBtn    = document.getElementById('clearAllBtn');
const defaultMenuBtn = document.getElementById('defaultMenuBtn');
const myMenuLoadBtn  = document.getElementById('myMenuLoadBtn');
const myMenuSaveBtn  = document.getElementById('myMenuSaveBtn');
const resultModal    = document.getElementById('resultModal');
const modalEmoji     = document.getElementById('modalEmoji');
const modalLabel     = document.getElementById('modalLabel');
const modalResult    = document.getElementById('modalResult');
const modalRetryBtn  = document.getElementById('modalRetryBtn');
const modalCloseBtn  = document.getElementById('modalCloseBtn');
const toastContainer = document.getElementById('toastContainer');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon      = themeToggleBtn.querySelector('.theme-icon');

/* ═══════════════════════════════════════════════════════════
   로컬스토리지 영속성
   ═══════════════════════════════════════════════════════════ */
function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(menuItems));
}

function saveMyMenu() {
  localStorage.setItem(MY_MENU_KEY, JSON.stringify(myMenuPreset));
}

/**
 * 로컬스토리지에서 메뉴 로드
 * @returns {boolean} 데이터 존재 여부
 */
function loadStoredItems() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return false;
    menuItems = parsed;
    idSeed = menuItems.reduce((max, m) => Math.max(max, (m.id || 0) + 1), 0);
    return true;
  } catch {
    return false;
  }
}

function loadStoredMyMenu() {
  const raw = localStorage.getItem(MY_MENU_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) myMenuPreset = parsed;
  } catch { /* noop */ }
}

/* ═══════════════════════════════════════════════════════════
   Canvas 룰렛 드로잉
   ═══════════════════════════════════════════════════════════ */
function drawWheel() {
  const cx = CANVAS_SIZE / 2;
  const cy = CANVAS_SIZE / 2;
  const R  = cx - 10; // 반지름

  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const active = menuItems.filter(m => m.isEnabled);
  const N = active.length;

  /* 빈 상태 */
  if (N === 0) {
    _drawEmptyWheel(cx, cy, R);
    return;
  }

  /* 1개 단독 */
  if (N === 1) {
    _drawSingleSlice(cx, cy, R, active[0].text);
    return;
  }

  /* 2개 이상 — 부채꼴 분할 */
  const sliceAngle = (Math.PI * 2) / N;
  const { fontSize, maxLen, textR } = _textParams(N, R);

  for (let i = 0; i < N; i++) {
    const startA = currentAngle + i * sliceAngle;
    const endA   = startA + sliceAngle;
    const color  = WHEEL_COLORS[i % WHEEL_COLORS.length];

    /* 부채꼴 — 중심까지 꽉 채움 */
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, startA, endA);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    /* 구분선 */
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    /* 텍스트 — 슬라이스 중앙 정렬 */
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(startA + sliceAngle / 2);
    ctx.textAlign    = 'center';   // ← 중앙 정렬
    ctx.textBaseline = 'middle';
    ctx.font         = `bold ${fontSize}px "Noto Sans KR", sans-serif`;
    ctx.fillStyle    = '#fff';
    ctx.shadowColor  = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur   = 5;

    let label = active[i].text;
    if (label.length > maxLen) label = label.slice(0, maxLen) + '…';
    ctx.fillText(label, textR, 0);   // textR = 슬라이스 시각 중심

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /* 외곽 링 */
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth   = 7;
  ctx.stroke();

  /* ── 중앙 허브 장식 링 (구멍 없음, SPIN 버튼 경계 강조) ── */
  // 바깥 글로우 링
  ctx.beginPath();
  ctx.arc(cx, cy, 50, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth   = 2.5;
  ctx.stroke();

  // 내부 반투명 채우기 (버튼 뒤 슬라이스 수렴점을 깔끔하게)
  ctx.beginPath();
  ctx.arc(cx, cy, 49, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,120,0,0.18)';
  ctx.fill();
}

/* ── 테마별 Canvas 색상 헬퍼 ─────────────────────────────── */
function _isLight() { return document.body.classList.contains('light'); }

function _canvasColors() {
  const light = _isLight();
  return {
    emptyFill:   light ? 'rgba(235,228,255,0.85)' : 'rgba(40,36,60,0.8)',
    emptyStroke: light ? 'rgba(110,80,180,0.15)'  : 'rgba(255,255,255,0.07)',
    emptyText:   light ? 'rgba(90,88,130,0.7)'    : 'rgba(160,160,180,0.6)',
    centerFill:  light ? 'rgba(248,246,255,0.95)'  : 'rgba(20,18,32,0.92)',
    centerStroke:light ? 'rgba(110,80,180,0.15)'   : 'rgba(255,255,255,0.2)',
  };
}

/* ── 빈 휠 ───────────────────────────────────────────────── */
function _drawEmptyWheel(cx, cy, R) {
  const c = _canvasColors();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = c.emptyFill;
  ctx.fill();
  ctx.strokeStyle = c.emptyStroke;
  ctx.lineWidth   = 5;
  ctx.stroke();

  ctx.fillStyle    = c.emptyText;
  ctx.font         = '15px "Noto Sans KR", sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('메뉴를 추가해주세요', cx, cy);
  ctx.textBaseline = 'alphabetic';
}

/* ── 1개짜리 휠 ──────────────────────────────────────────── */
function _drawSingleSlice(cx, cy, R, text) {
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = WHEEL_COLORS[0];
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth   = 7;
  ctx.stroke();

  ctx.fillStyle    = '#fff';
  ctx.font         = 'bold 20px "Noto Sans KR", sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur   = 5;
  ctx.fillText(text, cx, cy);
  ctx.shadowBlur   = 0;
  ctx.textBaseline = 'alphabetic';

  /* 중앙 허브 링 */
  ctx.beginPath();
  ctx.arc(cx, cy, 50, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth   = 2.5;
  ctx.stroke();
}

/* ── 텍스트 파라미터 계산 ─────────────────────────────────── */
// textR: SPIN 버튼 끝(~50px) ~ 원판 끝(R) 사이의 시각 중심
// center = (50 + R) / 2 ≈ R * 0.60  (R=215일 때 약 132.5px)
function _textParams(N, R) {
  const textR = (50 + R) / 2;   // 슬라이스 가용 영역의 중앙
  if (N <= 4)   return { fontSize: 17, maxLen: 9,  textR };
  if (N <= 6)   return { fontSize: 15, maxLen: 7,  textR };
  if (N <= 8)   return { fontSize: 13, maxLen: 6,  textR };
  if (N <= 10)  return { fontSize: 12, maxLen: 5,  textR };
  /* N <= 12 */ return { fontSize: 11, maxLen: 5,  textR };
}

/* ═══════════════════════════════════════════════════════════
   당첨 계산 (상단 인디케이터 = -π/2 기준)
   ═══════════════════════════════════════════════════════════ */
function getWinner() {
  const active = menuItems.filter(m => m.isEnabled);
  const N = active.length;
  if (N === 0) return null;
  if (N === 1) return active[0];

  const sliceAngle = (Math.PI * 2) / N;
  // 인디케이터(-π/2)가 가리키는 각도를 currentAngle 기준으로 역산
  const raw        = (-Math.PI / 2) - currentAngle;
  const normalized = ((raw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const idx        = Math.floor(normalized / sliceAngle) % N;
  return active[idx];
}

/* ═══════════════════════════════════════════════════════════
   회전 애니메이션 (Cubic Ease-Out)
   ═══════════════════════════════════════════════════════════ */
function spin() {
  if (isSpinning) return;

  const active = menuItems.filter(m => m.isEnabled);
  if (active.length < 2) {
    showToast('활성화된 메뉴가 최소 2개 이상 필요합니다!', 'warn');
    return;
  }

  isSpinning = true;
  setSpinUI(true);

  // 5~8바퀴 + 랜덤 추가 각도
  const rotations     = 5 + Math.random() * 3;
  const extraAngle    = Math.random() * Math.PI * 2;
  const totalRotation = Math.PI * 2 * rotations + extraAngle;
  const startAngle    = currentAngle;
  const duration      = 3800 + Math.random() * 1400; // 3.8~5.2s
  const startTime     = performance.now();

  function animate(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Cubic Ease-Out: f(t) = 1 - (1-t)^3
    const eased    = 1 - Math.pow(1 - progress, 3);

    currentAngle = startAngle + totalRotation * eased;
    drawWheel();

    if (progress < 1) {
      animFrameId = requestAnimationFrame(animate);
    } else {
      // 각도 정규화 (누적 방지)
      currentAngle = ((currentAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      isSpinning   = false;
      setSpinUI(false);

      const winner = getWinner();
      if (winner) {
        setTimeout(() => showResultModal(winner.text, false), 280);
      }
    }
  }

  animFrameId = requestAnimationFrame(animate);
}

/* ── 번개 추천 (즉시 선택) ───────────────────────────────── */
function quickPick() {
  if (isSpinning) return;

  const active = menuItems.filter(m => m.isEnabled);
  if (active.length === 0) {
    showToast('활성화된 메뉴가 없습니다!', 'warn');
    return;
  }

  const winner = active[Math.floor(Math.random() * active.length)];
  showResultModal(winner.text, true);
}

/* ═══════════════════════════════════════════════════════════
   UI 상태 관리
   ═══════════════════════════════════════════════════════════ */
function setSpinUI(spinning) {
  spinBtn.disabled      = spinning;
  quickPickBtn.disabled = spinning;
  addBtn.disabled       = spinning || menuItems.length >= MAX_ITEMS;
  menuInput.disabled    = spinning || menuItems.length >= MAX_ITEMS;
  spinBtn.classList.toggle('is-spinning', spinning);
}

function updateCount() {
  activeCountEl.textContent = menuItems.filter(m => m.isEnabled).length;
}

function updateInputState() {
  const full = menuItems.length >= MAX_ITEMS;
  addBtn.disabled    = full || isSpinning;
  menuInput.disabled = full || isSpinning;
  menuInput.placeholder = full
    ? '최대 12개에 도달했습니다'
    : '추가할 메뉴 입력 (예: 제육볶음, 돈까스)';
}

function updateMyMenuBtn() {
  const hasSaved = myMenuPreset.length > 0;
  myMenuLoadBtn.classList.toggle('has-saved', hasSaved);
  myMenuLoadBtn.title = hasSaved
    ? `저장된 나의 메뉴 (${myMenuPreset.length}개): ${myMenuPreset.slice(0,3).join(', ')}${myMenuPreset.length > 3 ? ' …' : ''}`
    : '아직 저장된 나의 메뉴가 없습니다.';
}

/* ─ 뱃지 렌더링 ────────────────────────────────────────── */
function renderBadges() {
  badgeContainer.innerHTML = '';

  menuItems.forEach((item, idx) => {
    const color = WHEEL_COLORS[idx % WHEEL_COLORS.length];
    const badge = document.createElement('div');
    badge.className = `badge${item.isEnabled ? '' : ' badge-disabled'}`;
    badge.dataset.id = item.id;

    // 뱃지 내부 구성
    const dot  = document.createElement('span');
    dot.className = 'badge-dot';
    dot.style.background = color;

    const txt  = document.createElement('span');
    txt.className   = 'badge-text';
    txt.textContent = item.text;
    txt.title       = item.text;

    const del  = document.createElement('button');
    del.className   = 'badge-del';
    del.dataset.id  = item.id;
    del.textContent = '✕';
    del.setAttribute('aria-label', `${item.text} 삭제`);

    badge.appendChild(dot);
    badge.appendChild(txt);
    badge.appendChild(del);
    badgeContainer.appendChild(badge);

    // 뱃지 클릭 → 토글 (삭제 버튼 클릭은 제외)
    badge.addEventListener('click', e => {
      if (e.target === del || e.target.classList.contains('badge-del')) return;
      if (isSpinning) return;
      toggleItem(item.id);
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   데이터 조작 (CRUD)
   ═══════════════════════════════════════════════════════════ */
function addItem(text) {
  text = text.trim();
  if (!text) return false;

  if (menuItems.length >= MAX_ITEMS) {
    showToast('최대 12개까지만 추가할 수 있습니다.', 'warn');
    return false;
  }
  if (menuItems.some(m => m.text === text)) {
    showToast(`"${text}"은 이미 목록에 있어요.`, 'info');
    return false;
  }

  menuItems.push({ id: idSeed++, text, isEnabled: true });
  setActivePreset(null); // 수동 편집 → 프리셋 하이라이트 해제
  sync();
  return true;
}

function removeItem(id) {
  menuItems = menuItems.filter(m => m.id !== id);
  setActivePreset(null);
  sync();
}

function toggleItem(id) {
  const item = menuItems.find(m => m.id === id);
  if (item) { item.isEnabled = !item.isEnabled; sync(); }
  // 토글은 프리셋 해제 안 함 (구성은 동일하므로)
}

function clearAll() {
  menuItems = [];
  setActivePreset(null);
  sync();
}

function loadDefault() {
  idSeed    = 0;
  menuItems = DEFAULT_MENUS.map(text => ({ id: idSeed++, text, isEnabled: true }));
  setActivePreset(null); // 기본메뉴는 별도 상태
  sync();
}

/**
 * 프리셋 메뉴로 현재 목록을 교체 (Replace 방식)
 * @param {string}  key    - 프리셋 키
 * @param {boolean} silent - true이면 토스트 표시 안 함 (init 초기 로드용)
 */
function applyPreset(key, silent = false) {
  const items = PRESETS[key];
  if (!items) return;

  idSeed    = 0;
  menuItems = items.map(text => ({ id: idSeed++, text, isEnabled: true }));

  setActivePreset(key);
  sync();

  if (!silent) {
    const LABELS = { office: '직장인 인기', solo: '자취생 초간단', health: '건강 & 다이어트', night: '침샘자극 야식' };
    showToast(`[${LABELS[key]}] 프리셋으로 변경되었습니다.`, 'success');
  }
}

/**
 * 활성 프리셋 버튼 하이라이트 업데이트 + localStorage 저장
 * @param {string|null} key - 활성화할 프리셋 키 (null = 전체 해제)
 */
function setActivePreset(key) {
  activePreset = key;
  // 영속성: 새로고침 후에도 하이라이트 복원
  if (key) {
    localStorage.setItem('active_preset', key);
  } else {
    localStorage.removeItem('active_preset');
  }
  // 모든 프리셋 버튼에서 active 제거 후 해당 버튼만 활성화
  document.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
    btn.classList.toggle('preset-active', btn.dataset.preset === key);
  });
  // 나의 메뉴 버튼 활성 상태
  myMenuLoadBtn.classList.toggle('preset-active', key === 'my');
}

/** 현재 목록을 나의 메뉴로 저장 */
function saveMyMenuFn() {
  if (menuItems.length === 0) {
    showToast('저장할 메뉴가 없습니다.', 'warn');
    return;
  }
  myMenuPreset = menuItems.map(m => m.text);
  saveMyMenu();
  updateMyMenuBtn();
  showToast(`⭐ 나의 메뉴 ${myMenuPreset.length}개가 저장되었습니다!`, 'success');
}

/** 나의 메뉴 불러오기 (현재 목록 교체) */
function loadMyMenuFn() {
  if (myMenuPreset.length === 0) {
    showToast('저장된 나의 메뉴가 없습니다. 먼저 💾 저장을 눌러주세요!', 'warn');
    return;
  }
  idSeed    = 0;
  menuItems = myMenuPreset.map(text => ({ id: idSeed++, text, isEnabled: true }));
  setActivePreset('my'); // 나의 메뉴 활성 표시
  sync();
  showToast(`⭐ 나의 메뉴 ${myMenuPreset.length}개를 불러왔습니다!`, 'success');
}

/** 상태 변경 후 일괄 동기화 */
function sync() {
  saveItems();
  renderBadges();
  updateCount();
  updateInputState();
  drawWheel();
}

/* ═══════════════════════════════════════════════════════════
   다크 / 라이트 테마
   ═══════════════════════════════════════════════════════════ */

/** localStorage에서 저장된 테마 읽어서 적용 */
function initTheme() {
  const saved = localStorage.getItem('app_theme') || 'dark';
  applyTheme(saved, false); // 최초는 토스트 없이 조용히 적용
}

/** 현재 테마를 토글 */
function toggleTheme() {
  const current = document.body.classList.contains('light') ? 'light' : 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark', true);
}

/**
 * 테마 적용
 * @param {'dark'|'light'} theme
 * @param {boolean} showNotice - 토스트 표시 여부
 */
function applyTheme(theme, showNotice = true) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light', isLight);

  // 아이콘 전환 (애니메이션 리셋 포함)
  themeIcon.style.transform = 'scale(0.6) rotate(-30deg)';
  setTimeout(() => {
    themeIcon.textContent     = isLight ? '☀️' : '🌙';
    themeIcon.style.transform = '';
  }, 140);

  localStorage.setItem('app_theme', theme);

  // Canvas 즉시 재렌더 (테마 색상 반영)
  drawWheel();

  if (showNotice) {
    showToast(isLight ? '☀️ 라이트 모드로 변경되었습니다.' : '🌙 다크 모드로 변경되었습니다.', 'info');
  }
}

/* ═══════════════════════════════════════════════════════════
   토스트 알림
   ═══════════════════════════════════════════════════════════ */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className   = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  // 다음 프레임에 show 클래스 → CSS transition 트리거
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 380);
  }, 2800);
}

/* ═══════════════════════════════════════════════════════════
   결과 모달
   ═══════════════════════════════════════════════════════════ */
function showResultModal(text, isQuick) {
  modalEmoji.textContent  = isQuick ? '⚡' : '🎉';
  modalLabel.textContent  = isQuick ? '번개 추천 결과!' : '오늘의 메뉴!';
  modalResult.textContent = text;

  // emoji 재애니메이션
  modalEmoji.style.animation = 'none';
  void modalEmoji.offsetWidth; // reflow
  modalEmoji.style.animation  = '';

  resultModal.classList.add('active');
}

function closeModal() {
  resultModal.classList.remove('active');
}

/* ═══════════════════════════════════════════════════════════
   이벤트 바인딩
   ═══════════════════════════════════════════════════════════ */
// 테마 토글
themeToggleBtn.addEventListener('click', toggleTheme);

// SPIN
spinBtn.addEventListener('click', spin);

// 번개 추천
quickPickBtn.addEventListener('click', quickPick);

// 메뉴 추가 폼
menuForm.addEventListener('submit', e => {
  e.preventDefault();
  if (isSpinning) return;
  const text = menuInput.value.trim();
  if (!text) return;
  if (addItem(text)) {
    menuInput.value = '';
    menuInput.focus();
  }
});

// 뱃지 삭제 (이벤트 위임)
badgeContainer.addEventListener('click', e => {
  const del = e.target.closest('.badge-del');
  if (del && !isSpinning) {
    removeItem(Number(del.dataset.id));
  }
});

// 전체 삭제
clearAllBtn.addEventListener('click', () => {
  if (isSpinning) return;
  clearAll();
  showToast('전체 삭제되었습니다.', 'info');
});

// 기본 메뉴
defaultMenuBtn.addEventListener('click', () => {
  if (isSpinning) return;
  loadDefault();
  showToast('기본 메뉴 12종을 불러왔습니다.', 'success');
});

// 프리셋 버튼 (data-preset 속성 기반)
document.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (isSpinning) return;
    applyPreset(btn.dataset.preset);
  });
});

// 나의 메뉴 저장
myMenuSaveBtn.addEventListener('click', () => {
  if (isSpinning) return;
  saveMyMenuFn();
});

// 나의 메뉴 불러오기
myMenuLoadBtn.addEventListener('click', () => {
  if (isSpinning) return;
  loadMyMenuFn();
});

// 모달 — 확인
modalCloseBtn.addEventListener('click', closeModal);

// 모달 — 다시 돌리기
modalRetryBtn.addEventListener('click', () => {
  closeModal();
  setTimeout(spin, 200);
});

// 모달 — 배경 클릭
resultModal.addEventListener('click', e => {
  if (e.target === resultModal) closeModal();
});

// 키보드 ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

/* ═══════════════════════════════════════════════════════════
   초기화
   ═══════════════════════════════════════════════════════════ */
function init() {
  initTheme();        // 테마 먼저 복원 (깜빡임 방지)
  loadStoredMyMenu();
  updateMyMenuBtn();

  if (loadStoredItems()) {
    // localStorage 복원 시: 저장된 activePreset도 복원
    const storedPreset = localStorage.getItem('active_preset');
    if (storedPreset) setActivePreset(storedPreset);
    sync();
  } else {
    // 최초 실행 → 직장인 인기 프리셋 기본 로드 (토스트 없이)
    applyPreset('office', true);
  }
}

// 웹폰트 로딩 완료 후 Canvas 렌더 (폰트 깨짐 방지)
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(init);
} else {
  init();
}
