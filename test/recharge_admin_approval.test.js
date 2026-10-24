// Automated Test Suite: Recharge / Deposit Manual Admin Approval Verification
const http = require('http');
process.env.NODE_ENV = 'test';
process.env.ADMIN_STATIC_TOKEN = 'test_admin_token_xyz_99';
const app = require('../server');

const PORT = 3188;
let server;

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Recharge Admin Approval Test Suite...\n');
  server = app.listen(PORT);

  const adminHeaders = { 'Authorization': 'Bearer test_admin_token_xyz_99' };

  try {
    // 1. Create fresh test user
    const testPhone = '9198765' + Math.floor(Math.random() * 90000 + 10000);
    const regRes = await request({ path: '/api/auth/register', method: 'POST' }, {
      phone: testPhone,
      password: 'Password@123',
      name: 'Recharge Tester'
    });
    if (!regRes.body.success) throw new Error('Registration failed: ' + JSON.stringify(regRes.body));
    const userToken = regRes.body.user?.token || regRes.body.token;
    const initialBalance = regRes.body.user.balance;
    const userHeaders = { 'Authorization': `Bearer ${userToken}` };
    console.log(`  ✅ PASS: Test user registered with initial balance ₹${initialBalance}`);

    // 2. Submit Recharge with UTR (requireAdminApproval simulation)
    const testUtr = 'UTR_TEST_' + Date.now();
    const depositAmount = 500;
    const depositRes = await request({
      path: '/api/wallet/deposit',
      method: 'POST',
      headers: userHeaders
    }, {
      amount: depositAmount,
      method: 'UPI QR Scanner',
      utrNumber: testUtr,
      requireAdminApproval: true
    });

    if (!depositRes.body.success || depositRes.body.status !== 'PENDING') {
      throw new Error('Deposit submission failed: ' + JSON.stringify(depositRes.body));
    }
    const depositTxId = depositRes.body.transaction.id;
    console.log(`  ✅ PASS: Recharge request submitted with status: PENDING (Tx ID: ${depositTxId})`);

    // 3. Verify balance is NOT credited yet!
    const profileBefore = await request({ path: '/api/user/profile', method: 'GET', headers: userHeaders });
    if (profileBefore.body.user.balance !== initialBalance) {
      throw new Error(`Balance was wrongly credited! Current: ${profileBefore.body.user.balance}, expected: ${initialBalance}`);
    }
    console.log(`  ✅ PASS: Balance NOT credited yet. Current balance strictly remains ₹${profileBefore.body.user.balance}`);

    // 4. Admin sees pending recharge in transactions list
    const adminTxListRes = await request({ path: '/api/admin/transactions', method: 'GET', headers: adminHeaders });
    const pendingTx = (adminTxListRes.body.transactions || []).find(t => t.id === depositTxId);
    if (!pendingTx || pendingTx.status !== 'PENDING') {
      throw new Error('Pending recharge not found in admin transactions list');
    }
    console.log(`  ✅ PASS: Admin successfully sees pending recharge request with UTR: ${testUtr}`);

    // 5. Admin Approves / Accepts the Recharge Request
    const approveRes = await request({
      path: '/api/admin/transactions/action',
      method: 'POST',
      headers: adminHeaders
    }, {
      txId: depositTxId,
      action: 'approve'
    });
    if (!approveRes.body.success) {
      throw new Error('Admin approval failed: ' + JSON.stringify(approveRes.body));
    }
    console.log(`  ✅ PASS: Admin approved recharge request ${depositTxId}`);

    // 6. Verify User Balance is NOW credited with ₹500
    const profileAfter = await request({ path: '/api/user/profile', method: 'GET', headers: userHeaders });
    const expectedBalance = initialBalance + depositAmount;
    if (profileAfter.body.user.balance !== expectedBalance) {
      throw new Error(`Balance after approval is ₹${profileAfter.body.user.balance}, expected: ₹${expectedBalance}`);
    }
    console.log(`  ✅ PASS: User balance credited to ₹${expectedBalance} ONLY AFTER Admin approval!`);

    // 7. Verify Rejection Flow: Submit second deposit and test Admin Rejection
    const rejectUtr = 'UTR_REJECT_' + Date.now();
    const rejectDepositRes = await request({
      path: '/api/wallet/deposit',
      method: 'POST',
      headers: userHeaders
    }, {
      amount: 1000,
      method: 'UPI Scanner',
      utrNumber: rejectUtr,
      requireAdminApproval: true
    });
    const rejectTxId = rejectDepositRes.body.transaction.id;

    // Admin Rejects
    const rejectRes = await request({
      path: '/api/admin/transactions/action',
      method: 'POST',
      headers: adminHeaders
    }, {
      txId: rejectTxId,
      action: 'reject',
      reason: 'Fake UTR provided'
    });
    if (!rejectRes.body.success) {
      throw new Error('Admin rejection failed: ' + JSON.stringify(rejectRes.body));
    }

    // Balance must NOT have increased
    const profileAfterReject = await request({ path: '/api/user/profile', method: 'GET', headers: userHeaders });
    if (profileAfterReject.body.user.balance !== expectedBalance) {
      throw new Error(`Balance was modified on rejection! Current: ${profileAfterReject.body.user.balance}`);
    }
    console.log(`  ✅ PASS: Rejected recharge did NOT add any balance to user account!`);

    console.log('\n🎉 ALL 7 RECHARGE ADMIN APPROVAL TESTS PASSED! (100% Verified)');
    if (server) server.close();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    if (server) server.close();
    process.exit(1);
  }
}

runTests();
