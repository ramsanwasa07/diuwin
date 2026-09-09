// DiuWin Official Aviator - Flight Engine & Real-Time Multiplayer
const IS_FILE_PROTOCOL = window.location.protocol === 'file:';
const IS_LOCAL_DEV = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && 
                     (window.location.port === '5500' || window.location.port === '5501' || IS_FILE_PROTOCOL);
const API_BASE = IS_LOCAL_DEV ? 'http://localhost:3000' : '';

let currentToken = localStorage.getItem('diuwin_token') || null;
let currentUser = null;

// Game State Variables
let gameState = 'WAITING'; // 'WAITING', 'FLYING', 'CRASHED'
let currentMultiplier = 1.00;
let crashPoint = 2.45;
let flightStartTime = 0;
let animationFrameId = null;

// Dual Station States
const stations = {
  1: {
    betAmount: 10.00,
    hasBet: false,
    cashedOut: false,
    autoCashout: false,
    autoTarget: 2.00,
    cashedMultiplier: 0,
    payout: 0
  },
  2: {
    betAmount: 50.00,
    hasBet: false,
    cashedOut: false,
    autoCashout: false,
    autoTarget: 5.00,
    cashedMultiplier: 0,
    payout: 0
  }
};

// Particles Smoke Trail
let particles = [];

// ==================== INITIALIZATION ====================
window.addEventListener('DOMContentLoaded', () => {
  initCanvas();
  initUser();
  setupUIEventListeners();
  startNextRoundCountdown(3);
});

// Toast notification
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('aviatorToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// User Session, Balance & History Sync
let aviatorPills = [];

function loadCachedAviatorPills() {
  const cached = localStorage.getItem('diuwin_aviator_pills');
  if (cached) {
    try {
      aviatorPills = JSON.parse(cached);
      renderPillsBar();
    } catch (e) {}
  }
}

function renderPillsBar() {
  const bar = document.getElementById('historyPillsBar');
  if (!bar) return;
  bar.innerHTML = '';
  aviatorPills.slice(0, 25).forEach(mult => {
    const pill = document.createElement('span');
    const m = Number(mult);
    pill.className = `hist-pill ${m >= 2.0 ? 'purple' : 'blue'}`;
    pill.textContent = `${m.toFixed(2)}x`;
    bar.appendChild(pill);
  });
}

async function syncAviatorStateWithServer() {
  try {
    const res = await fetch(`${API_BASE}/api/aviator/state`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && data.history && data.history.length > 0) {
      aviatorPills = data.history.map(h => typeof h === 'number' ? h : (h.crashMultiplier || h.multiplier || 1.00));
      localStorage.setItem('diuwin_aviator_pills', JSON.stringify(aviatorPills));
      renderPillsBar();
    }
  } catch (e) {}
}

async function initUser() {
  loadCachedAviatorPills();
  loadCachedMyBets();
  syncAviatorStateWithServer();

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
          loadMyBetsFromServer();
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
        loadMyBetsFromServer();
        return;
      }
    } catch (e) {}
  }

  // Fallback guest session
  const storedBal = localStorage.getItem('diuwin_balance');
  currentUser = { id: 'usr_guest_demo', name: 'Demo Player', balance: storedBal ? parseFloat(storedBal) : 1173.70 };
  updateBalanceDisplay(currentUser.balance);
  loadMyBetsFromServer();
}

function updateBalanceDisplay(bal) {
  const num = Number(bal || 0);
  const formatted = num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const el = document.getElementById('userBalanceDisplay');
  if (el) el.textContent = `₹${formatted}`;
}

// ==================== CANVAS SETUP & RENDERING ====================
let canvas, ctx, width, height;

