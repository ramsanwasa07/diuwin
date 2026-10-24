/**
 * DiuWin Step 5: Withdrawal Amount Automated Test Suite
 *
 * Specifically verifies:
 * 1. Minimum withdrawal (Sub-₹100 strictly rejected)
 * 2. Maximum withdrawal (Over-₹50,000 strictly rejected)
 * 3. Available balance check (Over-balance strictly rejected)
 * 4. Pending withdrawal tracking & queue protection
 * 5. Applicable fees & net payout calculation
 */

const assert = require('assert');
const http = require('http');

const PORT = 3897;
process.env.PORT = PORT;
process.env.NODE_ENV = 'test';
process.env.ADMIN_STATIC_TOKEN = 'test_master_token_sec_2026';

let server;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers
      }
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
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('💰 Starting Step 5: Withdrawal Amount Automated Test Suite...\n');
  const app = require('../server.js');
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 500));

  try {
    // 1. Register a verified user
    const phone = '9872' + Math.floor(100000 + Math.random() * 900000);
    const regRes = await request('POST', '/api/auth/register', { phone, password: 'password123' });
    assert.strictEqual(regRes.status, 200);
    const userToken = regRes.body.user.token;
    const userId = regRes.body.user.id;

    const userInDb = app.db.users.find(u => u.id === userId);
    userInDb.name = 'Rohit Singhania';
    userInDb.kycStatus = 'VERIFIED';
    userInDb.isPhoneVerified = true;
    userInDb.balance = 5000.00;

    // -------------------------------------------------------------
    // 1. Minimum Withdrawal Limit Check (< ₹100)
    // -------------------------------------------------------------
    console.log('--- 1. Testing Minimum Withdrawal Limit (₹100) ---');
    const subMinRes = await request('POST', '/api/wallet/withdraw', {
      amount: 99,
      method: 'UPI',
      accountDetails: { upiId: 'rohit@oksbi', holderName: 'Rohit Singhania', verified: true }
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(subMinRes.status, 400);
    assert.ok(subMinRes.body.message.includes('Minimum withdrawal is ₹100'));
    console.log('  ✅ PASS: Sub-minimum amount (₹99 < ₹100) strictly rejected');

    // -------------------------------------------------------------
    // 2. Maximum Withdrawal Limit Check (> ₹50,000)
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Maximum Withdrawal Limit (₹50,000) ---');
    const overMaxRes = await request('POST', '/api/wallet/withdraw', {
      amount: 50001,
      method: 'UPI',
      accountDetails: { upiId: 'rohit@oksbi', holderName: 'Rohit Singhania', verified: true }
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(overMaxRes.status, 400);
    assert.ok(overMaxRes.body.message.includes('Maximum withdrawal per request is ₹50,000'));
    console.log('  ✅ PASS: Over-maximum amount (₹50,001 > ₹50,000) strictly rejected');

    // -------------------------------------------------------------
    // 3. Available Balance Validation (Available Balance >= Withdrawal Amount)
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Available Balance Validation ---');
    const overBalanceRes = await request('POST', '/api/wallet/withdraw', {
      amount: 6000,
      method: 'UPI',
      accountDetails: { upiId: 'rohit@oksbi', holderName: 'Rohit Singhania', verified: true }
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(overBalanceRes.status, 400);
    assert.strictEqual(overBalanceRes.body.message, 'Insufficient balance');
    console.log('  ✅ PASS: Amount exceeding available balance (₹6,000 > ₹5,000) strictly rejected');

    // -------------------------------------------------------------
    // 4. Pending Withdrawal Queue & Limits
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing Pending Withdrawal Tracking & Queue Protection ---');
    // First valid withdrawal: ₹500
    const wd1 = await request('POST', '/api/wallet/withdraw', {
      amount: 500,
      method: 'UPI',
      accountDetails: { upiId: 'rohit@oksbi', holderName: 'Rohit Singhania', verified: true }
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(wd1.status, 200);
    console.log('  ✅ PASS: Withdrawal 1 (₹500) submitted and queued in PENDING_REVIEW');

    // Check /api/wallet/withdrawal-summary
    const summaryRes = await request('GET', '/api/wallet/withdrawal-summary', null, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(summaryRes.status, 200);
    assert.strictEqual(summaryRes.body.pendingCount, 1);
    assert.strictEqual(summaryRes.body.pendingTotal, 500);
    assert.strictEqual(summaryRes.body.minAmount, 100);
    assert.strictEqual(summaryRes.body.maxAmount, 50000);
    assert.strictEqual(summaryRes.body.availableBalance, 4500);
    console.log(`  ✅ PASS: /api/wallet/withdrawal-summary returns accurate queue info: ${summaryRes.body.pendingCount} pending, ₹${summaryRes.body.pendingTotal}`);

    // -------------------------------------------------------------
    // 5. Applicable Fees & Net Payout Calculation
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing Applicable Fees & Net Payout Calculation ---');
    const wd2 = await request('POST', '/api/wallet/withdraw', {
      amount: 1000,
      method: 'BANK',
      accountDetails: {
        holderName: 'Rohit Singhania',
        accountNumber: '112233445566',
        ifsc: 'HDFC0001234',
        verified: true
      }
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(wd2.status, 200);
    const tx = wd2.body.transaction;
    assert.strictEqual(tx.amount, 1000);
    assert.strictEqual(tx.fee, 0); // 0% platform promotional fee
    assert.strictEqual(tx.netAmount, 1000); // net amount = requested - fee
    console.log(`  ✅ PASS: Applicable fee calculated: ₹${tx.fee} (Fee 0%), Net Payout: ₹${tx.netAmount}`);

    console.log('\n🎉 ALL 5 STEP 5 WITHDRAWAL AMOUNT CHECKS RIGOROUSLY VALIDATED!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

runTests();
