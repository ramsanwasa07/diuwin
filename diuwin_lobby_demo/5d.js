// DiuWin Official 5D Lottery Engine
const IS_FILE_PROTOCOL = window.location.protocol === 'file:';
const IS_LOCAL_DEV = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && 
                     (window.location.port === '5500' || window.location.port === '5501' || IS_FILE_PROTOCOL);
const API_BASE = IS_LOCAL_DEV ? 'http://localhost:3000' : '';

let currentToken = localStorage.getItem('diuwin_token') || null;
let currentUser = null;

// Game State
let activeTimerDuration = 60; // 1 min
let timeRemaining = 44;
let timerInterval = null;
let currentPeriod = 1;
let activePosition = 'A'; // 'A', 'B', 'C', 'D', 'E', 'Total'

let activeBaseMoney = 10;
let activeQuantity = 1;
let activeDrawerMultiplier = 1;
let currentBetSelection = null; // { pos, type, choice, odds, displayName }

let userBetsThisRound = [];
let allUserBets = [];

// History Records
let fivedHistoryRecords = [];

// Audio Synthesizer
let audioCtx = null;
function playSound(type) {
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
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    } else if (type === 'win') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1046.50, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    }
  } catch (e) {}
}

function showToast(msg, duration = 2500) {
  const toast = document.getElementById('fivedToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// Cached Local Storage Helpers
function loadCachedFivedData() {
  const cachedHist = localStorage.getItem('diuwin_5d_history');
  if (cachedHist) {
    try {
      fivedHistoryRecords = JSON.parse(cachedHist);
      renderHistoryTable();
    } catch (e) {}
  }
  const cachedBets = localStorage.getItem('diuwin_5d_mybets');
  if (cachedBets) {
    try {
      allUserBets = JSON.parse(cachedBets);
      renderMyBets();
    } catch (e) {}
  }
}

// ==================== INITIALIZATION ====================
window.addEventListener('DOMContentLoaded', () => {
  loadCachedFivedData();
  initUser();
  sync5dStateWithServer();
  startCountdownTimer();
  renderHistoryTable();
  setupEventListeners();
  updateResultBalls([0, 0, 0, 0, 0]);
  setInterval(sync5dStateWithServer, 3500);
});

let lastFivedHistoryKey = '';

async function sync5dStateWithServer() {
  try {
    const res = await fetch(`${API_BASE}/api/5d/state`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.success) {
      if (data.period) {
        currentPeriod = data.period;
        const el = document.getElementById('fivedPeriodNumber');
        if (el) el.textContent = currentPeriod;
      }
      if (data.timeRemaining !== undefined && Math.abs(data.timeRemaining - timeRemaining) > 2) {
        timeRemaining = data.timeRemaining;
        updateTimerDisplay();
      }
      if (data.history && data.history.length > 0) {
        const topKey = `${data.history[0].period}_${data.history[0].sum}`;
        if (topKey !== lastFivedHistoryKey) {
          lastFivedHistoryKey = topKey;
          fivedHistoryRecords = data.history.map(h => ({
            period: h.period,
            d: h.digits || [0, 0, 0, 0, 0],
            sum: h.sum
          }));
          try {
            localStorage.setItem('diuwin_5d_history', JSON.stringify(fivedHistoryRecords));
          } catch (e) {}
          renderHistoryTable();
        }
      }
    }
  } catch (err) {}
}

// User Session & Balance
async function initUser() {
  if (currentToken) {
    try {
      const res = await fetch(`${API_BASE}/api/user/profile`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      const data = await res.json();
      if (data.success && data.user) {
        currentUser = data.user;
        updateBalanceDisplay(currentUser.balance);
        loadMyBetsFromServer();
        return;
      }
    } catch (e) {}
  }

  // Fallback guest session
  const storedBal = localStorage.getItem('diuwin_balance');
  currentUser = { id: 'usr_guest_demo', name: 'Demo Player', balance: storedBal ? parseFloat(storedBal) : 973.70 };
  updateBalanceDisplay(currentUser.balance);
  loadMyBetsFromServer();
}

function updateBalanceDisplay(bal) {
  const num = Number(bal || 0);
  const formatted = num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const el = document.getElementById('userWalletBalance');
  if (el) el.textContent = formatted;
}

// ==================== RESULT BALLS ROW ====================
function updateResultBalls(digits) {
  const sum = digits.reduce((a, b) => a + b, 0);
  document.getElementById('ballA').textContent = digits[0];
  document.getElementById('ballB').textContent = digits[1];
  document.getElementById('ballC').textContent = digits[2];
  document.getElementById('ballD').textContent = digits[3];
  document.getElementById('ballE').textContent = digits[4];
  document.getElementById('ballSum').textContent = sum;
}

// ==================== COUNTDOWN TIMER ====================
function startCountdownTimer() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    timeRemaining--;

    if (timeRemaining <= 5 && timeRemaining > 0) {
      playSound('tick');
    }

    if (timeRemaining < 0) {
      handleRoundCompletion();
      timeRemaining = activeTimerDuration;
    }

    updateTimerDisplay();
  }, 1000);

  updateTimerDisplay();
}

