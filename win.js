// DiuWin Official Win Go Game Engine & State Management
const IS_FILE_PROTOCOL = window.location.protocol === 'file:';
const IS_LOCAL_DEV = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && 
                     (window.location.port === '5500' || window.location.port === '5501' || IS_FILE_PROTOCOL);
const API_BASE = IS_LOCAL_DEV ? 'http://localhost:3000' : '';

let currentToken = localStorage.getItem('diuwin_token') || null;
let currentUser = null;

// ==================== GAME STATE SYSTEM ====================
let currentPeriod = 146;
let activeTimerDuration = 60; // 1 min = 60s
let timeRemaining = 60;
let roundEndTime = Date.now() + 60000;
let timerInterval = null;
let isRoundSettling = false;
let isAudioEnabled = true;

// Betting Selections
let selectedColor = null;
let selectedNumber = null;
let selectedSize = null;
let selectedMultiplier = 1;

let currentBetSelection = null; // { type, choice, multiplier, name }
let activeBaseMoney = 10;
let activeQuantity = 1;
let activeDrawerMultiplier = 1;

let userBetsThisRound = [];
let allUserBets = [];

// Fallback Initial History Records
const DEFAULT_INITIAL_HISTORY = [
  { period: 145, num: 3, size: 'Small', color: 'red' },
  { period: 144, num: 7, size: 'Big', color: 'red' },
  { period: 143, num: 0, size: 'Small', color: 'split-violet-red' },
  { period: 142, num: 1, size: 'Small', color: 'red' },
  { period: 141, num: 1, size: 'Small', color: 'red' },
  { period: 140, num: 2, size: 'Small', color: 'red' },
  { period: 139, num: 1, size: 'Small', color: 'red' },
  { period: 138, num: 0, size: 'Small', color: 'split-violet-red' },
  { period: 137, num: 8, size: 'Big', color: 'red' },
  { period: 136, num: 5, size: 'Big', color: 'split-violet-green' }
];

let gameHistoryRecords = [...DEFAULT_INITIAL_HISTORY];

// ==================== AUDIO SYNTHESIZER ====================
let audioCtx = null;
function playSound(type) {
  if (!isAudioEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'tick') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(850, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.06);
    } else if (type === 'win') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.50, audioCtx.currentTime + 0.3); // C6
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    }
  } catch (e) {}
}

