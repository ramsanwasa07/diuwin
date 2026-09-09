const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'diuwin_lobby_demo')));
app.use('/diuwin_lobby_demo', express.static(path.join(__dirname, 'diuwin_lobby_demo')));
app.use(express.static(__dirname));

// Data persistence directory - uses hidden .data directory to prevent VS Code Live Server from auto-reloading
const DATA_DIR = path.join(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const LEGACY_DB_FILE = path.join(__dirname, 'data', 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial DB template
const defaultDb = {
  users: [
    {
      id: 'usr_guest_demo',
      phone: '9876543210',
      passwordHash: hashPassword('123456'),
      balance: 1000.00,
      vipLevel: 1,
      name: 'Player Demo',
      token: 'token_guest_demo',
      createdAt: new Date().toISOString()
    }
  ],
  transactions: [
    {
      id: 'tx_init_1',
      userId: 'usr_guest_demo',
      type: 'WELCOME_BONUS',
      amount: 1000,
      balanceAfter: 1000,
      status: 'SUCCESS',
      description: 'Welcome Bonus Gift',
      createdAt: new Date().toISOString()
    }
  ],
  bets: [],
  liveWins: [
    { id: 'w1', user: 'Player R***', avatar: 'R', game: 'Lucky Spin', amount: 1280, time: 'Just now' },
    { id: 'w2', user: 'Player A***', avatar: 'A', game: 'Golden 777', amount: 3450, time: '1m ago' },
    { id: 'w3', user: 'Player K***', avatar: 'K', game: 'Demo Lottery', amount: 2450, time: '2m ago' },
    { id: 'w4', user: 'Player M***', avatar: 'M', game: 'Rocket Dash', amount: 5600, time: '3m ago' },
    { id: 'w5', user: 'Player V***', avatar: 'V', game: 'Star Slots', amount: 920, time: '4m ago' },
    { id: 'w6', user: 'Player S***', avatar: 'S', game: 'Ocean Catch', amount: 1800, time: '5m ago' }
  ]
};

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken() {
  return 'tok_' + crypto.randomBytes(16).toString('hex');
}

function ensureGameHistoriesAndPeriods(loaded) {
  if (!loaded.gameHistories) {
    loaded.gameHistories = {
      wingo: [],
      k3: [],
      '5d': [],
      aviator: [],
      mines: [],
      chicken: []
    };
  }
  if (!loaded.periods) {
    loaded.periods = {
      wingo: 1,
      k3: 1,
      '5d': 1,
      aviator: 1,
      mines: 1,
      chicken: 1
    };
  }

  // Populate from masterHistory if masterHistory exists and gameHistories are empty
  if (Array.isArray(loaded.masterHistory) && loaded.masterHistory.length > 0) {
    ['wingo', 'k3', '5d', 'aviator', 'mines', 'chicken'].forEach(gId => {
      const mhRecords = loaded.masterHistory.filter(m => m.gameId === gId);
      if (mhRecords.length > 0) {
        const maxPeriod = Math.max(...mhRecords.map(m => (typeof m.period === 'number' ? m.period : parseInt(m.period)) || 1));
        if (maxPeriod >= loaded.periods[gId]) {
          loaded.periods[gId] = maxPeriod + 1;
        }
        if (!loaded.gameHistories[gId] || loaded.gameHistories[gId].length === 0) {
          if (gId === 'aviator') {
            loaded.gameHistories.aviator = mhRecords.slice(0, 30).map(m => {
              const match = String(m.result).match(/([0-9.]+)x/);
              const mult = match ? parseFloat(match[1]) : 1.5;
              return { period: m.period, crashedAt: mult, totalBet: m.totalBet || 0, totalPayout: m.totalPayout || 0, netHouseProfit: m.netHouseProfit || 0, timestamp: m.timestamp };
            });
          } else if (gId === 'wingo') {
            loaded.gameHistories.wingo = mhRecords.slice(0, 30).map(m => {
              const numMatch = String(m.result).match(/Ball #(\d+)/);
              const num = numMatch ? parseInt(numMatch[1]) : Math.floor(Math.random() * 10);
              const size = num >= 5 ? 'Big' : 'Small';
              const color = (num === 0) ? 'split-violet-red' : ((num === 5) ? 'split-violet-green' : ([2, 4, 6, 8].includes(num) ? 'red' : 'green'));
              return { period: m.period, num, number: num, size, color, timestamp: m.timestamp };
            });
          } else if (gId === 'k3') {
            loaded.gameHistories.k3 = mhRecords.slice(0, 30).map(m => {
              const sumMatch = String(m.result).match(/= (\d+)/);
              const sum = sumMatch ? parseInt(sumMatch[1]) : 10;
              const diceMatch = String(m.result).match(/\[(.*?)\]/);
              const dice = diceMatch ? diceMatch[1].split(',').map(n => parseInt(n.trim())) : [1, 2, 3];
              return { period: m.period, dice, sum, size: sum >= 11 ? 'Big' : 'Small', parity: sum % 2 === 1 ? 'Odd' : 'Even', timestamp: m.timestamp };
            });
          } else if (gId === '5d') {
            loaded.gameHistories['5d'] = mhRecords.slice(0, 30).map(m => {
              const sumMatch = String(m.result).match(/Sum (\d+)/);
              const sum = sumMatch ? parseInt(sumMatch[1]) : 22;
              const digitsMatch = String(m.result).match(/\[(.*?)\]/);
              const digits = digitsMatch ? digitsMatch[1].split(',').map(n => parseInt(n.trim())) : [1, 2, 3, 4, 5];
              return { period: m.period, digits, sum, size: sum >= 23 ? 'Big' : 'Small', parity: sum % 2 === 1 ? 'Odd' : 'Even', timestamp: m.timestamp };
            });
          } else if (gId === 'mines') {
            loaded.gameHistories.mines = mhRecords.slice(0, 20).map(m => {
              const isWin = String(m.result).includes('Cashed out');
              const multMatch = String(m.result).match(/at ([0-9.]+)x/);
              const mult = multMatch ? parseFloat(multMatch[1]) : (isWin ? 1.45 : 1.0);
              return { period: m.period, isWin, mult, mines: 5, amt: m.totalBet || 100, winAmount: m.totalPayout || 0, profitOrLoss: (m.totalPayout || 0) - (m.totalBet || 100), timestamp: m.timestamp };
            });
          } else if (gId === 'chicken') {
            loaded.gameHistories.chicken = mhRecords.slice(0, 20).map(m => {
              const isWin = String(m.result).includes('Crossed');
              const multMatch = String(m.result).match(/([0-9.]+)x/);
              const mult = multMatch ? parseFloat(multMatch[1]) : (isWin ? 1.55 : 1.0);
              const stepMatch = String(m.result).match(/Step #(\d+)/);
              const step = stepMatch ? parseInt(stepMatch[1]) : 3;
              return { period: m.period, isWin, mult, step, difficulty: 'medium', amt: m.totalBet || 100, winAmount: m.totalPayout || 0, profitOrLoss: (m.totalPayout || 0) - (m.totalBet || 100), timestamp: m.timestamp };
            });
          }
        }
      }
    });
  }

  // Fallback defaults if empty
  if (!loaded.gameHistories.mines || loaded.gameHistories.mines.length === 0) {
    loaded.gameHistories.mines = [
      { period: 102, isWin: true, mult: 2.12, mines: 5, amt: 100, winAmount: 212, profitOrLoss: 112, gemsFound: 4, timestamp: new Date(Date.now() - 300000).toISOString() },
      { period: 101, isWin: false, mult: 1.18, mines: 5, amt: 100, winAmount: 0, profitOrLoss: -100, gemsFound: 1, timestamp: new Date(Date.now() - 600000).toISOString() },
      { period: 100, isWin: true, mult: 1.55, mines: 5, amt: 200, winAmount: 310, profitOrLoss: 110, gemsFound: 3, timestamp: new Date(Date.now() - 900000).toISOString() }
    ];
  }
  if (!loaded.gameHistories.chicken || loaded.gameHistories.chicken.length === 0) {
    loaded.gameHistories.chicken = [
      { period: 102, isWin: true, mult: 2.55, step: 7, difficulty: 'medium', amt: 100, winAmount: 255, profitOrLoss: 155, timestamp: new Date(Date.now() - 300000).toISOString() },
      { period: 101, isWin: false, mult: 1.20, step: 2, difficulty: 'medium', amt: 100, winAmount: 0, profitOrLoss: -100, timestamp: new Date(Date.now() - 600000).toISOString() },
      { period: 100, isWin: true, mult: 1.80, step: 5, difficulty: 'medium', amt: 200, winAmount: 360, profitOrLoss: 160, timestamp: new Date(Date.now() - 900000).toISOString() }
    ];
  }
}

function loadDb() {
  let loaded = null;
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      loaded = JSON.parse(data);
    } else if (fs.existsSync(LEGACY_DB_FILE)) {
      const data = fs.readFileSync(LEGACY_DB_FILE, 'utf8');
      loaded = JSON.parse(data);
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(loaded, null, 2), 'utf8');
      } catch (e) {}
    }
  } catch (err) {
    console.error('Error loading db.json, resetting to defaults:', err.message);
  }
  if (!loaded) {
    loaded = JSON.parse(JSON.stringify(defaultDb));
  }
  if (!loaded.users) loaded.users = [...defaultDb.users];
  if (!loaded.transactions) loaded.transactions = [...defaultDb.transactions];
  if (!loaded.bets) loaded.bets = [];
  if (!loaded.liveWins) loaded.liveWins = [...defaultDb.liveWins];
  if (!loaded.masterHistory) loaded.masterHistory = [];

  ensureGameHistoriesAndPeriods(loaded);
  return loaded;
}

let db = loadDb();

let saveDbTimeout = null;
function saveDb(data = db, immediate = false) {
  if (immediate) {
    if (saveDbTimeout) {
      clearTimeout(saveDbTimeout);
      saveDbTimeout = null;
    }
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving db.json:', err.message);
    }
    return;
  }

  if (saveDbTimeout) return;
  saveDbTimeout = setTimeout(() => {
    saveDbTimeout = null;
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving db.json:', err.message);
    }
  }, 1000);
}

// User resolution helper (supports token, body/query userId, or demo guest)
function getAuthenticatedOrGuestUser(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const user = db.users.find(u => u.token === token);
    if (user) return user;
  }
  const requestedUserId = req.query?.userId || req.body?.userId;
  if (requestedUserId) {
    const user = db.users.find(u => u.id === requestedUserId);
    if (user) return user;
  }
  return db.users.find(u => u.id === 'usr_guest_demo') || db.users[0] || {
    id: 'usr_guest_demo',
    phone: '9876543210',
    balance: 1000,
    name: 'Player Demo',
    vipLevel: 1
  };
}

// Optional Auth Middleware (attaches guest demo user if unauthenticated)
function optionalAuthMiddleware(req, res, next) {
  req.user = getAuthenticatedOrGuestUser(req);
  next();
}

// Strict Auth Middleware (for private wallet & profile routes)
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  const token = authHeader.split(' ')[1];
  const user = db.users.find(u => u.token === token);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session token' });
  }
  req.user = user;
  next();
}

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/auth/register', (req, res) => {
  const { phone, password, inviteCode } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ success: false, message: 'Phone and password are required' });
  }
  if (phone.length < 6 || password.length < 4) {
    return res.status(400).json({ success: false, message: 'Invalid phone or password length' });
  }

  const existing = db.users.find(u => u.phone === phone);
  if (existing) {
    return res.status(400).json({ success: false, message: 'User with this phone number already registered' });
  }

  const newUser = {
    id: 'usr_' + Date.now(),
    phone,
    passwordHash: hashPassword(password),
    balance: 500.00, // ₹500 welcome bonus
    vipLevel: 1,
    name: 'Player ' + phone.slice(-4),
    token: generateToken(),
    inviteCode: inviteCode || 'DIUWINVIP',
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);

  // Welcome bonus transaction
  db.transactions.unshift({
    id: 'tx_' + Date.now(),
    userId: newUser.id,
    type: 'SIGNUP_BONUS',
    amount: 500,
    balanceAfter: 500,
    status: 'SUCCESS',
    description: '₹500 Signup Bonus Claimed',
    createdAt: new Date().toISOString()
  });

  saveDb();

  return res.json({
    success: true,
    message: 'Registered successfully! ₹500 bonus credited.',
    user: {
      id: newUser.id,
      phone: newUser.phone,
      name: newUser.name,
      balance: newUser.balance,
      vipLevel: newUser.vipLevel,
      token: newUser.token
    }
  });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ success: false, message: 'Phone and password are required' });
  }

  const user = db.users.find(u => u.phone === phone && u.passwordHash === hashPassword(password));
  if (!user) {
    return res.status(401).json({ success: false, message: 'Incorrect phone number or password' });
  }

  user.token = generateToken();
  saveDb();

  return res.json({
    success: true,
    message: 'Login successful!',
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      balance: user.balance,
      vipLevel: user.vipLevel,
      token: user.token
    }
  });
});

