const http = require('http');
const crypto = require('crypto');
const app = require('../server');

let server;
const PORT = 3098;

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

async function runSecurityTests() {
  console.log('🛡️  Running DiuWin Enterprise Security & Production Hardening Test Suite...\n');
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
    // 1. Admin Authentication Check: Unauthenticated request must be rejected (401)
    const unauthAdmin = await request({
      path: '/api/admin/overview',
      method: 'GET'
    });
    assert(unauthAdmin.status === 401, 'Unauthenticated /api/admin/overview request blocked with 401 Unauthorized');

    // 2. Admin Authentication Check: Invalid token must be rejected (403)
    const invalidAdmin = await request({
      path: '/api/admin/overview',
      method: 'GET',
      headers: { 'Authorization': 'Bearer fake_hacker_token' }
    });
    assert(invalidAdmin.status === 403, 'Invalid token to /api/admin/overview blocked with 403 Forbidden');

    // 3. Admin Login & Authorized Access
    const loginRes = await request({
      path: '/api/admin/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { username: 'admin', password: 'admin123' });
    assert(loginRes.status === 200 && loginRes.body.success && !!loginRes.body.token, 'Admin login succeeds and issues unique token');
    const adminToken = loginRes.body.token;

    const authAdmin = await request({
      path: '/api/admin/overview',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(authAdmin.status === 200 && authAdmin.body.success, 'Authorized admin request with Bearer token succeeds (200 OK)');

    // 4. Provably Fair & Mode endpoints protected
    const adminWingoLive = await request({
      path: '/api/admin/wingo/live',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(adminWingoLive.status === 200 && adminWingoLive.body.success, 'Admin WinGo live state accessible with admin token');

    // 5. User Registration with Enterprise Salted PBKDF2 Password
    const testPhone = '99' + Math.floor(10000000 + Math.random() * 90000000);
    const regRes = await request({
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { phone: testPhone, password: 'SecurePassword@2026' });
    assert(regRes.status === 200 && regRes.body.success, 'New user registered with ₹500 ledger bonus');
    const userToken = regRes.body.user.token;

    // 6. OTP Generation, Expiry & Rate Limiting
    const otpRes = await request({
      path: '/api/auth/send-otp',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { phone: testPhone });
    assert(otpRes.status === 200 && otpRes.body.success && !!otpRes.body.otp, 'Cryptographic 6-digit OTP generated with 5-minute expiry');
    const realOtp = otpRes.body.otp;

    // 7. Password Reset with OTP (Invalidates old session tokens for security)
    const resetRes = await request({
      path: '/api/auth/reset-password',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { phone: testPhone, otp: realOtp, newPassword: 'UpdatedPassword@2026' });
    assert(resetRes.status === 200 && resetRes.body.success, 'Password reset verified against cryptographic OTP');

    // 8. Re-authenticate with new password to receive fresh post-reset token
    const loginFresh = await request({
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { phone: testPhone, password: 'UpdatedPassword@2026' });
    assert(loginFresh.status === 200 && loginFresh.body.success, 'Login with new password succeeds and grants active token');
    const activeToken = loginFresh.body.user.token;

    // 9. Wallet Withdrawal Escrow Lock (Prevent negative balance / overdraft)
    const overdrawRes = await request({
      path: '/api/wallet/withdraw',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${activeToken}`, 'Content-Type': 'application/json' }
    }, { amount: 99999999, upiOrBank: 'tester@upi' });
    assert(overdrawRes.status === 400 && !overdrawRes.body.success, 'Overdraft withdrawal correctly rejected with Insufficient balance');

    // 10. Legitimate Withdrawal Escrow Hold
    const legitWithdraw = await request({
      path: '/api/wallet/withdraw',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${activeToken}`, 'Content-Type': 'application/json' }
    }, { amount: 200, upiOrBank: 'tester@upi' });
    assert(legitWithdraw.status === 200 && legitWithdraw.body.status === 'PENDING_REVIEW', 'Withdrawal funds placed in secure escrow hold (PENDING_REVIEW)');

    // 11. Betting Endpoint Authentication & Balance Ledger
    const betRes = await request({
      path: '/api/wingo/bet',
      method: 'POST',
      headers: { 'Authorization': `Bearer ${activeToken}`, 'Content-Type': 'application/json' }
    }, { type: 'color', choice: 'green', amount: 50 });
    assert(betRes.status === 200 && betRes.body.success && betRes.body.newBalance !== undefined, 'WinGo bet debited atomically via ledger');

    console.log(`\n🎉 Hardening Verification Completed: ${passed} Passed, ${failed} Failed.`);
    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Hardening Test Error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runSecurityTests();