function initCanvas() {
  canvas = document.getElementById('flightCanvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  const wrapper = canvas.parentElement;
  width = canvas.width = wrapper.clientWidth;
  height = canvas.height = wrapper.clientHeight;
}

// Render loop
function render() {
  ctx.clearRect(0, 0, width, height);

  // 1. Draw radial background rays
  drawBackgroundRays();

  if (gameState === 'FLYING') {
    // 2. Compute flight progress along curve
    const elapsed = (Date.now() - flightStartTime) / 1000;
    
    // Multiplier curve progression
    currentMultiplier = Math.max(1.00, parseFloat((1.00 + Math.pow(elapsed * 0.72, 1.85)).toFixed(2)));
    updateMultiplierUI(currentMultiplier);

    // Check Auto Cashouts
    checkAutoCashouts(currentMultiplier);

    // Check Crash
    if (currentMultiplier >= crashPoint) {
      triggerCrash();
      return;
    }

    // Flight Path Coords
    const maxT = Math.min(1.0, elapsed / 8.0);
    const planeX = 60 + (width - 160) * Math.pow(maxT, 0.85);
    const planeY = (height - 60) - (height - 140) * Math.pow(maxT, 1.25);

    // 3. Draw curved path & filled area
    drawFlightTrajectory(planeX, planeY);

    // 4. Update & Draw Particles trail
    updateAndDrawParticles(planeX, planeY);

    // 5. Draw Red Propeller Plane
    drawAirplane(planeX, planeY);

  } else if (gameState === 'CRASHED') {
    // Show crashed state
    drawBackgroundRays();
  }

  if (gameState === 'FLYING') {
    animationFrameId = requestAnimationFrame(render);
  }
}

// Draw Sunburst Rays
function drawBackgroundRays() {
  const cx = 50;
  const cy = height - 40;
  const numRays = 18;
  const maxDist = Math.max(width, height) * 1.5;

  ctx.save();
  for (let i = 0; i < numRays; i++) {
    const angle1 = (i * Math.PI) / (numRays * 2);
    const angle2 = ((i + 0.45) * Math.PI) / (numRays * 2);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle1) * maxDist, cy - Math.sin(angle1) * maxDist);
    ctx.lineTo(cx + Math.cos(angle2) * maxDist, cy - Math.sin(angle2) * maxDist);
    ctx.closePath();
    ctx.fillStyle = (i % 2 === 0) ? 'rgba(15, 23, 42, 0.35)' : 'rgba(30, 41, 59, 0.2)';
    ctx.fill();
  }
  ctx.restore();
}

// Draw Flight Curve Trajectory
function drawFlightTrajectory(targetX, targetY) {
  const startX = 50;
  const startY = height - 50;
  const cpX = startX + (targetX - startX) * 0.55;
  const cpY = startY;

  // Filled Area Under Curve
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.quadraticCurveTo(cpX, cpY, targetX, targetY);
  ctx.lineTo(targetX, startY);
  ctx.closePath();

  const fillGrad = ctx.createLinearGradient(0, targetY, 0, startY);
  fillGrad.addColorStop(0, 'rgba(255, 36, 66, 0.32)');
  fillGrad.addColorStop(1, 'rgba(255, 36, 66, 0.01)');
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // Glow Trajectory Line
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.quadraticCurveTo(cpX, cpY, targetX, targetY);
  ctx.strokeStyle = '#ff2442';
  ctx.lineWidth = 4.5;
  ctx.shadowColor = 'rgba(255, 36, 66, 0.8)';
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.restore();
}

// Realistic 3D Aviator Airplane Loader
const realPlaneImage = new Image();
let realPlaneCanvas = null;

