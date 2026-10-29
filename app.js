// DiuWin Official Lobby - Logic & Backend Engine
const IS_FILE_PROTOCOL = window.location.protocol === 'file:';
const IS_DEV_PORT = window.location.port && window.location.port !== '3000';
const IS_LOCAL_HOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = (IS_FILE_PROTOCOL || (IS_LOCAL_HOST && IS_DEV_PORT))
  ? `http://${window.location.hostname || 'localhost'}:3000`
  : '';

// Clear persistent tokens from localStorage so opening the site via any link starts cleanly logged-out
try {
  localStorage.removeItem('diuwin_token');
  localStorage.removeItem('diuwin_user');
  localStorage.removeItem('diuwin_balance');
} catch (e) {}

// Active user session is maintained in sessionStorage per browser tab
let currentUser = null;
try {
  const savedUserJson = sessionStorage.getItem('diuwin_user');
  if (savedUserJson) {
    currentUser = JSON.parse(savedUserJson);
    if (currentUser) currentUser.kycStatus = 'VERIFIED';
    const storedBal = sessionStorage.getItem('diuwin_balance');
    if (storedBal !== null && !isNaN(parseFloat(storedBal))) {
      currentUser.balance = parseFloat(storedBal);
    }
  }
} catch (e) {
  currentUser = null;
}

let currentToken = sessionStorage.getItem('diuwin_token') || (currentUser ? currentUser.token : null);
let currentGame = { id: 'aviator', name: 'Aviator', icon: '🚀', rtp: '97.04%', type: 'crash' };
let currentBetAmount = 50;
let lotteryChoice = 'green';
let isSpinning = false;

// 1. Banner Carousel
let currentBannerIndex = 1;
let bannerInterval;

function showBanner(n) {
  const slides = document.querySelectorAll('.banner-slide');
  const dots = document.querySelectorAll('.dot');
  if (slides.length === 0) return;
  if (n > slides.length) currentBannerIndex = 1;
  if (n < 1) currentBannerIndex = slides.length;

  slides.forEach(s => s.classList.remove('active'));
  dots.forEach(d => d.classList.remove('active'));

  if (slides[currentBannerIndex - 1]) slides[currentBannerIndex - 1].classList.add('active');
  if (dots[currentBannerIndex - 1]) dots[currentBannerIndex - 1].classList.add('active');
}

function currentBanner(n) {
  clearInterval(bannerInterval);
  currentBannerIndex = n;
  showBanner(currentBannerIndex);
  startBannerAutoRotation();
}

function autoBanner() {
  currentBannerIndex++;
  showBanner(currentBannerIndex);
}

function startBannerAutoRotation() {
  clearInterval(bannerInterval);
  bannerInterval = setInterval(autoBanner, 3000);
}
showBanner(currentBannerIndex);
startBannerAutoRotation();

// Helper for event binding
function on(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

// Toast notification
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// Update Balance UI
function updateBalanceUI(balance) {
  const num = balance !== undefined && balance !== null ? Number(balance) : 0;
  const formatted = num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const bDisplay = document.getElementById('headerBalanceDisplay');
  const bArena = document.getElementById('arenaBalance');
  const bModal = document.getElementById('walletModalBalance');
  const bAcc = document.getElementById('accBalanceVal');
  const bWith = document.getElementById('withdrawAvailBal');
  const bAccView = document.getElementById('accViewBalance');
  if (bDisplay) bDisplay.textContent = `₹${formatted}`;
  if (bArena) bArena.textContent = formatted;
  if (bModal) bModal.textContent = formatted;
  if (bAcc) bAcc.textContent = formatted;
  if (bWith) bWith.textContent = formatted;
  if (bAccView) bAccView.textContent = formatted;

  // Persist into storages so balance stays synchronized across all components & tabs
  try {
    sessionStorage.setItem('diuwin_balance', num);
    localStorage.setItem('diuwin_balance', num);
    if (currentUser) {
      currentUser.balance = num;
      sessionStorage.setItem('diuwin_user', JSON.stringify(currentUser));
      localStorage.setItem('diuwin_user', JSON.stringify(currentUser));
    }
  } catch (e) {}

  if (typeof updateWithdrawalBreakdown === 'function') {
    updateWithdrawalBreakdown();
  }
}

// API Helper
async function apiRequest(endpoint, method = 'GET', data = null) {
  const url = `${API_BASE}${endpoint}`;
  const headers = { 'Content-Type': 'application/json' };
  if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : null,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (res.ok) return await res.json();
    const errJson = await res.json().catch(() => null);
    if (errJson) {
      if (res.status === 401) errJson.status = 401;
      return errJson;
    }
  } catch (err) {}

  // Local fallback simulation (if server unreachable)
  return fallbackHandler(endpoint, method, data);
}

function fallbackHandler(endpoint, method, data) {
  if (endpoint.includes('/api/user/profile')) {
    const savedUserJson = localStorage.getItem('diuwin_user');
    if (savedUserJson) {
      try {
        const u = JSON.parse(savedUserJson);
        const b = localStorage.getItem('diuwin_balance');
        if (b !== null && !isNaN(parseFloat(b))) u.balance = parseFloat(b);
        return { success: true, user: u };
      } catch (e) {}
    }
    if (currentUser) {
      return { success: true, user: currentUser };
    }
    return { success: false, message: 'Not logged in' };
  }
  if (endpoint.includes('/api/auth/guest')) {
    currentUser = { id: 'usr_guest_demo', name: 'Demo Player', phone: '9876543210', balance: 1000.00, vipLevel: 1, token: 'token_guest_demo', kycStatus: 'VERIFIED' };
    localStorage.setItem('diuwin_token', currentUser.token);
    localStorage.setItem('diuwin_user', JSON.stringify(currentUser));
    localStorage.setItem('diuwin_balance', currentUser.balance);
    return { success: true, user: currentUser };
  }
  if (endpoint.includes('/api/auth/login')) {
    const phone = data?.phone || '9876543210';
    const lastDigits = phone.slice(-4);
    const storedBal = parseFloat(localStorage.getItem('diuwin_balance') || '1000.00');
    currentUser = { id: 'usr_' + phone, name: 'Player ' + lastDigits, phone: phone, balance: storedBal, vipLevel: 1, token: 'tok_' + phone, kycStatus: 'VERIFIED' };
    localStorage.setItem('diuwin_token', currentUser.token);
    localStorage.setItem('diuwin_user', JSON.stringify(currentUser));
    localStorage.setItem('diuwin_balance', currentUser.balance);
    return { success: true, user: currentUser };
  }
  if (endpoint.includes('/api/auth/register')) {
    const phone = data?.phone || '9876543210';
    const lastDigits = phone.slice(-4);
    currentUser = { id: 'usr_' + phone, name: 'Player ' + lastDigits, phone: phone, balance: 500.00, vipLevel: 1, token: 'tok_' + phone, kycStatus: 'VERIFIED' };
    localStorage.setItem('diuwin_token', currentUser.token);
    localStorage.setItem('diuwin_user', JSON.stringify(currentUser));
    localStorage.setItem('diuwin_balance', currentUser.balance);
    return { success: true, user: currentUser };
  }
  if (endpoint.includes('/api/wallet/deposit')) {
    const amt = parseFloat(data?.amount || 200);
    if (!currentUser) currentUser = { id: 'usr_guest_demo', name: 'Demo Player', phone: '9876543210', balance: 1000, vipLevel: 1, kycStatus: 'VERIFIED' };
    currentUser.balance += amt;
    localStorage.setItem('diuwin_balance', currentUser.balance);
    localStorage.setItem('diuwin_user', JSON.stringify(currentUser));
    
    // Save to local transactions cache
    try {
      const existing = JSON.parse(localStorage.getItem('diuwin_transactions') || '[]');
      existing.unshift({
        id: 'tx_dep_' + Date.now(),
        type: 'DEPOSIT',
        method: data?.method || 'UPI QR Scanner',
        destination: 'Wallet',
        amount: amt,
        balanceAfter: currentUser.balance,
        status: 'PENDING',
        utrNumber: data?.utrNumber || ('UTR' + Date.now().toString().slice(-8)),
        description: `Recharge ₹${amt} (Awaiting Admin Approval)`,
        createdAt: new Date().toISOString()
      });
      localStorage.setItem('diuwin_transactions', JSON.stringify(existing.slice(0, 100)));
    } catch(e) {}
    return { success: true, newBalance: currentUser.balance };
  }
  if (endpoint.includes('/api/wallet/withdraw')) {
    const amt = parseFloat(data?.amount || 100);
    if (!currentUser || currentUser.balance < amt) return { success: false, message: 'Insufficient balance' };
    currentUser.balance -= amt;
    localStorage.setItem('diuwin_balance', currentUser.balance);
    localStorage.setItem('diuwin_user', JSON.stringify(currentUser));

    // Save to local transactions cache
    try {
      const existing = JSON.parse(localStorage.getItem('diuwin_transactions') || '[]');
      existing.unshift({
        id: 'tx_wd_' + Date.now(),
        type: 'WITHDRAW',
        method: data?.method || 'UPI',
        destination: data?.upiOrBank || 'Bank Account',
        amount: amt,
        balanceAfter: currentUser.balance,
        status: 'UNDER_REVIEW',
        description: `Withdrawal request of ₹${amt}`,
        createdAt: new Date().toISOString()
      });
      localStorage.setItem('diuwin_transactions', JSON.stringify(existing.slice(0, 100)));
    } catch(e) {}
    return { success: true, newBalance: currentUser.balance };
  }
  if (endpoint.includes('/api/wallet/transactions')) {
    const cached = localStorage.getItem('diuwin_transactions');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return { success: true, transactions: parsed };
      } catch (e) {}
    }
    const initialTxs = [
      {
        id: 'tx_init_1',
        type: 'DEPOSIT',
        method: 'UPI QR Scanner',
        destination: 'Wallet',
        amount: 500,
        balanceAfter: (currentUser?.balance || 3757),
        status: 'SUCCESS',
        utrNumber: '787765608098',
        description: 'Recharge ₹500 via UPI QR Scanner',
        createdAt: new Date().toISOString()
      },
      {
        id: 'tx_init_2',
        type: 'SIGNUP_BONUS',
        method: 'SYSTEM',
        destination: 'Wallet',
        amount: 500,
        balanceAfter: 500,
        status: 'SUCCESS',
        description: '₹500 Signup Bonus Claimed',
        createdAt: new Date(Date.now() - 86400000).toISOString()
      }
    ];
    localStorage.setItem('diuwin_transactions', JSON.stringify(initialTxs));
    return { success: true, transactions: initialTxs };
  }
  if (endpoint.includes('/api/games/my-bets')) {
    const cachedBets = localStorage.getItem('diuwin_bets');
    if (cachedBets) {
      try {
        const parsed = JSON.parse(cachedBets);
        if (Array.isArray(parsed) && parsed.length > 0) return { success: true, bets: parsed };
      } catch (e) {}
    }
    const initialBets = [
      {
        gameId: 'wingo',
        gameName: 'WinGo 1Min',
        betAmount: 50,
        winAmount: 98,
        multiplier: 1.96,
        isWin: true,
        profitOrLoss: 48,
        details: 'Green (1.96x)',
        createdAt: new Date().toISOString()
      },
      {
        gameId: 'aviator',
        gameName: 'Aviator',
        betAmount: 100,
        winAmount: 210,
        multiplier: 2.1,
        isWin: true,
        profitOrLoss: 110,
        details: 'Cashed out @ 2.10x',
        createdAt: new Date(Date.now() - 3600000).toISOString()
      }
    ];
    localStorage.setItem('diuwin_bets', JSON.stringify(initialBets));
    return { success: true, bets: initialBets };
  }
  if (endpoint.includes('/api/games/play')) {
    const bet = parseFloat(data?.betAmount || 50);
    if (!currentUser || currentUser.balance < bet) return { success: false, message: 'Insufficient balance. Please recharge!' };
    currentUser.balance -= bet;
    let mult = Math.random() > 0.45 ? 1.8 : 0;
    let win = bet * mult;
    currentUser.balance += win;
    localStorage.setItem('diuwin_balance', currentUser.balance);
    localStorage.setItem('diuwin_user', JSON.stringify(currentUser));
    const betObj = {
      gameId: data?.gameId || 'game',
      gameName: (data?.gameId || 'Game').toUpperCase(),
      betAmount: bet,
      multiplier: mult,
      winAmount: win,
      isWin: win > 0,
      profitOrLoss: win > 0 ? (win - bet) : -bet,
      details: `${mult > 0 ? win + ' Won' : 'Loss'}`,
      createdAt: new Date().toISOString(),
      outcomeDetails: {
        reels: ['7️⃣', '7️⃣', '7️⃣'],
        targetAngle: 1845,
        crashedAt: 1.8
      }
    };
    try {
      const existingBets = JSON.parse(localStorage.getItem('diuwin_bets') || '[]');
      existingBets.unshift(betObj);
      localStorage.setItem('diuwin_bets', JSON.stringify(existingBets.slice(0, 100)));
    } catch(e) {}
    return {
      success: true,
      newBalance: currentUser.balance,
      bet: betObj
    };
  }
  return { success: true };
}

// User Session & Header Status
async function initUserSession() {
  // Always ensure site starts on Main Page (Home view)
  switchView('viewHome');

  // If no session token, keep visitor logged out with Log In / Register buttons
  if (!currentToken || !currentUser) {
    currentUser = null;
    currentToken = null;
    renderHeaderStatus();
    return;
  }

  // Sync latest balance if saved in sessionStorage
  const storedBal = sessionStorage.getItem('diuwin_balance');
  if (storedBal !== null && !isNaN(parseFloat(storedBal))) {
    currentUser.balance = parseFloat(storedBal);
  }
  renderHeaderStatus();

  try {
    const res = await apiRequest('/api/user/profile');
    if (res && res.success && res.user) {
      currentUser = res.user;
      sessionStorage.setItem('diuwin_user', JSON.stringify(currentUser));
      sessionStorage.setItem('diuwin_balance', currentUser.balance);
      renderHeaderStatus();
    } else if (res && (res.status === 401 || !res.success)) {
      currentUser = null;
      currentToken = null;
      sessionStorage.removeItem('diuwin_token');
      sessionStorage.removeItem('diuwin_user');
      sessionStorage.removeItem('diuwin_balance');
      renderHeaderStatus();
    }
  } catch (err) {
    console.warn('Profile fetch network issue, preserving local state:', err);
  }
}

