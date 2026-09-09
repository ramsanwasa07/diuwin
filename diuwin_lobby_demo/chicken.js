// DiuWin Official Chicken Road - Cross The Highway Engine
const IS_FILE_PROTOCOL = window.location.protocol === 'file:';
const IS_LOCAL_DEV = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && 
                     (window.location.port === '5500' || window.location.port === '5501' || IS_FILE_PROTOCOL);
const API_BASE = IS_LOCAL_DEV ? 'http://localhost:3000' : '';

let currentToken = localStorage.getItem('diuwin_token') || null;
let currentUser = null;

// Multipliers for 20 Steps
const STEP_MULTIPLIERS = [
  1.08, 1.20, 1.35, 1.55, 1.80,
  2.12, 2.55, 3.12, 3.90, 4.95,
  6.40, 8.40, 11.20, 15.10, 21.50,
  31.00, 46.00, 68.00, 88.00, 100.00
];

// Game State Variables
let gameState = 'IDLE'; // 'IDLE', 'PLAYING', 'GAMEOVER'
let stakeAmount = 100;
let currentStep = 0; // 0 = Sidewalk safe start, 1..20 = Lanes
let difficulty = 'medium'; // 'easy', 'medium', 'hard', 'hardcore'
let autoCashoutTarget = 0;
let soundEnabled = true;
let turboMode = false;

// History State Variables
let currentChickenPeriod = 1;
let chickenHistoryRecords = [];
let myChickenRuns = [];

function loadCachedChickenHistory() {
  try {
    const cachedHist = localStorage.getItem('diuwin_chicken_history');
    if (cachedHist) chickenHistoryRecords = JSON.parse(cachedHist);
    const cachedRuns = localStorage.getItem('diuwin_chicken_myruns');
    if (cachedRuns) myChickenRuns = JSON.parse(cachedRuns);
  } catch (e) {}
}

async function syncChickenHistoryFromServer() {
  try {
    const res = await fetch(`${API_BASE}/api/chicken/state`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        if (data.period) currentChickenPeriod = data.period;
        if (data.history && data.history.length > 0) {
          chickenHistoryRecords = data.history.map(h => ({
            period: h.period,
            isWin: h.isWin,
            mult: h.mult || 1.0,
            step: h.step || 0,
            difficulty: h.difficulty || 'medium',
            amt: h.amt || h.betAmount || 100,
            winAmount: h.winAmount || 0,
            profitOrLoss: h.profitOrLoss || (h.winAmount ? h.winAmount - (h.amt || 100) : -(h.amt || 100)),
            time: h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : 'Just now'
          }));
          localStorage.setItem('diuwin_chicken_history', JSON.stringify(chickenHistoryRecords));
        }
      }
    }
  } catch (e) {}

  try {
    const myBetsRes = await fetch(`${API_BASE}/api/games/my-bets?gameId=chicken`, {
      headers: currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {}
    });
    if (myBetsRes.ok) {
      const data = await myBetsRes.json();
      if (data.success && data.bets && data.bets.length > 0) {
        myChickenRuns = data.bets.map(b => ({
          period: b.period,
          amt: b.betAmount,
          winAmount: b.winAmount,
          mult: b.multiplier,
          isWin: b.isWin,
          status: b.isWin ? 'win' : 'loss',
          time: new Date(b.createdAt).toLocaleTimeString()
        }));
        localStorage.setItem('diuwin_chicken_myruns', JSON.stringify(myChickenRuns));
      }
    }
  } catch (e) {}

  renderChickenHistoryTables();
}