function showToast(msg, duration = 2200) {
  const toast = document.getElementById('wingoToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// ==================== INITIALIZATION ====================
window.addEventListener('DOMContentLoaded', async () => {
  loadSavedGameState();
  initUser();
  updatePeriodDisplay();
  renderHistoryTable();
  renderMyBets();
  setupEventListeners();

  // Initial Sync with Server state
  await syncWingoState(true);

  // Start smooth drift-free countdown
  startCountdownTimer();

  // Periodic background sync every 8 seconds to ensure long-term alignment without timer jumps
  setInterval(() => {
    if (!isRoundSettling && timeRemaining > 8) {
      syncWingoState(false);
    }
  }, 8000);
});

// Load Cached Local Storage
function loadSavedGameState() {
  const cachedHist = localStorage.getItem('diuwin_wingo_history');
  if (cachedHist) {
    try {
      const parsed = JSON.parse(cachedHist);
      if (Array.isArray(parsed) && parsed.length > 0) {
        gameHistoryRecords = parsed;
      }
    } catch (e) {}
  }

  const cachedBets = localStorage.getItem('diuwin_wingo_mybets');
  if (cachedBets) {
    try {
      allUserBets = JSON.parse(cachedBets);
    } catch (e) {}
  }
}

// User Session & Balance
async function initUser() {
  const storedBal = localStorage.getItem('diuwin_balance');
  const defaultBalance = storedBal ? parseFloat(storedBal) : 557.00;

  currentUser = {
    id: 'usr_guest_demo',
    name: 'Demo Player',
    balance: defaultBalance
  };

  if (currentToken) {
    try {
      const res = await fetch(`${API_BASE}/api/user/profile`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      const data = await res.json();
      if (data && data.success && data.user) {
        currentUser = data.user;
        localStorage.setItem('diuwin_balance', currentUser.balance);
      }
    } catch (e) {}
  }

  updateBalanceDisplay(currentUser.balance);
  loadMyBetsFromServer();
}

function updateBalanceDisplay(bal) {
  const num = Number(bal || 0);
  const formatted = num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const el = document.getElementById('userWalletBalance');
  if (el) el.textContent = formatted;
}

function updatePeriodDisplay() {
  const el = document.getElementById('currentPeriodNumber');
  if (el) el.textContent = currentPeriod;
}

// Server State Synchronization
async function syncWingoState(forceSync = false) {
  try {
    const res = await fetch(`${API_BASE}/api/wingo/state`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.success) return;

    if (data.history && Array.isArray(data.history) && data.history.length > 0) {
      gameHistoryRecords = data.history.map(h => ({
        period: h.period,
        num: h.number !== undefined ? h.number : (h.num !== undefined ? h.num : 0),
        size: h.size || (h.number >= 5 ? 'Big' : 'Small'),
        color: h.color || (h.number === 0 ? 'split-violet-red' : (h.number === 5 ? 'split-violet-green' : ([2,4,6,8].includes(h.number) ? 'red' : 'green')))
      }));
      try {
        localStorage.setItem('diuwin_wingo_history', JSON.stringify(gameHistoryRecords));
      } catch (e) {}
      renderHistoryTable();
    }

    if (data.period) {
      currentPeriod = data.period;
      updatePeriodDisplay();
    }

    if (data.timeRemaining !== undefined) {
      // Force sync on initial load or if timer drifted by more than 4 seconds
      if (forceSync || (Math.abs(data.timeRemaining - timeRemaining) > 4 && timeRemaining > 6)) {
        timeRemaining = Math.max(0, data.timeRemaining);
        roundEndTime = Date.now() + (timeRemaining * 1000);
        updateTimerDisplay();
      }
    }
  } catch (err) {}
}

// ==================== PRECISION COUNTDOWN ENGINE ====================
function startCountdownTimer() {
  if (timerInterval) clearInterval(timerInterval);

  // Immediate first render
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    if (isRoundSettling) return;

    const now = Date.now();
    const diffMs = roundEndTime - now;
    timeRemaining = Math.max(0, Math.ceil(diffMs / 1000));

    // Audio tick in last 5 seconds (5, 4, 3, 2, 1)
    if (timeRemaining <= 5 && timeRemaining > 0) {
      playSound('tick');
    }

    updateTimerDisplay();

    // Trigger settlement when reaching 0
    if (timeRemaining === 0 && !isRoundSettling) {
      isRoundSettling = true;
      executeRoundSettlement();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const safeSec = Math.max(0, timeRemaining);
  const m = Math.floor(safeSec / 60);
  const s = safeSec % 60;

  const minStr = String(m).padStart(2, '0');
  const secStr = String(s).padStart(2, '0');

  const minTen = document.getElementById('minTen');
  const minOne = document.getElementById('minOne');
  const secTen = document.getElementById('secTen');
  const secOne = document.getElementById('secOne');

  if (minTen) minTen.textContent = minStr[0];
  if (minOne) minOne.textContent = minStr[1];
  if (secTen) secTen.textContent = secStr[0];
  if (secOne) secOne.textContent = secStr[1];

  // Visual warning and disable betting in last 5 seconds
  const isLocked = safeSec <= 5;
  const digitBoxes = document.querySelectorAll('.digit-box');
  digitBoxes.forEach(box => {
    if (isLocked && safeSec > 0) {
      box.classList.add('warning');
    } else {
      box.classList.remove('warning');
    }
  });

  document.querySelectorAll('.color-choice-btn, .num-ball, .big-small-btn').forEach(btn => {
    btn.style.opacity = isLocked ? '0.5' : '1';
    btn.style.pointerEvents = isLocked ? 'none' : 'auto';
  });

  if (isLocked) {
    const betModal = document.getElementById('betModal');
    if (betModal && betModal.classList.contains('show')) {
      closeBetDrawer();
      showToast('Betting is locked for the draw');
    }
  }
}

// ==================== ROUND OUTCOME & SETTLEMENT ====================
async function executeRoundSettlement() {
  // 1. Show 00:00 clearly for 1.2 seconds during draw
  timeRemaining = 0;
  updateTimerDisplay();

  const finishedPeriod = currentPeriod;
  let luckyNum = null;
  let size = 'Small';
  let colorClass = 'green';
  let colorName = 'Green';

  // Wait 1.2s to let server compute result and allow user to see 00:00
  await new Promise(r => setTimeout(r, 1200));

  try {
    const res = await fetch(`${API_BASE}/api/wingo/state`);
    const data = await res.json();
    if (data && data.success) {
      if (data.lastOutcome) {
        luckyNum = data.lastOutcome.number !== undefined ? data.lastOutcome.number : data.lastOutcome.num;
        size = data.lastOutcome.size || (luckyNum >= 5 ? 'Big' : 'Small');
        colorName = data.lastOutcome.colorName || data.lastOutcome.color || 'Green';
        colorClass = (luckyNum === 0) ? 'split-violet-red' : ((luckyNum === 5) ? 'split-violet-green' : ([2,4,6,8].includes(luckyNum) ? 'red' : 'green'));
      }
      if (data.period) {
        currentPeriod = data.period;
      } else {
        currentPeriod = finishedPeriod + 1;
      }
      if (data.history) {
        gameHistoryRecords = data.history.map(h => ({
          period: h.period,
          num: h.number !== undefined ? h.number : (h.num !== undefined ? h.num : 0),
          size: h.size || (h.number >= 5 ? 'Big' : 'Small'),
          color: h.color || (h.number === 0 ? 'split-violet-red' : (h.number === 5 ? 'split-violet-green' : ([2,4,6,8].includes(h.number) ? 'red' : 'green')))
        }));
      }
    }
  } catch (e) {}

  // Fallback if backend was unreachable
  if (luckyNum === null) {
    luckyNum = Math.floor(Math.random() * 10);
    size = luckyNum >= 5 ? 'Big' : 'Small';
    if (luckyNum === 0) { colorClass = 'split-violet-red'; colorName = 'Violet + Red'; }
    else if (luckyNum === 5) { colorClass = 'split-violet-green'; colorName = 'Violet + Green'; }
    else if ([2, 4, 6, 8].includes(luckyNum)) { colorClass = 'red'; colorName = 'Red'; }
    else { colorClass = 'green'; colorName = 'Green'; }

    currentPeriod = finishedPeriod + 1;
    gameHistoryRecords.unshift({
      period: finishedPeriod,
      num: luckyNum,
      size,
      color: colorClass
    });
    if (gameHistoryRecords.length > 30) gameHistoryRecords.pop();
  }

  try {
    localStorage.setItem('diuwin_wingo_history', JSON.stringify(gameHistoryRecords));
  } catch (e) {}

  updatePeriodDisplay();
  renderHistoryTable();

  // Check user bets placed for this round
  let totalWonAmount = 0;
  let totalBetAmount = 0;
  let userWonAnyBet = false;
  const settledBets = [];

  userBetsThisRound.forEach(b => {
    totalBetAmount += b.amount;
    let won = false;
    let mult = 0;

    if (b.type === 'color') {
      if (b.choice === 'green') {
        if ([1, 3, 7, 9].includes(luckyNum)) { won = true; mult = 2.0; }
        else if (luckyNum === 5) { won = true; mult = 1.5; }
      } else if (b.choice === 'red') {
        if ([2, 4, 6, 8].includes(luckyNum)) { won = true; mult = 2.0; }
        else if (luckyNum === 0) { won = true; mult = 1.5; }
      } else if (b.choice === 'violet') {
        if (luckyNum === 0 || luckyNum === 5) { won = true; mult = 4.5; }
      }
    } else if (b.type === 'number') {
      if (parseInt(b.choice) === luckyNum) {
        won = true;
        mult = 9.0;
      }
    } else if (b.type === 'size') {
      if (b.choice.toLowerCase() === size.toLowerCase()) {
        won = true;
        mult = 2.0;
      }
    }

    const winAmt = won ? Number((b.amount * mult).toFixed(2)) : 0;
    if (won) {
      userWonAnyBet = true;
      totalWonAmount += winAmt;
    }

    const settled = {
      period: finishedPeriod,
      choice: b.choice,
      name: b.name || b.choice,
      amount: b.amount,
      winAmount: winAmt,
      profitOrLoss: Number((winAmt - b.amount).toFixed(2)),
      status: won ? 'win' : 'loss',
      mult: mult || b.multiplier,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    settledBets.push(settled);
    const pIdx = allUserBets.findIndex(x => x.period === finishedPeriod && x.choice === b.choice && x.status === 'pending');
    if (pIdx !== -1) {
      allUserBets[pIdx] = settled;
    } else {
      allUserBets.unshift(settled);
    }
  });

  userBetsThisRound = [];

  if (settledBets.length > 0) {
    if (allUserBets.length > 50) allUserBets.length = 50;
    try {
      localStorage.setItem('diuwin_wingo_mybets', JSON.stringify(allUserBets));
    } catch (e) {}
    renderMyBets();

    // Persist all settled bets to backend database
    settledBets.forEach(sb => {
      syncBetWithBackend('wingo', 'Win Go 1Min', sb);
    });

    if (userWonAnyBet) {
      currentUser.balance = Number((currentUser.balance + totalWonAmount).toFixed(2));
      localStorage.setItem('diuwin_balance', currentUser.balance);
      updateBalanceDisplay(currentUser.balance);
      playSound('win');

      if (window.DiuWinOutcomeModal) {
        window.DiuWinOutcomeModal.show({
          isWin: true,
          winAmount: totalWonAmount,
          period: finishedPeriod,
          gameName: 'Win Go',
          betSummary: `Won ₹${totalWonAmount.toFixed(2)} on Period #${finishedPeriod}`
        });
      } else {
        showToast(`🎉 Congratulations! You won ₹${totalWonAmount.toFixed(2)}!`);
      }
    } else {
      if (window.DiuWinOutcomeModal) {
        window.DiuWinOutcomeModal.show({
          isWin: false,
          lossAmount: totalBetAmount,
          period: finishedPeriod,
          gameName: 'Win Go',
          betSummary: `Result: ${luckyNum} (${colorName}, ${size})`
        });
      } else {
        showToast(`Period #${finishedPeriod}: Ball ${luckyNum} (${colorName}, ${size})`);
      }
    }
  }

  // Reset Countdown smoothly for the next round
  timeRemaining = activeTimerDuration;
  roundEndTime = Date.now() + (timeRemaining * 1000);
  isRoundSettling = false;
  updateTimerDisplay();
}

// ==================== HISTORY RENDERING ====================
function renderHistoryTable() {
  const tbody = document.getElementById('gameHistoryTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  gameHistoryRecords.forEach(r => {
    const tr = document.createElement('tr');

    let dotsHtml = '';
    if (r.color === 'split-violet-red') {
      dotsHtml = `<span class="color-dot red"></span><span class="color-dot violet"></span>`;
    } else if (r.color === 'split-violet-green') {
      dotsHtml = `<span class="color-dot green"></span><span class="color-dot violet"></span>`;
    } else if (r.color === 'red') {
      dotsHtml = `<span class="color-dot red"></span>`;
    } else {
      dotsHtml = `<span class="color-dot green"></span>`;
    }

    const sizeColor = r.size === 'Big' ? '#d97706' : '#2563eb';

    tr.innerHTML = `
      <td class="td-period">${r.period}</td>
      <td>
        <span class="td-num-ball ${r.color}">${r.num}</span>
      </td>
      <td style="color:${sizeColor}; font-weight:700;">${r.size}</td>
      <td>
        <div class="td-color-dots">${dotsHtml}</div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderMyBets() {
  const list = document.getElementById('myBetsList');
  const empty = document.getElementById('emptyBetsMsg');
  if (!list) return;
  list.innerHTML = '';

  if (!allUserBets || allUserBets.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  allUserBets.forEach(b => {
    const item = document.createElement('div');
    const isWin = b.status === 'win';
    const isPending = b.status === 'pending';
    let badgeHtml = '';
    let itemBg = '#fef2f2';
    let itemBorder = '#fecdd3';

    if (isPending) {
      badgeHtml = `<span style="background:#fef9c3; color:#a16207; border:1px solid #fde047; padding:3px 8px; border-radius:12px; font-weight:800; font-size:11px;"><i class="fa fa-clock-o"></i> Pending</span>`;
      itemBg = '#fffbeb';
      itemBorder = '#fef08a';
    } else if (isWin) {
      badgeHtml = `<span style="background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:3px 8px; border-radius:12px; font-weight:800; font-size:11px;">+₹${Number(b.winAmount || 0).toFixed(2)} Win</span>`;
      itemBg = '#f0fdf4';
      itemBorder = '#bbf7d0';
    } else {
      badgeHtml = `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:3px 8px; border-radius:12px; font-weight:800; font-size:11px;">-₹${Number(b.amount || 0).toFixed(2)} Loss</span>`;
      itemBg = '#fef2f2';
      itemBorder = '#fecdd3';
    }

    item.style.cssText = `background:${itemBg}; border:1px solid ${itemBorder}; border-radius:12px; padding:12px; margin-bottom:10px; display:flex; flex-direction:column; gap:6px; font-size:12px; box-shadow:0 2px 6px rgba(0,0,0,0.03);`;
    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong style="color:#1e293b; font-size:13.5px;">${b.name || b.choice}</strong>
          <span style="color:#64748b; font-size:11px; margin-left:6px;">Period: #${b.period}</span>
        </div>
        ${badgeHtml}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:11px; border-top:1px dashed #e2e8f0; padding-top:6px;">
        <div>Bet: <strong style="color:#1e293b;">₹${Number(b.amount || 0).toFixed(2)}</strong> ${b.mult ? '• ' + b.mult + 'x' : ''}</div>
        <div>${b.winAmount > 0 ? 'Payout: <strong style="color:#16a34a;">₹' + Number(b.winAmount || 0).toFixed(2) + '</strong> • ' : ''}<span>${b.time || ''}</span></div>
      </div>
    `;
    list.appendChild(item);
  });
}

// Backend Bet Synchronization
async function syncBetWithBackend(gameId, gameName, bet) {
  const userId = currentUser ? currentUser.id : 'usr_guest_demo';
  try {
    const res = await fetch(`${API_BASE}/api/games/record-bet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {})
      },
      body: JSON.stringify({
        userId,
        gameId,
        gameName,
        period: bet.period,
        betAmount: bet.amount,
        winAmount: bet.winAmount,
        isWin: bet.winAmount > 0,
        multiplier: bet.mult || 0,
        choice: bet.choice,
        details: bet.name
      })
    });
    const data = await res.json();
    if (data && data.success && data.newBalance !== undefined && currentUser) {
      currentUser.balance = data.newBalance;
      updateBalanceDisplay(currentUser.balance);
      localStorage.setItem('diuwin_balance', currentUser.balance);
    }
  } catch (e) {}

  try {
    localStorage.setItem('diuwin_wingo_mybets', JSON.stringify(allUserBets));
  } catch (e) {}
}