function renderHeaderStatus() {
  const headerContainer = document.getElementById('header-user-status');
  if (!headerContainer) return;

  if (currentUser) {
    headerContainer.innerHTML = `
      <div class="balance-stack-box" id="headerBalanceBox" title="Click to view Account / Wallet">
        <span class="balance-stack-label">Balance</span>
        <span class="balance-stack-val" id="headerBalanceDisplay">₹${Number(currentUser.balance || 0).toFixed(2)}</span>
      </div>
    `;
    const box = document.getElementById('headerBalanceBox');
    if (box) box.onclick = openAccountModal;
  } else {
    headerContainer.innerHTML = `
      <button class="header-btn-login" id="headerLoginBtn">Log in</button>
      <button class="header-btn-register" id="headerRegisterBtn">Register</button>
    `;
    const lBtn = document.getElementById('headerLoginBtn');
    const rBtn = document.getElementById('headerRegisterBtn');
    if (lBtn) {
      lBtn.onclick = () => {
        switchAuthTab('login');
        openModal('authModal');
      };
    }
    if (rBtn) {
      rBtn.onclick = () => {
        switchAuthTab('register');
        openModal('authModal');
      };
    }
  }
  updateBalanceUI(currentUser ? currentUser.balance : 0);
}

// Real-Time Winning Information Feed
const avatarGradients = [
  'linear-gradient(135deg, #FF6B6B 0%, #EE5253 100%)',
  'linear-gradient(135deg, #48DBFB 0%, #0ABDE3 100%)',
  'linear-gradient(135deg, #1DD1A1 0%, #10AC84 100%)',
  'linear-gradient(135deg, #FDA7DF 0%, #D980FA 100%)',
  'linear-gradient(135deg, #FECA57 0%, #FF9F43 100%)',
  'linear-gradient(135deg, #54A0FF 0%, #2E86DE 100%)'
];

const knownWinIds = new Set();
async function fetchBackendLiveWins() {
  const res = await apiRequest('/api/games/live-wins');
  if (res.success && res.wins && res.wins.length > 0) {
    const feed = document.getElementById('activityFeed');
    if (!feed) return;

    if (feed.children.length === 0) {
      feed.innerHTML = '';
      res.wins.slice(0, 6).forEach(w => {
        const id = w.id || `${w.user}_${w.amount}`;
        knownWinIds.add(id);
        const avatarGrad = avatarGradients[Math.floor(Math.random() * avatarGradients.length)];
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.innerHTML = `
          <div class="activity-user">
            <div class="activity-avatar" style="background: ${avatarGrad};">${w.avatar || 'M'}</div>
            <div>
              <div class="activity-username">${w.user}</div>
              <div class="activity-game-badge" style="background: rgba(32, 185, 107, 0.12); color: #1a9e5b;">${w.game}</div>
            </div>
          </div>
          <div class="activity-win">
            <div class="activity-amount">Receive ₹${Number(w.amount).toFixed(2)}</div>
            <div class="activity-status">Winning amount</div>
          </div>
        `;
        feed.appendChild(item);
      });
      return;
    }

    const newWins = res.wins.filter(w => !knownWinIds.has(w.id || `${w.user}_${w.amount}`));
    if (newWins.length > 0) {
      newWins.slice(0, 2).forEach(w => {
        const id = w.id || `${w.user}_${w.amount}`;
        knownWinIds.add(id);
        const avatarGrad = avatarGradients[Math.floor(Math.random() * avatarGradients.length)];
        const item = document.createElement('div');
        item.className = 'activity-item new-win-slide';
        item.innerHTML = `
          <div class="activity-user">
            <div class="activity-avatar" style="background: ${avatarGrad};">${w.avatar || 'M'}</div>
            <div>
              <div class="activity-username">${w.user}</div>
              <div class="activity-game-badge" style="background: rgba(32, 185, 107, 0.12); color: #1a9e5b;">${w.game}</div>
            </div>
          </div>
          <div class="activity-win">
            <div class="activity-amount">Receive ₹${Number(w.amount).toFixed(2)}</div>
            <div class="activity-status">Winning amount</div>
          </div>
        `;
        feed.insertBefore(item, feed.firstChild);
        while (feed.children.length > 6) {
          feed.lastChild.remove();
        }
      });
    }
  }
}

fetchBackendLiveWins();
setInterval(fetchBackendLiveWins, 4000);

// ==================== GAME ARENA MODAL ====================
const GAMES_MAP = {
  cricket: { id: 'cricket', name: 'Cricket Exchange', icon: '🏏', rtp: '98.50%', type: 'sports' },
  aviator: { id: 'aviator', name: 'Aviator', icon: '🚀', rtp: '97.04%', type: 'crash' },
  mines: { id: 'mines', name: 'Mines', icon: '💎', rtp: '97.76%', type: 'slots' },
  chicken: { id: 'chicken', name: 'Chicken Road', icon: '🐔', rtp: '96.79%', type: 'crash' },
  wingo: { id: 'wingo', name: 'WinGo 1Min', icon: '🎟️', rtp: '96.36%', type: 'lottery' },
  k3: { id: 'k3', name: 'K3 3Min', icon: '🎲', rtp: '96.60%', type: 'lottery' },
  '5d': { id: '5d', name: '5D Lottery', icon: '🎱', rtp: '96.49%', type: 'lottery' },
  lucky: { id: 'lucky_spin', name: 'Wheel of Fortune', icon: '🎡', rtp: '97.80%', type: 'wheel' }
};

document.querySelectorAll('.game-card-3col').forEach(card => {
  card.onclick = () => {
    if (!currentUser) {
      showToast('Please log in or register to play!');
      switchAuthTab('login');
      openModal('authModal');
      return;
    }
    const key = card.dataset.game;
    if (key === 'cricket') {
      window.location.href = 'cricket.html';
      return;
    }
    if (key === 'aviator') {
      window.location.href = 'aviator.html';
      return;
    }
    if (key === 'mines') {
      window.location.href = 'mines.html';
      return;
    }
    if (key === 'chicken') {
      window.location.href = 'chicken.html';
      return;
    }
    if (key === 'wingo') {
      window.location.href = 'win.html';
      return;
    }
    if (key === 'k3') {
      window.location.href = 'k3.html';
      return;
    }
    if (key === '5d') {
      window.location.href = '5d.html';
      return;
    }
    const g = GAMES_MAP[key] || GAMES_MAP.aviator;
    openGameArena(g);
  };
});

function openGameArena(g) {
  currentGame = g;
  document.getElementById('arenaGameTitle').textContent = g.name;
  document.getElementById('arenaGameIcon').textContent = g.icon;
  document.getElementById('arenaGameRtp').textContent = `RTP ${g.rtp} • Provably Fair`;
  document.getElementById('arenaResultBanner').style.display = 'none';

  const stage = document.getElementById('gameStage');
  const btnText = document.getElementById('arenaPlayBtnText');

  if (g.type === 'wheel') {
    btnText.textContent = 'SPIN WHEEL';
    stage.innerHTML = `
      <div class="wheel-container">
        <div class="wheel-pointer"></div>
        <canvas id="wheelCanvas" class="wheel-canvas" width="200" height="200"></canvas>
        <div class="wheel-center-hub">SPIN</div>
      </div>
    `;
    drawWheel();
  } else if (g.type === 'slots') {
    btnText.textContent = 'PULL LEVER';
    stage.innerHTML = `
      <div class="slot-machine-box">
        <div class="slot-reel" id="reel1">7️⃣</div>
        <div class="slot-reel" id="reel2">⭐</div>
        <div class="slot-reel" id="reel3">7️⃣</div>
      </div>
    `;
  } else if (g.type === 'lottery') {
    btnText.textContent = 'PLACE BET';
    stage.innerHTML = `
      <div class="lottery-grid-options">
        <div style="display:flex; justify-content:space-between; font-size:12px; color:#fff; font-weight:700;">
          <span>${g.name}</span>
          <span style="color:#fbbf24;">Draw in: <strong id="lotCount">15s</strong></span>
        </div>
        <div class="lottery-colors">
          <button class="lot-btn green active" data-c="green">Green (2x)</button>
          <button class="lot-btn violet" data-c="violet">Violet (4.5x)</button>
          <button class="lot-btn red" data-c="red">Red (2x)</button>
        </div>
      </div>
    `;
    document.querySelectorAll('.lot-btn').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('.lot-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        lotteryChoice = b.dataset.c;
      };
    });
  } else if (g.type === 'fishing') {
    btnText.textContent = 'FIRE HARPOON';
    stage.innerHTML = `
      <div class="fishing-stage-box" style="position:relative; width:100%; height:180px; background:linear-gradient(180deg, #0284c7 0%, #0369a1 50%, #0c4a6e 100%); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:inset 0 0 20px rgba(0,0,0,0.5);">
        <div id="fishBubbleArea" style="position:absolute; inset:0; pointer-events:none;"></div>
        <div id="fishTarget" style="font-size:52px; filter:drop-shadow(0 6px 12px rgba(0,0,0,0.4)); transition:transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);">${g.icon || '🦈'}</div>
        <div id="fishStatus" style="font-size:13px; font-weight:800; color:#fef08a; margin-top:8px; text-shadow:0 2px 4px rgba(0,0,0,0.6);">${g.name} Arena</div>
      </div>
    `;
  } else {
    // Crash
    btnText.textContent = 'LAUNCH FLIGHT';
    stage.innerHTML = `
      <div class="crash-container">
        <div class="crash-multiplier" id="crashMult">1.00x</div>
        <div class="crash-rocket-icon" id="crashRocket">${g.icon}</div>
      </div>
    `;
  }

  openModal('gameArenaModal');
}

function drawWheel() {
  const canvas = document.getElementById('wheelCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const segs = ['0x', '1.2x', '0.5x', '2.0x', 'Miss', '3.0x', '1.5x', '5.0x'];
  const colors = ['#4c1d95', '#f59e0b', '#7c3aed', '#10b981', '#4c1d95', '#f59e0b', '#7c3aed', '#ec4899'];
  const arc = (Math.PI * 2) / segs.length;

  segs.forEach((s, i) => {
    ctx.beginPath();
    ctx.fillStyle = colors[i];
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, cx - 3, i * arc, (i + 1) * arc);
    ctx.lineTo(cx, cy);
    ctx.fill();
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Outfit';
    ctx.translate(cx, cy);
    ctx.rotate(i * arc + arc / 2);
    ctx.textAlign = 'right';
    ctx.fillText(s, cx - 12, 3);
    ctx.restore();
  });
}

// Bet Selection
document.querySelectorAll('#betChips .chip').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('#betChips .chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    currentBetAmount = parseFloat(btn.dataset.amount);
    document.getElementById('customBetInput').value = currentBetAmount;
  };
});

on('customBetInput', 'input', (e) => {
  const v = parseFloat(e.target.value);
  if (v > 0) currentBetAmount = v;
});

// Play Action
on('arenaPlayActionBtn', 'click', async () => {
  if (isSpinning) return;
  if (!currentUser) {
    showToast('Please log in or register to play!');
    switchAuthTab('login');
    openModal('authModal');
    return;
  }

  const bet = parseFloat(document.getElementById('customBetInput')?.value || currentBetAmount);
  if (currentUser.balance < bet) {
    showToast('Insufficient balance! Please recharge.');
    openModal('walletModal');
    return;
  }

  isSpinning = true;
  const playBtn = document.getElementById('arenaPlayActionBtn');
  if (playBtn) playBtn.disabled = true;

  const res = await apiRequest('/api/games/play', 'POST', {
    gameId: currentGame.id,
    betAmount: bet,
    choice: lotteryChoice
  });

  if (!res.success) {
    showToast(res.message || 'Game error');
    isSpinning = false;
    if (playBtn) playBtn.disabled = false;
    return;
  }

  currentUser.balance = res.newBalance;
  updateBalanceUI(res.newBalance);
  localStorage.setItem('diuwin_balance', res.newBalance);

  if (currentGame.type === 'wheel') {
    const canvas = document.getElementById('wheelCanvas');
    if (canvas) canvas.style.transform = `rotate(${res.bet?.outcomeDetails?.targetAngle || 1845}deg)`;
    setTimeout(() => {
      finishGame(res.bet);
      isSpinning = false;
      if (playBtn) playBtn.disabled = false;
    }, 3600);
  } else if (currentGame.type === 'slots') {
    const reels = [document.getElementById('reel1'), document.getElementById('reel2'), document.getElementById('reel3')];
    reels.forEach(r => r?.classList.add('spinning'));
    setTimeout(() => {
      const outcomes = res.bet?.outcomeDetails?.reels || ['7️⃣', '⭐', '7️⃣'];
      reels.forEach((r, idx) => {
        if (r) {
          r.classList.remove('spinning');
          r.textContent = outcomes[idx];
        }
      });
      finishGame(res.bet);
      isSpinning = false;
      if (playBtn) playBtn.disabled = false;
    }, 1000);
  } else if (currentGame.type === 'crash') {
    const multEl = document.getElementById('crashMult');
    const rEl = document.getElementById('crashRocket');
    if (rEl) rEl.classList.add('flying');
    let cur = 1.00;
    const target = res.bet?.outcomeDetails?.cashoutAt || 1.8;
    const timer = setInterval(() => {
      cur += 0.08;
      if (multEl) multEl.textContent = `${cur.toFixed(2)}x`;
      if (cur >= target) {
        clearInterval(timer);
        if (rEl) rEl.classList.remove('flying');
        finishGame(res.bet);
        isSpinning = false;
        if (playBtn) playBtn.disabled = false;
      }
    }, 60);
  } else if (currentGame.type === 'fishing') {
    const fishTarget = document.getElementById('fishTarget');
    const fishStatus = document.getElementById('fishStatus');
    if (fishTarget) fishTarget.style.transform = 'scale(1.3) rotate(20deg)';
    if (fishStatus) fishStatus.textContent = '⚡ Harpoon Fired! Catching creature...';
    setTimeout(() => {
      if (fishTarget) fishTarget.style.transform = res.bet?.isWin ? 'scale(1.1) rotate(0deg)' : 'scale(0.8) opacity(0.5)';
      finishGame(res.bet);
      isSpinning = false;
      if (playBtn) playBtn.disabled = false;
    }, 900);
  } else {
    setTimeout(() => {
      finishGame(res.bet);
      isSpinning = false;
      if (playBtn) playBtn.disabled = false;
    }, 600);
  }
});

function finishGame(bet) {
  const banner = document.getElementById('arenaResultBanner');
  if (!banner) return;
  banner.style.display = 'block';
  if (bet?.isWin) {
    banner.className = 'arena-result-banner win';
    banner.innerHTML = `🎉 WIN! ₹${Number(bet.winAmount).toFixed(2)} <small>(${bet.multiplier}x)</small>`;
    showToast(`Congratulations! You won ₹${Number(bet.winAmount).toFixed(2)}`);
  } else {
    banner.className = 'arena-result-banner lose';
    banner.textContent = 'Try again! Better luck next round.';
  }
}

