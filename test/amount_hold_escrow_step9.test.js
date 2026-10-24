/**
 * Step 9: Amount Hold / Escrow Lock Automated Test Suite
 * Specifically tests:
 * 1. Immediate available balance hold/reserve upon withdrawal submission
 *    Example from prompt:
 *      Initial Balance: ₹5,000
 *      Withdrawal: ₹2,000
 *      Available: ₹3,000
 *      Pending: ₹2,000
 * 2. Double-withdrawal / re-spend prevention:
 *    User cannot re-withdraw or spend the held ₹2,000 (e.g. withdrawing ₹4,000 on ₹3,000 available fails with 400).
 * 3. Concurrent escrow tracking:
 *    Multiple withdrawals correctly accumulate in pending escrow hold.
 * 4. GET /api/wallet/balance & GET /api/user/profile return accurate breakdown of available vs held funds.
 * 5. Escrow rollback:
 *    When a withdrawal is rejected, held funds are safely returned to available balance.
 */

const assert = require('assert');
const http = require('http');

const PORT = 3896;
process.env.PORT = PORT;
process.env.NODE_ENV = 'test';
process.env.ADMIN_STATIC_TOKEN = 'test_master_token_sec_2026';

let server;
const serverModule = require('../server');

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const dataStr = body ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (dataStr) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(dataStr);
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: reqHeaders
    }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, raw });
        }
      });
    });
    req.on('error', reject);
    if (dataStr) req.write(dataStr);
    req.end();
  });
}