function renderChickenHistoryTables() {
  const allTbody = document.getElementById('chickenRoundsTableBody');
  const myTbody = document.getElementById('chickenMyRunsTableBody');

  if (allTbody) {
    if (chickenHistoryRecords.length === 0) {
      allTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#64748b;">No draw records found</td></tr>';
    } else {
      allTbody.innerHTML = chickenHistoryRecords.map(r => `
        <tr>
          <td class="td-period-tag">#${r.period}</td>
          <td>
            <span class="c-badge-res ${r.isWin ? 'win' : 'loss'}">
              <i class="fa ${r.isWin ? 'fa-trophy' : 'fa-times-circle'}"></i>
              ${r.isWin ? `Step #${r.step}` : `Splat #${r.step}`}
            </span>
          </td>
          <td class="td-mult-highlight">${r.isWin ? (typeof r.mult === 'number' ? r.mult.toFixed(2) : r.mult) + 'x' : '0.00x'}</td>
          <td style="color:${r.profitOrLoss >= 0 ? '#22c55e' : '#ef4444'}; font-weight:700;">
            ${r.profitOrLoss >= 0 ? '+' : ''}₹${Number(r.profitOrLoss || 0).toFixed(2)}
          </td>
          <td style="color:#64748b; font-size:11px;">${r.time || 'Just now'}</td>
        </tr>
      `).join('');
    }
  }

  if (myTbody) {
    if (myChickenRuns.length === 0) {
      myTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#64748b;">No runs played yet</td></tr>';
    } else {
      myTbody.innerHTML = myChickenRuns.map(r => `
        <tr>
          <td class="td-period-tag">#${r.period}</td>
          <td>₹${Number(r.amt || 0).toFixed(2)}</td>
          <td style="color:${r.isWin ? '#22c55e' : '#64748b'}; font-weight:800;">
            ${r.isWin ? '₹' + Number(r.winAmount || 0).toFixed(2) + ` (${r.mult}x)` : '₹0.00'}
          </td>
          <td>
            <span class="c-badge-res ${r.isWin ? 'win' : 'loss'}">
              ${r.isWin ? 'CASHED' : 'SPLAT'}
            </span>
          </td>
          <td style="color:#64748b; font-size:11px;">${r.time || 'Just now'}</td>
        </tr>
      `).join('');
    }
  }
}

// Audio Synthesizer
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

    if (type === 'hop') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(580, audioCtx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.18);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.18);
    } else if (type === 'splat') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } else if (type === 'cashout') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.25); // A5
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    }
  } catch (e) {}
}

function showToast(msg, duration = 3000) {
  const toast = document.getElementById('chickenToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// ==================== INITIALIZATION ====================
window.addEventListener('DOMContentLoaded', () => {
  loadCachedChickenHistory();
  initUser();
  initTrafficCanvas();
  buildSteppingPads();
  setupUIEventListeners();
  updateStakeDisplay();
  syncChickenHistoryFromServer();
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
  const el = document.getElementById('userBalanceDisplay');
  if (el) el.textContent = formatted;
}

// ==================== TRAFFIC CANVAS & 20 LANES ====================
let canvas, ctx, cWidth, cHeight;
let vehicles = [];
let barricades = [];
let animFrameId = null;

const TOTAL_LANES = 20;
const LANE_WIDTH = 90; // Each lane width in pixels

const VEHICLE_TYPES = [
  { name: 'white_sedan', color: '#f8fafc', width: 32, height: 60, speed: 4.4 },
  { name: 'yellow_taxi', color: '#facc15', isTaxi: true, width: 32, height: 60, speed: 4.8 },
  { name: 'blue_bus', color: '#2563eb', isBus: true, width: 38, height: 96, speed: 3.5 },
  { name: 'orange_truck', color: '#f97316', isTruck: true, width: 36, height: 82, speed: 3.8 },
  { name: 'red_sports', color: '#ef4444', isSports: true, width: 30, height: 56, speed: 6.4 },
  { name: 'police_car', color: '#0f172a', isPolice: true, width: 32, height: 60, speed: 5.6 }
];

function initTrafficCanvas() {
  canvas = document.getElementById('trafficCanvas');
  ctx = canvas.getContext('2d');
  resizeTrafficCanvas();
  window.addEventListener('resize', resizeTrafficCanvas);

  spawnBarricades();
  spawnVehicles();
  animateTraffic();
}

function resizeTrafficCanvas() {
  const innerScroll = document.getElementById('highwayInnerScroll');
  cWidth = canvas.width = Math.max(TOTAL_LANES * LANE_WIDTH, innerScroll.clientWidth);
  cHeight = canvas.height = innerScroll.clientHeight || 480;
  innerScroll.style.minWidth = `${cWidth}px`;
}

function spawnBarricades() {
  barricades = [
    { lane: 2, y: 35 },
    { lane: 2, y: cHeight - 45 },
    { lane: 6, y: cHeight - 45 },
    { lane: 9, y: 35 },
    { lane: 12, y: cHeight - 45 },
    { lane: 14, y: 35 },
    { lane: 16, y: cHeight - 45 }
  ];
}

function spawnVehicles() {
  vehicles = [];
  for (let l = 0; l < TOTAL_LANES; l++) {
    // 75% of lanes have active traffic
    if (Math.random() < 0.75) {
      const type = VEHICLE_TYPES[Math.floor(Math.random() * VEHICLE_TYPES.length)];
      const dir = (l % 2 === 0) ? 1 : -1;
      const speedMult = { easy: 0.9, medium: 1.0, hard: 1.25, hardcore: 1.5 }[difficulty] || 1.0;
      vehicles.push({
        lane: l,
        x: l * LANE_WIDTH + (LANE_WIDTH - type.width) / 2,
        y: Math.random() * cHeight,
        type,
        dir,
        speed: (type.speed * speedMult) * (turboMode ? 1.5 : 1.0)
      });
    }
  }
}

function animateTraffic() {
  ctx.clearRect(0, 0, cWidth, cHeight);

  // 1. Draw Asphalt Texture Background
  ctx.fillStyle = '#212735';
  ctx.fillRect(0, 0, cWidth, cHeight);

  // 2. Draw Lane Dividers (Dashed Lines)
  ctx.save();
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 12]);

  for (let l = 1; l < TOTAL_LANES; l++) {
    const lx = l * LANE_WIDTH;
    ctx.strokeStyle = (l % 4 === 0) ? '#eab308' : '#475569'; // Yellow center lines
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx, cHeight);
    ctx.stroke();
  }
  ctx.restore();

  // 3. Draw Construction Hazard Barricades
  barricades.forEach(b => {
    drawBarricade(b.lane * LANE_WIDTH + 15, b.y);
  });

  // 4. Draw Moving Vehicles
  vehicles.forEach(v => {
    v.y += v.speed * v.dir;

    if (v.dir === 1 && v.y > cHeight + 140) v.y = -120;
    if (v.dir === -1 && v.y < -140) v.y = cHeight + 120;

    drawTopDownVehicle(v);
  });

  animFrameId = requestAnimationFrame(animateTraffic);
}

function drawBarricade(x, y) {
  ctx.save();
  ctx.translate(x, y);

  // Barricade Stand
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 56, 16);

  // Yellow and Black Diagonal Stripes
  ctx.fillStyle = '#eab308';
  ctx.fillRect(2, 2, 52, 12);

  ctx.fillStyle = '#0f172a';
  for (let i = 4; i < 50; i += 10) {
    ctx.beginPath();
    ctx.moveTo(i, 2);
    ctx.lineTo(i + 6, 2);
    ctx.lineTo(i + 2, 14);
    ctx.lineTo(i - 4, 14);
    ctx.fill();
  }
  ctx.restore();
}

function drawTopDownVehicle(v) {
  ctx.save();
  ctx.translate(v.x + v.type.width / 2, v.y + v.type.height / 2);
  if (v.dir === -1) ctx.rotate(Math.PI);

  const w = v.type.width;
  const h = v.type.height;

  // 1. Ground Drop Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 2, -h / 2 + 3, w, h, 8);
  ctx.fill();

  // 2. Dual Realistic Headlight Cones (projecting forward onto road)
  drawHeadlightBeams(w, h);

  // 3. 4 Rubber Tires (wheel arches)
  ctx.fillStyle = '#090d16';
  // Front left & right wheels
  ctx.fillRect(-w / 2 - 2, h / 2 - 18, 3, 10);
  ctx.fillRect(w / 2 - 1, h / 2 - 18, 3, 10);
  // Rear left & right wheels
  ctx.fillRect(-w / 2 - 2, -h / 2 + 8, 3, 10);
  ctx.fillRect(w / 2 - 1, -h / 2 + 8, 3, 10);

  // 4. Main Vehicle Body Chassis
  ctx.fillStyle = v.type.color;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 7);
  ctx.fill();

  // Subtle 3D Edge Shading
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 5. Front Hood Detail & Bumpers
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.fillRect(-w / 2 + 4, h / 2 - 5, w - 8, 3); // front bumper
  ctx.fillRect(-w / 2 + 4, -h / 2 + 2, w - 8, 3); // rear bumper

  // 6. Windshields & Windows (Deep Tinted Glass)
  ctx.fillStyle = '#0d131f';
  // Front Windshield (curved)
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 3, h / 2 - 22, w - 6, 9, 3);
  ctx.fill();

  // Rear Window
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 3, -h / 2 + 10, w - 6, 7, 2);
  ctx.fill();

  // Glass Glare / Reflection streak
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 5, h / 2 - 14);
  ctx.lineTo(-w / 2 + 9, h / 2 - 22);
  ctx.lineTo(-w / 2 + 12, h / 2 - 22);
  ctx.lineTo(-w / 2 + 8, h / 2 - 14);
  ctx.closePath();
  ctx.fill();

  // 7. Roof Panel
  ctx.fillStyle = v.type.color;
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 4, -h / 2 + 19, w - 8, h - 42, 4);
  ctx.fill();

  // 8. Side Mirrors
  ctx.fillStyle = v.type.color;
  ctx.fillRect(-w / 2 - 3, h / 2 - 24, 3, 5);
  ctx.fillRect(w / 2, h / 2 - 24, 3, 5);

  // 9. Type-Specific Details
  if (v.type.isTaxi) {
    // TAXI Roof Bubble Light
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(-9, -4, 18, 9, 3);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 7px sans-serif';
    ctx.fillText('TAXI', -8, 3);

    // Checkered Door Decals
    ctx.fillStyle = '#000000';
    ctx.fillRect(-w / 2 + 1, -6, 2, 4);
    ctx.fillRect(-w / 2 + 1, 2, 2, 4);
    ctx.fillRect(w / 2 - 3, -6, 2, 4);
    ctx.fillRect(w / 2 - 3, 2, 2, 4);
  } else if (v.type.isPolice) {
    // Police Paint: White Roof Center
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-w / 2 + 4, -8, w - 8, 16);

    // High-Intensity Alternating Blue & Red Siren
    const flash = (Date.now() % 220 < 110);
    ctx.fillStyle = flash ? '#ef4444' : '#3b82f6';
    ctx.shadowColor = flash ? '#ef4444' : '#3b82f6';
    ctx.shadowBlur = 14;
    ctx.fillRect(-9, -3, 18, 6);
    ctx.shadowBlur = 0; // reset
  } else if (v.type.isBus) {
    // City Bus Roof Vents & Destination Strip
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-8, -25, 16, 12);
    ctx.fillRect(-8, 10, 16, 12);
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 7px sans-serif';
    ctx.fillText('METRO', -12, 0);
  } else if (v.type.isSports) {
    // Dual Hood Air Scoops
    ctx.fillStyle = '#090d16';
    ctx.fillRect(-7, h / 2 - 12, 4, 6);
    ctx.fillRect(3, h / 2 - 12, 4, 6);

    // Rear Aero Wing / Spoiler
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-w / 2 - 1, -h / 2 - 2, w + 2, 4);
  } else if (v.type.isTruck) {
    // Cargo Container Partition Lines
    ctx.strokeStyle = '#c2410c';
    ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2 + 3, -h / 2 + 5, w - 6, h - 28);
  }

  // 10. Front Headlight Bulbs & Red Tail Lights
  // White Headlight Bulbs
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-w / 2 + 3, h / 2 - 2, 5, 2);
  ctx.fillRect(w / 2 - 8, h / 2 - 2, 5, 2);

  // Red Tail Lights
  ctx.fillStyle = '#ef4444';
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 6;
  ctx.fillRect(-w / 2 + 3, -h / 2, 5, 2);
  ctx.fillRect(w / 2 - 8, -h / 2, 5, 2);
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawHeadlightBeams(w, h) {
  // Left Headlight Cone
  const gradL = ctx.createRadialGradient(-w / 2 + 5, h / 2, 2, -w / 2 + 2, h / 2 + 45, 45);
  gradL.addColorStop(0, 'rgba(254, 240, 138, 0.5)');
  gradL.addColorStop(0.5, 'rgba(254, 240, 138, 0.2)');
  gradL.addColorStop(1, 'rgba(254, 240, 138, 0)');
  ctx.fillStyle = gradL;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 3, h / 2);
  ctx.lineTo(-w / 2 - 14, h / 2 + 55);
  ctx.lineTo(-w / 2 + 14, h / 2 + 55);
  ctx.closePath();
  ctx.fill();

  // Right Headlight Cone
  const gradR = ctx.createRadialGradient(w / 2 - 5, h / 2, 2, w / 2 - 2, h / 2 + 45, 45);
  gradR.addColorStop(0, 'rgba(254, 240, 138, 0.5)');
  gradR.addColorStop(0.5, 'rgba(254, 240, 138, 0.2)');
  gradR.addColorStop(1, 'rgba(254, 240, 138, 0)');
  ctx.fillStyle = gradR;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 3, h / 2);
  ctx.lineTo(w / 2 - 14, h / 2 + 55);
  ctx.lineTo(w / 2 + 14, h / 2 + 55);
  ctx.closePath();
  ctx.fill();
}

// ==================== 20 STEPPING PADS ====================
function buildSteppingPads() {
  const container = document.getElementById('steppingPadsRow');
  if (!container) return;
  container.innerHTML = '';

  for (let i = 0; i < TOTAL_LANES; i++) {
    const pad = document.createElement('div');
    pad.className = 'stepping-pad';
    pad.id = `pad_${i + 1}`;
    pad.style.left = `${(i + 0.5) * LANE_WIDTH}px`;
    pad.style.top = '50%';
    pad.innerHTML = `<span class="stepping-pad-mult">${STEP_MULTIPLIERS[i].toFixed(2)}x</span>`;

    // Direct click on circle to hop forward!
    pad.addEventListener('click', () => {
      if (gameState === 'PLAYING' && i + 1 === currentStep + 1) {
        stepForward();
      }
    });

    container.appendChild(pad);
  }

  updateSteppingPadsHighlight();
}

function updateSteppingPadsHighlight() {
  document.querySelectorAll('.stepping-pad').forEach((pad, idx) => {
    const stepNum = idx + 1;
    pad.className = 'stepping-pad';
    const multSpan = pad.querySelector('.stepping-pad-mult');

    if (stepNum < currentStep) {
      pad.classList.add('cleared');
      if (multSpan) multSpan.textContent = `${STEP_MULTIPLIERS[idx].toFixed(2)}x`;
    } else if (stepNum === currentStep) {
      pad.classList.add('cleared');
      if (multSpan) multSpan.textContent = `${STEP_MULTIPLIERS[idx].toFixed(2)}x`;
    } else if (stepNum === currentStep + 1 && gameState === 'PLAYING') {
      pad.classList.add('next');
      if (multSpan) multSpan.textContent = `${STEP_MULTIPLIERS[idx].toFixed(2)}x`;
    }
  });

  // Roadmap Pills
  document.querySelectorAll('.step-pill').forEach((pill, idx) => {
    const stepNum = idx + 1;
    pill.classList.remove('current', 'completed');
    if (stepNum < currentStep) pill.classList.add('completed');
    else if (stepNum === currentStep) pill.classList.add('current');
  });
}

// ==================== GAMEPLAY LOGIC ====================
function startNewChickenGame() {
  stakeAmount = Math.max(10, parseFloat(document.getElementById('stakeAmountInput')?.value) || 100);

  if (currentUser && currentUser.balance < stakeAmount) {
    showToast('Insufficient balance! Please deposit to play.');
    return;
  }

  // Deduct stake from wallet
  if (currentUser) {
    currentUser.balance = Math.max(0, currentUser.balance - stakeAmount);
    currentUser.balance = Number(currentUser.balance.toFixed(2));
    updateBalanceDisplay(currentUser.balance);
  }

  gameState = 'PLAYING';
  currentStep = 0;

  // Reset Chicken Position on sidewalk
  const chicken = document.getElementById('chickenActor');
  chicken.className = 'chicken-actor';
  chicken.style.left = '20px';
  document.getElementById('chickenMultTag').textContent = '1.00x';

  // Scroll highway back to start
  document.getElementById('lanesTrack').scrollTo({ left: 0, behavior: 'smooth' });

  // Update Main Action Button to show CASHOUT with live starting bet
  const mainBtn = document.getElementById('btnPlayOrCashout');
  mainBtn.className = 'main-play-btn cashout';
  document.getElementById('mainPlayBtnText').textContent = 'CASHOUT';
  document.getElementById('mainPlayBtnSub').textContent = `₹${stakeAmount.toFixed(2)}`;

  // Show dedicated GO Step Forward button
  const stepBtn = document.getElementById('btnStepForward');
  if (stepBtn) stepBtn.style.display = 'flex';
  const nextMultEl = document.getElementById('stepForwardNextMult');
  if (nextMultEl) nextMultEl.textContent = `Next: ${STEP_MULTIPLIERS[0].toFixed(2)}x`;

  updateSteppingPadsHighlight();
  setInputsDisabled(true);
}

function stepForward() {
  if (gameState !== 'PLAYING') return;

  const targetStep = currentStep + 1;
  if (targetStep > 20) return;

  // Survival probability
  const safeChance = {
    easy: 0.96,
    medium: 0.91,
    hard: 0.83,
    hardcore: 0.74
  }[difficulty] || 0.91;

  const isSafe = Math.random() < safeChance;
  const chicken = document.getElementById('chickenActor');
  const pad = document.getElementById(`pad_${targetStep}`);

  // Animate Hop
  chicken.classList.remove('hop');
  void chicken.offsetWidth; // reflow
  chicken.classList.add('hop');

  // Move Chicken Actor to lane
  const targetX = 96 + (targetStep - 0.5) * LANE_WIDTH; // 96px is sidewalk width
  chicken.style.left = `${targetX}px`;

  // Auto-scroll highway track so chicken stays nicely in view
  const track = document.getElementById('lanesTrack');
  const scrollTarget = Math.max(0, (targetStep - 3) * LANE_WIDTH);
  track.scrollTo({ left: scrollTarget, behavior: 'smooth' });

  if (isSafe) {
    // SAFE!
    playSound('hop');
    currentStep = targetStep;
    const curMult = STEP_MULTIPLIERS[currentStep - 1];
    document.getElementById('chickenMultTag').textContent = `${curMult.toFixed(2)}x`;

    // Update Cashout Button
    const liveWin = (stakeAmount * curMult).toFixed(2);
    const mainBtn = document.getElementById('btnPlayOrCashout');
    mainBtn.className = 'main-play-btn cashout';
    document.getElementById('mainPlayBtnText').textContent = 'CASHOUT';
    document.getElementById('mainPlayBtnSub').textContent = `₹${liveWin}`;

    // Update Next Step Multiplier on GO Button
    const nextStep = currentStep + 1;
    const nextMultEl = document.getElementById('stepForwardNextMult');
    if (nextMultEl) {
      if (nextStep <= 20) {
        nextMultEl.textContent = `Next: ${STEP_MULTIPLIERS[nextStep - 1].toFixed(2)}x`;
      } else {
        nextMultEl.textContent = 'JACKPOT 100x';
      }
    }

    updateSteppingPadsHighlight();

    // Check Auto Cashout
    if (autoCashoutTarget > 0 && curMult >= autoCashoutTarget) {
      cashoutChickenGame();
    } else if (currentStep === 20) {
      // Reached other side of highway (100x Jackpot!)
      showToast('🏆 HIGHWAY CROSSED! 100.00x MAX WIN!');
      cashoutChickenGame();
    }
  } else {
    // SQUISH (HIT BY CAR)
    playSound('splat');
    chicken.classList.add('splat');
    if (pad) pad.classList.add('danger');
    triggerGameOver();
  }
}

async function recordChickenOutcome(isWin, mult, step, winAmount, stake) {
  const period = currentChickenPeriod;
  const numWin = parseFloat(winAmount) || 0;
  const numBet = parseFloat(stake) || 0;
  const profit = Number((numWin - numBet).toFixed(2));

  const historyItem = {
    period,
    isWin,
    mult: parseFloat(mult) || 0,
    step,
    difficulty,
    amt: numBet,
    winAmount: numWin,
    profitOrLoss: profit,
    time: new Date().toLocaleTimeString()
  };

  chickenHistoryRecords.unshift(historyItem);
  if (chickenHistoryRecords.length > 50) chickenHistoryRecords.pop();
  localStorage.setItem('diuwin_chicken_history', JSON.stringify(chickenHistoryRecords));

  myChickenRuns.unshift(historyItem);
  if (myChickenRuns.length > 50) myChickenRuns.pop();
  localStorage.setItem('diuwin_chicken_myruns', JSON.stringify(myChickenRuns));

  renderChickenHistoryTables();

  // Send to backend APIs
  try {
    await fetch(`${API_BASE}/api/chicken/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {})
      },
      body: JSON.stringify({
        period,
        betAmount: numBet,
        winAmount: numWin,
        step,
        multiplier: mult,
        isWin,
        difficulty,
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
        gameId: 'chicken',
        gameName: 'Chicken Road',
        period,
        betAmount: numBet,
        winAmount: numWin,
        multiplier: mult,
        choice: `Step #${step} (${mult}x)`,
        details: `${isWin ? 'Crossed Highway' : 'Vehicle Splat'} (${difficulty})`,
        userId: currentUser ? currentUser.id : 'usr_guest_demo'
      })
    });
  } catch (e) {}

  currentChickenPeriod++;
}