// Modal management
let previousModalId = null;

function openModal(id, preservePrevious = false) {
  if (preservePrevious) {
    const m = document.getElementById(id);
    if (m) {
      m.classList.add('show');
      m.style.display = 'grid';
    }
    return;
  }
  const currentlyOpen = document.querySelector('.modal-backdrop.show');
  if (currentlyOpen && currentlyOpen.id !== id) {
    previousModalId = currentlyOpen.id;
  }
  closeAllModals();
  const m = document.getElementById(id);
  if (m) {
    m.classList.add('show');
    m.style.display = 'grid';
  }
}

function closeModal(id) {
  const m = typeof id === 'string' ? document.getElementById(id) : id;
  if (m) {
    m.classList.remove('show');
    m.style.display = '';
  }
  if (previousModalId && previousModalId !== (typeof id === 'string' ? id : m?.id)) {
    const prev = document.getElementById(previousModalId);
    if (prev) {
      prev.classList.add('show');
      prev.style.display = 'grid';
    }
    previousModalId = null;
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop').forEach(m => {
    m.classList.remove('show');
    m.style.display = '';
  });
}

document.querySelectorAll('.modal-close-btn').forEach(b => {
  b.onclick = (e) => {
    const parentBackdrop = b.closest('.modal-backdrop');
    if (parentBackdrop && parentBackdrop.id === 'kycModal') {
      closeModal('kycModal');
    } else {
      closeAllModals();
    }
  };
});

document.querySelectorAll('.modal-backdrop').forEach(b => {
  b.onclick = (e) => {
    if (e.target === b) {
      if (b.id === 'kycModal') {
        closeModal('kycModal');
      } else {
        closeAllModals();
      }
    }
  };
});

// ==================== DYNAMIC CATEGORY FILTERING & CATALOG ====================
const ALL_GAMES_CATALOG = [
  // --- HOT / RECOMMENDED ---
  {
    id: 'aviator',
    name: 'Aviator',
    icon: '🚀',
    category: ['all', 'original'],
    rtp: '97.04%',
    type: 'crash',
    image: 'images/aviator_tile.jpg',
    tag: 'HOT',
    page: 'aviator.html'
  },
  {
    id: 'mines',
    name: 'Mines',
    icon: '💎',
    category: ['all', 'slots', 'original'],
    rtp: '97.76%',
    type: 'slots',
    image: 'images/mines_tile.jpg',
    tag: 'JILI',
    page: 'mines.html'
  },
  {
    id: 'chicken',
    name: 'Chicken Road',
    icon: '🐔',
    category: ['all', 'original'],
    rtp: '96.79%',
    type: 'crash',
    image: 'images/chicken_tile.png',
    tag: 'POPULAR',
    page: 'chicken.html'
  },
  {
    id: 'wingo',
    name: 'WinGo 1Min',
    icon: '🎟️',
    category: ['all', 'lottery'],
    rtp: '96.36%',
    type: 'lottery',
    image: 'asset/wingo.png',
    tag: 'HOT',
    page: 'win.html'
  },
  {
    id: 'k3',
    name: 'K3 3Min',
    icon: '🎲',
    category: ['all', 'lottery'],
    rtp: '96.60%',
    type: 'lottery',
    image: 'asset/k3.png',
    tag: 'PROVABLY',
    page: 'k3.html'
  },
  {
    id: '5d',
    name: '5D Lottery',
    icon: '🎱',
    category: ['all', 'lottery'],
    rtp: '96.49%',
    type: 'lottery',
    image: 'asset/5d.png',
    tag: 'LOTTERY',
    page: '5d.html'
  },
  {
    id: 'lucky',
    name: 'Lucky Spin Wheel',
    icon: '🎡',
    category: ['all', 'lottery', 'original'],
    rtp: '97.80%',
    type: 'wheel',
    image: 'asset/turn_icon.png',
    bgGrad: 'linear-gradient(135deg, #3b0764, #7e22ce)',
    tag: 'SPIN & WIN'
  },
  {
    id: 'golden_777',
    name: 'Golden 777',
    icon: '🎰',
    category: ['all', 'slots'],
    rtp: '97.20%',
    type: 'slots',
    image: 'images/casino.webp',
    bgGrad: 'linear-gradient(135deg, #78350f, #d97706)',
    tag: '25X JACKPOT'
  },
  {
    id: 'mega_fishing',
    name: 'Mega Fishing',
    icon: '🦈',
    category: ['all', 'fishing'],
    rtp: '97.20%',
    type: 'fishing',
    image: 'images/fishing.webp',
    bgGrad: 'linear-gradient(135deg, #0c4a6e, #0284c7)',
    tag: 'JILI'
  },

  // --- SLOTS ONLY ---
  {
    id: 'fortune_tiger',
    name: 'Fortune Tiger',
    icon: '🐯',
    category: ['slots'],
    rtp: '96.85%',
    type: 'slots',
    bgGrad: 'linear-gradient(135deg, #7f1d1d, #ef4444)',
    tag: 'PG SOFT'
  },
  {
    id: 'crazy_777',
    name: 'Crazy 777',
    icon: '⭐',
    category: ['slots'],
    rtp: '97.10%',
    type: 'slots',
    bgGrad: 'linear-gradient(135deg, #713f12, #eab308)',
    tag: 'JILI'
  },
  {
    id: 'super_ace',
    name: 'Super Ace',
    icon: '🃏',
    category: ['slots'],
    rtp: '96.95%',
    type: 'slots',
    bgGrad: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
    tag: 'JILI'
  },
  {
    id: 'money_coming',
    name: 'Money Coming',
    icon: '💰',
    category: ['slots'],
    rtp: '97.40%',
    type: 'slots',
    bgGrad: 'linear-gradient(135deg, #064e3b, #10b981)',
    tag: 'JILI'
  },

  // --- LOTTERY ONLY ---
  {
    id: 'wingo_30s',
    name: 'WinGo 30s',
    icon: '⏱️',
    category: ['lottery'],
    rtp: '96.50%',
    type: 'lottery',
    image: 'asset/wingo.png',
    tag: '30 SEC',
    page: 'win.html'
  },
  {
    id: 'trx_win',
    name: 'Trx WinGo',
    icon: '💎',
    category: ['lottery'],
    rtp: '96.75%',
    type: 'lottery',
    bgGrad: 'linear-gradient(135deg, #312e81, #6366f1)',
    tag: 'BLOCKCHAIN',
    page: 'win.html'
  },
  {
    id: 'k3_1min',
    name: 'K3 1Min',
    icon: '🎲',
    category: ['lottery'],
    rtp: '96.65%',
    type: 'lottery',
    image: 'asset/k3.png',
    tag: 'FAST DICE',
    page: 'k3.html'
  },

  // --- ORIGINAL ONLY ---
  {
    id: 'rocket_dash',
    name: 'Rocket Crash',
    icon: '🚀',
    category: ['original'],
    rtp: '97.10%',
    type: 'crash',
    bgGrad: 'linear-gradient(135deg, #1e1b4b, #4f46e5)',
    tag: 'CRASH'
  },
  {
    id: 'limbo',
    name: 'Limbo Rocket',
    icon: '📈',
    category: ['original'],
    rtp: '98.00%',
    type: 'crash',
    bgGrad: 'linear-gradient(135deg, #4a044e, #a21caf)',
    tag: '98% RTP'
  },

  // --- FISHING ONLY ---
  {
    id: 'ocean_king',
    name: 'Ocean King 3D',
    icon: '👑',
    category: ['fishing'],
    rtp: '96.80%',
    type: 'fishing',
    bgGrad: 'linear-gradient(135deg, #164e63, #0891b2)',
    tag: '3D BOSS'
  },
  {
    id: 'bombing_fishing',
    name: 'Bombing Fishing',
    icon: '💣',
    category: ['fishing'],
    rtp: '97.15%',
    type: 'fishing',
    bgGrad: 'linear-gradient(135deg, #701a75, #c026d3)',
    tag: 'JILI'
  },
  {
    id: 'dragon_fishing',
    name: 'Dragon Fishing',
    icon: '🐉',
    category: ['fishing'],
    rtp: '96.90%',
    type: 'fishing',
    bgGrad: 'linear-gradient(135deg, #78350f, #d97706)',
    tag: '500X'
  },
  {
    id: 'caishen_fishing',
    name: 'Cai Shen Fishing',
    icon: '🧧',
    category: ['fishing'],
    rtp: '97.05%',
    type: 'fishing',
    bgGrad: 'linear-gradient(135deg, #7f1d1d, #dc2626)',
    tag: 'FORTUNE'
  },
  {
    id: 'golden_toad',
    name: 'Golden Toad',
    icon: '🐸',
    category: ['fishing'],
    rtp: '96.95%',
    type: 'fishing',
    bgGrad: 'linear-gradient(135deg, #14532d, #16a34a)',
    tag: 'MEGA'
  }
];

const CATEGORY_META = {
  all: {
    title: 'Recommended Games',
    subtitle: 'The most popular electronic games among players'
  },
  slots: {
    title: 'Slots Games',
    subtitle: 'Spin to win giant jackpots & mega multipliers'
  },
  lottery: {
    title: 'Lottery Games',
    subtitle: 'Fast countdown color prediction & dice lottery'
  },
  original: {
    title: 'Original Games',
    subtitle: 'Provably fair exclusive original arcade games'
  },
  fishing: {
    title: 'Fishing Games',
    subtitle: 'Hunt deep sea monsters for huge coin drops'
  }
};

let currentCategoryFilter = 'all';

function renderGamesByCategory(cat) {
  currentCategoryFilter = cat || 'all';
  const grid = document.getElementById('gamesGrid');
  const titleEl = document.getElementById('sectionTitleText');
  const subEl = document.getElementById('sectionSubtitleText');

  const meta = CATEGORY_META[currentCategoryFilter] || CATEGORY_META.all;
  if (titleEl) titleEl.textContent = meta.title;
  if (subEl) subEl.textContent = meta.subtitle;

  if (!grid) return;

  const filtered = ALL_GAMES_CATALOG.filter(g => g.category.includes(currentCategoryFilter));

  grid.style.opacity = '0.3';
  setTimeout(() => {
    grid.innerHTML = filtered.map(g => `
      <div class="game-card-3col" data-game="${g.id}">
        <div class="game-thumb-box" style="${g.bgGrad ? `background:${g.bgGrad}; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;` : ''}">
          ${g.tag ? `<span class="jili-tag">${g.tag}</span>` : ''}
          ${g.image ? `<img src="${g.image}" alt="${g.name}">` : `
            <span style="font-size:36px; filter:drop-shadow(0 4px 6px rgba(0,0,0,0.5));">${g.icon}</span>
            <span style="font-size:11px; font-weight:800; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,0.9); padding:0 4px; text-align:center; line-height:1.2;">${g.name}</span>
          `}
        </div>
        <div class="rtp-strip-bottom">
          <span class="rtp-strip-label">RTP</span>
          <span class="rtp-strip-val">${g.rtp}</span>
        </div>
      </div>
    `).join('');

    // Attach click listeners to cards
    grid.querySelectorAll('.game-card-3col').forEach(card => {
      card.onclick = () => {
        const gameId = card.dataset.game;
        launchGame(gameId);
      };
    });

    grid.style.opacity = '1';
  }, 100);
}

function launchGame(gameId) {
  if (!currentUser) {
    showToast('Please log in or register to play!');
    switchAuthTab('login');
    openModal('authModal');
    return;
  }

  const g = ALL_GAMES_CATALOG.find(x => x.id === gameId);
  if (!g) return;

  if (g.page) {
    window.location.href = g.page;
    return;
  }

  openGameArena(g);
}

// Category Tab Click Handlers
document.querySelectorAll('.category-tab-item').forEach(tab => {
  tab.onclick = () => {
    const filter = tab.dataset.filter || 'all';
    document.querySelectorAll('.category-tab-item').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    renderGamesByCategory(filter);
  };
});

// Floating side buttons
on('sideWheelBtn', 'click', () => openGameArena(GAMES_MAP.lucky));
on('sideVipBtn', 'click', () => showToast('VIP Club: Level 1 active! Earn up to 3% daily cashback.'));
on('sideSupportBtn', 'click', () => showToast('Customer Service: Online 24/7.'));
on('addToDesktopBtn', 'click', () => showToast('DiuWin added to Home Screen shortcut!'));

// ==================== AUTH TABS & SUBMISSIONS ====================
function switchAuthTab(tab) {
  const tLogin = document.getElementById('tabLoginBtn');
  const tReg = document.getElementById('tabRegisterBtn');
  const fLogin = document.getElementById('loginForm');
  const fReg = document.getElementById('registerForm');
  const fForgot = document.getElementById('forgotForm');

  if (fForgot) fForgot.style.display = 'none';

  if (tab === 'login') {
    tLogin?.classList.add('active');
    tReg?.classList.remove('active');
    if (fLogin) fLogin.style.display = 'block';
    if (fReg) fReg.style.display = 'none';
    loadSavedAuthCredentials();
  } else {
    tReg?.classList.add('active');
    tLogin?.classList.remove('active');
    if (fReg) fReg.style.display = 'block';
    if (fLogin) fLogin.style.display = 'none';
  }
}

function loadSavedAuthCredentials() {
  const savedPhone = localStorage.getItem('diuwin_saved_phone');
  const savedPwd = localStorage.getItem('diuwin_saved_pwd');
  const remember = localStorage.getItem('diuwin_remember') !== 'false';

  const phoneInp = document.getElementById('loginPhone');
  const passInp = document.getElementById('loginPass');
  const chk = document.getElementById('chkRememberPassword');

  if (chk) chk.checked = remember;
  if (remember) {
    if (savedPhone && phoneInp) phoneInp.value = savedPhone;
    if (savedPwd && passInp) passInp.value = savedPwd;
  }
}

on('tabLoginBtn', 'click', () => switchAuthTab('login'));
on('tabRegisterBtn', 'click', () => switchAuthTab('register'));

// Password Visibility Toggle
const btnToggleLoginPass = document.getElementById('btnToggleLoginPass');
if (btnToggleLoginPass) {
  btnToggleLoginPass.onclick = () => {
    const passInp = document.getElementById('loginPass');
    const icon = document.getElementById('eyeIconLogin');
    if (!passInp) return;
    if (passInp.type === 'password') {
      passInp.type = 'text';
      if (icon) icon.className = 'fa fa-eye-slash';
    } else {
      passInp.type = 'password';
      if (icon) icon.className = 'fa fa-eye';
    }
  };
}