// Send OTP for Forgot Password / Phone verification
app.post('/api/auth/send-otp', (req, res) => {
  const { phone } = req.body;
  if (!phone || phone.length < 10) {
    return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number' });
  }

  return res.json({
    success: true,
    message: `Verification code sent to +91 ${phone}`,
    otp: '123456'
  });
});

// Reset / Forgot Password
app.post('/api/auth/reset-password', (req, res) => {
  const { phone, otp, newPassword } = req.body;
  if (!phone || !newPassword) {
    return res.status(400).json({ success: false, message: 'Mobile number and new password are required' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ success: false, message: 'Password must be at least 4 characters' });
  }

  const user = db.users.find(u => u.phone === phone);
  if (!user) {
    return res.status(404).json({ success: false, message: 'No registered account found with this mobile number' });
  }

  user.passwordHash = hashPassword(newPassword);
  user.token = generateToken();
  saveDb();

  return res.json({
    success: true,
    message: 'Password reset successfully! You can now log in with your new password.',
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name
    }
  });
});

// Quick Guest Session (Instant frictionless play)
app.post('/api/auth/guest', (req, res) => {
  let guest = db.users.find(u => u.id === 'usr_guest_demo');
  if (!guest) {
    guest = {
      id: 'usr_guest_demo',
      phone: '9876543210',
      passwordHash: hashPassword('123456'),
      balance: 1000.00,
      vipLevel: 1,
      name: 'Player Demo',
      token: generateToken(),
      createdAt: new Date().toISOString()
    };
    db.users.push(guest);
  }
  guest.token = generateToken();
  saveDb();

  return res.json({
    success: true,
    message: 'Guest session started',
    token: guest.token,
    user: {
      id: guest.id,
      phone: guest.phone,
      name: guest.name,
      balance: guest.balance,
      vipLevel: guest.vipLevel,
      token: guest.token
    }
  });
});

// Get User Profile
app.get('/api/user/profile', authMiddleware, (req, res) => {
  const user = req.user;
  const userBets = db.bets.filter(b => b.userId === user.id);
  const totalBets = userBets.length;
  const totalWon = userBets.reduce((sum, b) => sum + (b.winAmount || 0), 0);

  return res.json({
    success: true,
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      balance: Number(user.balance.toFixed(2)),
      vipLevel: user.vipLevel,
      stats: {
        totalBets,
        totalWon: Number(totalWon.toFixed(2))
      }
    }
  });
});

// ==================== WALLET ROUTES ====================

// Deposit / Recharge via UPI QR Scanner & Gateway
app.post('/api/wallet/deposit', authMiddleware, (req, res) => {
  const { amount, method, utrNumber } = req.body;
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount < 100) {
    return res.status(400).json({ success: false, message: 'Minimum recharge amount is ₹100' });
  }

  const user = req.user;
  user.balance += numAmount;

  // Upgrade VIP level if total balance crosses thresholds
  if (user.balance >= 5000) user.vipLevel = 3;
  else if (user.balance >= 2000) user.vipLevel = 2;

  const cleanUtr = utrNumber ? String(utrNumber).trim() : ('UTR' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 9000 + 1000));

  const tx = {
    id: 'tx_' + Date.now(),
    userId: user.id,
    type: 'DEPOSIT',
    method: method || 'UPI Scanner / QR',
    utrNumber: cleanUtr,
    amount: numAmount,
    balanceAfter: Number(user.balance.toFixed(2)),
    status: 'SUCCESS',
    description: `UPI Recharge ₹${numAmount} (UTR: ${cleanUtr})`,
    createdAt: new Date().toISOString()
  };

  db.transactions.unshift(tx);
  saveDb();

  return res.json({
    success: true,
    message: `Recharge of ₹${numAmount} successful via UPI! UTR: ${cleanUtr}`,
    newBalance: Number(user.balance.toFixed(2)),
    transaction: tx
  });
});

// Withdraw
app.post('/api/wallet/withdraw', authMiddleware, (req, res) => {
  const { amount, upiOrBank } = req.body;
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount < 100) {
    return res.status(400).json({ success: false, message: 'Minimum withdrawal is ₹100' });
  }

  const user = req.user;
  if (user.balance < numAmount) {
    return res.status(400).json({ success: false, message: 'Insufficient balance' });
  }

  user.balance -= numAmount;

  const tx = {
    id: 'tx_' + Date.now(),
    userId: user.id,
    type: 'WITHDRAW',
    destination: upiOrBank || 'Bank Account',
    amount: numAmount,
    balanceAfter: Number(user.balance.toFixed(2)),
    status: 'COMPLETED',
    description: `Withdrawal of ₹${numAmount} to ${upiOrBank || 'UPI'}`,
    createdAt: new Date().toISOString()
  };

  db.transactions.unshift(tx);
  saveDb();

  return res.json({
    success: true,
    message: `Withdrawal request for ₹${numAmount} processed successfully!`,
    newBalance: Number(user.balance.toFixed(2)),
    transaction: tx
  });
});

// Transaction History
app.get('/api/wallet/transactions', authMiddleware, (req, res) => {
  const user = req.user;
  const userTxs = db.transactions.filter(t => t.userId === user.id).slice(0, 30);
  return res.json({
    success: true,
    transactions: userTxs
  });
});

// ==================== ACTIVITY & PROMOTION ROUTES ====================

// Daily Attendance Check-In
app.post('/api/activity/checkin', authMiddleware, (req, res) => {
  const user = req.user;
  const bonus = 50.00; // Daily check-in bonus
  user.balance += bonus;
  user.balance = Number(user.balance.toFixed(2));

  const tx = {
    id: 'tx_checkin_' + Date.now(),
    userId: user.id,
    type: 'DAILY_CHECKIN',
    amount: bonus,
    balanceAfter: user.balance,
    status: 'SUCCESS',
    description: 'Daily Attendance Check-In Reward',
    createdAt: new Date().toISOString()
  };

  db.transactions.unshift(tx);
  saveDb();

  return res.json({
    success: true,
    bonus,
    newBalance: user.balance,
    message: `🎉 Daily attendance checked in! +₹${bonus} credited to your wallet.`
  });
});

// Claim Referral Commission
app.post('/api/promotion/claim', authMiddleware, (req, res) => {
  const user = req.user;
  const commission = 320.50; // Today's pending referral commission
  user.balance += commission;
  user.balance = Number(user.balance.toFixed(2));

  const tx = {
    id: 'tx_comm_' + Date.now(),
    userId: user.id,
    type: 'REFERRAL_COMMISSION',
    amount: commission,
    balanceAfter: user.balance,
    status: 'SUCCESS',
    description: 'Referral Team Commission Payout',
    createdAt: new Date().toISOString()
  };

  db.transactions.unshift(tx);
  saveDb();

  return res.json({
    success: true,
    amount: commission,
    newBalance: user.balance,
    message: `🎉 Commission of ₹${commission} transferred to main balance!`
  });
});

// Redeem Gift Code
app.post('/api/activity/redeem-gift', authMiddleware, (req, res) => {
  const user = req.user;
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ success: false, message: 'Please enter a gift code' });
  }

  const giftCodes = {
    'DIUWIN100': 100,
    'DIUWIN888': 200,
    'LUCKY2026': 150,
    'VIPGIFT': 300
  };

  const cleanCode = code.trim().toUpperCase();
  const bonus = giftCodes[cleanCode] || 50;

  user.balance += bonus;
  user.balance = Number(user.balance.toFixed(2));

  const tx = {
    id: 'tx_gift_' + Date.now(),
    userId: user.id,
    type: 'GIFT_REDEEM',
    amount: bonus,
    balanceAfter: user.balance,
    status: 'SUCCESS',
    description: `Gift Code (${cleanCode}) Bonus`,
    createdAt: new Date().toISOString()
  };

  db.transactions.unshift(tx);
  saveDb();

  return res.json({
    success: true,
    bonus,
    newBalance: user.balance,
    message: `🎁 Gift code redeemed! ₹${bonus} added to your balance.`
  });
});

// ==================== CASINO GAME ENGINE ====================

// Games List & Configurations matching diuwin.art
const GAMES = [
  { id: 'aviator', name: 'Aviator', icon: '🚀', rtp: '97.04%', cat: 'original', minBet: 10, maxBet: 50000 },
  { id: 'mines', name: 'Mines', icon: '💎', rtp: '97.76%', cat: 'slots', minBet: 10, maxBet: 50000 },
  { id: 'chicken', name: 'Chicken Road', icon: '🐔', rtp: '96.79%', cat: 'original', minBet: 10, maxBet: 50000 },
  { id: 'wingo', name: 'WinGo 1Min', icon: '🎟️', rtp: '96.36%', cat: 'lottery', minBet: 10, maxBet: 50000 },
  { id: 'k3', name: 'K3 3Min', icon: '🎲', rtp: '96.60%', cat: 'lottery', minBet: 10, maxBet: 50000 },
  { id: '5d', name: '5D Lottery', icon: '🎱', rtp: '96.49%', cat: 'lottery', minBet: 10, maxBet: 50000 },
  { id: 'lucky_spin', name: 'Wheel of Fortune', icon: '🎡', rtp: '97.80%', cat: 'hot', minBet: 10, maxBet: 50000 },
  { id: 'golden_777', name: 'Golden 777', icon: '🎰', rtp: '96.79%', cat: 'slots', minBet: 10, maxBet: 50000 },
  { id: 'star_slots', name: 'Star Slots', icon: '⭐', rtp: '97.76%', cat: 'slots', minBet: 10, maxBet: 50000 },
  { id: 'ocean_catch', name: 'Ocean Catch', icon: '🐠', rtp: '96.88%', cat: 'fishing', minBet: 20, maxBet: 50000 }
];

// DiuWin official API alias endpoint
app.get('/api/webapi/GetUserInfo', (req, res) => {
  const authHeader = req.headers.authorization;
  let user = db.users[0];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const found = db.users.find(u => u.token === token);
    if (found) user = found;
  }
  return res.json({
    status: true,
    data: {
      id_user: user.id,
      phone_user: user.phone,
      money_user: Number(user.balance.toFixed(2)),
      vip_user: user.vipLevel,
      name_user: user.name
    }
  });
});

app.get('/api/games/list', (req, res) => {
  const cat = req.query.cat;
  const list = cat && cat !== 'all' ? GAMES.filter(g => g.cat === cat || (cat === 'hot' && ['hot', 'slots'].includes(g.cat))) : GAMES;
  return res.json({ success: true, games: list });
});

// Live Winners Stream
app.get('/api/games/live-wins', (req, res) => {
  if (Math.random() > 0.35) {
    const randomGame = GAMES[Math.floor(Math.random() * GAMES.length)];
    const suffixes = ['KGG', 'LKM', 'CTR', 'NKE', 'UTD', 'FCB', 'RMA', 'PSG', 'BAY', 'ARS', 'LIV', 'CHE', 'MCI'];
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    const amounts = [288, 388, 588, 888, 1288, 1588, 1888, 2488, 3888, 5888];
    const amount = amounts[Math.floor(Math.random() * amounts.length)] + '.' + Math.floor(Math.random() * 90 + 10);

    db.liveWins.unshift({
      id: 'w_' + Date.now(),
      user: `Mem***${s}`,
      avatar: s.charAt(0),
      game: randomGame.name,
      amount: parseFloat(amount),
      time: 'Just now'
    });
    if (db.liveWins.length > 30) db.liveWins.pop();
  }

  return res.json({ success: true, wins: db.liveWins.slice(0, 15) });
});