function cashoutChickenGame() {
  if (gameState !== 'PLAYING' || currentStep === 0) return;

  playSound('cashout');
  const finalMult = STEP_MULTIPLIERS[currentStep - 1];
  const winAmount = parseFloat((stakeAmount * finalMult).toFixed(2));

  // Credit user balance
  if (currentUser) {
    currentUser.balance += winAmount;
    currentUser.balance = Number(currentUser.balance.toFixed(2));
    updateBalanceDisplay(currentUser.balance);
    localStorage.setItem('diuwin_balance', currentUser.balance);
  }

  // Record outcome to history and backend
  recordChickenOutcome(true, finalMult, currentStep, winAmount, stakeAmount);

  showToast(`🎉 Cashed out ₹${winAmount.toFixed(2)} (${finalMult}x)!`);
  endGame();
}

function triggerGameOver() {
  gameState = 'GAMEOVER';
  // Record loss to history and backend
  recordChickenOutcome(false, 0, currentStep, 0, stakeAmount);

  showToast('💥 SQUISH! Chicken got hit by a car! Better luck next game.');
  endGame();
}

function endGame() {
  gameState = 'IDLE';

  const mainBtn = document.getElementById('btnPlayOrCashout');
  if (mainBtn) {
    mainBtn.className = 'main-play-btn';
    document.getElementById('mainPlayBtnText').textContent = 'PLAY';
    document.getElementById('mainPlayBtnSub').textContent = '[SPACEBAR]';
  }

  // Hide GO button
  const stepBtn = document.getElementById('btnStepForward');
  if (stepBtn) stepBtn.style.display = 'none';

  setInputsDisabled(false);

  // Return chicken to sidewalk after delay
  setTimeout(() => {
    if (gameState === 'IDLE') {
      const chicken = document.getElementById('chickenActor');
      if (chicken) {
        chicken.className = 'chicken-actor';
        chicken.style.left = '20px';
      }
      const multTag = document.getElementById('chickenMultTag');
      if (multTag) multTag.textContent = '1.00x';
      currentStep = 0;
      updateSteppingPadsHighlight();
      document.getElementById('lanesTrack')?.scrollTo({ left: 0, behavior: 'smooth' });
    }
  }, 2400);
}

