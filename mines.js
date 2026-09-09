// DiuWin Official Mines - 5x5 Diamond Grid Engine
const IS_FILE_PROTOCOL = window.location.protocol === 'file:';
const IS_LOCAL_DEV = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && 
                     (window.location.port === '5500' || window.location.port === '5501' || IS_FILE_PROTOCOL);
const API_BASE = IS_LOCAL_DEV ? 'http://localhost:3000' : '';

let currentToken = localStorage.getItem('diuwin_token') || null;
let currentUser = null;

// Game State Variables
let gameState = 'IDLE'; // 'IDLE', 'PLAYING', 'GAMEOVER'
let betAmount = 100;
let minesCount = 5;
let gemsFound = 0;
let totalGems = 20;
let currentMultiplier = 1.00;
let nextMultiplier = 1.18;
let minePositions = new Set();
let revealedTiles = new Set();
let soundEnabled = true;

// Sound Effects (Web Audio API Synthesizer)
let audioCtx = null;
function playSound(type) {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'gem') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } else if (type === 'bomb') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.45);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.45);
    } else if (type === 'cashout') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.50, audioCtx.currentTime + 0.3); // C6
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    }
  } catch (e) {}
}

// Toast Helper
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('minesToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// Period and History Variables
let currentMinesPeriod = 1;

function loadCachedMinesHistory() {
  try {
    const cached = localStorage.getItem('diuwin_mines_history');
    if (cached) {
      gamesHistory = JSON.parse(cached);
      renderHistoryBadges();
    }
  } catch (e) {}
}

async function syncMinesHistoryFromServer() {
  try {
    const res = await fetch(`${API_BASE}/api/mines/state`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        if (data.period) currentMinesPeriod = data.period;
        if (data.history && data.history.length > 0) {
          gamesHistory = data.history.slice(0, 10).map(h => ({
            period: h.period,
            isWin: h.isWin,
            mult: h.mult || 1.0,
            mines: h.mines || 5,
            amt: h.amt || h.winAmount || h.betAmount || 100
          }));
          localStorage.setItem('diuwin_mines_history', JSON.stringify(gamesHistory));
          renderHistoryBadges();
        }
      }
    }
  } catch (e) {}
}

// ==================== INITIALIZATION ====================
window.addEventListener('DOMContentLoaded', () => {
  loadCachedMinesHistory();
  initUser();
  buildGrid();
  setupUIEventListeners();
  updateControlsDisplay();
  syncMinesHistoryFromServer();
});

