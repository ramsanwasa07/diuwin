/**
 * DiuWin Enterprise Production Hardening & Audit Verification Test Suite
 * Tests all 6 critical assessment domains:
 *  1. OTP Verification, Phone Normalization & Rate Limiting
 *  2. Server Startup & Safe Lifecycle Module Exports
 *  3. Lobby Games Play & Live Wins Integrity
 *  4. Admin Override Control across All 6 Core Games
 *  5. Admin Authentication & Token Verification Gate
 *  6. Real-Money Wallet Safety & Integer-Paise Ledger
 */

const assert = require('assert');
const http = require('http');

// Set NODE_ENV to test to enable test mode
process.env.NODE_ENV = 'test';

const serverModule = require('../server');
const app = serverModule.app || serverModule;

const TEST_PORT = 3089;
let serverInstance = null;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      ...headers,
      ...(payload ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      } : {})
    };

    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let rawData = '';
      res.on('data', chunk => rawData += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(rawData); } catch (e) { json = rawData; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runAuditTests() {
  console.log('🛡️  Starting DiuWin Enterprise Hardening & Assessment Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    return (async () => {
      try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
      } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Reason: ${err.message}`);
        failed++;
      }
    })();
  }

  // --- 1. SERVER STARTUP & LIFECYCLE EXPORT TESTS ---
  await test('Server exports both app function and lifecycle management functions', () => {
    assert(typeof app === 'function', 'app must be an Express handler function');
    assert(typeof serverModule.startServer === 'function', 'startServer must be exported');
    assert(typeof serverModule.stopServer === 'function', 'stopServer must be exported');
    assert(typeof serverModule.startGameTickers === 'function', 'startGameTickers must be exported');
    assert(typeof serverModule.stopGameTickers === 'function', 'stopGameTickers must be exported');
  });

  // Start test server on custom port
  await new Promise((resolve, reject) => {
    serverInstance = app.listen(TEST_PORT, '127.0.0.1', () => {
      resolve();
    });
    serverInstance.on('error', reject);
  });

  // --- 2. OTP NORMALIZATION, RATE LIMITING & SECURITY ---
  const testPhoneRaw = '+91 98765-43219';
  const expectedCleanPhone = '9876543219';
  let capturedOtp = null;

  await test('OTP generation with phone normalization (+91, spaces, dashes)', async () => {
    const res = await request('POST', '/api/auth/send-otp', { phone: testPhoneRaw });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert(res.body.message.includes(expectedCleanPhone), 'Response message should contain normalized 10-digit number');
    assert(res.body.otp, 'In test mode, OTP is provided for automation');
    capturedOtp = res.body.otp;
  });

  await test('OTP anti-spam rate limiting returns 429 on immediate re-request', async () => {
    const res = await request('POST', '/api/auth/send-otp', { phone: expectedCleanPhone });
    assert.strictEqual(res.status, 429, 'Immediate second OTP request must be rejected with 429 Too Many Requests');
    assert.strictEqual(res.body.success, false);
    assert(res.body.message.includes('wait'), 'Message should indicate wait cooldown');
  });

  await test('Stand-alone /api/auth/verify-otp validates correct OTP and rejects forged OTP', async () => {
    // Bad OTP
    const badRes = await request('POST', '/api/auth/verify-otp', { phone: expectedCleanPhone, otp: '000000' });
    assert.strictEqual(badRes.status, 400);
    assert.strictEqual(badRes.body.success, false);

    // Re-send to a fresh number to get a single-use token
    const freshPhone = '9876543221';
    const otpRes = await request('POST', '/api/auth/send-otp', { phone: freshPhone });
    assert.strictEqual(otpRes.status, 200);

    const goodRes = await request('POST', '/api/auth/verify-otp', { phone: freshPhone, otp: otpRes.body.otp });
    assert.strictEqual(goodRes.status, 200);
    assert.strictEqual(goodRes.body.success, true);
  });

  // --- 3. ADMIN AUTHORIZATION & VERIFICATION GATE ---
  let adminAuthToken = null;

  await test('Admin gate rejects unauthenticated requests with 401', async () => {
    const res = await request('GET', '/api/admin/overview');
    assert.strictEqual(res.status, 401);
  });

  await test('Admin gate rejects invalid / forged token with 403', async () => {
    const res = await request('GET', '/api/admin/overview', null, { Authorization: 'Bearer forged_token_xxx' });
    assert.strictEqual(res.status, 403);
  });

  await test('Admin login produces dynamic secure session token', async () => {
    const res = await request('POST', '/api/admin/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert(res.body.token && res.body.token.startsWith('adm_'), 'Admin token should be a dynamic adm_ session token');
    adminAuthToken = res.body.token;
  });

  await test('Admin verify-token endpoint confirms valid token', async () => {
    const res = await request('GET', '/api/admin/verify-token', null, { Authorization: `Bearer ${adminAuthToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.valid, true);
  });

  // --- 4. ADMIN CONTROL OVER EVERY GAME ---
  await test('Admin override on WinGo lottery (forced number)', async () => {
    const res = await request('POST', '/api/admin/wingo/set-result', { forcedNumber: 7 }, { Authorization: `Bearer ${adminAuthToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.forcedNumber, 7);
  });

  await test('Admin override on K3 dice lottery (forced dice)', async () => {
    const res = await request('POST', '/api/admin/k3/set-result', { forcedDice: [4, 5, 6] }, { Authorization: `Bearer ${adminAuthToken}` });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.forcedDice, [4, 5, 6]);
  });

  await test('Admin override on 5D lottery (forced balls)', async () => {
    const res = await request('POST', '/api/admin/5d/set-result', { forcedBalls: [1, 2, 3, 4, 5] }, { Authorization: `Bearer ${adminAuthToken}` });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.forcedBalls, [1, 2, 3, 4, 5]);
  });

  await test('Admin override on Aviator crash multiplier', async () => {
    const res = await request('POST', '/api/admin/aviator/set-crash', { crashMultiplier: 3.45 }, { Authorization: `Bearer ${adminAuthToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.forcedCrashMultiplier, 3.45);
  });

  await test('Admin override on Mines trap mode and verified via state endpoint', async () => {
    const setRes = await request('POST', '/api/admin/mines/set-trap', { trapMode: 'trap_early' }, { Authorization: `Bearer ${adminAuthToken}` });
    assert.strictEqual(setRes.status, 200);
    assert.strictEqual(setRes.body.trapMode, 'trap_early');

    const stateRes = await request('GET', '/api/mines/state');
    assert.strictEqual(stateRes.status, 200);
    assert.strictEqual(stateRes.body.trapMode, 'trap_early');
  });

  await test('Admin override on Chicken Road crash step and verified via state endpoint', async () => {
    const setRes = await request('POST', '/api/admin/chicken/set-step', { forceCrashStep: 4 }, { Authorization: `Bearer ${adminAuthToken}` });
    assert.strictEqual(setRes.status, 200);
    assert.strictEqual(setRes.body.forceCrashStep, 4);

    const stateRes = await request('GET', '/api/chicken/state');
    assert.strictEqual(stateRes.status, 200);
    assert.strictEqual(stateRes.body.forceCrashStep, 4);
  });

  // --- 5. LOBBY GAMES & NO FAKE WINNERS ---
  await test('Live wins endpoint returns real settled records with zero synthetic random winners', async () => {
    const res1 = await request('GET', '/api/games/live-wins');
    const res2 = await request('GET', '/api/games/live-wins');
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);
    // Because synthetic generation is removed, consecutive calls with no round bets produce unchanged count
    assert.strictEqual(res1.body.wins.length, res2.body.wins.length);
  });

  // --- 6. REAL-MONEY WALLET SAFETY & INTEGER PAISE ---
  let userToken = null;
  let userId = null;

  await test('User guest login starts with valid ledger balance', async () => {
    const res = await request('POST', '/api/auth/guest');
    assert.strictEqual(res.status, 200);
    userToken = res.body.token;
    userId = res.body.user.id;
    assert(typeof res.body.user.balance === 'number');
  });

  await test('Negative / NaN / zero bet amounts are rejected with 400', async () => {
    const resNeg = await request('POST', '/api/games/play', { gameId: 'wingo', betAmount: -50, choice: 'red' }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(resNeg.status, 400);

    const resZero = await request('POST', '/api/games/play', { gameId: 'wingo', betAmount: 0, choice: 'red' }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(resZero.status, 400);

    const resNan = await request('POST', '/api/games/play', { gameId: 'wingo', betAmount: 'not_a_number', choice: 'red' }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(resNan.status, 400);
  });

  await test('Integer paise precision: adjustBalance eliminates float point drift', () => {
    const initialBal = 100.00;
    serverModule.db.users.find(u => u.id === userId).balance = initialBal;

    // Simulate ten 0.10 rupee additions
    for (let i = 0; i < 10; i++) {
      const res = serverModule.adjustBalance(userId, 0.10, 'TEST_ADD');
      assert.strictEqual(res.success, true);
    }
    const user = serverModule.db.users.find(u => u.id === userId);
    // In IEEE 754, 100 + 10 * 0.10 often drifts to 101.00000000000001
    // With integer paise, it is strictly 101.00
    assert.strictEqual(user.balance, 101.00, 'Balance must be exact integer paise without floating point drift');
  });

  await test('Withdrawal request locks funds into PENDING_REVIEW escrow', async () => {
    // Deposit 500 to ensure sufficient balance
    serverModule.adjustBalance(userId, 500.00, 'TEST_CREDIT');
    const balBefore = serverModule.db.users.find(u => u.id === userId).balance;

    const res = await request('POST', '/api/wallet/withdraw', { amount: 200, upiOrBank: 'user@okaxis' }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'PENDING_REVIEW');
    assert.strictEqual(res.body.newBalance, Number((balBefore - 200).toFixed(2)));
  });

  // Clean shutdown
  if (serverInstance) {
    await new Promise((resolve) => serverInstance.close(resolve));
  }

  console.log(`\n🎉 Hardening Audit Complete: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) process.exit(1);
}

runAuditTests().catch(err => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