// Play / Bet Endpoint
app.post('/api/games/play', authMiddleware, (req, res) => {
  const { gameId, betAmount, choice, autoCashout } = req.body;
  const numBet = parseFloat(betAmount);

  if (isNaN(numBet) || numBet <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid bet amount' });
  }

  const game = GAMES.find(g => g.id === gameId) || GAMES[0];
  const user = req.user;

  if (user.balance < numBet) {
    return res.status(400).json({ success: false, message: 'Insufficient balance. Please recharge!' });
  }

  // Deduct bet
  user.balance -= numBet;

  let multiplier = 0;
  let winAmount = 0;
  let outcomeDetails = {};

  // Engine Calculation
  if (game.id === 'aviator' || game.id === 'chicken' || game.id === 'rocket_dash') {
    // Crash game
    const r = Math.random();
    const crashMultiplier = r < 0.06 ? 1.00 : parseFloat((0.96 / (1 - r)).toFixed(2));
    const target = parseFloat(autoCashout || choice || 1.80);

    if (target <= crashMultiplier) {
      multiplier = target;
      winAmount = Number((numBet * multiplier).toFixed(2));
      outcomeDetails = { cashedOut: true, cashoutAt: target, crashedAt: crashMultiplier };
    } else {
      multiplier = 0;
      winAmount = 0;
      outcomeDetails = { cashedOut: false, cashoutAt: target, crashedAt: crashMultiplier };
    }
  } else if (game.id === 'wingo' || game.id === 'demo_lottery') {
    // WinGo 1Min
    const luckyNumber = Math.floor(Math.random() * 10);
    const luckyColor = (luckyNumber === 0 || luckyNumber === 5) ? 'violet' : (luckyNumber % 2 === 1 ? 'green' : 'red');
    outcomeDetails = { luckyNumber, luckyColor };

    if (choice === luckyColor) {
      multiplier = luckyColor === 'violet' ? 4.5 : 2.0;
    } else if (parseInt(choice) === luckyNumber) {
      multiplier = 9.0;
    } else if ((choice === 'big' && luckyNumber >= 5) || (choice === 'small' && luckyNumber < 5)) {
      multiplier = 2.0;
    } else {
      multiplier = 0;
    }
    winAmount = Number((numBet * multiplier).toFixed(2));
  } else if (game.id === 'k3') {
    // K3 3-Dice Lottery
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const d3 = Math.floor(Math.random() * 6) + 1;
    const sum = d1 + d2 + d3;
    outcomeDetails = { dice: [d1, d2, d3], sum };

    if ((choice === 'big' && sum >= 11) || (choice === 'small' && sum <= 10)) {
      multiplier = 1.96;
    } else if (choice === 'odd' && sum % 2 === 1) {
      multiplier = 1.96;
    } else if (choice === 'even' && sum % 2 === 0) {
      multiplier = 1.96;
    } else if (parseInt(choice) === sum) {
      multiplier = 8.5;
    } else {
      multiplier = Math.random() > 0.5 ? 1.96 : 0;
    }
    winAmount = Number((numBet * multiplier).toFixed(2));
  } else if (game.id === '5d') {
    // 5D Lottery
    const balls = [
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10)
    ];
    outcomeDetails = { balls };
    multiplier = Math.random() > 0.48 ? 2.0 : 0;
    winAmount = Number((numBet * multiplier).toFixed(2));
  } else if (game.id === 'lucky_spin') {
    // Wheel of Fortune
    const segments = [
      { mult: 0, label: '0x', angle: 22.5 },
      { mult: 1.2, label: '1.2x', angle: 67.5 },
      { mult: 0.5, label: '0.5x', angle: 112.5 },
      { mult: 2.0, label: '2.0x', angle: 157.5 },
      { mult: 0, label: 'Miss', angle: 202.5 },
      { mult: 3.0, label: '3.0x', angle: 247.5 },
      { mult: 1.5, label: '1.5x', angle: 292.5 },
      { mult: 5.0, label: '5.0x Mega', angle: 337.5 }
    ];
    const picked = segments[Math.floor(Math.random() * segments.length)];
    multiplier = picked.mult;
    winAmount = Number((numBet * multiplier).toFixed(2));
    outcomeDetails = {
      label: picked.label,
      targetAngle: 360 * 5 + picked.angle
    };
  } else {
    // Mines & Slots
    const symbols = ['🍒', '🍋', '🍇', '🔔', '⭐', '7️⃣'];
    const r1 = symbols[Math.floor(Math.random() * symbols.length)];
    const r2 = symbols[Math.floor(Math.random() * symbols.length)];
    const r3 = symbols[Math.floor(Math.random() * symbols.length)];
    outcomeDetails = { reels: [r1, r2, r3] };

    if (r1 === '7️⃣' && r2 === '7️⃣' && r3 === '7️⃣') multiplier = 25.0;
    else if (r1 === r2 && r2 === r3) multiplier = 8.0;
    else if (r1 === r2 || r2 === r3 || r1 === r3) multiplier = 1.5;
    else multiplier = 0;

    winAmount = Number((numBet * multiplier).toFixed(2));
  }

  // Credit winnings
  user.balance += winAmount;
  user.balance = Number(user.balance.toFixed(2));

  const betRecord = {
    id: 'bet_' + Date.now(),
    userId: user.id,
    gameId: game.id,
    gameName: game.name,
    betAmount: numBet,
    multiplier,
    winAmount,
    profitOrLoss: Number((winAmount - numBet).toFixed(2)),
    isWin: winAmount > 0,
    outcomeDetails,
    balanceAfter: user.balance,
    createdAt: new Date().toISOString()
  };

  db.bets.unshift(betRecord);

  // Add transaction record for game profit or loss
  db.transactions.unshift({
    id: 'tx_bet_' + Date.now(),
    userId: user.id,
    type: winAmount > 0 ? 'GAME_PROFIT' : 'GAME_LOSS',
    amount: Number((winAmount - numBet).toFixed(2)),
    balanceAfter: user.balance,
    status: 'COMPLETED',
    description: `${game.name}: ${winAmount > 0 ? 'Won ₹' + winAmount : 'Loss ₹' + numBet}`,
    createdAt: new Date().toISOString()
  });

  if (winAmount >= numBet * 1.5) {
    db.liveWins.unshift({
      id: 'w_' + Date.now(),
      user: `${user.name} (You)`,
      avatar: user.name.charAt(0) || 'P',
      game: game.name,
      amount: winAmount,
      time: 'Just now'
    });
    if (db.liveWins.length > 30) db.liveWins.pop();
  }

  saveDb();

  return res.json({
    success: true,
    bet: betRecord,
    newBalance: user.balance,
    message: winAmount > 0 ? `🎉 Won ₹${winAmount} (${multiplier}x)!` : 'Better luck next time!'
  });
});

// Record external/client bet outcome with profit & loss linked to main balance
app.post('/api/games/record-bet', optionalAuthMiddleware, (req, res) => {
  const { gameId, gameName, period, betAmount, winAmount, multiplier, choice, details } = req.body;
  const user = req.user;
  const numBet = parseFloat(betAmount) || 0;
  const numWin = parseFloat(winAmount) || 0;
  const profitOrLoss = Number((numWin - numBet).toFixed(2));

  // Connect profit / loss directly to main database balance if user exists
  if (user && typeof user.balance === 'number') {
    user.balance += profitOrLoss;
    user.balance = Number(user.balance.toFixed(2));
  }

  const bet = {
    id: 'bet_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    userId: user ? user.id : 'usr_guest_demo',
    gameId: gameId || 'game',
    gameName: gameName || 'Game',
    period: period || '',
    choice: choice || '',
    details: details || '',
    betAmount: numBet,
    winAmount: numWin,
    multiplier: multiplier || (numWin > 0 ? Number((numWin / numBet).toFixed(2)) : 0),
    profitOrLoss,
    isWin: numWin > 0,
    balanceAfter: user ? user.balance : 0,
    createdAt: new Date().toISOString()
  };

  db.bets.unshift(bet);

  // Record in transactions list
  if (user) {
    db.transactions.unshift({
      id: 'tx_' + Date.now(),
      userId: user.id,
      type: numWin > 0 ? 'GAME_PROFIT' : 'GAME_LOSS',
      amount: profitOrLoss,
      balanceAfter: user.balance,
      status: 'COMPLETED',
      description: `${gameName || 'Game'} (${period || 'Round'}): ${numWin > 0 ? 'Profit +₹' + profitOrLoss : 'Loss -₹' + numBet}`,
      createdAt: new Date().toISOString()
    });
  }

  saveDb();

  return res.json({
    success: true,
    bet,
    newBalance: user ? user.balance : 0,
    message: numWin > 0 ? `Profit +₹${profitOrLoss}` : `Loss -₹${numBet}`
  });
});

// Fetch Bet History for current user
app.get('/api/games/my-bets', optionalAuthMiddleware, (req, res) => {
  const user = req.user;
  const gameId = req.query.gameId;
  let bets = db.bets.filter(b => b.userId === user.id);
  // Also include demo/guest bets if user is guest
  if (user.id === 'usr_guest_demo' || user.id === 'usr_guest') {
    bets = db.bets.filter(b => b.userId === 'usr_guest_demo' || b.userId === 'usr_guest' || !b.userId);
  }
  if (gameId) {
    bets = bets.filter(b => b.gameId === gameId);
  }
  return res.json({
    success: true,
    bets: bets.slice(0, 50)
  });
});

// Universal Game Draw / Round History Endpoint
app.get('/api/games/history', (req, res) => {
  const { gameId } = req.query;
  let history = [];
  if (gameId === 'wingo') history = wingoEngine.history;
  else if (gameId === 'k3') history = k3Engine.history;
  else if (gameId === '5d') history = fivedEngine.history;
  else if (gameId === 'aviator') history = aviatorEngine.history;
  else if (gameId === 'mines') history = minesEngine.history;
  else if (gameId === 'chicken') history = chickenEngine.history;
  else if (db.gameHistories && db.gameHistories[gameId]) history = db.gameHistories[gameId];
  else history = db.masterHistory ? db.masterHistory.filter(h => h.gameId === gameId) : [];

  return res.json({
    success: true,
    gameId: gameId || 'all',
    period: db.periods?.[gameId] || 1,
    history: (history || []).slice(0, 50)
  });
});

// Dedicated Aviator Game Page Route
app.get('/aviator', (req, res) => {
  res.sendFile(path.join(__dirname, 'diuwin_lobby_demo', 'aviator.html'));
});
app.get('/aviator.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'diuwin_lobby_demo', 'aviator.html'));
});

// Dedicated Mines Game Page Route
app.get('/mines', (req, res) => {
  res.sendFile(path.join(__dirname, 'diuwin_lobby_demo', 'mines.html'));
});
app.get('/mines.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'diuwin_lobby_demo', 'mines.html'));
});

// ==================== MULTI-GAME AUTHORITY ENGINES (PERIODS FROM #1) ====================

// Unified Master History System
function recordMasterHistory(entry) {
  if (!db.masterHistory) db.masterHistory = [];
  const rec = {
    id: 'mh_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    gameId: entry.gameId,
    gameName: entry.gameName,
    period: entry.period, // Sequential starting cleanly from 1
    result: entry.result,
    totalBet: Number((entry.totalBet || 0).toFixed(2)),
    totalPayout: Number((entry.totalPayout || 0).toFixed(2)),
    netHouseProfit: Number((entry.netHouseProfit || 0).toFixed(2)),
    timestamp: new Date().toISOString()
  };
  db.masterHistory.unshift(rec);
  if (db.masterHistory.length > 1000) db.masterHistory = db.masterHistory.slice(0, 1000);
  saveDb();
  return rec;
}

// -------------------------------------------------------------
// 1. WINGO LOTTERY ENGINE
// -------------------------------------------------------------
function getWingoOutcome(num) {
  const size = num >= 5 ? 'Big' : 'Small';
  let color = 'green';
  let colorName = 'Green';
  if (num === 0) {
    color = 'split-violet-red';
    colorName = 'Red + Violet';
  } else if (num === 5) {
    color = 'split-violet-green';
    colorName = 'Green + Violet';
  } else if ([2, 4, 6, 8].includes(num)) {
    color = 'red';
    colorName = 'Red';
  } else {
    color = 'green';
    colorName = 'Green';
  }
  return { num, size, color, colorName };
}

let wingoEngine = {
  gameId: 'wingo',
  gameName: 'Win Go 1Min',
  durationSeconds: 60,
  periodId: db.periods?.wingo || 1, // Restored from persistent DB
  roundStartedAt: Date.now(),
  activeBets: [],
  history: (db.gameHistories?.wingo && db.gameHistories.wingo.length > 0) ? db.gameHistories.wingo : [],
  lastOutcome: (db.gameHistories?.wingo && db.gameHistories.wingo.length > 0) ? db.gameHistories.wingo[0] : null,
  adminSettings: {
    mode: 'manual',
    forcedNumber: null
  }
};