// User Session & Balance Sync
async function initUser() {
  if (!currentToken) {
    try {
      const gRes = await fetch(`${API_BASE}/api/auth/guest`, { method: 'POST' });
      const gData = await gRes.json();
      if (gData && gData.success && gData.token) {
        currentToken = gData.token;
        localStorage.setItem('diuwin_token', currentToken);
        if (gData.user) {
          currentUser = gData.user;
          localStorage.setItem('diuwin_balance', currentUser.balance);
          updateBalanceDisplay(currentUser.balance);
          return;
        }
      }
    } catch (e) {}
  } else {
    try {
      const res = await fetch(`${API_BASE}/api/user/profile`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      const data = await res.json();
      if (data.success && data.user) {
        currentUser = data.user;
        updateBalanceDisplay(currentUser.balance);
        return;
      }
    } catch (e) {}
  }

  // Fallback guest session
  const storedBal = localStorage.getItem('diuwin_balance');
  currentUser = { id: 'usr_guest_demo', name: 'Demo Player', balance: storedBal ? parseFloat(storedBal) : 973.70 };
  updateBalanceDisplay(currentUser.balance);
}

function updateBalanceDisplay(bal) {
  const num = Number(bal || 0);
  const formatted = num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const el = document.getElementById('headerUserBalance');
  if (el) el.textContent = `₹${formatted}`;
}

// ==================== 5x5 GRID BUILDER ====================
function buildGrid() {
  const grid = document.getElementById('minesGrid');
  if (!grid) return;
  grid.innerHTML = '';

  for (let i = 0; i < 25; i++) {
    const tile = document.createElement('div');
    tile.className = 'mine-tile';
    tile.dataset.index = i;
    tile.addEventListener('click', () => handleTileClick(i));
    grid.appendChild(tile);
  }
}

// ==================== GAME LOGIC ====================
function startNewGame() {
  betAmount = Math.max(10, parseFloat(document.getElementById('betAmountInput')?.value) || 100);

  if (currentUser && currentUser.balance < betAmount) {
    showToast('Insufficient balance! Please deposit to play.');
    return;
  }

  // Deduct Bet from user
  if (currentUser) {
    currentUser.balance = Math.max(0, currentUser.balance - betAmount);
    currentUser.balance = Number(currentUser.balance.toFixed(2));
    updateBalanceDisplay(currentUser.balance);
  }

  gameState = 'PLAYING';
  gemsFound = 0;
  totalGems = 25 - minesCount;
  currentMultiplier = 1.00;
  nextMultiplier = calculateNextMultiplier(0);
  revealedTiles.clear();
  minePositions.clear();

  // Randomly place mines
  while (minePositions.size < minesCount) {
    const rand = Math.floor(Math.random() * 25);
    minePositions.add(rand);
  }

  // Hide overlay
  document.getElementById('gridReadyOverlay')?.classList.add('hide');

  // Reset tiles
  document.querySelectorAll('.mine-tile').forEach(t => {
    t.className = 'mine-tile';
    t.innerHTML = '';
  });

  // Update Action Button
  updateActionBtnUI();

  // Update Top Stat Cards
  updateStatsDisplay();

  // Disable controls while playing
  setControlsDisabled(true);
}

function handleTileClick(index) {
  if (gameState !== 'PLAYING' || revealedTiles.has(index)) return;

  revealedTiles.add(index);
  const tile = document.querySelector(`.mine-tile[data-index="${index}"]`);
  if (!tile) return;

  if (minePositions.has(index)) {
    // HIT A MINE! (BOOM)
    playSound('bomb');
    tile.className = 'mine-tile revealed-bomb';
    tile.innerHTML = `<span class="tile-bomb-icon">💣</span>`;
    triggerGameOver(false);
  } else {
    // FOUND A GEM!
    playSound('gem');
    gemsFound++;
    currentMultiplier = nextMultiplier;
    nextMultiplier = calculateNextMultiplier(gemsFound);

    tile.className = 'mine-tile revealed-gem';
    tile.innerHTML = `
      <svg class="tile-gem-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 3h12l4 6-10 12L2 9z" fill="#06b6d4" stroke="#22d3ee"/>
      </svg>
    `;

    // Check if won all gems!
    if (gemsFound >= totalGems) {
      cashoutWinnings(true);
    } else {
      updateStatsDisplay();
      updateActionBtnUI();
    }
  }
}

function calculateNextMultiplier(picks) {
  // Fair Mines formula: Mult = (25 / (25 - mines)) * ... with 98% house edge
  let mult = 1.0;
  for (let i = 0; i <= picks; i++) {
    const remainingTotal = 25 - i;
    const remainingGems = (25 - minesCount) - i;
    if (remainingGems <= 0) break;
    mult *= (remainingTotal / remainingGems);
  }
  return parseFloat((mult * 0.98).toFixed(2));
}

async function recordMinesOutcome(isWin, mult, count, gems, winAmt, betAmt) {
  const period = currentMinesPeriod;
  const numWin = parseFloat(winAmt) || 0;
  const numBet = parseFloat(betAmt) || 0;
  const finalMult = parseFloat(mult) || 0;

  // Add to badges and local storage
  addHistoryBadge(isWin, finalMult, count, isWin ? numWin : numBet);

  // Save to backend APIs
  try {
    await fetch(`${API_BASE}/api/mines/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {})
      },
      body: JSON.stringify({
        period,
        betAmount: numBet,
        winAmount: numWin,
        gemsFound: gems,
        multiplier: finalMult,
        isWin,
        minesCount: count,
        userId: currentUser ? currentUser.id : 'usr_guest_demo'
      })
    });
  } catch (e) {}

  try {
    await fetch(`${API_BASE}/api/games/record-bet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {})
      },
      body: JSON.stringify({
        gameId: 'mines',
        gameName: 'Mines JILI',
        period,
        betAmount: numBet,
        winAmount: numWin,
        multiplier: finalMult,
        choice: `${finalMult}x (${gems} Gems)`,
        details: `${isWin ? 'Cashed Out' : 'Detonated Mine'} (${count} Mines)`,
        userId: currentUser ? currentUser.id : 'usr_guest_demo'
      })
    });
  } catch (e) {}

  currentMinesPeriod++;
}

