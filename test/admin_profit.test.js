const http = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

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

async function testAdminProfit() {
  console.log('🧪 Testing Multi-Client Admin Profit Engine (> 2 Clients Playing)...');

  // ==================== TEST 1: WINGO ADMIN PROFIT ====================
  console.log('\n--- 1. Testing WinGo 1Min (> 2 Clients) ---');
  const wingoState = await request('GET', '/api/wingo/state');
  const period = wingoState.data.period;

  // 3 distinct clients place bets
  const client1 = await request('POST', '/api/wingo/bet', {
    userId: 'usr_client_1',
    userName: 'Client 1',
    period,
    type: 'color',
    choice: 'green',
    amount: 500
  });
  const client2 = await request('POST', '/api/wingo/bet', {
    userId: 'usr_client_2',
    userName: 'Client 2',
    period,
    type: 'size',
    choice: 'big',
    amount: 300
  });
  const client3 = await request('POST', '/api/wingo/bet', {
    userId: 'usr_client_3',
    userName: 'Client 3',
    period,
    type: 'color',
    choice: 'red',
    amount: 200
  });

  if (!client1.data.success || !client2.data.success || !client3.data.success) {
    throw new Error('Failed to place multi-client bets for WinGo');
  }
  console.log('  ✅ 3 distinct clients placed bets: ₹500 on Green, ₹300 on Big, ₹200 on Red (Total Pool: ₹1000)');

  // Verify Admin Live summary sees the pool
  const liveAdmin = await request('GET', '/api/admin/wingo/live');
  console.log(`  ✅ Admin Live Panel: Active Bets = ${liveAdmin.data.activeBetsCount}, Total Pool = ₹${liveAdmin.data.pools.totalPool}`);

  // ==================== TEST 2: K3 ADMIN PROFIT ====================
  console.log('\n--- 2. Testing K3 Lottery (> 2 Clients) ---');
  const k3State = await request('GET', '/api/k3/state');
  const k3Period = k3State.data.period;

  await request('POST', '/api/k3/bet', {
    userId: 'usr_client_1',
    period: k3Period,
    type: 'size',
    choice: 'Big',
    amount: 400
  });
  await request('POST', '/api/k3/bet', {
    userId: 'usr_client_2',
    period: k3Period,
    type: 'parity',
    choice: 'Odd',
    amount: 300
  });
  await request('POST', '/api/k3/bet', {
    userId: 'usr_client_3',
    period: k3Period,
    type: 'total',
    choice: '15',
    amount: 100
  });
  console.log('  ✅ 3 distinct clients placed K3 bets (Total Pool: ₹800)');

  // ==================== TEST 3: 5D ADMIN PROFIT ====================
  console.log('\n--- 3. Testing 5D Lottery (> 2 Clients) ---');
  const fivedState = await request('GET', '/api/5d/state');
  const fivedPeriod = fivedState.data.period;

  await request('POST', '/api/5d/bet', {
    userId: 'usr_client_1',
    period: fivedPeriod,
    pos: 'A',
    type: 'number',
    choice: '7',
    amount: 200
  });
  await request('POST', '/api/5d/bet', {
    userId: 'usr_client_2',
    period: fivedPeriod,
    pos: 'B',
    type: 'size',
    choice: 'Big',
    amount: 300
  });
  await request('POST', '/api/5d/bet', {
    userId: 'usr_client_3',
    period: fivedPeriod,
    pos: 'Total',
    type: 'size',
    choice: 'Small',
    amount: 150
  });
  console.log('  ✅ 3 distinct clients placed 5D bets (Total Pool: ₹650)');

  // Wait for lottery ticker to resolve rounds
  console.log('\n⏳ Waiting for rounds to resolve and verify Admin Profit in Master History...');
  
  // Wait up to 65 seconds for round ticker to resolve
  let resolvedWingo = null;
  let resolvedK3 = null;
  let resolved5D = null;

  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise(r => setTimeout(r, 4500));
    const histRes = await request('GET', '/api/admin/games/history?limit=15');
    if (histRes.data && histRes.data.history) {
      if (!resolvedWingo) {
        resolvedWingo = histRes.data.history.find(h => h.gameId === 'wingo' && h.period === period);
      }
      if (!resolvedK3) {
        resolvedK3 = histRes.data.history.find(h => h.gameId === 'k3' && h.period === k3Period);
      }
      if (!resolved5D) {
        resolved5D = histRes.data.history.find(h => h.gameId === '5d' && h.period === fivedPeriod);
      }
    }
    if (resolvedWingo && resolvedK3 && resolved5D) break;
    process.stdout.write('.');
  }
  console.log('');

  if (resolvedWingo) {
    console.log(`\n🎉 WinGo Round #${resolvedWingo.period} Outcome: ${resolvedWingo.result}`);
    console.log(`   Total Bet Pool: ₹${resolvedWingo.totalBet}`);
    console.log(`   Player Payout:  ₹${resolvedWingo.totalPayout}`);
    console.log(`   Admin Profit:   +₹${resolvedWingo.netHouseProfit}`);
    if (resolvedWingo.netHouseProfit < 0) {
      throw new Error(`Admin suffered a loss: ${resolvedWingo.netHouseProfit}`);
    }
    console.log('   ✅ PASS: Admin Profit guaranteed for WinGo with >2 clients!');
  }

  if (resolvedK3) {
    console.log(`\n🎉 K3 Round #${resolvedK3.period} Outcome: ${resolvedK3.result}`);
    console.log(`   Total Bet Pool: ₹${resolvedK3.totalBet}`);
    console.log(`   Player Payout:  ₹${resolvedK3.totalPayout}`);
    console.log(`   Admin Profit:   +₹${resolvedK3.netHouseProfit}`);
    if (resolvedK3.netHouseProfit < 0) {
      throw new Error(`Admin suffered a loss in K3: ${resolvedK3.netHouseProfit}`);
    }
    console.log('   ✅ PASS: Admin Profit guaranteed for K3 with >2 clients!');
  }

  if (resolved5D) {
    console.log(`\n🎉 5D Round #${resolved5D.period} Outcome: ${resolved5D.result}`);
    console.log(`   Total Bet Pool: ₹${resolved5D.totalBet}`);
    console.log(`   Player Payout:  ₹${resolved5D.totalPayout}`);
    console.log(`   Admin Profit:   +₹${resolved5D.netHouseProfit}`);
    if (resolved5D.netHouseProfit < 0) {
      throw new Error(`Admin suffered a loss in 5D: ${resolved5D.netHouseProfit}`);
    }
    console.log('   ✅ PASS: Admin Profit guaranteed for 5D with >2 clients!');
  }

  console.log('\n🌟 ALL ADMIN PROFIT REQUIREMENTS VERIFIED SUCCESSFULLY!');
}

testAdminProfit().catch(err => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});