function updateTimerDisplay() {
  const m = Math.floor(timeRemaining / 60);
  const s = timeRemaining % 60;

  const minStr = String(m).padStart(2, '0');
  const secStr = String(s).padStart(2, '0');

  const minTen = document.getElementById('fivedMinTen');
  const minOne = document.getElementById('fivedMinOne');
  const secTen = document.getElementById('fivedSecTen');
  const secOne = document.getElementById('fivedSecOne');

  if (minTen) minTen.textContent = minStr[0];
  if (minOne) minOne.textContent = minStr[1];
  if (secTen) secTen.textContent = secStr[0];
  if (secOne) secOne.textContent = secStr[1];

  // Lock betting in last 5 seconds
  const isLocked = timeRemaining <= 5;
  document.querySelectorAll('.fived-ball, .prop-card').forEach(btn => {
    btn.style.opacity = isLocked ? '0.5' : '1';
    btn.style.pointerEvents = isLocked ? 'none' : 'auto';
  });
}

async function handleRoundCompletion() {
  // Spin mechanical cylinders
  const reels = ['reelA', 'reelB', 'reelC', 'reelD', 'reelE'];
  reels.forEach(id => document.getElementById(id)?.classList.add('spinning'));

  let serverOutcome = null;
  await new Promise(r => setTimeout(r, 700));

  try {
    const res = await fetch(`${API_BASE}/api/5d/state`);
    const data = await res.json();
    if (data && data.lastOutcome && data.lastOutcome.digits) {
      serverOutcome = data.lastOutcome;
      if (data.period) {
        currentPeriod = data.period;
        const el = document.getElementById('fivedPeriodNumber');
        if (el) el.textContent = currentPeriod;
      }
    }
  } catch (e) {}

  setTimeout(() => {
    reels.forEach(id => document.getElementById(id)?.classList.remove('spinning'));

    let d;
    if (serverOutcome) {
      d = serverOutcome.digits;
    } else {
      d = [
        Math.floor(Math.random() * 10),
        Math.floor(Math.random() * 10),
        Math.floor(Math.random() * 10),
        Math.floor(Math.random() * 10),
        Math.floor(Math.random() * 10)
      ];
    }

    document.getElementById('digitA').textContent = d[0];
    document.getElementById('digitB').textContent = d[1];
    document.getElementById('digitC').textContent = d[2];
    document.getElementById('digitD').textContent = d[3];
    document.getElementById('digitE').textContent = d[4];

    updateResultBalls(d);

    const sum = d.reduce((a, b) => a + b, 0);

    // Add to history
    fivedHistoryRecords.unshift({
      period: currentPeriod,
      d,
      sum
    });
    if (fivedHistoryRecords.length > 25) fivedHistoryRecords.pop();
    try {
      localStorage.setItem('diuwin_5d_history', JSON.stringify(fivedHistoryRecords));
    } catch (e) {}
    renderHistoryTable();

    // Check user bets
    let totalWin = 0;
    let totalBetAmount = 0;
    let userHadBet = false;
    const roundBetsSummary = [];

    userBetsThisRound.forEach(b => {
      userHadBet = true;
      const betAmt = Number(b.amount || 0);
      totalBetAmount += betAmt;
      let won = false;
      let mult = b.odds;

      const posIndex = { A: 0, B: 1, C: 2, D: 3, E: 4 }[b.pos];

      if (b.type === 'number') {
        if (posIndex !== undefined && d[posIndex] === parseInt(b.choice)) {
          won = true;
        }
      } else if (b.type === 'prop') {
        const val = (posIndex !== undefined) ? d[posIndex] : sum;
        const isBig = val >= ((b.pos === 'Total') ? 23 : 5);
        const isOdd = val % 2 !== 0;

        if (b.choice === 'Big' && isBig) won = true;
        else if (b.choice === 'Small' && !isBig) won = true;
        else if (b.choice === 'Odd' && isOdd) won = true;
        else if (b.choice === 'Even' && !isOdd) won = true;
      }

      const winAmt = won ? Number((betAmt * mult * 0.98).toFixed(2)) : 0;
      const profitOrLoss = won ? Number((winAmt - betAmt).toFixed(2)) : -betAmt;

      b.status = won ? 'win' : 'loss';
      b.winAmount = winAmt;
      b.profitOrLoss = profitOrLoss;
      b.mult = mult;

      roundBetsSummary.push(`Pos ${b.pos || 'A'}: ${b.displayName || b.choice} (₹${betAmt})`);

      if (won) {
        totalWin += winAmt;
      }

      // Persist to backend database & sync balance
      syncBetWithBackend('5d', '5D Lottery', b);
    });

    if (userHadBet) {
      const isWin = totalWin > 0;
      const lossAmount = isWin ? 0 : totalBetAmount;

      showOutcomePopup(currentPeriod, d, sum, isWin, totalWin, lossAmount, roundBetsSummary);

      if (isWin && currentUser) {
        currentUser.balance += totalWin;
        currentUser.balance = Number(currentUser.balance.toFixed(2));
        updateBalanceDisplay(currentUser.balance);
        localStorage.setItem('diuwin_balance', currentUser.balance);
      }
      renderMyBets();
    }

    userBetsThisRound = [];
    currentPeriod++;
    document.getElementById('fivedPeriodNumber').textContent = currentPeriod;
  }, 900);
}