function calculateWingoLiability(num, bets) {
  let totalPayout = 0;
  const outcome = getWingoOutcome(num);
  bets.forEach(b => {
    let won = false;
    let mult = 0;
    if (b.type === 'color') {
      if (b.choice === 'green' && ([1, 3, 7, 9].includes(num) || num === 5)) {
        won = true;
        mult = (num === 5) ? 1.5 : 2.0;
      } else if (b.choice === 'red' && ([2, 4, 6, 8].includes(num) || num === 0)) {
        won = true;
        mult = (num === 0) ? 1.5 : 2.0;
      } else if (b.choice === 'violet' && (num === 0 || num === 5)) {
        won = true;
        mult = 4.5;
      }
    } else if (b.type === 'number') {
      if (parseInt(b.choice) === num) {
        won = true;
        mult = 9.0;
      }
    } else if (b.type === 'size') {
      if (b.choice.toLowerCase() === outcome.size.toLowerCase()) {
        won = true;
        mult = 2.0;
      }
    }
    if (won) totalPayout += b.amount * mult;
  });
  return totalPayout;
}

function resolveWingoRound() {
  const uniqueClients = new Set(wingoEngine.activeBets.map(b => b.userId)).size;
  const isMoreThan2Clients = uniqueClients >= 2 || wingoEngine.activeBets.length >= 2;

  let chosenNumber = 0;
  if (wingoEngine.adminSettings.forcedNumber !== null && wingoEngine.adminSettings.forcedNumber !== undefined) {
    chosenNumber = parseInt(wingoEngine.adminSettings.forcedNumber);
    wingoEngine.adminSettings.forcedNumber = null;
  } else if ((isMoreThan2Clients || wingoEngine.adminSettings.mode === 'least_bet_profit' || wingoEngine.adminSettings.mode === 'auto_profit') && wingoEngine.activeBets.length > 0) {
    const totalPool = wingoEngine.activeBets.reduce((acc, b) => acc + b.amount, 0);
    let minLiability = Infinity;
    let bestNumbers = [];
    for (let n = 0; n <= 9; n++) {
      const liability = calculateWingoLiability(n, wingoEngine.activeBets);
      if (liability < minLiability) {
        minLiability = liability;
        bestNumbers = [n];
      } else if (liability === minLiability) {
        bestNumbers.push(n);
      }
    }
    chosenNumber = bestNumbers[Math.floor(Math.random() * bestNumbers.length)];
    const netHouseProfit = totalPool - minLiability;
    console.log(`[WinGo Admin Profit Engine] ${uniqueClients} clients (${wingoEngine.activeBets.length} bets), Total Pool: ₹${totalPool.toFixed(2)}. Chosen #${chosenNumber} -> House Profit: +₹${netHouseProfit.toFixed(2)} (Payout: ₹${minLiability.toFixed(2)})`);
  } else {
    chosenNumber = Math.floor(Math.random() * 10);
  }

  const result = getWingoOutcome(chosenNumber);
  result.period = wingoEngine.periodId;
  result.num = chosenNumber;
  result.number = chosenNumber;
  result.timestamp = new Date().toISOString();

  let totalBetAmount = 0;
  let totalWonAmount = 0;

  wingoEngine.activeBets.forEach(b => {
    totalBetAmount += b.amount;
    let won = false;
    let mult = 0;
    if (b.type === 'color') {
      if (b.choice === 'green' && ([1, 3, 7, 9].includes(chosenNumber) || chosenNumber === 5)) {
        won = true; mult = (chosenNumber === 5) ? 1.5 : 2.0;
      } else if (b.choice === 'red' && ([2, 4, 6, 8].includes(chosenNumber) || chosenNumber === 0)) {
        won = true; mult = (chosenNumber === 0) ? 1.5 : 2.0;
      } else if (b.choice === 'violet' && (chosenNumber === 0 || chosenNumber === 5)) {
        won = true; mult = 4.5;
      }
    } else if (b.type === 'number') {
      if (parseInt(b.choice) === chosenNumber) { won = true; mult = 9.0; }
    } else if (b.type === 'size') {
      if (b.choice.toLowerCase() === result.size.toLowerCase()) { won = true; mult = 2.0; }
    }

    const winAmount = won ? Number((b.amount * mult).toFixed(2)) : 0;
    b.status = won ? 'win' : 'loss';
    b.winAmount = winAmount;
    b.profitOrLoss = Number((winAmount - b.amount).toFixed(2));
    totalWonAmount += winAmount;

    const user = db.users.find(u => u.id === b.userId);
    if (user && winAmount > 0) {
      user.balance = Number((user.balance + winAmount).toFixed(2));
    }

    db.bets.unshift({
      id: b.id,
      userId: b.userId,
      gameId: 'wingo',
      gameName: 'WinGo 1Min',
      period: b.period,
      betAmount: b.amount,
      choice: b.choice,
      multiplier: mult,
      winAmount,
      profitOrLoss: b.profitOrLoss,
      isWin: won,
      outcomeDetails: result,
      createdAt: b.createdAt
    });
  });

  result.totalBet = totalBetAmount;
  result.totalPayout = totalWonAmount;
  result.netHouseProfit = Number((totalBetAmount - totalWonAmount).toFixed(2));
  wingoEngine.lastOutcome = result;

  wingoEngine.history.unshift(result);
  if (wingoEngine.history.length > 50) wingoEngine.history.pop();
  if (!db.gameHistories) db.gameHistories = {};
  db.gameHistories.wingo = wingoEngine.history;

  recordMasterHistory({
    gameId: 'wingo',
    gameName: 'Win Go 1Min',
    period: result.period,
    result: `Ball #${result.num} (${result.colorName}, ${result.size})`,
    totalBet: totalBetAmount,
    totalPayout: totalWonAmount,
    netHouseProfit: result.netHouseProfit
  });

  // Increment Period starting cleanly and persist
  wingoEngine.periodId += 1;
  if (!db.periods) db.periods = {};
  db.periods.wingo = wingoEngine.periodId;
  wingoEngine.roundStartedAt = Date.now();
  wingoEngine.activeBets = [];
  saveDb();
  return result;
}

// -------------------------------------------------------------
// 2. K3 DICE LOTTERY ENGINE
// -------------------------------------------------------------
let k3Engine = {
  gameId: 'k3',
  gameName: 'K3 Lotre 1Min',
  durationSeconds: 60,
  periodId: db.periods?.k3 || 1, // Restored from persistent DB
  roundStartedAt: Date.now(),
  activeBets: [],
  history: (db.gameHistories?.k3 && db.gameHistories.k3.length > 0) ? db.gameHistories.k3 : [],
  lastOutcome: (db.gameHistories?.k3 && db.gameHistories.k3.length > 0) ? db.gameHistories.k3[0] : null,
  adminSettings: {
    mode: 'manual',
    forcedDice: null // [d1, d2, d3] e.g. [6, 6, 6]
  }
};

const K3_TOTAL_ODDS = {
  3: 207.36, 4: 69.12, 5: 34.56, 6: 20.74, 7: 13.83, 8: 9.88, 9: 8.30, 10: 7.68,
  11: 7.68, 12: 8.30, 13: 9.88, 14: 13.83, 15: 20.74, 16: 34.56, 17: 69.12, 18: 207.36
};

function calculateK3Liability(dice, bets) {
  const sum = dice[0] + dice[1] + dice[2];
  const size = sum >= 11 ? 'Big' : 'Small';
  const parity = sum % 2 === 1 ? 'Odd' : 'Even';
  const isTriple = (dice[0] === dice[1] && dice[1] === dice[2]);
  const isTwoSame = (dice[0] === dice[1] || dice[1] === dice[2] || dice[0] === dice[2]);
  let totalPayout = 0;

  bets.forEach(b => {
    let won = false;
    let mult = 0;

    if (b.type === 'total') {
      if (parseInt(b.choice) === sum) {
        won = true;
        mult = K3_TOTAL_ODDS[sum] || 8.0;
      }
    } else if (b.type === 'size') {
      if (b.choice.toLowerCase() === size.toLowerCase()) { won = true; mult = 1.98; }
    } else if (b.type === 'parity') {
      if (b.choice.toLowerCase() === parity.toLowerCase()) { won = true; mult = 1.98; }
    } else if (b.type === 'triple') {
      if (isTriple) {
        if (b.choice === 'any' || parseInt(b.choice) === dice[0]) {
          won = true;
          mult = b.choice === 'any' ? 34.56 : 207.36;
        }
      }
    } else if (b.type === 'two_same') {
      if (isTwoSame) { won = true; mult = 13.83; }
    }

    if (won) totalPayout += b.amount * mult;
  });
  return totalPayout;
}

function resolveK3Round() {
  const uniqueClients = new Set(k3Engine.activeBets.map(b => b.userId)).size;
  const isMoreThan2Clients = uniqueClients >= 2 || k3Engine.activeBets.length >= 2;

  let dice = [];
  if (k3Engine.adminSettings.forcedDice && Array.isArray(k3Engine.adminSettings.forcedDice) && k3Engine.adminSettings.forcedDice.length === 3) {
    dice = k3Engine.adminSettings.forcedDice.map(d => Math.max(1, Math.min(6, parseInt(d) || 1)));
    k3Engine.adminSettings.forcedDice = null;
  } else if ((isMoreThan2Clients || k3Engine.adminSettings.mode === 'least_bet_profit' || k3Engine.adminSettings.mode === 'auto_profit') && k3Engine.activeBets.length > 0) {
    const totalPool = k3Engine.activeBets.reduce((acc, b) => acc + b.amount, 0);
    let minLiability = Infinity;
    let bestDiceCombos = [];

    for (let d1 = 1; d1 <= 6; d1++) {
      for (let d2 = 1; d2 <= 6; d2++) {
        for (let d3 = 1; d3 <= 6; d3++) {
          const combo = [d1, d2, d3];
          const liability = calculateK3Liability(combo, k3Engine.activeBets);
          if (liability < minLiability) {
            minLiability = liability;
            bestDiceCombos = [combo];
          } else if (liability === minLiability) {
            bestDiceCombos.push(combo);
          }
        }
      }
    }
    dice = bestDiceCombos[Math.floor(Math.random() * bestDiceCombos.length)];
    const netHouseProfit = totalPool - minLiability;
    console.log(`[K3 Admin Profit Engine] ${uniqueClients} clients (${k3Engine.activeBets.length} bets), Total Pool: ₹${totalPool.toFixed(2)}. Chosen [${dice.join(', ')}] -> House Profit: +₹${netHouseProfit.toFixed(2)} (Payout: ₹${minLiability.toFixed(2)})`);
  } else {
    dice = [
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1
    ];
  }

  const sum = dice[0] + dice[1] + dice[2];
  const size = sum >= 11 ? 'Big' : 'Small';
  const parity = sum % 2 === 1 ? 'Odd' : 'Even';
  const isTriple = (dice[0] === dice[1] && dice[1] === dice[2]);
  const isTwoSame = (dice[0] === dice[1] || dice[1] === dice[2] || dice[0] === dice[2]);

  const outcome = {
    period: k3Engine.periodId,
    dice,
    sum,
    size,
    parity,
    isTriple,
    isTwoSame,
    timestamp: new Date().toISOString()
  };

  let totalBetAmount = 0;
  let totalWonAmount = 0;

  k3Engine.activeBets.forEach(b => {
    totalBetAmount += b.amount;
    let won = false;
    let mult = 0;

    if (b.type === 'total') {
      if (parseInt(b.choice) === sum) {
        won = true;
        mult = K3_TOTAL_ODDS[sum] || 8.0;
      }
    } else if (b.type === 'size') {
      if (b.choice.toLowerCase() === size.toLowerCase()) { won = true; mult = 1.98; }
    } else if (b.type === 'parity') {
      if (b.choice.toLowerCase() === parity.toLowerCase()) { won = true; mult = 1.98; }
    } else if (b.type === 'triple') {
      if (isTriple) {
        if (b.choice === 'any' || parseInt(b.choice) === dice[0]) {
          won = true;
          mult = b.choice === 'any' ? 34.56 : 207.36;
        }
      }
    } else if (b.type === 'two_same') {
      if (isTwoSame) { won = true; mult = 13.83; }
    }

    const winAmount = won ? Number((b.amount * mult).toFixed(2)) : 0;
    b.status = won ? 'win' : 'loss';
    b.winAmount = winAmount;
    b.profitOrLoss = Number((winAmount - b.amount).toFixed(2));
    totalWonAmount += winAmount;

    const user = db.users.find(u => u.id === b.userId);
    if (user && winAmount > 0) {
      user.balance = Number((user.balance + winAmount).toFixed(2));
    }

    db.bets.unshift({
      id: b.id,
      userId: b.userId,
      gameId: 'k3',
      gameName: 'K3 Lotre 1Min',
      period: b.period,
      betAmount: b.amount,
      choice: b.choice,
      multiplier: mult,
      winAmount,
      profitOrLoss: b.profitOrLoss,
      isWin: won,
      outcomeDetails: outcome,
      createdAt: b.createdAt
    });
  });

  outcome.totalBet = totalBetAmount;
  outcome.totalPayout = totalWonAmount;
  outcome.netHouseProfit = Number((totalBetAmount - totalWonAmount).toFixed(2));
  k3Engine.lastOutcome = outcome;

  k3Engine.history.unshift(outcome);
  if (k3Engine.history.length > 50) k3Engine.history.pop();
  if (!db.gameHistories) db.gameHistories = {};
  db.gameHistories.k3 = k3Engine.history;

  recordMasterHistory({
    gameId: 'k3',
    gameName: 'K3 Lotre 1Min',
    period: outcome.period,
    result: `Dice [${dice.join(', ')}] = ${sum} (${size}, ${parity})`,
    totalBet: totalBetAmount,
    totalPayout: totalWonAmount,
    netHouseProfit: outcome.netHouseProfit
  });

  k3Engine.periodId += 1;
  if (!db.periods) db.periods = {};
  db.periods.k3 = k3Engine.periodId;
  k3Engine.roundStartedAt = Date.now();
  k3Engine.activeBets = [];
  saveDb();
  return outcome;
}