async function loadMyBetsFromServer() {
  const userId = currentUser ? currentUser.id : 'usr_guest_demo';
  try {
    const res = await fetch(`${API_BASE}/api/games/my-bets?gameId=wingo&userId=${encodeURIComponent(userId)}`, {
      headers: currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {}
    });
    const data = await res.json();
    if (data && data.success && data.bets && data.bets.length > 0) {
      allUserBets = data.bets.map(b => ({
        period: b.period,
        choice: b.choice,
        name: b.details || b.choice,
        amount: b.betAmount,
        winAmount: b.winAmount,
        profitOrLoss: b.profitOrLoss,
        status: b.isWin ? 'win' : 'loss',
        mult: b.multiplier,
        time: new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      }));
      try {
        localStorage.setItem('diuwin_wingo_mybets', JSON.stringify(allUserBets));
      } catch (e) {}
      renderMyBets();
    }
  } catch (e) {}
}

// ==================== BET PLACEMENT DRAWER ====================
function openBetDrawer(type, choice, multiplier, name) {
  if (timeRemaining <= 5) {
    showToast('Betting is locked for the last 5 seconds');
    return;
  }

  currentBetSelection = { type, choice, multiplier, name };

  const badge = document.getElementById('drawerChoiceBadge');
  const modeTag = document.getElementById('currentPeriodModeTag')?.textContent || '1 Minute';
  if (badge) badge.textContent = `Win Go ${modeTag}: Select ${name}`;

  calculateDrawerTotal();
  document.getElementById('betModal')?.classList.add('show');
}