function showOutcomePopup(period, digits, sum, isWin, winAmount, lossAmount, betsSummary) {
  const digitsHtml = digits.map(x => `<span class="outcome-digit">${x}</span>`).join('');
  const sumSize = sum >= 23 ? 'Big' : 'Small';
  const sumParity = sum % 2 !== 0 ? 'Odd' : 'Even';

  const detailsHtml = `
    <div class="outcome-digits-row">${digitsHtml}</div>
    <span class="outcome-badge-pill" style="background: rgba(255,255,255,0.15); font-weight: 800;">Sum: ${sum}</span>
    <span class="outcome-badge-pill" style="background: ${sumSize === 'Big' ? '#f59e0b' : '#3b82f6'};">${sumSize}</span>
    <span class="outcome-badge-pill" style="background: ${sumParity === 'Odd' ? '#10b981' : '#ec4899'};">${sumParity}</span>
  `;

  const betSummaryText = betsSummary && betsSummary.length > 0
    ? `Your Bets: <strong>${betsSummary.join(', ')}</strong>`
    : '';

  if (window.DiuWinOutcomeModal) {
    window.DiuWinOutcomeModal.show({
      isWin,
      winAmount,
      lossAmount,
      period,
      gameName: '5D Lottery 1 Min',
      detailsHtml,
      betSummary: betSummaryText
    });
  }
}

// ==================== BET DRAWER ====================
function openBetDrawer(pos, type, choice, odds, displayName) {
  if (timeRemaining <= 5) {
    showToast('Round locked! Please wait for next draw.');
    return;
  }

  currentBetSelection = { pos, type, choice, odds, displayName };
  activeBaseMoney = 10;
  activeQuantity = 1;
  activeDrawerMultiplier = 1;

  document.getElementById('drawerChoiceBadge').textContent = `5D ${activeTimerDuration / 60} Min: Pos ${pos} - ${displayName} (Odds ${odds})`;
  document.getElementById('qtyInput').value = 1;

  document.querySelectorAll('.base-chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.base-chip[data-base="10"]')?.classList.add('active');

  document.querySelectorAll('.d-chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.d-chip[data-mult="1"]')?.classList.add('active');

  calculateDrawerTotal();
  document.getElementById('betModal').classList.add('show');
}

function calculateDrawerTotal() {
  const total = activeBaseMoney * activeQuantity * activeDrawerMultiplier;
  document.getElementById('drawerTotalAmount').textContent = `₹${total.toFixed(2)}`;
  return total;
}