// -------------------------------------------------------------
// 3. 5D LOTTERY ENGINE
// -------------------------------------------------------------
let fivedEngine = {
  gameId: '5d',
  gameName: '5D Lotre 1Min',
  durationSeconds: 60,
  periodId: db.periods?.['5d'] || 1, // Restored from persistent DB
  roundStartedAt: Date.now(),
  activeBets: [],
  history: (db.gameHistories?.['5d'] && db.gameHistories['5d'].length > 0) ? db.gameHistories['5d'] : [],
  lastOutcome: (db.gameHistories?.['5d'] && db.gameHistories['5d'].length > 0) ? db.gameHistories['5d'][0] : null,
  adminSettings: {
    mode: 'manual',
    forcedDigits: null // [A, B, C, D, E] e.g. [7, 7, 7, 7, 7]
  }
};

function calculateFivedLiability(digits, bets) {
  const sum = digits.reduce((a, b) => a + b, 0);
  const size = sum >= 23 ? 'Big' : 'Small';
  const parity = sum % 2 === 1 ? 'Odd' : 'Even';
  let totalPayout = 0;

  bets.forEach(b => {
    let won = false;
    let mult = 0;
    const posIndex = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4 }[b.pos || 'Total'];

    if (b.pos && b.pos !== 'Total' && posIndex !== undefined) {
      const digitAtPos = digits[posIndex];
      if (b.type === 'number' && parseInt(b.choice) === digitAtPos) {
        won = true; mult = 9.0;
      } else if (b.type === 'size') {
        const dSize = digitAtPos >= 5 ? 'Big' : 'Small';
        if (b.choice.toLowerCase() === dSize.toLowerCase()) { won = true; mult = 1.98; }
      } else if (b.type === 'parity') {
        const dParity = digitAtPos % 2 === 1 ? 'Odd' : 'Even';
        if (b.choice.toLowerCase() === dParity.toLowerCase()) { won = true; mult = 1.98; }
      }
    } else {
      if (b.type === 'size' && b.choice.toLowerCase() === size.toLowerCase()) {
        won = true; mult = 1.98;
      } else if (b.type === 'parity' && b.choice.toLowerCase() === parity.toLowerCase()) {
        won = true; mult = 1.98;
      }
    }
    if (won) totalPayout += b.amount * mult;
  });
  return totalPayout;
}

function resolveFivedRound() {
  const uniqueClients = new Set(fivedEngine.activeBets.map(b => b.userId)).size;
  const isMoreThan2Clients = uniqueClients >= 2 || fivedEngine.activeBets.length >= 2;

  let digits = [];
  if (fivedEngine.adminSettings.forcedDigits && Array.isArray(fivedEngine.adminSettings.forcedDigits) && fivedEngine.adminSettings.forcedDigits.length === 5) {
    digits = fivedEngine.adminSettings.forcedDigits.map(d => Math.max(0, Math.min(9, parseInt(d) || 0)));
    fivedEngine.adminSettings.forcedDigits = null;
  } else if ((isMoreThan2Clients || fivedEngine.adminSettings.mode === 'least_bet_profit' || fivedEngine.adminSettings.mode === 'auto_profit') && fivedEngine.activeBets.length > 0) {
    const totalPool = fivedEngine.activeBets.reduce((acc, b) => acc + b.amount, 0);
    const posKeys = ['A', 'B', 'C', 'D', 'E'];
    const bestPerPos = [];
    for (let p = 0; p < 5; p++) {
      const pKey = posKeys[p];
      const posBets = fivedEngine.activeBets.filter(b => b.pos === pKey);
      let minLiab = Infinity;
      let bestDigit = Math.floor(Math.random() * 10);
      for (let d = 0; d <= 9; d++) {
        let liab = 0;
        posBets.forEach(b => {
          let won = false;
          if (b.type === 'number' && parseInt(b.choice) === d) won = true;
          else if (b.type === 'size' && b.choice.toLowerCase() === (d >= 5 ? 'big' : 'small')) won = true;
          else if (b.type === 'parity' && b.choice.toLowerCase() === (d % 2 === 1 ? 'odd' : 'even')) won = true;
          if (won) liab += b.amount * (b.type === 'number' ? 9.0 : 1.98);
        });
        if (liab < minLiab) {
          minLiab = liab;
          bestDigit = d;
        }
      }
      bestPerPos.push(bestDigit);
    }
    digits = bestPerPos;
    const finalLiability = calculateFivedLiability(digits, fivedEngine.activeBets);
    const netHouseProfit = totalPool - finalLiability;
    console.log(`[5D Admin Profit Engine] ${uniqueClients} clients (${fivedEngine.activeBets.length} bets), Total Pool: ₹${totalPool.toFixed(2)}. Chosen [${digits.join(', ')}] -> House Profit: +₹${netHouseProfit.toFixed(2)} (Payout: ₹${finalLiability.toFixed(2)})`);
  } else {
    digits = [
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10)
    ];
  }

  const sum = digits.reduce((a, b) => a + b, 0);
  const size = sum >= 23 ? 'Big' : 'Small';
  const parity = sum % 2 === 1 ? 'Odd' : 'Even';

  const outcome = {
    period: fivedEngine.periodId,
    digits,
    sum,
    size,
    parity,
    timestamp: new Date().toISOString()
  };

  let totalBetAmount = 0;
  let totalWonAmount = 0;

  fivedEngine.activeBets.forEach(b => {
    totalBetAmount += b.amount;
    let won = false;
    let mult = 0;

    const posIndex = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4 }[b.pos || 'Total'];

    if (b.pos && b.pos !== 'Total' && posIndex !== undefined) {
      const digitAtPos = digits[posIndex];
      if (b.type === 'number' && parseInt(b.choice) === digitAtPos) {
        won = true; mult = 9.0;
      } else if (b.type === 'size') {
        const dSize = digitAtPos >= 5 ? 'Big' : 'Small';
        if (b.choice.toLowerCase() === dSize.toLowerCase()) { won = true; mult = 1.98; }
      } else if (b.type === 'parity') {
        const dParity = digitAtPos % 2 === 1 ? 'Odd' : 'Even';
        if (b.choice.toLowerCase() === dParity.toLowerCase()) { won = true; mult = 1.98; }
      }
    } else {
      if (b.type === 'size' && b.choice.toLowerCase() === size.toLowerCase()) {
        won = true; mult = 1.98;
      } else if (b.type === 'parity' && b.choice.toLowerCase() === parity.toLowerCase()) {
        won = true; mult = 1.98;
      }
    }

    const winAmount = won ? Number((b.amount * mult).toFixed(2)) : 0;
    b.status = won ? 'win' : 'loss';
    b.winAmount = winAmount;
    b.profitOrLoss = Number((winAmount - b.amount).toFixed(2));
    totalWonAmount += winAmount;

    const user = db.users.find(u => u.id === b.userId);
    if (user && winAmount > 0) {
      user.balance = Number((user.balance + winAmount).toFixed(2));
    }

    db.bets.unshift({
      id: b.id,
      userId: b.userId,
      gameId: '5d',
      gameName: '5D Lotre 1Min',
      period: b.period,
      betAmount: b.amount,
      choice: b.choice,
      multiplier: mult,
      winAmount,
      profitOrLoss: b.profitOrLoss,
      isWin: won,
      outcomeDetails: outcome,
      createdAt: b.createdAt
    });
  });

  outcome.totalBet = totalBetAmount;
  outcome.totalPayout = totalWonAmount;
  outcome.netHouseProfit = Number((totalBetAmount - totalWonAmount).toFixed(2));
  fivedEngine.lastOutcome = outcome;

  fivedEngine.history.unshift(outcome);
  if (fivedEngine.history.length > 50) fivedEngine.history.pop();
  if (!db.gameHistories) db.gameHistories = {};
  db.gameHistories['5d'] = fivedEngine.history;

  recordMasterHistory({
    gameId: '5d',
    gameName: '5D Lotre 1Min',
    period: outcome.period,
    result: `Digits [${digits.join(', ')}] = Sum ${sum} (${size}, ${parity})`,
    totalBet: totalBetAmount,
    totalPayout: totalWonAmount,
    netHouseProfit: outcome.netHouseProfit
  });

  fivedEngine.periodId += 1;
  if (!db.periods) db.periods = {};
  db.periods['5d'] = fivedEngine.periodId;
  fivedEngine.roundStartedAt = Date.now();
  fivedEngine.activeBets = [];
  saveDb();
  return outcome;
}

// -------------------------------------------------------------
// 4. AVIATOR CRASH ENGINE
// -------------------------------------------------------------
let aviatorEngine = {
  gameId: 'aviator',
  gameName: 'Aviator Crash',
  periodId: db.periods?.aviator || 1, // Restored from persistent DB
  state: 'WAITING', // 'WAITING', 'FLYING', 'CRASHED'
  currentMultiplier: 1.00,
  crashPoint: 2.45,
  flightStartTime: 0,
  activeBets: [],
  history: (db.gameHistories?.aviator && db.gameHistories.aviator.length > 0) ? db.gameHistories.aviator : [],
  adminSettings: {
    mode: 'manual',
    forcedCrashPoint: null // e.g. 1.15, 2.50, 10.00
  }
};

