/**
 * DiuWin Step 4: Bank/UPI Details Secure Verification Automated Test Suite
 *
 * Specifically verifies:
 * 1. Account holder name validation (>= 3 chars, matches verified user name)
 * 2. Bank account number validation (9 to 18 digits, confirm account match)
 * 3. IFSC Code validation (11 chars, 5th char '0', bank prefix lookup)
 * 4. UPI ID validation (VPA format check)
 * 5. Secure Verification Endpoints (/api/wallet/verify-bank, /api/wallet/verify-upi)
 */

const assert = require('assert');
const http = require('http');

const PORT = 3896;
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
  console.log('🔒 Starting Step 4: Bank/UPI Details Secure Verification Test Suite...\n');
  const app = require('../server.js');
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 500));

  try {
    // Register verified user
    const phone = '9873' + Math.floor(100000 + Math.random() * 900000);
    const regRes = await request('POST', '/api/auth/register', { phone, password: 'password123' });
    assert.strictEqual(regRes.status, 200);
    const userToken = regRes.body.user.token;
    const userId = regRes.body.user.id;

    const userInDb = app.db.users.find(u => u.id === userId);
    userInDb.name = 'Sunil Kashyap';
    userInDb.kycStatus = 'VERIFIED';
    userInDb.isPhoneVerified = true;

    // -------------------------------------------------------------
    // 1. Account Holder Name Verification
    // -------------------------------------------------------------
    console.log('--- 1. Testing Account Holder Name Validation ---');
    // Empty / too short
    const shortNameRes = await request('POST', '/api/wallet/verify-bank', {
      holderName: 'A',
      accountNumber: '123456789012',
      ifsc: 'HDFC0001234'
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(shortNameRes.status, 400);
    console.log('  ✅ PASS: Too short holder name (< 3 chars) rejected');

    // Mismatched name
    const mismatchRes = await request('POST', '/api/wallet/verify-bank', {
      holderName: 'Karan Patel',
      accountNumber: '123456789012',
      ifsc: 'HDFC0001234'
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(mismatchRes.status, 400);
    assert.ok(mismatchRes.body.message.includes('must match your verified name'));
    console.log('  ✅ PASS: Mismatched account holder name rejected with explicit notice');

    // -------------------------------------------------------------
    // 2. Bank Account Number Validation
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Bank Account Number Validation ---');
    // Non-digit account number
    const invalidAccRes = await request('POST', '/api/wallet/verify-bank', {
      holderName: 'Sunil Kashyap',
      accountNumber: '1234ABC99',
      ifsc: 'HDFC0001234'
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(invalidAccRes.status, 400);
    console.log('  ✅ PASS: Non-digit account number rejected');

    // Confirm account number mismatch
    const mismatchAccRes = await request('POST', '/api/wallet/verify-bank', {
      holderName: 'Sunil Kashyap',
      accountNumber: '123456789012',
      confirmAccountNumber: '123456789099',
      ifsc: 'HDFC0001234'
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(mismatchAccRes.status, 400);
    assert.ok(mismatchAccRes.body.message.includes('do not match'));
    console.log('  ✅ PASS: Account number and confirmation mismatch rejected');

    // -------------------------------------------------------------
    // 3. IFSC Code Verification & Bank Lookup
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing IFSC Code Verification & Bank Auto-Detection ---');
    // Invalid IFSC: 5th character not '0'
    const invalidIfscRes = await request('POST', '/api/wallet/verify-bank', {
      holderName: 'Sunil Kashyap',
      accountNumber: '123456789012',
      ifsc: 'HDFC1001234'
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(invalidIfscRes.status, 400);
    console.log('  ✅ PASS: Invalid IFSC format (5th character not 0) rejected');

    // Valid IFSC with State Bank of India
    const validSbiRes = await request('POST', '/api/wallet/verify-bank', {
      holderName: 'Sunil Kashyap',
      accountNumber: '123456789012',
      confirmAccountNumber: '123456789012',
      ifsc: 'SBIN0001234'
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(validSbiRes.status, 200);
    assert.strictEqual(validSbiRes.body.bankName, 'State Bank of India');
    assert.strictEqual(validSbiRes.body.maskedAccountNumber, 'XXXXXX9012');
    console.log(`  ✅ PASS: Valid IFSC verified: ${validSbiRes.body.bankName} (Masked A/C: ${validSbiRes.body.maskedAccountNumber})`);

    // Valid IFSC with HDFC Bank
    const validHdfcRes = await request('POST', '/api/wallet/verify-bank', {
      holderName: 'Sunil Kashyap',
      accountNumber: '987654321098',
      ifsc: 'HDFC0000001'
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(validHdfcRes.status, 200);
    assert.strictEqual(validHdfcRes.body.bankName, 'HDFC Bank');
    console.log(`  ✅ PASS: Valid IFSC verified: ${validHdfcRes.body.bankName}`);

    // -------------------------------------------------------------
    // 4. UPI ID Verification
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing UPI ID Verification ---');
    // Malformed UPI
    const invalidUpiRes = await request('POST', '/api/wallet/verify-upi', {
      upiId: 'sunil_kashyap'
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(invalidUpiRes.status, 400);
    console.log('  ✅ PASS: Malformed UPI ID (missing @handle) rejected');

    // Valid UPI
    const validUpiRes = await request('POST', '/api/wallet/verify-upi', {
      upiId: 'sunil@okhdfcbank',
      holderName: 'Sunil Kashyap'
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(validUpiRes.status, 200);
    assert.strictEqual(validUpiRes.body.handle, 'okhdfcbank');
    assert.strictEqual(validUpiRes.body.verified, true);
    console.log(`  ✅ PASS: Valid UPI VPA verified: ${validUpiRes.body.upiId} (Handle: @${validUpiRes.body.handle})`);

    // -------------------------------------------------------------
    // 5. Withdrawal Submission with Verified Details
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing Withdrawal with Verified Bank Details ---');
    const withdrawRes = await request('POST', '/api/wallet/withdraw', {
      amount: 150,
      method: 'BANK',
      accountDetails: {
        holderName: 'Sunil Kashyap',
        accountNumber: '123456789012',
        confirmAccountNumber: '123456789012',
        ifsc: 'ICIC0001234',
        verified: true
      }
    }, { Authorization: `Bearer ${userToken}` });
    assert.strictEqual(withdrawRes.status, 200);
    assert.ok(withdrawRes.body.destination.includes('ICICI Bank'));
    console.log(`  ✅ PASS: Withdrawal accepted with auto-resolved bank destination: ${withdrawRes.body.destination}`);

    console.log('\n🎉 ALL STEP 4 BANK/UPI SECURE VERIFICATION TESTS PASSED!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

runTests();