realPlaneImage.crossOrigin = 'anonymous';
realPlaneImage.src = 'images/real_aviator_plane.jpg';
realPlaneImage.onload = () => {
  try {
    const offscreen = document.createElement('canvas');
    const w = realPlaneImage.naturalWidth || realPlaneImage.width;
    const h = realPlaneImage.naturalHeight || realPlaneImage.height;
    offscreen.width = w;
    offscreen.height = h;
    const oCtx = offscreen.getContext('2d');
    oCtx.drawImage(realPlaneImage, 0, 0);

    const imgData = oCtx.getImageData(0, 0, w, h);
    const data = imgData.data;
    let minX = w, maxX = 0, minY = h, maxY = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const maxVal = Math.max(r, g, b);

      if (maxVal < 16) {
        data[i + 3] = 0; // Pure black background -> transparent
      } else if (maxVal < 45) {
        data[i + 3] = Math.round(((maxVal - 16) / 29) * 255); // Smooth anti-aliased edge
      } else {
        data[i + 3] = 255;
        const pixelIndex = i / 4;
        const px = pixelIndex % w;
        const py = Math.floor(pixelIndex / w);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
    oCtx.putImageData(imgData, 0, 0);

    if (maxX > minX && maxY > minY) {
      const pad = 4;
      minX = Math.max(0, minX - pad);
      maxX = Math.min(w - 1, maxX + pad);
      minY = Math.max(0, minY - pad);
      maxY = Math.min(h - 1, maxY + pad);

      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;
      const cropped = document.createElement('canvas');
      cropped.width = cropW;
      cropped.height = cropH;
      const cCtx = cropped.getContext('2d');
      cCtx.drawImage(offscreen, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
      realPlaneCanvas = cropped;
    } else {
      realPlaneCanvas = offscreen;
    }
  } catch (err) {
    console.error('Failed to process real airplane transparency:', err);
    realPlaneCanvas = realPlaneImage;
  }
};

// Draw Real Photo-Realistic Flying Airplane
function drawAirplane(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.24); // Realistic climb angle towards top-right

  if (realPlaneCanvas) {
    const planeW = 100; // Realistic prominent size
    const planeH = (realPlaneCanvas.height / realPlaneCanvas.width) * planeW;

    // Realistic drop shadow for 3D depth
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = -6;
    ctx.shadowOffsetY = 12;

    // Draw realistic 3D airplane
    ctx.drawImage(realPlaneCanvas, -planeW * 0.48, -planeH * 0.54, planeW, planeH);

    // Glowing exhaust flame / heat distortion at engine manifold
    ctx.shadowColor = 'rgba(255, 60, 30, 0.9)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(255, 110, 30, 0.85)';
    ctx.beginPath();
    ctx.ellipse(-planeW * 0.36, planeH * 0.12, 4.5, 2.5, -0.25, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // High-fidelity fallback while image loads
    ctx.fillStyle = '#ff2442';
    ctx.shadowColor = 'rgba(255, 36, 66, 0.8)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// Colorful Particles Trail
function updateAndDrawParticles(planeX, planeY) {
  // Add new particle from realistic exhaust/tail point
  const colors = ['#38bdf8', '#f43f5e', '#fbbf24', '#ffffff', '#a855f7'];
  particles.push({
    x: planeX - 36,
    y: planeY + 8,
    vx: (Math.random() - 0.75) * 1.6,
    vy: (Math.random() - 0.2) * 1.5,
    size: Math.random() * 6 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    alpha: 0.85,
    life: 30
  });

  // Update & Draw
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= 0.025;
    p.size *= 0.95;
    p.life--;

    if (p.life <= 0 || p.alpha <= 0) {
      particles.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ==================== ROUND LIFECYCLE ====================
function startNextRoundCountdown(seconds = 5) {
  gameState = 'WAITING';
  currentMultiplier = 1.00;
  particles = [];

  const numEl = document.getElementById('bigMultiplierText');
  const subEl = document.getElementById('flightStatusText');
  const barWrap = document.getElementById('countdownBarWrap');
  const barFill = document.getElementById('countdownFill');

  numEl.className = 'big-mult-number';
  numEl.textContent = '1.00x';
  subEl.className = 'flight-status-subtext';
  subEl.textContent = 'WAITING FOR NEXT ROUND';
  barWrap.style.display = 'block';

  // Reset Stations
  [1, 2].forEach(st => {
    stations[st].cashedOut = false;
    stations[st].cashedMultiplier = 0;
    stations[st].payout = 0;
    updateStationButtonUI(st);
  });

  // Generate live round crash multiplier
  // 97% RTP distribution fallback
  const r = Math.random();
  if (r < 0.05) crashPoint = 1.00;
  else if (r < 0.35) crashPoint = parseFloat((1.05 + Math.random() * 0.90).toFixed(2));
  else if (r < 0.70) crashPoint = parseFloat((2.00 + Math.random() * 2.80).toFixed(2));
  else if (r < 0.90) crashPoint = parseFloat((5.00 + Math.random() * 6.00).toFixed(2));
  else crashPoint = parseFloat((11.00 + Math.random() * 15.00).toFixed(2));

  // Sync with Server & Admin Control Panel in Real-Time
  fetch('/api/aviator/state')
    .then(res => res.json())
    .then(d => {
      if (d && d.success) {
        if (d.forcedCrashPoint) {
          crashPoint = parseFloat(d.forcedCrashPoint);
        } else if (d.crashPoint) {
          crashPoint = parseFloat(d.crashPoint);
        }
      }
    })
    .catch(() => {});

  // Populate simulated other player bets in sidebar
  populateInitialLiveBets();

  // Progress bar animation
  let start = Date.now();
  const duration = seconds * 1000;
  barFill.style.width = '0%';

  const timer = setInterval(() => {
    const elapsed = Date.now() - start;
    const pct = Math.min(100, (elapsed / duration) * 100);
    barFill.style.width = `${pct}%`;

    if (elapsed >= duration) {
      clearInterval(timer);
      launchFlight();
    }
  }, 50);
}

let flightCheckTimer = null;

function launchFlight() {
  gameState = 'FLYING';
  flightStartTime = Date.now();

  const subEl = document.getElementById('flightStatusText');
  const barWrap = document.getElementById('countdownBarWrap');
  subEl.textContent = 'FLYING';
  barWrap.style.display = 'none';

  // Deduct bets for active stations
  [1, 2].forEach(st => {
    if (stations[st].hasBet) {
      deductBetFromUser(stations[st].betAmount);
    }
    updateStationButtonUI(st);
  });

  // Real-time server sync for emergency stops or live admin crash overrides
  if (flightCheckTimer) clearInterval(flightCheckTimer);
  flightCheckTimer = setInterval(async () => {
    if (gameState !== 'FLYING') {
      clearInterval(flightCheckTimer);
      return;
    }
    try {
      const res = await fetch('/api/aviator/state');
      const d = await res.json();
      if (d && d.success) {
        if (d.state === 'CRASHED' || (d.forcedCrashPoint && currentMultiplier >= parseFloat(d.forcedCrashPoint))) {
          if (d.forcedCrashPoint) crashPoint = parseFloat(d.forcedCrashPoint);
          clearInterval(flightCheckTimer);
          triggerCrash();
        } else if (d.forcedCrashPoint) {
          crashPoint = parseFloat(d.forcedCrashPoint);
        }
      }
    } catch (e) {}
  }, 400);

  render();
}

function triggerCrash() {
  if (flightCheckTimer) {
    clearInterval(flightCheckTimer);
    flightCheckTimer = null;
  }
  gameState = 'CRASHED';
  cancelAnimationFrame(animationFrameId);

  const numEl = document.getElementById('bigMultiplierText');
  const subEl = document.getElementById('flightStatusText');

  numEl.className = 'big-mult-number crashed';
  numEl.textContent = `${crashPoint.toFixed(2)}x`;
  subEl.className = 'flight-status-subtext crashed';
  subEl.textContent = `FLEW AWAY!`;

  // Multiplier history pill
  addHistoryPill(crashPoint);

  // Handle losses on active uncashed bets
  [1, 2].forEach(st => {
    if (stations[st].hasBet && !stations[st].cashedOut) {
      showToast(`Station #${st}: Plane flew away!`);
      recordAviatorBet(stations[st].betAmount, crashPoint, 0, false);
      addMyBetRecord(stations[st].betAmount, crashPoint, 0, false);
      stations[st].hasBet = false;
    }
    updateStationButtonUI(st);
  });

  // Wait 3 seconds and start next round
  setTimeout(() => {
    startNextRoundCountdown(5);
  }, 3200);
}

function updateMultiplierUI(mult) {
  const el = document.getElementById('bigMultiplierText');
  if (el) el.textContent = `${mult.toFixed(2)}x`;

  // Update In-flight cashout buttons
  [1, 2].forEach(st => {
    if (stations[st].hasBet && !stations[st].cashedOut) {
      const liveWin = stations[st].betAmount * mult;
      const amtLabel = document.getElementById(`s${st}_btnAmt`);
      if (amtLabel) amtLabel.textContent = `₹${liveWin.toFixed(2)}`;
    }
  });

  // Randomly cash out other players in sidebar
  simulateOtherPlayersCashout(mult);
}

// Check Auto Cashouts
function checkAutoCashouts(mult) {
  [1, 2].forEach(st => {
    if (stations[st].hasBet && !stations[st].cashedOut && stations[st].autoCashout) {
      if (mult >= stations[st].autoTarget) {
        cashoutStation(st);
      }
    }
  });
}

// Cash Out Action
async function cashoutStation(st) {
  if (gameState !== 'FLYING' || !stations[st].hasBet || stations[st].cashedOut) return;

  const winMultiplier = currentMultiplier;
  const winAmount = parseFloat((stations[st].betAmount * winMultiplier).toFixed(2));

  stations[st].cashedOut = true;
  stations[st].hasBet = false;
  stations[st].cashedMultiplier = winMultiplier;
  stations[st].payout = winAmount;

  // Credit winnings
  currentUser.balance += winAmount;
  currentUser.balance = Number(currentUser.balance.toFixed(2));
  updateBalanceDisplay(currentUser.balance);
  localStorage.setItem('diuwin_balance', currentUser.balance);

  // Send to backend API
  recordAviatorBet(stations[st].betAmount, winMultiplier, winAmount, true);

  updateStationButtonUI(st);
  showToast(`🎉 Station #${st} Cashed Out! Won ₹${winAmount.toFixed(2)} (${winMultiplier}x)`);

  // Add to My Bets list
  addMyBetRecord(stations[st].betAmount, winMultiplier, winAmount, true);
}

// Deduct & Credit Helpers
async function deductBetFromUser(amt) {
  if (currentUser) {
    currentUser.balance = Math.max(0, currentUser.balance - amt);
    currentUser.balance = Number(currentUser.balance.toFixed(2));
    updateBalanceDisplay(currentUser.balance);
    localStorage.setItem('diuwin_balance', currentUser.balance);
  }
}

async function recordAviatorBet(betAmount, multiplier, winAmount, isWin) {
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
        gameId: 'aviator',
        gameName: 'Aviator Crash',
        betAmount,
        winAmount,
        isWin,
        multiplier,
        choice: `${multiplier.toFixed(2)}x`,
        details: isWin ? `Cashed out at ${multiplier.toFixed(2)}x` : `Flew away at ${multiplier.toFixed(2)}x`
      })
    });
    const data = await res.json();
    if (data && data.success && data.newBalance !== undefined && currentUser) {
      currentUser.balance = data.newBalance;
      updateBalanceDisplay(currentUser.balance);
      localStorage.setItem('diuwin_balance', currentUser.balance);
    }
  } catch (e) {}
}

// History Pill Bar
function addHistoryPill(mult) {
  const val = parseFloat(mult.toFixed(2));
  aviatorPills.unshift(val);
  if (aviatorPills.length > 30) aviatorPills.pop();
  try {
    localStorage.setItem('diuwin_aviator_pills', JSON.stringify(aviatorPills));
  } catch (e) {}
  renderPillsBar();
}

// ==================== UI BUTTONS & BET CONTROLS ====================
function setupUIEventListeners() {
  // Exit Button
  document.getElementById('btnExitToLobby')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // Aviator Logo click returns to lobby
  document.querySelector('.aviator-brand-logo')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // Live Chat
  document.getElementById('btnChatToggle')?.addEventListener('click', () => {
    showToast('Aviator Live Chat: 2,491 online players in room.');
  });

  // Setup Dual Stations controls
  [1, 2].forEach(st => {
    // Bet input
    const input = document.getElementById(`s${st}_betInput`);
    const minusBtn = document.getElementById(`s${st}_minus`);
    const plusBtn = document.getElementById(`s${st}_plus`);
    const actionBtn = document.getElementById(`s${st}_actionBtn`);
    const autoToggle = document.getElementById(`autoCashoutToggle${st}`);
    const autoInput = document.getElementById(`autoCashoutInput${st}`);

    minusBtn?.addEventListener('click', () => {
      let v = Math.max(10, parseFloat(input.value) - 10);
      input.value = v.toFixed(2);
      stations[st].betAmount = v;
      updateStationButtonUI(st);
    });

    plusBtn?.addEventListener('click', () => {
      let v = parseFloat(input.value) + 10;
      input.value = v.toFixed(2);
      stations[st].betAmount = v;
      updateStationButtonUI(st);
    });

    input?.addEventListener('change', () => {
      let v = Math.max(10, parseFloat(input.value) || 10);
      input.value = v.toFixed(2);
      stations[st].betAmount = v;
      updateStationButtonUI(st);
    });

    // Auto cashout toggle
    autoToggle?.addEventListener('change', () => {
      stations[st].autoCashout = autoToggle.checked;
      autoInput.style.display = autoToggle.checked ? 'inline-block' : 'none';
    });

    autoInput?.addEventListener('change', () => {
      stations[st].autoTarget = Math.max(1.05, parseFloat(autoInput.value) || 2.0);
      autoInput.value = stations[st].autoTarget.toFixed(2);
    });

    // Action button (Bet / Cashout)
    actionBtn?.addEventListener('click', () => {
      if (gameState === 'FLYING' && stations[st].hasBet && !stations[st].cashedOut) {
        // Cashout
        cashoutStation(st);
      } else if (gameState === 'WAITING') {
        // Place or cancel bet
        stations[st].hasBet = !stations[st].hasBet;
        if (stations[st].hasBet && currentUser && currentUser.balance < stations[st].betAmount) {
          stations[st].hasBet = false;
          showToast('Insufficient balance! Please deposit in wallet.');
        }
        updateStationButtonUI(st);
      } else if (gameState === 'FLYING') {
        // Queue bet for next round
        stations[st].hasBet = !stations[st].hasBet;
        updateStationButtonUI(st);
        showToast(`Station #${st}: Bet queued for next round.`);
      }
    });
  });

  // Preset Chips
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const st = chip.dataset.station;
      const amt = parseFloat(chip.dataset.amt);
      const input = document.getElementById(`s${st}_betInput`);
      if (input) input.value = amt.toFixed(2);
      stations[st].betAmount = amt;
      updateStationButtonUI(st);
    });
  });

  // Sidebar Tabs
  document.getElementById('tabAllBets')?.addEventListener('click', () => {
    document.getElementById('tabAllBets').classList.add('active');
    document.getElementById('tabMyBets').classList.remove('active');
    populateInitialLiveBets();
  });

  document.getElementById('tabMyBets')?.addEventListener('click', () => {
    document.getElementById('tabMyBets').classList.add('active');
    document.getElementById('tabAllBets').classList.remove('active');
    renderMyBets();
  });
}