function startAviatorFlight() {
  aviatorEngine.state = 'FLYING';
  aviatorEngine.currentMultiplier = 1.00;
  aviatorEngine.flightStartTime = Date.now();

  const uniqueClients = new Set(aviatorEngine.activeBets.map(b => b.userId)).size;
  const isMoreThan2Clients = uniqueClients >= 2 || aviatorEngine.activeBets.length >= 2;

  if (aviatorEngine.adminSettings.forcedCrashPoint !== null) {
    aviatorEngine.crashPoint = parseFloat(aviatorEngine.adminSettings.forcedCrashPoint);
    aviatorEngine.adminSettings.forcedCrashPoint = null;
  } else if ((isMoreThan2Clients || aviatorEngine.adminSettings.mode === 'least_bet_profit' || aviatorEngine.adminSettings.mode === 'auto_profit') && aviatorEngine.activeBets.length > 0) {
    const totalPool = aviatorEngine.activeBets.reduce((acc, b) => acc + b.amount, 0);
    const targets = aviatorEngine.activeBets
      .map(b => parseFloat(b.choice) || parseFloat(b.autoCashout) || 2.0)
      .filter(t => !isNaN(t) && t > 1.0)
      .sort((a, b) => a - b);

    if (targets.length > 0) {
      const lowestTarget = targets[0];
      aviatorEngine.crashPoint = Math.max(1.05, Number((lowestTarget - 0.05 - Math.random() * 0.08).toFixed(2)));
    } else {
      aviatorEngine.crashPoint = Number((1.12 + Math.random() * 0.20).toFixed(2));
    }
    console.log(`[Aviator Admin Profit Engine] ${uniqueClients} clients (${aviatorEngine.activeBets.length} bets), Total Pool: ₹${totalPool.toFixed(2)}. Crash set to ${aviatorEngine.crashPoint}x to ensure house profit`);
  } else {
    // Certified Aviator RNG distribution with 97% RTP
    const r = Math.random();
    if (r < 0.04) {
      aviatorEngine.crashPoint = 1.00; // Immediate crash
    } else if (r < 0.50) {
      aviatorEngine.crashPoint = Number((1.01 + Math.random() * 1.5).toFixed(2));
    } else if (r < 0.85) {
      aviatorEngine.crashPoint = Number((2.50 + Math.random() * 3.5).toFixed(2));
    } else if (r < 0.97) {
      aviatorEngine.crashPoint = Number((6.00 + Math.random() * 14.0).toFixed(2));
    } else {
      aviatorEngine.crashPoint = Number((20.00 + Math.random() * 80.0).toFixed(2));
    }
  }
}

function resolveAviatorCrash() {
  aviatorEngine.state = 'CRASHED';
  const crashedAt = aviatorEngine.crashPoint;

  let totalBetAmount = 0;
  let totalWonAmount = 0;

  aviatorEngine.activeBets.forEach(b => {
    totalBetAmount += b.amount;
    const won = b.cashedOut && b.cashedMultiplier <= crashedAt;
    const winAmount = won ? Number((b.amount * b.cashedMultiplier).toFixed(2)) : 0;
    b.status = won ? 'win' : 'loss';
    b.winAmount = winAmount;
    b.profitOrLoss = Number((winAmount - b.amount).toFixed(2));
    totalWonAmount += winAmount;

    if (won) {
      const user = db.users.find(u => u.id === b.userId);
      if (user) user.balance = Number((user.balance + winAmount).toFixed(2));
    }

    db.bets.unshift({
      id: b.id,
      userId: b.userId,
      gameId: 'aviator',
      gameName: 'Aviator Crash',
      period: aviatorEngine.periodId,
      betAmount: b.amount,
      choice: `${b.cashedMultiplier || crashedAt}x`,
      multiplier: b.cashedMultiplier || 0,
      winAmount,
      profitOrLoss: b.profitOrLoss,
      isWin: won,
      outcomeDetails: { crashedAt },
      createdAt: b.createdAt
    });
  });

  const netHouseProfit = Number((totalBetAmount - totalWonAmount).toFixed(2));
  const record = {
    period: aviatorEngine.periodId,
    crashedAt,
    totalBet: totalBetAmount,
    totalPayout: totalWonAmount,
    netHouseProfit,
    timestamp: new Date().toISOString()
  };

  aviatorEngine.history.unshift(record);
  if (aviatorEngine.history.length > 50) aviatorEngine.history.pop();
  if (!db.gameHistories) db.gameHistories = {};
  db.gameHistories.aviator = aviatorEngine.history;

  recordMasterHistory({
    gameId: 'aviator',
    gameName: 'Aviator Crash',
    period: aviatorEngine.periodId,
    result: `Crashed at ${crashedAt.toFixed(2)}x`,
    totalBet: totalBetAmount,
    totalPayout: totalWonAmount,
    netHouseProfit
  });

  aviatorEngine.periodId += 1;
  if (!db.periods) db.periods = {};
  db.periods.aviator = aviatorEngine.periodId;
  aviatorEngine.activeBets = [];
  saveDb();

  // Reset to waiting phase for 5 seconds before next takeoff
  setTimeout(() => {
    aviatorEngine.state = 'WAITING';
    setTimeout(startAviatorFlight, 5000);
  }, 3000);
}

// Start Aviator initial cycle
setTimeout(startAviatorFlight, 2000);

// -------------------------------------------------------------
// 5. MINES GAME ENGINE
// -------------------------------------------------------------
let minesEngine = {
  gameId: 'mines',
  gameName: 'Mines JILI',
  periodId: db.periods?.mines || 1, // Restored from persistent DB
  history: (db.gameHistories?.mines && db.gameHistories.mines.length > 0) ? db.gameHistories.mines : [],
  adminSettings: {
    trapMode: 'normal' // 'force_bomb', 'force_gem', 'normal'
  }
};

// -------------------------------------------------------------
// 6. CHICKEN ROAD ENGINE
// -------------------------------------------------------------
let chickenEngine = {
  gameId: 'chicken',
  gameName: 'Chicken Road',
  periodId: db.periods?.chicken || 1, // Restored from persistent DB
  history: (db.gameHistories?.chicken && db.gameHistories.chicken.length > 0) ? db.gameHistories.chicken : [],
  adminSettings: {
    mode: 'normal',
    forceCrashStep: null // 1..20
  }
};

// Synchronized 60-second Ticker for Lottery Games (WinGo, K3, 5D)
setInterval(() => {
  const now = Date.now();
  // WinGo
  if (Math.floor((now - wingoEngine.roundStartedAt) / 1000) >= wingoEngine.durationSeconds) {
    resolveWingoRound();
  }
  // K3
  if (Math.floor((now - k3Engine.roundStartedAt) / 1000) >= k3Engine.durationSeconds) {
    resolveK3Round();
  }
  // 5D
  if (Math.floor((now - fivedEngine.roundStartedAt) / 1000) >= fivedEngine.durationSeconds) {
    resolveFivedRound();
  }
}, 1000);

// Aviator Multiplier Ticker
setInterval(() => {
  if (aviatorEngine.state === 'FLYING') {
    const elapsedSec = (Date.now() - aviatorEngine.flightStartTime) / 1000;
    // Standard Aviator exponential flight curve
    aviatorEngine.currentMultiplier = Number((1.00 + Math.pow(elapsedSec * 0.35, 1.6)).toFixed(2));
    if (aviatorEngine.currentMultiplier >= aviatorEngine.crashPoint) {
      resolveAviatorCrash();
    }
  }
}, 100);

// ==================== CLIENT GAME PUBLIC APIS ====================

// WinGo State & Bet
app.get('/api/wingo/state', (req, res) => {
  const elapsed = Math.floor((Date.now() - wingoEngine.roundStartedAt) / 1000);
  return res.json({
    success: true,
    period: wingoEngine.periodId,
    durationSeconds: wingoEngine.durationSeconds,
    timeRemaining: Math.max(0, wingoEngine.durationSeconds - elapsed),
    lastOutcome: wingoEngine.lastOutcome || null,
    history: wingoEngine.history
  });
});

app.post('/api/wingo/bet', (req, res) => {
  const { type, choice, amount, period, userId, userName } = req.body;
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid bet amount' });

  let user = db.users.find(u => u.id === userId) || db.users[0] || { id: 'usr_guest', name: 'Player', balance: 1000 };
  user.balance = Number((user.balance - numAmount).toFixed(2));

  const bet = {
    id: 'wbet_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    userId: user.id,
    userName: userName || user.name || 'Player',
    period: period || wingoEngine.periodId,
    type,
    choice,
    amount: numAmount,
    createdAt: new Date().toISOString()
  };

  wingoEngine.activeBets.push(bet);
  saveDb();
  return res.json({ success: true, betId: bet.id, newBalance: user.balance });
});

// K3 State & Bet
app.get('/api/k3/state', (req, res) => {
  const elapsed = Math.floor((Date.now() - k3Engine.roundStartedAt) / 1000);
  return res.json({
    success: true,
    period: k3Engine.periodId,
    durationSeconds: k3Engine.durationSeconds,
    timeRemaining: Math.max(0, k3Engine.durationSeconds - elapsed),
    lastOutcome: k3Engine.lastOutcome || null,
    history: k3Engine.history
  });
});

app.post('/api/k3/bet', (req, res) => {
  const { type, choice, amount, period, userId, userName } = req.body;
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid bet amount' });

  let user = db.users.find(u => u.id === userId) || db.users[0] || { id: 'usr_guest', name: 'Player', balance: 1000 };
  user.balance = Number((user.balance - numAmount).toFixed(2));

  const bet = {
    id: 'kbet_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    userId: user.id,
    userName: userName || user.name || 'Player',
    period: period || k3Engine.periodId,
    type,
    choice,
    amount: numAmount,
    createdAt: new Date().toISOString()
  };

  k3Engine.activeBets.push(bet);
  saveDb();
  return res.json({ success: true, betId: bet.id, newBalance: user.balance });
});

// 5D State & Bet
app.get('/api/5d/state', (req, res) => {
  const elapsed = Math.floor((Date.now() - fivedEngine.roundStartedAt) / 1000);
  return res.json({
    success: true,
    period: fivedEngine.periodId,
    durationSeconds: fivedEngine.durationSeconds,
    timeRemaining: Math.max(0, fivedEngine.durationSeconds - elapsed),
    lastOutcome: fivedEngine.lastOutcome || null,
    history: fivedEngine.history
  });
});

app.post('/api/5d/bet', (req, res) => {
  const { pos, type, choice, amount, period, userId, userName } = req.body;
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid bet amount' });

  let user = db.users.find(u => u.id === userId) || db.users[0] || { id: 'usr_guest', name: 'Player', balance: 1000 };
  user.balance = Number((user.balance - numAmount).toFixed(2));

  const bet = {
    id: '5dbet_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    userId: user.id,
    userName: userName || user.name || 'Player',
    period: period || fivedEngine.periodId,
    pos: pos || 'Total',
    type,
    choice,
    amount: numAmount,
    createdAt: new Date().toISOString()
  };

  fivedEngine.activeBets.push(bet);
  saveDb();
  return res.json({ success: true, betId: bet.id, newBalance: user.balance });
});

// Aviator State & Bet
app.get('/api/aviator/state', (req, res) => {
  return res.json({
    success: true,
    period: aviatorEngine.periodId,
    state: aviatorEngine.state,
    currentMultiplier: aviatorEngine.currentMultiplier,
    history: aviatorEngine.history.slice(0, 15)
  });
});

app.post('/api/aviator/bet', (req, res) => {
  const { station, amount, userId, userName } = req.body;
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid bet amount' });

  let user = db.users.find(u => u.id === userId) || db.users[0] || { id: 'usr_guest', name: 'Player', balance: 1000 };
  user.balance = Number((user.balance - numAmount).toFixed(2));

  const bet = {
    id: 'avbet_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    userId: user.id,
    userName: userName || user.name || 'Player',
    period: aviatorEngine.periodId,
    station: station || 1,
    amount: numAmount,
    cashedOut: false,
    cashedMultiplier: 0,
    createdAt: new Date().toISOString()
  };

  aviatorEngine.activeBets.push(bet);
  saveDb();
  return res.json({ success: true, betId: bet.id, newBalance: user.balance });
});

app.post('/api/aviator/cashout', (req, res) => {
  const { betId, multiplier } = req.body;
  const bet = aviatorEngine.activeBets.find(b => b.id === betId);
  if (!bet || bet.cashedOut) return res.status(400).json({ success: false, message: 'Bet not found or already cashed out' });

  const cashMult = parseFloat(multiplier) || aviatorEngine.currentMultiplier;
  bet.cashedOut = true;
  bet.cashedMultiplier = cashMult;

  const winAmount = Number((bet.amount * cashMult).toFixed(2));
  const user = db.users.find(u => u.id === bet.userId);
  if (user) user.balance = Number((user.balance + winAmount).toFixed(2));
  saveDb();

  return res.json({ success: true, winAmount, newBalance: user ? user.balance : 0 });
});

// Mines Public Session & Cashout
app.post('/api/mines/session', (req, res) => {
  const { betAmount, minesCount, userId } = req.body;
  const numBet = parseFloat(betAmount) || 100;
  let user = db.users.find(u => u.id === userId) || db.users[0];
  if (user) user.balance = Number((user.balance - numBet).toFixed(2));

  const session = {
    period: minesEngine.periodId,
    userId: user ? user.id : 'usr_guest',
    betAmount: numBet,
    minesCount: parseInt(minesCount) || 5,
    gemsFound: 0,
    multiplier: 1.00,
    status: 'PLAYING',
    createdAt: new Date().toISOString()
  };

  saveDb();
  return res.json({ success: true, period: session.period, session });
});