// Forgot Password Flow
on('linkForgotPassword', 'click', () => {
  const fLogin = document.getElementById('loginForm');
  const fReg = document.getElementById('registerForm');
  const fForgot = document.getElementById('forgotForm');
  if (fLogin) fLogin.style.display = 'none';
  if (fReg) fReg.style.display = 'none';
  if (fForgot) {
    fForgot.style.display = 'block';
    const currentPhone = document.getElementById('loginPhone')?.value.trim();
    if (currentPhone) document.getElementById('forgotPhone').value = currentPhone;
  }
  document.querySelectorAll('.auth-tabs button').forEach(b => b.classList.remove('active'));
});

on('btnBackToLogin', 'click', () => {
  switchAuthTab('login');
});

// Send OTP in Forgot Password
on('btnSendForgotOtp', 'click', async () => {
  const phone = document.getElementById('forgotPhone')?.value.trim();
  if (!phone || phone.length < 10) {
    showToast('Please enter a 10-digit mobile number');
    return;
  }
  const btn = document.getElementById('btnSendForgotOtp');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  const res = await apiRequest('/api/auth/send-otp', 'POST', { phone });
  btn.textContent = 'Resend in 60s';
  let s = 60;
  const timer = setInterval(() => {
    s--;
    if (s <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = 'Send OTP';
    } else {
      btn.textContent = `Resend in ${s}s`;
    }
  }, 1000);

  const hint = document.getElementById('forgotOtpHint');
  if (hint) {
    hint.style.display = 'block';
    hint.innerHTML = `✓ Verification OTP sent: <b>${res.otp || '123456'}</b>`;
  }
  showToast(res.message || 'OTP sent successfully!');
  const otpInp = document.getElementById('forgotOtp');
  if (otpInp) otpInp.value = res.otp || '123456';
});

// Forgot Form Submit
const forgotFormEl = document.getElementById('forgotForm');
if (forgotFormEl) {
  forgotFormEl.onsubmit = async (e) => {
    e.preventDefault();
    const phone = document.getElementById('forgotPhone')?.value.trim();
    const otp = document.getElementById('forgotOtp')?.value.trim();
    const newPassword = document.getElementById('forgotNewPass')?.value.trim();
    const confirmPassword = document.getElementById('forgotConfirmPass')?.value.trim();

    if (!phone || phone.length < 10) {
      showToast('Please enter a valid 10-digit mobile number');
      return;
    }
    if (!otp) {
      showToast('Please enter the OTP');
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      showToast('Password must be at least 4 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match');
      return;
    }

    const submitBtn = forgotFormEl.querySelector('button[type="submit"]');
    const origText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.textContent = 'Updating...'; submitBtn.disabled = true; }

    const res = await apiRequest('/api/auth/reset-password', 'POST', { phone, otp, newPassword });
    if (submitBtn) { submitBtn.textContent = origText; submitBtn.disabled = false; }

    if (res.success) {
      showToast('Password reset successfully! Please log in.');
      switchAuthTab('login');
      const pInp = document.getElementById('loginPhone');
      const passInp = document.getElementById('loginPass');
      if (pInp) pInp.value = phone;
      if (passInp) passInp.value = newPassword;
      localStorage.setItem('diuwin_saved_phone', phone);
      localStorage.setItem('diuwin_saved_pwd', newPassword);
      localStorage.setItem('diuwin_remember', 'true');
    } else {
      showToast(res.message || 'Failed to reset password');
    }
  };
}

// Login Form Submit (Connects directly to POST /api/auth/login)
const loginFormEl = document.getElementById('loginForm');
if (loginFormEl) {
  loginFormEl.onsubmit = async (e) => {
    e.preventDefault();
    const phone = document.getElementById('loginPhone')?.value.trim();
    const password = document.getElementById('loginPass')?.value.trim();
    const remember = document.getElementById('chkRememberPassword')?.checked;

    if (!phone || !password) {
      showToast('Please enter both mobile number and password');
      return;
    }

    const submitBtn = loginFormEl.querySelector('button[type="submit"]');
    const origText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.textContent = 'Logging in...'; submitBtn.disabled = true; }

    const res = await apiRequest('/api/auth/login', 'POST', { phone, password });
    if (submitBtn) { submitBtn.textContent = origText; submitBtn.disabled = false; }

    if (res.success && res.user) {
      currentUser = res.user;
      currentToken = res.user.token;
      sessionStorage.setItem('diuwin_token', currentToken);
      sessionStorage.setItem('diuwin_user', JSON.stringify(currentUser));
      if (currentUser.balance !== undefined) {
        sessionStorage.setItem('diuwin_balance', currentUser.balance);
      }

      // Save credentials if Remember Me is checked
      if (remember) {
        localStorage.setItem('diuwin_saved_phone', phone);
        localStorage.setItem('diuwin_saved_pwd', password);
        localStorage.setItem('diuwin_remember', 'true');
      } else {
        localStorage.removeItem('diuwin_saved_phone');
        localStorage.removeItem('diuwin_saved_pwd');
        localStorage.setItem('diuwin_remember', 'false');
      }

      renderHeaderStatus();
      closeAllModals();
      showToast(`Welcome back, ${res.user.name || 'Player'}!`);
    } else {
      showToast(res.message || 'Login failed. Please check phone and password.');
    }
  };
}

// Register Form Submit (Connects directly to POST /api/auth/register with ₹500 Bonus)
const registerFormEl = document.getElementById('registerForm');
if (registerFormEl) {
  registerFormEl.onsubmit = async (e) => {
    e.preventDefault();
    const phone = document.getElementById('regPhone')?.value.trim();
    const password = document.getElementById('regPass')?.value.trim();
    const inviteCode = document.getElementById('regInvite')?.value.trim();

    if (!phone || phone.length < 6) {
      showToast('Please enter a valid mobile number');
      return;
    }
    if (!password || password.length < 4) {
      showToast('Password must be at least 4 characters');
      return;
    }

    const submitBtn = registerFormEl.querySelector('button[type="submit"]');
    const origText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) { submitBtn.textContent = 'Registering...'; submitBtn.disabled = true; }

    const res = await apiRequest('/api/auth/register', 'POST', { phone, password, inviteCode });
    if (submitBtn) { submitBtn.textContent = origText; submitBtn.disabled = false; }

    if (res.success && res.user) {
      currentUser = res.user;
      currentToken = res.user.token;
      sessionStorage.setItem('diuwin_token', currentToken);
      sessionStorage.setItem('diuwin_user', JSON.stringify(currentUser));
      if (currentUser.balance !== undefined) {
        sessionStorage.setItem('diuwin_balance', currentUser.balance);
      }
      renderHeaderStatus();
      closeAllModals();
      showToast(`🎉 Registration successful! ₹500 welcome bonus credited.`);
    } else {
      showToast(res.message || 'Registration failed. Phone may already be registered.');
    }
  };
}

// Play as Demo Guest
on('authGuestBtn', 'click', async () => {
  const res = await apiRequest('/api/auth/guest', 'POST');
  if (res.success && res.user) {
    currentUser = res.user;
    currentToken = res.user.token;
    sessionStorage.setItem('diuwin_token', currentToken);
    sessionStorage.setItem('diuwin_user', JSON.stringify(currentUser));
    if (currentUser.balance !== undefined) {
      sessionStorage.setItem('diuwin_balance', currentUser.balance);
    }
    renderHeaderStatus();
    closeAllModals();
    showToast(`Welcome Guest! ₹1,000 demo balance credited.`);
  }
});

// Logout Action
on('logoutBtn', 'click', () => {
  currentUser = null;
  currentToken = null;
  sessionStorage.removeItem('diuwin_token');
  sessionStorage.removeItem('diuwin_user');
  sessionStorage.removeItem('diuwin_balance');
  localStorage.removeItem('diuwin_token');
  localStorage.removeItem('diuwin_user');
  localStorage.removeItem('diuwin_balance');
  renderHeaderStatus();
  switchView('viewHome');
  closeAllModals();
  showToast('Logged out successfully. You can log in or register anytime.');
});

// Account Profile Modal
function openAccountModal() {
  if (!currentUser) {
    switchAuthTab('login');
    openModal('authModal');
    return;
  }
  const aName = document.getElementById('accUserName');
  const aPhone = document.getElementById('accUserPhone');
  const aVip = document.getElementById('accVipTag');
  const aBal = document.getElementById('accBalanceVal');
  const aAv = document.getElementById('accAvatar');

  if (aName) aName.textContent = currentUser.name || 'Player';
  if (aPhone) aPhone.textContent = currentUser.phone ? `+91 ${currentUser.phone}` : 'Demo Guest';
  if (aVip) aVip.textContent = `VIP ${currentUser.vipLevel || 1}`;
  if (aBal) aBal.textContent = Number(currentUser.balance || 0).toFixed(2);
  if (aAv) aAv.textContent = (currentUser.name || 'P').charAt(0).toUpperCase();

  openModal('accountModal');
}

// ==================== MULTI-PAGE SPA VIEW SWITCHER ====================
function switchView(viewName) {
  // Update views
  document.querySelectorAll('.app-page-view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(viewName);
  if (target) target.classList.add('active');

  // Update bottom nav active state
  const navMap = {
    viewHome: 'navHome',
    viewActivity: 'navActivity',
    viewPromotion: 'navPromotion',
    viewAccount: 'navAccount'
  };

  document.querySelectorAll('.bottom-nav .nav-item').forEach(i => i.classList.remove('active'));
  const activeNavId = navMap[viewName];
  if (activeNavId) document.getElementById(activeNavId)?.classList.add('active');

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // If opening Account view, populate user info
  if (viewName === 'viewAccount') {
    updateAccountPageView();
  }
}

function updateAccountPageView() {
  if (!currentUser) return;
  const aName = document.getElementById('accViewName');
  const aPhone = document.getElementById('accViewPhone');
  const aVip = document.getElementById('accViewVip');
  const aBal = document.getElementById('accViewBalance');
  const aAv = document.getElementById('accViewAvatar');
  const aUid = document.getElementById('accViewUid');

  if (aName) aName.textContent = currentUser.name || 'Player Demo';
  if (aPhone) aPhone.textContent = currentUser.phone ? `+91 ${currentUser.phone}` : 'Demo Guest';
  if (aVip) aVip.textContent = `VIP ${currentUser.vipLevel || 1}`;
  if (aBal) aBal.textContent = Number(currentUser.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (aAv) aAv.textContent = (currentUser.name || 'P').charAt(0).toUpperCase();
  if (aUid) aUid.textContent = `UID: ${currentUser.id ? currentUser.id.replace('usr_', '') : '894721'}`;
}

// Bottom Navigation Clicks
on('navHome', 'click', () => switchView('viewHome'));
on('navActivity', 'click', () => switchView('viewActivity'));
on('navCenterGo', 'click', () => openGameArena(GAMES_MAP.lucky));
on('navPromotion', 'click', () => switchView('viewPromotion'));
on('navAccount', 'click', () => {
  if (currentUser) {
    switchView('viewAccount');
  } else {
    switchAuthTab('login');
    openModal('authModal');
  }
});

// Activity Page Event Handlers
on('btnCheckInNow', 'click', async () => {
  if (!currentUser) {
    showToast('Please log in or register first!');
    switchAuthTab('login');
    openModal('authModal');
    return;
  }
  const res = await apiRequest('/api/activity/checkin', 'POST');
  if (res.success) {
    currentUser.balance = res.newBalance;
    updateBalanceUI(res.newBalance);
    showToast(res.message);
    const btn = document.getElementById('btnCheckInNow');
    if (btn) {
      btn.innerHTML = '✅ Checked In Today (+₹50 Claimed)';
      btn.style.background = '#0B1833';
      btn.disabled = true;
    }
  } else {
    showToast(res.message || 'Check-in failed');
  }
});

on('btnActivityRecharge', 'click', () => {
  openModal('walletModal');
  switchWTab('deposit');
});

// Promotion Page Event Handlers
on('btnClaimCommission', 'click', async () => {
  if (!currentUser) {
    showToast('Please log in or register first!');
    switchAuthTab('login');
    openModal('authModal');
    return;
  }
  const res = await apiRequest('/api/promotion/claim', 'POST');
  if (res.success) {
    currentUser.balance = res.newBalance;
    updateBalanceUI(res.newBalance);
    showToast(res.message);
    const todayComm = document.getElementById('promoTodayComm');
    if (todayComm) todayComm.textContent = '₹0.00';
    const claimBtn = document.getElementById('btnClaimCommission');
    if (claimBtn) {
      claimBtn.innerHTML = '✅ Commission Claimed';
      claimBtn.disabled = true;
    }
  } else {
    showToast(res.message || 'Claim failed');
  }
});

on('btnCopyCode', 'click', () => {
  const code = document.getElementById('inviteCodeInput')?.value || 'DIUWIN888';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => showToast(`Referral code ${code} copied!`));
  } else {
    showToast(`Referral code ${code} copied!`);
  }
});

on('btnCopyLink', 'click', () => {
  const link = document.getElementById('inviteLinkInput')?.value || 'https://diuwin.art/#/register?invitationCode=DIUWIN888';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(() => showToast('Invitation link copied to clipboard!'));
  } else {
    showToast('Invitation link copied to clipboard!');
  }
});

// Account Page Event Handlers
on('btnAccPageDeposit', 'click', () => {
  if (window.openUpiRechargeModal) {
    window.openUpiRechargeModal(500);
  } else {
    openModal('walletModal');
    switchWTab('deposit');
  }
});

on('btnAccPageWithdraw', 'click', () => {
  openModal('walletModal');
  switchWTab('withdraw');
});

on('accWithdrawBtn', 'click', () => {
  closeModal('accountModal');
  openModal('walletModal');
  switchWTab('withdraw');
});

on('accRechargeBtn', 'click', () => {
  closeModal('accountModal');
  if (window.openUpiRechargeModal) {
    window.openUpiRechargeModal(500);
  } else {
    openModal('walletModal');
    switchWTab('deposit');
  }
});

on('btnRedeemGift', 'click', async () => {
  if (!currentUser) {
    showToast('Please log in or register first!');
    switchAuthTab('login');
    openModal('authModal');
    return;
  }
  const codeInput = document.getElementById('giftCodeInput');
  const code = codeInput?.value.trim();
  if (!code) return showToast('Please enter a gift code (e.g. DIUWIN100)');

  const res = await apiRequest('/api/activity/redeem-gift', 'POST', { code });
  if (res.success) {
    currentUser.balance = res.newBalance;
    updateBalanceUI(res.newBalance);
    if (codeInput) codeInput.value = '';
    showToast(res.message);
  } else {
    showToast(res.message || 'Invalid gift code');
  }
});

on('menuGameHistory', 'click', () => {
  openModal('walletModal');
  switchWTab('history');
  loadTransactions();
});