function confirmBetPlacement() {
  const total = calculateDrawerTotal();

  if (!currentUser || currentUser.balance < total) {
    showToast('Insufficient balance! Please recharge.');
    return;
  }

  // Deduct balance immediately
  currentUser.balance -= total;
  currentUser.balance = Number(currentUser.balance.toFixed(2));
  updateBalanceDisplay(currentUser.balance);
  localStorage.setItem('diuwin_balance', currentUser.balance);

  const betRecord = {
    period: currentPeriod,
    pos: currentBetSelection.pos,
    type: currentBetSelection.type,
    choice: currentBetSelection.choice,
    name: `Pos ${currentBetSelection.pos}-${currentBetSelection.displayName}`,
    odds: currentBetSelection.odds,
    amount: total,
    winAmount: 0,
    profitOrLoss: 0,
    status: 'pending',
    time: new Date().toLocaleTimeString()
  };

  userBetsThisRound.push(betRecord);
  allUserBets.unshift(betRecord);
  try {
    localStorage.setItem('diuwin_5d_mybets', JSON.stringify(allUserBets));
  } catch (e) {}
  renderMyBets();

  showToast(`Bet placed for ₹${total.toFixed(2)} on Pos ${currentBetSelection.pos} ${currentBetSelection.displayName}!`);
  closeBetDrawer();
}

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
    if (data && data.success && data.newBalance !== undefined) {
      if (currentUser) {
        currentUser.balance = data.newBalance;
        updateBalanceDisplay(currentUser.balance);
        localStorage.setItem('diuwin_balance', currentUser.balance);
      }
    }
  } catch (e) {}

  try {
    localStorage.setItem('diuwin_5d_mybets', JSON.stringify(allUserBets));
  } catch (e) {}
}

async function loadMyBetsFromServer() {
  const userId = currentUser ? currentUser.id : 'usr_guest_demo';
  try {
    const res = await fetch(`${API_BASE}/api/games/my-bets?gameId=5d&userId=${encodeURIComponent(userId)}`, {
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
        time: new Date(b.createdAt).toLocaleTimeString()
      }));
      try {
        localStorage.setItem('diuwin_5d_mybets', JSON.stringify(allUserBets));
      } catch (e) {}
      renderMyBets();
    }
  } catch (e) {}
}

function closeBetDrawer() {
  document.getElementById('betModal').classList.remove('show');
}

