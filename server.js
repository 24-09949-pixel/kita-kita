'use strict';
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { open, ymd, ymdhms, addDays, parseYmd, round2 } = require('./db');

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = m => new HttpError(400, m);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = s => typeof s === 'string' && DATE_RE.test(s) && ymd(parseYmd(s)) === s;
const dayDiff = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 864e5); // a - b in days
const digits = s => String(s || '').replace(/\D/g, '');
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function num(v, label, { min = -Infinity, max = Infinity, int = false, req = true } = {}) {
  if (v === undefined || v === null || v === '') { if (req) throw bad(`${label} is required`); return undefined; }
  const n = Number(v);
  if (!Number.isFinite(n)) throw bad(`${label} must be a number`);
  if (int && !Number.isInteger(n)) throw bad(`${label} must be a whole number`);
  if (n < min) throw bad(`${label} must be at least ${min}`);
  if (n > max) throw bad(`${label} must be at most ${max}`);
  return n;
}
const weekStart = d => { const x = new Date(d); return addDays(x, -((x.getDay() + 6) % 7)); };
const CATS_EXP = ['Supplier purchase', 'Electricity', 'Ice', 'Transport', 'Other'];

function csv(rows, cols) {
  const esc = v => { let s = v === null || v === undefined ? '' : String(v); if (/^[=+\-@]/.test(s) && isNaN(Number(s))) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.map(c => c.label).map(esc).join(',')].concat(rows.map(r => cols.map(c => esc(r[c.key])).join(','))).join('\n');
}