function cashoutWinnings(isAllGems = false) {
  if (gameState !== 'PLAYING' || gemsFound === 0) return;

  playSound('cashout');
  const winAmount = parseFloat((betAmount * currentMultiplier).toFixed(2));

  // Credit user balance
  if (currentUser) {
    currentUser.balance += winAmount;
    currentUser.balance = Number(currentUser.balance.toFixed(2));
    updateBalanceDisplay(currentUser.balance);
    localStorage.setItem('diuwin_balance', currentUser.balance);
  }

  // Record outcome and send to backend
  recordMinesOutcome(true, currentMultiplier, minesCount, gemsFound, winAmount, betAmount);

  showToast(`🎉 Cashed out ₹${winAmount.toFixed(2)} (${currentMultiplier}x)!`);

  // Reveal remaining mines
  revealAllRemainingMines();

  endGame();
}

function triggerGameOver(isWin) {
  gameState = 'GAMEOVER';

  // Record loss and send to backend
  recordMinesOutcome(false, currentMultiplier, minesCount, gemsFound, 0, betAmount);

  showToast('💥 BOOM! You hit a mine. Better luck next game!');

  // Reveal remaining mines
  revealAllRemainingMines();

  endGame();
}

function revealAllRemainingMines() {
  minePositions.forEach(idx => {
    const tile = document.querySelector(`.mine-tile[data-index="${idx}"]`);
    if (tile && !tile.classList.contains('revealed-bomb')) {
      tile.className = 'mine-tile revealed-bomb-dim';
      tile.innerHTML = `<span style="font-size: 26px;">💣</span>`;
    }
  });
}

function endGame() {
  gameState = 'IDLE';
  updateActionBtnUI();
  setControlsDisabled(false);

  // Show overlay again after 2.2 seconds
  setTimeout(() => {
    if (gameState === 'IDLE') {
      document.getElementById('gridReadyOverlay')?.classList.remove('hide');
    }
  }, 2200);
}

// ==================== UI CONTROLS & UPDATES ====================
function updateStatsDisplay() {
  const gemsLeftEl = document.getElementById('statGemsLeft');
  const multEl = document.getElementById('statCurrentMult');
  const riskEl = document.getElementById('statExplosionRisk');
  const profitEl = document.getElementById('statPotentialProfit');
  const nextTag = document.getElementById('nextPickTag');

  const remainingTiles = 25 - gemsFound;
  const remainingGems = totalGems - gemsFound;

  if (gemsLeftEl) gemsLeftEl.textContent = `${remainingGems} / ${totalGems}`;
  if (multEl) multEl.textContent = `${currentMultiplier.toFixed(2)}x`;
  
  // Explosion risk: mines / remaining tiles
  const risk = gameState === 'PLAYING' ? ((minesCount / remainingTiles) * 100).toFixed(1) : ((minesCount / 25) * 100).toFixed(1);
  if (riskEl) riskEl.textContent = `${risk}%`;

  const profit = gameState === 'PLAYING' ? (betAmount * currentMultiplier).toFixed(2) : '0.00';
  if (profitEl) profitEl.textContent = `₹${profit}`;

  if (nextTag) {
    nextTag.textContent = `Next Pick: ${nextMultiplier.toFixed(2)}x`;
  }
}

