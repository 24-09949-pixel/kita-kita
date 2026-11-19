'use strict';
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS customers(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT UNIQUE, address TEXT DEFAULT '',
  credit_limit REAL NOT NULL DEFAULT 2000, created_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT UNIQUE,
  password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','cashier','customer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  customer_id INTEGER REFERENCES customers(id), last_login TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sku TEXT NOT NULL UNIQUE, barcode TEXT UNIQUE,
  category TEXT NOT NULL, cost REAL NOT NULL CHECK(cost>=0), price REAL NOT NULL CHECK(price>=0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0), reorder_level INTEGER NOT NULL DEFAULT 10,
  expiry_date TEXT, last_restock_date TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS restocks(
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL, cost REAL NOT NULL, supplier TEXT DEFAULT '', date TEXT NOT NULL, expiry_date TEXT);
CREATE TABLE IF NOT EXISTS sales(
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, created_at TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id), cashier_id INTEGER REFERENCES users(id),
  subtotal REAL NOT NULL, discount REAL NOT NULL DEFAULT 0, total REAL NOT NULL,
  payment_type TEXT NOT NULL CHECK(payment_type IN ('cash','ewallet','utang')),
  amount_received REAL NOT NULL DEFAULT 0, change_due REAL NOT NULL DEFAULT 0, reference TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','voided')));
CREATE TABLE IF NOT EXISTS sale_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id), name TEXT NOT NULL, qty INTEGER NOT NULL,
  price REAL NOT NULL, cost REAL NOT NULL);
CREATE TABLE IF NOT EXISTS credits(
  id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER REFERENCES sales(id), customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount REAL NOT NULL, paid REAL NOT NULL DEFAULT 0, borrowed_on TEXT NOT NULL, due_date TEXT NOT NULL,
  follow_up INTEGER NOT NULL DEFAULT 1, note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid','void')));
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY AUTOINCREMENT, credit_id INTEGER NOT NULL REFERENCES credits(id), customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount REAL NOT NULL CHECK(amount>0), method TEXT NOT NULL, reference TEXT DEFAULT '', created_at TEXT NOT NULL,
  recorded_by INTEGER REFERENCES users(id), status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','pending','rejected')),
  provider TEXT NOT NULL DEFAULT 'manual', reference_last4 TEXT, receipt_mime TEXT, receipt_image BLOB, confirmed_at TEXT);
CREATE TABLE IF NOT EXISTS credit_requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id), items TEXT NOT NULL,
  amount REAL NOT NULL, preferred_due TEXT NOT NULL, note TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pending'
  CHECK(status IN ('pending','approved','declined')), owner_note TEXT DEFAULT '', created_at TEXT NOT NULL,
  decided_at TEXT, credit_id INTEGER REFERENCES credits(id));
CREATE TABLE IF NOT EXISTS expenses(
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, category TEXT NOT NULL, description TEXT DEFAULT '',
  paid_to TEXT DEFAULT '', amount REAL NOT NULL CHECK(amount>0));
CREATE TABLE IF NOT EXISTS login_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, identifier TEXT, action TEXT NOT NULL, device TEXT DEFAULT '',
  result TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_credits_customer ON credits(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_credit ON payments(credit_id);
`;

function open(file) {
  const db = new Database(file);
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  const paymentColumns = new Set(db.pragma('table_info(payments)').map(column => column.name));
  for (const [column, definition] of [
    ['provider', "TEXT NOT NULL DEFAULT 'manual'"],
    ['reference_last4', 'TEXT'],
    ['receipt_mime', 'TEXT'],
    ['receipt_image', 'BLOB'],
    ['confirmed_at', 'TEXT'],
  ]) {
    if (!paymentColumns.has(column)) db.exec(`ALTER TABLE payments ADD COLUMN ${column} ${definition}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_payments_pending_provider ON payments(status,provider,created_at)');
  return db;
}

const pad = n => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymdhms = (d = new Date()) => `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

module.exports = { open, SCHEMA, ymd, ymdhms, addDays, parseYmd, round2 };
