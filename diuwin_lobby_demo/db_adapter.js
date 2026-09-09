/**
 * DiuWin Enterprise ACID Relational Database Adapter
 * Powered by Node.js 24 native `node:sqlite` (DatabaseSync)
 * Features:
 *  - Write-Ahead Logging (WAL mode) for non-blocking concurrent reads & high-throughput writes
 *  - ACID transaction guarantees for ledger balance adjustments & rollbacks
 *  - Auto-migration from existing db.json without data loss
 *  - Full in-memory sync for zero-latency lookups and backward compatibility
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

class DatabaseAdapter {
  constructor(dbPath) {
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = dbPath;
    this.sqlite = new DatabaseSync(dbPath);

    // Enable high-performance, crash-resilient WAL mode
    this.sqlite.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `);

    this.initTables();
    this.initStatements();
  }

  initTables() {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        phone TEXT UNIQUE,
        passwordHash TEXT,
        balance REAL NOT NULL DEFAULT 0.0,
        vipLevel INTEGER NOT NULL DEFAULT 1,
        name TEXT,
        token TEXT,
        inviteCode TEXT,
        isBanned INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
      CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        userId TEXT,
        type TEXT,
        amount REAL,
        balanceAfter REAL,
        refId TEXT,
        orderId TEXT,
        utrNumber TEXT,
        method TEXT,
        destination TEXT,
        status TEXT,
        description TEXT,
        createdAt TEXT,
        verifiedAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(userId);
      CREATE INDEX IF NOT EXISTS idx_tx_order ON transactions(orderId);

      CREATE TABLE IF NOT EXISTS bets (
        id TEXT PRIMARY KEY,
        userId TEXT,
        gameId TEXT,
        gameName TEXT,
        period TEXT,
        choice TEXT,
        details TEXT,
        betAmount REAL,
        winAmount REAL,
        multiplier REAL,
        profitOrLoss REAL,
        isWin INTEGER,
        outcomeDetails TEXT,
        balanceAfter REAL,
        createdAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(userId);
      CREATE INDEX IF NOT EXISTS idx_bets_game ON bets(gameId);

      CREATE TABLE IF NOT EXISTS game_history (
        id TEXT PRIMARY KEY,
        gameId TEXT,
        period INTEGER,
        result TEXT,
        outcomeJson TEXT,
        totalBet REAL,
        totalPayout REAL,
        netHouseProfit REAL,
        timestamp TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_history_game_period ON game_history(gameId, period);

      CREATE TABLE IF NOT EXISTS live_wins (
        id TEXT PRIMARY KEY,
        user TEXT,
        avatar TEXT,
        game TEXT,
        amount REAL,
        time TEXT,
        timestamp TEXT
      );

      CREATE TABLE IF NOT EXISTS provably_fair_rounds (
        gameId TEXT,
        period INTEGER,
        serverSeed TEXT,
        serverSeedHash TEXT,
        clientSeed TEXT,
        nonce INTEGER,
        outcome TEXT,
        resolvedAt TEXT,
        PRIMARY KEY (gameId, period)
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  }

  initStatements() {
    this.stmtInsertUser = this.sqlite.prepare(`
      INSERT OR REPLACE INTO users (id, phone, passwordHash, balance, vipLevel, name, token, inviteCode, isBanned, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetUserById = this.sqlite.prepare(`
      SELECT * FROM users WHERE id = ?
    `);

    this.stmtGetUserByPhone = this.sqlite.prepare(`
      SELECT * FROM users WHERE phone = ?
    `);

    this.stmtUpdateUserBalance = this.sqlite.prepare(`
      UPDATE users SET balance = ?, vipLevel = ? WHERE id = ?
    `);

    this.stmtInsertTx = this.sqlite.prepare(`
      INSERT OR REPLACE INTO transactions (id, userId, type, amount, balanceAfter, refId, orderId, utrNumber, method, destination, status, description, createdAt, verifiedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtInsertBet = this.sqlite.prepare(`
      INSERT OR REPLACE INTO bets (id, userId, gameId, gameName, period, choice, details, betAmount, winAmount, multiplier, profitOrLoss, isWin, outcomeDetails, balanceAfter, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtInsertHistory = this.sqlite.prepare(`
      INSERT OR REPLACE INTO game_history (id, gameId, period, result, outcomeJson, totalBet, totalPayout, netHouseProfit, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtInsertLiveWin = this.sqlite.prepare(`
      INSERT OR REPLACE INTO live_wins (id, user, avatar, game, amount, time, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtInsertProvablyFair = this.sqlite.prepare(`
      INSERT OR REPLACE INTO provably_fair_rounds (gameId, period, serverSeed, serverSeedHash, clientSeed, nonce, outcome, resolvedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetProvablyFair = this.sqlite.prepare(`
      SELECT * FROM provably_fair_rounds WHERE gameId = ? AND period = ?
    `);
  }

  /**
   * Auto-migrates from db.json if the users table is empty.
   */
  migrateFromJson(jsonDb) {
    const userCount = this.sqlite.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount > 0) {
      return false; // Already populated
    }

    console.log('🔄 Migrating legacy db.json into ACID SQLite database...');
    this.sqlite.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      if (Array.isArray(jsonDb.users)) {
        for (const u of jsonDb.users) {
          this.stmtInsertUser.run(
            u.id,
            u.phone,
            u.passwordHash,
            Number(u.balance || 0),
            parseInt(u.vipLevel || 1),
            u.name || 'Player',
            u.token || '',
            u.inviteCode || '',
            u.isBanned ? 1 : 0,
            u.createdAt || new Date().toISOString()
          );
        }
      }

      if (Array.isArray(jsonDb.transactions)) {
        for (const t of jsonDb.transactions) {
          this.stmtInsertTx.run(
            t.id,
            t.userId || null,
            t.type || 'ADJUSTMENT',
            Number(t.amount || 0),
            Number(t.balanceAfter || 0),
            t.refId || null,
            t.orderId || null,
            t.utrNumber || null,
            t.method || null,
            t.destination || null,
            t.status || 'SUCCESS',
            t.description || '',
            t.createdAt || new Date().toISOString(),
            t.verifiedAt || null
          );
        }
      }

      if (Array.isArray(jsonDb.bets)) {
        for (const b of jsonDb.bets) {
          this.stmtInsertBet.run(
            b.id,
            b.userId || '',
            b.gameId || '',
            b.gameName || '',
            String(b.period || ''),
            String(b.choice || ''),
            String(b.details || ''),
            Number(b.betAmount || 0),
            Number(b.winAmount || 0),
            Number(b.multiplier || 0),
            Number(b.profitOrLoss || 0),
            b.isWin ? 1 : 0,
            typeof b.outcomeDetails === 'object' ? JSON.stringify(b.outcomeDetails) : String(b.outcomeDetails || ''),
            Number(b.balanceAfter || 0),
            b.createdAt || new Date().toISOString()
          );
        }
      }

      if (Array.isArray(jsonDb.masterHistory)) {
        for (const h of jsonDb.masterHistory) {
          this.stmtInsertHistory.run(
            h.id || (h.gameId + '_' + h.period),
            h.gameId || '',
            parseInt(h.period || 0),
            String(h.result || ''),
            typeof h.outcomeDetails === 'object' ? JSON.stringify(h.outcomeDetails) : '',
            Number(h.totalBet || 0),
            Number(h.totalPayout || 0),
            Number(h.netHouseProfit || 0),
            h.timestamp || new Date().toISOString()
          );
        }
      }

      if (Array.isArray(jsonDb.liveWins)) {
        for (const w of jsonDb.liveWins) {
          this.stmtInsertLiveWin.run(
            w.id || ('w_' + Date.now()),
            w.user || '',
            w.avatar || 'P',
            w.game || '',
            Number(w.amount || 0),
            w.time || 'Just now',
            w.timestamp || new Date().toISOString()
          );
        }
      }

      this.sqlite.exec('COMMIT');
      console.log('✅ SQLite Database Migration complete.');
      return true;
    } catch (err) {
      this.sqlite.exec('ROLLBACK');
      console.error('❌ Failed to migrate db.json into SQLite:', err);
      throw err;
    }
  }

  /**
   * Loads full active in-memory state from SQLite database.
   */
  loadFullState() {
    const rawUsers = this.sqlite.prepare('SELECT * FROM users').all();
    const users = rawUsers.map(u => ({
      ...u,
      balance: Number(u.balance),
      vipLevel: parseInt(u.vipLevel),
      isBanned: Boolean(u.isBanned)
    }));

    const rawTxs = this.sqlite.prepare('SELECT * FROM transactions ORDER BY rowid DESC LIMIT 500').all();
    const transactions = rawTxs.map(t => ({
      ...t,
      amount: Number(t.amount),
      balanceAfter: Number(t.balanceAfter)
    }));

    const rawBets = this.sqlite.prepare('SELECT * FROM bets ORDER BY rowid DESC LIMIT 500').all();
    const bets = rawBets.map(b => ({
      ...b,
      betAmount: Number(b.betAmount),
      winAmount: Number(b.winAmount),
      multiplier: Number(b.multiplier),
      profitOrLoss: Number(b.profitOrLoss),
      isWin: Boolean(b.isWin),
      outcomeDetails: b.outcomeDetails ? (() => { try { return JSON.parse(b.outcomeDetails); } catch(e) { return b.outcomeDetails; } })() : null
    }));

    const rawHistory = this.sqlite.prepare('SELECT * FROM game_history ORDER BY rowid DESC LIMIT 500').all();
    const masterHistory = rawHistory.map(h => ({
      ...h,
      period: parseInt(h.period),
      totalBet: Number(h.totalBet),
      totalPayout: Number(h.totalPayout),
      netHouseProfit: Number(h.netHouseProfit)
    }));

    const rawLiveWins = this.sqlite.prepare('SELECT * FROM live_wins ORDER BY rowid DESC LIMIT 30').all();
    const liveWins = rawLiveWins.map(w => ({
      ...w,
      amount: Number(w.amount)
    }));

    // Restore gameHistories and periods
    const gameHistories = {
      wingo: [], k3: [], '5d': [], aviator: [], mines: [], chicken: []
    };
    const periods = {
      wingo: 1, k3: 1, '5d': 1, aviator: 1, mines: 1, chicken: 1
    };

    ['wingo', 'k3', '5d', 'aviator', 'mines', 'chicken'].forEach(gId => {
      const records = masterHistory.filter(m => m.gameId === gId);
      if (records.length > 0) {
        const maxP = Math.max(...records.map(r => r.period));
        periods[gId] = Math.max(periods[gId], maxP + 1);
      }
    });

    return {
      users,
      transactions,
      bets,
      masterHistory,
      liveWins,
      gameHistories,
      periods
    };
  }

  /**
   * Concurrency-Safe Atomic Ledger Balance Adjustment
   * Executes inside an immediate SQLite transaction with rollback protection.
   */
  atomicAdjustBalance(userId, delta, type = 'ADJUSTMENT', description = '', refId = null) {
    if (typeof delta !== 'number' || isNaN(delta) || !isFinite(delta)) {
      return { success: false, message: 'Invalid transaction delta amount' };
    }

    this.sqlite.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      const user = this.stmtGetUserById.get(userId);
      if (!user) {
        this.sqlite.exec('ROLLBACK');
        return { success: false, message: 'User not found' };
      }

      const currentPaise = Math.round(Number(user.balance || 0) * 100);
      const deltaPaise = Math.round(Number(delta) * 100);

      if (deltaPaise === 0 && delta !== 0) {
        this.sqlite.exec('ROLLBACK');
        return { success: false, message: 'Transaction delta is too small' };
      }

      const newPaise = currentPaise + deltaPaise;
      if (newPaise < 0) {
        this.sqlite.exec('ROLLBACK');
        return { success: false, message: 'Insufficient balance' };
      }

      const newBalance = Number((newPaise / 100).toFixed(2));
      let vipLevel = parseInt(user.vipLevel || 1);
      if (newBalance >= 5000) vipLevel = Math.max(vipLevel, 3);
      else if (newBalance >= 2000) vipLevel = Math.max(vipLevel, 2);

      // Update User in SQLite
      this.stmtUpdateUserBalance.run(newBalance, vipLevel, userId);

      // Insert Transaction in SQLite
      const txId = 'tx_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
      const amount = Math.abs(Number((deltaPaise / 100).toFixed(2)));
      const txDesc = description || `${type} ₹${amount.toFixed(2)}`;
      const nowIso = new Date().toISOString();

      this.stmtInsertTx.run(
        txId,
        userId,
        type,
        amount,
        newBalance,
        refId || null,
        null,
        null,
        null,
        null,
        'SUCCESS',
        txDesc,
        nowIso,
        nowIso
      );

      this.sqlite.exec('COMMIT');

      const txRecord = {
        id: txId,
        userId,
        type,
        amount,
        balanceAfter: newBalance,
        refId: refId || undefined,
        status: 'SUCCESS',
        description: txDesc,
        createdAt: nowIso
      };

      return {
        success: true,
        newBalance,
        vipLevel,
        transaction: txRecord
      };
    } catch (err) {
      try { this.sqlite.exec('ROLLBACK'); } catch (e) {}
      console.error('Error in atomicAdjustBalance:', err);
      return { success: false, message: 'Internal ledger transaction error' };
    }
  }

  saveUser(user) {
    this.stmtInsertUser.run(
      user.id,
      user.phone,
      user.passwordHash,
      Number(user.balance || 0),
      parseInt(user.vipLevel || 1),
      user.name || 'Player',
      user.token || '',
      user.inviteCode || '',
      user.isBanned ? 1 : 0,
      user.createdAt || new Date().toISOString()
    );
  }

  saveBet(bet) {
    this.stmtInsertBet.run(
      bet.id,
      bet.userId || '',
      bet.gameId || '',
      bet.gameName || '',
      String(bet.period || ''),
      String(bet.choice || ''),
      String(bet.details || ''),
      Number(bet.betAmount || 0),
      Number(bet.winAmount || 0),
      Number(bet.multiplier || 0),
      Number(bet.profitOrLoss || 0),
      bet.isWin ? 1 : 0,
      typeof bet.outcomeDetails === 'object' ? JSON.stringify(bet.outcomeDetails) : String(bet.outcomeDetails || ''),
      Number(bet.balanceAfter || 0),
      bet.createdAt || new Date().toISOString()
    );
  }

  saveTransaction(tx) {
    this.stmtInsertTx.run(
      tx.id,
      tx.userId || null,
      tx.type || 'ADJUSTMENT',
      Number(tx.amount || 0),
      Number(tx.balanceAfter || 0),
      tx.refId || null,
      tx.orderId || null,
      tx.utrNumber || null,
      tx.method || null,
      tx.destination || null,
      tx.status || 'SUCCESS',
      tx.description || '',
      tx.createdAt || new Date().toISOString(),
      tx.verifiedAt || null
    );
  }

  saveGameHistory(item) {
    this.stmtInsertHistory.run(
      item.id || (item.gameId + '_' + item.period + '_' + Date.now()),
      item.gameId || '',
      parseInt(item.period || 0),
      String(item.result || ''),
      typeof item.outcomeDetails === 'object' ? JSON.stringify(item.outcomeDetails) : '',
      Number(item.totalBet || 0),
      Number(item.totalPayout || 0),
      Number(item.netHouseProfit || 0),
      item.timestamp || new Date().toISOString()
    );
  }

  saveLiveWin(w) {
    this.stmtInsertLiveWin.run(
      w.id || ('w_' + Date.now()),
      w.user || '',
      w.avatar || 'P',
      w.game || '',
      Number(w.amount || 0),
      w.time || 'Just now',
      w.timestamp || new Date().toISOString()
    );
  }

  saveProvablyFairRound(gameId, period, serverSeed, serverSeedHash, clientSeed, nonce, outcome) {
    this.stmtInsertProvablyFair.run(
      gameId,
      parseInt(period),
      serverSeed,
      serverSeedHash,
      clientSeed,
      parseInt(nonce),
      typeof outcome === 'object' ? JSON.stringify(outcome) : String(outcome),
      new Date().toISOString()
    );
  }

  getProvablyFairRound(gameId, period) {
    return this.stmtGetProvablyFair.get(gameId, parseInt(period));
  }

  getHealth() {
    return {
      engine: 'SQLite (node:sqlite)',
      mode: 'WAL',
      path: this.dbPath,
      userCount: this.sqlite.prepare('SELECT COUNT(*) as c FROM users').get().c,
      txCount: this.sqlite.prepare('SELECT COUNT(*) as c FROM transactions').get().c,
      betCount: this.sqlite.prepare('SELECT COUNT(*) as c FROM bets').get().c,
      historyCount: this.sqlite.prepare('SELECT COUNT(*) as c FROM game_history').get().c
    };
  }

  close() {
    this.sqlite.close();
  }
}

module.exports = DatabaseAdapter;
