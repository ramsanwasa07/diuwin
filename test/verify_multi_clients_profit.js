const http = require('http');

let adminAuthToken = null;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      ...headers
    };
    if (adminAuthToken && !reqHeaders['Authorization']) {
      reqHeaders['Authorization'] = `Bearer ${adminAuthToken}`;
    }
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: reqHeaders
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(chunks) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: chunks });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('🎰 MULTI-CLIENT TOTAL POOL & ADMIN PROFIT VERIFICATION');
  console.log('================================================================');

  // Authenticate admin
  const loginRes = await request('POST', '/api/admin/login', { username: 'admin', password: 'admin123' });
  if (loginRes.data && loginRes.data.token) {
    adminAuthToken = loginRes.data.token;
  }

  // Register 3 fresh users with sufficient balance
  const clients = [];
  for (let i = 1; i <= 3; i++) {
    const phone = '97' + Math.floor(10000000 + Math.random() * 90000000);
    const reg = await request('POST', '/api/auth/register', { phone, password: 'Password@123' });
    const token = reg.data.user.token;
    const uid = reg.data.user.id;
    // Credit extra balance via admin adjustment
    await request('POST', '/api/admin/users/adjust-balance', { userId: uid, amount: 2000, action: 'add', reason: 'Test Balance' });
    clients.push({ token, uid, phone });
  }

  // WinGo check
  const state = await request('GET', '/api/wingo/state');
  const period = state.data.period;
  console.log(`Current WinGo Period: #${period}`);

  // 3 distinct clients place bets in the same round
  const b1 = await request('POST', '/api/wingo/bet', {
    userId: clients[0].uid,
    userName: 'Ramesh',
    period,
    type: 'color',
    choice: 'green',
    amount: 1000
  }, { 'Authorization': `Bearer ${clients[0].token}` });

  const b2 = await request('POST', '/api/wingo/bet', {
    userId: clients[1].uid,
    userName: 'Suresh',
    period,
    type: 'color',
    choice: 'red',
    amount: 600
  }, { 'Authorization': `Bearer ${clients[1].token}` });

  const b3 = await request('POST', '/api/wingo/bet', {
    userId: clients[2].uid,
    userName: 'Vikas',
    period,
    type: 'size',
    choice: 'Big',
    amount: 400
  }, { 'Authorization': `Bearer ${clients[2].token}` });

  console.log(`- Client A (Ramesh) bet ₹1000 on Green (Status: ${b1.data.success})`);
  console.log(`- Client B (Suresh) bet ₹600 on Red (Status: ${b2.data.success})`);
  console.log(`- Client C (Vikas)  bet ₹400 on Big (Status: ${b3.data.success})`);

  const live = await request('GET', '/api/admin/wingo/live');
  const totalPool = live.data.pools.totalPool;
  console.log(`\n💰 Total Round Pool (All Clients Combined): ₹${totalPool.toFixed(2)}`);

  console.log('\n⚡ Resolving round via Admin Panel Instant Draw...');
  await request('POST', '/api/admin/wingo/set-result', { drawNow: true });

  const hist = await request('GET', '/api/admin/games/history?limit=5');
  const historyList = (hist.data && hist.data.history) || [];
  const resolved = historyList.find(h => h.gameId === 'wingo' && h.period === period);

  if (resolved) {
    console.log(`✅ Round #${resolved.period} Finished!`);
    console.log(`🎯 Chosen Outcome: ${resolved.result}`);
    console.log(`💵 Total Pool Collected from All Clients: ₹${resolved.totalBet}`);
    console.log(`📤 Payout to Winning Clients:            ₹${resolved.totalPayout}`);
    console.log(`🏆 Admin Net Profit:                     +₹${resolved.netHouseProfit}`);
    console.log(`📈 Admin Margin:                         ${((resolved.netHouseProfit / resolved.totalBet) * 100).toFixed(1)}%`);

    if (resolved.netHouseProfit > 0) {
      console.log('\n🎉 SUCCESS: Admin profit guaranteed when multiple clients play!');
    } else {
      console.error('\n❌ FAILED: Admin did not make a profit!');
      process.exit(1);
    }
  } else {
    console.log('⚠️ Round did not resolve within timeout, check server logs.');
  }
}

run().catch(console.error);