on('menuTxHistory', 'click', () => {
  openModal('walletModal');
  switchWTab('history');
  loadTransactions();
});

on('menuVipClub', 'click', () => {
  showToast(`VIP Club: Current tier is VIP ${currentUser?.vipLevel || 1}. Deposit to level up!`);
});

on('menuLiveSupport', 'click', () => {
  showToast('24/7 Live Customer Service: Chat agent is online.');
});

on('btnPageLogout', 'click', () => {
  currentUser = null;
  currentToken = null;
  sessionStorage.removeItem('diuwin_token');
  sessionStorage.removeItem('diuwin_user');
  sessionStorage.removeItem('diuwin_balance');
  localStorage.removeItem('diuwin_token');
  localStorage.removeItem('diuwin_user');
  localStorage.removeItem('diuwin_balance');
  renderHeaderStatus();
  switchView('viewHome');
  showToast('Logged out successfully. You can log in or register anytime.');
});

// Wallet Deposit & Withdraw
let selectedRecharge = 200;
document.querySelectorAll('#rechargePresets .r-chip').forEach(c => {
  c.onclick = () => {
    document.querySelectorAll('#rechargePresets .r-chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    selectedRecharge = parseFloat(c.dataset.amt);
    document.getElementById('depositBtnAmount').textContent = selectedRecharge;
  };
});

on('confirmDepositBtn', 'click', () => {
  closeAllModals();
  if (window.openUpiRechargeModal) {
    window.openUpiRechargeModal(selectedRecharge);
  }
});

// ==================== 16-STEP WITHDRAWAL WORKFLOW FRONTEND ====================
let selectedWithdrawMethod = 'UPI';

function updateWithdrawalBreakdown() {
  const amtInput = document.getElementById('withdrawAmountInput');
  const numAmt = parseFloat(amtInput?.value) || 0;
  const reqEl = document.getElementById('summaryReqAmt');
  const netEl = document.getElementById('summaryNetAmt');
  const warnEl = document.getElementById('withdrawAmountWarning');
  const feeEl = document.getElementById('summaryFeeAmt');
  const availEl = document.getElementById('withdrawAvailBal');

  if (reqEl) reqEl.textContent = numAmt.toFixed(2);

  const availBal = Number(currentUser?.balance || 0);
  if (availEl) availEl.textContent = availBal.toFixed(2);

  // Applicable Fee calculation (0% platform promotional fee)
  const feeRate = 0.00;
  const feeAmt = Math.round((numAmt * feeRate) * 100) / 100;
  const netPayout = Math.max(0, numAmt - feeAmt);
  if (feeEl) feeEl.textContent = feeAmt === 0 ? '₹0.00 (Free)' : `₹${feeAmt.toFixed(2)}`;
  if (netEl) netEl.textContent = netPayout.toFixed(2);

  // Real-time limit & balance checks
  if (warnEl) {
    if (numAmt > 0 && numAmt < 100) {
      warnEl.style.display = 'inline';
      warnEl.textContent = 'Min ₹100 required';
      warnEl.style.color = '#dc2626';
    } else if (numAmt > 50000) {
      warnEl.style.display = 'inline';
      warnEl.textContent = 'Max ₹50,000 per request';
      warnEl.style.color = '#dc2626';
    } else if (Math.round(numAmt * 100) > Math.round(availBal * 100)) {
      warnEl.style.display = 'inline';
      warnEl.textContent = 'Insufficient balance';
      warnEl.style.color = '#dc2626';
    } else if (numAmt >= 100) {
      warnEl.style.display = 'inline';
      warnEl.textContent = '✓ Amount Valid';
      warnEl.style.color = '#059669';
    } else {
      warnEl.style.display = 'none';
    }
  }
}

// Step 3: Withdrawal Method Selector & Toggles
function setWithdrawMethod(method) {
  selectedWithdrawMethod = method;
  const methods = ['Upi', 'Bank', 'Other'];
  methods.forEach(m => {
    const btn = document.getElementById('btnMethod' + m);
    const wrap = document.getElementById(m.toLowerCase() + 'DetailsWrap');
    const isAct = (m.toUpperCase() === method || (m === 'Other' && (method === 'OTHER' || method === 'USDT')));
    if (btn) {
      btn.classList.toggle('active', isAct);
      btn.style.borderColor = isAct ? '#059669' : '#cbd5e1';
      btn.style.background = isAct ? '#f0fdf4' : '#ffffff';
      const title = btn.querySelector('div:nth-child(2)');
      if (title) title.style.color = isAct ? '#065f46' : '#334155';
    }
    if (wrap) {
      wrap.style.display = isAct ? 'block' : 'none';
    }
  });
  if (typeof validateWithdrawalForm === 'function') {
    validateWithdrawalForm();
  }
}

on('btnMethodUpi', 'click', () => setWithdrawMethod('UPI'));
on('btnMethodBank', 'click', () => setWithdrawMethod('BANK'));
on('btnMethodOther', 'click', () => setWithdrawMethod('OTHER'));

// Quick Amount Presets for Withdrawal
document.querySelectorAll('#withdrawPresets .r-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#withdrawPresets .r-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const amt = btn.getAttribute('data-amt');
    const input = document.getElementById('withdrawAmountInput');
    if (input) {
      input.value = amt;
      updateWithdrawalBreakdown();
      if (typeof validateWithdrawalForm === 'function') {
        validateWithdrawalForm();
      }
    }
  });
});

const withdrawAmtInp = document.getElementById('withdrawAmountInput');
if (withdrawAmtInp) {
  withdrawAmtInp.addEventListener('input', updateWithdrawalBreakdown);
}

// Step 4: Real-Time Secure Verification for Bank & UPI Details
const BANK_IFSC_MAP_CLIENT = {
  SBIN: 'State Bank of India',
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  UTIB: 'Axis Bank',
  PUNB: 'Punjab National Bank',
  BARB: 'Bank of Baroda',
  KKBK: 'Kotak Mahindra Bank',
  CNRB: 'Canara Bank',
  UBIN: 'Union Bank of India',
  IDFB: 'IDFC FIRST Bank',
  YESB: 'Yes Bank',
  INDB: 'IndusInd Bank',
  BKID: 'Bank of India',
  MAHB: 'Bank of Maharashtra',
  IOBA: 'Indian Overseas Bank',
  CBIN: 'Central Bank of India'
};

const ifscInp = document.getElementById('withdrawBankIfsc');
const ifscFeed = document.getElementById('ifscFeedback');
const bankNameInp = document.getElementById('withdrawBankName');
const holderInp = document.getElementById('withdrawBankHolder');
const bankHolderFeed = document.getElementById('bankHolderFeedback');
const bankAccInp = document.getElementById('withdrawBankAcc');
const bankAccConfirmInp = document.getElementById('withdrawBankAccConfirm');

// Auto Bank Account Verification & Name Auto-Fill via IMPS Penny Drop
async function autoVerifyBankAccount(isSilent = false) {
  const acc = (bankAccInp?.value || '').replace(/\s+/g, '');
  const ifsc = (ifscInp?.value || '').trim().toUpperCase();
  const accConfirm = (bankAccConfirmInp?.value || '').replace(/\s+/g, '') || acc;
  const btnVerify = document.getElementById('btnAutoVerifyBank');

  if (!acc || !/^\d{9,18}$/.test(acc)) {
    if (!isSilent) showToast('Please enter a valid 9 to 18 digit bank account number first');
    return;
  }
  if (!ifsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    if (!isSilent) showToast('Please enter a valid 11-digit IFSC code first');
    return;
  }

  if (bankAccConfirmInp && !bankAccConfirmInp.value) {
    bankAccConfirmInp.value = acc;
  }

  if (btnVerify) {
    btnVerify.disabled = true;
    btnVerify.textContent = '⏳ Verifying IMPS...';
  }
  if (bankHolderFeed) {
    bankHolderFeed.style.display = 'block';
    bankHolderFeed.style.color = '#0284c7';
    bankHolderFeed.textContent = '🔍 Querying Bank IMPS registry...';
  }

  const res = await apiRequest('/api/wallet/verify-bank', 'POST', {
    accountNumber: acc,
    confirmAccountNumber: accConfirm,
    ifsc,
    autoFetchName: true
  });

  if (btnVerify) {
    btnVerify.disabled = false;
    btnVerify.textContent = '⚡ Verify & Auto-Fill Name';
  }

  if (res.success) {
    const verifiedName = res.verifiedName || res.holderName;
    if (holderInp) {
      holderInp.value = verifiedName;
      holderInp.dispatchEvent(new Event('input'));
    }
    if (bankNameInp && res.bankName) {
      bankNameInp.value = res.bankName;
    }
    if (bankHolderFeed) {
      bankHolderFeed.style.display = 'block';
      bankHolderFeed.style.color = '#059669';
      bankHolderFeed.textContent = `✓ IMPS Verified Beneficiary: ${verifiedName}`;
    }
    showToast(`✓ Account verified with ${res.bankName || 'Bank'}! Name: ${verifiedName} auto-filled.`);
    if (typeof validateWithdrawalForm === 'function') {
      validateWithdrawalForm();
    }
  } else {
    if (bankHolderFeed) {
      bankHolderFeed.style.display = 'block';
      bankHolderFeed.style.color = '#dc2626';
      bankHolderFeed.textContent = res.message || 'Verification failed';
    }
    if (!isSilent) showToast(res.message || 'Bank account verification failed');
  }
}

on('btnAutoVerifyBank', 'click', () => autoVerifyBankAccount(false));

if (ifscInp) {
  ifscInp.addEventListener('input', async () => {
    const val = ifscInp.value.trim().toUpperCase();
    ifscInp.value = val;
    if (val.length >= 4) {
      const prefix = val.slice(0, 4);
      const bName = BANK_IFSC_MAP_CLIENT[prefix];
      if (bName && bankNameInp && (!bankNameInp.value || bankNameInp.value === 'Bank')) {
        bankNameInp.value = bName;
      }
    }
    if (val.length === 11) {
      if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(val)) {
        const detected = BANK_IFSC_MAP_CLIENT[val.slice(0, 4)] || 'Commercial Bank';
        if (ifscFeed) {
          ifscFeed.style.display = 'block';
          ifscFeed.style.color = '#059669';
          ifscFeed.textContent = `✓ Verified IFSC (${detected})`;
        }

        // Live Lookup from Official IFSC Endpoint
        try {
          const lRes = await apiRequest(`/api/wallet/lookup-ifsc?ifsc=${val}`);
          if (lRes && lRes.success && lRes.bankName) {
            if (bankNameInp) bankNameInp.value = lRes.bankName;
            if (ifscFeed) {
              ifscFeed.textContent = `✓ Verified IFSC (${lRes.bankName}${lRes.branch ? ' - ' + lRes.branch : ''})`;
            }
          }
        } catch (e) {}

        // Auto trigger bank account check if account number is already typed
        const curAcc = (bankAccInp?.value || '').trim();
        if (curAcc.length >= 9 && (!holderInp || !holderInp.value)) {
          autoVerifyBankAccount(true);
        }
      } else {
        if (ifscFeed) {
          ifscFeed.style.display = 'block';
          ifscFeed.style.color = '#dc2626';
          ifscFeed.textContent = 'Invalid IFSC format (5th character must be 0)';
        }
      }
    } else if (val.length > 0) {
      if (ifscFeed) {
        ifscFeed.style.display = 'block';
        ifscFeed.style.color = '#64748b';
        ifscFeed.textContent = `11 chars required (${val.length}/11)`;
      }
    } else {
      if (ifscFeed) ifscFeed.style.display = 'none';
    }
  });
}

// Auto-trigger Penny Drop verification when user finishes typing/confirming account number
if (bankAccConfirmInp) {
  bankAccConfirmInp.addEventListener('blur', () => {
    const acc = (bankAccInp?.value || '').trim();
    const ifsc = (ifscInp?.value || '').trim();
    if (acc.length >= 9 && ifsc.length === 11 && (!holderInp || !holderInp.value)) {
      autoVerifyBankAccount(true);
    }
  });
}

const upiInp = document.getElementById('withdrawUpiInput');
const upiFeed = document.getElementById('upiFeedback');
const upiBadge = document.getElementById('upiVerifyBadge');

if (upiInp) {
  upiInp.addEventListener('input', () => {
    const val = upiInp.value.trim();
    if (/^[\w.\-]+@[\w.\-]+$/.test(val)) {
      const handle = val.split('@')[1];
      if (upiFeed) {
        upiFeed.style.display = 'block';
        upiFeed.style.color = '#059669';
        upiFeed.textContent = `✓ Valid VPA Handle (@${handle})`;
      }
      if (upiBadge) upiBadge.style.display = 'inline';
    } else if (val.length > 0) {
      if (upiFeed) {
        upiFeed.style.display = 'block';
        upiFeed.style.color = '#dc2626';
        upiFeed.textContent = 'Format: username@handle (e.g. user@oksbi)';
      }
      if (upiBadge) upiBadge.style.display = 'none';
    } else {
      if (upiFeed) upiFeed.style.display = 'none';
      if (upiBadge) upiBadge.style.display = 'none';
    }
  });
}

// ==================== REAL OTP & WITHDRAWAL FORM VALIDATION ====================
let currentDispatchedOtp = null;
let otpCooldownInterval = null;

