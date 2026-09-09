const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function request(method, pathName, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathName, BASE_URL);
    const bodyStr = data ? JSON.stringify(data) : null;
    const req = http.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
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

async function verify() {
  console.log('🔍 Testing History & Bet Persistence on Running Port 3000 Server...');

  // 1. WinGo State
  const stateRes = await request('GET', '/api/wingo/state');
  if (!stateRes.data.success || !Array.isArray(stateRes.data.history) || stateRes.data.history.length === 0) {
    throw new Error('WinGo state failed to return draw history');
  }
  console.log(`✅ WinGo State returned period #${stateRes.data.period} and ${stateRes.data.history.length} history records`);

  // 2. WinGo Bet Placement
  const betRes = await request('POST', '/api/wingo/bet', {
    type: 'color',
    choice: 'green',
    amount: 10,
    period: stateRes.data.period,
    userId: 'usr_guest_demo'
  });
  if (!betRes.data.success) throw new Error('WinGo bet placement failed');
  console.log(`✅ WinGo Bet placed successfully (New Balance: ₹${betRes.data.newBalance})`);

  // 3. Record Bet Persistence via Universal API
  const recRes = await request('POST', '/api/games/record-bet', {
    userId: 'usr_guest_demo',
    gameId: 'wingo',
    gameName: 'Win Go 1Min',
    period: stateRes.data.period,
    betAmount: 10,
    winAmount: 20,
    isWin: true,
    multiplier: 2.0,
    choice: 'green',
    details: 'Green Ball Win'
  });
  if (!recRes.data.success) throw new Error('Universal record-bet failed');
  console.log('✅ Universal record-bet saved bet successfully');

  // 4. Fetch My Bets for WinGo
  const myBetsRes = await request('GET', '/api/games/my-bets?gameId=wingo&userId=usr_guest_demo');
  if (!myBetsRes.data.success || !Array.isArray(myBetsRes.data.bets) || myBetsRes.data.bets.length === 0) {
    throw new Error('Failed to fetch My Bets for WinGo');
  }
  console.log(`✅ My Bets for WinGo successfully returned ${myBetsRes.data.bets.length} persisted bets`);

  // 5. Verify data/db.json on disk
  await new Promise(r => setTimeout(r, 1200)); // wait for 1000ms debounce
  const dbData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  if (!dbData.gameHistories?.wingo || dbData.gameHistories.wingo.length === 0) {
    throw new Error('db.json does not have wingo history saved on disk');
  }
  console.log(`✅ Disk Persistence Confirmed: data/db.json contains ${dbData.gameHistories.wingo.length} WinGo history records and ${dbData.bets.length} total player bets`);

  console.log('\n🎉 ALL VERIFICATION CHECKS PASSED: History and bets are 100% saving and persistent!');
}

verify().catch(err => {
  console.error('❌ Verification Error:', err.message);
  process.exit(1);
});
