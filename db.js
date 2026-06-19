const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const db = new Database(path.join(__dirname, 'data', 'certs.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS certificates (
    id TEXT PRIMARY KEY,
    cert_no TEXT NOT NULL,
    name TEXT NOT NULL,
    id_number TEXT NOT NULL,
    granted_to TEXT NOT NULL,
    cert_type TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    revalidation_date TEXT NOT NULL,
    issued_by TEXT NOT NULL,
    issued_by_did TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL
  );
`);

const adminCount = db.prepare('SELECT COUNT(*) as c FROM admin_users').get().c;
if (adminCount === 0) {
  db.prepare('INSERT INTO admin_users (username, password) VALUES (?, ?)').run('admin', 'admin123');
}

function generateId() {
  return crypto.randomBytes(32).toString('hex');
}

function generateCertNo() {
  const num = Math.floor(100000 + Math.random() * 900000);
  const year = new Date().getFullYear().toString().slice(-2);
  return `GT${num}/${year}`;
}

function generateIdNumber() {
  const part1 = Math.floor(1000 + Math.random() * 9000);
  const part2 = Math.floor(1000 + Math.random() * 9000);
  const part3 = Math.floor(100 + Math.random() * 900);
  const part4 = Math.floor(1 + Math.random() * 9);
  return `T-${part1}-${part2}-${part3}-${part4}`;
}

function createCertificate({ name, cert_type, granted_to, issue_date, revalidation_date }) {
  const id = generateId();
  const cert_no = generateCertNo();
  const id_number = generateIdNumber();
  const issued_by = 'Gravity Learning Center';
  const issued_by_did = 'did:dock:5H1gPBLG8EVKb1Sfsn12A3YQ6GR39N8HHqz...';

  db.prepare(`
    INSERT INTO certificates (id, cert_no, name, id_number, granted_to, cert_type, issue_date, revalidation_date, issued_by, issued_by_did)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, cert_no, name, id_number, granted_to, cert_type, issue_date, revalidation_date, issued_by, issued_by_did);

  return getCertificate(id);
}

function getCertificate(id) {
  return db.prepare('SELECT * FROM certificates WHERE id = ?').get(id);
}

function listCertificates() {
  return db.prepare('SELECT * FROM certificates ORDER BY created_at DESC').all();
}

function deleteCertificate(id) {
  return db.prepare('DELETE FROM certificates WHERE id = ?').run(id);
}

function verifyAdmin(username, password) {
  const row = db.prepare('SELECT * FROM admin_users WHERE username = ? AND password = ?').get(username, password);
  return !!row;
}

module.exports = {
  createCertificate,
  getCertificate,
  listCertificates,
  deleteCertificate,
  verifyAdmin,
  generateId,
};