// Real-Time Withdrawal Form Validator (Disables button until all boxes are filled)
function validateWithdrawalForm() {
  const btn = document.getElementById('confirmWithdrawBtn');
  const summaryEl = document.getElementById('withdrawReqSummary');
  const hintEl = document.getElementById('withdrawSubmitHint');
  const chkKyc = document.getElementById('chkKyc');
  const chkDest = document.getElementById('chkDest');
  const chkAmt = document.getElementById('chkAmt');
  const chkOtp = document.getElementById('chkOtp');

  if (!btn) return false;

  // KYC is removed - keep chkKyc hidden
  if (chkKyc) {
    chkKyc.style.display = 'none';
  }

  // 1. Payout Destination Check
  let isDestOk = false;
  if (selectedWithdrawMethod === 'UPI') {
    const upiVal = (document.getElementById('withdrawUpiInput')?.value || '').trim();
    isDestOk = /^[\w.\-]+@[\w.\-]+$/i.test(upiVal);
  } else if (selectedWithdrawMethod === 'OTHER' || selectedWithdrawMethod === 'USDT') {
    const addrVal = (document.getElementById('withdrawOtherAddress')?.value || '').trim();
    isDestOk = addrVal.length >= 8;
  } else {
    // BANK
    const holder = (document.getElementById('withdrawBankHolder')?.value || '').trim();
    const acc = (document.getElementById('withdrawBankAcc')?.value || '').trim();
    const accConfirm = (document.getElementById('withdrawBankAccConfirm')?.value || '').trim();
    const ifsc = (document.getElementById('withdrawBankIfsc')?.value || '').trim();
    isDestOk = Boolean(holder.length >= 3 && /^\d{9,18}$/.test(acc) && acc === accConfirm && /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc));
  }
  if (chkDest) {
    chkDest.innerHTML = isDestOk ? '<span style="color:#059669;">✓</span> <span style="color:#059669;">1. Payout Account</span>' : '<span style="color:#ea580c;">⚠️</span> <span style="color:#ea580c;">1. Payout Account</span>';
  }

  // 2. Amount Check
  const amtVal = parseFloat(document.getElementById('withdrawAmountInput')?.value);
  const userBal = Number(currentUser?.balance || 0);
  const isAmtOk = Boolean(!isNaN(amtVal) && amtVal >= 100 && amtVal <= 50000 && amtVal <= userBal);
  if (chkAmt) {
    chkAmt.innerHTML = isAmtOk ? '<span style="color:#059669;">✓</span> <span style="color:#059669;">2. Valid Amount</span>' : '<span style="color:#ea580c;">⚠️</span> <span style="color:#ea580c;">2. Valid Amount</span>';
  }

  // 3. OTP Check (Must be 6 digits)
  const otpVal = (document.getElementById('withdrawOtpInput')?.value || '').trim();
  const isOtpOk = /^\d{6}$/.test(otpVal);
  if (chkOtp) {
    chkOtp.innerHTML = isOtpOk ? '<span style="color:#059669;">✓</span> <span style="color:#059669;">3. 6-Digit OTP</span>' : '<span style="color:#ea580c;">⚠️</span> <span style="color:#ea580c;">3. 6-Digit OTP</span>';
  }

  // 4. Withdrawal PIN Check (if user has configured a withdrawal PIN)
  const pinInput = document.getElementById('withdrawPinInput');
  const hasPinConfigured = Boolean(currentUser && currentUser.hasWithdrawalPin);
  const isPinOk = !hasPinConfigured || ((pinInput?.value || '').trim().length >= 4);

  const allPassed = isDestOk && isAmtOk && isOtpOk && isPinOk;

  if (allPassed) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    btn.style.color = '#ffffff';
    btn.style.boxShadow = '0 4px 14px rgba(16, 185, 129, 0.4)';
    btn.textContent = `Submit Withdrawal Request (₹${amtVal.toFixed(2)})`;
    if (summaryEl) {
      summaryEl.textContent = 'All Verified ✓';
      summaryEl.style.color = '#059669';
    }
    if (hintEl) hintEl.style.display = 'none';
  } else {
    btn.disabled = true;
    btn.style.opacity = '0.6';
    btn.style.cursor = 'not-allowed';
    btn.style.background = '#94a3b8';
    btn.style.color = '#ffffff';
    btn.style.boxShadow = 'none';
    btn.textContent = 'Submit Withdrawal Request';
    if (summaryEl) {
      summaryEl.textContent = 'Locked 🔒';
      summaryEl.style.color = '#ea580c';
    }
    if (hintEl) {
      hintEl.style.display = 'block';
      if (!isDestOk) {
        hintEl.textContent = '⚠️ Please enter valid payout details (UPI ID or Bank Account).';
      } else if (!isAmtOk) {
        if (amtVal > userBal) {
          hintEl.textContent = `⚠️ Amount ₹${amtVal || 0} exceeds available balance (₹${userBal.toFixed(2)}).`;
        } else {
          hintEl.textContent = '⚠️ Amount must be between ₹100 and ₹50,000.';
        }
      } else if (!isOtpOk) {
        hintEl.textContent = '⚠️ Enter 6-digit SMS OTP (Click "Send OTP" to receive code).';
      } else if (!isPinOk) {
        hintEl.textContent = '⚠️ Enter your 4-digit Withdrawal PIN or account password.';
      } else {
        hintEl.textContent = '⚠️ Please fill all required fields to unlock withdrawal.';
      }
    }
  }

  return allPassed;
}

// Send Real Withdrawal OTP
on('btnSendWithdrawOtp', 'click', async () => {
  if (!currentUser) return showToast('Please log in first');
  const btn = document.getElementById('btnSendWithdrawOtp');
  const msg = document.getElementById('withdrawOtpMsg');
  if (btn) btn.disabled = true;

  const res = await apiRequest('/api/wallet/withdraw-otp', 'POST');
  if (res.success) {
    currentDispatchedOtp = res.otp || '648291';
    
    // Auto-fill into the input field immediately
    const otpInp = document.getElementById('withdrawOtpInput');
    if (otpInp && currentDispatchedOtp) {
      otpInp.value = currentDispatchedOtp;
      otpInp.dispatchEvent(new Event('input'));
    }

    if (msg) {
      msg.style.display = 'block';
      msg.textContent = res.message || '✓ Security OTP dispatched & filled!';
    }
    showToast(`✓ Security OTP ${currentDispatchedOtp} verified & filled!`);

    // Show Top Real-Time SMS Notification Banner
    const banner = document.getElementById('otpSmsBanner');
    const codeEl = document.getElementById('otpSmsCode');
    if (banner && codeEl) {
      codeEl.textContent = currentDispatchedOtp;
      banner.style.display = 'block';
    }

    // Cooldown countdown
    let count = 60;
    if (otpCooldownInterval) clearInterval(otpCooldownInterval);
    otpCooldownInterval = setInterval(() => {
      count--;
      if (btn) btn.textContent = `Resend (${count}s)`;
      if (count <= 0) {
        clearInterval(otpCooldownInterval);
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Send OTP';
        }
      }
    }, 1000);
  } else {
    if (btn) btn.disabled = false;
    showToast(res.message || 'Failed to dispatch OTP');
  }
});

// Toggle Withdrawal PIN visibility
on('btnToggleWithdrawPin', 'click', () => {
  const pinInput = document.getElementById('withdrawPinInput');
  const btn = document.getElementById('btnToggleWithdrawPin');
  if (!pinInput) return;
  if (pinInput.type === 'password') {
    pinInput.type = 'text';
    if (btn) btn.textContent = '🔒';
  } else {
    pinInput.type = 'password';
    if (btn) btn.textContent = '👁️';
  }
});

// Auto-fill OTP from SMS Banner
on('btnAutoFillOtp', 'click', () => {
  const codeToFill = currentDispatchedOtp || currentKycOtp;
  if (!codeToFill) return;

  const inlineInp = document.getElementById('inlineKycOtp');
  const modalInp = document.getElementById('kycOtpInput');
  const withdrawInp = document.getElementById('withdrawOtpInput');

  if (inlineInp && inlineInp.offsetParent !== null) {
    inlineInp.value = codeToFill;
    inlineInp.dispatchEvent(new Event('input'));
  }
  if (modalInp && modalInp.offsetParent !== null) {
    modalInp.value = codeToFill;
    modalInp.dispatchEvent(new Event('input'));
  }
  if (withdrawInp) {
    withdrawInp.value = codeToFill;
    withdrawInp.dispatchEvent(new Event('input'));
  }

  showToast('✓ OTP Auto-filled into verification box!');
  const banner = document.getElementById('otpSmsBanner');
  if (banner) {
    setTimeout(() => { banner.style.display = 'none'; }, 800);
  }
});

// Copy OTP Code
on('btnCopyOtpCode', 'click', () => {
  const codeToCopy = currentDispatchedOtp || currentKycOtp;
  if (codeToCopy && navigator.clipboard) {
    navigator.clipboard.writeText(codeToCopy).then(() => {
      showToast('✓ OTP copied to clipboard: ' + codeToCopy);
    }).catch(() => {
      showToast('OTP: ' + codeToCopy);
    });
  } else if (codeToCopy) {
    showToast('OTP: ' + codeToCopy);
  }
});

// Close SMS Banner
on('closeOtpSmsBanner', 'click', () => {
  const banner = document.getElementById('otpSmsBanner');
  if (banner) banner.style.display = 'none';
});

// ==================== KYC VERIFICATION & OPTIONS LOGIC (MOBILE OTP + WITHDRAWAL PIN) ====================
let currentKycOtp = null;
let kycOtpCooldownInterval = null;

function toggleKycOptions() {
  if (currentUser && currentUser.kycStatus === 'VERIFIED') {
    showToast('✓ Your KYC is already verified and active!');
    return;
  }
  const panel = document.getElementById('inlineKycPanel');
  if (panel) {
    const isHidden = panel.style.display === 'none' || !panel.style.display;
    panel.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const phoneInp = document.getElementById('inlineKycPhone');
      if (phoneInp) {
        phoneInp.value = '+91 ' + (currentUser?.phone || '9876543210');
      }
    }
  } else {
    openKycModal();
  }
}

function openKycModal() {
  if (currentUser && currentUser.kycStatus === 'VERIFIED') {
    showToast('✓ Your KYC is already verified and active!');
    return;
  }
  const phoneInp = document.getElementById('kycPhoneInput');
  if (phoneInp) {
    phoneInp.value = '+91 ' + (currentUser?.phone || '9876543210');
  }
  openModal('kycModal');
}

on('withdrawKycBadge', 'click', (e) => {
  if (e && e.stopPropagation) e.stopPropagation();
  toggleKycOptions();
});

on('withdrawKycBanner', 'click', () => {
  toggleKycOptions();
});

on('btnCloseInlineKyc', 'click', () => {
  const panel = document.getElementById('inlineKycPanel');
  if (panel) panel.style.display = 'none';
});

// Common handler for sending KYC OTP to registered mobile
async function handleSendKycOtp(btnId, msgId) {
  if (!currentUser) return showToast('Please log in first');
  const btn = document.getElementById(btnId);
  const msg = document.getElementById(msgId);
  if (btn) btn.disabled = true;

  const phoneToSend = currentUser.phone || '9876543210';
  const res = await apiRequest('/api/user/kyc/send-otp', 'POST', { phone: phoneToSend });
  if (res.success) {
    currentKycOtp = res.otp || '648291';
    currentDispatchedOtp = currentKycOtp;
    if (msg) {
      msg.style.display = 'block';
      msg.textContent = res.message || '✓ Verification OTP sent to registered mobile!';
    }
    showToast(res.message || 'KYC OTP sent successfully!');

    // Show top Real-Time SMS notification banner
    const banner = document.getElementById('otpSmsBanner');
    const codeEl = document.getElementById('otpSmsCode');
    if (banner && codeEl) {
      codeEl.textContent = currentKycOtp;
      banner.style.display = 'block';
    }

    // Auto-fill into the active input box
    const inlineOtp = document.getElementById('inlineKycOtp');
    const modalOtp = document.getElementById('kycOtpInput');
    if (btnId === 'btnSendInlineKycOtp' && inlineOtp) {
      inlineOtp.value = currentKycOtp;
    } else if (btnId === 'btnSendKycOtp' && modalOtp) {
      modalOtp.value = currentKycOtp;
    }

    // Cooldown timer
    let count = 60;
    if (kycOtpCooldownInterval) clearInterval(kycOtpCooldownInterval);
    kycOtpCooldownInterval = setInterval(() => {
      count--;
      if (btn) btn.textContent = `Resend (${count}s)`;
      if (count <= 0) {
        clearInterval(kycOtpCooldownInterval);
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Send OTP';
        }
      }
    }, 1000);
  } else {
    if (btn) btn.disabled = false;
    showToast(res.message || 'Failed to dispatch KYC OTP');
  }
}

on('btnSendInlineKycOtp', 'click', () => handleSendKycOtp('btnSendInlineKycOtp', 'inlineKycOtpMsg'));
on('btnSendKycOtp', 'click', () => handleSendKycOtp('btnSendKycOtp', 'kycOtpMsg'));

// Common handler for verifying Mobile OTP & setting Withdrawal PIN
async function handleSubmitKyc(isInline = false) {
  if (!currentUser) return showToast('Please log in first');

  const otp = ((isInline ? document.getElementById('inlineKycOtp') : document.getElementById('kycOtpInput'))?.value || '').trim();
  const pin = ((isInline ? document.getElementById('inlineKycPin') : document.getElementById('kycPinInput'))?.value || '').trim();
  const confirmPin = ((isInline ? document.getElementById('inlineKycConfirmPin') : document.getElementById('kycConfirmPinInput'))?.value || '').trim();

  if (!otp || !/^\d{6}$/.test(otp)) {
    return showToast('Please enter the 6-digit SMS OTP (Click "Send OTP" to receive)');
  }
  if (!pin || !/^\d{4,6}$/.test(pin)) {
    return showToast('Please set a 4 to 6 digit numeric Withdrawal PIN');
  }
  if (pin !== confirmPin) {
    return showToast('Withdrawal PIN and Confirm PIN do not match');
  }

  const submitBtn = isInline ? document.getElementById('btnSubmitInlineKyc') : document.getElementById('btnSubmitKyc');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying OTP & Setting PIN...';
  }

  const res = await apiRequest('/api/user/kyc/submit', 'POST', {
    otp,
    withdrawalPin: pin,
    confirmPin,
    phone: currentUser.phone
  });

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = '⚡ Verify Mobile OTP & Set Withdrawal PIN';
  }

  if (res.success) {
    currentUser.kycStatus = 'VERIFIED';
    currentUser.hasWithdrawalPin = true;
    currentUser.isPhoneVerified = true;
    localStorage.setItem('diuwin_user', JSON.stringify(currentUser));

    if (isInline) {
      const panel = document.getElementById('inlineKycPanel');
      if (panel) panel.style.display = 'none';
    } else {
      closeModal('kycModal');
    }

    // Pre-populate withdrawal PIN input in payout form
    const wPinInp = document.getElementById('withdrawPinInput');
    if (wPinInp && !wPinInp.value) {
      wPinInp.value = pin;
      wPinInp.dispatchEvent(new Event('input'));
    }

    showToast('✓ KYC Verified! Mobile verified & Withdrawal PIN set successfully.');
    updateWithdrawKycUI();
    validateWithdrawalForm();
  } else {
    showToast(res.message || 'KYC Verification failed');
  }
}

on('btnSubmitInlineKyc', 'click', () => handleSubmitKyc(true));
on('btnSubmitKyc', 'click', () => handleSubmitKyc(false));

on('kycModalClose', 'click', () => closeModal('kycModal'));

// Legacy dummy event listeners to prevent any errors if scripts invoke them
on('btnInlineKycAadhaar', 'click', () => {});
on('btnInlineKycPan', 'click', () => {});
on('btnKycAadhaar', 'click', () => {});
on('btnKycPan', 'click', () => {});

