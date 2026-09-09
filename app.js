// DiuWin Official Lobby - Logic & Backend Engine
const IS_FILE_PROTOCOL = window.location.protocol === 'file:';
const IS_LOCAL_DEV = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && 
                     (window.location.port === '5500' || window.location.port === '5501' || IS_FILE_PROTOCOL);
const API_BASE = IS_LOCAL_DEV ? 'http://localhost:3000' : '';

let currentUser = null;
let currentToken = localStorage.getItem('diuwin_token') || null;
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
  if (bDisplay) bDisplay.textContent = `₹${formatted}`;
  if (bArena) bArena.textContent = formatted;
  if (bModal) bModal.textContent = formatted;
  if (bAcc) bAcc.textContent = formatted;
}

// API Helper
async function apiRequest(endpoint, method = 'GET', data = null) {
  const url = `${API_BASE}${endpoint}`;
  const headers = { 'Content-Type': 'application/json' };
  if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : null,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (res.ok) return await res.json();
    const errJson = await res.json().catch(() => null);
    if (errJson) return errJson;
  } catch (err) {}

  // Local fallback simulation (if server unreachable)
  return fallbackHandler(endpoint, method, data);
}

function fallbackHandler(endpoint, method, data) {
  if (endpoint.includes('/api/user/profile') || endpoint.includes('/api/auth/guest')) {
    if (!currentUser) {
      currentUser = { id: 'usr_guest', name: 'Demo Player', phone: '9876543210', balance: 1000.00, vipLevel: 1 };
    }
    return { success: true, user: currentUser };
  }
  if (endpoint.includes('/api/auth/login')) {
    currentUser = { id: 'usr_' + Date.now(), name: 'Player ' + (data?.phone || '').slice(-4), phone: data?.phone, balance: 1000.00, vipLevel: 1, token: 'tok_local' };
    return { success: true, user: currentUser };
  }
  if (endpoint.includes('/api/auth/register')) {
    currentUser = { id: 'usr_' + Date.now(), name: 'Player ' + (data?.phone || '').slice(-4), phone: data?.phone, balance: 500.00, vipLevel: 1, token: 'tok_local' };
    return { success: true, user: currentUser };
  }
  if (endpoint.includes('/api/wallet/deposit')) {
    const amt = parseFloat(data?.amount || 200);
    if (!currentUser) currentUser = { id: 'usr_guest', name: 'Demo Player', phone: '9876543210', balance: 1000, vipLevel: 1 };
    currentUser.balance += amt;
    return { success: true, newBalance: currentUser.balance };
  }
  if (endpoint.includes('/api/wallet/withdraw')) {
    const amt = parseFloat(data?.amount || 100);
    if (!currentUser || currentUser.balance < amt) return { success: false, message: 'Insufficient balance' };
    currentUser.balance -= amt;
    return { success: true, newBalance: currentUser.balance };
  }
  if (endpoint.includes('/api/games/play')) {
    const bet = parseFloat(data?.betAmount || 50);
    if (!currentUser || currentUser.balance < bet) return { success: false, message: 'Insufficient balance. Please recharge!' };
    currentUser.balance -= bet;
    let mult = Math.random() > 0.45 ? 1.8 : 0;
    let win = bet * mult;
    currentUser.balance += win;
    return {
      success: true,
      newBalance: currentUser.balance,
      bet: {
        gameId: data?.gameId,
        betAmount: bet,
        multiplier: mult,
        winAmount: win,
        isWin: win > 0,
        outcomeDetails: {
          reels: ['7️⃣', '7️⃣', '7️⃣'],
          targetAngle: 1845,
          crashedAt: 1.8
        }
      }
    };
  }
  return { success: true };
}

// User Session & Header Status
async function initUserSession() {
  if (currentToken) {
    const res = await apiRequest('/api/user/profile');
    if (res.success && res.user) {
      currentUser = res.user;
    } else {
      currentUser = null;
      currentToken = null;
      localStorage.removeItem('diuwin_token');
    }
  } else {
    currentUser = null;
  }
  renderHeaderStatus();
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
    const key = card.dataset.game;
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
function openModal(id) {
  closeAllModals();
  const m = document.getElementById(id);
  if (m) m.classList.add('show');
}

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('show'));
}

document.querySelectorAll('.modal-close-btn').forEach(b => b.onclick = closeAllModals);
document.querySelectorAll('.modal-backdrop').forEach(b => {
  b.onclick = (e) => { if (e.target === b) closeAllModals(); };
});

// Category filtering
document.querySelectorAll('.category-tab-item').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.category-tab-item').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
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
      localStorage.setItem('diuwin_token', currentToken);

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
      localStorage.setItem('diuwin_token', currentToken);
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
    localStorage.setItem('diuwin_token', currentToken);
    renderHeaderStatus();
    closeAllModals();
    showToast(`Welcome Guest! ₹1,000 demo balance credited.`);
  }
});

