const assert = require('assert');
const http = require('http');

const PORT = 3899;
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
  console.log('🛡️ Starting KYC: Mobile OTP & Withdrawal PIN Test Suite...\n');
  const app = require('../server.js');
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  try {
    // 1. Register a new real user
    console.log('--- 1. Registering user for KYC verification ---');
    const phone = '987' + Math.floor(1000000 + Math.random() * 9000000);
    const regRes = await request('POST', '/api/auth/register', {
      phone,
      password: 'testPassword123'
    });
    assert.strictEqual(regRes.status, 200);
    const userToken = regRes.body.user.token;
    const userId = regRes.body.user.id;
    console.log('  ✅ PASS: User registered with phone:', phone);

    // Initial KYC status check
    const kycStatusRes1 = await request('GET', '/api/user/kyc', null, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(kycStatusRes1.status, 200);
    assert.strictEqual(kycStatusRes1.body.kycStatus, 'UNVERIFIED');
    console.log('  ✅ PASS: Initial KYC status is UNVERIFIED');

    // 2. Request KYC OTP
    console.log('\n--- 2. Requesting KYC OTP via /api/user/kyc/send-otp ---');
    const sendOtpRes = await request('POST', '/api/user/kyc/send-otp', { phone }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(sendOtpRes.status, 200);
    assert.strictEqual(sendOtpRes.body.success, true);
    assert.ok(sendOtpRes.body.otp, 'Response should contain OTP');
    assert.strictEqual(String(sendOtpRes.body.otp).length, 6, 'OTP must be 6 digits');
    const receivedOtp = sendOtpRes.body.otp;
    console.log('  ✅ PASS: Received 6-digit cryptographic OTP:', receivedOtp);

    // 3. Validation: Mismatched PIN should fail
    console.log('\n--- 3. Testing PIN mismatch rejection ---');
    const mismatchRes = await request('POST', '/api/user/kyc/submit', {
      otp: receivedOtp,
      withdrawalPin: '1234',
      confirmPin: '9999',
      phone
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(mismatchRes.status, 400);
    assert.strictEqual(mismatchRes.body.success, false);
    console.log('  ✅ PASS: PIN mismatch was rejected correctly with 400');

    // 4. Validation: Invalid OTP should fail
    console.log('\n--- 4. Testing Invalid OTP rejection ---');
    const invalidOtpRes = await request('POST', '/api/user/kyc/submit', {
      otp: '000000',
      withdrawalPin: '4321',
      confirmPin: '4321',
      phone
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(invalidOtpRes.status, 400);
    assert.strictEqual(invalidOtpRes.body.success, false);
    console.log('  ✅ PASS: Invalid OTP rejected correctly with 400');

    // 5. Successful KYC: Valid OTP + Set Withdrawal PIN
    console.log('\n--- 5. Submitting valid OTP & setting 4-digit Withdrawal PIN ---');
    const kycSuccessRes = await request('POST', '/api/user/kyc/submit', {
      otp: receivedOtp,
      withdrawalPin: '5678',
      confirmPin: '5678',
      phone
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(kycSuccessRes.status, 200);
    assert.strictEqual(kycSuccessRes.body.success, true);
    assert.strictEqual(kycSuccessRes.body.kycStatus, 'VERIFIED');
    assert.strictEqual(kycSuccessRes.body.hasWithdrawalPin, true);
    console.log('  ✅ PASS: KYC completed! Status: VERIFIED, hasWithdrawalPin: true');

    // 6. Verify security status endpoint
    console.log('\n--- 6. Verifying /api/user/security-status ---');
    const secRes = await request('GET', '/api/user/security-status', null, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(secRes.status, 200);
    assert.strictEqual(secRes.body.kycStatus, 'VERIFIED');
    assert.strictEqual(secRes.body.isPhoneVerified, true);
    assert.strictEqual(secRes.body.hasWithdrawalPin, true);
    console.log('  ✅ PASS: Security status confirms Phone Verified, KYC Verified & Withdrawal PIN configured');

    // 7. Test withdrawal with wrong Withdrawal PIN
    console.log('\n--- 7. Testing withdrawal rejection with wrong PIN ---');
    // Credit user balance so they can withdraw
    const userInDb = app.db.users.find(u => u.id === userId);
    userInDb.balance = 1000;

    // Request withdrawal OTP
    const wdOtpRes = await request('POST', '/api/wallet/withdraw-otp', null, { Authorization: `Bearer ${userToken}` });
    const wdOtp = wdOtpRes.body.otp;

    const wrongPinWd = await request('POST', '/api/wallet/withdraw', {
      amount: 200,
      method: 'UPI',
      accountDetails: { upiId: 'winner@upi', holderName: 'Test Winner', verified: true },
      otp: wdOtp,
      pin: '0000' // wrong PIN
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(wrongPinWd.status, 400);
    assert.ok(wrongPinWd.body.message.toLowerCase().includes('pin'), 'Error message should mention invalid PIN');
    console.log('  ✅ PASS: Withdrawal with wrong PIN was strictly rejected');

    // 8. Test withdrawal with CORRECT Withdrawal PIN
    console.log('\n--- 8. Testing successful withdrawal with correct Withdrawal PIN ---');
    const correctPinWd = await request('POST', '/api/wallet/withdraw', {
      amount: 200,
      method: 'UPI',
      accountDetails: { upiId: 'winner@upi', holderName: 'Test Winner', verified: true },
      otp: wdOtp,
      pin: '5678' // correct PIN
    }, { Authorization: `Bearer ${userToken}` });
    console.log('correctPinWd response:', correctPinWd.status, correctPinWd.body);
    assert.strictEqual(correctPinWd.status, 200);
    assert.strictEqual(correctPinWd.body.success, true);
    assert.strictEqual(correctPinWd.body.status, 'PENDING_REVIEW');
    console.log('  ✅ PASS: Withdrawal request submitted successfully with configured PIN!');

    console.log('\n🎉 ALL KYC MOBILE OTP & WITHDRAWAL PIN TESTS PASSED 100%!');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    if (server) server.close();
    process.exit(1);
  }
}

runTests();