async function runStep9Suite() {
  console.log('\n🔒 Starting Step 9: Amount Hold / Escrow Lock Automated Test Suite...\n');
  server = serverModule.listen(PORT);
  await new Promise(r => setTimeout(r, 400));

  try {
    // 1. Register a verified user
    const testPhone = '98' + Math.floor(10000000 + Math.random() * 90000000);
    const regRes = await request('POST', '/api/auth/register', {
      phone: testPhone,
      password: 'password123'
    });
    assert.strictEqual(regRes.status, 200);
    const userToken = regRes.body.user.token;
    const userId = regRes.body.user.id;

    // Complete KYC & link UPI
    await request('POST', '/api/user/kyc/submit', {
      panNumber: 'ABCDE1234F',
      fullName: 'Deepak Patel',
      dateOfBirth: '1990-01-01'
    }, { Authorization: `Bearer ${userToken}` });

    await request('POST', '/api/user/kyc/link-account', {
      method: 'UPI',
      upiId: 'deepak@okaxis',
      holderName: 'Deepak Patel'
    }, { Authorization: `Bearer ${userToken}` });

    // Set initial balance to exactly ₹5,000 as per prompt example
    // User gets 500 on signup, adjust balance by +4500
    serverModule.adjustBalance(userId, 4500, 'TEST_CREDIT', 'Setup balance to ₹5,000 for Step 9 test');

    // Verify initial balance
    const initBalRes = await request('GET', '/api/wallet/balance', null, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(initBalRes.body.availableBalance, 5000, 'Initial balance should be 5000');
    assert.strictEqual(initBalRes.body.pendingBalance, 0, 'Initial pending should be 0');
    console.log('--- 1. Initial State: Balance = ₹5,000 ---');
    console.log(`  Initial Available: ₹${initBalRes.body.availableBalance}, Pending: ₹${initBalRes.body.pendingBalance}`);

    // --- 2. Request ₹2,000 Withdrawal (Prompt Example) ---
    console.log('\n--- 2. Submitting ₹2,000 Withdrawal Request ---');
    const wd1Res = await request('POST', '/api/wallet/withdraw', {
      amount: 2000,
      method: 'UPI',
      upiOrBank: 'deepak@okaxis'
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(wd1Res.status, 200, 'Withdrawal of ₹2000 failed');
    const wd1 = wd1Res.body;

    // Verify hold: Available = 3000, Pending = 2000, Total = 5000
    assert.strictEqual(wd1.availableBalance, 3000, 'Available balance must be exactly ₹3,000');
    assert.strictEqual(wd1.pendingBalance, 2000, 'Pending escrow hold must be exactly ₹2,000');
    assert.strictEqual(wd1.totalBalance, 5000, 'Total balance must be ₹5,000');
    console.log(`  ✅ PASS: ₹2,000 immediately held!`);
    console.log(`     Available: ₹${wd1.availableBalance}`);
    console.log(`     Pending:   ₹${wd1.pendingBalance}`);
    console.log(`     Total:     ₹${wd1.totalBalance}`);

    // --- 3. Double-Spend / Re-Withdrawal Prevention ---
    console.log('\n--- 3. Testing Double-Spend / Re-Withdrawal Prevention ---');
    // User attempts to withdraw ₹4,000 (Available is only ₹3,000 because ₹2,000 is held)
    const overWithdrawRes = await request('POST', '/api/wallet/withdraw', {
      amount: 4000,
      method: 'UPI',
      upiOrBank: 'deepak@okaxis'
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(overWithdrawRes.status, 400, 'Re-withdrawal of held funds should be rejected');
    assert(overWithdrawRes.body.message.includes('Insufficient balance'), 'Must return Insufficient balance error');
    console.log('  ✅ PASS: Attempting to withdraw ₹4,000 on ₹3,000 available strictly rejected with 400 Insufficient Balance');

    // --- 4. Subsequent Permitted Withdrawal from Available Balance ---
    console.log('\n--- 4. Subsequent Withdrawal of ₹1,000 from Remaining ₹3,000 ---');
    const wd2Res = await request('POST', '/api/wallet/withdraw', {
      amount: 1000,
      method: 'UPI',
      upiOrBank: 'deepak@okaxis'
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(wd2Res.status, 200, 'Withdrawal 2 failed');
    const wd2 = wd2Res.body;
    assert.strictEqual(wd2.availableBalance, 2000, 'Available balance must now be ₹2,000');
    assert.strictEqual(wd2.pendingBalance, 3000, 'Pending balance must now accumulate to ₹3,000 (2000 + 1000)');
    assert.strictEqual(wd2.totalBalance, 5000, 'Total balance must remain ₹5,000');
    console.log(`  ✅ PASS: Second withdrawal of ₹1,000 successfully locked in escrow.`);
    console.log(`     Available: ₹${wd2.availableBalance}`);
    console.log(`     Pending:   ₹${wd2.pendingBalance} (2 in queue)`);
    console.log(`     Total:     ₹${wd2.totalBalance}`);

    // --- 5. Verify /api/wallet/balance and /api/user/profile ---
    console.log('\n--- 5. Verifying Balance & Profile Endpoints ---');
    const balCheck = await request('GET', '/api/wallet/balance', null, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(balCheck.body.availableBalance, 2000);
    assert.strictEqual(balCheck.body.heldInEscrow, 3000);
    assert.strictEqual(balCheck.body.totalBalance, 5000);
    assert.strictEqual(balCheck.body.pendingCount, 2);
    console.log('  ✅ PASS: /api/wallet/balance reports accurate escrow hold & available balance');

    const profileCheck = await request('GET', '/api/user/profile', null, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(profileCheck.body.user.availableBalance, 2000);
    assert.strictEqual(profileCheck.body.user.pendingWithdrawal, 3000);
    assert.strictEqual(profileCheck.body.user.totalBalance, 5000);
    console.log('  ✅ PASS: /api/user/profile reports accurate available & pending breakdown');

    // --- 6. Admin Rejection Rollback Test ---
    console.log('\n--- 6. Testing Escrow Restoration on Rejection ---');
    const adminToken = process.env.ADMIN_STATIC_TOKEN;
    const rejectAction = await request('POST', '/api/admin/transactions/action', {
      id: wd2.withdrawalId,
      action: 'REJECT',
      reason: 'User test rollback verification'
    }, { Authorization: `Bearer ${adminToken}` });

    assert.strictEqual(rejectAction.status, 200, 'Admin rejection failed');

    // Check balance after rejection: ₹1,000 must be safely returned to available balance
    const postRejectBal = await request('GET', '/api/wallet/balance', null, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(postRejectBal.body.availableBalance, 3000, 'Available balance should be restored to ₹3,000');
    assert.strictEqual(postRejectBal.body.heldInEscrow, 2000, 'Pending escrow should drop back to ₹2,000');
    console.log(`  ✅ PASS: Rejected ₹1,000 safely restored to Available Balance (Now ₹${postRejectBal.body.availableBalance})`);

    console.log('\n🎉 ALL STEP 9 AMOUNT HOLD & ESCROW LOCK CHECKS RIGOROUSLY VALIDATED!\n');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Fatal error in Step 9 tests:', err);
    if (server) server.close();
    process.exit(1);
  }
}

runStep9Suite();
