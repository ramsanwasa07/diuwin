const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting Separate History UI & Transaction Verification Test...');

// 1. Verify index.html contains all necessary elements for separated history
const indexPath = path.join(__dirname, '..', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

assert(indexHtml.includes('id="txFilterBar"'), 'index.html must have txFilterBar');
assert(indexHtml.includes('id="btnFilterAll"'), 'index.html must have btnFilterAll');
assert(indexHtml.includes('id="btnFilterRecharge"'), 'index.html must have btnFilterRecharge');
assert(indexHtml.includes('id="btnFilterWithdraw"'), 'index.html must have btnFilterWithdraw');
assert(indexHtml.includes('id="btnFilterGame"'), 'index.html must have btnFilterGame');
assert(indexHtml.includes('id="depositHistoryBox"'), 'index.html must have depositHistoryBox');
assert(indexHtml.includes('id="depositHistoryList"'), 'index.html must have depositHistoryList');
assert(indexHtml.includes('id="withdrawHistoryBox"'), 'index.html must have withdrawHistoryBox');
assert(indexHtml.includes('id="withdrawHistoryList"'), 'index.html must have withdrawHistoryList');
assert(indexHtml.includes('id="accRechargeHistoryBtn"'), 'index.html must have accRechargeHistoryBtn');
assert(indexHtml.includes('id="accWithdrawHistoryBtn"'), 'index.html must have accWithdrawHistoryBtn');
console.log('  ✅ PASS: All required HTML elements present in index.html');

// 2. Verify diuwin_lobby_demo/index.html is synchronized
const subIndexPath = path.join(__dirname, '..', 'diuwin_lobby_demo', 'index.html');
const subIndexHtml = fs.readFileSync(subIndexPath, 'utf8');
assert(subIndexHtml.includes('id="txFilterBar"'), 'diuwin_lobby_demo/index.html must have txFilterBar');
assert(subIndexHtml.includes('id="depositHistoryBox"'), 'diuwin_lobby_demo/index.html must have depositHistoryBox');
assert(subIndexHtml.includes('id="withdrawHistoryBox"'), 'diuwin_lobby_demo/index.html must have withdrawHistoryBox');
console.log('  ✅ PASS: diuwin_lobby_demo/index.html synchronized');

// 3. Verify app.js logic
const appJsPath = path.join(__dirname, '..', 'app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');
assert(appJs.includes("currentTxFilter = 'ALL'"), 'app.js must declare currentTxFilter');
assert(appJs.includes('category: isRecharge ? \'RECHARGE\' :'), 'app.js must categorize RECHARGE');
assert(appJs.includes('category: isRecharge ? \'RECHARGE\' : (isWithdraw ? \'WITHDRAW\''), 'app.js must categorize WITHDRAW');
assert(appJs.includes('depositHistoryList'), 'app.js must render depositHistoryList');
assert(appJs.includes('withdrawHistoryList'), 'app.js must render withdrawHistoryList');
console.log('  ✅ PASS: app.js contains separate history filtering & dedicated lists logic');

// 4. Verify upi-recharge.js
const upiJsPath = path.join(__dirname, '..', 'upi-recharge.js');
const upiJs = fs.readFileSync(upiJsPath, 'utf8');
assert(upiJs.includes('btnUpiViewRechargeHistory'), 'upi-recharge.js must include btnUpiViewRechargeHistory');
console.log('  ✅ PASS: upi-recharge.js has direct link to Recharge History');

// 5. Verify style.css
const cssPath = path.join(__dirname, '..', 'style.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');
assert(cssContent.includes('.tx-filter-bar'), 'style.css must have .tx-filter-bar');
assert(cssContent.includes('.tx-filter-btn'), 'style.css must have .tx-filter-btn');
assert(cssContent.includes('.history-section-box'), 'style.css must have .history-section-box');
console.log('  ✅ PASS: style.css contains filter bar & history box styling');

console.log('\n🎉 ALL SEPARATE RECHARGE & WITHDRAWAL HISTORY TESTS PASSED!\n');
