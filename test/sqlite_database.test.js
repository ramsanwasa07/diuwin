const assert = require('assert');
const path = require('path');
const fs = require('fs');
const DatabaseAdapter = require('../db_adapter');

async function runSqliteTests() {
  console.log('🧪 Testing ACID SQLite Database Adapter with node:sqlite (WAL Mode)...\n');

  const testDbFile = path.join(__dirname, 'test_wal.sqlite');
  if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
  if (fs.existsSync(testDbFile + '-wal')) fs.unlinkSync(testDbFile + '-wal');
  if (fs.existsSync(testDbFile + '-shm')) fs.unlinkSync(testDbFile + '-shm');

  const adapter = new DatabaseAdapter(testDbFile);

  // 1. Health check & WAL mode
  const health = adapter.getHealth();
  assert.strictEqual(health.mode, 'WAL');
  console.log('  ✅ PASS: SQLite initialized with Write-Ahead Logging (WAL mode)');

  // 2. Insert User
  adapter.saveUser({
    id: 'u_test_1',
    phone: '9876543210',
    passwordHash: 'pbkdf2$100000$salt$hash',
    balance: 500.00,
    vipLevel: 1,
    name: 'Test Player',
    token: 'tok_test',
    inviteCode: 'VIP1',
    isBanned: 0,
    createdAt: new Date().toISOString()
  });
  console.log('  ✅ PASS: User inserted into SQLite users table');

  // 3. Concurrency-Safe Atomic Ledger Balance Adjustment
  const adjRes = adapter.atomicAdjustBalance('u_test_1', -150.50, 'GAME_BET', 'WinGo Bet');
  assert.strictEqual(adjRes.success, true);
  assert.strictEqual(adjRes.newBalance, 349.50);
  assert.strictEqual(adjRes.transaction.amount, 150.50);
  console.log('  ✅ PASS: Atomic balance debit with ledger entry executed successfully (₹500.00 -> ₹349.50)');

  // 4. Overdraft Rejection with Transaction Rollback
  const failRes = adapter.atomicAdjustBalance('u_test_1', -1000.00, 'WITHDRAW');
  assert.strictEqual(failRes.success, false);
  assert.strictEqual(failRes.message, 'Insufficient balance');

  // Verify balance didn't change
  const stateAfterFail = adapter.sqlite.prepare('SELECT balance FROM users WHERE id = ?').get('u_test_1');
  assert.strictEqual(stateAfterFail.balance, 349.50);
  console.log('  ✅ PASS: Overdraft transaction successfully rolled back, balance intact');

  // 5. Provably Fair Round Persistence
  adapter.saveProvablyFairRound('wingo', 101, 'srv_seed_abc', 'srv_hash_123', 'cli_seed_xyz', 101, { number: 7 });
  const round = adapter.getProvablyFairRound('wingo', 101);
  assert.strictEqual(round.serverSeed, 'srv_seed_abc');
  assert.strictEqual(round.serverSeedHash, 'srv_hash_123');
  console.log('  ✅ PASS: Provably fair round commitment stored and retrieved from SQLite');

  adapter.close();
  if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
  if (fs.existsSync(testDbFile + '-wal')) fs.unlinkSync(testDbFile + '-wal');
  if (fs.existsSync(testDbFile + '-shm')) fs.unlinkSync(testDbFile + '-shm');

  console.log('\n🎉 All SQLite Database Adapter tests passed successfully!');
}

runSqliteTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
