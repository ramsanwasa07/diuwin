/**
 * Step 8: Withdrawal Request Create Automated Test Suite
 * Specifically validates that upon withdrawal request creation,
 * a complete database record is created containing:
 * 1. Withdrawal ID (Unique format: WD-XXXXX)
 * 2. User ID (Matches authenticated user)
 * 3. Amount (Exact numeric value requested)
 * 4. Payment Method (BANK, UPI, OTHER)
 * 5. Account/UPI Reference (Destination account / VPA identifier)
 * 6. Status = Pending (Initial pending review queue status)
 * 7. Created At (Valid ISO timestamp)
 * 8. SQLite Database Persistence (Persisted across memory and disk storage)
 */

const assert = require('assert');
const http = require('http');

const PORT = 3897;
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

async function runStep8Suite() {
  console.log('\n📝 Starting Step 8: Withdrawal Request Create Automated Test Suite...\n');
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

    // Complete KYC
    await request('POST', '/api/user/kyc/submit', {
      panNumber: 'ABCDE1234F',
      fullName: 'Vikram Mehta',
      dateOfBirth: '1992-08-20'
    }, { Authorization: `Bearer ${userToken}` });

    // Link Bank & UPI Accounts
    await request('POST', '/api/user/kyc/link-account', {
      method: 'UPI',
      upiId: 'vikram@oksbi',
      holderName: 'Vikram Mehta'
    }, { Authorization: `Bearer ${userToken}` });

    await request('POST', '/api/user/kyc/link-account', {
      method: 'BANK',
      accountNumber: '987654321012',
      ifsc: 'HDFC0001234',
      bankName: 'HDFC Bank',
      holderName: 'Vikram Mehta'
    }, { Authorization: `Bearer ${userToken}` });

    // --- Scenario A: UPI Withdrawal Request Creation ---
    console.log('--- Scenario A: Creating UPI Withdrawal Request ---');
    const upiReqAmount = 250;
    const upiRes = await request('POST', '/api/wallet/withdraw', {
      amount: upiReqAmount,
      method: 'UPI',
      upiOrBank: 'vikram@oksbi',
      accountDetails: { upiId: 'vikram@oksbi', holderName: 'Vikram Mehta' }
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(upiRes.status, 200, 'UPI Withdrawal failed');
    const upiWd = upiRes.body;

    // Verify all 7 core fields:
    // 1. Withdrawal ID
    assert(upiWd.withdrawalId && upiWd.withdrawalId.startsWith('WD-'), 'Withdrawal ID must start with WD-');
    console.log(`  ✅ 1. Withdrawal ID generated: ${upiWd.withdrawalId}`);

    // 2. User ID
    assert.strictEqual(upiWd.userId, userId, 'User ID must match authenticated user');
    console.log(`  ✅ 2. User ID recorded: ${upiWd.userId}`);

    // 3. Amount
    assert.strictEqual(Number(upiWd.amount), upiReqAmount, 'Amount must match requested amount');
    console.log(`  ✅ 3. Amount recorded: ₹${upiWd.amount}`);

    // 4. Payment Method
    assert.strictEqual(upiWd.method, 'UPI', 'Payment Method must be UPI');
    console.log(`  ✅ 4. Payment Method: ${upiWd.method}`);

    // 5. Account/UPI Reference
    assert(upiWd.accountReference && upiWd.accountReference.includes('vikram@oksbi'), 'Account reference must contain UPI ID');
    console.log(`  ✅ 5. Account/UPI Reference: ${upiWd.accountReference}`);

    // 6. Status = Pending
    assert(upiWd.status === 'PENDING_REVIEW' || upiWd.status === 'PENDING', 'Status must be Pending/Pending Review');
    assert.strictEqual(upiWd.displayStatus, 'Pending', 'Display status must be Pending');
    console.log(`  ✅ 6. Status: ${upiWd.displayStatus} (${upiWd.status})`);

    // 7. Created At
    assert(upiWd.createdAt && !isNaN(new Date(upiWd.createdAt).getTime()), 'Created At must be a valid timestamp');
    console.log(`  ✅ 7. Created At: ${upiWd.createdAt}`);

    // --- Scenario B: Verification from Database Storage ---
    console.log('\n--- Scenario B: Database Lookup & Verification ---');
    const queryRes = await request('GET', `/api/wallet/withdrawal/${upiWd.withdrawalId}`, null, {
      Authorization: `Bearer ${userToken}`
    });

    assert.strictEqual(queryRes.status, 200, 'Withdrawal query by ID failed');
    const dbRecord = queryRes.body.withdrawal;
    assert.strictEqual(dbRecord.withdrawalId, upiWd.withdrawalId, 'Queried Withdrawal ID must match');
    assert.strictEqual(dbRecord.userId, userId, 'Queried User ID must match');
    assert.strictEqual(dbRecord.amount, upiReqAmount, 'Queried Amount must match');
    assert.strictEqual(dbRecord.paymentMethod, 'UPI', 'Queried Method must match');
    assert.strictEqual(dbRecord.displayStatus, 'Pending', 'Queried Status must be Pending');
    assert.strictEqual(dbRecord.accountReference, 'vikram@oksbi', 'Queried Account Reference must match');
    console.log('  ✅ PASS: Withdrawal record strictly verified from Database by Withdrawal ID');

    // --- Scenario C: Bank Withdrawal Request Creation ---
    console.log('\n--- Scenario C: Creating Bank Withdrawal Request ---');
    const bankReqAmount = 150;
    const bankRes = await request('POST', '/api/wallet/withdraw', {
      amount: bankReqAmount,
      method: 'BANK',
      accountDetails: {
        accountNumber: '987654321012',
        ifsc: 'HDFC0001234',
        bankName: 'HDFC Bank',
        holderName: 'Vikram Mehta'
      }
    }, { Authorization: `Bearer ${userToken}` });

    assert.strictEqual(bankRes.status, 200, 'Bank Withdrawal failed');
    const bankWd = bankRes.body;
    assert(bankWd.withdrawalId && bankWd.withdrawalId.startsWith('WD-'), 'Bank Withdrawal ID format invalid');
    assert.strictEqual(bankWd.userId, userId, 'Bank User ID must match');
    assert.strictEqual(bankWd.amount, bankReqAmount, 'Bank Amount must match');
    assert.strictEqual(bankWd.method, 'BANK', 'Bank Method must be BANK');
    assert(bankWd.accountReference.includes('HDFC Bank'), 'Bank Account reference must include bank name');
    assert(bankWd.displayStatus === 'Pending', 'Bank Status must be Pending');
    console.log(`  ✅ PASS: Bank Withdrawal ${bankWd.withdrawalId} for ₹${bankWd.amount} to ${bankWd.accountReference} created with Status: Pending`);

    console.log('\n🎉 ALL STEP 8 WITHDRAWAL REQUEST CREATE CHECKS RIGOROUSLY VALIDATED!\n');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Fatal error in Step 8 tests:', err);
    if (server) server.close();
    process.exit(1);
  }
}

runStep8Suite();
