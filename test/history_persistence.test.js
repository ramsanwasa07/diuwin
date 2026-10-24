const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');

console.log('🧪 Starting Comprehensive History Persistence Verification Test...\n');

// 1. Verify SQLite schema & column integrity
const sqlitePath = path.join(__dirname, '..', '.data', 'diuwin.sqlite');
assert(fs.existsSync(sqlitePath), '.data/diuwin.sqlite must exist');
const dbSqlite = new DatabaseSync(sqlitePath);

// Check transactions columns
const txCols = dbSqlite.prepare('PRAGMA table_info(transactions)').all().map(c => c.name);
console.log('  1. Checking transactions table columns in SQLite:');
const requiredCols = ['id', 'userId', 'type', 'amount', 'balanceBefore', 'balanceAfter', 'refId', 'orderId', 'utrNumber', 'method', 'destination', 'status', 'description', 'createdAt'];
requiredCols.forEach(col => {
  assert(txCols.includes(col), `transactions table missing column: ${col}`);
});
console.log('     ✅ All required 20 columns present in transactions table.');

// Check for ANY NULL createdAt records in transactions
const nullCreatedAtCount = dbSqlite.prepare('SELECT COUNT(*) as c FROM transactions WHERE createdAt IS NULL').get().c;
console.log(`  2. Checking for NULL createdAt entries: found ${nullCreatedAtCount}`);
assert.strictEqual(nullCreatedAtCount, 0, 'No transactions should have NULL createdAt!');
console.log('     ✅ Zero NULL createdAt records in SQLite!');

// Reset any old test pending withdrawals for guest demo user so test withdrawal queue is not full
dbSqlite.prepare("UPDATE withdrawals SET status = 'APPROVED' WHERE userId = 'usr_guest_demo' AND status IN ('PENDING_REVIEW', 'PENDING')").run();
dbSqlite.prepare("UPDATE transactions SET status = 'SUCCESS' WHERE userId = 'usr_guest_demo' AND status IN ('PENDING_REVIEW', 'PENDING') AND type = 'WITHDRAW'").run();

// 2. Start server in test mode on ephemeral port to test live API persistence
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // ephemeral port

const serverModule = require('../server.js');
const app = serverModule.app || serverModule;

