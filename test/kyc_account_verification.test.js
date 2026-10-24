/**
 * DiuWin Step 2: KYC & Account Verification Automated Test Suite
 *
 * Specifically verifies:
 * 1. Mobile number verified ho (Unverified mobile strictly rejected)
 * 2. User ka required KYC complete ho (Unverified/Rejected KYC strictly rejected)
 * 3. Withdrawal account user ke naam se verified ho (Mismatched holder name strictly rejected)
 * 4. Unverified account ko withdrawal allow na ho (Unverified account strictly rejected)
 */

const assert = require('assert');
const http = require('http');

const PORT = 3894;
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
  console.log('🛡️ Starting Step 2: KYC & Account Verification Test Suite...\n');
  const app = require('../server.js');
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 500));

  try {
    // -------------------------------------------------------------
    // Test 1: Mobile Number Verification Check
    // -------------------------------------------------------------
    console.log('--- 1. Testing Mobile Number Verified Requirement ---');
    const phone = '9876' + Math.floor(100000 + Math.random() * 900000);
    const regRes = await request('POST', '/api/auth/register', {
      phone,
      password: 'password123'
    });
    assert.strictEqual(regRes.status, 200);
    const userToken = regRes.body.user.token;
    const userId = regRes.body.user.id;

    // Simulate an unverified mobile state for this user
    const userInDb = app.db.users.find(u => u.id === userId);
    userInDb.isPhoneVerified = false;

    const withdrawAttempt1 = await request('POST', '/api/wallet/withdraw', {
      amount: 200,
      method: 'UPI',
      accountDetails: { upiId: 'test@upi', holderName: 'Player', verified: true }
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(withdrawAttempt1.status, 403, 'Unverified mobile should be rejected with 403');
    assert.ok(withdrawAttempt1.body.message.toLowerCase().includes('mobile'), 'Message should indicate mobile verification needed');
    console.log('  ✅ PASS: Unverified mobile number is strictly blocked from withdrawal');

    // Restore verified mobile status
    userInDb.isPhoneVerified = true;

    // -------------------------------------------------------------
    // Test 2: User ka required KYC complete ho
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Required KYC Complete Requirement ---');
    userInDb.kycStatus = 'UNVERIFIED';

    const withdrawAttempt2 = await request('POST', '/api/wallet/withdraw', {
      amount: 200,
      method: 'UPI',
      accountDetails: { upiId: 'test@upi', holderName: 'Player', verified: true }
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(withdrawAttempt2.status, 403, 'Incomplete KYC should be rejected with 403');
    assert.ok(withdrawAttempt2.body.message.includes('KYC'), 'Message should indicate KYC verification required');
    console.log('  ✅ PASS: UNVERIFIED KYC status strictly blocked with 403');

    // KYC REJECTED status
    userInDb.kycStatus = 'REJECTED';

    const withdrawAttempt2b = await request('POST', '/api/wallet/withdraw', {
      amount: 200,
      method: 'UPI',
      accountDetails: { upiId: 'test@upi', holderName: 'Player', verified: true }
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(withdrawAttempt2b.status, 403, 'REJECTED KYC should be rejected with 403');
    console.log('  ✅ PASS: REJECTED KYC status strictly blocked with 403');

    // Complete KYC
    userInDb.kycStatus = 'VERIFIED';
    userInDb.name = 'Rahul Sharma';

    // -------------------------------------------------------------
    // Test 3: Withdrawal account user ke naam se verified ho
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Withdrawal Account User Name Verification ---');
    // Account name mismatch: user is "Rahul Sharma", account holder is "Vikram Singh"
    const withdrawAttempt3 = await request('POST', '/api/wallet/withdraw', {
      amount: 200,
      method: 'BANK',
      accountDetails: {
        holderName: 'Vikram Singh',
        accountNumber: '987654321012',
        ifsc: 'HDFC0001234',
        verified: true
      }
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(withdrawAttempt3.status, 400, 'Mismatched account holder name must be rejected');
    assert.ok(withdrawAttempt3.body.message.includes('must match your verified account name'), 'Error message specifies name mismatch');
    console.log('  ✅ PASS: Withdrawal to different person account (Vikram Singh vs Rahul Sharma) is strictly rejected');

    // Request real withdrawal OTP
    const wdOtpRes = await request('POST', '/api/wallet/withdraw-otp', null, { Authorization: `Bearer ${userToken}` });
    const wdOtp = wdOtpRes.body.otp;

    // Matching account holder name: "Rahul Sharma"
    const withdrawAttempt3Match = await request('POST', '/api/wallet/withdraw', {
      amount: 200,
      method: 'BANK',
      accountDetails: {
        holderName: 'Rahul Sharma',
        accountNumber: '987654321012',
        ifsc: 'HDFC0001234',
        verified: true
      },
      otp: wdOtp
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(withdrawAttempt3Match.status, 200, 'Matching account holder name should succeed');
    assert.ok(withdrawAttempt3Match.body.success === true, 'Withdrawal succeeds for matching verified account');
    console.log('  ✅ PASS: Withdrawal to verified matching name account succeeds');

    // -------------------------------------------------------------
    // Test 4: Unverified account ko withdrawal allow na ho
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing Unverified Account Rejection ---');
    const withdrawAttempt4 = await request('POST', '/api/wallet/withdraw', {
      amount: 100,
      method: 'UPI',
      accountDetails: {
        upiId: 'rahul@oksbi',
        holderName: 'Rahul Sharma',
        verified: false // Explicitly unverified account
      }
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(withdrawAttempt4.status, 400, 'Unverified account should be rejected');
    assert.ok(withdrawAttempt4.body.message.toLowerCase().includes('unverified'), 'Message states unverified account');
    console.log('  ✅ PASS: Explicitly unverified account is strictly rejected');

    console.log('\n🎉 ALL 4 KYC & ACCOUNT VERIFICATION RULES RIGOROUSLY VALIDATED!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

runTests();
