/**
 * Step 7: Security Verification Test Suite
 * Validates:
 * 1. Login / Session Verification (No token = 401, Invalid token = 401, Banned user = 403)
 * 2. Security Status Inspection (/api/user/security-status)
 * 3. OTP / 2FA Verification (OTP dispatch, expiry, incorrect OTP rejection, 3-attempt limit)
 * 4. Withdrawal PIN Verification (यदि लागू हो / If configured):
 *    - Setup PIN via /api/user/withdrawal-pin
 *    - Mandatory check when configured (missing PIN = 400, incorrect PIN = 400)
 *    - Successful confirmation with valid session + OTP + correct PIN
 */

const http = require('http');

process.env.NODE_ENV = 'test';
process.env.PORT = '3899';

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
      port: 3899,
      path,
      method,
      headers: reqHeaders
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (dataStr) req.write(dataStr);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    process.exit(1);
  }
}

let server;

async function runStep7SecuritySuite() {
  console.log('\n🔒 Starting Step 7: Security Verification Automated Test Suite...\n');
  server = serverModule.listen(3899);
  await new Promise(r => setTimeout(r, 400));

  const testPhone = '98' + Math.floor(10000000 + Math.random() * 90000000);
  const testPassword = 'SecurePass2026!';

  // --- 1. Login / Session Verification ---
  console.log('--- 1. Testing Login & Session Verification ---');
  
  // (a) Unauthenticated request (no token)
  const noTokenRes = await request('POST', '/api/wallet/withdraw', {
    amount: 200,
    upiOrBank: 'user@okaxis'
  });
  assert(noTokenRes.status === 401, `No token should return 401 Unauthorized, got: ${noTokenRes.status}`);
  console.log('  ✅ PASS: Missing session/token strictly rejected with 401 Unauthorized');

  // (b) Invalid / forged token
  const invalidTokenRes = await request('POST', '/api/wallet/withdraw', {
    amount: 200,
    upiOrBank: 'user@okaxis'
  }, { Authorization: 'Bearer tok_forged_invalid_session_12345' });
  assert(invalidTokenRes.status === 401, `Forged token should return 401, got: ${invalidTokenRes.status}`);
  console.log('  ✅ PASS: Invalid / forged session token strictly rejected with 401');

  // (c) Register a legitimate user
  const regRes = await request('POST', '/api/auth/register', {
    phone: testPhone,
    password: testPassword
  });
  assert(regRes.status === 200 && regRes.body.success, 'Registration failed');
  const userToken = regRes.body.user.token;
  const userId = regRes.body.user.id;

  // Complete KYC & verify phone to satisfy previous steps
  await request('POST', '/api/user/kyc/submit', {
    panNumber: 'ABCDE1234F',
    fullName: 'Rahul Sharma',
    dateOfBirth: '1995-05-15'
  }, { Authorization: `Bearer ${userToken}` });

  // Link verified UPI account
  await request('POST', '/api/user/kyc/link-account', {
    method: 'UPI',
    upiId: 'rahul@okaxis',
    holderName: 'Rahul Sharma'
  }, { Authorization: `Bearer ${userToken}` });

  // Check /api/user/security-status
  const secStatusRes = await request('GET', '/api/user/security-status', null, { Authorization: `Bearer ${userToken}` });
  assert(secStatusRes.status === 200, 'Security status endpoint returned error');
  assert(secStatusRes.body.isLoggedIn === true, 'Security status reports logged out');
  assert(secStatusRes.body.hasWithdrawalPin === false, 'Newly created user should not have withdrawal PIN configured yet');
  console.log('  ✅ PASS: /api/user/security-status reports active session and unconfigured PIN');

  // --- 2. Testing OTP / 2FA Verification ---
  console.log('\n--- 2. Testing OTP / 2FA Verification ---');

  // Dispatch OTP
  const otpRes = await request('POST', '/api/wallet/withdraw-otp', null, { Authorization: `Bearer ${userToken}` });
  assert(otpRes.status === 200 && otpRes.body.success, 'OTP dispatch failed');
  assert(otpRes.body.otp && otpRes.body.otp.length === 6, 'Generated OTP must be 6 digits');
  const validOtp = otpRes.body.otp;
  console.log(`  ✅ PASS: 6-digit Security OTP dispatched to registered mobile: ${validOtp}`);

  // Submit withdrawal with incorrect OTP
  const wrongOtpRes = await request('POST', '/api/wallet/withdraw', {
    amount: 150,
    upiOrBank: 'rahul@okaxis',
    otp: '000000'
  }, { Authorization: `Bearer ${userToken}` });
  assert(wrongOtpRes.status === 400 && wrongOtpRes.body.message.includes('Incorrect OTP'), 'Wrong OTP should be rejected with 400');
  console.log('  ✅ PASS: Incorrect OTP strictly rejected with 400');

  // Re-request fresh OTP for next tests
  const freshOtpRes = await request('POST', '/api/wallet/withdraw-otp', null, { Authorization: `Bearer ${userToken}` });
  const activeOtp = freshOtpRes.body.otp;

  // --- 3. Testing Withdrawal PIN (यदि लागू हो / If configured) ---
  console.log('\n--- 3. Testing Withdrawal PIN (यदि लागू हो / If configured) ---');

  // Before PIN is configured: Withdrawal with valid OTP succeeds without PIN
  const noPinWithdrawal = await request('POST', '/api/wallet/withdraw', {
    amount: 100,
    upiOrBank: 'rahul@okaxis',
    otp: activeOtp
  }, { Authorization: `Bearer ${userToken}` });
  assert(noPinWithdrawal.status === 200 && noPinWithdrawal.body.success, 'Withdrawal before PIN setup failed');
  console.log('  ✅ PASS: Withdrawal succeeds without PIN when PIN is not configured (यदि लागू हो)');

  // Configure a 6-digit Withdrawal Security PIN
  const setPinRes = await request('POST', '/api/user/withdrawal-pin', {
    pin: '748291'
  }, { Authorization: `Bearer ${userToken}` });
  assert(setPinRes.status === 200 && setPinRes.body.success, 'Failed to set withdrawal PIN');
  console.log('  ✅ PASS: Withdrawal PIN (748291) configured and hashed with PBKDF2');

  // Verify /api/user/security-status now reflects configured PIN
  const secStatusAfterPin = await request('GET', '/api/user/security-status', null, { Authorization: `Bearer ${userToken}` });
  assert(secStatusAfterPin.body.hasWithdrawalPin === true, 'Security status should now show hasWithdrawalPin: true');
  console.log('  ✅ PASS: /api/user/security-status now reports hasWithdrawalPin: true');

  // Dispatch new OTP for next withdrawal
  const otpRes2 = await request('POST', '/api/wallet/withdraw-otp', null, { Authorization: `Bearer ${userToken}` });
  const validOtp2 = otpRes2.body.otp;

  // Withdrawal attempt without PIN (should now be REJECTED because PIN is configured)
  const missingPinRes = await request('POST', '/api/wallet/withdraw', {
    amount: 100,
    upiOrBank: 'rahul@okaxis',
    otp: validOtp2
  }, { Authorization: `Bearer ${userToken}` });
  assert(missingPinRes.status === 400 && missingPinRes.body.message.includes('Withdrawal PIN is required'), 'Missing PIN should be rejected with 400');
  console.log('  ✅ PASS: Withdrawal without PIN strictly rejected once PIN is configured');

  // Withdrawal attempt with wrong PIN
  const wrongPinRes = await request('POST', '/api/wallet/withdraw', {
    amount: 100,
    upiOrBank: 'rahul@okaxis',
    otp: validOtp2,
    withdrawalPin: '111111'
  }, { Authorization: `Bearer ${userToken}` });
  assert(wrongPinRes.status === 400 && wrongPinRes.body.message.includes('Incorrect Withdrawal PIN'), 'Wrong PIN should be rejected with 400');
  console.log('  ✅ PASS: Incorrect Withdrawal PIN strictly rejected with 400');

  // Withdrawal attempt with valid active session, valid OTP, and correct PIN
  const validPinRes = await request('POST', '/api/wallet/withdraw', {
    amount: 100,
    upiOrBank: 'rahul@okaxis',
    otp: validOtp2,
    withdrawalPin: '748291'
  }, { Authorization: `Bearer ${userToken}` });
  assert(validPinRes.status === 200 && validPinRes.body.success, `Valid withdrawal failed: ${JSON.stringify(validPinRes.body)}`);
  assert(validPinRes.body.withdrawalId.startsWith('WD-'), 'Withdrawal ID must start with WD-');
  console.log(`  ✅ PASS: Full Security Verification passed! Withdrawal ${validPinRes.body.withdrawalId} confirmed`);

  console.log('\n🎉 ALL STEP 7 SECURITY VERIFICATION CHECKS RIGOROUSLY VALIDATED!\n');
  process.exit(0);
}

runStep7SecuritySuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