// ==================== HISTORY RENDERING ====================
function renderHistoryTable() {
  const tbody = document.getElementById('fivedHistoryTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  fivedHistoryRecords.forEach(r => {
    const tr = document.createElement('tr');
    const digitsHtml = r.d.map(val => `<span class="td-digit-pill">${val}</span>`).join('');

    tr.innerHTML = `
      <td class="td-period">${r.period}</td>
      <td>
        <div class="td-digits-set">${digitsHtml}</div>
      </td>
      <td style="font-weight:900; color:#1e293b;">${r.sum}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderMyBets() {
  const list = document.getElementById('myBetsList');
  const empty = document.getElementById('emptyBetsMsg');
  if (!list) return;
  list.innerHTML = '';

  if (allUserBets.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';

  allUserBets.forEach(b => {
    const item = document.createElement('div');
    const isWin = b.status === 'win' || (b.profitOrLoss > 0);
    const isLoss = b.status === 'loss' || (b.profitOrLoss < 0);
    const isPending = b.status === 'pending';

    let badgeHtml = '';
    let badgeBorder = '#e2e8f0';
    let badgeBg = '#ffffff';

    if (isPending) {
      badgeHtml = `<span style="background:#fef3c7; color:#d97706; border:1px solid #fde68a; padding:3px 8px; border-radius:12px; font-weight:800; font-size:11px;">⏳ Waiting Draw</span>`;
      badgeBorder = '#fef3c7';
      badgeBg = '#fffbeb';
    } else if (isWin) {
      badgeHtml = `<span style="background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:3px 8px; border-radius:12px; font-weight:800; font-size:11px;">+₹${b.profitOrLoss.toFixed(2)} Profit</span>`;
      badgeBorder = '#86efac';
      badgeBg = '#f0fdf4';
    } else {
      badgeHtml = `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:3px 8px; border-radius:12px; font-weight:800; font-size:11px;">-₹${b.amount.toFixed(2)} Loss</span>`;
      badgeBorder = '#fca5a5';
      badgeBg = '#fef2f2';
    }

    item.style.cssText = `background:${badgeBg}; border:1px solid ${badgeBorder}; border-radius:12px; padding:12px; margin-bottom:10px; display:flex; flex-direction:column; gap:6px; font-size:12px; box-shadow:0 2px 6px rgba(0,0,0,0.03);`;
    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong style="color:#1e293b; font-size:13px;">${b.name || b.choice}</strong>
          <span style="color:#64748b; font-size:11px; margin-left:6px;">Draw: #${String(b.period).slice(-4)}</span>
        </div>
        ${badgeHtml}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; color:#64748b; font-size:11px; border-top:1px dashed #e2e8f0; padding-top:6px;">
        <div>Bet: <strong style="color:#1e293b;">₹${b.amount.toFixed(2)}</strong> ${b.mult ? '• ' + b.mult + 'x' : ''}</div>
        <div>${b.winAmount > 0 ? 'Payout: <strong style="color:#16a34a;">₹' + b.winAmount.toFixed(2) + '</strong> • ' : ''}<span>${b.time || ''}</span></div>
      </div>
    `;
    list.appendChild(item);
  });
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
  // Navigation
  document.getElementById('btnBackToLobby')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.getElementById('brandLogoHome')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.getElementById('btnRefreshWallet')?.addEventListener('click', () => {
    initUser();
    showToast('Balance refreshed');
  });

  document.getElementById('btnWithdrawModal')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.getElementById('btnRechargeModal')?.addEventListener('click', () => {
    if (window.openUpiRechargeModal) {
      window.openUpiRechargeModal(500);
    } else {
      window.location.href = 'index.html';
    }
  });

  // Timer Modes
  document.querySelectorAll('.time-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.time-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const min = parseInt(t.dataset.time);
      activeTimerDuration = min * 60;
      timeRemaining = activeTimerDuration;
      showToast(`Mode switched to ${min} Minute 5D`);
    });
  });

  // Position Tabs (A, B, C, D, E, Total)
  document.querySelectorAll('.pos-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.pos-tab').forEach(x => x.classList.remove('active'));
      tab.classList.add('active');
      activePosition = tab.dataset.pos;

      // Update active highlight on mechanical cylinders
      const reels = ['reelA', 'reelB', 'reelC', 'reelD', 'reelE'];
      reels.forEach(r => document.getElementById(r)?.classList.remove('active-reel'));
      const activeReelId = `reel${activePosition}`;
      if (document.getElementById(activeReelId)) {
        document.getElementById(activeReelId).classList.add('active-reel');
      }

      showToast(`Position ${activePosition} selected`);
    });
  });

  // Prop Cards (Big, Small, Odd, Even)
  document.querySelectorAll('.prop-card').forEach(c => {
    c.addEventListener('click', () => {
      const choice = c.dataset.choice;
      const odds = parseFloat(c.dataset.odds);
      openBetDrawer(activePosition, 'prop', choice, odds, choice);
    });
  });

  // Number Balls (0 to 9)
  document.querySelectorAll('.fived-ball').forEach(b => {
    b.addEventListener('click', () => {
      const num = b.dataset.choice;
      const odds = parseFloat(b.dataset.odds);
      openBetDrawer(activePosition, 'number', num, odds, `Number ${num}`);
    });
  });

  // Drawer Controls
  document.querySelectorAll('.base-chip').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('.base-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      activeBaseMoney = parseFloat(c.dataset.base);
      calculateDrawerTotal();
    });
  });

  document.getElementById('btnQtyMinus')?.addEventListener('click', () => {
    activeQuantity = Math.max(1, activeQuantity - 1);
    document.getElementById('qtyInput').value = activeQuantity;
    calculateDrawerTotal();
  });

  document.getElementById('btnQtyPlus')?.addEventListener('click', () => {
    activeQuantity = Math.min(999, activeQuantity + 1);
    document.getElementById('qtyInput').value = activeQuantity;
    calculateDrawerTotal();
  });

  document.getElementById('qtyInput')?.addEventListener('input', (e) => {
    activeQuantity = Math.max(1, Math.min(999, parseInt(e.target.value) || 1));
    calculateDrawerTotal();
  });

  document.querySelectorAll('.d-chip').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('.d-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      activeDrawerMultiplier = parseFloat(c.dataset.mult);
      calculateDrawerTotal();
    });
  });

  document.getElementById('btnCancelBet')?.addEventListener('click', closeBetDrawer);
  document.getElementById('btnConfirmBet')?.addEventListener('click', confirmBetPlacement);
  document.getElementById('betModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'betModal') closeBetDrawer();
  });

  document.getElementById('btnCloseResult')?.addEventListener('click', () => {
    document.getElementById('fivedResultModal').classList.remove('show');
  });

  // History Tab Toggles
  document.getElementById('tabGameHistory')?.addEventListener('click', () => {
    document.getElementById('tabGameHistory').classList.add('active');
    document.getElementById('tabMyBets').classList.remove('active');
    document.getElementById('historyTableWrap').style.display = 'block';
    document.getElementById('myBetsWrap').style.display = 'none';
  });

  document.getElementById('tabMyBets')?.addEventListener('click', () => {
    document.getElementById('tabMyBets').classList.add('active');
    document.getElementById('tabGameHistory').classList.remove('active');
    document.getElementById('historyTableWrap').style.display = 'none';
    document.getElementById('myBetsWrap').style.display = 'block';
    renderMyBets();
  });
}
