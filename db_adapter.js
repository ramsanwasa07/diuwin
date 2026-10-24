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
        balanceBefore REAL NOT NULL DEFAULT 0.0,
        balanceAfter REAL NOT NULL DEFAULT 0.0,
        refId TEXT,
        orderId TEXT,
        utrNumber TEXT,
        idempotencyKey TEXT,
        method TEXT,
        destination TEXT,
        status TEXT,
        description TEXT,
        ipAddress TEXT,
        userAgent TEXT,
        auditHash TEXT,
        metaJson TEXT,
        createdAt TEXT,
        verifiedAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(userId);
      CREATE INDEX IF NOT EXISTS idx_tx_order ON transactions(orderId);

      CREATE TABLE IF NOT EXISTS idempotency_records (
        key TEXT PRIMARY KEY,
        userId TEXT,
        action TEXT,
        statusCode INTEGER,
        responseJson TEXT,
        createdAt TEXT,
        expiresAt INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_idem_expires ON idempotency_records(expiresAt);

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

      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY,
        adminId TEXT,
        withdrawalId TEXT,
        action TEXT,
        oldStatus TEXT,
        newStatus TEXT,
        reason TEXT,
        ip TEXT,
        timestamp TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_wd ON admin_audit_logs(withdrawalId);

      CREATE TABLE IF NOT EXISTS user_notifications (
        id TEXT PRIMARY KEY,
        userId TEXT,
        type TEXT,
        title TEXT,
        message TEXT,
        refId TEXT,
        read INTEGER DEFAULT 0,
        createdAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_notif_user ON user_notifications(userId);

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

      CREATE TABLE IF NOT EXISTS withdrawals (
        id TEXT PRIMARY KEY,
        txId TEXT,
        userId TEXT NOT NULL,
        userPhone TEXT,
        type TEXT DEFAULT 'WITHDRAW',
        method TEXT,
        destination TEXT,
        accountDetailsJson TEXT,
        amount REAL NOT NULL,
        fee REAL DEFAULT 0.0,
        netAmount REAL NOT NULL,
        balanceBefore REAL,
        balanceAfter REAL,
        status TEXT NOT NULL,
        riskScore TEXT,
        riskFlagsJson TEXT,
        referenceId TEXT,
        rejectReason TEXT,
        description TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        approvedAt TEXT,
        rejectedAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(userId);
      CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Resilient auto-migration for existing SQLite schemas
    try {
      const existingCols = this.sqlite.prepare(`PRAGMA table_info(transactions)`).all().map(c => c.name);
      if (!existingCols.includes('balanceBefore')) {
        this.sqlite.exec(`ALTER TABLE transactions ADD COLUMN balanceBefore REAL NOT NULL DEFAULT 0.0;`);
      }
      if (!existingCols.includes('idempotencyKey')) {
        this.sqlite.exec(`ALTER TABLE transactions ADD COLUMN idempotencyKey TEXT;`);
      }
      if (!existingCols.includes('ipAddress')) {
        this.sqlite.exec(`ALTER TABLE transactions ADD COLUMN ipAddress TEXT;`);
      }
      if (!existingCols.includes('userAgent')) {
        this.sqlite.exec(`ALTER TABLE transactions ADD COLUMN userAgent TEXT;`);
      }
      if (!existingCols.includes('auditHash')) {
        this.sqlite.exec(`ALTER TABLE transactions ADD COLUMN auditHash TEXT;`);
      }
      if (!existingCols.includes('metaJson')) {
        this.sqlite.exec(`ALTER TABLE transactions ADD COLUMN metaJson TEXT;`);
      }
      this.sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_tx_utr ON transactions(utrNumber);`);
      this.sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_idempotency ON transactions(idempotencyKey) WHERE idempotencyKey IS NOT NULL;`);

      // Auto-migrate user security columns (Withdrawal PIN, Phone Verified, KYC Status, 2FA)
      const existingUserCols = this.sqlite.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
      if (!existingUserCols.includes('withdrawalPinHash')) {
        this.sqlite.exec(`ALTER TABLE users ADD COLUMN withdrawalPinHash TEXT;`);
      }
      if (!existingUserCols.includes('isPhoneVerified')) {
        this.sqlite.exec(`ALTER TABLE users ADD COLUMN isPhoneVerified INTEGER DEFAULT 1;`);
      }
      if (!existingUserCols.includes('kycStatus')) {
        this.sqlite.exec(`ALTER TABLE users ADD COLUMN kycStatus TEXT DEFAULT 'VERIFIED';`);
      }
      if (!existingUserCols.includes('is2faEnabled')) {
        this.sqlite.exec(`ALTER TABLE users ADD COLUMN is2faEnabled INTEGER DEFAULT 0;`);
      }
    } catch (e) {
      console.warn('Notice: Column migration/indexing warning:', e.message);
    }
  }

  initStatements() {
    this.stmtInsertUser = this.sqlite.prepare(`
      INSERT OR REPLACE INTO users (id, phone, passwordHash, balance, vipLevel, name, token, inviteCode, isBanned, createdAt, withdrawalPinHash, isPhoneVerified, kycStatus, is2faEnabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      INSERT OR REPLACE INTO transactions (id, userId, type, amount, balanceBefore, balanceAfter, refId, orderId, utrNumber, idempotencyKey, method, destination, status, description, ipAddress, userAgent, auditHash, metaJson, createdAt, verifiedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetTxById = this.sqlite.prepare(`
      SELECT * FROM transactions WHERE id = ?
    `);

    this.stmtGetTxByIdempotency = this.sqlite.prepare(`
      SELECT * FROM transactions WHERE idempotencyKey = ?
    `);

    this.stmtGetTxByUtr = this.sqlite.prepare(`
      SELECT * FROM transactions WHERE utrNumber = ?
    `);

    this.stmtGetIdempotency = this.sqlite.prepare(`
      SELECT * FROM idempotency_records WHERE key = ?
    `);

    this.stmtInsertIdempotency = this.sqlite.prepare(`
      INSERT OR REPLACE INTO idempotency_records (key, userId, action, statusCode, responseJson, createdAt, expiresAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
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

    this.stmtInsertAuditLog = this.sqlite.prepare(`
      INSERT OR REPLACE INTO admin_audit_logs (id, adminId, withdrawalId, action, oldStatus, newStatus, reason, ip, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetAuditLogs = this.sqlite.prepare(`
      SELECT * FROM admin_audit_logs ORDER BY timestamp DESC LIMIT ?
    `);

    this.stmtInsertNotification = this.sqlite.prepare(`
      INSERT OR REPLACE INTO user_notifications (id, userId, type, title, message, refId, read, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetUserNotifications = this.sqlite.prepare(`
      SELECT * FROM user_notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT ?
    `);

    this.stmtMarkNotificationsRead = this.sqlite.prepare(`
      UPDATE user_notifications SET read = 1 WHERE userId = ?
    `);

    this.stmtInsertWithdrawal = this.sqlite.prepare(`
      INSERT OR REPLACE INTO withdrawals (
        id, txId, userId, userPhone, type, method, destination, accountDetailsJson,
        amount, fee, netAmount, balanceBefore, balanceAfter, status, riskScore,
        riskFlagsJson, referenceId, rejectReason, description, createdAt, updatedAt, approvedAt, rejectedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetWithdrawals = this.sqlite.prepare(`
      SELECT * FROM withdrawals ORDER BY rowid DESC LIMIT ?
    `);

    this.stmtGetUserWithdrawals = this.sqlite.prepare(`
      SELECT * FROM withdrawals WHERE userId = ? ORDER BY rowid DESC LIMIT ?
    `);
  }

  saveWithdrawal(w) {
    try {
      this.stmtInsertWithdrawal.run(
        w.id,
        w.txId || ('tx_' + w.id),
        w.userId || '',
        w.userPhone || '',
        w.type || 'WITHDRAW',
        w.method || 'BANK',
        w.destination || '',
        typeof w.accountDetails === 'object' ? JSON.stringify(w.accountDetails) : String(w.accountDetails || ''),
        Number(w.amount || 0),
        Number(w.fee || 0),
        Number(w.netAmount !== undefined ? w.netAmount : w.amount || 0),
        Number(w.balanceBefore || 0),
        Number(w.balanceAfter || 0),
        w.status || 'PENDING_REVIEW',
        w.riskScore || 'LOW',
        Array.isArray(w.riskFlags) ? JSON.stringify(w.riskFlags) : String(w.riskFlags || '[]'),
        w.referenceId || null,
        w.rejectReason || null,
        w.description || '',
        w.createdAt || new Date().toISOString(),
        w.updatedAt || new Date().toISOString(),
        w.approvedAt || null,
        w.rejectedAt || null
      );
    } catch (e) {
      console.warn('Failed to save withdrawal in SQLite:', e.message);
    }
  }

  loadWithdrawals(limit = 500) {
    try {
      const rows = this.stmtGetWithdrawals.all(limit);
      return rows.map(r => ({
        ...r,
        amount: Number(r.amount),
        fee: Number(r.fee),
        netAmount: Number(r.netAmount),
        balanceBefore: Number(r.balanceBefore),
        balanceAfter: Number(r.balanceAfter),
        accountDetails: r.accountDetailsJson ? (() => { try { return JSON.parse(r.accountDetailsJson); } catch (e) { return {}; } })() : {},
        riskFlags: r.riskFlagsJson ? (() => { try { return JSON.parse(r.riskFlagsJson); } catch (e) { return []; } })() : []
      }));
    } catch (e) {
      return [];
    }
  }

  migrateWithdrawalsFromJson(jsonDb) {
    try {
      const countRow = this.sqlite.prepare('SELECT COUNT(*) as count FROM withdrawals').get();
      if (countRow.count === 0 && Array.isArray(jsonDb.withdrawals) && jsonDb.withdrawals.length > 0) {
        for (const w of jsonDb.withdrawals) {
          this.saveWithdrawal(w);
        }
      }
    } catch (e) {
      console.warn('Notice: withdrawal migration warning:', e.message);
    }
  }

  saveAuditLog(entry) {
    try {
      this.stmtInsertAuditLog.run(
        entry.id,
        entry.adminId || 'admin',
        entry.withdrawalId || null,
        entry.action,
        entry.oldStatus || null,
        entry.newStatus || null,
        entry.reason || null,
        entry.ip || null,
        entry.timestamp || new Date().toISOString()
      );
    } catch (e) {
      console.warn('Failed to save audit log in SQLite:', e.message);
    }
  }

  getAuditLogs(limit = 100) {
    try {
      return this.stmtGetAuditLogs.all(limit);
    } catch (e) {
      return [];
    }
  }

  saveNotification(notif) {
    try {
      this.stmtInsertNotification.run(
        notif.id,
        notif.userId,
        notif.type || 'INFO',
        notif.title || 'Notification',
        notif.message,
        notif.refId || null,
        notif.read ? 1 : 0,
        notif.createdAt || new Date().toISOString()
      );
    } catch (e) {
      console.warn('Failed to save notification in SQLite:', e.message);
    }
  }

  getUserNotifications(userId, limit = 50) {
    try {
      return this.stmtGetUserNotifications.all(userId, limit);
    } catch (e) {
      return [];
    }
  }

  markNotificationsRead(userId) {
    try {
      this.stmtMarkNotificationsRead.run(userId);
    } catch (e) {
      console.warn('Failed to mark notifications read in SQLite:', e.message);
    }
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
            u.createdAt || new Date().toISOString(),
            u.withdrawalPinHash || null,
            u.isPhoneVerified === false ? 0 : 1,
            u.kycStatus || 'VERIFIED',
            u.is2faEnabled ? 1 : 0
          );
        }
      }

      if (Array.isArray(jsonDb.transactions)) {
        for (const t of jsonDb.transactions) {
          const balAfter = Number(t.balanceAfter || 0);
          const balBefore = t.balanceBefore !== undefined ? Number(t.balanceBefore) : balAfter;
          this.stmtInsertTx.run(
            t.id,
            t.userId || null,
            t.type || 'ADJUSTMENT',
            Number(t.amount || 0),
            balBefore,
            balAfter,
            t.refId || null,
            t.orderId || null,
            t.utrNumber || null,
            t.idempotencyKey || null,
            t.method || null,
            t.destination || null,
            t.status || 'SUCCESS',
            t.description || '',
            t.ipAddress || null,
            t.userAgent || null,
            t.auditHash || null,
            t.metaJson || null,
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
      isBanned: Boolean(u.isBanned),
      isPhoneVerified: u.isPhoneVerified !== 0,
      is2faEnabled: Boolean(u.is2faEnabled)
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

    const rawHistory = this.sqlite.prepare('SELECT * FROM game_history ORDER BY rowid DESC LIMIT 1000').all();
    const masterHistory = rawHistory.map(h => ({
      ...h,
      period: h.period,
      totalBet: Number(h.totalBet),
      totalPayout: Number(h.totalPayout),
      netHouseProfit: Number(h.netHouseProfit)
    }));

    const rawLiveWins = this.sqlite.prepare('SELECT * FROM live_wins ORDER BY rowid DESC LIMIT 30').all();
    const liveWins = rawLiveWins.map(w => ({
      ...w,
      amount: Number(w.amount)
    }));

    const withdrawals = this.loadWithdrawals(500);

    // Restore gameHistories and periods
    const gameHistories = {
      wingo: [], k3: [], '5d': [], aviator: [], mines: [], chicken: [], cricket: []
    };
    const periods = {
      wingo: 1, k3: 1, '5d': 1, aviator: 1, mines: 1, chicken: 1, cricket: 1
    };

    ['wingo', 'k3', '5d', 'aviator', 'mines', 'chicken', 'cricket'].forEach(gId => {
      const records = masterHistory.filter(m => m.gameId === gId);
      if (records.length > 0) {
        const maxP = Math.max(...records.map(r => (typeof r.period === 'number' ? r.period : (parseInt(String(r.period).replace(/^(5D|\D+)/i, ''), 10) || 0))));
        periods[gId] = Math.max(periods[gId], maxP + 1);
      }
    });

    return {
      users,
      transactions,
      bets,
      masterHistory,
      liveWins,
      withdrawals,
      gameHistories,
      periods
    };
  }

  /**
   * Production-Grade Concurrency-Safe Atomic Ledger Balance Adjustment
   * Executes inside an immediate SQLite transaction with rollback protection,
   * enforces zero negative balances, deduplicates idempotency keys and UTRs,
   * and computes a cryptographic SHA-256 audit hash.
   */
  atomicAdjustBalance(userId, delta, typeOrOpts = 'ADJUSTMENT', description = '', refId = null) {
    let opts = {};
    if (typeof typeOrOpts === 'object' && typeOrOpts !== null) {
      opts = { ...typeOrOpts };
    } else {
      opts = { type: typeOrOpts, description, refId };
    }

    const type = opts.type || 'ADJUSTMENT';
    const desc = opts.description || '';
    const ref = opts.refId || null;
    const orderId = opts.orderId || null;
    const utrNumber = opts.utrNumber ? String(opts.utrNumber).trim() : null;
    const idempotencyKey = opts.idempotencyKey ? String(opts.idempotencyKey).trim() : null;
    const method = opts.method || null;
    const destination = opts.destination || null;
    const status = opts.status || 'SUCCESS';
    const ipAddress = opts.ipAddress || null;
    const userAgent = opts.userAgent || null;
    const metaJson = opts.meta ? JSON.stringify(opts.meta) : null;
    const allowNegative = Boolean(opts.allowNegative);

    // Fast-path Idempotency check before opening transaction
    if (idempotencyKey) {
      const existingTx = this.stmtGetTxByIdempotency.get(idempotencyKey);
      if (existingTx) {
        return {
          success: true,
          duplicate: true,
          balanceBefore: Number(existingTx.balanceBefore),
          newBalance: Number(existingTx.balanceAfter),
          transaction: {
            ...existingTx,
            amount: Number(existingTx.amount),
            balanceBefore: Number(existingTx.balanceBefore),
            balanceAfter: Number(existingTx.balanceAfter)
          }
        };
      }
    }

    if (typeof delta !== 'number' || isNaN(delta) || !isFinite(delta)) {
      return { success: false, message: 'Invalid transaction delta amount' };
    }

    this.sqlite.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      // Re-check idempotency key inside transaction
      if (idempotencyKey) {
        const existingTx = this.stmtGetTxByIdempotency.get(idempotencyKey);
        if (existingTx) {
          this.sqlite.exec('COMMIT');
          return {
            success: true,
            duplicate: true,
            balanceBefore: Number(existingTx.balanceBefore),
            newBalance: Number(existingTx.balanceAfter),
            transaction: {
              ...existingTx,
              amount: Number(existingTx.amount),
              balanceBefore: Number(existingTx.balanceBefore),
              balanceAfter: Number(existingTx.balanceAfter)
            }
          };
        }
      }

      // Check duplicate UTR number for deposits
      if (utrNumber && (type === 'DEPOSIT' || type === 'RECHARGE')) {
        const existingUtr = this.stmtGetTxByUtr.get(utrNumber);
        if (existingUtr) {
          this.sqlite.exec('ROLLBACK');
          return { success: false, code: 'DUPLICATE_UTR', message: `Duplicate UTR detected: ${utrNumber} has already been submitted.` };
        }
      }

      const user = this.stmtGetUserById.get(userId);
      if (!user) {
        this.sqlite.exec('ROLLBACK');
        return { success: false, message: 'User not found' };
      }

      const balanceBefore = Number(user.balance || 0);
      const currentPaise = Math.round(balanceBefore * 100);
      const deltaPaise = Math.round(Number(delta) * 100);

      if (deltaPaise === 0 && delta !== 0) {
        this.sqlite.exec('ROLLBACK');
        return { success: false, message: 'Transaction delta is too small' };
      }

      const newPaise = currentPaise + deltaPaise;
      if (!allowNegative && newPaise < 0) {
        this.sqlite.exec('ROLLBACK');
        return { success: false, code: 'INSUFFICIENT_FUNDS', message: 'Insufficient balance' };
      }

      const newBalance = Number((newPaise / 100).toFixed(2));
      let vipLevel = parseInt(user.vipLevel || 1);
      if (newBalance >= 5000) vipLevel = Math.max(vipLevel, 3);
      else if (newBalance >= 2000) vipLevel = Math.max(vipLevel, 2);

      // Update User in SQLite
      this.stmtUpdateUserBalance.run(newBalance, vipLevel, userId);

      // Insert Transaction in SQLite
      const txId = opts.txId || ('tx_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'));
      const amount = Math.abs(Number((deltaPaise / 100).toFixed(2)));
      const txDesc = desc || `${type} ₹${amount.toFixed(2)}`;
      const nowIso = opts.createdAt || new Date().toISOString();

      // Cryptographic SHA-256 Audit Signature for Immutable Ledger
      const auditPayload = `${txId}:${userId}:${type}:${amount}:${balanceBefore}:${newBalance}:${nowIso}`;
      const auditHash = crypto.createHash('sha256').update(auditPayload).digest('hex');

      this.stmtInsertTx.run(
        txId,
        userId,
        type,
        amount,
        balanceBefore,
        newBalance,
        ref || null,
        orderId,
        utrNumber,
        idempotencyKey,
        method,
        destination,
        status,
        txDesc,
        ipAddress,
        userAgent,
        auditHash,
        metaJson,
        nowIso,
        status === 'SUCCESS' ? nowIso : null
      );

      this.sqlite.exec('COMMIT');

      const txRecord = {
        id: txId,
        userId,
        type,
        amount,
        balanceBefore,
        balanceAfter: newBalance,
        refId: ref || undefined,
        orderId: orderId || undefined,
        utrNumber: utrNumber || undefined,
        idempotencyKey: idempotencyKey || undefined,
        method: method || undefined,
        destination: destination || undefined,
        status,
        description: txDesc,
        ipAddress: ipAddress || undefined,
        userAgent: userAgent || undefined,
        auditHash,
        createdAt: nowIso
      };

      return {
        success: true,
        balanceBefore,
        newBalance,
        vipLevel,
        transaction: txRecord
      };
    } catch (err) {
      try { this.sqlite.exec('ROLLBACK'); } catch (e) {}
      console.error('Error in atomicAdjustBalance:', err);
      return { success: false, message: 'Internal ledger transaction error: ' + (err.message || err) };
    }
  }

  getIdempotency(key) {
    if (!key) return null;
    try {
      const record = this.stmtGetIdempotency.get(key);
      if (!record) return null;
      if (record.expiresAt && Date.now() > record.expiresAt) {
        return null;
      }
      return {
        ...record,
        data: JSON.parse(record.responseJson)
      };
    } catch (e) {
      return null;
    }
  }

  saveIdempotency(key, userId, action, statusCode, responseObj, ttlSeconds = 86400) {
    if (!key) return;
    const nowIso = new Date().toISOString();
    const expiresAt = Date.now() + ttlSeconds * 1000;
    try {
      this.stmtInsertIdempotency.run(
        key,
        userId || null,
        action || null,
        statusCode || 200,
        JSON.stringify(responseObj),
        nowIso,
        expiresAt
      );
    } catch (e) {
      console.warn('Failed to cache idempotency record:', e.message);
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
      user.createdAt || new Date().toISOString(),
      user.withdrawalPinHash || null,
      user.isPhoneVerified === false ? 0 : 1,
      user.kycStatus || 'VERIFIED',
      user.is2faEnabled ? 1 : 0
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
    const balBefore = Number(tx.balanceBefore !== undefined ? tx.balanceBefore : (tx.balanceAfter || 0));
    const balAfter = Number(tx.balanceAfter !== undefined ? tx.balanceAfter : balBefore);
    this.stmtInsertTx.run(
      tx.id,
      tx.userId || null,
      tx.type || 'ADJUSTMENT',
      Number(tx.amount || 0),
      balBefore,
      balAfter,
      tx.refId || tx.referenceId || null,
      tx.orderId || null,
      tx.utrNumber || null,
      tx.idempotencyKey || null,
      tx.method || null,
      tx.destination || null,
      tx.status || 'SUCCESS',
      tx.description || '',
      tx.ipAddress || null,
      tx.userAgent || null,
      tx.auditHash || null,
      tx.metaJson || null,
      tx.createdAt || new Date().toISOString(),
      tx.verifiedAt || null
    );
  }

  saveGameHistory(item) {
    this.stmtInsertHistory.run(
      item.id || (item.gameId + '_' + item.period + '_' + Date.now()),
      item.gameId || '',
      String(item.period || ''),
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
      String(period),
      serverSeed,
      serverSeedHash,
      clientSeed,
      typeof nonce === 'number' ? nonce : (parseInt(String(nonce).replace(/^(5D|\D+)/i, ''), 10) || 1),
      typeof outcome === 'object' ? JSON.stringify(outcome) : String(outcome),
      new Date().toISOString()
    );
  }

  getProvablyFairRound(gameId, period) {
    return this.stmtGetProvablyFair.get(gameId, String(period)) || this.stmtGetProvablyFair.get(gameId, parseInt(String(period).replace(/^(5D|\D+)/i, ''), 10) || 1);
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
