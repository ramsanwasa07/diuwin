process.env.NODE_ENV = 'test';
const http = require('http');
const crypto = require('crypto');
const app = require('../server');

let server;
const PORT = 3094;

function request(options, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = data ? JSON.stringify(data) : null;
    const req = http.request({
      ...options,
      port: PORT,
      host: '127.0.0.1',
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...headers
      }
    }, (res) => {
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
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function runWalletProductionTests() {
  console.log('💳 Starting DiuWin Production Wallet & Money System Test Suite...\n');
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
    // 1. Authenticate Admin dynamically
    const adminLogin = await request({ method: 'POST', path: '/api/admin/login' }, { username: 'admin', password: 'admin123' });
    const adminToken = adminLogin.body.token;
    assert(adminToken, 'Admin dynamically authenticated for audit inspections');

    // 2. Register fresh test user
    const testPhone = '97' + Math.floor(10000000 + Math.random() * 90000000);
    const regRes = await request({ method: 'POST', path: '/api/auth/register' }, { phone: testPhone, password: 'SecurePassword@123' });
    const userToken = regRes.body.user.token;
    const userId = regRes.body.user.id;
    assert(regRes.body.user.balance === 500, 'User created with ₹500 welcome bonus');

    // 3. ATOMIC LEDGER INTEGRITY TEST
    console.log('\n--- 1. Testing Atomic Ledger Integrity (balanceBefore + delta === balanceAfter) ---');
    const depRes = await request(
      { method: 'POST', path: '/api/wallet/deposit' },
      { amount: 300, method: 'UPI QR', autoApprove: true },
      { Authorization: `Bearer ${userToken}` }
    );
    assert(depRes.status === 200, 'Deposit request accepted');
    assert(depRes.body.newBalance === 800, 'Balance updated to ₹800');
    assert(depRes.body.balanceBefore === 500, 'balanceBefore accurately recorded as ₹500');
    assert(depRes.body.transaction.auditHash && depRes.body.transaction.auditHash.length === 64, 'Cryptographic SHA-256 auditHash attached to ledger record');

    // Verify audit hash match
    const tx = depRes.body.transaction;
    const expectedPayload = `${tx.id}:${userId}:${tx.type}:${tx.amount}:${tx.balanceBefore}:${tx.balanceAfter}:${tx.createdAt}`;
    const expectedHash = crypto.createHash('sha256').update(expectedPayload).digest('hex');
    assert(tx.auditHash === expectedHash, 'Ledger transaction auditHash matches calculated SHA-256 signature');

    // 4. IDEMPOTENCY DEDUPLICATION TEST
    console.log('\n--- 2. Testing Idempotency (Duplicate Payment Prevention) ---');
    const idemKey = 'IDEM_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const firstCall = await request(
      { method: 'POST', path: '/api/wallet/deposit' },
      { amount: 200, autoApprove: true },
      { Authorization: `Bearer ${userToken}`, 'Idempotency-Key': idemKey }
    );
    assert(firstCall.status === 200 && firstCall.body.newBalance === 1000, 'Initial recharge of ₹200 processed. Balance: ₹1000');

    // Replay with identical Idempotency-Key 4 more times in parallel
    const replayPromises = Array.from({ length: 4 }).map(() =>
      request(
        { method: 'POST', path: '/api/wallet/deposit' },
        { amount: 200, autoApprove: true },
        { Authorization: `Bearer ${userToken}`, 'Idempotency-Key': idemKey }
      )
    );
    const replays = await Promise.all(replayPromises);
    const allReplaysMatch = replays.every(r => r.status === 200 && r.body.newBalance === 1000);
    assert(allReplaysMatch, 'All 4 idempotent re-requests safely returned cached result without re-crediting');

    // Verify user balance did not increase to ₹1800
    const profileRes = await request(
      { method: 'GET', path: '/api/user/profile' },
      null,
      { Authorization: `Bearer ${userToken}` }
    );
    assert(profileRes.body.user.balance === 1000, 'User balance is strictly ₹1000 (No duplicate money created)');

    // 5. DUPLICATE UTR PREVENTION TEST
    console.log('\n--- 3. Testing Duplicate UTR Rejection ---');
    const fixedUtr = 'UTR_VERIFY_' + Date.now();
    const utrCall1 = await request(
      { method: 'POST', path: '/api/wallet/deposit' },
      { amount: 150, utrNumber: fixedUtr, autoApprove: true },
      { Authorization: `Bearer ${userToken}` }
    );
    assert(utrCall1.status === 200, 'First deposit with unique UTR accepted');

    const utrCall2 = await request(
      { method: 'POST', path: '/api/wallet/deposit' },
      { amount: 150, utrNumber: fixedUtr, autoApprove: true },
      { Authorization: `Bearer ${userToken}` }
    );
    assert(utrCall2.status === 409, 'Second deposit with same UTR rejected with 409 Conflict (DUPLICATE_UTR)');

    // 6. RACE-CONDITION & OVERDRAFT CONCURRENCY TEST
    console.log('\n--- 4. Testing High-Concurrency Race Condition & Negative Balance Protection ---');
    // Create dedicated user with exactly ₹100 balance
    const raceUserPhone = '96' + Math.floor(10000000 + Math.random() * 90000000);
    const raceReg = await request({ method: 'POST', path: '/api/auth/register' }, { phone: raceUserPhone, password: 'Password@123' });
    const raceToken = raceReg.body.user.token;
    const raceUid = raceReg.body.user.id;

    // Reset balance to exactly ₹100 via adjustBalance helper
    const initAdj = app.adjustBalance(raceUid, -400, 'TEST_SETUP', 'Reset to 100');
    assert(initAdj.newBalance === 100, 'Race-test user prepared with exactly ₹100 balance');

    // Fire 20 parallel withdrawal requests of ₹100 at the exact same millisecond
    const parallelRequests = Array.from({ length: 20 }).map((_, i) =>
      request(
        { method: 'POST', path: '/api/wallet/withdraw' },
        { amount: 100, upiOrBank: 'user@okhdfcbank' },
        { Authorization: `Bearer ${raceToken}` }
      )
    );

    const raceResults = await Promise.all(parallelRequests);
    const successCount = raceResults.filter(r => r.status === 200).length;
    const failCount = raceResults.filter(r => r.status === 400).length;

    assert(successCount === 1, `Exactly ONE withdrawal succeeded out of 20 concurrent requests (Succeeded: ${successCount})`);
    assert(failCount === 19, `Remaining 19 concurrent requests safely failed with 400 Insufficient balance (Failed: ${failCount})`);

    const finalRaceProfile = await request({ method: 'GET', path: '/api/user/profile' }, null, { Authorization: `Bearer ${raceToken}` });
    assert(finalRaceProfile.body.user.balance === 0, `User balance is exactly ₹0.00 (Zero overdraft, zero negative balance: ${finalRaceProfile.body.user.balance})`);

    // 7. WITHDRAWAL ESCROW HOLD & ADMIN REJECTION REFUND TEST
    console.log('\n--- 5. Testing Withdrawal Escrow Hold & Admin Refund ---');
    // Top up race user to ₹500
    app.adjustBalance(raceUid, 500, 'TEST_SETUP', 'Topup for escrow test');

    const withdrawReq = await request(
      { method: 'POST', path: '/api/wallet/withdraw' },
      { amount: 250, upiOrBank: 'tester@upi' },
      { Authorization: `Bearer ${raceToken}` }
    );
    assert(withdrawReq.status === 200, 'Withdrawal request of ₹250 accepted');
    assert(withdrawReq.body.newBalance === 250, '₹250 immediately locked into escrow; available balance: ₹250');
    assert(withdrawReq.body.status === 'PENDING_REVIEW', 'Transaction created with PENDING_REVIEW status');

    const withdrawTxId = withdrawReq.body.transaction.id;

    // Admin rejects the withdrawal request
    const adminRejectRes = await request(
      { method: 'POST', path: '/api/admin/transactions/action' },
      { txId: withdrawTxId, action: 'reject' },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(adminRejectRes.status === 200, 'Admin successfully rejected withdrawal');
    assert(adminRejectRes.body.transaction.status === 'REJECTED', 'Transaction status marked as REJECTED');

    // Verify balance refunded to ₹500
    const refundProfile = await request({ method: 'GET', path: '/api/user/profile' }, null, { Authorization: `Bearer ${raceToken}` });
    assert(refundProfile.body.user.balance === 500, 'Escrowed funds of ₹250 atomically refunded back to user balance (Balance: ₹500)');

    // Attempt double reject/approve on already finalized transaction
    const doubleActionRes = await request(
      { method: 'POST', path: '/api/admin/transactions/action' },
      { txId: withdrawTxId, action: 'approve' },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(doubleActionRes.status === 400, 'Double action on finalized transaction strictly blocked with 400 Bad Request');

  } catch (err) {
    console.error('❌ Unexpected test runner error:', err);
    failed++;
  } finally {
    if (server) server.close();
  }

  console.log(`\n🎉 Production Wallet System Test Results: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runWalletProductionTests();
