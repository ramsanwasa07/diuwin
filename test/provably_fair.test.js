/**
 * Provably Fair Cryptographic Integrity & Production Operations Test Suite
 */
const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const serverModule = require('../server');
const app = serverModule.app || serverModule;

const TEST_PORT = 3105;
let serverInstance = null;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('🎲 Starting Provably Fair & Production Operations Test Suite...\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Reason: ${err.message}\n`);
      failed++;
    }
  }

  serverInstance = await serverModule.startServer(TEST_PORT);

  // 1. Production Security Headers
  await test('Production security headers are applied to HTTP responses', async () => {
    const res = await request('GET', '/api/games/list');
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.strictEqual(res.headers['x-xss-protection'], '1; mode=block');
    assert.strictEqual(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  });

  // 2. Production Health Check
  await test('/api/health returns operational metrics and SQLite health', async () => {
    const res = await request('GET', '/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'healthy');
    assert(typeof res.body.uptimeSeconds === 'number');
    assert(typeof res.body.memoryUsageMB === 'object');
    assert.strictEqual(res.body.database.engine, 'SQLite (node:sqlite)');
    assert.strictEqual(res.body.database.mode, 'WAL');
    assert(typeof res.body.database.userCount === 'number');
  });

  // 3. Pre-round Active Commitment Seeds
  await test('/api/provably-fair/active-seeds returns SHA-256 hashes without leaking server seeds', async () => {
    const res = await request('GET', '/api/provably-fair/active-seeds');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    const games = res.body.games;
    assert(games.wingo && games.k3 && games['5d'] && games.aviator);

    // Verify format: SHA-256 is 64 hex characters
    assert.strictEqual(games.wingo.serverSeedHash.length, 64);
    assert.strictEqual(games.k3.serverSeedHash.length, 64);
    assert.strictEqual(games['5d'].serverSeedHash.length, 64);
    assert.strictEqual(games.aviator.serverSeedHash.length, 64);

    // Verify secret server seeds are NOT exposed
    assert.strictEqual(games.wingo.serverSeed, undefined);
    assert.strictEqual(games.k3.serverSeed, undefined);
    assert.strictEqual(games['5d'].serverSeed, undefined);
    assert.strictEqual(games.aviator.serverSeed, undefined);
  });

  // 4. Client State Endpoints Include Cryptographic Proof Commitments
  await test('Game state endpoints expose pre-round commitments', async () => {
    const wingo = await request('GET', '/api/wingo/state');
    assert.strictEqual(wingo.status, 200);
    assert(wingo.body.provablyFair && wingo.body.provablyFair.serverSeedHash);

    const k3 = await request('GET', '/api/k3/state');
    assert.strictEqual(k3.status, 200);
    assert(k3.body.provablyFair && k3.body.provablyFair.serverSeedHash);

    const fived = await request('GET', '/api/5d/state');
    assert.strictEqual(fived.status, 200);
    assert(fived.body.provablyFair && fived.body.provablyFair.serverSeedHash);

    const aviator = await request('GET', '/api/aviator/state');
    assert.strictEqual(aviator.status, 200);
    assert(aviator.body.provablyFair && aviator.body.provablyFair.serverSeedHash);
  });

  // 5. Independent Provably Fair Verification API (HMAC-SHA256)
  await test('POST /api/provably-fair/verify deterministically validates outcomes', async () => {
    const testServerSeed = '4a8b792e3c1d5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a';
    const testClientSeed = 'fair_test_client_seed_123';
    const testNonce = 42;

    const res = await request('POST', '/api/provably-fair/verify', {
      serverSeed: testServerSeed,
      clientSeed: testClientSeed,
      nonce: testNonce,
      gameType: 'wingo'
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.verified, true);
    assert.strictEqual(res.body.algorithm, 'HMAC-SHA256');

    // SHA-256 hash must match
    const expectedHash = crypto.createHash('sha256').update(testServerSeed).digest('hex');
    assert.strictEqual(res.body.serverSeedHash, expectedHash);
    assert(typeof res.body.outcome === 'number');
    assert(res.body.outcome >= 0 && res.body.outcome <= 9);
  });

  // 6. GET /api/provably-fair/verify with Query Parameters
  await test('GET /api/provably-fair/verify validates outcomes via query parameters', async () => {
    const testServerSeed = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const res = await request('GET', `/api/provably-fair/verify?serverSeed=${testServerSeed}&clientSeed=client_test&nonce=1&gameType=k3`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.verified, true);
    assert(Array.isArray(res.body.outcome));
    assert.strictEqual(res.body.outcome.length, 3);
  });

  // 7. Aviator Deterministic Multiplier Verification
  await test('Aviator crash point can be verified deterministically', async () => {
    const testServerSeed = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    const res = await request('POST', '/api/provably-fair/verify', {
      serverSeed: testServerSeed,
      clientSeed: 'aviator_fair_client',
      nonce: 10,
      gameType: 'aviator'
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.verified, true);
    assert(typeof res.body.outcome === 'number');
    assert(res.body.outcome >= 1.00);
  });

  await serverModule.stopServer();

  console.log(`\n🎉 Provably Fair Audit Complete: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