function updateActionBtnUI() {
  const btn = document.getElementById('btnMainGameAction');
  if (!btn) return;

  if (gameState === 'PLAYING') {
    if (gemsFound > 0) {
      const liveWin = (betAmount * currentMultiplier).toFixed(2);
      btn.className = 'main-action-btn cashout';
      btn.innerHTML = `CASHOUT ₹${liveWin}`;
    } else {
      btn.className = 'main-action-btn';
      btn.innerHTML = `PICK A TILE`;
      btn.style.opacity = '0.7';
    }
  } else {
    btn.className = 'main-action-btn';
    btn.innerHTML = `BET & START GAME`;
    btn.style.opacity = '1';
  }
}

function updateControlsDisplay() {
  const summaryEl = document.getElementById('minesSummaryText');
  const countEl = document.getElementById('minesCountDisplay');
  const riskBadge = document.getElementById('riskBadge');

  if (summaryEl) summaryEl.textContent = `${minesCount} MINES (${25 - minesCount} DIAMONDS)`;
  if (countEl) countEl.textContent = minesCount;

  // Risk Badge
  if (riskBadge) {
    if (minesCount <= 3) {
      riskBadge.className = 'risk-badge low';
      riskBadge.textContent = 'Low Risk';
    } else if (minesCount <= 9) {
      riskBadge.className = 'risk-badge medium';
      riskBadge.textContent = 'Medium Risk';
    } else {
      riskBadge.className = 'risk-badge high';
      riskBadge.textContent = 'High Risk';
    }
  }

  totalGems = 25 - minesCount;
  nextMultiplier = calculateNextMultiplier(0);
  updateStatsDisplay();
}

function setControlsDisabled(disabled) {
  document.getElementById('betAmountInput').disabled = disabled;
  document.getElementById('btnHalfBet').disabled = disabled;
  document.getElementById('btnDoubleBet').disabled = disabled;
  document.getElementById('btnMinesMinus').disabled = disabled;
  document.getElementById('btnMinesPlus').disabled = disabled;
  document.querySelectorAll('.chip-preset').forEach(c => c.disabled = disabled);
  document.querySelectorAll('.chip-mine').forEach(c => c.disabled = disabled);
}

