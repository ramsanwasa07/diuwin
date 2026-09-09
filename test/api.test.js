const http = require('http');
const app = require('../server');

let server;
const PORT = 3099;

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request({ ...options, port: PORT, host: '127.0.0.1' }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting DiuWin Backend Automated Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  server = app.listen(PORT);

  try {
    // 1. Guest Auth
    const guestRes = await request({
      path: '/api/auth/guest',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    assert(guestRes.status === 200 && guestRes.body.success, 'Guest auth endpoint works');
    const token = guestRes.body.user.token;
    assert(!!token, 'Received valid session token');

    // 2. Profile check & DiuWin official alias
    const profileRes = await request({
      path: '/api/user/profile',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert(profileRes.status === 200 && profileRes.body.user.balance >= 0, 'User profile fetched with balance');
    const initialBalance = profileRes.body.user.balance;

    const webapiRes = await request({
      path: '/api/webapi/GetUserInfo',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert(webapiRes.status === 200 && webapiRes.body.status && webapiRes.body.data.money_user !== undefined, 'Official /api/webapi/GetUserInfo works');

    // 3. Deposit money
    const depositRes = await request({
      path: '/api/wallet/deposit',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    }, { amount: 500, method: 'UPI' });
    assert(depositRes.status === 200 && depositRes.body.newBalance === initialBalance + 500, 'Wallet deposit ₹500 credited correctly');

    // 4. Play Aviator
    const aviatorRes = await request({
      path: '/api/games/play',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    }, { gameId: 'aviator', betAmount: 50, choice: 1.5 });
    assert(aviatorRes.status === 200 && aviatorRes.body.success && aviatorRes.body.bet.outcomeDetails.crashedAt !== undefined, 'Aviator crash flight bet processed');

    // 5. Play WinGo 1Min
    const wingoRes = await request({
      path: '/api/games/play',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    }, { gameId: 'wingo', betAmount: 30, choice: 'green' });
    assert(wingoRes.status === 200 && wingoRes.body.bet.outcomeDetails.luckyColor !== undefined, 'WinGo lottery color bet processed');

    // 6. Play K3 Lottery
    const k3Res = await request({
      path: '/api/games/play',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    }, { gameId: 'k3', betAmount: 20, choice: 'big' });
    assert(k3Res.status === 200 && Array.isArray(k3Res.body.bet.outcomeDetails.dice), 'K3 3-Dice lottery bet processed');

    // 7. Play Mines & Slots
    const minesRes = await request({
      path: '/api/games/play',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    }, { gameId: 'mines', betAmount: 20 });
    assert(minesRes.status === 200 && minesRes.body.bet.outcomeDetails.reels.length === 3, 'Mines slot bet processed');

    // 8. Play Wheel of Fortune
    const wheelRes = await request({
      path: '/api/games/play',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    }, { gameId: 'lucky_spin', betAmount: 10 });
    assert(wheelRes.status === 200 && wheelRes.body.bet.outcomeDetails.targetAngle !== undefined, 'Wheel of fortune bet processed');

    // 9. Check Live Wins
    const winsRes = await request({
      path: '/api/games/live-wins',
      method: 'GET'
    });
    assert(winsRes.status === 200 && Array.isArray(winsRes.body.wins) && winsRes.body.wins.length > 0, 'Live winning stream returned records');

    // 10. Wallet Withdrawal
    const withdrawRes = await request({
      path: '/api/wallet/withdraw',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    }, { amount: 100, upiOrBank: 'tester@upi' });
    assert(withdrawRes.status === 200 && withdrawRes.body.success, 'Wallet withdrawal request processed');

    // 11. Activity Check-In
    const checkinRes = await request({
      path: '/api/activity/checkin',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    assert(checkinRes.status === 200 && checkinRes.body.bonus === 50, 'Activity daily check-in credited ₹50 reward');

    // 12. Promotion Claim
    const promoRes = await request({
      path: '/api/promotion/claim',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    assert(promoRes.status === 200 && promoRes.body.amount === 320.50, 'Promotion commission claimed to balance');

    // 13. Redeem Gift Code
    const giftRes = await request({
      path: '/api/activity/redeem-gift',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    }, { code: 'DIUWIN100' });
    assert(giftRes.status === 200 && giftRes.body.bonus === 100, 'Gift code DIUWIN100 redeemed for ₹100');

    console.log(`\n🎉 Test Suite Completed: ${passed} Passed, ${failed} Failed.`);
    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test Suite Error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTests();