// Logout Action
on('logoutBtn', 'click', () => {
  currentUser = null;
  currentToken = null;
  localStorage.removeItem('diuwin_token');
  renderHeaderStatus();
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
  localStorage.removeItem('diuwin_token');
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

on('confirmWithdrawBtn', 'click', async () => {
  if (!currentUser) {
    showToast('Please log in or register first');
    openModal('authModal');
    return;
  }
  const amt = parseFloat(document.getElementById('withdrawAmountInput')?.value);
  if (!amt || amt < 100) return showToast('Min withdrawal is ₹100');
  const res = await apiRequest('/api/wallet/withdraw', 'POST', { amount: amt });
  if (res.success) {
    currentUser.balance = res.newBalance;
    updateBalanceUI(res.newBalance);
    showToast(`Withdrawal of ₹${amt} requested!`);
    loadTransactions();
  } else {
    showToast(res.message || 'Withdrawal failed');
  }
});

async function loadTransactions() {
  const res = await apiRequest('/api/wallet/transactions');
  const betsRes = await apiRequest('/api/games/my-bets');
  const list = document.getElementById('transactionList');
  if (!list) return;
  list.innerHTML = '';

  const allItems = [];

  if (res.success && res.transactions) {
    res.transactions.forEach(t => {
      const isBetTx = t.type === 'GAME_PROFIT' || t.type === 'GAME_LOSS';
      if (!isBetTx) {
        const isPos = t.type === 'DEPOSIT' || t.type === 'SIGNUP_BONUS' || t.type === 'WELCOME_BONUS' || t.type === 'DAILY_CHECKIN' || t.type === 'REFERRAL_COMMISSION' || t.type === 'GIFT_REDEEM';
        allItems.push({
          title: t.description || t.type,
          amount: t.amount,
          isProfit: isPos,
          status: t.status,
          details: t.method || '',
          date: new Date(t.createdAt)
        });
      }
    });
  }

  if (betsRes.success && betsRes.bets) {
    betsRes.bets.forEach(b => {
      const isWin = b.isWin || (b.profitOrLoss > 0);
      allItems.push({
        title: `${b.gameName || 'Game'}: ${b.details || b.choice || 'Bet'}`,
        profitOrLoss: b.profitOrLoss !== undefined ? b.profitOrLoss : (isWin ? (b.winAmount - b.betAmount) : -b.betAmount),
        isProfit: isWin,
        status: isWin ? 'PROFIT' : 'LOSS',
        details: `Bet: ₹${b.betAmount} • ${b.multiplier}x • ${b.period ? '#' + String(b.period).slice(-4) : ''}`,
        date: new Date(b.createdAt)
      });
    });
  }

  allItems.sort((a, b) => b.date - a.date);

  if (allItems.length > 0) {
    allItems.slice(0, 50).forEach(item => {
      const el = document.createElement('div');
      el.className = 'tx-item';
      const isProfit = item.isProfit;
      const profitText = item.profitOrLoss !== undefined
        ? (item.profitOrLoss >= 0 ? `+₹${item.profitOrLoss.toFixed(2)}` : `-₹${Math.abs(item.profitOrLoss).toFixed(2)}`)
        : `${isProfit ? '+' : '-'}₹${Number(item.amount).toFixed(2)}`;

      el.innerHTML = `
        <div>
          <b>${item.title}</b>
          <small>${item.details ? item.details + ' • ' : ''}${item.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • <span style="font-weight:800; color:${isProfit ? '#16a34a' : '#ef4444'};">${item.status}</span></small>
        </div>
        <div class="tx-amount ${isProfit ? 'pos' : 'neg'}" style="font-weight:900;">
          ${profitText}
        </div>
      `;
      list.appendChild(el);
    });
  } else {
    list.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">No transactions or bets yet</div>';
  }
}

// Wallet Subtabs
on('tabDepositBtn', 'click', () => switchWTab('deposit'));
on('tabWithdrawBtn', 'click', () => switchWTab('withdraw'));
on('tabHistoryBtn', 'click', () => {
  switchWTab('history');
  loadTransactions();
});

function switchWTab(tab) {
  document.getElementById('tabDepositBtn')?.classList.toggle('active', tab === 'deposit');
  document.getElementById('tabWithdrawBtn')?.classList.toggle('active', tab === 'withdraw');
  document.getElementById('tabHistoryBtn')?.classList.toggle('active', tab === 'history');
  document.getElementById('depositSection').style.display = tab === 'deposit' ? 'block' : 'none';
  document.getElementById('withdrawSection').style.display = tab === 'withdraw' ? 'block' : 'none';
  document.getElementById('historySection').style.display = tab === 'history' ? 'block' : 'none';
}

// Brand Logo click
on('brandLogoHome', 'click', () => switchView('viewHome'));
on('detailNoticeBtn', 'click', () => showToast('DiuWin Notice: 24/7 payouts and certified games active!'));

// Initialize on page load
initUserSession();
loadSavedAuthCredentials();