function updateStationButtonUI(st) {
  const btn = document.getElementById(`s${st}_actionBtn`);
  const mainLabel = document.getElementById(`s${st}_btnText`);
  const amtLabel = document.getElementById(`s${st}_btnAmt`);
  if (!btn || !mainLabel || !amtLabel) return;

  if (gameState === 'FLYING') {
    if (stations[st].hasBet && !stations[st].cashedOut) {
      btn.className = 'action-bet-btn cashout';
      mainLabel.textContent = 'CASH OUT';
      const liveWin = stations[st].betAmount * currentMultiplier;
      amtLabel.textContent = `₹${liveWin.toFixed(2)}`;
    } else if (stations[st].cashedOut) {
      btn.className = 'action-bet-btn waiting';
      mainLabel.textContent = 'CASHED';
      amtLabel.textContent = `₹${stations[st].payout.toFixed(2)}`;
    } else {
      btn.className = 'action-bet-btn';
      mainLabel.textContent = stations[st].hasBet ? 'WAIT NEXT' : 'BET';
      amtLabel.textContent = `₹${stations[st].betAmount.toFixed(2)}`;
    }
  } else {
    // Waiting
    btn.className = 'action-bet-btn';
    mainLabel.textContent = stations[st].hasBet ? 'CANCEL' : 'BET';
    amtLabel.textContent = `₹${stations[st].betAmount.toFixed(2)}`;
    if (stations[st].hasBet) {
      btn.style.background = '#e11d48';
    } else {
      btn.style.background = '#22c55e';
    }
  }
}