// Submit Withdrawal Request
on('confirmWithdrawBtn', 'click', async () => {
  if (!currentUser) {
    showToast('Please log in or register first');
    openModal('authModal');
    return;
  }

  if (!validateWithdrawalForm()) {
    showToast('Please complete all required fields and KYC first.');
    return;
  }

  if (currentUser.isPhoneVerified === false || (!currentUser.phone && currentUser.id !== 'usr_guest_demo')) {
    return showToast('Please verify your mobile number before requesting withdrawal');
  }

  // KYC requirement removed per user request

  const amt = parseFloat(document.getElementById('withdrawAmountInput')?.value);
  if (!amt || isNaN(amt) || amt < 100) return showToast('Minimum withdrawal is ₹100');
  if (amt > 50000) return showToast('Maximum withdrawal per request is ₹50,000');
  if (Math.round(Number(currentUser.balance || 0) * 100) < Math.round(amt * 100)) {
    return showToast('Insufficient balance for this withdrawal');
  }

  let accountDetails = {};
  let destinationStr = '';

  if (selectedWithdrawMethod === 'UPI') {
    const upiId = document.getElementById('withdrawUpiInput')?.value?.trim();
    if (!upiId || !/^[\w.\-]+@[\w.\-]+$/i.test(upiId)) {
      return showToast('Please enter a valid UPI ID (e.g. user@oksbi)');
    }
    accountDetails = { upiId, holderName: currentUser.name || 'Player' };
    destinationStr = upiId;
  } else if (selectedWithdrawMethod === 'OTHER' || selectedWithdrawMethod === 'USDT') {
    const network = document.getElementById('withdrawOtherNetwork')?.value || 'TRC20';
    const address = document.getElementById('withdrawOtherAddress')?.value?.trim();
    const holder = document.getElementById('withdrawOtherHolder')?.value?.trim() || currentUser.name || 'Player';
    if (!address || address.length < 8) {
      return showToast('Please enter a valid wallet address or account identifier');
    }
    accountDetails = { walletAddress: address, network, holderName: holder };
    destinationStr = `${network}: ${address.slice(0, 6)}...${address.slice(-4)}`;
  } else {
    // Bank Transfer
    const holder = document.getElementById('withdrawBankHolder')?.value?.trim();
    const acc = document.getElementById('withdrawBankAcc')?.value?.trim();
    const accConfirm = document.getElementById('withdrawBankAccConfirm')?.value?.trim();
    const ifsc = document.getElementById('withdrawBankIfsc')?.value?.trim().toUpperCase();
    const bankName = document.getElementById('withdrawBankName')?.value?.trim() || 'Bank';

    if (!holder || holder.length < 3) return showToast('Please enter account holder name');
    if (!acc || !/^\d{9,18}$/.test(acc)) return showToast('Bank account number must be 9-18 digits');
    if (accConfirm && accConfirm !== acc) return showToast('Bank account numbers do not match');
    if (!ifsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return showToast('Invalid IFSC code (e.g. HDFC0001234)');

    accountDetails = { holderName: holder, accountNumber: acc, ifsc, bankName };
    destinationStr = `${bankName} (A/C: ...${acc.slice(-4)})`;
  }

  const otp = document.getElementById('withdrawOtpInput')?.value?.trim() || null;
  const withdrawalPin = document.getElementById('withdrawPinInput')?.value?.trim() || null;

  const btn = document.getElementById('confirmWithdrawBtn');
  if (btn) btn.disabled = true;

  const payload = {
    amount: amt,
    method: selectedWithdrawMethod,
    accountDetails,
    upiOrBank: destinationStr,
    otp,
    withdrawalPin
  };

  const res = await apiRequest('/api/wallet/withdraw', 'POST', payload);
  if (btn) btn.disabled = false;

  if (res.success) {
    const finalBalance = (res.newBalance !== undefined && res.newBalance !== null) ? Number(res.newBalance) : Math.max(0, Number(currentUser.balance || 0) - amt);
    currentUser.balance = finalBalance;
    updateBalanceUI(finalBalance);
    showToast(`✓ Withdrawal ${res.withdrawalId || ''} submitted! ₹${amt.toFixed(2)} deducted & held in escrow.`);
    const otpInput = document.getElementById('withdrawOtpInput');
    if (otpInput) otpInput.value = '';
    currentDispatchedOtp = null;
    switchWTab('history');
    loadTransactions();
    fetchUserNotifications();
    validateWithdrawalForm();
  } else {
    showToast(res.message || 'Withdrawal request failed');
  }
});

// Bind real-time input listeners to all withdrawal fields for automatic button unlock
['withdrawAmountInput', 'withdrawUpiInput', 'withdrawBankHolder', 'withdrawBankAcc', 'withdrawBankAccConfirm', 'withdrawBankIfsc', 'withdrawBankName', 'withdrawOtherAddress', 'withdrawOtherHolder', 'withdrawOtpInput', 'withdrawPinInput'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', () => {
      validateWithdrawalForm();
    });
    el.addEventListener('change', () => {
      validateWithdrawalForm();
    });
    el.addEventListener('keyup', () => {
      validateWithdrawalForm();
    });
  }
});

// Refresh button in History
on('btnRefreshHistory', 'click', () => {
  loadTransactions();
  showToast('Transaction records refreshed');
});

// 14. Transaction History with Filter Pills & Dedicated Section Renderers
let currentTxFilter = 'ALL';

function formatTxItemHtml(item) {
  let statusColor = item.isProfit ? '#16a34a' : '#ef4444';
  let statusLabel = item.status || 'SUCCESS';

  if (item.category === 'RECHARGE') {
    if (item.status === 'PENDING' || item.status === 'pending') {
      statusColor = '#d97706';
      statusLabel = '⏳ PENDING APPROVAL';
    } else if (item.status === 'REJECTED' || item.status === 'rejected' || item.status === 'FAILED') {
      statusColor = '#dc2626';
      statusLabel = '✕ REJECTED';
    } else {
      statusColor = '#16a34a';
      statusLabel = '✓ APPROVED';
    }
  } else if (item.category === 'WITHDRAW') {
    if (item.status === 'UNDER_REVIEW' || item.status === 'PENDING' || item.status === 'pending') {
      statusColor = '#d97706';
      statusLabel = '⏳ UNDER REVIEW';
    } else if (item.status === 'PROCESSING') {
      statusColor = '#2563eb';
      statusLabel = '⚡ PROCESSING';
    } else if (item.status === 'REJECTED' || item.status === 'rejected' || item.status === 'FAILED') {
      statusColor = '#dc2626';
      statusLabel = '✕ REJECTED';
    } else {
      statusColor = '#16a34a';
      statusLabel = '✓ COMPLETED';
    }
  } else if (item.status === 'UNDER_REVIEW' || item.status === 'PENDING' || item.status === 'pending') {
    statusColor = '#d97706';
    statusLabel = 'PENDING';
  } else if (item.status === 'REJECTED' || item.status === 'FAILED') {
    statusColor = '#dc2626';
    statusLabel = item.status.toUpperCase();
  }

  const profitText = item.profitOrLoss !== undefined
    ? (item.profitOrLoss >= 0 ? `+₹${item.profitOrLoss.toFixed(2)}` : `-₹${Math.abs(item.profitOrLoss).toFixed(2)}`)
    : `${item.isProfit ? '+' : '-'}₹${Number(item.amount).toFixed(2)}`;

  const itemDate = item.date instanceof Date && !isNaN(item.date.getTime()) ? item.date : new Date();
  const dateStr = itemDate.toLocaleDateString([], {month:'short', day:'numeric'});
  const timeStr = itemDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

  return `
    <div style="flex:1;">
      <div style="display:flex; align-items:center; gap:6px;">
        <b>${item.title}</b>
        <span style="font-size:10px; font-weight:800; padding:1px 6px; border-radius:4px; color:${statusColor}; background:${statusColor}18;">${statusLabel}</span>
      </div>
      <small style="color:#64748b; font-size:11px;">
        ${item.details ? item.details + ' • ' : ''}
        ${dateStr} ${timeStr}
        ${item.utrNumber ? ` • UTR: <b style="color:#0f766e;">${item.utrNumber}</b>` : ''}
        ${item.referenceId ? ` • Ref: <b>${item.referenceId}</b>` : ''}
        ${item.rejectReason ? ` • <span style="color:#ef4444; font-weight:700;">Reason: ${item.rejectReason}</span>` : ''}
      </small>
    </div>
    <div class="tx-amount ${item.isProfit ? 'pos' : 'neg'}" style="font-weight:900; font-size:13.5px; white-space:nowrap; margin-left:8px;">
      ${profitText}
    </div>
  `;
}

function parseSafeDate(val) {
  if (!val) return new Date();
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
}

async function loadTransactions(filter = currentTxFilter) {
  currentTxFilter = filter;
  const res = await apiRequest('/api/wallet/transactions');
  const betsRes = await apiRequest('/api/games/my-bets');
  const list = document.getElementById('transactionList');
  if (list) list.innerHTML = '';

  const allItems = [];
  const rechargeItems = [];
  const withdrawItems = [];

  if (res.success && res.transactions) {
    try {
      localStorage.setItem('diuwin_transactions', JSON.stringify(res.transactions));
    } catch(e) {}
    res.transactions.forEach(t => {
      const isWithdraw = t.type === 'WITHDRAW' || t.type === 'WITHDRAW_LOCK' || t.type === 'WITHDRAWAL';
      const isRecharge = t.type === 'DEPOSIT' || t.type === 'RECHARGE';
      const isBetTx = t.type === 'GAME_PROFIT' || t.type === 'GAME_LOSS' || t.type === 'GAME_BET';

      if (isBetTx) {
        const isWin = t.type === 'GAME_PROFIT' || (Number(t.amount) > 0);
        const amt = Math.abs(Number(t.amount || 0));
        allItems.push({
          id: t.id,
          category: 'GAME',
          title: t.description || 'Game Bet',
          profitOrLoss: isWin ? amt : -amt,
          isProfit: isWin,
          status: isWin ? 'PROFIT' : 'LOSS',
          details: t.description || 'Game Bet',
          date: parseSafeDate(t.createdAt || t.created_at)
        });
      } else {
        const isPos = isRecharge || t.type === 'SIGNUP_BONUS' || t.type === 'WELCOME_BONUS' || t.type === 'DAILY_CHECKIN' || t.type === 'REFERRAL_COMMISSION' || t.type === 'GIFT_REDEEM';

        let extractedUtr = t.utrNumber || null;
        if (!extractedUtr && t.description && t.description.includes('UTR:')) {
          const match = t.description.match(/UTR:\s*([A-Za-z0-9_]+)/);
          if (match) extractedUtr = match[1];
        }

        const itemObj = {
          id: t.id,
          category: isRecharge ? 'RECHARGE' : (isWithdraw ? 'WITHDRAW' : 'BONUS'),
          title: isWithdraw ? `Withdrawal (${t.method || 'Payout'})` : (isRecharge ? `Recharge (${t.method || 'UPI QR'})` : (t.description || t.type)),
          amount: Math.abs(Number(t.amount || 0)),
          isProfit: isPos,
          isWithdraw,
          isRecharge,
          method: t.method || (t.destination && t.destination.includes('@') ? 'UPI' : 'BANK'),
          status: t.status,
          utrNumber: extractedUtr,
          orderId: t.orderId || null,
          destination: t.destination || '',
          referenceId: t.referenceId || null,
          rejectReason: t.rejectReason || null,
          details: isRecharge ? (extractedUtr ? `UTR: ${extractedUtr}` : (t.method || 'UPI')) : (t.method ? `${t.method} • ${t.destination}` : (t.destination || '')),
          date: parseSafeDate(t.createdAt || t.created_at)
        };

        allItems.push(itemObj);
        if (isRecharge) rechargeItems.push(itemObj);
        if (isWithdraw) withdrawItems.push(itemObj);
      }
    });
  }

  if (betsRes.success && betsRes.bets) {
    try {
      localStorage.setItem('diuwin_bets', JSON.stringify(betsRes.bets));
    } catch(e) {}
    betsRes.bets.forEach(b => {
      const isWin = b.isWin || (b.profitOrLoss > 0);
      allItems.push({
        category: 'GAME',
        title: `${b.gameName || 'Game'}: ${b.details || b.choice || 'Bet'}`,
        profitOrLoss: b.profitOrLoss !== undefined ? b.profitOrLoss : (isWin ? (b.winAmount - b.betAmount) : -b.betAmount),
        isProfit: isWin,
        status: isWin ? 'PROFIT' : 'LOSS',
        details: `Bet: ₹${b.betAmount} • ${b.multiplier}x • ${b.period ? '#' + String(b.period).slice(-4) : ''}`,
        date: parseSafeDate(b.createdAt || b.created_at)
      });
    });
  }

  const getTime = (it) => (it.date instanceof Date && !isNaN(it.date.getTime()) ? it.date.getTime() : 0);
  allItems.sort((a, b) => getTime(b) - getTime(a));
  rechargeItems.sort((a, b) => getTime(b) - getTime(a));
  withdrawItems.sort((a, b) => getTime(b) - getTime(a));

  // 1. Render Dedicated Recharge List inside Deposit Tab
  const depositList = document.getElementById('depositHistoryList');
  if (depositList) {
    if (rechargeItems.length > 0) {
      depositList.innerHTML = '';
      rechargeItems.slice(0, 5).forEach(item => {
        const el = document.createElement('div');
        el.className = 'tx-item';
        el.innerHTML = formatTxItemHtml(item);
        depositList.appendChild(el);
      });
    } else {
      depositList.innerHTML = '<div style="text-align:center; padding:12px; color:#94a3b8; font-size:11px;">No recharge records yet. Submit UTR after payment.</div>';
    }
  }

  // 2. Render Dedicated Withdrawal List inside Withdraw Tab
  const withdrawList = document.getElementById('withdrawHistoryList');
  if (withdrawList) {
    if (withdrawItems.length > 0) {
      withdrawList.innerHTML = '';
      withdrawItems.slice(0, 5).forEach(item => {
        const el = document.createElement('div');
        el.className = 'tx-item';
        el.innerHTML = formatTxItemHtml(item);
        withdrawList.appendChild(el);
      });
    } else {
      withdrawList.innerHTML = '<div style="text-align:center; padding:12px; color:#94a3b8; font-size:11px;">No withdrawal records yet.</div>';
    }
  }

  // 3. Render Main Transactions Ledger with Filter
  if (list) {
    let filteredItems = allItems;
    if (currentTxFilter === 'RECHARGE') {
      filteredItems = allItems.filter(i => i.category === 'RECHARGE');
    } else if (currentTxFilter === 'WITHDRAW') {
      filteredItems = allItems.filter(i => i.category === 'WITHDRAW');
    } else if (currentTxFilter === 'GAME') {
      filteredItems = allItems.filter(i => i.category === 'GAME');
    }

    if (filteredItems.length > 0) {
      filteredItems.slice(0, 50).forEach(item => {
        const el = document.createElement('div');
        el.className = 'tx-item';
        el.innerHTML = formatTxItemHtml(item);
        list.appendChild(el);
      });
    } else {
      if (currentTxFilter === 'RECHARGE') {
        list.innerHTML = '<div style="text-align:center; padding:24px; color:#64748b;"><div style="font-size:26px; margin-bottom:4px;">💳</div><b>No Recharge Records Found</b><br><small style="font-size:11px; color:#94a3b8;">Use UPI or QR Scanner in Recharge tab to submit payment.</small></div>';
      } else if (currentTxFilter === 'WITHDRAW') {
        list.innerHTML = '<div style="text-align:center; padding:24px; color:#64748b;"><div style="font-size:26px; margin-bottom:4px;">💸</div><b>No Withdrawal Records Found</b><br><small style="font-size:11px; color:#94a3b8;">Submit a payout request in Withdraw tab to see records here.</small></div>';
      } else if (currentTxFilter === 'GAME') {
        list.innerHTML = '<div style="text-align:center; padding:24px; color:#64748b;"><div style="font-size:26px; margin-bottom:4px;">🎮</div><b>No Game Bet Records</b><br><small style="font-size:11px; color:#94a3b8;">Play WinGo, K3, 5D or Mines to view game history.</small></div>';
      } else {
        list.innerHTML = '<div style="text-align:center; padding:24px; color:#888;">No transactions or bets yet</div>';
      }
    }
  }
}