// ==================== UI CONTROLS & EVENT LISTENERS ====================
function updateStakeDisplay() {
  const input = document.getElementById('stakeAmountInput');
  if (input) input.value = stakeAmount;
}

function setInputsDisabled(disabled) {
  document.getElementById('stakeAmountInput').disabled = disabled;
  document.getElementById('btnStakeMin').disabled = disabled;
  document.getElementById('btnStakeHalf').disabled = disabled;
  document.getElementById('btnStakeDouble').disabled = disabled;
  document.getElementById('btnStakeMax').disabled = disabled;
  document.querySelectorAll('.s-chip').forEach(c => c.disabled = disabled);
  document.querySelectorAll('.diff-tab').forEach(t => t.disabled = disabled);
}

function setupUIEventListeners() {
  // Navigation tabs: Play & History
  document.getElementById('tabPlay')?.addEventListener('click', () => {
    document.getElementById('tabPlay').classList.add('active');
    document.getElementById('tabHistory').classList.remove('active');
    document.getElementById('chickenHistoryModal')?.classList.remove('show');
  });

  document.getElementById('tabHistory')?.addEventListener('click', () => {
    document.getElementById('tabHistory').classList.add('active');
    document.getElementById('tabPlay').classList.remove('active');
    renderChickenHistoryTables();
    document.getElementById('chickenHistoryModal')?.classList.add('show');
  });

  document.getElementById('btnCloseChickenHistory')?.addEventListener('click', () => {
    document.getElementById('chickenHistoryModal')?.classList.remove('show');
    document.getElementById('tabPlay')?.classList.add('active');
    document.getElementById('tabHistory')?.classList.remove('active');
  });

  document.getElementById('chickenHistoryModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'chickenHistoryModal') {
      document.getElementById('chickenHistoryModal').classList.remove('show');
      document.getElementById('tabPlay')?.classList.add('active');
      document.getElementById('tabHistory')?.classList.remove('active');
    }
  });

  document.getElementById('btnSubtabAllRounds')?.addEventListener('click', () => {
    document.getElementById('btnSubtabAllRounds').classList.add('active');
    document.getElementById('btnSubtabMyRuns').classList.remove('active');
    document.getElementById('chickenAllRoundsWrap').style.display = 'block';
    document.getElementById('chickenMyRunsWrap').style.display = 'none';
  });

  document.getElementById('btnSubtabMyRuns')?.addEventListener('click', () => {
    document.getElementById('btnSubtabMyRuns').classList.add('active');
    document.getElementById('btnSubtabAllRounds').classList.remove('active');
    document.getElementById('chickenAllRoundsWrap').style.display = 'none';
    document.getElementById('chickenMyRunsWrap').style.display = 'block';
    renderChickenHistoryTables();
  });

  // Navigation back to lobby
  document.getElementById('btnBackToLobby')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.getElementById('brandLogoHome')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  // Sound toggle
  document.getElementById('btnSoundToggle')?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    const icon = document.querySelector('#btnSoundToggle i');
    if (icon) icon.className = soundEnabled ? 'fa fa-volume-up' : 'fa fa-volume-off';
    showToast(soundEnabled ? 'Sound Enabled' : 'Sound Muted');
  });

  // Fullscreen
  document.getElementById('btnFullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Dedicated Step Forward (GO) Button
  document.getElementById('btnStepForward')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (gameState === 'PLAYING') {
      stepForward();
    }
  });

  // Main Action: PLAY / CASHOUT
  document.getElementById('btnPlayOrCashout')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (gameState === 'IDLE') {
      startNewChickenGame();
    } else if (gameState === 'PLAYING') {
      cashoutChickenGame();
    }
  });

  // Clicking anywhere on Highway Road to step forward
  document.getElementById('lanesTrack')?.addEventListener('click', () => {
    if (gameState === 'PLAYING') {
      stepForward();
    }
  });

  document.getElementById('chickenActor')?.addEventListener('click', () => {
    if (gameState === 'PLAYING') {
      stepForward();
    }
  });

  // Keyboard handler: Spacebar / Enter / ArrowRight / ArrowUp steps forward!
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight' || e.code === 'ArrowUp') && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      if (gameState === 'IDLE') {
        startNewChickenGame();
      } else if (gameState === 'PLAYING') {
        stepForward();
      }
    }
  });

  // Stake Controls
  const input = document.getElementById('stakeAmountInput');
  document.getElementById('btnStakeMin')?.addEventListener('click', () => {
    if (gameState === 'PLAYING') return;
    stakeAmount = 10;
    updateStakeDisplay();
  });

  document.getElementById('btnStakeHalf')?.addEventListener('click', () => {
    if (gameState === 'PLAYING') return;
    stakeAmount = Math.max(10, Math.floor(stakeAmount / 2));
    updateStakeDisplay();
  });

  document.getElementById('btnStakeDouble')?.addEventListener('click', () => {
    if (gameState === 'PLAYING') return;
    stakeAmount = Math.min(10000, stakeAmount * 2);
    updateStakeDisplay();
  });

  document.getElementById('btnStakeMax')?.addEventListener('click', () => {
    if (gameState === 'PLAYING') return;
    stakeAmount = 10000;
    updateStakeDisplay();
  });

  input?.addEventListener('input', (e) => {
    stakeAmount = Math.max(10, Math.min(10000, parseFloat(e.target.value) || 10));
  });

  // Stake Presets
  document.querySelectorAll('.s-chip').forEach(c => {
    c.addEventListener('click', () => {
      if (gameState === 'PLAYING') return;
      document.querySelectorAll('.s-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      stakeAmount = parseFloat(c.dataset.amt);
      updateStakeDisplay();
    });
  });

  // Difficulty Tabs
  document.querySelectorAll('.diff-tab').forEach(t => {
    t.addEventListener('click', () => {
      if (gameState === 'PLAYING') return;
      document.querySelectorAll('.diff-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      difficulty = t.dataset.diff;
      spawnVehicles();
      showToast(`Difficulty set to ${difficulty.toUpperCase()}`);
    });
  });

  // Auto Cashout Dropdown
  document.getElementById('autoCashoutSelect')?.addEventListener('change', (e) => {
    autoCashoutTarget = parseFloat(e.target.value) || 0;
    if (autoCashoutTarget > 0) {
      showToast(`Auto Cashout set at ${autoCashoutTarget.toFixed(2)}x`);
    } else {
      showToast('Auto Cashout turned OFF');
    }
  });

  // Turbo Mode Toggle
  document.getElementById('btnTurboToggle')?.addEventListener('click', () => {
    turboMode = !turboMode;
    const txt = document.getElementById('turboStatusText');
    if (txt) txt.textContent = turboMode ? 'ON' : 'OFF';
    spawnVehicles();
    showToast(`Turbo Mode: ${turboMode ? 'ON' : 'OFF'}`);
  });
}
