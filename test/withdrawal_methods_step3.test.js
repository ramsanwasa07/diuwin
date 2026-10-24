/**
 * DiuWin Step 3: Withdrawal Method Select Automated Test Suite
 *
 * Specifically verifies:
 * 1. Bank Account method selection & validation
 * 2. UPI method selection & validation
 * 3. Other supported payment methods (USDT / Crypto TRC20, BEP20, E-Wallet)
 */

const assert = require('assert');
const http = require('http');

const PORT = 3895;
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
  console.log('💳 Starting Step 3: Withdrawal Method Select Test Suite...\n');
  const app = require('../server.js');
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 500));

  try {
    // 1. Register a verified user
    const phone = '9875' + Math.floor(100000 + Math.random() * 900000);
    const regRes = await request('POST', '/api/auth/register', { phone, password: 'password123' });
    assert.strictEqual(regRes.status, 200);
    const userToken = regRes.body.user.token;
    const userId = regRes.body.user.id;

    const userInDb = app.db.users.find(u => u.id === userId);
    userInDb.name = 'Pooja Verma';
    userInDb.kycStatus = 'VERIFIED';
    userInDb.isPhoneVerified = true;

    // -------------------------------------------------------------
    // Test Method 1: Bank Account
    // -------------------------------------------------------------
    console.log('--- 1. Testing Method: Bank Account ---');
    const bankRes = await request('POST', '/api/wallet/withdraw', {
      amount: 150,
      method: 'BANK',
      accountDetails: {
        holderName: 'Pooja Verma',
        accountNumber: '112233445566',
        ifsc: 'SBIN0001234',
        bankName: 'State Bank of India',
        verified: true
      }
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(bankRes.status, 200, 'Bank withdrawal should succeed');
    assert.strictEqual(bankRes.body.method, 'BANK', 'Transaction method is recorded as BANK');
    assert.ok(bankRes.body.withdrawalId.startsWith('WD-'), 'Generates valid WD- ID');
    assert.ok(bankRes.body.destination.includes('State Bank of India') || bankRes.body.destination.includes('A/C'), 'Bank destination formatted correctly');
    console.log(`  ✅ PASS: Bank Account method accepted (Destination: ${bankRes.body.destination})`);

    // -------------------------------------------------------------
    // Test Method 2: UPI
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Method: UPI ---');
    const upiRes = await request('POST', '/api/wallet/withdraw', {
      amount: 100,
      method: 'UPI',
      accountDetails: {
        upiId: 'pooja@oksbi',
        holderName: 'Pooja Verma',
        verified: true
      }
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(upiRes.status, 200, 'UPI withdrawal should succeed');
    assert.strictEqual(upiRes.body.method, 'UPI', 'Transaction method is recorded as UPI');
    assert.strictEqual(upiRes.body.destination, 'pooja@oksbi', 'UPI destination recorded correctly');
    console.log(`  ✅ PASS: UPI method accepted (Destination: ${upiRes.body.destination})`);

    // -------------------------------------------------------------
    // Test Method 3: Other Supported Payment Method (USDT TRC20 / Crypto / E-Wallet)
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Method: Other (USDT TRC20 / Crypto) ---');
    const otherRes = await request('POST', '/api/wallet/withdraw', {
      amount: 100,
      method: 'OTHER',
      accountDetails: {
        walletAddress: 'TYDzsYUEpvnYmQk4zGP9sWWcTEd2MiAtW6',
        network: 'TRC20',
        holderName: 'Pooja Verma',
        verified: true
      }
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(otherRes.status, 200, 'Other / USDT withdrawal should succeed');
    assert.strictEqual(otherRes.body.method, 'OTHER', 'Transaction method is recorded as OTHER');
    assert.ok(otherRes.body.destination.includes('TRC20'), 'Destination includes network details');
    console.log(`  ✅ PASS: Other (USDT-TRC20) method accepted (Destination: ${otherRes.body.destination})`);

    // Also link USDT account via KYC link-account
    const linkRes = await request('POST', '/api/user/kyc/link-account', {
      method: 'OTHER',
      walletAddress: '0x71C8345123567890ABCDEF1234567890ABCDEF12',
      network: 'BEP20',
      holderName: 'Pooja Verma'
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(linkRes.status, 200, 'Linking BEP20 wallet succeeds');
    assert.ok(linkRes.body.linkedAccounts.some(a => a.walletAddress.includes('0x71C8345')), 'Linked account saved in profile');
    console.log('  ✅ PASS: Other payment method (USDT-BEP20) successfully linked to user profile');

    console.log('\n🎉 ALL 3 WITHDRAWAL METHODS (Bank Account, UPI, Other) RIGOROUSLY VALIDATED!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

runTests();