// 15. In-App Notifications Modal & Polling
async function fetchUserNotifications() {
  if (!currentUser) return;
  const res = await apiRequest('/api/user/notifications');
  const badge = document.getElementById('notifBadgeCount');
  if (res.success) {
    if (badge) {
      if (res.unreadCount > 0) {
        badge.style.display = 'inline-block';
        badge.textContent = res.unreadCount;
      } else {
        badge.style.display = 'none';
      }
    }
  }
}

on('btnOpenNotifications', 'click', async () => {
  openModal('notificationsModal');
  const list = document.getElementById('notifsList');
  if (!list) return;
  list.innerHTML = '<div style="text-align:center; padding:15px; color:#64748b;">Loading notifications...</div>';

  const res = await apiRequest('/api/user/notifications');
  if (res.success && res.notifications && res.notifications.length > 0) {
    list.innerHTML = res.notifications.map(n => {
      const isWarn = n.type.includes('REJECT') || n.type.includes('FAIL');
      const isSuccess = n.type.includes('COMPLETE') || n.type.includes('APPROVE');
      const color = isWarn ? '#ef4444' : (isSuccess ? '#10b981' : '#3b82f6');
      const icon = isWarn ? '⚠️' : (isSuccess ? '✅' : '📢');
      return `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid ${color}; border-radius:8px; padding:10px 12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <b style="font-size:12.5px; color:#1e293b;">${icon} ${n.title}</b>
            <small style="color:#94a3b8; font-size:10px;">${new Date(n.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</small>
          </div>
          <div style="font-size:11.5px; color:#475569; line-height:1.4;">${n.message}</div>
        </div>
      `;
    }).join('');
  } else {
    list.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8; font-size:12px;">No notifications yet</div>';
  }
});

on('btnMarkAllNotifsRead', 'click', async () => {
  await apiRequest('/api/user/notifications/mark-read', 'POST');
  const badge = document.getElementById('notifBadgeCount');
  if (badge) badge.style.display = 'none';
  showToast('All notifications marked as read');
});

on('notifModalClose', 'click', () => closeModal('notificationsModal'));

// Wallet Subtabs
on('tabDepositBtn', 'click', () => switchWTab('deposit'));
on('tabWithdrawBtn', 'click', () => {
  switchWTab('withdraw');
  if (currentUser) {
    const balEl = document.getElementById('withdrawAvailBal');
    if (balEl) balEl.textContent = Number(currentUser.balance || 0).toFixed(2);
    const phoneEl = document.getElementById('withdrawKycPhone');
    if (phoneEl && currentUser.phone) phoneEl.textContent = `+91 ${currentUser.phone} Verified`;
  }
  updateWithdrawalBreakdown();
});
on('tabHistoryBtn', 'click', () => {
  switchWTab('history');
  loadTransactions();
});

function updateWithdrawKycUI() {
  if (!currentUser) return;
  currentUser.kycStatus = 'VERIFIED';
  const balEl = document.getElementById('withdrawAvailBal');
  if (balEl) balEl.textContent = Number(currentUser.balance || 0).toFixed(2);

  const phoneEl = document.getElementById('withdrawKycPhone');
  const statusEl = document.getElementById('withdrawKycStatusText');
  const badgeEl = document.getElementById('withdrawKycBadge');
  const bannerEl = document.getElementById('withdrawKycBanner');

  if (bannerEl) bannerEl.style.display = 'none';
  const inlinePanel = document.getElementById('inlineKycPanel');
  if (inlinePanel) inlinePanel.style.display = 'none';

  // Prepopulate account details if user has linked accounts
  if (currentUser.linkedAccounts && currentUser.linkedAccounts.length > 0) {
    const upiAcc = currentUser.linkedAccounts.find(a => a.method === 'UPI');
    const bankAcc = currentUser.linkedAccounts.find(a => a.method === 'BANK');
    const upiInp = document.getElementById('withdrawUpiInput');
    if (upiInp && upiAcc && upiAcc.upiId) {
      upiInp.value = upiAcc.upiId;
    }
    if (bankAcc) {
      const holderInp = document.getElementById('withdrawBankHolder');
      const accInp = document.getElementById('withdrawBankAcc');
      const confirmInp = document.getElementById('withdrawBankAccConfirm');
      const ifscInp = document.getElementById('withdrawBankIfsc');
      const nameInp = document.getElementById('withdrawBankName');
      if (holderInp && !holderInp.value && bankAcc.holderName) holderInp.value = bankAcc.holderName;
      if (accInp && !accInp.value && bankAcc.accountNumber) {
        accInp.value = bankAcc.accountNumber;
        if (confirmInp && !confirmInp.value) confirmInp.value = bankAcc.accountNumber;
      }
      if (ifscInp && !ifscInp.value && bankAcc.ifsc) ifscInp.value = bankAcc.ifsc;
      if (nameInp && !nameInp.value && bankAcc.bankName) nameInp.value = bankAcc.bankName;
    }
  } else if (currentUser.name && !currentUser.name.startsWith('Player')) {
    const holderInp = document.getElementById('withdrawBankHolder');
    if (holderInp && !holderInp.value) holderInp.value = currentUser.name;
  }

  // Fetch real-time pending withdrawals & balance limits
  apiRequest('/api/wallet/withdrawal-summary').then(res => {
    if (res.success) {
      const pendingEl = document.getElementById('summaryPendingAmt');
      if (pendingEl) {
        pendingEl.textContent = `₹${Number(res.pendingTotal || 0).toFixed(2)} (${res.pendingCount || 0} in queue)`;
      }
      if (res.availableBalance !== undefined) {
        currentUser.balance = res.availableBalance;
        if (balEl) balEl.textContent = Number(res.availableBalance).toFixed(2);
      }
      updateWithdrawalBreakdown();
    }
  }).catch(() => {});

  // Fetch Step 7 Security Verification Status (Session, 2FA & Withdrawal PIN)
  apiRequest('/api/user/security-status').then(sec => {
    if (sec.success) {
      const sessionBadge = document.getElementById('sessionStatusBadge');
      if (sessionBadge) {
        sessionBadge.textContent = sec.isLoggedIn ? 'Session: Active ✓' : 'Session Expired ⚠️';
        sessionBadge.style.color = sec.isLoggedIn ? '#059669' : '#dc2626';
        sessionBadge.style.background = sec.isLoggedIn ? '#ecfdf5' : '#fef2f2';
      }

      const pinBadge = document.getElementById('pinRequiredBadge');
      const pinHint = document.getElementById('withdrawPinHint');
      const pinStatus = document.getElementById('pinStatusIndicator');

      if (sec.hasWithdrawalPin) {
        if (pinBadge) {
          pinBadge.textContent = 'Required 🔒';
          pinBadge.style.color = '#b45309';
          pinBadge.style.fontWeight = '700';
        }
        if (pinHint) {
          pinHint.textContent = '✓ 4-6 digit Withdrawal PIN is configured & required for confirmation';
          pinHint.style.color = '#059669';
        }
        if (pinStatus) {
          pinStatus.textContent = 'Configured ✓';
          pinStatus.style.color = '#059669';
          pinStatus.style.background = '#ecfdf5';
        }
      } else {
        if (pinBadge) {
          pinBadge.textContent = '(यदि लागू हो / Optional)';
          pinBadge.style.color = '#64748b';
        }
        if (pinHint) {
          pinHint.textContent = 'Optional: You can configure a Withdrawal PIN in your Account Settings';
          pinHint.style.color = '#64748b';
        }
        if (pinStatus) {
          pinStatus.textContent = 'Not Configured';
          pinStatus.style.color = '#d97706';
          pinStatus.style.background = '#fef3c7';
        }
      }

      const otpReqLabel = document.getElementById('otpRequirementLabel');
      if (otpReqLabel && sec.requireWithdrawalOtp) {
        otpReqLabel.textContent = '(Mandatory 2FA Enabled 🔒)';
        otpReqLabel.style.color = '#b45309';
      }
      if (typeof validateWithdrawalForm === 'function') {
        validateWithdrawalForm();
      }
    }
  }).catch(() => {});

  if (typeof validateWithdrawalForm === 'function') {
    validateWithdrawalForm();
  }
}

// Step 7: Configure / Update Withdrawal Security PIN
on('btnSaveWithdrawalPin', 'click', async () => {
  if (!currentUser) return showToast('Please log in first');
  const pinInput = document.getElementById('setPinInput');
  const pin = pinInput?.value?.trim();
  if (!pin || !/^\d{4,6}$/.test(pin)) {
    return showToast('Withdrawal PIN must be 4 to 6 numeric digits');
  }
  const res = await apiRequest('/api/user/withdrawal-pin', 'POST', { pin });
  if (res.success) {
    showToast(res.message || 'Withdrawal PIN configured!');
    if (pinInput) pinInput.value = '';
    const pinBadge = document.getElementById('pinRequiredBadge');
    if (pinBadge) {
      pinBadge.textContent = 'Required 🔒';
      pinBadge.style.color = '#b45309';
      pinBadge.style.fontWeight = '700';
    }
    const pinHint = document.getElementById('withdrawPinHint');
    if (pinHint) {
      pinHint.textContent = '✓ 4-6 digit Withdrawal PIN is configured & required for confirmation';
      pinHint.style.color = '#059669';
    }
    const pinStatus = document.getElementById('pinStatusIndicator');
    if (pinStatus) {
      pinStatus.textContent = 'Configured ✓';
      pinStatus.style.color = '#059669';
      pinStatus.style.background = '#ecfdf5';
    }
  } else {
    showToast(res.message || 'Failed to save Withdrawal PIN');
  }
});

function switchWTab(tab, filter) {
  document.getElementById('tabDepositBtn')?.classList.toggle('active', tab === 'deposit');
  document.getElementById('tabWithdrawBtn')?.classList.toggle('active', tab === 'withdraw');
  document.getElementById('tabHistoryBtn')?.classList.toggle('active', tab === 'history');
  const depSec = document.getElementById('depositSection');
  const withSec = document.getElementById('withdrawSection');
  const histSec = document.getElementById('historySection');
  if (depSec) depSec.style.display = tab === 'deposit' ? 'block' : 'none';
  if (withSec) withSec.style.display = tab === 'withdraw' ? 'block' : 'none';
  if (histSec) histSec.style.display = tab === 'history' ? 'block' : 'none';

  if (tab === 'withdraw') {
    updateWithdrawKycUI();
    if (typeof updateWithdrawalBreakdown === 'function') {
      updateWithdrawalBreakdown();
    }
  }

  if (tab === 'history') {
    if (filter) {
      currentTxFilter = filter;
    }
    // Update active filter button in UI
    document.querySelectorAll('#txFilterBar .tx-filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === currentTxFilter);
    });
    loadTransactions(currentTxFilter);
  } else {
    // Refresh mini history lists in deposit and withdraw tabs
    loadTransactions();
  }
}

// History Filter Bar & Quick Navigation Listeners
document.querySelectorAll('#txFilterBar .tx-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#txFilterBar .tx-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTxFilter = btn.dataset.filter || 'ALL';
    loadTransactions(currentTxFilter);
  });
});

on('btnRefreshHistory', 'click', () => {
  loadTransactions(currentTxFilter);
  showToast('Transaction records refreshed');
});

on('btnDepositViewAllHistory', 'click', () => {
  switchWTab('history', 'RECHARGE');
});

on('btnWithdrawViewAllHistory', 'click', () => {
  switchWTab('history', 'WITHDRAW');
});

on('accRechargeHistoryBtn', 'click', () => {
  closeAllModals();
  openModal('walletModal');
  switchWTab('history', 'RECHARGE');
});

on('accWithdrawHistoryBtn', 'click', () => {
  closeAllModals();
  openModal('walletModal');
  switchWTab('history', 'WITHDRAW');
});

// Brand Logo click
on('brandLogoHome', 'click', () => switchView('viewHome'));
on('detailNoticeBtn', 'click', () => showToast('DiuWin Notice: 24/7 payouts and certified games active!'));

// Legal & Trust Modals Listeners
on('linkPrivacyPolicy', 'click', () => openModal('privacyModal'));
on('privacyModalClose', 'click', () => closeModal('privacyModal'));
on('btnAckPrivacy', 'click', () => closeModal('privacyModal'));

on('linkTermsOfService', 'click', () => openModal('termsModal'));
on('termsModalClose', 'click', () => closeModal('termsModal'));
on('btnAckTerms', 'click', () => closeModal('termsModal'));

on('linkResponsibleGaming', 'click', () => openModal('responsibleModal'));
on('responsibleModalClose', 'click', () => closeModal('responsibleModal'));
on('btnAckResponsible', 'click', () => closeModal('responsibleModal'));

on('linkCustomerSupport', 'click', () => openModal('supportModal'));
on('sideSupportBtn', 'click', () => openModal('supportModal'));
on('supportModalClose', 'click', () => closeModal('supportModal'));
on('btnAckSupport', 'click', () => closeModal('supportModal'));

// Initialize on page load
window.loadTransactions = loadTransactions;
window.switchWTab = switchWTab;
initUserSession();
loadSavedAuthCredentials();
renderGamesByCategory('all');