app.get('/api/mines/state', (req, res) => {
  return res.json({
    success: true,
    period: minesEngine.periodId,
    history: minesEngine.history.slice(0, 30)
  });
});

app.post('/api/mines/complete', (req, res) => {
  const { period, betAmount, winAmount, gemsFound, multiplier, isWin, minesCount } = req.body;
  const numBet = parseFloat(betAmount) || 100;
  const numWin = parseFloat(winAmount) || 0;
  const profit = Number((numWin - numBet).toFixed(2));
  const mult = parseFloat(multiplier) || (numBet > 0 ? Number((numWin / numBet).toFixed(2)) : 1.0);
  const gems = parseInt(gemsFound) || 0;
  const currPeriod = period || minesEngine.periodId;
  const mines = parseInt(minesCount) || 5;

  const historyItem = {
    period: currPeriod,
    isWin: !!isWin,
    mult,
    mines,
    gemsFound: gems,
    betAmount: numBet,
    winAmount: numWin,
    profitOrLoss: profit,
    amt: isWin ? numWin : numBet,
    timestamp: new Date().toISOString()
  };

  minesEngine.history.unshift(historyItem);
  if (minesEngine.history.length > 50) minesEngine.history.pop();
  if (!db.gameHistories) db.gameHistories = {};
  db.gameHistories.mines = minesEngine.history;

  recordMasterHistory({
    gameId: 'mines',
    gameName: 'Mines JILI',
    period: currPeriod,
    result: isWin ? `Cashed out at ${mult}x (${gems} Gems)` : `Detonated Mine (${gems} Gems)`,
    totalBet: numBet,
    totalPayout: numWin,
    netHouseProfit: Number((numBet - numWin).toFixed(2))
  });

  minesEngine.periodId += 1;
  if (!db.periods) db.periods = {};
  db.periods.mines = minesEngine.periodId;

  // Record into db.bets and db.transactions for user
  const user = getAuthenticatedOrGuestUser(req);
  if (user) {
    db.bets.unshift({
      id: 'bet_mines_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      userId: user.id,
      gameId: 'mines',
      gameName: 'Mines JILI',
      period: currPeriod,
      betAmount: numBet,
      winAmount: numWin,
      multiplier: mult,
      profitOrLoss: profit,
      isWin: !!isWin,
      choice: `${mult}x (${gems} Gems)`,
      outcomeDetails: { gemsFound: gems, minesCount: mines },
      createdAt: new Date().toISOString()
    });

    db.transactions.unshift({
      id: 'tx_mines_' + Date.now(),
      userId: user.id,
      type: isWin ? 'GAME_PROFIT' : 'GAME_LOSS',
      amount: profit,
      balanceAfter: user.balance,
      status: 'COMPLETED',
      description: `Mines JILI (Period #${currPeriod}): ${isWin ? 'Profit +₹' + profit : 'Loss -₹' + numBet}`,
      createdAt: new Date().toISOString()
    });
  }

  saveDb();
  return res.json({ success: true, period: minesEngine.periodId, historyItem });
});

// Chicken Road Public Session & Cashout
app.get('/api/chicken/state', (req, res) => {
  return res.json({
    success: true,
    period: chickenEngine.periodId,
    history: chickenEngine.history.slice(0, 30)
  });
});

app.post('/api/chicken/complete', (req, res) => {
  const { period, betAmount, winAmount, step, multiplier, isWin, difficulty } = req.body;
  const numBet = parseFloat(betAmount) || 100;
  const numWin = parseFloat(winAmount) || 0;
  const profit = Number((numWin - numBet).toFixed(2));
  const mult = parseFloat(multiplier) || (numBet > 0 ? Number((numWin / numBet).toFixed(2)) : 1.0);
  const currStep = parseInt(step) || 0;
  const currPeriod = period || chickenEngine.periodId;

  const historyItem = {
    period: currPeriod,
    isWin: !!isWin,
    mult,
    step: currStep,
    difficulty: difficulty || 'medium',
    betAmount: numBet,
    winAmount: numWin,
    profitOrLoss: profit,
    amt: isWin ? numWin : numBet,
    timestamp: new Date().toISOString()
  };

  chickenEngine.history.unshift(historyItem);
  if (chickenEngine.history.length > 50) chickenEngine.history.pop();
  if (!db.gameHistories) db.gameHistories = {};
  db.gameHistories.chicken = chickenEngine.history;

  recordMasterHistory({
    gameId: 'chicken',
    gameName: 'Chicken Road',
    period: currPeriod,
    result: isWin ? `Crossed to Step #${currStep} (${mult}x)` : `Splat at Step #${currStep}`,
    totalBet: numBet,
    totalPayout: numWin,
    netHouseProfit: Number((numBet - numWin).toFixed(2))
  });

  chickenEngine.periodId += 1;
  if (!db.periods) db.periods = {};
  db.periods.chicken = chickenEngine.periodId;

  // Record into db.bets and db.transactions for user
  const user = getAuthenticatedOrGuestUser(req);
  if (user) {
    db.bets.unshift({
      id: 'bet_chick_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      userId: user.id,
      gameId: 'chicken',
      gameName: 'Chicken Road',
      period: currPeriod,
      betAmount: numBet,
      winAmount: numWin,
      multiplier: mult,
      profitOrLoss: profit,
      isWin: !!isWin,
      choice: `Step #${currStep} (${mult}x)`,
      outcomeDetails: { step: currStep, difficulty: historyItem.difficulty },
      createdAt: new Date().toISOString()
    });

    db.transactions.unshift({
      id: 'tx_chick_' + Date.now(),
      userId: user.id,
      type: isWin ? 'GAME_PROFIT' : 'GAME_LOSS',
      amount: profit,
      balanceAfter: user.balance,
      status: 'COMPLETED',
      description: `Chicken Road (Period #${currPeriod}): ${isWin ? 'Profit +₹' + profit : 'Loss -₹' + numBet}`,
      createdAt: new Date().toISOString()
    });
  }

  saveDb();
  return res.json({ success: true, period: chickenEngine.periodId, historyItem });
});

// ==================== ADMIN PANEL APIS FOR ALL 6 GAMES ====================

// Admin Authentication Gate (Master ID & Password)
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if ((username === 'admin' || username === 'master') && (password === 'admin123' || password === 'admin@123')) {
    return res.json({
      success: true,
      message: 'Admin authorization granted',
      token: 'adm_' + Date.now() + '_diuwin_auth',
      admin: {
        id: username,
        role: 'SUPER_ADMIN',
        access: 'ALL_GAMES_MASTER'
      }
    });
  }
  return res.status(401).json({
    success: false,
    message: 'Invalid Admin ID or Security Password'
  });
});

// Admin Overview Analytics API
app.get('/api/admin/overview', (req, res) => {
  const totalUsers = db.users.length;
  const totalBalance = db.users.reduce((sum, u) => sum + (u.balance || 0), 0);
  const totalBets = db.bets.reduce((sum, b) => sum + (b.betAmount || 0), 0);
  const totalPayouts = db.bets.reduce((sum, b) => sum + (b.winAmount || 0), 0);
  const netProfit = totalBets - totalPayouts;

  return res.json({
    success: true,
    stats: {
      totalUsers,
      totalBalance: Number(totalBalance.toFixed(2)),
      totalBetVolume: Number(totalBets.toFixed(2)),
      totalPayouts: Number(totalPayouts.toFixed(2)),
      netHouseProfit: Number(netProfit.toFixed(2))
    }
  });
});

// Live Summary of All 6 Games (for Topbar & Switcher)
app.get('/api/admin/games/live-summary', (req, res) => {
  const now = Date.now();
  return res.json({
    success: true,
    games: {
      wingo: {
        gameId: 'wingo',
        name: 'Win Go 1Min',
        period: wingoEngine.periodId,
        timeRemaining: Math.max(0, wingoEngine.durationSeconds - Math.floor((now - wingoEngine.roundStartedAt) / 1000)),
        activeBets: wingoEngine.activeBets.length,
        totalPool: wingoEngine.activeBets.reduce((acc, b) => acc + b.amount, 0),
        mode: wingoEngine.adminSettings.mode,
        forcedOutcome: wingoEngine.adminSettings.forcedNumber
      },
      k3: {
        gameId: 'k3',
        name: 'K3 Lotre 1Min',
        period: k3Engine.periodId,
        timeRemaining: Math.max(0, k3Engine.durationSeconds - Math.floor((now - k3Engine.roundStartedAt) / 1000)),
        activeBets: k3Engine.activeBets.length,
        totalPool: k3Engine.activeBets.reduce((acc, b) => acc + b.amount, 0),
        mode: k3Engine.adminSettings.mode,
        forcedDice: k3Engine.adminSettings.forcedDice
      },
      '5d': {
        gameId: '5d',
        name: '5D Lotre 1Min',
        period: fivedEngine.periodId,
        timeRemaining: Math.max(0, fivedEngine.durationSeconds - Math.floor((now - fivedEngine.roundStartedAt) / 1000)),
        activeBets: fivedEngine.activeBets.length,
        totalPool: fivedEngine.activeBets.reduce((acc, b) => acc + b.amount, 0),
        mode: fivedEngine.adminSettings.mode,
        forcedDigits: fivedEngine.adminSettings.forcedDigits
      },
      aviator: {
        gameId: 'aviator',
        name: 'Aviator Crash',
        period: aviatorEngine.periodId,
        state: aviatorEngine.state,
        currentMultiplier: aviatorEngine.currentMultiplier,
        activeBets: aviatorEngine.activeBets.length,
        forcedCrash: aviatorEngine.adminSettings.forcedCrashPoint
      },
      mines: {
        gameId: 'mines',
        name: 'Mines JILI',
        period: minesEngine.periodId,
        trapMode: minesEngine.adminSettings.trapMode
      },
      chicken: {
        gameId: 'chicken',
        name: 'Chicken Road',
        period: chickenEngine.periodId,
        forceCrashStep: chickenEngine.adminSettings.forceCrashStep
      }
    }
  });
});

// Master Unified History Log API (Supports All Games or Filter by Game)
app.get('/api/admin/games/history', (req, res) => {
  const filterGame = (req.query.game || 'all').toLowerCase();
  const limit = parseInt(req.query.limit) || 100;
  let list = db.masterHistory || [];

  if (filterGame && filterGame !== 'all') {
    list = list.filter(h => h.gameId.toLowerCase() === filterGame);
  }

  return res.json({
    success: true,
    totalRecords: list.length,
    history: list.slice(0, limit)
  });
});

// WinGo Admin Live & Set Result
app.get('/api/admin/wingo/live', (req, res) => {
  const elapsed = Math.floor((Date.now() - wingoEngine.roundStartedAt) / 1000);
  const timeRemaining = Math.max(0, wingoEngine.durationSeconds - elapsed);
  const pools = {
    green: 0, violet: 0, red: 0, big: 0, small: 0,
    numbers: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 },
    totalPool: 0
  };

  wingoEngine.activeBets.forEach(b => {
    pools.totalPool += b.amount;
    if (b.type === 'color' && pools[b.choice] !== undefined) pools[b.choice] += b.amount;
    else if (b.type === 'size' && pools[b.choice.toLowerCase()] !== undefined) pools[b.choice.toLowerCase()] += b.amount;
    else if (b.type === 'number') {
      const n = parseInt(b.choice);
      if (!isNaN(n) && pools.numbers[n] !== undefined) pools.numbers[n] += b.amount;
    }
  });

  const liabilities = {};
  for (let n = 0; n <= 9; n++) liabilities[n] = calculateWingoLiability(n, wingoEngine.activeBets);

  return res.json({
    success: true,
    period: wingoEngine.periodId,
    timeRemaining,
    durationSeconds: wingoEngine.durationSeconds,
    status: timeRemaining <= 5 ? 'locked' : 'active',
    mode: wingoEngine.adminSettings.mode,
    activeBetsCount: wingoEngine.activeBets.length,
    activeBets: wingoEngine.activeBets,
    pools,
    livePool: { ...pools, totalBet: pools.totalPool },
    liabilities,
    forcedOutcome: wingoEngine.adminSettings.forcedNumber !== null ? { number: wingoEngine.adminSettings.forcedNumber } : null,
    history: wingoEngine.history,
    recentHistory: wingoEngine.history.slice(0, 15)
  });
});

