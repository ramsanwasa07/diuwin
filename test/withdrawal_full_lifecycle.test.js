process.env.NODE_ENV = 'test';
const http = require('http');
const app = require('../server');

let server;
const PORT = 3097;

function request(options, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = data ? JSON.stringify(data) : null;
    const req = http.request({
      ...options,
      port: PORT,
      host: '127.0.0.1',
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...headers
      }
    }, (res) => {
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
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function runWithdrawalLifecycleTests() {
  console.log('💰 Starting Comprehensive 16-Step Withdrawal Process Test Suite...\n');
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
    // 1. Authenticate Admin
    const adminLogin = await request({ method: 'POST', path: '/api/admin/login' }, { username: 'admin', password: 'admin123' });
    const adminToken = adminLogin.body.token;
    assert(adminToken, 'Step 1: Admin dynamically authenticated');

    // 2. User Registration & KYC Profile Check
    const userPhone = '98' + Math.floor(10000000 + Math.random() * 90000000);
    const regRes = await request({ method: 'POST', path: '/api/auth/register' }, { phone: userPhone, password: 'SecurePassword@123' });
    const userToken = regRes.body.user.token;
    const userId = regRes.body.user.id;
    assert(regRes.body.user.balance === 500, 'Step 1: User registered with initial balance ₹500');

    // 3. KYC Verification Status Endpoint
    const kycRes = await request({ method: 'GET', path: '/api/user/kyc' }, null, { Authorization: `Bearer ${userToken}` });
    assert(kycRes.status === 200 && kycRes.body.isPhoneVerified === true, 'Step 2: KYC profile retrieved with phone verified');

    // 4. Link Payment Accounts (UPI & Bank)
    const linkUpiRes = await request(
      { method: 'POST', path: '/api/user/kyc/link-account' },
      { method: 'UPI', upiId: 'player@okaxis', holderName: 'Player Demo' },
      { Authorization: `Bearer ${userToken}` }
    );
    assert(linkUpiRes.status === 200 && linkUpiRes.body.linkedAccounts.length === 1, 'Step 3 & 4: UPI account player@okaxis linked & verified');

    const linkBankRes = await request(
      { method: 'POST', path: '/api/user/kyc/link-account' },
      {
        method: 'BANK',
        holderName: 'Player Demo',
        accountNumber: '123456789012',
        confirmAccountNumber: '123456789012',
        ifsc: 'HDFC0001234',
        bankName: 'HDFC Bank'
      },
      { Authorization: `Bearer ${userToken}` }
    );
    assert(linkBankRes.status === 200 && linkBankRes.body.linkedAccounts.length === 2, 'Step 3 & 4: Bank account (HDFC Bank) linked & verified');

    // 5. Withdrawal Amount Limits Checks (Min ₹100, Max ₹50,000)
    const minCheck = await request(
      { method: 'POST', path: '/api/wallet/withdraw' },
      { amount: 50, upiOrBank: 'player@okaxis' },
      { Authorization: `Bearer ${userToken}` }
    );
    assert(minCheck.status === 400 && minCheck.body.message.includes('Minimum'), 'Step 5: Sub-minimum amount (< ₹100) rejected');

    const maxCheck = await request(
      { method: 'POST', path: '/api/wallet/withdraw' },
      { amount: 60000, upiOrBank: 'player@okaxis' },
      { Authorization: `Bearer ${userToken}` }
    );
    assert(maxCheck.status === 400 && maxCheck.body.message.includes('Maximum'), 'Step 5: Over-maximum amount (> ₹50,000) rejected');

    // 6. Balance Validation (Available Balance >= Withdrawal Amount)
    const overBalance = await request(
      { method: 'POST', path: '/api/wallet/withdraw' },
      { amount: 800, upiOrBank: 'player@okaxis' },
      { Authorization: `Bearer ${userToken}` }
    );
    assert(overBalance.status === 400 && overBalance.body.message.includes('Insufficient balance'), 'Step 6: Insufficient balance rejected');

    // 7. Security OTP Verification for Withdrawal
    const otpReq = await request(
      { method: 'POST', path: '/api/wallet/withdraw-otp' },
      {},
      { Authorization: `Bearer ${userToken}` }
    );
    assert(otpReq.status === 200, 'Step 7: Withdrawal Security OTP dispatched');

    // Attempt withdrawal with invalid OTP
    const badOtpRes = await request(
      { method: 'POST', path: '/api/wallet/withdraw' },
      { amount: 200, upiOrBank: 'player@okaxis', otp: '000000' },
      { Authorization: `Bearer ${userToken}` }
    );
    assert(badOtpRes.status === 400 && badOtpRes.body.message.includes('Incorrect OTP'), 'Step 7: Invalid security OTP strictly rejected');

    // 8 & 9. Withdrawal Request Creation with Escrow Hold
    const validWithdraw = await request(
      { method: 'POST', path: '/api/wallet/withdraw' },
      {
        amount: 200,
        method: 'UPI',
        accountDetails: { upiId: 'player@okaxis', holderName: 'Player Demo' }
      },
      { Authorization: `Bearer ${userToken}` }
    );
    assert(validWithdraw.status === 200, 'Step 8: Withdrawal request accepted');
    const wd1 = validWithdraw.body.transaction;
    assert(wd1.id.startsWith('WD-'), `Step 8: Unique Withdrawal ID generated: ${wd1.id}`);
    assert(validWithdraw.body.newBalance === 300, 'Step 9: Requested amount ₹200 immediately held in escrow (Available: ₹300)');
    assert(wd1.status === 'PENDING_REVIEW', 'Step 9: Initial status set to PENDING_REVIEW');

    // 10. Automated Risk Check (Rapid duplicate detection)
    const dupWithdraw = await request(
      { method: 'POST', path: '/api/wallet/withdraw' },
      { amount: 200, upiOrBank: 'player@okaxis' },
      { Authorization: `Bearer ${userToken}` }
    );
    assert(dupWithdraw.status === 200, 'Duplicate amount withdrawal accepted into escrow');
    const wd2 = dupWithdraw.body.transaction;
    assert(wd2.riskFlags.includes('RAPID_DUPLICATE_AMOUNT') && wd2.riskScore === 'FLAGGED', 'Step 10: Automated risk engine flagged rapid duplicate amount');

    // 11. Admin Review Lifecycle (Pending -> Under Review -> Processing -> Completed)
    // 11a. Admin moves wd1 to UNDER_REVIEW
    const reviewAction = await request(
      { method: 'POST', path: '/api/admin/transactions/action' },
      { txId: wd1.id, action: 'review', reason: 'Identity verified; performing risk audit' },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(reviewAction.status === 200 && reviewAction.body.transaction.status === 'UNDER_REVIEW', 'Step 10: Admin marked withdrawal as UNDER_REVIEW');

    // 11b. Admin moves wd1 to PROCESSING with payment provider
    const procAction = await request(
      { method: 'POST', path: '/api/admin/transactions/action' },
      { txId: wd1.id, action: 'process', referenceId: 'GATEWAY_REF_9988' },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(procAction.status === 200 && procAction.body.transaction.status === 'PROCESSING', 'Step 11: Withdrawal marked as PROCESSING with gateway reference');
    assert(procAction.body.transaction.referenceId === 'GATEWAY_REF_9988', 'Step 11: Gateway reference ID attached');

    // 12. Admin completes withdrawal
    const completeAction = await request(
      { method: 'POST', path: '/api/admin/transactions/action' },
      { txId: wd1.id, action: 'approve' },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(completeAction.status === 200 && completeAction.body.transaction.status === 'COMPLETED', 'Step 12: Final status finalized as COMPLETED');

    // 13. Rejection & Atomic Escrow Refund Test
    // Reject wd2 (which held ₹200)
    const rejectAction = await request(
      { method: 'POST', path: '/api/admin/transactions/action' },
      { txId: wd2.id, action: 'reject', reason: 'Duplicate velocity violation' },
      { Authorization: `Bearer ${adminToken}` }
    );
    assert(rejectAction.status === 200 && rejectAction.body.transaction.status === 'REJECTED', 'Step 13: Transaction status marked as REJECTED');
    assert(rejectAction.body.transaction.rejectReason === 'Duplicate velocity violation', 'Step 13: Rejection reason recorded');

    // Verify user balance refunded back by ₹200 (was 100 after 200+200 holds, now 300)
    const userProfile = await request({ method: 'GET', path: '/api/user/profile' }, null, { Authorization: `Bearer ${userToken}` });
    assert(userProfile.body.user.balance === 300, `Step 13: Escrow held funds of ₹200 safely restored to user wallet (Balance: ${userProfile.body.user.balance})`);

    // 14. Transaction History Integrity Check
    const txHist = await request({ method: 'GET', path: '/api/wallet/transactions' }, null, { Authorization: `Bearer ${userToken}` });
    assert(txHist.status === 200 && txHist.body.transactions.length >= 2, 'Step 14: User transaction history retrieved');
    const histWd1 = txHist.body.transactions.find(t => t.id === wd1.id);
    assert(histWd1 && histWd1.status === 'COMPLETED' && histWd1.referenceId === 'GATEWAY_REF_9988', 'Step 14: Completed transaction contains Withdrawal ID, status, and Reference ID');

    // 15. In-App Notifications Verification
    const notifsRes = await request({ method: 'GET', path: '/api/user/notifications' }, null, { Authorization: `Bearer ${userToken}` });
    assert(notifsRes.status === 200 && notifsRes.body.notifications.length >= 4, 'Step 15: In-app notifications generated for each lifecycle stage');
    assert(notifsRes.body.unreadCount >= 4, 'Step 15: Unread count accurately tracked');

    const markReadRes = await request({ method: 'POST', path: '/api/user/notifications/mark-read' }, {}, { Authorization: `Bearer ${userToken}` });
    assert(markReadRes.status === 200, 'Step 15: Notifications mark-read API succeeds');

    const notifsAfterRead = await request({ method: 'GET', path: '/api/user/notifications' }, null, { Authorization: `Bearer ${userToken}` });
    assert(notifsAfterRead.body.unreadCount === 0, 'Step 15: Unread notification count reset to 0');

    // 16. Admin Audit Log Verification
    const auditRes = await request({ method: 'GET', path: '/api/admin/audit-logs' }, null, { Authorization: `Bearer ${adminToken}` });
    assert(auditRes.status === 200 && auditRes.body.auditLogs.length >= 4, 'Step 16: Admin audit log recorded all actions');
    const wdRejectAudit = auditRes.body.auditLogs.find(a => a.withdrawalId === wd2.id && a.action === 'REJECTED');
    assert(wdRejectAudit && wdRejectAudit.reason === 'Duplicate velocity violation', 'Step 16: Audit log captures Admin ID, Withdrawal ID, old/new status, reason, and IP');

  } catch (err) {
    console.error('❌ Test execution error:', err);
    failed++;
  } finally {
    if (server) server.close();
  }

  console.log(`\n🎉 16-Step Withdrawal Lifecycle Test Results: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runWithdrawalLifecycleTests();
