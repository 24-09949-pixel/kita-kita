'use strict';
// End-to-end API tests. Run: npm test
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { open, ymd, addDays } = require('../db');
const { seed } = require('../seed');
const { createApp } = require('../server');

const file = path.join(os.tmpdir(), `kk-test-${process.pid}.db`);
const setupFile = path.join(os.tmpdir(), `kk-setup-test-${process.pid}.db`);
for (const s of ['', '-wal', '-shm']) try { fs.unlinkSync(file + s); } catch {}
for (const s of ['', '-wal', '-shm']) try { fs.unlinkSync(setupFile + s); } catch {}
const db = open(file); seed(db);
const server = createApp(db, { secret: 'test' }).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const setupDb = open(setupFile), setupServer = createApp(setupDb, { secret: 'setup-test' }).listen(0);
const setupBase = `http://127.0.0.1:${setupServer.address().port}`;
let pass = 0, failed = 0;

async function call(method, url, body, token) {
  return callAt(base, method, url, body, token);
}
async function callAt(root, method, url, body, token) {
  const r = await fetch(root + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || ''; const data = ct.includes('json') ? await r.json() : await r.text();
  return { status: r.status, data };
}
const get = (u, t) => call('GET', u, null, t), post = (u, b, t) => call('POST', u, b, t), put = (u, b, t) => call('PUT', u, b, t), del = (u, t) => call('DELETE', u, null, t);
const getAt = (root, u, t) => callAt(root, 'GET', u, null, t), postAt = (root, u, b, t) => callAt(root, 'POST', u, b, t);
async function t(name, fn) { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n     ', e.message); } }
const login = async (identifier, password, portal = 'staff') => { const r = await post('/api/auth/login', { identifier, password, portal }); assert.strictEqual(r.status, 200, JSON.stringify(r.data)); return r.data.token; };
const tomorrow = ymd(addDays(new Date(), 1)), nextWeek = ymd(addDays(new Date(), 7));

(async () => {
  console.log('FIRST-RUN SETUP');
  await t('empty database creates a custom owner once, then allows a customer to register', async () => {
    assert.strictEqual((await getAt(setupBase, '/api/config')).data.setup_required, true);
    assert.strictEqual((await getAt(setupBase, '/api/products')).status, 401);
    assert.strictEqual((await postAt(setupBase, '/api/auth/register', { name: 'Test Customer', phone: '09179990000', password: 'customer-pass' })).status, 503);
    assert.strictEqual((await postAt(setupBase, '/api/setup/owner', { name: 'A', email: 'owner@example.test', password: 'short' })).status, 400);
    const owner = await postAt(setupBase, '/api/setup/owner', { name: 'My Store Owner', email: 'owner@example.test', password: 'my-secure-owner-password' });
    assert.strictEqual(owner.status, 201, JSON.stringify(owner.data));
    assert.strictEqual(owner.data.user.role, 'admin');
    assert.strictEqual((await getAt(setupBase, '/api/config')).data.setup_required, false);
    assert.strictEqual((await getAt(setupBase, '/api/products', owner.data.token)).data.total, 0);
    assert.strictEqual((await postAt(setupBase, '/api/setup/owner', { name: 'Another Owner', email: 'another@example.test', password: 'another-secure-password' })).status, 409);
    const customer = await postAt(setupBase, '/api/auth/register', { name: 'My Test Customer', phone: '09179990000', password: 'customer-pass' });
    assert.strictEqual(customer.status, 201, JSON.stringify(customer.data));
    assert.strictEqual(customer.data.user.role, 'customer');
  });

  console.log('AUTH');
  const admin = await login('cora@kitakita.ph', 'admin123'), cashier = await login('marco@kitakita.ph', 'cashier123'), cust = await login('09175550190', 'customer123', 'customer');
  await t('staff login works for admin and cashier; customer can log in by phone or email', async () => { await login('ana@example.com', 'customer123', 'customer'); });
  await t('wrong password rejected', async () => assert.strictEqual((await post('/api/auth/login', { identifier: 'cora@kitakita.ph', password: 'nope', portal: 'staff' })).status, 401));
  await t('customer cannot log in on the staff portal and vice versa', async () => {
    assert.strictEqual((await post('/api/auth/login', { identifier: '09175550190', password: 'customer123', portal: 'staff' })).status, 401);
    assert.strictEqual((await post('/api/auth/login', { identifier: 'cora@kitakita.ph', password: 'admin123', portal: 'customer' })).status, 401);
  });
  await t('inactive staff cannot log in', async () => assert.strictEqual((await post('/api/auth/login', { identifier: 'rey@kitakita.ph', password: 'admin123', portal: 'staff' })).status, 403));
  await t('missing/invalid token rejected', async () => { assert.strictEqual((await get('/api/products')).status, 401); assert.strictEqual((await get('/api/products', 'garbage')).status, 401); });
  await t('login attempts are rate limited', async () => { let last; for (let i = 0; i < 10; i++) last = await post('/api/auth/login', { identifier: 'spam@x.com', password: 'bad', portal: 'staff' }); assert.strictEqual(last.status, 429); });
  await t('customer registration validates and creates an account', async () => {
    assert.strictEqual((await post('/api/auth/register', { name: 'X', phone: '1', password: '123456' })).status, 400);
    assert.strictEqual((await post('/api/auth/register', { name: 'Pedro Penduko', phone: '09175550142', password: '123456' })).status, 409); // existing store record
    const r = await post('/api/auth/register', { name: 'Pedro Penduko', phone: '0999 888 7766', password: 'secret1' }); assert.strictEqual(r.status, 201);
    const me = await get('/api/portal/summary', r.data.token); assert.strictEqual(me.status, 200); assert.strictEqual(me.data.credit_limit, 0);
    assert.strictEqual((await post('/api/auth/register', { name: 'Pedro Again', phone: '09998887766', password: 'secret1' })).status, 409);
  });
  await t('role permissions enforced', async () => {
    for (const u of ['/api/dashboard', '/api/insights', '/api/reports/sales', '/api/expenses', '/api/users']) assert.strictEqual((await get(u, cashier)).status, 403, u);
    assert.strictEqual((await post('/api/products', {}, cashier)).status, 403);
    for (const u of ['/api/products', '/api/customers', '/api/sales', '/api/credits']) assert.strictEqual((await get(u, cust)).status, 403, u);
    assert.strictEqual((await get('/api/portal/summary', admin)).status, 403);
  });

  console.log('PRODUCTS / INVENTORY');
  let prod;
  await t('list, search, filter and summary', async () => {
    const l = await get('/api/products?limit=500', admin); assert.ok(l.data.total >= 40);
    assert.ok((await get('/api/products?q=pancit', admin)).data.items.length >= 1);
    assert.ok((await get('/api/products?status=out', admin)).data.items.every(p => p.status === 'out'));
    const s = (await get('/api/products/summary', admin)).data; assert.ok(s.out >= 2 && s.low >= 3 && s.near_expiry >= 2 && s.categories === 8);
  });
  await t('create product validates and rejects duplicates', async () => {
    assert.strictEqual((await post('/api/products', { name: 'X' }, admin)).status, 400);
    assert.strictEqual((await post('/api/products', { name: 'Bad', sku: 'B-1', category: 'Snacks', cost: -1, price: 5 }, admin)).status, 400);
    const r = await post('/api/products', { name: 'Nissin Cup Noodles', sku: 'NC-900', barcode: '4800110013014', category: 'Noodles & Canned', cost: 24, price: 30, stock: 36, reorder_level: 12, expiry_date: '2027-01-15' }, admin);
    assert.strictEqual(r.status, 201); prod = r.data; assert.strictEqual(prod.status, 'in');
    assert.strictEqual((await post('/api/products', { name: 'Dup', sku: 'nc-900', category: 'Snacks', cost: 1, price: 2 }, admin)).status, 409);
    assert.strictEqual((await post('/api/products', { name: 'Dup', sku: 'NC-901', barcode: '4800110013014', category: 'Snacks', cost: 1, price: 2 }, admin)).status, 409);
  });
  await t('barcode lookup and edit', async () => {
    assert.strictEqual((await get('/api/products/code/4800110013014', cashier)).data.id, prod.id);
    assert.strictEqual((await get('/api/products/code/000', cashier)).status, 404);
    const r = await put(`/api/products/${prod.id}`, { ...prod, price: 32 }, admin); assert.strictEqual(r.data.price, 32);
  });
  await t('restock adds stock and history; validates qty', async () => {
    assert.strictEqual((await post(`/api/products/${prod.id}/restock`, { qty: 0 }, admin)).status, 400);
    const r = await post(`/api/products/${prod.id}/restock`, { qty: 24, cost: 25, supplier: 'Metro' }, admin); assert.strictEqual(r.data.stock, 60);
    assert.strictEqual((await get(`/api/products/${prod.id}/restocks`, admin)).data.length, 1);
  });
  await t('cashiers never receive cost prices', async () => { const l = (await get('/api/products?limit=3', cashier)).data.items[0]; assert.ok(!('cost' in l) && !('margin' in l) && 'price' in l); assert.ok(!('cost' in (await get('/api/products/code/' + l.sku, cashier)).data)); assert.strictEqual((await get('/api/products/summary', cashier)).data.value_cost, null); });
  await t('delete product hides it', async () => { assert.strictEqual((await del(`/api/products/${prod.id}`, admin)).status, 200); assert.strictEqual((await get('/api/products/code/4800110013014', admin)).status, 404); });

  console.log('POS / SALES');
  const P = (await get('/api/products?q=Lucky&limit=5', admin)).data.items[0]; const E = (await get('/api/products?q=Eggs&limit=5', admin)).data.items[0];
  const stockOf = async id => (await get('/api/products?limit=500', admin)).data.items.find(p => p.id === id).stock;
  await t('cash sale deducts stock only after checkout and computes change', async () => {
    const before = await stockOf(P.id);
    const r = await post('/api/sales', { items: [{ product_id: P.id, qty: 3 }, { product_id: E.id, qty: 2 }], payment_type: 'cash', amount_received: 100 }, cashier);
    assert.strictEqual(r.status, 201, JSON.stringify(r.data)); assert.strictEqual(r.data.total, 3 * P.price + 2 * E.price); assert.strictEqual(r.data.change_due, 100 - r.data.total);
    assert.ok(/^TRX-\d{4}$/.test(r.data.code)); assert.strictEqual(await stockOf(P.id), before - 3);
  });
  await t('failed checkout never changes stock', async () => {
    const before = await stockOf(P.id);
    assert.strictEqual((await post('/api/sales', { items: [{ product_id: P.id, qty: 1 }], payment_type: 'cash', amount_received: 1 }, cashier)).status, 400);
    assert.strictEqual((await post('/api/sales', { items: [{ product_id: P.id, qty: 99999 }, { product_id: E.id, qty: 1 }], payment_type: 'cash', amount_received: 1e7 }, cashier)).status, 400);
    assert.strictEqual(await stockOf(P.id), before);
  });
  await t('validation: empty cart, bad qty, bad type, ewallet reference, discount', async () => {
    assert.strictEqual((await post('/api/sales', { items: [], payment_type: 'cash' }, cashier)).status, 400);
    assert.strictEqual((await post('/api/sales', { items: [{ product_id: P.id, qty: -2 }], payment_type: 'cash', amount_received: 100 }, cashier)).status, 400);
    assert.strictEqual((await post('/api/sales', { items: [{ product_id: P.id, qty: 1.5 }], payment_type: 'cash', amount_received: 100 }, cashier)).status, 400);
    assert.strictEqual((await post('/api/sales', { items: [{ product_id: P.id, qty: 1 }], payment_type: 'bitcoin' }, cashier)).status, 400);
    assert.strictEqual((await post('/api/sales', { items: [{ product_id: P.id, qty: 1 }], payment_type: 'ewallet' }, cashier)).status, 400);
    assert.strictEqual((await post('/api/sales', { items: [{ product_id: P.id, qty: 1 }], payment_type: 'ewallet', reference: 'GC-1234' }, cashier)).status, 201);
    assert.strictEqual((await post('/api/sales', { items: [{ product_id: P.id, qty: 1 }], payment_type: 'cash', amount_received: 50, discount: 99 }, cashier)).status, 400);
    const d = await post('/api/sales', { items: [{ product_id: P.id, qty: 2 }], payment_type: 'cash', amount_received: 50, discount: 3 }, cashier); assert.strictEqual(d.data.total, 2 * P.price - 3);
  });
  const jun = (await post('/api/customers', { name: 'Utang Tester', phone: '09171230000', credit_limit: 100 }, admin)).data;
  let utangSale;
  await t('utang requires customer + valid due date, creates a credit, enforces credit limit', async () => {
    assert.strictEqual((await post('/api/sales', { items: [{ product_id: P.id, qty: 1 }], payment_type: 'utang', due_date: nextWeek }, cashier)).status, 400);
    assert.strictEqual((await post('/api/sales', { items: [{ product_id: P.id, qty: 1 }], payment_type: 'utang', customer_id: jun.id, due_date: '2020-01-01' }, cashier)).status, 400);
    const before = (await get(`/api/customers/${jun.id}`, admin)).data.customer.balance;
    const r = await post('/api/sales', { items: [{ product_id: P.id, qty: 2 }], payment_type: 'utang', customer_id: jun.id, due_date: nextWeek, down_payment: 5 }, cashier);
    assert.strictEqual(r.status, 201, JSON.stringify(r.data)); utangSale = r.data; assert.strictEqual(r.data.credit.amount, 2 * P.price - 5);
    assert.strictEqual((await get(`/api/customers/${jun.id}`, admin)).data.customer.balance, before + 2 * P.price - 5);
    const big = await post('/api/sales', { items: [{ product_id: P.id, qty: 6 }], payment_type: 'utang', customer_id: jun.id, due_date: nextWeek }, cashier); assert.strictEqual(big.status, 409);
    assert.strictEqual((await post('/api/sales', { items: [{ product_id: P.id, qty: 6 }], payment_type: 'utang', customer_id: jun.id, due_date: nextWeek, override: true }, cashier)).status, 409); // cashier cannot override
  });
  await t('transactions list filters + detail', async () => {
    const l = await get(`/api/sales?date=${ymd()}&type=utang`, admin); assert.ok(l.data.items.every(s => s.payment_type === 'utang') && l.data.summary.utang > 0);
    assert.strictEqual((await get(`/api/sales/${utangSale.id}`, cashier)).data.items.length, 1);
    assert.strictEqual((await get('/api/sales/999999', admin)).status, 404);
    assert.ok((await get('/api/sales?q=TRX-0001', admin)).data.items.length >= 1);
  });
  await t('void restores stock, cancels credit; blocked if payments exist; admin only', async () => {
    const s = (await post('/api/sales', { items: [{ product_id: P.id, qty: 2 }], payment_type: 'utang', customer_id: jun.id, due_date: nextWeek }, cashier)).data;
    const before = await stockOf(P.id);
    assert.strictEqual((await post(`/api/sales/${s.id}/void`, {}, cashier)).status, 403);
    const v = await post(`/api/sales/${s.id}/void`, {}, admin); assert.strictEqual(v.data.status, 'voided'); assert.strictEqual(await stockOf(P.id), before + 2);
    assert.strictEqual((await post(`/api/sales/${s.id}/void`, {}, admin)).status, 400);
    await post('/api/payments', { customer_id: jun.id, credit_id: utangSale.credit.id, amount: 5, method: 'cash' }, cashier);
    assert.strictEqual((await post(`/api/sales/${utangSale.id}/void`, {}, admin)).status, 400);
  });

  console.log('CREDIT');
  await t('record partial payment, oldest-first allocation, overpay rejected', async () => {
    const c = (await get(`/api/customers/${jun.id}`, admin)).data; const bal = c.customer.balance; assert.ok(bal > 20);
    assert.strictEqual((await post('/api/payments', { customer_id: jun.id, amount: bal + 1, method: 'cash' }, cashier)).status, 400);
    assert.strictEqual((await post('/api/payments', { customer_id: jun.id, amount: 0, method: 'cash' }, cashier)).status, 400);
    assert.strictEqual((await post('/api/payments', { customer_id: jun.id, amount: 10, method: 'crypto' }, cashier)).status, 400);
    const r = await post('/api/payments', { customer_id: jun.id, amount: 10, method: 'cash', new_due_date: nextWeek }, cashier); assert.strictEqual(r.status, 201); assert.strictEqual(r.data.balance, bal - 10);
    const all = await post('/api/payments', { customer_id: jun.id, amount: bal - 10, method: 'ewallet', reference: 'GC1234' }, cashier); assert.strictEqual(all.data.balance, 0);
    assert.strictEqual((await get('/api/credits?status=open&customer_id=' + jun.id, admin)).data.items.length, 0);
  });
  await t('credits overview and update (admin only)', async () => {
    const o = (await get('/api/credits', admin)).data; assert.ok(o.summary.owed > 0 && o.summary.past_due > 0 && o.items.some(i => i.state === 'overdue'));
    const c = o.items[0]; assert.strictEqual((await put(`/api/credits/${c.id}`, { due_date: nextWeek }, cashier)).status, 403);
    const r = await put(`/api/credits/${c.id}`, { due_date: nextWeek, follow_up: false }, admin); assert.strictEqual(r.data.due_date, nextWeek); assert.strictEqual(r.data.follow_up, 0);
    assert.strictEqual((await put(`/api/credits/${c.id}`, { due_date: '2026-02-31' }, admin)).status, 400);
  });

  console.log('CUSTOMERS');
  let nc;
  await t('create/edit/search customers; duplicate phone rejected; profile', async () => {
    assert.strictEqual((await post('/api/customers', { name: 'A' }, cashier)).status, 400);
    const r = await post('/api/customers', { name: 'Nena Test', phone: '09170001111', credit_limit: 1500 }, cashier); assert.strictEqual(r.status, 201); nc = r.data;
    assert.strictEqual((await post('/api/customers', { name: 'Dup', phone: '0917 000 1111' }, admin)).status, 409);
    assert.strictEqual((await post('/api/sales', { items: [{ product_id: P.id, qty: 6 }], payment_type: 'utang', customer_id: jun.id, due_date: nextWeek, override: true }, admin)).status, 201); // admin override allowed
    await post('/api/payments', { customer_id: jun.id, amount: 6 * P.price, method: 'cash' }, admin);
    const e = await put(`/api/customers/${nc.id}`, { name: 'Nena Tester', credit_limit: 9999 }, cashier); assert.strictEqual(e.data.name, 'Nena Tester'); assert.strictEqual(e.data.credit_limit, 1500); // cashier can't change limit
    assert.strictEqual((await put(`/api/customers/${nc.id}`, { credit_limit: 3000 }, admin)).data.credit_limit, 3000);
    const p = (await get(`/api/customers/${nc.id}`, admin)).data; assert.ok(p.customer && Array.isArray(p.credits) && Array.isArray(p.payments));
    assert.ok((await get('/api/customers?q=Tester&status=balance', admin)).data.total === 0);
    const pa = await post(`/api/customers/${nc.id}/portal-account`, { password: 'abcdef' }, admin); assert.strictEqual(pa.status, 200);
    await login('09170001111', 'abcdef', 'customer');
  });

  console.log('CUSTOMER PORTAL');
  await t('summary, products (no cost leak), credit, history', async () => {
    const s = (await get('/api/portal/summary', cust)).data; assert.strictEqual(s.customer.name, 'Ana Dela Cruz'); assert.ok('available' in s && Array.isArray(s.notifications));
    const p = (await get('/api/portal/products', cust)).data; assert.ok(p.length >= 40 && !('cost' in p[0]) && !('stock' in p[0]) && ['in', 'low', 'out'].includes(p[0].availability));
    assert.ok(Array.isArray((await get('/api/portal/credit', cust)).data)); assert.ok(Array.isArray((await get('/api/portal/purchases', cust)).data));
  });
  await t('credit request: validations, limit, approval creates credit, decline', async () => {
    const bad1 = await post('/api/portal/requests', { items: 'Rice', amount: 1000000, preferred_due: nextWeek }, cust); assert.strictEqual(bad1.status, 400);
    assert.strictEqual((await post('/api/portal/requests', { items: 'Rice 5kg', amount: 50, preferred_due: '2020-01-01' }, cust)).status, 400);
    const r1 = await post('/api/portal/requests', { items: 'Rice 1 kg, eggs x6', amount: 100, preferred_due: nextWeek, note: 'thanks' }, cust); assert.strictEqual(r1.status, 201);
    assert.strictEqual((await post('/api/portal/requests', { items: 'Rice 1 kg, eggs x6', amount: 100, preferred_due: nextWeek }, cust)).status, 409);
    const r2 = await post('/api/portal/requests', { items: 'Noodles x3', amount: 60, preferred_due: nextWeek }, cust);
    const list = (await get('/api/credit-requests?status=pending', admin)).data; assert.ok(list.some(x => x.id === r1.data.id));
    assert.strictEqual((await post(`/api/credit-requests/${r1.data.id}/approve`, { due_date: nextWeek }, cashier)).status, 403);
    const ap = await post(`/api/credit-requests/${r1.data.id}/approve`, { due_date: nextWeek }, admin); assert.strictEqual(ap.data.status, 'approved'); assert.ok(ap.data.credit_id);
    assert.strictEqual((await post(`/api/credit-requests/${r1.data.id}/approve`, { due_date: nextWeek }, admin)).status, 400);
    assert.strictEqual((await post(`/api/credit-requests/${r2.data.id}/decline`, { note: 'Pay old balance first' }, admin)).data.status, 'declined');
    assert.ok((await get('/api/portal/summary', cust)).data.notifications.some(n => /approved/.test(n.title)));
  });
  await t('manual QR proof validates uploads, stays pending, and is admin-confirmed or rejected', async () => {
    const credits = (await get('/api/portal/credit', cust)).data.filter(c => c.status === 'open'), c = credits[0]; assert.ok(c);
    const receiptImage = 'data:image/png;base64,iVBORw0KGgo=';
    const submit = (body = {}) => post('/api/portal/payment-proofs', { credit_id: c.id, amount: 10, reference_last4: '9999', receipt_image: receiptImage, ...body }, cust);
    assert.strictEqual((await submit({ reference_last4: '123' })).status, 400);
    assert.strictEqual((await submit({ reference_last4: '12345' })).status, 400);
    assert.strictEqual((await submit({ reference_last4: '12x4' })).status, 400);
    assert.strictEqual((await submit({ receipt_image: 'data:image/jpeg;base64,iVBORw0KGgo=' })).status, 400);
    assert.strictEqual((await submit({ receipt_image: undefined })).status, 400);
    assert.strictEqual((await submit({ receipt_image: 'data:image/png;base64,' + 'A'.repeat(5592408) })).status, 400);
    assert.strictEqual((await submit({ amount: c.balance + 50 })).status, 400);

    const before = (await get('/api/credits?status=open', admin)).data.items.find(x => x.id === c.id).paid;
    const r = await submit(); assert.strictEqual(r.status, 201, JSON.stringify(r.data));
    const id = r.data.payment.id; assert.strictEqual(r.data.payment.status, 'pending');
    assert.strictEqual('receipt_image' in r.data.payment, false);
    const pendingCredit = (await get('/api/portal/credit', cust)).data.find(x => x.id === c.id);
    assert.strictEqual(pendingCredit.pending, 10); assert.strictEqual(pendingCredit.payment_status, 'pending_verification');
    assert.strictEqual((await get('/api/portal/credit', cust)).data.find(x => x.id === c.id).paid, before);
    assert.ok((await get('/api/portal/summary', cust)).data.notifications.some(n => /proof awaiting verification/.test(n.title)));
    assert.ok((await get('/api/alerts', admin)).data.pending_payments >= 1);
    assert.strictEqual((await get('/api/payments/proofs', cashier)).status, 403);
    assert.strictEqual((await get(`/api/payments/${id}/receipt`, cust)).status, 403);
    assert.strictEqual((await get(`/api/payments/${id}/receipt`, cashier)).status, 403);
    assert.strictEqual((await post(`/api/payments/${id}/confirm`, {}, cashier)).status, 403);
    assert.strictEqual((await post(`/api/payments/${id}/reject`, {}, cashier)).status, 403);

    const proofs = await get('/api/payments/proofs', admin);
    assert.ok(proofs.data.some(p => p.id === id && p.balance_due === c.balance));
    assert.strictEqual('receipt_image' in proofs.data.find(p => p.id === id), false);
    const receipt = await fetch(base + `/api/payments/${id}/receipt`, { headers: { Authorization: 'Bearer ' + admin } });
    assert.strictEqual(receipt.status, 200); assert.strictEqual(receipt.headers.get('content-type'), 'image/png');
    assert.deepStrictEqual(Buffer.from(await receipt.arrayBuffer()), Buffer.from('iVBORw0KGgo=', 'base64'));

    const confirmed = await post(`/api/payments/${id}/confirm`, {}, admin);
    assert.strictEqual(confirmed.data.status, 'confirmed'); assert.ok(confirmed.data.confirmed_at);
    assert.strictEqual((await get('/api/credits?status=open', admin)).data.items.find(x => x.id === c.id).paid, before + 10);
    assert.strictEqual((await post(`/api/payments/${id}/confirm`, {}, admin)).status, 400);
    const rejected = await submit({ amount: 5, reference_last4: '1111' });
    assert.strictEqual(rejected.status, 201);
    const rejectedAt = await post(`/api/payments/${rejected.data.payment.id}/reject`, {}, admin);
    assert.strictEqual(rejectedAt.data.status, 'rejected'); assert.strictEqual(rejectedAt.data.confirmed_at, null);
    assert.strictEqual((await get('/api/credits?status=open', admin)).data.items.find(x => x.id === c.id).paid, before + 10);
    const history = (await get('/api/portal/payments', cust)).data;
    assert.ok(history.items.some(x => x.id === id && x.confirmed_at));
    assert.strictEqual(history.items.some(x => 'receipt_image' in x), false);
    assert.strictEqual((await post('/api/portal/pay', { credit_id: c.id, amount: 1, method: 'ewallet' }, cust)).status, 404);
  });
  await t("customers can't read other customers' receipts", async () => {
    assert.strictEqual((await get(`/api/portal/purchases/${utangSale.id}`, cust)).status, 404);
    const mine = (await get('/api/portal/purchases', cust)).data; if (mine.length) assert.strictEqual((await get(`/api/portal/purchases/${mine[0].id}`, cust)).status, 200);
  });

  console.log('ANALYTICS / REPORTS');
  await t('dashboard has all widgets and sane numbers', async () => {
    const d = (await get('/api/dashboard', admin)).data; assert.ok(d.kpi.today > 0 && d.kpi.week >= d.kpi.today && d.kpi.month >= d.kpi.week - 1);
    assert.ok(d.chart.current.length === 7 && d.chart.previous.length === 7 && d.chart.weekly.length === 4 && d.chart.monthly.length === 3);
    assert.strictEqual(d.payment_mix.length, 3); assert.ok(d.top_sellers.length === 5 && d.low_stock.length > 0 && d.debtors.length > 0 && d.recent.length === 6 && d.insight.length > 20);
    assert.ok(d.kpi.margin_week > 5 && d.kpi.margin_week < 60);
  });
  await t('insights: tips, heatmap, trend/forecast, profit tables', async () => {
    const i = (await get('/api/insights', admin)).data; assert.ok(i.tips.length >= 3 && i.heatmap.grid.length === 7 && i.heatmap.grid[0].length === 8);
    assert.strictEqual(i.trend.actual.length, 8); assert.ok(i.trend.forecast > 0); assert.ok(i.profit_category.length >= 5 && i.profit_item.length === 6 && i.best.length === 5 && i.slow.length === 5);
  });
  await t('sales report by day/week/month matches totals; CSV export; bad range', async () => {
    const f = ymd(addDays(new Date(), -30)), to = ymd();
    const d = (await get(`/api/reports/sales?group=day&from=${f}&to=${to}`, admin)).data, w = (await get(`/api/reports/sales?group=week&from=${f}&to=${to}`, admin)).data, m = (await get(`/api/reports/sales?group=month&from=${f}&to=${to}`, admin)).data;
    assert.ok(d.rows.length >= 28); assert.strictEqual(d.totals.revenue, w.totals.revenue); assert.strictEqual(d.totals.revenue, m.totals.revenue);
    assert.ok(Math.abs(d.totals.profit - d.rows.reduce((a, r) => a + r.profit, 0)) < 0.5);
    const csv = await get(`/api/reports/sales?group=day&from=${f}&to=${to}&format=csv`, admin); assert.ok(/^Period,Transactions/.test(csv.data));
    assert.strictEqual((await get('/api/reports/sales?from=2026-05-02&to=2026-05-01', admin)).status, 400);
  });
  await t('inventory + credit reports', async () => {
    const i = (await get('/api/reports/inventory', admin)).data; assert.ok(i.value_retail > i.value_cost && i.attention.length > 0 && i.restocks.length === 10);
    const c = (await get('/api/reports/credit', admin)).data; assert.strictEqual(c.aging.length, 4); assert.ok(Math.abs(c.aging.reduce((a, b) => a + b.v, 0) - c.outstanding) < 0.01);
    assert.ok((await get('/api/reports/inventory?format=csv', admin)).data.includes('Product,SKU'));
    assert.ok((await get('/api/reports/credit?format=csv', admin)).data.includes('Customer,Amount'));
  });
  await t('alerts for staff badges', async () => { const a = (await get('/api/alerts', cashier)).data; assert.ok(a.out >= 2 && a.overdue >= 1 && 'pending_requests' in a); });

  console.log('EXPENSES / USERS');
  await t('expenses: add, validate, summary, delete', async () => {
    assert.strictEqual((await post('/api/expenses', { category: 'Ice', amount: -5 }, admin)).status, 400); assert.strictEqual((await post('/api/expenses', { category: 'Gold', amount: 5 }, admin)).status, 400);
    const before = (await get('/api/expenses', admin)).data; const r = await post('/api/expenses', { category: 'Supplier purchase', description: 'Eggs & rice', paid_to: 'Local farm', amount: 2400 }, admin); assert.strictEqual(r.status, 201);
    const after = (await get('/api/expenses', admin)).data; assert.strictEqual(after.total, before.total + 2400); assert.strictEqual(after.net_profit, after.gross_profit - after.total);
    assert.strictEqual((await del(`/api/expenses/${r.data.id}`, admin)).status, 200); assert.strictEqual((await del(`/api/expenses/${r.data.id}`, admin)).status, 404);
  });
  await t('user management rules', async () => {
    assert.strictEqual((await post('/api/users', { name: 'New Cashier', email: 'new@kitakita.ph', role: 'cashier', password: '123' }, admin)).status, 400);
    const u = await post('/api/users', { name: 'New Cashier', email: 'new@kitakita.ph', role: 'cashier', password: 'newpass1' }, admin); assert.strictEqual(u.status, 201);
    assert.strictEqual((await post('/api/users', { name: 'Dup', email: 'NEW@kitakita.ph', role: 'cashier', password: 'newpass1' }, admin)).status, 409);
    await login('new@kitakita.ph', 'newpass1');
    assert.strictEqual((await put(`/api/users/${u.data.id}`, { status: 'inactive' }, admin)).data.status, 'inactive');
    assert.strictEqual((await post('/api/auth/login', { identifier: 'new@kitakita.ph', password: 'newpass1', portal: 'staff' })).status, 403);
    const me = (await get('/api/auth/me', admin)).data.user; assert.strictEqual((await put(`/api/users/${me.id}`, { status: 'inactive' }, admin)).status, 400);
    assert.strictEqual((await put(`/api/users/${me.id}`, { role: 'cashier' }, admin)).status, 400);
    const l = (await get('/api/users', admin)).data; assert.ok(l.users.length >= 4 && l.log.length > 0 && l.customers >= 2);
  });
  await t('change password', async () => {
    assert.strictEqual((await post('/api/auth/change-password', { current: 'wrong', next: 'abcdef' }, cashier)).status, 400);
    assert.strictEqual((await post('/api/auth/change-password', { current: 'cashier123', next: 'cashier456' }, cashier)).status, 200); await login('marco@kitakita.ph', 'cashier456');
  });

  console.log('SECURITY / MISC');
  await t('SQL-injection-style input is harmless; invalid JSON is a 400; unknown API route is 404 JSON', async () => {
    const r = await get("/api/products?q=' OR 1=1 --", admin); assert.strictEqual(r.status, 200); assert.strictEqual(r.data.total, 0);
    assert.strictEqual((await get("/api/customers?q=%27%3B%20DROP%20TABLE%20users%3B--", admin)).status, 200);
    assert.deepStrictEqual((await get('/api/health')).data, { ok: true });
    const bad = await fetch(base + '/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin }, body: '{oops' }); assert.strictEqual(bad.status, 400);
    assert.strictEqual((await get('/api/nope', admin)).status, 404);
  });
  await t('static front end and store QR image are served with security headers', async () => {
    const r = await fetch(base + '/'); assert.strictEqual(r.status, 200); assert.ok(r.headers.get('content-security-policy'));
    const qr = await fetch(base + '/images/gcash-payment-qr.png'); assert.strictEqual(qr.status, 200);
    assert.ok((qr.headers.get('content-type') || '').startsWith('image/png')); assert.ok((await qr.arrayBuffer()).byteLength > 0);
  });
  await t('data integrity: stock never negative, credit paid <= amount', async () => {
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM products WHERE stock<0').get().n, 0); assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM credits WHERE paid>amount+0.001 OR paid<0').get().n, 0);
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM credits WHERE status='paid' AND paid<amount-0.001").get().n, 0);
  });

  console.log(`\n${pass} passed, ${failed} failed`);
  server.close(); setupServer.close(); db.close(); setupDb.close();
  for (const s of ['', '-wal', '-shm']) try { fs.unlinkSync(file + s); } catch {}
  for (const s of ['', '-wal', '-shm']) try { fs.unlinkSync(setupFile + s); } catch {}
  process.exit(failed ? 1 : 0);
})();
