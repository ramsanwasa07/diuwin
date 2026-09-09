const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3095;
const BASE_URL = `http://localhost:${PORT}`;
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function request(method, pathName, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathName, BASE_URL);
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    const bodyStr = data ? JSON.stringify(data) : null;
    if (bodyStr) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = http.request(url, {
      method,
      headers: reqHeaders
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function run() {
  console.log('🧪 Starting Game History & Persistence Verification Test...');
  let serverProcess = null;

  try {
    // 1. Start Server on port 3095
    serverProcess = spawn('node', ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'pipe'
    });

    // Wait for server to boot
    await new Promise(r => setTimeout(r, 2000));

    // Test 1: Check server state endpoints for all games
    const games = ['wingo', 'k3', '5d', 'aviator', 'mines', 'chicken'];
    for (const g of games) {
      const res = await request('GET', `/api/games/history?gameId=${g}`);
      if (res.status === 200 && res.data.success && Array.isArray(res.data.history) && res.data.history.length > 0) {
        console.log(`  ✅ PASS: Draw history available for ${g} (${res.data.history.length} records)`);
      } else {
        throw new Error(`Failed to fetch history for ${g}: ${JSON.stringify(res.data)}`);
      }
    }

    // Test 2: Record guest bets for all 6 games
    const guestId = 'usr_guest_demo';
    const testBets = [
      { gameId: 'wingo', gameName: 'WinGo 1Min', betAmount: 20, winAmount: 39.2, isWin: true, multiplier: 2.0, choice: 'Green', details: 'Green' },
      { gameId: 'k3', gameName: 'K3 3-Dice', betAmount: 50, winAmount: 0, isWin: false, multiplier: 0, choice: 'Big', details: 'Big' },
      { gameId: '5d', gameName: '5D Lottery', betAmount: 10, winAmount: 90, isWin: true, multiplier: 9.0, choice: '7', details: 'Pos A-7' },
      { gameId: 'aviator', gameName: 'Aviator Crash', betAmount: 100, winAmount: 235, isWin: true, multiplier: 2.35, choice: '2.35x', details: 'Cashed out at 2.35x' },
      { gameId: 'mines', gameName: 'Mines Gold', betAmount: 30, winAmount: 58.5, isWin: true, multiplier: 1.95, choice: '3 Gems', details: '3 Gems Found' },
      { gameId: 'chicken', gameName: 'Chicken Road', betAmount: 25, winAmount: 0, isWin: false, multiplier: 0, choice: 'Step 2', details: 'Hit Vehicle at Step 2' }
    ];

    for (const b of testBets) {
      const res = await request('POST', '/api/games/record-bet', {
        userId: guestId,
        ...b
      });
      if (res.status === 200 && res.data.success) {
        console.log(`  ✅ PASS: Guest bet recorded for ${b.gameId} (isWin: ${b.isWin})`);
      } else {
        throw new Error(`Failed to record bet for ${b.gameId}: ${JSON.stringify(res.data)}`);
      }
    }

    // Test 3: Verify Mines /api/mines/complete endpoint
    const minesCompleteRes = await request('POST', '/api/mines/complete', {
      userId: guestId,
      betAmount: 50,
      multiplier: 2.45,
      gemsFound: 4,
      isWin: true,
      winAmount: 122.50
    });
    if (minesCompleteRes.status === 200 && minesCompleteRes.data.success) {
      console.log('  ✅ PASS: /api/mines/complete successfully recorded game run');
    } else {
      throw new Error(`Mines complete failed: ${JSON.stringify(minesCompleteRes.data)}`);
    }

    // Test 4: Verify Chicken /api/chicken/complete endpoint
    const chickenCompleteRes = await request('POST', '/api/chicken/complete', {
      userId: guestId,
      betAmount: 40,
      multiplier: 1.70,
      step: 3,
      isWin: true,
      winAmount: 68.00
    });
    if (chickenCompleteRes.status === 200 && chickenCompleteRes.data.success) {
      console.log('  ✅ PASS: /api/chicken/complete successfully recorded road cross');
    } else {
      throw new Error(`Chicken complete failed: ${JSON.stringify(chickenCompleteRes.data)}`);
    }

    // Test 5: Verify My Bets retrieval for all 6 games for guest user
    for (const g of games) {
      const res = await request('GET', `/api/games/my-bets?gameId=${g}&userId=${guestId}`);
      if (res.status === 200 && res.data.success && Array.isArray(res.data.bets) && res.data.bets.length > 0) {
        console.log(`  ✅ PASS: My-bets loaded for ${g} (${res.data.bets.length} bets found)`);
      } else {
        throw new Error(`Failed to get my-bets for ${g}: ${JSON.stringify(res.data)}`);
      }
    }

    // Test 6: Verify db.json content before restart
    const dbRaw = fs.readFileSync(DB_PATH, 'utf8');
    const db = JSON.parse(dbRaw);
    if (!db.gameHistories || !db.periods) {
      throw new Error('db.json missing gameHistories or periods!');
    }
    console.log('  ✅ PASS: db.json has gameHistories & periods persisted to disk');

    // Test 7: Restart server and verify persistence
    console.log('  🔄 Restarting server to test cross-restart persistence...');
    serverProcess.kill();
    await new Promise(r => setTimeout(r, 1000));

    serverProcess = spawn('node', ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'pipe'
    });
    await new Promise(r => setTimeout(r, 2000));

    // Verify after restart
    for (const g of games) {
      const res = await request('GET', `/api/games/history?gameId=${g}`);
      if (res.status === 200 && res.data.success && res.data.history.length > 0) {
        console.log(`  ✅ PASS (Post-Restart): ${g} draw history preserved (${res.data.history.length} records)`);
      } else {
        throw new Error(`History lost after restart for ${g}`);
      }

      const myBetsRes = await request('GET', `/api/games/my-bets?gameId=${g}&userId=${guestId}`);
      if (myBetsRes.status === 200 && myBetsRes.data.success && myBetsRes.data.bets.length > 0) {
        console.log(`  ✅ PASS (Post-Restart): ${g} player bets preserved (${myBetsRes.data.bets.length} bets)`);
      } else {
        throw new Error(`Player bets lost after restart for ${g}`);
      }
    }

    console.log('\n🎉 ALL GAME HISTORY AND PERSISTENCE TESTS PASSED SUCCESSFULLY!');
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

run().catch(err => {
  console.error('\n❌ Test Failed:', err.message);
  process.exit(1);
});