function createApp(db, opts = {}) {
  const SECRET = opts.secret || process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'kitakita-dev-secret-change-me');
  if (!SECRET) throw new Error('JWT_SECRET must be set in production');
  const paymongoSecretKey = opts.paymongoSecretKey === undefined ? process.env.PAYMONGO_SECRET_KEY || '' : opts.paymongoSecretKey;
  const paymongoWebhookSecret = opts.paymongoWebhookSecret === undefined ? process.env.PAYMONGO_WEBHOOK_SECRET || '' : opts.paymongoWebhookSecret;
  if (!!paymongoSecretKey !== !!paymongoWebhookSecret) throw new Error('Set both PAYMONGO_SECRET_KEY and PAYMONGO_WEBHOOK_SECRET, or leave both unset');
  if (paymongoSecretKey && !/^sk_(test|live)_/.test(paymongoSecretKey)) throw new Error('PAYMONGO_SECRET_KEY must be a PayMongo test or live secret key');
  const paymongoConfigured = !!paymongoSecretKey;
  const paymongoLiveMode = paymongoSecretKey.startsWith('sk_live_');
  const publicUrl = opts.publicUrl || process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';
  const fetcher = opts.fetch || globalThis.fetch;
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; frame-ancestors 'none'" });
    next();
  });
  app.use(express.json({ limit: '100kb', verify: (req, res, buf) => {
    if (req.originalUrl.split('?')[0] === '/webhooks/paymongo') req.rawBody = Buffer.from(buf);
  } }));
  const today = () => ymd();
  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);

  // ---------- auth helpers ----------
  const fails = new Map();
  const throttle = key => { const f = fails.get(key); if (f && f.n >= 8 && Date.now() - f.t < 10 * 60e3) throw new HttpError(429, 'Too many failed attempts. Try again in a few minutes.'); };
  const noteFail = key => { const f = fails.get(key); fails.set(key, { n: f && Date.now() - f.t < 10 * 60e3 ? f.n + 1 : 1, t: Date.now() }); };
  const logLogin = (uid, ident, action, req, result) => run('INSERT INTO login_log(user_id,identifier,action,device,result,created_at) VALUES(?,?,?,?,?,?)', uid, String(ident).slice(0, 80), action, deviceOf(req), result, ymdhms());
  const deviceOf = req => { const ua = req.headers['user-agent'] || ''; const os = /Android|iPhone|iPad/.test(ua) ? 'Phone' : 'Desktop'; const br = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : 'Client'; return `${os} · ${br}`; };
  const sign = u => jwt.sign({ uid: u.id }, SECRET, { expiresIn: '12h' });
  const pubUser = u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, customer_id: u.customer_id });
  function auth(req, res, next) {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return next(new HttpError(401, 'Please log in'));
    try {
      const p = jwt.verify(h.slice(7), SECRET);
      const u = one('SELECT * FROM users WHERE id=?', p.uid);
      if (!u || u.status !== 'active') throw new Error('x');
      req.user = u; next();
    } catch { next(new HttpError(401, 'Session expired. Please log in again.')); }
  }
  const need = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have permission to do this'));
  const staff = [auth, need('admin', 'cashier')], admin = [auth, need('admin')], customer = [auth, need('customer')];

  app.post('/api/setup/owner', (req, res) => {
    const name = str(req.body.name, 80), email = str(req.body.email, 80).toLowerCase(), password = req.body.password;
    if (name.length < 2) throw bad('Enter the owner name');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Enter a valid email');
    if (typeof password !== 'string' || password.length < 12) throw bad('Owner password must be at least 12 characters');
    const id = db.transaction(() => {
      if (one('SELECT 1 FROM users LIMIT 1')) throw new HttpError(409, 'Store setup is already complete');
      return run("INSERT INTO users(name,email,password_hash,role,status,created_at) VALUES(?,?,?,'admin','active',?)",
        name, email, bcrypt.hashSync(password, 12), ymdhms()).lastInsertRowid;
    })();
    const user = one('SELECT * FROM users WHERE id=?', id);
    logLogin(user.id, email, 'Initial owner setup', req, 'Success');
    res.status(201).json({ token: sign(user), user: pubUser(user) });
  });

  app.post('/api/auth/login', (req, res) => {
    const ident = str(req.body.identifier, 80).toLowerCase(), pw = typeof req.body.password === 'string' ? req.body.password : '';
    const portal = req.body.portal === 'customer' ? 'customer' : 'staff';
    if (!ident || !pw) throw bad('Enter your login and password');
    const key = req.ip + '|' + ident; throttle(key);
    const u = portal === 'staff' ? one("SELECT * FROM users WHERE email=? AND role IN ('admin','cashier')", ident)
      : one("SELECT * FROM users WHERE role='customer' AND (email=? OR (phone=? AND phone<>''))", ident, digits(ident));
    const ok = u && bcrypt.compareSync(pw, u.password_hash);
    if (!ok) { noteFail(key); logLogin(u ? u.id : null, ident, 'Login', req, 'Failed'); throw new HttpError(401, 'Invalid login or password'); }
    if (u.status !== 'active') { logLogin(u.id, ident, 'Login', req, 'Failed'); throw new HttpError(403, 'This account is inactive. Contact the store owner.'); }
    fails.delete(key); run('UPDATE users SET last_login=? WHERE id=?', ymdhms(), u.id); logLogin(u.id, ident, 'Login', req, 'Success');
    res.json({ token: sign(u), user: pubUser(u) });
  });
  app.post('/api/auth/register', (req, res) => {
    if (!one("SELECT 1 FROM users WHERE role='admin' AND status='active'"))
      throw new HttpError(503, 'Store owner setup must be completed before customers can register');
    const name = str(req.body.name, 80), phone = digits(req.body.phone), pw = req.body.password, email = str(req.body.email, 80).toLowerCase() || null;
    if (name.length < 2) throw bad('Enter your full name');
    if (phone.length < 10 || phone.length > 13) throw bad('Enter a valid mobile number');
    if (typeof pw !== 'string' || pw.length < 6) throw bad('Password must be at least 6 characters');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Enter a valid email');
    if (one('SELECT 1 FROM users WHERE phone=? OR (email IS NOT NULL AND email=?)', phone, email)) throw new HttpError(409, 'This number or email is already registered');
    if (one('SELECT 1 FROM customers WHERE phone=?', phone)) throw new HttpError(409, 'This number already has a store record. Ask the store owner to create your portal login.');
    const id = db.transaction(() => {
      const cid = run('INSERT INTO customers(name,phone,address,credit_limit,created_at) VALUES(?,?,?,?,?)', name, phone, '', 0, ymdhms()).lastInsertRowid;
      return run("INSERT INTO users(name,email,phone,password_hash,role,customer_id,created_at) VALUES(?,?,?,?, 'customer',?,?)", name, email, phone, bcrypt.hashSync(pw, 10), cid, ymdhms()).lastInsertRowid;
    })();
    const u = one('SELECT * FROM users WHERE id=?', id);
    logLogin(u.id, phone, 'Register', req, 'Success');
    res.status(201).json({ token: sign(u), user: pubUser(u) });
  });
  app.get('/api/auth/me', auth, (req, res) => res.json({ user: pubUser(req.user) }));
  app.post('/api/auth/logout', auth, (req, res) => { logLogin(req.user.id, req.user.email || req.user.phone, 'Logout', req, 'Success'); res.json({ ok: true }); });
  app.post('/api/auth/change-password', auth, (req, res) => {
    const { current, next } = req.body;
    if (!bcrypt.compareSync(String(current || ''), req.user.password_hash)) throw bad('Current password is incorrect');
    if (typeof next !== 'string' || next.length < 6) throw bad('New password must be at least 6 characters');
    run('UPDATE users SET password_hash=? WHERE id=?', bcrypt.hashSync(next, 10), req.user.id); logLogin(req.user.id, req.user.email || req.user.phone, 'Password changed', req, 'Success');
    res.json({ ok: true });
  });

  app.get('/api/health', (req, res) => { one('SELECT 1'); res.json({ ok: true }); });
  app.get('/api/config', (req, res) => res.json({ setup_required: !one('SELECT 1 FROM users LIMIT 1'), payment_gateway: paymongoConfigured, store: { name: process.env.STORE_NAME || 'Kita Kita Store', address: process.env.STORE_ADDRESS || '', phone: process.env.STORE_PHONE || '' } }));

  app.post('/webhooks/paymongo', (req, res) => {
    if (!paymongoConfigured) throw new HttpError(503, 'Payment gateway webhook is not configured');
    const rawBody = req.rawBody;
    const signatureHeader = req.get('Paymongo-Signature') || '';
    const signatureParts = Object.fromEntries(signatureHeader.split(',').map(part => {
      const i = part.indexOf('=');
      return i < 0 ? ['', ''] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
    }).filter(([key]) => key));
    const timestamp = signatureParts.t || '';
    const signature = signatureParts[paymongoLiveMode ? 'li' : 'te'] || '';
    if (!rawBody || !/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) throw new HttpError(401, 'Invalid payment signature');
    const expected = crypto.createHmac('sha256', paymongoWebhookSecret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest();
    const received = Buffer.from(signature, 'hex');
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) throw new HttpError(401, 'Invalid payment signature');

    const envelope = req.body && req.body.data;
    const attributes = envelope && envelope.attributes || {};
    const eventType = attributes.type || envelope && envelope.type;
    if (eventType !== 'checkout_session.payment.paid') return res.json({ ok: true });
    const session = attributes.data || envelope && envelope.data;
    const eventId = envelope && envelope.id;
    const eventLiveMode = typeof attributes.livemode === 'boolean' ? attributes.livemode : envelope && envelope.livemode;
    if (!eventId || !session || typeof eventLiveMode !== 'boolean') throw bad('Invalid payment event');
    if (eventLiveMode !== paymongoLiveMode) return res.json({ ok: true });

    const sessionAttributes = session.attributes || {};
    const paidPayment = (sessionAttributes.payments || []).find(payment => payment.attributes && payment.attributes.status === 'paid');
    if (!session.id || !paidPayment) throw bad('Paid checkout details are missing');
    const paidAttributes = paidPayment.attributes;
    if (paidAttributes.currency !== 'PHP') throw bad('Unexpected payment currency');
    const paidAmount = paidAttributes.net_amount ?? paidAttributes.amount;
    if (!Number.isInteger(paidAmount) || paidAmount <= 0) throw bad('Invalid paid amount');

    db.transaction(() => {
      if (one('SELECT 1 FROM paymongo_webhook_events WHERE event_id=?', eventId)) return;
      const payment = one('SELECT * FROM payments WHERE paymongo_checkout_session_id=?', session.id);
      if (!payment) throw new HttpError(404, 'Payment for checkout session not found');
      if (payment.status === 'pending') {
        const credit = one("SELECT * FROM credits WHERE id=? AND customer_id=? AND status='open'", payment.credit_id, payment.customer_id);
        const remaining = credit ? round2(credit.amount - credit.paid) : 0;
        if (!credit || payment.amount > remaining + 0.001 || Math.round(payment.amount * 100) !== paidAmount)
          throw new HttpError(409, 'Paid checkout does not match the outstanding balance');
        const newPaid = round2(credit.paid + payment.amount);
        run('UPDATE credits SET paid=?, status=? WHERE id=?', newPaid, newPaid >= credit.amount - 0.001 ? 'paid' : 'open', credit.id);
        run("UPDATE payments SET status='confirmed', reference=? WHERE id=?", `PayMongo ${str(paidPayment.id, 40)}`, payment.id);
      }
      run('INSERT INTO paymongo_webhook_events(event_id,received_at) VALUES(?,?)', eventId, ymdhms());
    })();
    res.json({ ok: true });
  });

  // ---------- products ----------
  const pStatus = p => (p.stock === 0 ? 'out' : p.stock <= p.reorder_level ? 'low' : 'in');
  const nearExp = p => !!p.expiry_date && dayDiff(p.expiry_date, today()) <= 30;
  const decorate = p => ({ ...p, status: pStatus(p), near_expiry: nearExp(p), margin: round2(p.price - p.cost) });
  const hideCost = (req, p) => { if (req.user.role === 'admin') return p; const { cost, margin, ...rest } = p; return rest; }; // cashiers never see cost prices
  app.get('/api/products', staff, (req, res) => {
    const { q: s = '', category = '', status = '', expiry = '' } = req.query;
    const rows = q('SELECT * FROM products WHERE active=1 AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?) AND (?=\'\' OR category=?) ORDER BY name', `%${s}%`, `%${s}%`, `%${s}%`, category, category).map(decorate)
      .filter(p => (!status || (status === 'near_expiry' ? p.near_expiry : p.status === status)) && (!expiry || p.near_expiry));
    const limit = Math.min(Number(req.query.limit) || 50, 500), offset = Math.max(Number(req.query.offset) || 0, 0);
    res.json({ total: rows.length, items: rows.slice(offset, offset + limit).map(p => hideCost(req, p)) });
  });
  app.get('/api/products/summary', staff, (req, res) => {
    const all = q('SELECT * FROM products WHERE active=1').map(decorate); const adm = req.user.role === 'admin';
    res.json({ total: all.length, low: all.filter(p => p.status === 'low').length, out: all.filter(p => p.status === 'out').length, near_expiry: all.filter(p => p.near_expiry).length,
      categories: new Set(all.map(p => p.category)).size, value_cost: adm ? round2(all.reduce((a, p) => a + p.stock * p.cost, 0)) : null, value_retail: round2(all.reduce((a, p) => a + p.stock * p.price, 0)) });
  });
  app.get('/api/categories', auth, (req, res) => res.json(q('SELECT DISTINCT category FROM products WHERE active=1 ORDER BY category').map(r => r.category)));
  app.get('/api/products/code/:code', staff, (req, res) => {
    const p = one('SELECT * FROM products WHERE active=1 AND (barcode=? OR sku=? COLLATE NOCASE)', req.params.code, req.params.code);
    if (!p) throw new HttpError(404, 'No product found for that barcode / SKU');
    res.json(hideCost(req, decorate(p)));
  });
  function productBody(b, id) {
    const name = str(b.name, 100), sku = str(b.sku, 40), barcode = str(b.barcode, 40) || null, category = str(b.category, 60);
    if (!name) throw bad('Product name is required'); if (!sku) throw bad('SKU is required'); if (!category) throw bad('Category is required');
    const cost = num(b.cost, 'Cost price', { min: 0 }), price = num(b.price, 'Selling price', { min: 0 });
    const stock = num(b.stock ?? 0, 'Stock', { min: 0, int: true }), reorder = num(b.reorder_level ?? 10, 'Reorder level', { min: 0, int: true });
    const expiry = b.expiry_date ? str(b.expiry_date, 10) : null; if (expiry && !validDate(expiry)) throw bad('Expiry date must be a valid date');
    if (one('SELECT 1 FROM products WHERE sku=? COLLATE NOCASE AND id<>?', sku, id || 0)) throw new HttpError(409, 'That SKU already exists');
    if (barcode && one('SELECT 1 FROM products WHERE barcode=? AND id<>?', barcode, id || 0)) throw new HttpError(409, 'That barcode already exists');
    return { name, sku, barcode, category, cost, price, stock, reorder, expiry };
  }
  app.post('/api/products', admin, (req, res) => {
    const p = productBody(req.body);
    const id = run('INSERT INTO products(name,sku,barcode,category,cost,price,stock,reorder_level,expiry_date,last_restock_date,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', p.name, p.sku, p.barcode, p.category, p.cost, p.price, p.stock, p.reorder, p.expiry, p.stock > 0 ? today() : null, ymdhms()).lastInsertRowid;
    res.status(201).json(decorate(one('SELECT * FROM products WHERE id=?', id)));
  });
  app.put('/api/products/:id', admin, (req, res) => {
    const cur = one('SELECT * FROM products WHERE id=? AND active=1', req.params.id); if (!cur) throw new HttpError(404, 'Product not found');
    const p = productBody(req.body, cur.id);
    run('UPDATE products SET name=?,sku=?,barcode=?,category=?,cost=?,price=?,stock=?,reorder_level=?,expiry_date=? WHERE id=?', p.name, p.sku, p.barcode, p.category, p.cost, p.price, p.stock, p.reorder, p.expiry, cur.id);
    res.json(decorate(one('SELECT * FROM products WHERE id=?', cur.id)));
  });
  app.delete('/api/products/:id', admin, (req, res) => {
    const r = run("UPDATE products SET active=0, barcode=NULL, sku=sku||'~del'||id WHERE id=? AND active=1", req.params.id);
    if (!r.changes) throw new HttpError(404, 'Product not found'); res.json({ ok: true });
  });
  app.post('/api/products/:id/restock', admin, (req, res) => {
    const p = one('SELECT * FROM products WHERE id=? AND active=1', req.params.id); if (!p) throw new HttpError(404, 'Product not found');
    const qty = num(req.body.qty, 'Quantity', { min: 1, max: 100000, int: true }), cost = num(req.body.cost ?? p.cost, 'Cost price', { min: 0 });
    const date = str(req.body.date) || today(), exp = req.body.expiry_date ? str(req.body.expiry_date) : p.expiry_date;
    if (!validDate(date)) throw bad('Restock date must be a valid date'); if (exp && !validDate(exp)) throw bad('Expiry date must be a valid date');
    db.transaction(() => {
      run('INSERT INTO restocks(product_id,qty,cost,supplier,date,expiry_date) VALUES(?,?,?,?,?,?)', p.id, qty, cost, str(req.body.supplier, 80), date, exp || null);
      run('UPDATE products SET stock=stock+?, cost=?, last_restock_date=?, expiry_date=? WHERE id=?', qty, cost, date, exp || null, p.id);
    })();
    res.json(decorate(one('SELECT * FROM products WHERE id=?', p.id)));
  });
  app.get('/api/products/:id/restocks', admin, (req, res) => res.json(q('SELECT * FROM restocks WHERE product_id=? ORDER BY date DESC, id DESC LIMIT 20', req.params.id)));

  // ---------- customers & credit helpers ----------
  const creditView = c => { const bal = round2(c.amount - c.paid); const dl = dayDiff(c.due_date, today());
    return { ...c, balance: bal, days_left: dl, state: c.status === 'paid' ? 'paid' : c.status === 'void' ? 'void' : dl < 0 ? 'overdue' : dl <= 7 ? 'due_soon' : 'current' }; };
  const balanceOf = cid => round2(one("SELECT COALESCE(SUM(amount-paid),0) b FROM credits WHERE customer_id=? AND status='open'", cid).b);
  const CUST_SQL = `SELECT c.*, COALESCE(b.bal,0) balance, b.next_due, COALESCE(b.overdue,0) overdue,
    (SELECT MAX(created_at) FROM sales WHERE customer_id=c.id AND status='completed') last_purchase,
    EXISTS(SELECT 1 FROM users WHERE customer_id=c.id) has_portal
    FROM customers c LEFT JOIN (SELECT customer_id, SUM(amount-paid) bal, MIN(due_date) next_due, MAX(CASE WHEN due_date<? THEN 1 ELSE 0 END) overdue FROM credits WHERE status='open' GROUP BY customer_id) b ON b.customer_id=c.id`;
  const custRow = c => ({ ...c, balance: round2(c.balance), days_to_due: c.next_due ? dayDiff(c.next_due, today()) : null, available: round2(Math.max(0, c.credit_limit - c.balance)) });
  app.get('/api/customers', staff, (req, res) => {
    const s = `%${str(req.query.q || '', 50)}%`; const sort = req.query.sort === 'name' ? 'c.name' : 'balance DESC, c.name';
    const rows = q(`${CUST_SQL} WHERE c.active=1 AND (c.name LIKE ? OR c.phone LIKE ?) ORDER BY ${sort}`, today(), s, s).map(custRow);
    const st = req.query.status; const f = rows.filter(c => !st || (st === 'overdue' ? c.overdue : st === 'balance' ? c.balance > 0 : c.balance === 0));
    res.json({ total: f.length, items: f.slice(0, 200),
      summary: { count: rows.length, with_balance: rows.filter(c => c.balance > 0).length, outstanding: round2(rows.reduce((a, c) => a + c.balance, 0)), overdue_customers: rows.filter(c => c.overdue).length, new_month: rows.filter(c => c.created_at.slice(0, 7) === today().slice(0, 7)).length } });
  });
  const custBody = (b, id) => {
    const name = str(b.name, 80), phone = digits(b.phone) || null; if (name.length < 2) throw bad('Customer name is required');
    if (phone && (phone.length < 10 || phone.length > 13)) throw bad('Enter a valid mobile number');
    if (phone && one('SELECT 1 FROM customers WHERE phone=? AND id<>?', phone, id || 0)) throw new HttpError(409, 'That phone number is already used by another customer');
    return { name, phone, address: str(b.address, 150), limit: num(b.credit_limit ?? 2000, 'Credit limit', { min: 0, max: 1e6 }) };
  };
  app.post('/api/customers', staff, (req, res) => {
    const c = custBody(req.body);
    const id = run('INSERT INTO customers(name,phone,address,credit_limit,created_at) VALUES(?,?,?,?,?)', c.name, c.phone, c.address, c.limit, ymdhms()).lastInsertRowid;
    res.status(201).json(custRow(one(`${CUST_SQL} WHERE c.id=?`, today(), id)));
  });
  app.put('/api/customers/:id', staff, (req, res) => {
    const cur = one('SELECT * FROM customers WHERE id=? AND active=1', req.params.id); if (!cur) throw new HttpError(404, 'Customer not found');
    const c = custBody({ ...cur, ...req.body, credit_limit: req.user.role === 'admin' ? (req.body.credit_limit ?? cur.credit_limit) : cur.credit_limit }, cur.id);
    run('UPDATE customers SET name=?,phone=?,address=?,credit_limit=? WHERE id=?', c.name, c.phone, c.address, c.limit, cur.id);
    run("UPDATE users SET name=?, phone=? WHERE customer_id=? AND role='customer'", c.name, c.phone, cur.id);
    res.json(custRow(one(`${CUST_SQL} WHERE c.id=?`, today(), cur.id)));
  });
  app.get('/api/customers/:id', staff, (req, res) => {
    const c = one(`${CUST_SQL} WHERE c.id=? AND c.active=1`, today(), req.params.id); if (!c) throw new HttpError(404, 'Customer not found');
    const credits = q('SELECT cr.*, s.code FROM credits cr LEFT JOIN sales s ON s.id=cr.sale_id WHERE cr.customer_id=? ORDER BY cr.borrowed_on DESC, cr.id DESC', c.id).map(creditView);
    const payments = q("SELECT p.*, COALESCE(s.code,'CR-'||cr.id) code, u.name recorded_by_name FROM payments p JOIN credits cr ON cr.id=p.credit_id LEFT JOIN sales s ON s.id=cr.sale_id LEFT JOIN users u ON u.id=p.recorded_by WHERE p.customer_id=? ORDER BY p.created_at DESC, p.id DESC LIMIT 50", c.id);
    const life = one("SELECT COALESCE(SUM(amount),0) borrowed, COALESCE(SUM(paid),0) paid FROM credits WHERE customer_id=? AND status<>'void'", c.id);
    res.json({ customer: custRow(c), credits, payments, lifetime: { borrowed: round2(life.borrowed), paid: round2(life.paid) } });
  });
  app.post('/api/customers/:id/portal-account', admin, (req, res) => {
    const c = one('SELECT * FROM customers WHERE id=? AND active=1', req.params.id); if (!c) throw new HttpError(404, 'Customer not found');
    if (!c.phone) throw bad('Add a mobile number to this customer first');
    const pw = req.body.password; if (typeof pw !== 'string' || pw.length < 6) throw bad('Password must be at least 6 characters');
    const ex = one('SELECT * FROM users WHERE customer_id=?', c.id);
    if (ex) run("UPDATE users SET password_hash=?, status='active' WHERE id=?", bcrypt.hashSync(pw, 10), ex.id);
    else { if (one('SELECT 1 FROM users WHERE phone=?', c.phone)) throw new HttpError(409, 'That phone number already has a login'); run("INSERT INTO users(name,phone,password_hash,role,customer_id,created_at) VALUES(?,?,?, 'customer',?,?)", c.name, c.phone, bcrypt.hashSync(pw, 10), c.id, ymdhms()); }
    res.json({ ok: true, login: c.phone });
  });

  // ---------- sales / POS ----------
  const saleDetail = id => {
    const s = one('SELECT s.*, c.name customer_name, u.name cashier_name FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN users u ON u.id=s.cashier_id WHERE s.id=?', id); if (!s) return null;
    s.items = q('SELECT product_id,name,qty,price,(qty*price) line_total FROM sale_items WHERE sale_id=?', id);
    const cr = one('SELECT * FROM credits WHERE sale_id=?', id); s.credit = cr ? creditView(cr) : null;
    s.customer_balance = s.customer_id ? balanceOf(s.customer_id) : null; return s;
  };
  app.post('/api/sales', staff, (req, res) => {
    const b = req.body, type = b.payment_type;
    if (!['cash', 'ewallet', 'utang'].includes(type)) throw bad('Choose a payment type');
    if (!Array.isArray(b.items) || !b.items.length) throw bad('The cart is empty');
    if (b.items.length > 100) throw bad('Too many items in one sale');
    const lines = new Map();
    for (const it of b.items) { const pid = num(it.product_id, 'Product', { int: true, min: 1 }), qty = num(it.qty, 'Quantity', { int: true, min: 1, max: 10000 }); lines.set(pid, (lines.get(pid) || 0) + qty); }
    const id = db.transaction(() => {
      let subtotal = 0; const rows = [];
      for (const [pid, qty] of lines) {
        const p = one('SELECT * FROM products WHERE id=? AND active=1', pid);
        if (!p) throw bad('A product in the cart no longer exists');
        if (p.stock < qty) throw bad(`Not enough stock for ${p.name} (only ${p.stock} left)`);
        rows.push({ p, qty }); subtotal += p.price * qty;
      }
      subtotal = round2(subtotal);
      const discount = round2(num(b.discount ?? 0, 'Discount', { min: 0 })); if (discount > subtotal) throw bad('Discount cannot exceed the subtotal');
      const total = round2(subtotal - discount);
      let received = 0, change = 0, down = 0, cid = b.customer_id ? num(b.customer_id, 'Customer', { int: true, min: 1 }) : null;
      if (cid && !one('SELECT 1 FROM customers WHERE id=? AND active=1', cid)) throw bad('Customer not found');
      if (type === 'cash') { received = num(b.amount_received, 'Amount received', { min: 0 }); if (received < total) throw bad('Amount received is less than the total'); change = round2(received - total); }
      if (type === 'ewallet') { if (str(b.reference, 60).length < 4) throw bad('Enter the e-wallet reference number'); received = total; }
      let due = null;
      if (type === 'utang') {
        if (!cid) throw bad('Select a customer for utang');
        due = str(b.due_date, 10); if (!validDate(due)) throw bad('Choose a valid due date'); if (due < today()) throw bad('Due date cannot be in the past');
        down = round2(num(b.down_payment ?? 0, 'Down payment', { min: 0 })); if (down >= total) throw bad('Down payment must be less than the total. Use cash instead.');
        received = down;
        const cust = one('SELECT * FROM customers WHERE id=?', cid), owed = balanceOf(cid), add = round2(total - down);
        if (owed + add > cust.credit_limit + 0.001 && !(b.override === true && req.user.role === 'admin'))
          throw new HttpError(409, `This would exceed ${cust.name}'s credit limit (₱${(owed + add).toFixed(2)} / ₱${cust.credit_limit.toFixed(2)}). Owner approval required.`);
      }
      const sid = run('INSERT INTO sales(created_at,customer_id,cashier_id,subtotal,discount,total,payment_type,amount_received,change_due,reference,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)', ymdhms(), cid, req.user.id, subtotal, discount, total, type, received, change, str(b.reference, 60), 'completed').lastInsertRowid;
      run('UPDATE sales SET code=? WHERE id=?', 'TRX-' + String(sid).padStart(4, '0'), sid);
      for (const { p, qty } of rows) {
        run('INSERT INTO sale_items(sale_id,product_id,name,qty,price,cost) VALUES(?,?,?,?,?,?)', sid, p.id, p.name, qty, p.price, p.cost);
        run('UPDATE products SET stock=stock-? WHERE id=?', qty, p.id); // deducted only here, after validation, inside the checkout transaction
      }
      if (type === 'utang') run('INSERT INTO credits(sale_id,customer_id,amount,paid,borrowed_on,due_date,note) VALUES(?,?,?,?,?,?,?)', sid, cid, round2(total - down), 0, today(), due, down ? `Down payment ₱${down.toFixed(2)}` : '');
      return sid;
    })();
    res.status(201).json(saleDetail(id));
  });
  app.get('/api/sales', staff, (req, res) => {
    const w = ['1=1'], p = [], f = req.query;
    if (f.date) { w.push('date(s.created_at)=?'); p.push(f.date); }
    if (f.from) { w.push('date(s.created_at)>=?'); p.push(f.from); } if (f.to) { w.push('date(s.created_at)<=?'); p.push(f.to); }
    if (['cash', 'ewallet', 'utang'].includes(f.type)) { w.push('s.payment_type=?'); p.push(f.type); }
    if (['completed', 'voided'].includes(f.status)) { w.push('s.status=?'); p.push(f.status); }
    if (f.cashier) { w.push('s.cashier_id=?'); p.push(Number(f.cashier) || 0); }
    if (f.q) { w.push('(s.code LIKE ? OR c.name LIKE ?)'); p.push(`%${f.q}%`, `%${f.q}%`); }
    const where = w.join(' AND ');
    const base = `FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN users u ON u.id=s.cashier_id WHERE ${where}`;
    const limit = Math.min(Number(f.limit) || 25, 200), offset = Math.max(Number(f.offset) || 0, 0);
    const items = q(`SELECT s.*, c.name customer_name, u.name cashier_name, (SELECT COALESCE(SUM(qty),0) FROM sale_items WHERE sale_id=s.id) item_count ${base} ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
    const sum = one(`SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN s.status='completed' THEN s.total END),0) total, COALESCE(SUM(CASE WHEN s.status='voided' THEN 1 END),0) voided, COALESCE(SUM(CASE WHEN s.status='voided' THEN s.total END),0) voided_total,
      COALESCE(SUM(CASE WHEN s.status='completed' AND s.payment_type='cash' THEN s.total END),0) cash, COALESCE(SUM(CASE WHEN s.status='completed' AND s.payment_type='ewallet' THEN s.total END),0) ewallet, COALESCE(SUM(CASE WHEN s.status='completed' AND s.payment_type='utang' THEN s.total END),0) utang ${base}`, ...p);
    res.json({ total: sum.n, summary: sum, items });
  });
  app.get('/api/sales/:id', staff, (req, res) => { const s = saleDetail(req.params.id); if (!s) throw new HttpError(404, 'Transaction not found'); res.json(s); });
  app.post('/api/sales/:id/void', admin, (req, res) => {
    db.transaction(() => {
      const s = one('SELECT * FROM sales WHERE id=?', req.params.id); if (!s) throw new HttpError(404, 'Transaction not found');
      if (s.status === 'voided') throw bad('This transaction is already voided');
      const cr = one('SELECT * FROM credits WHERE sale_id=?', s.id);
      if (cr && cr.paid > 0) throw bad('Cannot void: payments were already recorded on this utang');
      for (const it of q('SELECT * FROM sale_items WHERE sale_id=?', s.id)) run('UPDATE products SET stock=stock+? WHERE id=?', it.qty, it.product_id);
      if (cr) run("UPDATE credits SET status='void' WHERE id=?", cr.id);
      run("UPDATE sales SET status='voided' WHERE id=?", s.id);
    })();
    res.json(saleDetail(Number(req.params.id)));
  });

  // ---------- credit management ----------
  const payRows = `SELECT p.*, c.name customer_name, COALESCE(s.code,'CR-'||cr.id) code, u.name recorded_by_name FROM payments p JOIN customers c ON c.id=p.customer_id JOIN credits cr ON cr.id=p.credit_id LEFT JOIN sales s ON s.id=cr.sale_id LEFT JOIN users u ON u.id=p.recorded_by`;
  app.get('/api/credits', staff, (req, res) => {
    const st = req.query.status || 'open';
    let rows = q(`SELECT cr.*, c.name customer_name, COALESCE(s.code,'CR-'||cr.id) code FROM credits cr JOIN customers c ON c.id=cr.customer_id LEFT JOIN sales s ON s.id=cr.sale_id WHERE (?='all' OR cr.status=?) ${req.query.customer_id ? 'AND cr.customer_id=' + (Number(req.query.customer_id) || 0) : ''} ORDER BY cr.due_date, cr.id`, st, st).map(creditView);
    const open = q("SELECT * FROM credits WHERE status='open'").map(creditView);
    const sum = { owed: round2(open.reduce((a, c) => a + c.balance, 0)), past_due: round2(open.filter(c => c.state === 'overdue').reduce((a, c) => a + c.balance, 0)), past_due_customers: new Set(open.filter(c => c.state === 'overdue').map(c => c.customer_id)).size,
      customers: new Set(open.map(c => c.customer_id)).size, due_7: round2(open.filter(c => c.days_left >= 0 && c.days_left <= 7).reduce((a, c) => a + c.balance, 0)),
      collected_month: round2(one("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE status='confirmed' AND substr(created_at,1,7)=?", today().slice(0, 7)).v), payments_month: one("SELECT COUNT(*) n FROM payments WHERE status='confirmed' AND substr(created_at,1,7)=?", today().slice(0, 7)).n };
    res.json({ summary: sum, items: rows });
  });
  app.put('/api/credits/:id', admin, (req, res) => {
    const c = one('SELECT * FROM credits WHERE id=?', req.params.id); if (!c) throw new HttpError(404, 'Credit not found'); if (c.status !== 'open') throw bad('Only open credits can be changed');
    let due = c.due_date, fu = c.follow_up; if (req.body.due_date !== undefined) { due = str(req.body.due_date, 10); if (!validDate(due)) throw bad('Choose a valid due date'); }
    if (req.body.follow_up !== undefined) fu = req.body.follow_up ? 1 : 0;
    run('UPDATE credits SET due_date=?, follow_up=? WHERE id=?', due, fu, c.id); res.json(creditView(one('SELECT * FROM credits WHERE id=?', c.id)));
  });
  app.post('/api/payments', staff, (req, res) => {
    const cid = num(req.body.customer_id, 'Customer', { int: true, min: 1 }); const method = ['cash', 'ewallet'].includes(req.body.method) ? req.body.method : null; if (!method) throw bad('Choose a payment method');
    const amount = round2(num(req.body.amount, 'Amount', { min: 0.01, max: 1e6 })); const nd = req.body.new_due_date ? str(req.body.new_due_date, 10) : null; if (nd && !validDate(nd)) throw bad('New due date is invalid');
    const out = db.transaction(() => {
      if (!one('SELECT 1 FROM customers WHERE id=?', cid)) throw new HttpError(404, 'Customer not found');
      const credits = req.body.credit_id ? q("SELECT * FROM credits WHERE id=? AND customer_id=? AND status='open'", Number(req.body.credit_id) || 0, cid) : q("SELECT * FROM credits WHERE customer_id=? AND status='open' ORDER BY due_date, id", cid);
      if (!credits.length) throw bad('This customer has no open utang');
      const owed = round2(credits.reduce((a, c) => a + c.amount - c.paid, 0)); if (amount > owed + 0.001) throw bad(`Amount exceeds the balance owed (₱${owed.toFixed(2)})`);
      let left = amount; const applied = [];
      for (const c of credits) {
        if (left <= 0.0001) break; const rem = round2(c.amount - c.paid), pay = round2(Math.min(rem, left)); left = round2(left - pay);
        const np = round2(c.paid + pay), done = np >= c.amount - 0.001;
        run('UPDATE credits SET paid=?, status=?, due_date=? WHERE id=?', np, done ? 'paid' : 'open', !done && nd ? nd : c.due_date, c.id);
        run("INSERT INTO payments(credit_id,customer_id,amount,method,reference,created_at,recorded_by,status) VALUES(?,?,?,?,?,?,?,'confirmed')", c.id, cid, pay, method, str(req.body.reference, 60), ymdhms(), req.user.id);
        applied.push({ credit_id: c.id, amount: pay });
      }
      return applied;
    })();
    res.status(201).json({ applied: out, balance: balanceOf(cid) });
  });
  app.get('/api/payments', staff, (req, res) => {
    const st = req.query.status; res.json(q(`${payRows} WHERE (?='' OR p.status=?) ORDER BY p.created_at DESC, p.id DESC LIMIT 100`, st || '', st || ''));
  });
  function decidePayment(req, ok) {
    const p = one('SELECT * FROM payments WHERE id=?', req.params.id); if (!p) throw new HttpError(404, 'Payment not found'); if (p.status !== 'pending') throw bad('This payment was already handled');
    if (p.provider === 'paymongo') throw bad('PayMongo payments are confirmed automatically after the gateway verifies them');
    db.transaction(() => {
      if (ok) {
        const c = one('SELECT * FROM credits WHERE id=?', p.credit_id), rem = round2(c.amount - c.paid);
        if (c.status !== 'open' || p.amount > rem + 0.001) throw bad(`Payment exceeds the remaining balance (₱${rem.toFixed(2)}). Reject it instead.`);
        const np = round2(c.paid + p.amount); run('UPDATE credits SET paid=?, status=? WHERE id=?', np, np >= c.amount - 0.001 ? 'paid' : 'open', c.id);
      }
      run('UPDATE payments SET status=?, recorded_by=? WHERE id=?', ok ? 'confirmed' : 'rejected', req.user.id, p.id);
    })();
    return one('SELECT * FROM payments WHERE id=?', p.id);
  }
  app.post('/api/payments/:id/confirm', staff, (req, res) => res.json(decidePayment(req, true)));
  app.post('/api/payments/:id/reject', staff, (req, res) => res.json(decidePayment(req, false)));
  app.get('/api/credit-requests', staff, (req, res) => {
    const st = req.query.status || '';
    res.json(q('SELECT r.*, c.name customer_name, c.credit_limit FROM credit_requests r JOIN customers c ON c.id=r.customer_id WHERE (?=\'\' OR r.status=?) ORDER BY (r.status=\'pending\') DESC, r.created_at DESC LIMIT 100', st, st)
      .map(r => ({ ...r, available: round2(Math.max(0, r.credit_limit - balanceOf(r.customer_id))) })));
  });
  app.post('/api/credit-requests/:id/approve', admin, (req, res) => {
    const out = db.transaction(() => {
      const r = one('SELECT r.*, c.credit_limit FROM credit_requests r JOIN customers c ON c.id=r.customer_id WHERE r.id=?', req.params.id); if (!r) throw new HttpError(404, 'Request not found'); if (r.status !== 'pending') throw bad('This request was already handled');
      const due = str(req.body.due_date, 10) || r.preferred_due; if (!validDate(due) || due < today()) throw bad('Choose a valid due date that is not in the past');
      const amt = round2(num(req.body.amount ?? r.amount, 'Amount', { min: 0.01, max: 1e6 }));
      if (balanceOf(r.customer_id) + amt > r.credit_limit + 0.001 && req.body.override !== true) throw new HttpError(409, 'This exceeds the customer\'s credit limit. Confirm the override to approve anyway.');
      const cid = run('INSERT INTO credits(sale_id,customer_id,amount,paid,borrowed_on,due_date,note) VALUES(NULL,?,?,0,?,?,?)', r.customer_id, amt, today(), due, 'Approved request: ' + r.items.slice(0, 120)).lastInsertRowid;
      run("UPDATE credit_requests SET status='approved', decided_at=?, credit_id=?, owner_note=? WHERE id=?", ymdhms(), cid, str(req.body.note, 150) || `Due date: ${due}`, r.id);
      return r.id;
    })();
    res.json(one('SELECT * FROM credit_requests WHERE id=?', out));
  });
  app.post('/api/credit-requests/:id/decline', admin, (req, res) => {
    const r = one('SELECT * FROM credit_requests WHERE id=?', req.params.id); if (!r) throw new HttpError(404, 'Request not found'); if (r.status !== 'pending') throw bad('This request was already handled');
    run("UPDATE credit_requests SET status='declined', decided_at=?, owner_note=? WHERE id=?", ymdhms(), str(req.body.note, 150) || 'Declined by the store', r.id); res.json(one('SELECT * FROM credit_requests WHERE id=?', r.id));
  });
  app.get('/api/alerts', staff, (req, res) => {
    const all = q('SELECT * FROM products WHERE active=1').map(decorate), open = q("SELECT * FROM credits WHERE status='open'").map(creditView);
    res.json({ low: all.filter(p => p.status === 'low').length, out: all.filter(p => p.status === 'out').length, near_expiry: all.filter(p => p.near_expiry).length, overdue: new Set(open.filter(c => c.state === 'overdue').map(c => c.customer_id)).size,
      pending_requests: one("SELECT COUNT(*) n FROM credit_requests WHERE status='pending'").n, pending_payments: one("SELECT COUNT(*) n FROM payments WHERE status='pending'").n });
  });

  // ---------- analytics ----------
  const revenue = (a, b) => one("SELECT COALESCE(SUM(total),0) v, COUNT(*) n FROM sales WHERE status='completed' AND date(created_at) BETWEEN ? AND ?", a, b);
  const cogs = (a, b) => one("SELECT COALESCE(SUM(si.qty*si.cost),0) v FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.status='completed' AND date(s.created_at) BETWEEN ? AND ?", a, b).v;
  const bestSellers = (a, b) => q(`SELECT p.id, p.name, p.category, COALESCE(SUM(si.qty),0) qty, COALESCE(SUM(si.qty*(si.price-si.cost)),0) profit FROM products p
    LEFT JOIN (SELECT si.* FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.status='completed' AND date(s.created_at) BETWEEN ? AND ?) si ON si.product_id=p.id WHERE p.active=1 GROUP BY p.id`, a, b);
  const topDebtors = n => q(`SELECT c.id, c.name, SUM(cr.amount-cr.paid) balance, MIN(cr.due_date) due FROM credits cr JOIN customers c ON c.id=cr.customer_id WHERE cr.status='open' GROUP BY c.id HAVING balance>0.001 ORDER BY balance DESC LIMIT ?`, n).map(d => ({ ...d, balance: round2(d.balance), days_left: dayDiff(d.due, today()) }));
  app.get('/api/dashboard', admin, (req, res) => {
    const now = new Date(), t = ymd(now), ws = weekStart(now), wsS = ymd(ws), pws = ymd(addDays(ws, -7)), ms = t.slice(0, 8) + '01';
    const prevM = new Date(now.getFullYear(), now.getMonth() - 1, 1), pmS = ymd(prevM), pmE = ymd(new Date(prevM.getFullYear(), prevM.getMonth(), Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate())));
    const day = revenue(t, t), yday = revenue(ymd(addDays(now, -7)), ymd(addDays(now, -7))), wk = revenue(wsS, ymd(addDays(ws, 6))), pwk = revenue(pws, ymd(addDays(parseYmd(pws), (now.getDay() + 6) % 7))), mo = revenue(ms, t), pmo = revenue(pmS, pmE);
    const wkCost = cogs(wsS, ymd(addDays(ws, 6))), cur = [], prev = [];
    for (let i = 0; i < 7; i++) { const d = addDays(ws, i), pd = addDays(ws, i - 7); cur.push(ymd(d) <= t ? round2(revenue(ymd(d), ymd(d)).v) : 0); prev.push(round2(revenue(ymd(pd), ymd(pd)).v)); }
    const mix = q("SELECT payment_type t, COALESCE(SUM(total),0) v FROM sales WHERE status='completed' AND date(created_at)>=? GROUP BY payment_type", ms);
    const bs = bestSellers(wsS, t).sort((a, b) => b.qty - a.qty).filter(x => x.qty > 0).slice(0, 5);
    const prods = q('SELECT * FROM products WHERE active=1').map(decorate);
    const coll = one("SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM payments WHERE status='confirmed' AND substr(created_at,1,10)=?", t);
    const open = q("SELECT * FROM credits WHERE status='open'").map(creditView);
    const bestDay = cur.reduce((bi, v, i) => (v > cur[bi] ? i : bi), 0), DN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const insights = []; const od = open.filter(c => c.state === 'overdue'); const odTot = round2(od.reduce((a, c) => a + c.balance, 0));
    const lowNames = prods.filter(p => p.status !== 'in').slice(0, 3).map(p => p.name);
    const diff = pwk.v ? ((wk.v - pwk.v) / pwk.v) * 100 : null;
    const sentence = [];
    if (wk.v > 0) sentence.push(`Your best day this week was ${DN[bestDay]} (₱${cur[bestDay].toLocaleString('en-PH')})${diff !== null ? ` and sales are ${diff >= 0 ? 'up' : 'down'} ${Math.abs(diff).toFixed(1)}% from last week` : ''}.`);
    if (lowNames.length) sentence.push(`${lowNames.join(', ')} ${lowNames.length > 1 ? 'are' : 'is'} low or out of stock — restock soon.`);
    if (od.length) sentence.push(`${new Set(od.map(c => c.customer_id)).size} customer(s) are overdue with ₱${odTot.toLocaleString('en-PH')} unpaid utang.`);
    insights.push(sentence.join(' ') || 'Record your first sales to see insights here.');
    res.json({ date: t, insight: insights[0],
      kpi: { today: round2(day.v), today_n: day.n, today_vs_last_week: yday.v ? round2((day.v - yday.v) / yday.v * 100) : null, week: round2(wk.v), week_n: wk.n, week_vs_prev: pwk.v ? round2((wk.v - pwk.v) / pwk.v * 100) : null,
        month: round2(mo.v), month_vs_prev: pmo.v ? round2((mo.v - pmo.v) / pmo.v * 100) : null, profit_week: round2(wk.v - wkCost), margin_week: wk.v ? round2((wk.v - wkCost) / wk.v * 100) : 0,
        collections_today: round2(coll.v), collections_n: coll.n, outstanding: round2(open.reduce((a, c) => a + c.balance, 0)), overdue: odTot, overdue_customers: new Set(od.map(c => c.customer_id)).size },
      chart: { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], current: cur, previous: prev,
        weekly: [3, 2, 1, 0].map(i => { const s = addDays(ws, -7 * i); return { label: ymd(s).slice(5), v: round2(revenue(ymd(s), ymd(addDays(s, 6))).v) }; }),
        monthly: [2, 1, 0].map(i => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); return { label: d.toLocaleString('en', { month: 'short' }), v: round2(revenue(ymd(d), ymd(e)).v) }; }) },
      payment_mix: ['cash', 'ewallet', 'utang'].map(k => ({ type: k, value: round2((mix.find(m => m.t === k) || { v: 0 }).v) })),
      top_sellers: bs, low_stock: prods.filter(p => p.status !== 'in' || p.near_expiry).sort((a, b) => a.stock - b.stock).slice(0, 8).map(p => ({ id: p.id, name: p.name, stock: p.stock, status: p.status, near_expiry: p.near_expiry, expiry_date: p.expiry_date })),
      debtors: topDebtors(5), recent: q("SELECT s.id, s.code, s.created_at, s.total, s.payment_type, s.status FROM sales s ORDER BY s.created_at DESC, s.id DESC LIMIT 6") });
  });
  app.get('/api/insights', admin, (req, res) => {
    const now = new Date(), t = ymd(now), a7 = ymd(addDays(now, -6));
    const items = bestSellers(a7, t), byCat = {};
    items.forEach(i => { byCat[i.category] = (byCat[i.category] || 0) + i.profit; });
    const profit_category = Object.entries(byCat).map(([name, v]) => ({ name, profit: round2(v) })).sort((a, b) => b.profit - a.profit);
    const profit_item = [...items].sort((a, b) => b.profit - a.profit).slice(0, 6).map(i => ({ ...i, profit: round2(i.profit) }));
    const best = [...items].sort((a, b) => b.qty - a.qty).slice(0, 5), slow = [...items].sort((a, b) => a.qty - b.qty).slice(0, 5);
    const hm = q(`SELECT ((CAST(strftime('%w',created_at) AS INT)+6)%7) d, MIN(MAX((CAST(strftime('%H',created_at) AS INT)-6)/2,0),7) h, COUNT(*) n FROM sales WHERE status='completed' AND date(created_at)>=? GROUP BY d,h`, ymd(addDays(now, -55)));
    const grid = Array.from({ length: 7 }, () => Array(8).fill(0)); hm.forEach(r => { grid[r.d][r.h] = r.n; });
    const dayTot = grid.map(r => r.reduce((a, b) => a + b, 0)), hourTot = grid[0].map((_, h) => grid.reduce((a, r) => a + r[h], 0));
    const trend = []; for (let i = 7; i >= 0; i--) { const e = addDays(now, -7 * i), s = addDays(e, -6); trend.push(round2(revenue(ymd(s), ymd(e)).v)); }
    const n = trend.length, xs = trend.map((_, i) => i), mx = xs.reduce((a, b) => a + b) / n, my = trend.reduce((a, b) => a + b) / n;
    const slope = xs.reduce((a, x, i) => a + (x - mx) * (trend[i] - my), 0) / (xs.reduce((a, x) => a + (x - mx) ** 2, 0) || 1);
    const forecast = Math.max(0, Math.round(my + slope * (n - mx))), last = trend[n - 1];
    const DN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], HL = ['6–8 AM', '8–10 AM', '10 AM–12 PM', '12–2 PM', '2–4 PM', '4–6 PM', '6–8 PM', '8 PM+'];
    const bd = dayTot.indexOf(Math.max(...dayTot)), bh = hourTot.indexOf(Math.max(...hourTot));
    const prods = q('SELECT * FROM products WHERE active=1').map(decorate), tips = [];
    if (best[0] && best[0].qty > 0) tips.push({ kind: 'best', title: 'Best seller', text: `${best[0].name} sold ${best[0].qty} pcs in the last 7 days — your #1 item.` });
    if (Math.max(...dayTot) > 0) tips.push({ kind: 'peak', title: 'Peak time', text: `Most sales happen ${HL[bh]}, busiest on ${DN[bd]}. Keep shelves full before then.` });
    const sl = slow.find(s => { const p = prods.find(x => x.id === s.id); return p && p.near_expiry; }) || slow[0];
    if (sl) tips.push({ kind: 'slow', title: 'Slow mover', text: `${sl.name} sold only ${sl.qty} pcs this week${prods.find(x => x.id === sl.id).near_expiry ? ' and expires soon. Consider a promo bundle' : '. Avoid over-ordering it'}.` });
    const lm = prods.filter(p => p.price > 0 && (items.find(i => i.id === p.id) || { qty: 0 }).qty >= 10).sort((a, b) => (a.price - a.cost) / a.price - (b.price - b.cost) / b.price)[0];
    if (lm) tips.push({ kind: 'price', title: 'Pricing tip', text: `${lm.name} has the thinnest margin (${((lm.price - lm.cost) / lm.price * 100).toFixed(1)}%). A ₱1 increase adds about ₱${(items.find(i => i.id === lm.id).qty).toLocaleString('en-PH')} profit per week.` });
    res.json({ tips, profit_category, profit_item, best, slow, heatmap: { grid, hours: ['6a', '8a', '10a', '12p', '2p', '4p', '6p', '8p'], days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
      trend: { actual: trend, labels: trend.map((_, i) => `Wk ${i + 1}`), forecast, change_pct: last ? round2((forecast - last) / last * 100) : null } });
  });

  // ---------- reports ----------
  const sendCsv = (res, name, rows, cols) => { res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}-${today()}.csv"` }).send('\uFEFF' + csv(rows, cols)); };
  app.get('/api/reports/sales', admin, (req, res) => {
    const group = ['day', 'week', 'month'].includes(req.query.group) ? req.query.group : 'day';
    const to = validDate(req.query.to) ? req.query.to : today(), from = validDate(req.query.from) ? req.query.from : ymd(addDays(parseYmd(to), -6));
    if (from > to) throw bad('"From" date must be before "To" date');
    const key = { day: "date(created_at)", week: "date(created_at,'weekday 0','-6 days')", month: "strftime('%Y-%m',created_at)" }[group];
    const rows = q(`SELECT ${key} period, COUNT(*) transactions, SUM(total) revenue, SUM(cost) cost FROM (SELECT s.created_at, s.total, (SELECT COALESCE(SUM(qty*cost),0) FROM sale_items WHERE sale_id=s.id) cost FROM sales s WHERE s.status='completed' AND date(s.created_at) BETWEEN ? AND ?) GROUP BY period ORDER BY period`, from, to)
      .map(r => ({ ...r, revenue: round2(r.revenue), cost: round2(r.cost), profit: round2(r.revenue - r.cost), margin: r.revenue ? round2((r.revenue - r.cost) / r.revenue * 100) : 0 }));
    const tot = rows.reduce((a, r) => ({ transactions: a.transactions + r.transactions, revenue: a.revenue + r.revenue, cost: a.cost + r.cost }), { transactions: 0, revenue: 0, cost: 0 });
    const totals = { transactions: tot.transactions, revenue: round2(tot.revenue), cost: round2(tot.cost), profit: round2(tot.revenue - tot.cost), margin: tot.revenue ? round2((tot.revenue - tot.cost) / tot.revenue * 100) : 0, avg: tot.transactions ? round2(tot.revenue / tot.transactions) : 0 };
    if (req.query.format === 'csv') return sendCsv(res, 'sales-report', rows, [{ key: 'period', label: 'Period' }, { key: 'transactions', label: 'Transactions' }, { key: 'revenue', label: 'Revenue' }, { key: 'cost', label: 'Cost' }, { key: 'profit', label: 'Profit' }, { key: 'margin', label: 'Margin %' }]);
    res.json({ from, to, group, rows, totals });
  });
  app.get('/api/reports/inventory', admin, (req, res) => {
    const prods = q('SELECT * FROM products WHERE active=1 ORDER BY name').map(decorate);
    const restocks = q('SELECT r.*, p.name FROM restocks r JOIN products p ON p.id=r.product_id ORDER BY r.date DESC, r.id DESC LIMIT 10');
    if (req.query.format === 'csv') return sendCsv(res, 'inventory-report', prods, [{ key: 'name', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'barcode', label: 'Barcode' }, { key: 'category', label: 'Category' }, { key: 'cost', label: 'Cost' }, { key: 'price', label: 'Price' }, { key: 'stock', label: 'Stock' }, { key: 'reorder_level', label: 'Reorder level' }, { key: 'expiry_date', label: 'Expiry' }, { key: 'status', label: 'Status' }]);
    res.json({ value_cost: round2(prods.reduce((a, p) => a + p.stock * p.cost, 0)), value_retail: round2(prods.reduce((a, p) => a + p.stock * p.price, 0)), low: prods.filter(p => p.status !== 'in').length, out: prods.filter(p => p.status === 'out').length,
      attention: prods.filter(p => p.status !== 'in' || p.near_expiry).sort((a, b) => a.stock - b.stock), restocks });
  });
  app.get('/api/reports/credit', admin, (req, res) => {
    const open = q("SELECT cr.*, c.name customer_name FROM credits cr JOIN customers c ON c.id=cr.customer_id WHERE cr.status='open'").map(creditView);
    const sum = f => round2(open.filter(f).reduce((a, c) => a + c.balance, 0));
    const aging = [{ label: 'Current (not yet due)', v: sum(c => c.days_left >= 0) }, { label: '1–7 days overdue', v: sum(c => c.days_left < 0 && c.days_left >= -7) }, { label: '8–14 days overdue', v: sum(c => c.days_left < -7 && c.days_left >= -14) }, { label: '15+ days overdue', v: sum(c => c.days_left < -14) }];
    const debtors = topDebtors(10);
    if (req.query.format === 'csv') return sendCsv(res, 'credit-report', open.map(c => ({ customer: c.customer_name, amount: c.amount, paid: c.paid, balance: c.balance, borrowed_on: c.borrowed_on, due_date: c.due_date, state: c.state })), [{ key: 'customer', label: 'Customer' }, { key: 'amount', label: 'Amount' }, { key: 'paid', label: 'Paid' }, { key: 'balance', label: 'Balance' }, { key: 'borrowed_on', label: 'Borrowed' }, { key: 'due_date', label: 'Due' }, { key: 'state', label: 'Status' }]);
    res.json({ outstanding: sum(() => true), overdue: sum(c => c.state === 'overdue'), collected_month: round2(one("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE status='confirmed' AND substr(created_at,1,7)=?", today().slice(0, 7)).v), aging, debtors });
  });

  // ---------- expenses ----------
  app.get('/api/expenses', admin, (req, res) => {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : today().slice(0, 7), cat = req.query.category || '';
    const rows = q("SELECT * FROM expenses WHERE substr(date,1,7)=? AND (?='' OR category=?) ORDER BY date DESC, id DESC", month, cat, cat);
    const by = q('SELECT category, SUM(amount) v FROM expenses WHERE substr(date,1,7)=? GROUP BY category ORDER BY v DESC', month);
    const total = round2(by.reduce((a, b) => a + b.v, 0)), s = month + '-01', e = month + '-31', rev = revenue(s, e).v, gp = round2(rev - cogs(s, e));
    res.json({ month, items: rows, categories: CATS_EXP, by_category: by.map(b => ({ category: b.category, value: round2(b.v) })), total, gross_profit: gp, net_profit: round2(gp - total) });
  });
  app.post('/api/expenses', admin, (req, res) => {
    const date = str(req.body.date, 10) || today(); if (!validDate(date)) throw bad('Date is invalid');
    const category = CATS_EXP.includes(req.body.category) ? req.body.category : null; if (!category) throw bad('Choose a category');
    const amount = round2(num(req.body.amount, 'Amount', { min: 0.01, max: 1e7 }));
    const id = run('INSERT INTO expenses(date,category,description,paid_to,amount) VALUES(?,?,?,?,?)', date, category, str(req.body.description, 150), str(req.body.paid_to, 80), amount).lastInsertRowid;
    res.status(201).json(one('SELECT * FROM expenses WHERE id=?', id));
  });
  app.delete('/api/expenses/:id', admin, (req, res) => { if (!run('DELETE FROM expenses WHERE id=?', req.params.id).changes) throw new HttpError(404, 'Expense not found'); res.json({ ok: true }); });

  // ---------- users ----------
  app.get('/api/users', admin, (req, res) => res.json({ users: q("SELECT id,name,email,role,status,last_login FROM users WHERE role IN ('admin','cashier') ORDER BY role, name"),
    customers: one("SELECT COUNT(*) n FROM users WHERE role='customer'").n, log: q('SELECT l.*, u.name FROM login_log l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC, l.id DESC LIMIT 20') }));
  const staffBody = (b, id) => {
    const name = str(b.name, 80), email = str(b.email, 80).toLowerCase(); if (name.length < 2) throw bad('Name is required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Enter a valid email'); if (!['admin', 'cashier'].includes(b.role)) throw bad('Choose a role'); if (!['active', 'inactive'].includes(b.status || 'active')) throw bad('Invalid status');
    if (one('SELECT 1 FROM users WHERE email=? AND id<>?', email, id || 0)) throw new HttpError(409, 'That email is already used');
    return { name, email, role: b.role, status: b.status || 'active' };
  };
  app.post('/api/users', admin, (req, res) => {
    const u = staffBody(req.body); if (typeof req.body.password !== 'string' || req.body.password.length < 6) throw bad('Password must be at least 6 characters');
    const id = run('INSERT INTO users(name,email,password_hash,role,status,created_at) VALUES(?,?,?,?,?,?)', u.name, u.email, bcrypt.hashSync(req.body.password, 10), u.role, u.status, ymdhms()).lastInsertRowid;
    res.status(201).json(one('SELECT id,name,email,role,status FROM users WHERE id=?', id));
  });
  app.put('/api/users/:id', admin, (req, res) => {
    const cur = one("SELECT * FROM users WHERE id=? AND role IN ('admin','cashier')", req.params.id); if (!cur) throw new HttpError(404, 'User not found');
    const u = staffBody({ ...cur, ...req.body }, cur.id);
    if (cur.id === req.user.id && (u.status !== 'active' || u.role !== 'admin')) throw bad('You cannot deactivate or demote your own account');
    if (cur.role === 'admin' && cur.status === 'active' && (u.role !== 'admin' || u.status !== 'active') && one("SELECT COUNT(*) n FROM users WHERE role='admin' AND status='active'").n <= 1) throw bad('At least one active admin is required');
    let hash = cur.password_hash; if (req.body.password) { if (typeof req.body.password !== 'string' || req.body.password.length < 6) throw bad('Password must be at least 6 characters'); hash = bcrypt.hashSync(req.body.password, 10); }
    run('UPDATE users SET name=?,email=?,role=?,status=?,password_hash=? WHERE id=?', u.name, u.email, u.role, u.status, hash, cur.id);
    res.json(one('SELECT id,name,email,role,status FROM users WHERE id=?', cur.id));
  });

  // ---------- customer portal ----------
  const me = req => one('SELECT * FROM customers WHERE id=?', req.user.customer_id);
  app.get('/api/portal/summary', customer, (req, res) => {
    const c = me(req), credits = q("SELECT cr.*, COALESCE(s.code,'CR-'||cr.id) code FROM credits cr LEFT JOIN sales s ON s.id=cr.sale_id WHERE cr.customer_id=? AND cr.status<>'void' ORDER BY cr.borrowed_on DESC, cr.id DESC", c.id).map(creditView);
    const open = credits.filter(x => x.status === 'open'), owed = round2(open.reduce((a, x) => a + x.balance, 0)), pend = q("SELECT credit_id, SUM(amount) v FROM payments WHERE customer_id=? AND status='pending' GROUP BY credit_id", c.id);
    const notes = [];
    open.filter(x => x.state === 'overdue').forEach(x => notes.push({ icon: '⚠', title: 'Payment overdue', text: `${x.code} · ₱${x.balance.toFixed(2)} was due ${x.due_date}`, kind: 'overdue' }));
    open.filter(x => x.state === 'due_soon').forEach(x => notes.push({ icon: '⏰', title: 'Payment due soon', text: `${x.code} · ₱${x.balance.toFixed(2)} due ${x.due_date}`, kind: 'due' }));
    q("SELECT * FROM credit_requests WHERE customer_id=? AND status<>'pending' AND date(decided_at)>=? ORDER BY decided_at DESC", c.id, ymd(addDays(new Date(), -14))).forEach(r => notes.push({ icon: r.status === 'approved' ? '✅' : '✖', title: `Credit request ${r.status}`, text: `Your request for ₱${r.amount.toFixed(2)} was ${r.status}. ${r.owner_note || ''}`.trim(), kind: r.status }));
    q("SELECT p.*, COALESCE(s.code,'CR-'||p.credit_id) code FROM payments p JOIN credits cr ON cr.id=p.credit_id LEFT JOIN sales s ON s.id=cr.sale_id WHERE p.customer_id=? AND p.status='pending'", c.id).forEach(p => notes.push({ icon: '⏳', title: 'Payment awaiting confirmation', text: `₱${p.amount.toFixed(2)} for ${p.code} will be verified by the store`, kind: 'pending' }));
    const next = open.slice().sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    res.json({ customer: { id: c.id, name: c.name, phone: c.phone }, credit_limit: c.credit_limit, outstanding: owed, available: round2(Math.max(0, c.credit_limit - owed)), next_due: next ? next.due_date : null, next_due_days: next ? next.days_left : null,
      status: open.some(x => x.state === 'overdue') ? 'overdue' : owed > 0 ? 'pending' : 'good', open, pending: pend, notifications: notes,
      recent: q('SELECT id,code,created_at,total,payment_type FROM sales WHERE customer_id=? AND status=\'completed\' ORDER BY created_at DESC, id DESC LIMIT 5', c.id) });
  });
  app.get('/api/portal/products', customer, (req, res) => {
    const s = `%${str(req.query.q || '', 50)}%`, cat = req.query.category || '';
    res.json(q("SELECT id,name,category,price,stock,reorder_level FROM products WHERE active=1 AND name LIKE ? AND (?='' OR category=?) ORDER BY name", s, cat, cat).map(p => ({ id: p.id, name: p.name, category: p.category, price: p.price, availability: p.stock === 0 ? 'out' : p.stock <= p.reorder_level ? 'low' : 'in' })));
  });
  app.get('/api/portal/credit', customer, (req, res) => {
    const c = me(req); res.json(q("SELECT cr.*, COALESCE(s.code,'CR-'||cr.id) code, (SELECT COALESCE(SUM(amount),0) FROM payments WHERE credit_id=cr.id AND status='pending') pending FROM credits cr LEFT JOIN sales s ON s.id=cr.sale_id WHERE cr.customer_id=? AND cr.status<>'void' ORDER BY cr.status='open' DESC, cr.due_date DESC", c.id).map(creditView));
  });
  app.get('/api/portal/requests', customer, (req, res) => res.json(q('SELECT * FROM credit_requests WHERE customer_id=? ORDER BY created_at DESC, id DESC', req.user.customer_id)));
  app.post('/api/portal/requests', customer, (req, res) => {
    const c = me(req), items = str(req.body.items, 300), amount = round2(num(req.body.amount, 'Estimated total', { min: 1, max: 1e5 })), due = str(req.body.preferred_due, 10);
    if (items.length < 3) throw bad('Tell the store what you want to buy'); if (!validDate(due) || due < today()) throw bad('Choose a due date that is not in the past');
    if (one("SELECT 1 FROM credit_requests WHERE customer_id=? AND status='pending' AND items=? AND amount=?", c.id, items, amount)) throw new HttpError(409, 'You already sent this request');
    const avail = c.credit_limit - balanceOf(c.id);
    if (c.credit_limit <= 0) throw bad('Your store credit limit is not set yet. Please ask the store owner.');
    if (amount > avail + 0.001) throw bad(`This is more than your available credit (₱${Math.max(0, avail).toFixed(2)})`);
    const id = run('INSERT INTO credit_requests(customer_id,items,amount,preferred_due,note,created_at) VALUES(?,?,?,?,?,?)', c.id, items, amount, due, str(req.body.note, 200), ymdhms()).lastInsertRowid;
    res.status(201).json(one('SELECT * FROM credit_requests WHERE id=?', id));
  });
  app.get('/api/portal/purchases', customer, (req, res) => {
    const from = validDate(req.query.from) ? req.query.from : '0000-01-01';
    res.json(q("SELECT s.id,s.code,s.created_at,s.total,s.payment_type,(SELECT COALESCE(SUM(qty),0) FROM sale_items WHERE sale_id=s.id) item_count FROM sales s WHERE s.customer_id=? AND s.status='completed' AND date(s.created_at)>=? AND (?='' OR s.payment_type=?) ORDER BY s.created_at DESC, s.id DESC LIMIT 100", req.user.customer_id, from, req.query.type || '', req.query.type || ''));
  });
  app.get('/api/portal/purchases/:id', customer, (req, res) => {
    const s = saleDetail(req.params.id); if (!s || s.customer_id !== req.user.customer_id) throw new HttpError(404, 'Transaction not found'); res.json(s);
  });
  app.get('/api/portal/payments', customer, (req, res) => {
    const c = me(req), rows = q(`${payRows} WHERE p.customer_id=? ORDER BY p.created_at DESC, p.id DESC LIMIT 100`, c.id);
    res.json({ total_paid: round2(rows.filter(r => r.status === 'confirmed').reduce((a, r) => a + r.amount, 0)), items: rows });
  });
  app.post('/api/portal/pay', customer, async (req, res) => {
    const c = me(req), method = req.body.method; if (!['cash', 'ewallet'].includes(method)) throw bad('Choose a payment method');
    const cr = one("SELECT * FROM credits WHERE id=? AND customer_id=? AND status='open'", Number(req.body.credit_id) || 0, c.id); if (!cr) throw bad('Choose which utang you want to pay');
    const pend = one("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE credit_id=? AND status='pending'", cr.id).v, rem = round2(cr.amount - cr.paid - pend);
    const amount = round2(num(req.body.amount, 'Amount', { min: 0.01 })); if (amount > rem + 0.001) throw bad(`Amount is more than what you still owe (₱${Math.max(0, rem).toFixed(2)})`);
    if (method === 'cash') return res.json({ ok: true, message: 'Please pay this amount in cash at the store counter. The cashier will record it.' });
    if (paymongoConfigured) {
      const gatewayMethod = req.body.gateway_method;
      if (!['gcash', 'qrph'].includes(gatewayMethod)) throw bad('Choose GCash app or QR Ph');
      if (!publicUrl) throw new HttpError(503, 'Set PUBLIC_URL before enabling online payments');
      const id = db.transaction(() => {
        const remainingPending = one("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE credit_id=? AND status='pending'", cr.id).v;
        const currentCredit = one("SELECT * FROM credits WHERE id=? AND customer_id=? AND status='open'", cr.id, c.id);
        const currentRemaining = currentCredit ? round2(currentCredit.amount - currentCredit.paid - remainingPending) : 0;
        if (!currentCredit || amount > currentRemaining + 0.001) throw bad(`Amount is more than what you still owe (₱${Math.max(0, currentRemaining).toFixed(2)})`);
        return run("INSERT INTO payments(credit_id,customer_id,amount,method,reference,created_at,status,provider,paymongo_method_type) VALUES(?,?,?,?,?,?,'pending','paymongo',?)",
          cr.id, c.id, amount, 'ewallet', 'PayMongo checkout', ymdhms(), gatewayMethod).lastInsertRowid;
      })();
      const referenceNumber = `KK-PAY-${id}`;
      const rootUrl = publicUrl.replace(/\/+$/, '');
      let checkout;
      try {
        const response = await fetcher('https://api.paymongo.com/v2/checkout_sessions', {
          method: 'POST',
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Basic ${Buffer.from(`${paymongoSecretKey}:`).toString('base64')}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': referenceNumber,
          },
          body: JSON.stringify({ data: { attributes: {
            line_items: [{ name: `Kita Kita credit payment ${cr.id}`, amount: Math.round(amount * 100), currency: 'PHP', quantity: 1 }],
            payment_method_types: [gatewayMethod],
            success_url: `${rootUrl}/#/payment?credit_id=${cr.id}&payment=returned`,
            cancel_url: `${rootUrl}/#/payment?credit_id=${cr.id}&payment=cancelled`,
            reference_number: referenceNumber,
            metadata: { payment_id: String(id), customer_id: String(c.id), credit_id: String(cr.id) },
          } } }),
        });
        const result = await response.json();
        const checkoutUrl = result.data?.attributes?.checkout_url;
        if (!response.ok || !result.data?.id || typeof checkoutUrl !== 'string' || new URL(checkoutUrl).origin !== 'https://checkout.paymongo.com') {
          const error = new Error('PayMongo rejected the checkout request');
          error.status = response.status;
          throw error;
        }
        checkout = { id: result.data.id, url: checkoutUrl };
        run('UPDATE payments SET paymongo_checkout_session_id=?, paymongo_checkout_url=? WHERE id=? AND status=\'pending\'', checkout.id, checkout.url, id);
      } catch (error) {
        run("DELETE FROM payments WHERE id=? AND status='pending' AND paymongo_checkout_session_id IS NULL", id);
        console.error('PayMongo checkout request failed:', error.status || error.message);
        throw new HttpError(502, 'Unable to start GCash checkout right now. Please try again.');
      }
      return res.status(201).json({ ok: true, message: 'Continue to PayMongo to pay with GCash.', checkout_url: checkout.url, payment: one('SELECT * FROM payments WHERE id=?', id) });
    }
    const ref = str(req.body.reference, 60); if (ref.length < 4) throw bad('Enter your e-wallet reference number');
    const id = run("INSERT INTO payments(credit_id,customer_id,amount,method,reference,created_at,status) VALUES(?,?,?,?,?,?,'pending')", cr.id, c.id, amount, 'ewallet', ref, ymdhms()).lastInsertRowid;
    res.status(201).json({ ok: true, message: 'Payment submitted. The store will verify it and update your balance.', payment: one('SELECT * FROM payments WHERE id=?', id) });
  });

  // ---------- static + errors ----------
  app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found')));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Invalid JSON');
    const status = err.status || (/SQLITE_CONSTRAINT/.test(String(err.code)) ? 409 : 500);
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Something went wrong on the server' : err.message });
  });
  return app;
}

module.exports = { createApp };
if (require.main === module) {
  const file = process.env.DB_FILE || path.join(__dirname, 'kitakita.db'), db = open(file);
  if (process.env.NODE_ENV === 'production' && !db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
    const email = str(process.env.BOOTSTRAP_ADMIN_EMAIL, 80).toLowerCase();
    const name = str(process.env.BOOTSTRAP_ADMIN_NAME || 'Store Owner', 80);
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 12)
      throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of at least 12 characters for the first production start');
    db.prepare("INSERT INTO users(name,email,password_hash,role,status,created_at) VALUES(?,?,?,'admin','active',?)")
      .run(name, email, bcrypt.hashSync(password, 12), ymdhms());
    console.log('Created the initial production admin account from bootstrap environment variables.');
  }
  const port = process.env.PORT || 3000;
  createApp(db).listen(port, '0.0.0.0', () => console.log(`Kita Kita listening on port ${port}`));
}
