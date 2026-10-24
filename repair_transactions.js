const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '.data', 'diuwin.sqlite');
const jsonPath = path.join(__dirname, '.data', 'db.json');

if (fs.existsSync(dbPath)) {
  const db = new DatabaseSync(dbPath);
  db.exec('BEGIN TRANSACTION');

  const rows = db.prepare('SELECT * FROM transactions WHERE createdAt IS NULL').all();
  console.log(`Found ${rows.length} transactions with NULL createdAt to repair in SQLite.`);

  for (const r of rows) {
    const wd = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(r.id);
    if (wd) {
      db.prepare(`
        UPDATE transactions 
        SET createdAt = ?, status = ?, method = ?, destination = ?, balanceAfter = ?, description = ?, utrNumber = null
        WHERE id = ?
      `).run(
        wd.createdAt || new Date().toISOString(),
        wd.status || 'PENDING_REVIEW',
        wd.method || 'BANK',
        wd.destination || '',
        wd.balanceAfter || r.balanceAfter || 0,
        wd.description || '',
        r.id
      );
    } else if (r.status && r.status.includes('T') && r.status.includes('Z')) {
      db.prepare('UPDATE transactions SET createdAt = ?, status = ? WHERE id = ?').run(r.status, 'COMPLETED', r.id);
    } else {
      db.prepare('UPDATE transactions SET createdAt = ? WHERE id = ?').run(new Date().toISOString(), r.id);
    }
  }

  db.exec('COMMIT');
  console.log('SQLite repair complete.');
}

if (fs.existsSync(jsonPath)) {
  const jsonDb = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  let fixedCount = 0;
  if (Array.isArray(jsonDb.transactions)) {
    for (const t of jsonDb.transactions) {
      if (!t.createdAt) {
        if (Array.isArray(jsonDb.withdrawals)) {
          const w = jsonDb.withdrawals.find(x => x.id === t.id);
          if (w) {
            t.createdAt = w.createdAt || new Date().toISOString();
            t.status = w.status || 'PENDING_REVIEW';
            t.method = w.method || 'BANK';
            t.destination = w.destination || '';
            t.balanceAfter = w.balanceAfter || 0;
            t.description = w.description || '';
            delete t.utrNumber;
          } else if (t.status && t.status.includes('T') && t.status.includes('Z')) {
            t.createdAt = t.status;
            t.status = 'COMPLETED';
          } else {
            t.createdAt = new Date().toISOString();
          }
        } else {
          t.createdAt = new Date().toISOString();
        }
        fixedCount++;
      }
    }
    fs.writeFileSync(jsonPath, JSON.stringify(jsonDb, null, 2), 'utf8');
    console.log(`Fixed ${fixedCount} records in .data/db.json`);
  }
}
