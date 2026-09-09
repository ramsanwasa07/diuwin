const assert = require('assert');

async function runBetHistoryTests() {
  console.log('🧪 Testing Bet Profit/Loss & Main Balance Sync...');

  // 1. Guest login
  const authRes = await fetch('http://localhost:3000/api/auth/guest', { method: 'POST' });
  const authData = await authRes.json();
  assert(authData.success, 'Auth failed');
  const token = authData.token;
  const initialBalance = authData.user.balance;

  // 2. Place a winning bet
  const winBetRes = await fetch('http://localhost:3000/api/games/record-bet', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      gameId: 'wingo',
      gameName: 'WinGo 1Min',
      period: '2026090310999',
      betAmount: 100,
      winAmount: 200,
      multiplier: 2.0,
      choice: 'green',
      details: 'Select Green'
    })
  });
  const winBetData = await winBetRes.json();
  assert(winBetData.success, 'Win bet record failed');
  assert.strictEqual(winBetData.bet.profitOrLoss, 100, 'Profit calculation mismatch');
  assert.strictEqual(winBetData.newBalance, Number((initialBalance + 100).toFixed(2)), 'Main balance not credited correctly');

  // 3. Place a losing bet
  const lossBetRes = await fetch('http://localhost:3000/api/games/record-bet', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      gameId: 'k3',
      gameName: 'K3 3-Dice',
      period: '2026090310998',
      betAmount: 50,
      winAmount: 0,
      multiplier: 0,
      choice: 'Big',
      details: 'Big'
    })
  });
  const lossBetData = await lossBetRes.json();
  assert(lossBetData.success, 'Loss bet record failed');
  assert.strictEqual(lossBetData.bet.profitOrLoss, -50, 'Loss calculation mismatch');
  assert.strictEqual(lossBetData.newBalance, Number((winBetData.newBalance - 50).toFixed(2)), 'Main balance not debited correctly');

  // 4. Fetch My Bets History
  const historyRes = await fetch('http://localhost:3000/api/games/my-bets', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const historyData = await historyRes.json();
  assert(historyData.success, 'My bets history failed');
  assert(historyData.bets.length >= 2, 'History must contain recorded bets');

  const latestBet = historyData.bets[0];
  assert(latestBet.profitOrLoss === -50 || latestBet.profitOrLoss === 100, 'Profit/loss field present');

  console.log('✅ ALL TESTS PASSED: Profit & Loss successfully connected to Main Balance & Bet History verified!');
}

runBetHistoryTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
