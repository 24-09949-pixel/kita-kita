'use strict';
// Deterministic fixture generator used by API tests only.
const bcrypt = require('bcryptjs');
const { open, ymd, ymdhms, addDays, round2 } = require('./db');

function rng(seed) { // mulberry32 (deterministic)
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PRODUCTS = [ // name, category, cost, price, reorder, popularity
  ['Lucky Me Pancit Canton', 'Noodles & Canned', 11.5, 14, 30, 10], ['Lucky Me Beef Noodles Cup', 'Noodles & Canned', 18, 23, 15, 3],
  ['Ligo Sardines 155g', 'Noodles & Canned', 22, 27, 12, 3], ['Argentina Corned Beef 150g', 'Noodles & Canned', 33, 40, 10, 2],
  ['Coke Mismo 200ml', 'Drinks', 11, 15, 24, 8], ['Sprite Mismo 200ml', 'Drinks', 11, 15, 24, 4], ['C2 Green Tea 230ml', 'Drinks', 15, 20, 15, 4],
  ['Royal Tru-Orange 200ml', 'Drinks', 11, 15, 24, 3], ['Mineral Water 500ml', 'Drinks', 8, 12, 24, 5], ['Zest-O Orange 200ml', 'Drinks', 9, 12, 20, 3],
  ['Piattos Cheese 40g', 'Snacks', 14, 18, 20, 6], ['Nova Country Cheddar 40g', 'Snacks', 14, 18, 20, 4], ['Skyflakes Single Pack', 'Snacks', 6.5, 8, 25, 1],
  ['Chippy BBQ 27g', 'Snacks', 8, 10, 25, 5], ['Pillows Chocolate 38g', 'Snacks', 5.5, 8, 25, 3], ['Choco Mucho Bar', 'Snacks', 7, 10, 20, 2],
  ['Great Taste White 3-in-1', 'Coffee & Milk', 5.5, 8, 40, 9], ['Nescafe Classic 3-in-1', 'Coffee & Milk', 6, 9, 40, 6], ['Milo 3-in-1 Sachet', 'Coffee & Milk', 7, 9, 30, 5],
  ['Bear Brand Sachet 33g', 'Coffee & Milk', 10, 13, 24, 5], ['Alaska Evap Milk 154ml', 'Coffee & Milk', 24, 29, 10, 2],
  ['Safeguard Soap 55g', 'Personal Care', 24, 30, 10, 2], ['Palmolive Shampoo Sachet', 'Personal Care', 5, 7, 30, 4], ['Colgate Toothpaste 25g', 'Personal Care', 15, 19, 10, 1],
  ['Modess Napkin 8s', 'Personal Care', 24, 30, 8, 1], ['Surf Powder Sachet', 'Household', 6, 8, 20, 4], ['Tide Powder Sachet', 'Household', 6.5, 9, 20, 3],
  ['Joy Dishwashing Sachet', 'Household', 5, 7, 20, 2], ['Zonrox Bleach 250ml', 'Household', 18, 24, 8, 1], ['Mosquito Coil (pc)', 'Household', 8, 12, 15, 1],
  ['Datu Puti Vinegar 385ml', 'Condiments', 17, 22, 10, 2], ['Datu Puti Soy Sauce 385ml', 'Condiments', 17, 22, 10, 2], ['Knorr Sinigang Mix', 'Condiments', 12, 15, 15, 2],
  ['Ajinomoto 50g', 'Condiments', 10, 13, 20, 2], ['Silver Swan Soy Sauce Sachet', 'Condiments', 3, 5, 30, 3], ['Cooking Oil Sachet 50ml', 'Condiments', 10, 13, 30, 3],
  ['Eggs (medium, per pc)', 'Rice & Eggs', 7.5, 9, 30, 8], ['Rice, local (per kg)', 'Rice & Eggs', 42, 48, 25, 4], ['Rice, premium (per kg)', 'Rice & Eggs', 52, 58, 20, 2],
  ['Ice Bag (small)', 'Rice & Eggs', 5, 10, 20, 3], ['Bread Pandesal (per pc)', 'Rice & Eggs', 2.5, 4, 40, 6]
];
const CUSTOMERS = [ // name, phone, limit, utang-propensity
  ['Aling Nena Ramos', '09175550142', 5000, 5], ['Mang Tomas Garcia', '09185550187', 5000, 4], ['Kuya Ben Lim', '09225550166', 4000, 3], ['Ate Gina Flores', '09275550120', 3000, 3],
  ['Lola Remy Bautista', '09155550199', 3000, 3], ['Jun Reyes', '09355550173', 2500, 2], ['Maricel Santos', '09195550111', 2500, 2], ['Dodong Cruz', '09165550138', 2000, 1],
  ['Ana Dela Cruz', '09175550190', 2000, 1], ['Tita Baby Aquino', '09205550155', 2000, 1], ['Mang Rudy Salazar', '09215550101', 1500, 0], ['Berna Villareal', '09235550102', 1500, 0]
];
const SUPPLIERS = ['Landmark Wholesale', 'Metro Wholesale', 'Local farm', 'Coca-Cola distributor'];

function seed(db, opts = {}) {
  const days = opts.days || 75, r = rng(opts.seed || 2026), now = opts.now || new Date();
  const hash = p => bcrypt.hashSync(p, 8);
  const t0 = ymdhms(addDays(now, -days));
  db.transaction(() => {
    for (const t of ['login_log', 'expenses', 'credit_requests', 'payments', 'credits', 'sale_items', 'sales', 'restocks', 'products', 'users', 'customers']) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare("DELETE FROM sqlite_sequence").run();
    const insC = db.prepare('INSERT INTO customers(name,phone,address,credit_limit,created_at) VALUES(?,?,?,?,?)');
    CUSTOMERS.forEach(c => insC.run(c[0], c[1], 'Brgy. San Dionisio, Parañaque', c[2], t0));
    const insU = db.prepare('INSERT INTO users(name,email,phone,password_hash,role,status,customer_id,last_login,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
    insU.run('Cora Villanueva', 'cora@kitakita.ph', null, hash('admin123'), 'admin', 'active', null, ymdhms(now), t0);
    insU.run('Marco Reyes', 'marco@kitakita.ph', null, hash('cashier123'), 'cashier', 'active', null, ymdhms(now), t0);
    insU.run('Liza Mendoza', 'liza@kitakita.ph', null, hash('cashier123'), 'cashier', 'active', null, ymdhms(now), t0);
    insU.run('Rey Santos', 'rey@kitakita.ph', null, hash('admin123'), 'admin', 'inactive', null, ymdhms(addDays(now, -27)), t0);
    insU.run('Ana Dela Cruz', 'ana@example.com', '09175550190', hash('customer123'), 'customer', 'active', 9, null, t0);
    insU.run('Aling Nena Ramos', null, '09175550142', hash('customer123'), 'customer', 'active', 1, null, t0);
    db.prepare('UPDATE customers SET created_at=? WHERE id IN (9,1)').run(t0);

    const insP = db.prepare('INSERT INTO products(name,sku,barcode,category,cost,price,stock,reorder_level,expiry_date,last_restock_date,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    const pre = { 'Noodles & Canned': 'NC', Drinks: 'DR', Snacks: 'SN', 'Coffee & Milk': 'CM', 'Personal Care': 'PC', Household: 'HH', Condiments: 'CD', 'Rice & Eggs': 'RE' };
    const cnt = {};
    PRODUCTS.forEach((p, i) => {
      const k = pre[p[1]]; cnt[k] = (cnt[k] || 0) + 1;
      const perish = /Eggs|Skyflakes|Pandesal/.test(p[0]);
      const exp = ymd(addDays(now, /Eggs/.test(p[0]) ? 14 : /Skyflakes/.test(p[0]) ? 20 : /Pandesal/.test(p[0]) ? 2 : 120 + Math.floor(r() * 500)));
      insP.run(p[0], `${k}-${String(cnt[k]).padStart(3, '0')}`, '48' + String(10000000000 + i * 7919).slice(0, 11), p[1], p[2], p[3], 40 + Math.floor(r() * 80), p[4], exp, ymd(addDays(now, -Math.floor(r() * 12))), t0);
    });

    // ---- sales history ----
    const prods = db.prepare('SELECT * FROM products').all();
    const weights = PRODUCTS.map(p => p[5]); const wsum = weights.reduce((a, b) => a + b, 0);
    const pick = () => { let x = r() * wsum; for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x <= 0) return prods[i]; } return prods[0]; };
    const hourW = { 6: 3, 7: 4, 8: 4, 9: 3, 10: 3, 11: 3, 12: 4, 13: 3, 14: 3, 15: 4, 16: 6, 17: 8, 18: 9, 19: 7, 20: 5, 21: 2 };
    const hrs = Object.keys(hourW).map(Number), hsum = Object.values(hourW).reduce((a, b) => a + b, 0);
    const pickHour = () => { let x = r() * hsum; for (const h of hrs) { x -= hourW[h]; if (x <= 0) return h; } return 18; };
    const insS = db.prepare('INSERT INTO sales(created_at,customer_id,cashier_id,subtotal,discount,total,payment_type,amount_received,change_due,reference,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    const insI = db.prepare('INSERT INTO sale_items(sale_id,product_id,name,qty,price,cost) VALUES(?,?,?,?,?,?)');
    const insCr = db.prepare('INSERT INTO credits(sale_id,customer_id,amount,paid,borrowed_on,due_date,follow_up,status) VALUES(?,?,?,?,?,?,?,?)');
    const insPay = db.prepare("INSERT INTO payments(credit_id,customer_id,amount,method,reference,created_at,recorded_by,status) VALUES(?,?,?,?,?,?,?,'confirmed')");
    const bal = {}; // outstanding per customer, to respect credit limits
    const debtors = []; CUSTOMERS.forEach((c, i) => { for (let k = 0; k < c[3]; k++) debtors.push(i + 1); });
    const credits = [];
    for (let d = days; d >= 0; d--) {
      const day = addDays(now, -d); const dow = day.getDay();
      const n = Math.round((dow === 6 ? 95 : dow === 0 ? 84 : 70) * (0.85 + r() * 0.3) * (1 + (days - d) / days * 0.1));
      const recs = [];
      for (let s = 0; s < n; s++) {
        const lines = 2 + Math.floor(r() * 4); const items = new Map();
        for (let l = 0; l < lines; l++) { const p = pick(); items.set(p.id, (items.get(p.id) || 0) + 1 + (r() < 0.25 ? 1 : 0) + (/Eggs|Pandesal/.test(p.name) && r() < 0.5 ? 2 : 0)); }
        const hr = pickHour(); const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hr, Math.floor(r() * 60), Math.floor(r() * 60));
        if (d === 0 && when > now) continue;
        const total = [...items].reduce((a, [id, q]) => a + prods.find(p => p.id === id).price * q, 0);
        const roll = r(); let type = roll < 0.74 ? 'cash' : 'ewallet', cid = null;
        if (r() < 0.2) { const c = debtors[Math.floor(r() * debtors.length)]; if (c && (bal[c] || 0) + total <= CUSTOMERS[c - 1][2]) { type = 'utang'; cid = c; } }
        else if (r() < 0.3) cid = 1 + Math.floor(r() * CUSTOMERS.length);
        recs.push({ when, items, total, type, cid });
      }
      recs.sort((a, b) => a.when - b.when);
      for (const x of recs) {
        const recv = x.type === 'cash' ? Math.ceil(x.total / 50) * 50 : x.type === 'ewallet' ? x.total : 0;
        const ca = r() < 0.5 ? 2 : 3;
        const sid = insS.run(ymdhms(x.when), x.cid, ca, x.total, 0, x.total, x.type, recv, x.type === 'cash' ? recv - x.total : 0, x.type === 'ewallet' ? 'GC' + Math.floor(r() * 1e6) : '', 'completed').lastInsertRowid;
        for (const [id, q] of x.items) { const p = prods.find(p => p.id === id); insI.run(sid, id, p.name, q, p.price, p.cost); }
        db.prepare('UPDATE sales SET code=? WHERE id=?').run('TRX-' + String(sid).padStart(4, '0'), sid);
        if (x.type === 'utang') {
          const due = ymd(addDays(x.when, 7 + Math.floor(r() * 3) * 7));
          const cid2 = insCr.run(sid, x.cid, x.total, 0, ymd(x.when), due, 1, 'open').lastInsertRowid;
          credits.push({ id: cid2, cid: x.cid, amount: x.total, due, when: x.when, paid: 0 }); bal[x.cid] = (bal[x.cid] || 0) + x.total;
        }
      }
      // customers settle some older utang
      for (const c of credits) {
        if (c.paid >= c.amount) continue; const age = (day - c.when) / 864e5; if (age < 3) continue;
        const stubborn = c.cid === 1 || c.cid === 6; if (stubborn && age < 25) continue;
        if (r() < (stubborn ? 0.02 : 0.22)) {
          const part = r() < 0.3; const amt = part ? round2(Math.max(5, Math.round((c.amount - c.paid) * (0.3 + r() * 0.4)))) : round2(c.amount - c.paid);
          if (amt <= 0 || amt > c.amount - c.paid) continue;
          insPay.run(c.id, c.cid, amt, r() < 0.75 ? 'cash' : 'ewallet', '', ymdhms(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10 + Math.floor(r() * 9), 5, 0)), 2);
          c.paid = round2(c.paid + amt); bal[c.cid] -= amt;
          db.prepare("UPDATE credits SET paid=?,status=? WHERE id=?").run(c.paid, c.paid >= c.amount - 0.001 ? 'paid' : 'open', c.id);
        }
      }
    }
    // ensure Ana has the TRX-001 style credit
    // restock history + stock levels
    const insR = db.prepare('INSERT INTO restocks(product_id,qty,cost,supplier,date,expiry_date) VALUES(?,?,?,?,?,?)');
    prods.forEach((p, i) => { for (let k = 0; k < 3; k++) insR.run(p.id, 24 * (1 + Math.floor(r() * 4)), p.cost, SUPPLIERS[(i + k) % 4], ymd(addDays(now, -7 * (k + 1) - Math.floor(r() * 3))), p.expiry_date); });
    const setStock = db.prepare('UPDATE products SET stock=? WHERE name=?');
    const low = { 'Bear Brand Sachet 33g': 0, 'Milo 3-in-1 Sachet': 0, 'Eggs (medium, per pc)': 6, 'Piattos Cheese 40g': 8, 'Datu Puti Vinegar 385ml': 7, 'Surf Powder Sachet': 12, 'Ligo Sardines 155g': 5, 'Mineral Water 500ml': 10 };
    prods.forEach(p => setStock.run(low[p.name] !== undefined ? low[p.name] : Math.max(p.reorder_level + 8, 20 + Math.floor(r() * 90)), p.name));
    // credit requests
    const insQ = db.prepare('INSERT INTO credit_requests(customer_id,items,amount,preferred_due,note,status,owner_note,created_at,decided_at) VALUES(?,?,?,?,?,?,?,?,?)');
    insQ.run(8, 'Rice 5 kg, Eggs x12', 420, ymd(addDays(now, 14)), 'Payday on the 20th', 'pending', '', ymdhms(addDays(now, -1)), null);
    insQ.run(9, 'Noodles x6, Coffee x10', 260, ymd(addDays(now, 7)), '', 'pending', '', ymdhms(addDays(now, -1)), null);
    insQ.run(10, 'Milo, Bear Brand, Soap', 610, ymd(addDays(now, 12)), '', 'pending', '', ymdhms(now), null);
    insQ.run(9, 'Cooking oil, rice 10 kg', 1800, ymd(addDays(now, 3)), '', 'declined', 'Over available credit', ymdhms(addDays(now, -9)), ymdhms(addDays(now, -8)));
    // expenses
    const insE = db.prepare('INSERT INTO expenses(date,category,description,paid_to,amount) VALUES(?,?,?,?,?)');
    for (let d = days; d >= 0; d -= 1) {
      const day = addDays(now, -d); const dt = ymd(day);
      if (d % 3 === 0) insE.run(dt, 'Ice', 'Ice delivery (2 bags)', 'Mang Rudy', 150);
      if (d % 7 === 2) insE.run(dt, 'Supplier purchase', 'Weekly restock', SUPPLIERS[d % 4], 2500 + Math.floor(r() * 1800));
      if (day.getDate() === 4) insE.run(dt, 'Electricity', 'Meralco payment', 'Meralco', 1400 + Math.floor(r() * 300));
      if (d % 9 === 5) insE.run(dt, 'Transport', 'Tricycle fare for restock', 'Kuya Ben', 120);
    }
    // login activity
    const insL = db.prepare('INSERT INTO login_log(user_id,identifier,action,device,result,created_at) VALUES(?,?,?,?,?,?)');
    insL.run(1, 'cora@kitakita.ph', 'Login', 'Desktop · Chrome', 'Success', ymdhms(now));
    insL.run(2, 'marco@kitakita.ph', 'Login', 'Desktop · Edge', 'Success', ymdhms(now));
    insL.run(null, 'unknown', 'Login', 'Phone · Safari', 'Failed', ymdhms(addDays(now, -1)));
  })();
}

module.exports = { seed };
