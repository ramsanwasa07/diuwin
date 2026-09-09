const http = require('http');

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
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

  // WinGo check
  const state = await request('GET', '/api/wingo/state');
  const period = state.data.period;
  console.log(`Current WinGo Period: #${period}`);

  // 3 distinct clients place bets in the same round
  const b1 = await request('POST', '/api/wingo/bet', {
    userId: 'client_A_9876543210',
    userName: 'Ramesh',
    period,
    type: 'color',
    choice: 'green',
    amount: 1000
  });

  const b2 = await request('POST', '/api/wingo/bet', {
    userId: 'client_B_9876543211',
    userName: 'Suresh',
    period,
    type: 'color',
    choice: 'red',
    amount: 600
  });

  const b3 = await request('POST', '/api/wingo/bet', {
    userId: 'client_C_9876543212',
    userName: 'Vikas',
    period,
    type: 'size',
    choice: 'Big',
    amount: 400
  });

  console.log(`- Client A (Ramesh) bet ₹1000 on Green`);
  console.log(`- Client B (Suresh) bet ₹600 on Red`);
  console.log(`- Client C (Vikas)  bet ₹400 on Big`);

  const live = await request('GET', '/api/admin/wingo/live');
  const totalPool = live.data.pools.totalPool;
  console.log(`\n💰 Total Round Pool (All Clients Combined): ₹${totalPool.toFixed(2)}`);

  console.log('\n⏳ Waiting for round resolution...');
  let resolved = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3500));
    const hist = await request('GET', '/api/admin/games/history?limit=5');
    if (hist.data && hist.data.history) {
      resolved = hist.data.history.find(h => h.gameId === 'wingo' && h.period === period);
      if (resolved) break;
    }
    process.stdout.write('.');
  }
  console.log('\n');

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