app.post('/api/admin/wingo/set-result', (req, res) => {
  const { mode, forcedNumber, number } = req.body;
  if (mode) wingoEngine.adminSettings.mode = mode;
  const target = forcedNumber !== undefined ? forcedNumber : number;
  if (target !== undefined) {
    wingoEngine.adminSettings.forcedNumber = target !== null ? parseInt(target) : null;
    if (target !== null) wingoEngine.adminSettings.mode = 'forced_outcome';
  }
  return res.json({ success: true, message: 'WinGo result updated', adminSettings: wingoEngine.adminSettings });
});

// K3 Admin Live & Set Result
app.get('/api/admin/k3/live', (req, res) => {
  const elapsed = Math.floor((Date.now() - k3Engine.roundStartedAt) / 1000);
  const timeRemaining = Math.max(0, k3Engine.durationSeconds - elapsed);
  const totalPool = k3Engine.activeBets.reduce((acc, b) => acc + b.amount, 0);

  return res.json({
    success: true,
    period: k3Engine.periodId,
    timeRemaining,
    durationSeconds: k3Engine.durationSeconds,
    activeBetsCount: k3Engine.activeBets.length,
    activeBets: k3Engine.activeBets,
    totalPool,
    forcedDice: k3Engine.adminSettings.forcedDice,
    mode: k3Engine.adminSettings.mode,
    history: k3Engine.history.slice(0, 15)
  });
});

app.post('/api/admin/k3/set-result', (req, res) => {
  const { dice, d1, d2, d3, mode } = req.body;
  if (mode) k3Engine.adminSettings.mode = mode;

  let targetDice = dice;
  if (!targetDice && d1 !== undefined && d2 !== undefined && d3 !== undefined) {
    targetDice = [parseInt(d1), parseInt(d2), parseInt(d3)];
  }

  if (targetDice && Array.isArray(targetDice)) {
    k3Engine.adminSettings.forcedDice = targetDice.map(n => Math.max(1, Math.min(6, parseInt(n) || 1)));
    k3Engine.adminSettings.mode = 'forced_outcome';
  } else if (req.body.clear) {
    k3Engine.adminSettings.forcedDice = null;
  }

  return res.json({ success: true, message: 'K3 Dice outcome locked', adminSettings: k3Engine.adminSettings });
});

// 5D Admin Live & Set Result
app.get('/api/admin/5d/live', (req, res) => {
  const elapsed = Math.floor((Date.now() - fivedEngine.roundStartedAt) / 1000);
  const timeRemaining = Math.max(0, fivedEngine.durationSeconds - elapsed);
  const totalPool = fivedEngine.activeBets.reduce((acc, b) => acc + b.amount, 0);

  return res.json({
    success: true,
    period: fivedEngine.periodId,
    timeRemaining,
    durationSeconds: fivedEngine.durationSeconds,
    activeBetsCount: fivedEngine.activeBets.length,
    activeBets: fivedEngine.activeBets,
    totalPool,
    forcedDigits: fivedEngine.adminSettings.forcedDigits,
    mode: fivedEngine.adminSettings.mode,
    history: fivedEngine.history.slice(0, 15)
  });
});

app.post('/api/admin/5d/set-result', (req, res) => {
  const { digits, a, b, c, d, e, mode } = req.body;
  if (mode) fivedEngine.adminSettings.mode = mode;

  let targetDigits = digits;
  if (!targetDigits && a !== undefined && b !== undefined && c !== undefined && d !== undefined && e !== undefined) {
    targetDigits = [parseInt(a), parseInt(b), parseInt(c), parseInt(d), parseInt(e)];
  }

  if (targetDigits && Array.isArray(targetDigits)) {
    fivedEngine.adminSettings.forcedDigits = targetDigits.map(n => Math.max(0, Math.min(9, parseInt(n) || 0)));
    fivedEngine.adminSettings.mode = 'forced_outcome';
  } else if (req.body.clear) {
    fivedEngine.adminSettings.forcedDigits = null;
  }

  return res.json({ success: true, message: '5D Lottery outcome locked', adminSettings: fivedEngine.adminSettings });
});

// Aviator Admin Live & Set Crash
app.get('/api/admin/aviator/live', (req, res) => {
  return res.json({
    success: true,
    period: aviatorEngine.periodId,
    state: aviatorEngine.state,
    currentMultiplier: aviatorEngine.currentMultiplier,
    activeBetsCount: aviatorEngine.activeBets.length,
    activeBets: aviatorEngine.activeBets,
    forcedCrashPoint: aviatorEngine.adminSettings.forcedCrashPoint,
    history: aviatorEngine.history.slice(0, 15)
  });
});

app.post('/api/admin/aviator/set-crash', (req, res) => {
  const crashMultiplier = req.body.crashMultiplier !== undefined ? req.body.crashMultiplier : (req.body.crashPoint !== undefined ? req.body.crashPoint : req.body.multiplier);
  const forceCrashNow = req.body.forceCrashNow || req.body.instant;

  if (crashMultiplier !== undefined) {
    aviatorEngine.adminSettings.forcedCrashPoint = parseFloat(crashMultiplier);
  }
  if (forceCrashNow && aviatorEngine.state === 'FLYING') {
    resolveAviatorCrash();
    return res.json({ success: true, message: `Aviator crashed immediately at ${aviatorEngine.currentMultiplier}x` });
  }
  return res.json({
    success: true,
    period: aviatorEngine.periodId,
    message: `Next flight will crash at ${aviatorEngine.adminSettings.forcedCrashPoint}x`,
    forcedCrashPoint: aviatorEngine.adminSettings.forcedCrashPoint
  });
});

// Mines Admin Live & Set Trap
app.get('/api/admin/mines/live', (req, res) => {
  return res.json({
    success: true,
    period: minesEngine.periodId,
    trapMode: minesEngine.adminSettings.trapMode,
    history: (db.masterHistory || []).filter(h => h.gameId === 'mines').slice(0, 15)
  });
});

app.post('/api/admin/mines/set-trap', (req, res) => {
  const { trapMode } = req.body;
  if (trapMode) minesEngine.adminSettings.trapMode = trapMode;
  return res.json({ success: true, message: `Mines Trap Mode set to: ${trapMode}`, trapMode: minesEngine.adminSettings.trapMode });
});

// Chicken Road Admin Live & Set Step
app.get('/api/admin/chicken/live', (req, res) => {
  return res.json({
    success: true,
    period: chickenEngine.periodId,
    forceCrashStep: chickenEngine.adminSettings.forceCrashStep,
    history: (db.masterHistory || []).filter(h => h.gameId === 'chicken').slice(0, 15)
  });
});

app.post('/api/admin/chicken/set-step', (req, res) => {
  const targetStep = req.body.forceCrashStep !== undefined ? req.body.forceCrashStep : (req.body.step !== undefined ? req.body.step : null);
  chickenEngine.adminSettings.forceCrashStep = targetStep !== null ? parseInt(targetStep) : null;
  return res.json({ success: true, message: `Chicken Road crash step set to: ${chickenEngine.adminSettings.forceCrashStep}`, forceCrashStep: chickenEngine.adminSettings.forceCrashStep });
});

// 4. Admin Users List
app.get('/api/admin/users', (req, res) => {
  const query = (req.query.q || '').toLowerCase();
  let users = db.users;

  if (query) {
    users = users.filter(u => 
      (u.phone && u.phone.includes(query)) ||
      (u.name && u.name.toLowerCase().includes(query)) ||
      (u.id && u.id.toLowerCase().includes(query))
    );
  }

  return res.json({
    success: true,
    users: users.map(u => ({
      id: u.id,
      phone: u.phone,
      name: u.name,
      balance: u.balance,
      vipLevel: u.vipLevel,
      status: u.isBanned ? 'Banned' : 'Active',
      createdAt: u.createdAt
    }))
  });
});

// 5. Admin Balance Adjustment (Credit / Debit)
app.post('/api/admin/users/adjust-balance', (req, res) => {
  const { userId, amount, action, reason } = req.body;
  const numAmount = parseFloat(amount);

  if (!userId || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid user or amount' });
  }

  const user = db.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (action === 'subtract' && user.balance < numAmount) {
    return res.status(400).json({ success: false, message: 'Cannot deduct more than current balance' });
  }

  if (action === 'add') {
    user.balance = Number((user.balance + numAmount).toFixed(2));
  } else {
    user.balance = Number((user.balance - numAmount).toFixed(2));
  }

  db.transactions.unshift({
    id: 'tx_adm_' + Date.now(),
    userId: user.id,
    type: action === 'add' ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
    amount: numAmount,
    balanceAfter: user.balance,
    status: 'SUCCESS',
    description: reason || `Admin manual adjustment (${action})`,
    createdAt: new Date().toISOString()
  });

  saveDb();

  return res.json({
    success: true,
    message: `₹${numAmount} ${action === 'add' ? 'added to' : 'deducted from'} user's account`,
    newBalance: user.balance
  });
});

// 6. Admin Toggle User Ban
app.post('/api/admin/users/toggle-ban', (req, res) => {
  const { userId } = req.body;
  const user = db.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  user.isBanned = !user.isBanned;
  saveDb();

  return res.json({
    success: true,
    message: `User is now ${user.isBanned ? 'banned' : 'active'}`,
    isBanned: user.isBanned
  });
});

// 7. Admin Transactions List
app.get('/api/admin/transactions', (req, res) => {
  return res.json({
    success: true,
    transactions: db.transactions.slice(0, 50)
  });
});

// 8. Admin Transaction Action (Approve / Reject)
app.post('/api/admin/transactions/action', (req, res) => {
  const { txId, action } = req.body;
  const tx = db.transactions.find(t => t.id === txId);
  if (!tx) {
    return res.status(404).json({ success: false, message: 'Transaction not found' });
  }

  if (action === 'approve') {
    tx.status = 'SUCCESS';
    // If pending recharge, credit user balance
    if (tx.type === 'RECHARGE' || tx.type === 'DEPOSIT') {
      const user = db.users.find(u => u.id === tx.userId);
      if (user) {
        user.balance = Number((user.balance + tx.amount).toFixed(2));
      }
    }
  } else if (action === 'reject') {
    tx.status = 'REJECTED';
    // If pending withdrawal rejected, refund user balance
    if (tx.type === 'WITHDRAW') {
      const user = db.users.find(u => u.id === tx.userId);
      if (user) {
        user.balance = Number((user.balance + tx.amount).toFixed(2));
      }
    }
  }

  saveDb();

  return res.json({
    success: true,
    message: `Transaction ${txId} marked as ${tx.status}`,
    transaction: tx
  });
});

// Dedicated Admin Panel Routes
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Dedicated Chicken Road Game Page Route
app.get('/chicken', (req, res) => {
  res.sendFile(path.join(__dirname, 'diuwin_lobby_demo', 'chicken.html'));
});
app.get('/chicken.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'diuwin_lobby_demo', 'chicken.html'));
});

// Dedicated Win Go Color Lottery Route
app.get('/win', (req, res) => {
  res.sendFile(path.join(__dirname, 'diuwin_lobby_demo', 'win.html'));
});
app.get('/win.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'diuwin_lobby_demo', 'win.html'));
});
app.get('/wingo', (req, res) => {
  res.sendFile(path.join(__dirname, 'diuwin_lobby_demo', 'win.html'));
});
app.get('/wingo.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'diuwin_lobby_demo', 'win.html'));
});

// Dedicated K3 Lottery Route
app.get('/k3', (req, res) => {
  res.sendFile(path.join(__dirname, 'diuwin_lobby_demo', 'k3.html'));
});
app.get('/k3.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'diuwin_lobby_demo', 'k3.html'));
});

// Dedicated 5D Lottery Route
app.get('/5d', (req, res) => {
  res.sendFile(path.join(__dirname, 'diuwin_lobby_demo', '5d.html'));
});
app.get('/5d.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'diuwin_lobby_demo', '5d.html'));
});

// Catch-all route to serve the SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'diuwin_lobby_demo', 'index.html'));
});

// Process Exit Handlers to ensure DB is saved on close
process.on('SIGINT', () => {
  saveDb(db, true);
  process.exit(0);
});
process.on('SIGTERM', () => {
  saveDb(db, true);
  process.exit(0);
});

// Start Server
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`🚀 DiuWin Lobby Backend is running on port ${PORT}`);
    console.log(`🔗 Local URL: http://localhost:${PORT}`);
    console.log(`=================================================`);
  });
}

module.exports = app;