function closeBetDrawer() {
  document.getElementById('betModal')?.classList.remove('show');
}

function calculateDrawerTotal() {
  const total = activeBaseMoney * activeQuantity * activeDrawerMultiplier;
  const totalEl = document.getElementById('drawerTotalAmount');
  if (totalEl) totalEl.textContent = `₹${total.toFixed(2)}`;
}

function confirmBetPlacement() {
  if (!currentBetSelection) return;

  const totalAmount = activeBaseMoney * activeQuantity * activeDrawerMultiplier;

  if (currentUser.balance < totalAmount) {
    showToast('Insufficient Balance. Please recharge.');
    return;
  }

  // Deduct balance locally
  currentUser.balance = Number((currentUser.balance - totalAmount).toFixed(2));
  localStorage.setItem('diuwin_balance', currentUser.balance);
  updateBalanceDisplay(currentUser.balance);

  // Record bet
  const betRecord = {
    id: 'bet_' + Date.now(),
    type: currentBetSelection.type,
    choice: currentBetSelection.choice,
    name: currentBetSelection.name,
    amount: totalAmount,
    multiplier: currentBetSelection.multiplier,
    period: currentPeriod,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };

  userBetsThisRound.push(betRecord);

  // Add pending bet to allUserBets list so user immediately sees their active bet under My Bets
  const pendingBet = {
    period: betRecord.period,
    choice: betRecord.choice,
    name: betRecord.name,
    amount: betRecord.amount,
    winAmount: 0,
    profitOrLoss: 0,
    status: 'pending',
    mult: betRecord.multiplier,
    time: betRecord.time
  };
  allUserBets.unshift(pendingBet);
  if (allUserBets.length > 50) allUserBets.length = 50;
  try {
    localStorage.setItem('diuwin_wingo_mybets', JSON.stringify(allUserBets));
  } catch (e) {}
  renderMyBets();

  // Async sync to server
  try {
    fetch(`${API_BASE}/api/wingo/bet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {})
      },
      body: JSON.stringify({
        type: betRecord.type,
        choice: betRecord.choice,
        amount: betRecord.amount,
        period: betRecord.period,
        userId: currentUser.id
      })
    }).catch(() => {});
  } catch (e) {}

  closeBetDrawer();
  showToast(`Bet ₹${totalAmount.toFixed(2)} placed successfully!`);
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
  // Navigation: Back Button returns to Lobby
  document.getElementById('btnBackToLobby')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.getElementById('headerCenterLogo')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // Audio Toggle
  document.getElementById('btnAudioToggle')?.addEventListener('click', () => {
    isAudioEnabled = !isAudioEnabled;
    const icon = document.getElementById('audioToggleIcon');
    if (icon) {
      icon.className = isAudioEnabled ? 'fa fa-volume-up' : 'fa fa-volume-off';
    }
    showToast(isAudioEnabled ? 'Sound Enabled' : 'Sound Muted');
  });

  // Customer Support
  document.getElementById('btnCustomerSupport')?.addEventListener('click', () => {
    showToast('Customer support is active 24/7 (Live Chat)');
  });

  // Balance Refresh
  document.getElementById('btnRefreshWallet')?.addEventListener('click', () => {
    const btn = document.getElementById('btnRefreshWallet');
    if (btn) btn.style.transform = 'rotate(360deg)';
    setTimeout(() => {
      if (btn) btn.style.transform = 'rotate(0deg)';
    }, 400);
    initUser();
    showToast('Balance refreshed');
  });

  // Withdraw Button
  document.getElementById('btnWithdrawModal')?.addEventListener('click', () => {
    showToast(`Withdrawal available. Current Balance: ₹${currentUser.balance.toFixed(2)}`);
  });

  // Recharge Button
  document.getElementById('btnRechargeModal')?.addEventListener('click', () => {
    if (window.openUpiRechargeModal) {
      window.openUpiRechargeModal(500);
    } else {
      showToast('Recharge gateway opened. Select UPI amount.');
    }
  });

  // 3. Timer Mode Rail Card (1 min, 3 min, 5 min, 10 min)
  document.querySelectorAll('.time-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.time-tab').forEach(x => {
        x.classList.remove('active');
        const clockSvg = x.querySelector('.clock-svg');
        if (clockSvg) clockSvg.classList.replace('active', 'inactive');
      });

      tab.classList.add('active');
      const clockSvg = tab.querySelector('.clock-svg');
      if (clockSvg) clockSvg.classList.replace('inactive', 'active');

      const min = parseInt(tab.dataset.time);
      activeTimerDuration = min * 60;

      // Calculate time remaining in this mode aligned with real clock seconds
      const elapsedSecInHour = (new Date().getMinutes() * 60) + new Date().getSeconds();
      const elapsedInMode = elapsedSecInHour % activeTimerDuration;
      timeRemaining = activeTimerDuration - elapsedInMode;
      roundEndTime = Date.now() + (timeRemaining * 1000);

      const tag = document.getElementById('currentPeriodModeTag');
      if (tag) tag.textContent = `${min} Minute`;

      updateTimerDisplay();
      showToast(`Switched to Win Go ${min} Minute`);
    });
  });

  // 5. Color Choice Buttons (Green, Violet, Red)
  document.querySelectorAll('.color-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const choice = btn.dataset.choice;
      const mult = parseFloat(btn.dataset.multiplier);
      const name = choice.charAt(0).toUpperCase() + choice.slice(1);
      selectedColor = choice;
      openBetDrawer('color', choice, mult, name);
    });
  });

  // 6. Number Balls / Chips (0 to 9)
  document.querySelectorAll('.num-ball').forEach(btn => {
    btn.addEventListener('click', () => {
      const num = btn.dataset.num;
      selectedNumber = num;
      openBetDrawer('number', num, 9.0, `Number ${num}`);
    });
  });

  // 7. Multiplier Selection & Random Button
  document.getElementById('btnRandomPick')?.addEventListener('click', () => {
    const rand = Math.floor(Math.random() * 10);
    selectedNumber = rand;
    openBetDrawer('number', rand, 9.0, `Number ${rand}`);
  });

  document.querySelectorAll('.multiplier-chips-row .chip-x').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.multiplier-chips-row .chip-x').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const x = parseInt(chip.dataset.x);
      selectedMultiplier = x;
      activeDrawerMultiplier = x;
      document.querySelectorAll('.drawer-multipliers-row .d-chip').forEach(dc => {
        dc.classList.toggle('active', parseInt(dc.dataset.mult) === x);
      });
      calculateDrawerTotal();
    });
  });

  // 8. Big / Small Buttons
  document.querySelectorAll('.big-small-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const choice = btn.dataset.choice;
      const name = choice.charAt(0).toUpperCase() + choice.slice(1);
      selectedSize = choice;
      openBetDrawer('size', choice, 2.0, name);
    });
  });

  // Drawer Base Money Chips
  document.querySelectorAll('.base-chip').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('.base-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      activeBaseMoney = parseFloat(c.dataset.base);
      calculateDrawerTotal();
    });
  });

  // Drawer Stepper
  document.getElementById('btnQtyMinus')?.addEventListener('click', () => {
    activeQuantity = Math.max(1, activeQuantity - 1);
    const inp = document.getElementById('qtyInput');
    if (inp) inp.value = activeQuantity;
    calculateDrawerTotal();
  });

  document.getElementById('btnQtyPlus')?.addEventListener('click', () => {
    activeQuantity = Math.min(999, activeQuantity + 1);
    const inp = document.getElementById('qtyInput');
    if (inp) inp.value = activeQuantity;
    calculateDrawerTotal();
  });

  document.getElementById('qtyInput')?.addEventListener('input', (e) => {
    activeQuantity = Math.max(1, Math.min(999, parseInt(e.target.value) || 1));
    calculateDrawerTotal();
  });

  // Drawer Multiplier Chips
  document.querySelectorAll('.drawer-multipliers-row .d-chip').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('.drawer-multipliers-row .d-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      activeDrawerMultiplier = parseFloat(c.dataset.mult);
      calculateDrawerTotal();
    });
  });

  // Drawer Action Buttons
  document.getElementById('btnCancelBet')?.addEventListener('click', closeBetDrawer);
  document.getElementById('btnConfirmBet')?.addEventListener('click', confirmBetPlacement);
  document.getElementById('betModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'betModal') closeBetDrawer();
  });

  // 9. History Tab Toggles (Game History | My Bets)
  document.getElementById('tabGameHistory')?.addEventListener('click', () => {
    document.getElementById('tabGameHistory').classList.add('active');
    document.getElementById('tabMyBets').classList.remove('active');
    document.getElementById('gameHistoryTableWrap').style.display = 'block';
    document.getElementById('myBetsContainer').style.display = 'none';
  });

  document.getElementById('tabMyBets')?.addEventListener('click', () => {
    document.getElementById('tabMyBets').classList.add('active');
    document.getElementById('tabGameHistory').classList.remove('active');
    document.getElementById('gameHistoryTableWrap').style.display = 'none';
    document.getElementById('myBetsContainer').style.display = 'block';
    renderMyBets();
  });
}