// ==================== SIDEBAR LIVE BETS ====================
let simulatedPlayers = [];
let myBetHistory = [];

function populateInitialLiveBets() {
  const container = document.getElementById('liveBetsContainer');
  if (!container) return;
  container.innerHTML = '';
  simulatedPlayers = [];

  const suffixes = ['921', '482', '108', '773', '619', '340', '852', '991', '215', '543', '678', '812'];
  const bets = [10, 20, 50, 100, 200, 500, 1000];

  suffixes.forEach(s => {
    const bet = bets[Math.floor(Math.random() * bets.length)];
    const targetMult = parseFloat((1.15 + Math.random() * 4.5).toFixed(2));
    const player = {
      user: `Mem***${s}`,
      bet,
      targetMult,
      cashed: false
    };
    simulatedPlayers.push(player);

    const row = document.createElement('div');
    row.className = 'bet-row-item';
    row.id = `row_${s}`;
    row.innerHTML = `
      <div class="row-user"><span class="row-user-dot"></span> ${player.user}</div>
      <div class="row-bet">₹${player.bet.toFixed(2)}</div>
      <div class="row-mult" id="mult_${s}">-</div>
      <div class="row-payout" id="pay_${s}">-</div>
    `;
    container.appendChild(row);
  });
}

function simulateOtherPlayersCashout(curMult) {
  simulatedPlayers.forEach(p => {
    if (!p.cashed && curMult >= p.targetMult && curMult <= crashPoint) {
      p.cashed = true;
      const multEl = document.getElementById(`mult_${p.user.slice(-3)}`);
      const payEl = document.getElementById(`pay_${p.user.slice(-3)}`);
      if (multEl && payEl) {
        multEl.textContent = `${p.targetMult.toFixed(2)}x`;
        const win = (p.bet * p.targetMult).toFixed(2);
        payEl.className = 'row-payout win';
        payEl.textContent = `₹${win}`;
      }
    }
  });
}