// ==================== EVENT LISTENERS ====================
function setupUIEventListeners() {
  // Navigation
  document.getElementById('btnBackToLobby')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.querySelector('.brand-title-wrap')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.getElementById('btnHeaderDeposit')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.getElementById('btnRefreshBalance')?.addEventListener('click', () => {
    initUser();
    showToast('Balance refreshed');
  });

  // Sound Toggle
  document.getElementById('btnToggleSound')?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('btnToggleSound');
    if (btn) {
      btn.innerHTML = soundEnabled ? '<i class="fa fa-volume-up"></i>' : '<i class="fa fa-volume-off" style="color:#ef4444;"></i>';
    }
    showToast(soundEnabled ? 'Sound Enabled' : 'Sound Muted');
  });

  // Main Action Button
  document.getElementById('btnMainGameAction')?.addEventListener('click', () => {
    if (gameState === 'IDLE') {
      startNewGame();
    } else if (gameState === 'PLAYING') {
      if (gemsFound > 0) {
        cashoutWinnings();
      } else {
        showToast('Click a tile on the grid to reveal a gem first!');
      }
    }
  });

  // Bet Amount Adjusters
  const betInput = document.getElementById('betAmountInput');
  document.getElementById('btnHalfBet')?.addEventListener('click', () => {
    if (gameState === 'PLAYING') return;
    let v = Math.max(10, Math.floor((parseFloat(betInput.value) || 100) / 2));
    betInput.value = v;
    betAmount = v;
    updateStatsDisplay();
  });

  document.getElementById('btnDoubleBet')?.addEventListener('click', () => {
    if (gameState === 'PLAYING') return;
    let v = Math.min(50000, (parseFloat(betInput.value) || 100) * 2);
    betInput.value = v;
    betAmount = v;
    updateStatsDisplay();
  });

  betInput?.addEventListener('input', (e) => {
    let v = parseFloat(e.target.value) || 10;
    betAmount = Math.max(10, Math.min(50000, v));
    updateStatsDisplay();
  });

  // Bet Presets
  document.querySelectorAll('.chip-preset').forEach(c => {
    c.addEventListener('click', () => {
      if (gameState === 'PLAYING') return;
      document.querySelectorAll('.chip-preset').forEach(x => x.classList.remove('active'));
      c.classList.add('active');

      const val = c.dataset.val;
      if (val === 'min') betAmount = 10;
      else if (val === 'max') betAmount = 50000;
      else betAmount = parseFloat(val);

      if (betInput) betInput.value = betAmount;
      updateStatsDisplay();
    });
  });

  // Mines Stepper
  document.getElementById('btnMinesMinus')?.addEventListener('click', () => {
    if (gameState === 'PLAYING') return;
    minesCount = Math.max(1, minesCount - 1);
    highlightMineChip(minesCount);
    updateControlsDisplay();
  });

  document.getElementById('btnMinesPlus')?.addEventListener('click', () => {
    if (gameState === 'PLAYING') return;
    minesCount = Math.min(24, minesCount + 1);
    highlightMineChip(minesCount);
    updateControlsDisplay();
  });

  // Mines Presets
  document.querySelectorAll('.chip-mine').forEach(c => {
    c.addEventListener('click', () => {
      if (gameState === 'PLAYING') return;
      document.querySelectorAll('.chip-mine').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      minesCount = parseInt(c.dataset.mines);
      updateControlsDisplay();
    });
  });
}

function highlightMineChip(count) {
  document.querySelectorAll('.chip-mine').forEach(c => {
    c.classList.toggle('active', parseInt(c.dataset.mines) === count);
  });
}

// ==================== RECENT GAMES HISTORY BADGES ====================
let gamesHistory = [
  { isWin: false, mult: 1.18, mines: 5, amt: 100.00 },
  { isWin: false, mult: 1.00, mines: 5, amt: 100.00 }
];

function addHistoryBadge(isWin, mult, mines, amt) {
  gamesHistory.unshift({ isWin, mult, mines, amt });
  if (gamesHistory.length > 10) gamesHistory.pop();
  try {
    localStorage.setItem('diuwin_mines_history', JSON.stringify(gamesHistory));
  } catch (e) {}
  renderHistoryBadges();
}

function renderHistoryBadges() {
  const row = document.getElementById('historyBadgesRow');
  const countEl = document.getElementById('historyCountText');
  if (!row) return;
  row.innerHTML = '';

  if (countEl) countEl.textContent = `Showing last ${gamesHistory.length} games`;

  gamesHistory.forEach(h => {
    const badge = document.createElement('div');
    badge.className = `history-badge ${h.isWin ? 'win' : 'loss'}`;
    badge.innerHTML = `
      <i class="fa ${h.isWin ? 'fa-check-circle' : 'fa-times-circle'}"></i>
      <span class="badge-mult">${h.mult.toFixed(2)}x (${h.mines}M)</span>
      <span class="badge-sep">|</span>
      <span class="badge-amt">${h.isWin ? '+' : ''}₹${h.amt.toFixed(2)}</span>
      <i class="fa fa-question-circle-o badge-info"></i>
    `;
    row.appendChild(badge);
  });
}