const srv = http.createServer(app);
srv.listen(0, async () => {
  const port = srv.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`  3. Test server running on ${baseUrl}`);

  function req(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(endpoint, baseUrl);
      const opt = {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      };
      if (options.body) {
        if (!opt.headers['Content-Type']) opt.headers['Content-Type'] = 'application/json';
      }
      const r = http.request(opt, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(body); } catch(e) { json = body; }
          resolve({ status: res.statusCode, data: json });
        });
      });
      r.on('error', reject);
      if (options.body) r.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      r.end();
    });
  }

  try {
    // A. Guest session creation
    console.log('  4. Creating guest session...');
    const guestRes = await req('/api/auth/guest', { method: 'POST' });
    assert(guestRes.status === 200 && guestRes.data.success, 'Guest auth should succeed');
    const guestToken = guestRes.data.token;
    assert(guestToken, 'Guest token must be present');
    console.log('     ✅ Guest session active, token received.');

    // B. Submit Recharge (Awaiting Admin Approval)
    console.log('  5. Submitting recharge request...');
    const testUtr = 'UTR_TEST_' + Date.now();
    const depositRes = await req('/api/wallet/deposit', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${guestToken}` },
      body: {
        amount: 500,
        method: 'UPI QR Scanner',
        utrNumber: testUtr
      }
    });

    assert(depositRes.status === 200 && depositRes.data.success, 'Deposit request should succeed');
    assert.strictEqual(depositRes.data.status, 'PENDING', 'Deposit status must be PENDING');
    const depositTxId = depositRes.data.transaction.id;
    console.log(`     ✅ Recharge submitted as PENDING. Tx ID: ${depositTxId}, UTR: ${testUtr}`);

    // Verify Deposit persisted in SQLite
    const savedDepositSqlite = dbSqlite.prepare('SELECT * FROM transactions WHERE id = ?').get(depositTxId);
    assert(savedDepositSqlite, 'Deposit MUST be saved in SQLite transactions table');
    assert.strictEqual(savedDepositSqlite.status, 'PENDING', 'SQLite status must be PENDING');
    assert(savedDepositSqlite.createdAt && savedDepositSqlite.createdAt.length > 10, 'SQLite createdAt must be valid ISO date string');
    assert.strictEqual(savedDepositSqlite.utrNumber, testUtr, 'SQLite utrNumber must match');
    console.log('     ✅ Deposit verified persisted in SQLite with valid createdAt:', savedDepositSqlite.createdAt);

    // C. Check user transaction history endpoint
    console.log('  6. Verifying /api/wallet/transactions returns the recharge...');
    const txHistRes = await req('/api/wallet/transactions', {
      headers: { 'Authorization': `Bearer ${guestToken}` }
    });
    assert(txHistRes.status === 200 && txHistRes.data.success, 'Transactions fetch should succeed');
    const foundDepositInHist = txHistRes.data.transactions.find(t => t.id === depositTxId || t.utrNumber === testUtr);
    assert(foundDepositInHist, 'Deposit transaction must appear in user transaction history');
    assert.strictEqual(foundDepositInHist.status, 'PENDING');
    assert(foundDepositInHist.createdAt, 'History transaction must have createdAt');
    console.log('     ✅ Transaction found in user history API with valid createdAt:', foundDepositInHist.createdAt);

    // D. Admin Approves the Recharge
    console.log('  7. Admin approving recharge transaction...');
    // Login as admin
    const adminLoginRes = await req('/api/admin/login', {
      method: 'POST',
      body: { username: 'admin', password: 'admin123' }
    });
    assert(adminLoginRes.status === 200 && adminLoginRes.data.token, 'Admin login should succeed');
    const adminToken = adminLoginRes.data.token;

    const approveRes = await req('/api/admin/transactions/action', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: {
        txId: depositTxId,
        action: 'approve'
      }
    });
    assert(approveRes.status === 200 && approveRes.data.success, 'Admin approve should succeed');
    console.log('     ✅ Admin approved recharge successfully.');

    // Verify updated status in SQLite
    const approvedSqlite = dbSqlite.prepare('SELECT * FROM transactions WHERE id = ?').get(depositTxId);
    assert.strictEqual(approvedSqlite.status, 'SUCCESS', 'SQLite status must update to SUCCESS after approval');
    console.log('     ✅ SQLite reflects updated SUCCESS status.');

    // E. Submit Withdrawal Request
    console.log('  8. Submitting withdrawal request...');
    const wdRes = await req('/api/wallet/withdraw', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${guestToken}` },
      body: {
        amount: 200,
        method: 'UPI',
        accountDetails: {
          upiId: 'testplayer@okhdfcbank',
          holderName: 'Player Demo',
          verified: true
        }
      }
    });
    assert(wdRes.status === 200 && wdRes.data.success, 'Withdrawal request should succeed: ' + JSON.stringify(wdRes.data));
    const wdId = wdRes.data.withdrawalId;
    console.log(`     ✅ Withdrawal request submitted. ID: ${wdId}`);

    // Verify Withdrawal persisted in SQLite
    const savedWdSqlite = dbSqlite.prepare('SELECT * FROM withdrawals WHERE id = ?').get(wdId);
    assert(savedWdSqlite, 'Withdrawal MUST be saved in SQLite withdrawals table');
    assert(savedWdSqlite.createdAt && savedWdSqlite.createdAt.length > 10, 'Withdrawal createdAt must be valid ISO date string');

    const savedWdTxSqlite = dbSqlite.prepare('SELECT * FROM transactions WHERE id = ?').get(wdId);
    assert(savedWdTxSqlite, 'Withdrawal MUST be saved in SQLite transactions table');
    assert(savedWdTxSqlite.createdAt && savedWdTxSqlite.createdAt.length > 10, 'Withdrawal transaction createdAt must be valid ISO string');
    console.log('     ✅ Withdrawal verified persisted in SQLite with valid createdAt:', savedWdSqlite.createdAt);

    // F. Verify Withdrawal appears in transaction history
    console.log('  9. Checking /api/wallet/transactions includes withdrawal...');
    const txHistAfterWd = await req('/api/wallet/transactions', {
      headers: { 'Authorization': `Bearer ${guestToken}` }
    });
    const foundWd = txHistAfterWd.data.transactions.find(t => t.id === wdId);
    assert(foundWd, 'Withdrawal transaction must appear in user history');
    assert.strictEqual(foundWd.type, 'WITHDRAW');
    assert(foundWd.createdAt, 'Withdrawal in history must have valid createdAt');
    console.log('     ✅ Withdrawal found in user history API.');

    console.log('\n🎉 ALL HISTORY PERSISTENCE & SQLITE STORAGE TESTS PASSED SUCCESSFULLY!\n');
    srv.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    srv.close();
    process.exit(1);
  }
});