function loadCachedMyBets() {
  const cached = localStorage.getItem('diuwin_aviator_mybets');
  if (cached) {
    try {
      myBetHistory = JSON.parse(cached);
      if (document.getElementById('tabMyBets')?.classList.contains('active')) {
        renderMyBets();
      }
    } catch (e) {}
  }
}

async function loadMyBetsFromServer() {
  const userId = currentUser ? currentUser.id : 'usr_guest_demo';
  try {
    const res = await fetch(`${API_BASE}/api/games/my-bets?gameId=aviator&userId=${encodeURIComponent(userId)}`, {
      headers: currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {}
    });
    const data = await res.json();
    if (data && data.success && data.bets && data.bets.length > 0) {
      myBetHistory = data.bets.map(b => ({
        time: new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        bet: b.betAmount,
        mult: b.multiplier || (b.choice ? parseFloat(b.choice) : 1.0),
        payout: b.winAmount,
        isWin: b.isWin
      }));
      localStorage.setItem('diuwin_aviator_mybets', JSON.stringify(myBetHistory));
      if (document.getElementById('tabMyBets')?.classList.contains('active')) {
        renderMyBets();
      }
    }
  } catch (e) {}
}

function addMyBetRecord(bet, mult, payout, isWin = (payout > 0)) {
  myBetHistory.unshift({
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    bet,
    mult,
    payout,
    isWin
  });
  if (myBetHistory.length > 30) myBetHistory.pop();
  try {
    localStorage.setItem('diuwin_aviator_mybets', JSON.stringify(myBetHistory));
  } catch (e) {}
  if (document.getElementById('tabMyBets')?.classList.contains('active')) {
    renderMyBets();
  }
}

function renderMyBets() {
  const container = document.getElementById('liveBetsContainer');
  if (!container) return;
  container.innerHTML = '';

  if (myBetHistory.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b; font-size:12px;">No bets placed yet this session</div>';
    return;
  }

  myBetHistory.forEach(b => {
    const row = document.createElement('div');
    row.className = 'bet-row-item';
    const won = b.isWin !== undefined ? b.isWin : (b.payout > 0);
    row.innerHTML = `
      <div class="row-user"><span class="row-user-dot" style="background:${won ? '#22c55e' : '#ef4444'};"></span> You (${b.time})</div>
      <div class="row-bet">₹${Number(b.bet || 0).toFixed(2)}</div>
      <div class="row-mult">${Number(b.mult || 0).toFixed(2)}x</div>
      <div class="row-payout ${won ? 'win' : 'loss'}" style="color:${won ? '#22c55e' : '#ef4444'}; font-weight:700;">₹${Number(b.payout || 0).toFixed(2)}</div>
    `;
    container.appendChild(row);
  });
}
