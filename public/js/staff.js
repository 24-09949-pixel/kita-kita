'use strict';
/* Kita Kita front end — Owner / Cashier pages */
(function () {
  const { api, esc, peso, peso0, bdg, kpi, table, row, field, $, $$, S } = KK, R = KK.staffRoutes, A = ['admin'], AC = ['admin', 'cashier'];
  const isAdmin = () => S.user.role === 'admin';
  const qs = o => Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const custLink = (id, name) => `<a href="#/customers/${id}"><b>${esc(name)}</b></a>`;

  /* ================= DASHBOARD ================= */
  R.dashboard = { title: 'Dashboard Overview', sub: 'Sales, profit, collections and what needs your attention', roles: A, render: async (v) => {
    const d = await api('/dashboard'), k = d.kpi; let mode = 'daily';
    const mix = d.payment_mix, tot = mix.reduce((a, m) => a + m.value, 0), col = { cash: '#16a34a', ewallet: '#2563eb', utang: '#f59e0b' }, nm = { cash: 'Cash', ewallet: 'E-wallet', utang: 'Utang' };
    v.innerHTML = `<div class="ins"><div style="font-size:24px">💡</div><div>${esc(d.insight)}</div></div>
    <div class="row">${kpi("Today's revenue", peso0(k.today), `${k.today_n} sales ${k.today_vs_last_week !== null ? '· ' + KK.pct(k.today_vs_last_week) + ' vs last week' : ''}`, 'k-g', k.today_vs_last_week >= 0 ? 'up' : 'dn')}${kpi('This week', peso0(k.week), `${k.week_n} transactions ${k.week_vs_prev !== null ? '· ' + KK.pct(k.week_vs_prev) : ''}`, 'k-y')}${kpi('This month', peso0(k.month), k.month_vs_prev !== null ? KK.pct(k.month_vs_prev) + ' vs same period last month' : '', 'k-b', k.month_vs_prev >= 0 ? 'up' : 'dn')}
    ${kpi('Profit this week', peso0(k.profit_week), k.margin_week + '% margin', 'k-p')}${kpi('Collections today', peso0(k.collections_today), `${k.collections_n} utang payment${k.collections_n === 1 ? '' : 's'}`, 'k-o')}${kpi('Outstanding utang', peso0(k.outstanding), `${peso0(k.overdue)} overdue · ${k.overdue_customers} customer${k.overdue_customers === 1 ? '' : 's'}`, 'k-r', 'dn')}</div>
    <div class="row"><div class="card grow2" style="flex-basis:420px"><h3>Sales Overview <div class="tabs" id="mt"><button class="on" data-m="daily">Daily</button><button data-m="weekly">Weekly</button><button data-m="monthly">Monthly</button></div></h3><div id="ch"></div><div class="legend" id="lg"></div></div>
    <div class="card grow" style="flex-basis:300px"><h3>Payment Methods <span class="sub">This month</span></h3><div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:center">${KK.donut(mix.map(m => ({ v: m.value, color: col[m.type] })), peso0(tot), 'Total sales')}<div>${mix.map(m => `<div style="margin:9px 0"><span style="color:${col[m.type]}">●</span> ${nm[m.type]} <b>${tot ? Math.round(m.value / tot * 100) : 0}%</b><div class="tag">${peso0(m.value)}</div></div>`).join('')}</div></div></div></div>
    <div class="row"><div class="card grow" style="flex-basis:250px"><h3>Top Selling Products <span class="sub">This week</span></h3>${d.top_sellers.length ? d.top_sellers.map((p, i) => `<div class="li"><span><b class="mu">${i + 1}</b>&nbsp; ${esc(p.name)}</span><b>${p.qty} sold</b></div>`).join('') : '<div class="empty">No sales yet this week.</div>'}</div>
    <div class="card grow" style="flex-basis:250px"><h3>Low Stock &amp; Near Expiry <a class="sub" href="#/inventory">View inventory</a></h3>${d.low_stock.length ? d.low_stock.map(p => `<div class="li"><span>${esc(p.name)}</span><span>${p.status === 'out' ? bdg('Out', 'r') : p.status === 'low' ? bdg(p.stock + ' left', 'y') : ''} ${p.near_expiry ? bdg('Exp ' + KK.fd(p.expiry_date), 'p') : ''}</span></div>`).join('') : '<div class="empty">Stock levels look good 👍</div>'}</div>
    <div class="card grow" style="flex-basis:250px"><h3>Biggest Debtors <a class="sub" href="#/credit">View credit</a></h3>${d.debtors.length ? d.debtors.map(x => `<div class="li"><span>${custLink(x.id, x.name)}<div class="tag">${x.days_left < 0 ? 'Overdue ' + Math.abs(x.days_left) + ' days' : x.days_left === 0 ? 'Due today' : 'Due in ' + x.days_left + ' days'}</div></span><b>${peso0(x.balance)}</b></div>`).join('') : '<div class="empty">No unpaid utang 🎉</div>'}</div>
    <div class="card grow" style="flex-basis:280px"><h3>Recent Transactions <a class="sub" href="#/transactions">View all</a></h3>${table(['ID', 'Time', 'Total', 'Type'], d.recent.map(r => row([`<b>${esc(r.code)}</b>`, KK.ft(r.created_at), peso0(r.total), KK.payBadge(r.payment_type)])), [2])}</div></div>`;
    const draw = () => {
      const c = d.chart; let h, lg;
      if (mode === 'daily') { h = KK.barChart(c.labels, [{ vals: c.current, color: '#0038a8' }, { vals: c.previous, color: '#93c5fd' }]); lg = '<span>■ <b style="color:#0038a8">This week</b></span><span>■ <b style="color:#60a5fa">Previous week</b></span>'; }
      else { const a = mode === 'weekly' ? c.weekly : c.monthly; h = KK.barChart(a.map(x => mode === 'weekly' ? 'Wk ' + x.label : x.label), [{ vals: a.map(x => x.v), color: '#0038a8' }]); lg = `<span>${mode === 'weekly' ? 'Last 4 weeks (Mon start)' : 'Last 3 months'}</span>`; }
      $('#ch', v).innerHTML = h; $('#lg', v).innerHTML = lg;
    };
    $$('#mt button', v).forEach(b => b.onclick = () => { mode = b.dataset.m; $$('#mt button', v).forEach(x => x.classList.toggle('on', x === b)); draw(); }); draw();
  } };

  /* ================= INSIGHTS ================= */
  R.insights = { title: 'Insights & Analytics', sub: 'Plain-language tips, profit analysis, trends and forecasts', roles: A, render: async (v) => {
    const d = await api('/insights'), tc = { best: ['#fef3c7', '#92400e', '🔥 BEST SELLER'], peak: ['#dcfce7', '#166534', '📈 PEAK TIME'], slow: ['#ede9fe', '#6d28d9', '🐢 SLOW MOVER'], price: ['#dbeafe', '#1d4ed8', '💰 PRICING TIP'] }, t = d.trend;
    v.innerHTML = `<div class="row">${d.tips.map(x => `<div class="tip" style="background:${tc[x.kind][0]};color:#1f2937"><b style="color:${tc[x.kind][1]}">${tc[x.kind][2]}</b>${esc(x.text)}</div>`).join('') || '<div class="note">Record some sales to unlock insights.</div>'}</div>
    <div class="row"><div class="card grow2" style="flex-basis:420px"><h3>Sales Trend &amp; Next-Week Forecast <span class="sub">Last 8 weeks + next 7 days</span></h3>${KK.lineChart(t.labels.concat(['Next 7d']), t.actual, t.forecast)}<div class="legend"><span><b style="color:#0038a8">━</b> Actual (rolling 7-day sales)</span><span><b style="color:#ce1126">╍</b> Forecast: <b>${peso0(t.forecast)}</b> ${t.change_pct !== null ? `(${KK.pct(t.change_pct)} vs last 7 days)` : ''}</span></div></div>
    <div class="card grow" style="flex-basis:340px"><h3>Peak Selling Hours &amp; Days <span class="sub">Sales count, last 8 weeks</span></h3>${KK.heat(d.heatmap.grid, d.heatmap.hours, d.heatmap.days)}</div></div>
    <div class="row"><div class="card grow" style="flex-basis:280px"><h3>Profit per Category <span class="sub">Last 7 days</span></h3>${KK.hbars(d.profit_category.map(c => ({ name: c.name, v: c.profit })))}</div>
    <div class="card grow" style="flex-basis:340px"><h3>Profit per Item <span class="sub">Selling price − cost</span></h3>${table(['Item', 'Sold', 'Profit'], d.profit_item.map(p => row([esc(p.name), p.qty, `<b>${peso0(p.profit)}</b>`])), [1, 2])}</div>
    <div class="card grow" style="flex-basis:280px"><h3>Best Sellers vs Slow Movers</h3><div class="tag" style="font-weight:700;color:#166534">BEST SELLERS</div>${d.best.map(p => `<div class="li"><span>${esc(p.name)}</span><b>${p.qty}</b></div>`).join('')}<div class="tag" style="font-weight:700;color:#b91c1c;margin-top:10px">SLOW MOVERS</div>${d.slow.map(p => `<div class="li"><span>${esc(p.name)}</span><b>${p.qty}</b></div>`).join('')}</div></div>`;
  } };

  /* ================= POS ================= */
  R.pos = { title: 'Point of Sale', sub: 'Scan barcodes, enter quantities, and complete purchases', roles: AC, render: async (v, ctx) => {
    let products = (await api('/products?limit=500')).items, customers = (await api('/customers?limit=200')).items, ptype = 'cash'; const cart = new Map(), cats = [...new Set(products.map(p => p.category))].sort();
    const byId = id => products.find(p => p.id === id);
    v.innerHTML = `<div class="row" style="align-items:flex-start"><div class="grow2" style="flex-basis:460px;display:flex;flex-direction:column;gap:12px"><div class="toolbar"><input class="inp search" id="scan" placeholder="▥ Scan barcode or search by name / SKU…  (press Enter to add)" autocomplete="off" style="max-width:none"><select class="inp" id="cat" style="max-width:190px"><option value="">All categories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></div><div class="pgrid" id="grid"></div></div>
    <div class="card" id="cartcard" style="flex:1 1 380px;max-width:520px"><h3>Current Sale <span class="sub">${esc(S.user.name)}</span></h3><div id="cartlist"></div>
    <div class="li"><span>Subtotal</span><b id="sub">₱0.00</b></div><div class="li"><span>Discount (₱)</span><input class="inp" id="disc" type="number" min="0" step="0.01" value="0" style="width:110px;text-align:right"></div><div class="li" style="font-size:20px"><b>Total</b><b id="tot" style="color:var(--g)">₱0.00</b></div>
    <label class="lab" for="cust">Customer</label><select class="inp" id="cust"><option value="">Walk-in customer</option>${customers.map(c => `<option value="${c.id}">${esc(c.name)}${c.balance > 0 ? ' · owes ' + peso0(c.balance) : ''}</option>`).join('')}</select><div id="custinfo" class="tag" style="margin-top:4px"></div>
    <div class="tabs" id="ptabs" style="margin:12px 0 4px"><button class="on" data-t="cash">Cash</button><button data-t="ewallet">E-wallet</button><button data-t="utang">Utang</button></div><div id="payfields"></div><div id="hint" class="note" style="margin-top:10px" hidden></div>
    <div style="display:flex;gap:10px;margin-top:14px"><button class="btn o" id="clear">Cancel sale</button><button class="btn g grow" id="done" disabled>Complete Payment</button></div></div></div>
    <button class="btn g cartbar no-print" id="gocart">🛒 View cart</button><div class="note">Scanning only adds items to the cart. Stock is deducted by the server <b>after a successful checkout</b> — a cancelled sale never changes inventory.</div>`;
    const grid = $('#grid', v), scan = $('#scan', v);
    const filtered = () => { const s = scan.value.trim().toLowerCase(), c = $('#cat', v).value; return products.filter(p => (!c || p.category === c) && (!s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || (p.barcode || '').includes(s))); };
    const drawGrid = () => { const l = filtered(); grid.innerHTML = l.slice(0, 60).map(p => `<button class="pcard" data-id="${p.id}" ${p.stock === 0 ? 'disabled' : ''}><div class="ph" style="background:${['#fef3c7', '#fee2e2', '#dcfce7', '#ede9fe', '#dbeafe', '#fce7f3'][p.id % 6]}">${esc(p.name[0])}</div><b class="n">${esc(p.name)}</b><span class="tag">${esc(p.category)} · ${p.stock} in stock</span><b>${peso(p.price)}</b></button>`).join('') || '<div class="empty" style="grid-column:1/-1">No products match.</div>'; };
    const add = p => { if (!p) return; if (p.stock <= 0) return KK.toast(`${p.name} is out of stock`, 'bad'); const it = cart.get(p.id) || { p, qty: 0 }; if (it.qty + 1 > p.stock) return KK.toast(`Only ${p.stock} ${p.name} in stock`, 'bad'); it.qty++; cart.set(p.id, it); drawCart(); };
    const totals = () => { const sub = [...cart.values()].reduce((a, i) => a + i.p.price * i.qty, 0), disc = Math.min(Math.max(+$('#disc', v).value || 0, 0), sub); return { sub: Math.round(sub * 100) / 100, disc, total: Math.round((sub - disc) * 100) / 100 }; };
    const drawCart = () => {
      const l = [...cart.values()]; $('#cartlist', v).innerHTML = l.length ? table(['Item', 'Price', 'Qty', 'Total', ''], l.map(i => row([`<b>${esc(i.p.name)}</b>`, peso(i.p.price), `<span style="white-space:nowrap"><button class="btn s o" data-dec="${i.p.id}" aria-label="Decrease">−</button> <b>${i.qty}</b> <button class="btn s o" data-inc="${i.p.id}" aria-label="Increase">+</button></span>`, peso(i.p.price * i.qty), `<button class="btn s o" data-del="${i.p.id}" aria-label="Remove" style="color:var(--r)">✕</button>`])), [1, 2, 3, 4], { cls: 'nowrap-sm' }) : '<div class="empty">Cart is empty. Scan or tap a product.</div>';
      summary();
    };
    const custObj = () => customers.find(c => String(c.id) === $('#cust', v).value);
    const validate = () => {
      const t = totals(); if (!cart.size) return 'Add at least one item.';
      if (ptype === 'cash') { const r = +$('#recv', v).value; if (!(r >= t.total)) return `Amount received must be at least ${peso(t.total)}.`; }
      if (ptype === 'ewallet' && ($('#ref', v).value.trim().length < 4)) return 'Enter the e-wallet reference number.';
      if (ptype === 'utang') { const c = custObj(); if (!c) return 'Select the customer who will owe this utang.'; const due = $('#due', v).value; if (!due || due < KK.ymd()) return 'Choose a due date that is not in the past.'; const dn = +$('#down', v).value || 0; if (dn < 0 || dn >= t.total) return 'Down payment must be less than the total.'; }
      return '';
    };
    const summary = () => {
      const cnt = [...cart.values()].reduce((a, i) => a + i.qty, 0); $('#gocart', v).textContent = `🛒 View cart · ${cnt} item${cnt === 1 ? '' : 's'} · ${peso(totals().total)}`;
      const t = totals(); $('#sub', v).textContent = peso(t.sub); $('#tot', v).textContent = peso(t.total);
      if (ptype === 'cash') { const r = +$('#recv', v).value || 0; $('#chg', v).textContent = r >= t.total ? peso(r - t.total) : '—'; }
      let hint = ''; const c = custObj(); const ci = $('#custinfo', v); ci.textContent = c ? `Balance ${peso(c.balance)} · limit ${peso0(c.credit_limit)} · available ${peso0(c.available)}` : '';
      if (ptype === 'utang' && c) { const add = t.total - (+$('#down', v).value || 0); if (c.balance + add > c.credit_limit + 0.001) hint = `⚠ This purchase would exceed ${c.name}'s credit limit (${peso(c.balance + add)} / ${peso(c.credit_limit)}).` + (isAdmin() ? '' : ' Owner approval required.'); }
      const h = $('#hint', v); h.hidden = !hint; h.className = 'note red'; h.innerHTML = esc(hint) + (hint && isAdmin() ? '<label class="chk"><input type="checkbox" id="ovr"> Approve anyway (owner override)</label>' : '');
      const err = validate(); const b = $('#done', v); b.disabled = !!err; b.title = err; b.textContent = ptype === 'utang' ? 'Record Utang' : 'Complete Payment';
    };
    const payFields = () => {
      const f = $('#payfields', v), t = totals();
      f.innerHTML = ptype === 'cash' ? `<label class="lab" for="recv">Amount received</label><input class="inp" id="recv" type="number" min="0" step="0.01" placeholder="0.00"><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><button class="btn s o" data-q="exact">Exact</button>${[50, 100, 200, 500, 1000].map(n => `<button class="btn s o" data-q="${n}">₱${n}</button>`).join('')}</div><div class="li" style="margin-top:6px"><span>Change</span><b id="chg">—</b></div>`
        : ptype === 'ewallet' ? `<label class="lab" for="ref">E-wallet reference no.</label><input class="inp" id="ref" placeholder="e.g. GCash ref number" autocomplete="off">`
        : `<div class="fgrid"><div><label class="lab" for="due">Due date</label><input class="inp" id="due" type="date" min="${KK.ymd()}" value="${KK.addDays(null, 14)}"></div><div><label class="lab" for="down">Down payment (₱)</label><input class="inp" id="down" type="number" min="0" step="0.01" value="0"></div></div>`;
      summary();
    };
    drawGrid(); payFields(); drawCart();
    scan.addEventListener('input', drawGrid); $('#cat', v).addEventListener('change', drawGrid);
    scan.addEventListener('keydown', async e => {
      if (e.key !== 'Enter') return; e.preventDefault(); const s = scan.value.trim(); if (!s) return; const lc = s.toLowerCase();
      let p = products.find(x => x.barcode === s || x.sku.toLowerCase() === lc); const l = filtered();
      if (!p && l.length === 1) p = l[0];
      if (!p) { try { p = await api('/products/code/' + encodeURIComponent(s)); const i = products.findIndex(x => x.id === p.id); if (i >= 0) products[i] = p; } catch (x) { return KK.toast(l.length ? 'Several products match. Tap the one you want.' : 'No product found for that barcode / SKU', 'bad'); } }
      add(p); scan.value = ''; drawGrid(); scan.focus();
    });
    grid.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) add(byId(+b.dataset.id)); });
    $('#cartlist', v).addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; const id = +(b.dataset.inc || b.dataset.dec || b.dataset.del), it = cart.get(id); if (!it) return;
      if (b.dataset.inc) { if (it.qty + 1 > it.p.stock) return KK.toast(`Only ${it.p.stock} in stock`, 'bad'); it.qty++; } else if (b.dataset.dec) { it.qty--; if (it.qty <= 0) cart.delete(id); } else cart.delete(id); drawCart();
    });
    $('#ptabs', v).addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; ptype = b.dataset.t; $$('#ptabs button', v).forEach(x => x.classList.toggle('on', x === b)); payFields(); });
    $('#payfields', v).addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (!b) return; $('#recv', v).value = b.dataset.q === 'exact' ? totals().total : b.dataset.q; summary(); });
    v.addEventListener('input', e => { if (e.target.matches('#disc,#recv,#ref,#due,#down')) summary(); }); v.addEventListener('change', e => { if (e.target.matches('#cust,#due,#ovr')) summary(); });
    $('#clear', v).onclick = async () => { if (!cart.size || await KK.confirm('Cancel this sale and clear the cart?', 'Cancel sale', true)) { cart.clear(); $('#disc', v).value = 0; drawCart(); payFields(); } };
    $('#done', v).onclick = async () => {
      const btn = $('#done', v), t = totals(); if (validate()) return; btn.disabled = true; btn.textContent = 'Processing…';
      const body = { items: [...cart.values()].map(i => ({ product_id: i.p.id, qty: i.qty })), payment_type: ptype, discount: t.disc, customer_id: $('#cust', v).value || null };
      if (ptype === 'cash') body.amount_received = +$('#recv', v).value; if (ptype === 'ewallet') body.reference = $('#ref', v).value.trim();
      if (ptype === 'utang') { body.due_date = $('#due', v).value; body.down_payment = +$('#down', v).value || 0; const o = $('#ovr', v); body.override = !!(o && o.checked); }
      try {
        const sale = await api('/sales', { method: 'POST', body }); KK.toast(`${sale.code} saved`, 'ok'); cart.clear(); $('#disc', v).value = 0;
        [products, customers] = [(await api('/products?limit=500')).items, (await api('/customers?limit=200')).items]; const sel = $('#cust', v); sel.innerHTML = `<option value="">Walk-in customer</option>${customers.map(c => `<option value="${c.id}">${esc(c.name)}${c.balance > 0 ? ' · owes ' + peso0(c.balance) : ''}</option>`).join('')}`;
        drawGrid(); drawCart(); payFields(); KK.showReceipt(sale, { canVoid: isAdmin(), onVoid: () => KK.route() }); KK.refreshAlerts();
      } catch (e) { KK.toast(e.message, 'bad'); summary(); }
    };
    $('#gocart', v).onclick = () => $('#cartcard', v).scrollIntoView({ behavior: 'smooth', block: 'start' });
    scan.focus();
  } };

  /* ================= INVENTORY ================= */
  function productModal(p, cats, done) {
    const m = KK.modal(p ? 'Edit Product' : 'Add Product', `<form id="pf">${field('Product name', 'name', p ? p.name : '', { req: true })}<div class="fgrid">${field('Category', 'category', p ? p.category : '', { req: true, ph: 'e.g. Snacks' })}${field('SKU', 'sku', p ? p.sku : '', { req: true })}${field('Barcode', 'barcode', p ? p.barcode || '' : '', { ph: 'Scan or type' })}</div>
    <div class="fgrid">${field('Cost price (₱)', 'cost', p ? p.cost : '', { type: 'number', step: '0.01', min: 0, req: true })}${field('Selling price (₱)', 'price', p ? p.price : '', { type: 'number', step: '0.01', min: 0, req: true })}${field('Margin (auto)', 'margin', '', { ro: true })}</div>
    <div class="fgrid">${field('Stock on hand', 'stock', p ? p.stock : 0, { type: 'number', min: 0, step: 1, req: true })}${field('Reorder level', 'reorder_level', p ? p.reorder_level : 10, { type: 'number', min: 0, step: 1, req: true })}${field('Expiry date (optional)', 'expiry_date', p ? p.expiry_date || '' : '', { type: 'date' })}</div>
    <button class="btn g block" type="submit" style="margin-top:16px">${p ? 'Save changes' : 'Save product'}</button></form>`, { wide: true });
    const f = $('#pf', m), dl = document.createElement('datalist'); dl.id = 'cl'; dl.innerHTML = cats.map(c => `<option value="${esc(c)}">`).join(''); f.appendChild(dl); f.category.setAttribute('list', 'cl');
    const mg = () => { const c = +f.cost.value, pr = +f.price.value; f.margin.value = f.cost.value !== '' && f.price.value !== '' ? `₱${(pr - c).toFixed(2)} · ${pr ? ((pr - c) / pr * 100).toFixed(1) : 0}%` : ''; }; f.cost.oninput = f.price.oninput = mg; mg();
    KK.submit(f, async d => { delete d.margin; const r = await api(p ? `/products/${p.id}` : '/products', { method: p ? 'PUT' : 'POST', body: d }); m.remove(); KK.toast(p ? 'Product updated' : 'Product added', 'ok'); done(r); });
  }
  async function restockModal(p, done) {
    const hist = await api(`/products/${p.id}/restocks`);
    const m = KK.modal('Restock · ' + p.name, `<p class="tag" style="margin:10px 0">Current stock: <b>${p.stock}</b> · Last restock: ${KK.fd(p.last_restock_date)}</p><form id="rf"><div class="fgrid">${field('Quantity added', 'qty', '', { type: 'number', min: 1, step: 1, req: true })}${field('Restock date', 'date', KK.ymd(), { type: 'date', req: true })}${field('Cost price (₱)', 'cost', p.cost, { type: 'number', step: '0.01', min: 0, req: true })}${field('Supplier', 'supplier', '')}${field('Expiry of new batch', 'expiry_date', '', { type: 'date' })}</div><button class="btn g block" type="submit" style="margin-top:16px">Confirm restock</button></form>
    <h4 style="margin:18px 0 6px">Restock history</h4>${table(['Date', 'Qty', 'Cost', 'Supplier'], hist.map(h => row([KK.fd(h.date), h.qty, peso(h.cost), esc(h.supplier || '—')])), [1, 2])}`, { wide: true });
    KK.submit($('#rf', m), async d => { await api(`/products/${p.id}/restock`, { method: 'POST', body: d }); m.remove(); KK.toast('Stock updated', 'ok'); done(); });
  }
  R.inventory = { title: 'Inventory Management', sub: 'Product registration, barcode, cost, selling price and stock', roles: AC, render: async (v, ctx) => {
    const st = { q: '', category: '', status: ctx.params.get('status') || '', page: 0 }, LIM = 12, cats = await api('/categories');
    v.innerHTML = `<div id="kp" class="row"></div><div class="toolbar"><input class="inp search" id="q" placeholder="⌕ Search name / SKU / barcode…"><select class="inp" id="c"><option value="">All categories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select><select class="inp" id="s"><option value="">All status</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option><option value="near_expiry">Near expiry</option></select><span class="grow"></span>${isAdmin() ? '<button class="btn" id="add">+ Add Product</button>' : ''}</div><div class="card" style="padding:6px 8px" id="tbl"></div>`;
    $('#s', v).value = st.status; const adm = isAdmin();
    const load = async () => {
      const [sm, r] = await Promise.all([api('/products/summary'), api('/products?' + qs({ q: st.q, category: st.category, status: st.status, limit: LIM, offset: st.page * LIM }))]);
      $('#kp', v).innerHTML = kpi('Total products', sm.total, sm.categories + ' categories') + kpi('Low stock', sm.low, 'Below reorder level', '', 'dn') + kpi('Out of stock', sm.out, 'Needs restocking', '', 'dn') + kpi('Near expiry', sm.near_expiry, 'Within 30 days') + (adm ? kpi('Stock value (cost)', peso0(sm.value_cost), 'Retail ' + peso0(sm.value_retail)) : '');
      const heads = ['Product', 'SKU / Barcode', 'Category'].concat(adm ? ['Cost'] : [], ['Price', 'Stock', 'Reorder', 'Expiry', 'Last restock', 'Status'], adm ? ['Actions'] : []), right = adm ? [3, 4, 5, 6] : [3, 4, 5];
      const rowsHtml = r.items.map(p => row([`${KK.thumb(p.name)}<b>${esc(p.name)}</b>`, `${esc(p.sku)}<div class="tag">${esc(p.barcode || '')}</div>`, esc(p.category)].concat(adm ? [peso(p.cost)] : [], [peso(p.price), `<b style="color:${p.status === 'out' ? '#dc2626' : p.status === 'low' ? '#d97706' : 'inherit'}">${p.stock}</b>`, p.reorder_level, p.expiry_date ? KK.fd(p.expiry_date) : '—', KK.fd(p.last_restock_date), KK.stockBadge(p) + (p.near_expiry ? ' ' + bdg('Near expiry', 'p') : '')], adm ? [`<span style="white-space:nowrap"><button class="btn s o" data-e="${p.id}">Edit</button> <button class="btn s o" data-r="${p.id}">Restock</button> <button class="btn s o" data-d="${p.id}" style="color:var(--r)">Delete</button></span>`] : [])));
      $('#tbl', v).innerHTML = table(heads, rowsHtml, right, { cls: 'nowrap-sm', empty: 'No products match your filters.' }) + KK.pager(r.total, st.page * LIM, LIM);
      $('#tbl', v)._items = r.items;
    };
    const reload = () => load().catch(e => KK.toast(e.message, 'bad')); await load();
    $('#q', v).addEventListener('input', KK.debounce(() => { st.q = $('#q', v).value.trim(); st.page = 0; reload(); })); $('#c', v).onchange = () => { st.category = $('#c', v).value; st.page = 0; reload(); }; $('#s', v).onchange = () => { st.status = $('#s', v).value; st.page = 0; reload(); };
    const add = $('#add', v); if (add) add.onclick = () => productModal(null, cats, reload);
    $('#tbl', v).addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return; const items = $('#tbl', v)._items || [];
      if (b.dataset.pg) { st.page = +b.dataset.pg - 1; return reload(); }
      const find = id => items.find(p => p.id === +id);
      if (b.dataset.e) productModal(find(b.dataset.e), cats, reload);
      if (b.dataset.r) restockModal(find(b.dataset.r), () => { reload(); KK.refreshAlerts(); }).catch(x => KK.toast(x.message, 'bad'));
      if (b.dataset.d) { const p = find(b.dataset.d); if (await KK.confirm(`Delete "${p.name}"? It will be hidden from the POS. Past sales are kept.`, 'Delete', true)) { try { await api('/products/' + p.id, { method: 'DELETE' }); KK.toast('Product deleted', 'ok'); reload(); } catch (x) { KK.toast(x.message, 'bad'); } } }
    });
  } };

  /* ================= CUSTOMERS ================= */
  KK.payModal = (c, credits, done) => {
    const open = credits.filter(x => x.status === 'open'); if (!open.length) return KK.toast('This customer has no unpaid utang', 'bad'); const owed = open.reduce((a, x) => a + x.balance, 0);
    const m = KK.modal('Record Payment · ' + c.name, `<form id="pay"><div class="note grn" style="margin-top:12px">Balance owed: <b>${peso(owed)}</b></div>${field('Apply to', 'credit_id', '', { select: [['', 'Oldest utang first (automatic)']].concat(open.map(x => [x.id, `${x.code || 'CR-' + x.id} · ${peso(x.balance)} · due ${KK.fd(x.due_date)}`])) })}
    <div class="fgrid">${field('Amount paid (₱)', 'amount', owed.toFixed(2), { type: 'number', step: '0.01', min: 0.01, req: true })}${field('Method', 'method', 'cash', { select: [['cash', 'Cash'], ['ewallet', 'E-wallet']] })}</div><div id="rf" hidden>${field('E-wallet reference', 'reference', '')}</div>${field('New due date for the remaining balance (optional)', 'new_due_date', '', { type: 'date', min: KK.ymd() })}<div class="tag" id="rem" style="margin-top:8px"></div><button class="btn g block" type="submit" style="margin-top:14px">Save payment</button></form>`);
    const f = $('#pay', m), sel = () => f.credit_id.value ? open.find(x => x.id === +f.credit_id.value).balance : owed;
    const upd = () => { $('#rf', m).hidden = f.method.value !== 'ewallet'; const a = +f.amount.value || 0; $('#rem', m).textContent = a > 0 ? `Remaining after payment: ${peso(Math.max(0, sel() - a))}` : ''; };
    f.credit_id.onchange = () => { f.amount.value = sel().toFixed(2); upd(); }; f.method.onchange = upd; f.amount.oninput = upd; upd();
    KK.submit(f, async d => { const body = { customer_id: c.id, amount: +d.amount, method: d.method, reference: d.reference || '', new_due_date: d.new_due_date || null }; if (d.credit_id) body.credit_id = +d.credit_id; const r = await api('/payments', { method: 'POST', body }); m.remove(); KK.toast(`Payment saved. Remaining balance: ${peso(r.balance)}`, 'ok'); done(); });
  };
  KK.editDueModal = (cr, done) => {
    const m = KK.modal('Set due date', `<form id="df"><p class="tag" style="margin:12px 0">Balance ${peso(cr.balance)} · currently due ${KK.fd(cr.due_date)}</p>${field('New due date', 'due_date', cr.due_date, { type: 'date', req: true })}<button class="btn g block" type="submit" style="margin-top:14px">Save</button></form>`);
    KK.submit($('#df', m), async d => { await api('/credits/' + cr.id, { method: 'PUT', body: { due_date: d.due_date } }); m.remove(); KK.toast('Due date updated', 'ok'); done(); });
  };
  function customerModal(c, done) {
    const m = KK.modal(c ? 'Edit Customer' : 'Add Customer', `<form id="cf">${field('Full name', 'name', c ? c.name : '', { req: true })}<div class="fgrid">${field('Mobile number', 'phone', c ? c.phone || '' : '', { type: 'tel', ph: '09XX XXX XXXX' })}${field('Credit limit (₱)', 'credit_limit', c ? c.credit_limit : 1000, { type: 'number', min: 0, step: '50', ro: !isAdmin() })}</div>${field('Address', 'address', c ? c.address : '')}${!isAdmin() ? '<p class="tag" style="margin-top:8px">Only the owner can change a credit limit.</p>' : ''}<button class="btn g block" type="submit" style="margin-top:16px">Save customer</button></form>`);
    KK.submit($('#cf', m), async d => { const r = await api(c ? '/customers/' + c.id : '/customers', { method: c ? 'PUT' : 'POST', body: d }); m.remove(); KK.toast('Customer saved', 'ok'); done(r); });
  }
  const custStatus = c => c.balance <= 0 ? bdg('No balance', 'x') : c.overdue ? bdg(`Overdue ${Math.abs(c.days_to_due)} d`, 'r') : c.days_to_due <= 7 ? bdg(`Due in ${c.days_to_due} d`, 'y') : bdg(c.days_to_due + ' days left', 'b');
  R.customers = { title: 'Customer Management', sub: 'Customer profiles and credit records', roles: AC, render: async (v, ctx) => ctx.args[0] ? profile(v, ctx.args[0]) : list(v) };
  async function list(v) {
    const st = { q: '', status: '', sort: 'balance' };
    v.innerHTML = `<div id="kp" class="row"></div><div class="toolbar"><input class="inp search" id="q" placeholder="⌕ Search name or phone…"><select class="inp" id="s"><option value="">All customers</option><option value="balance">With balance</option><option value="overdue">Overdue</option><option value="clear">No balance</option></select><select class="inp" id="o"><option value="balance">Sort: Highest balance</option><option value="name">Sort: Name</option></select><span class="grow"></span><button class="btn" id="add">+ Add Customer</button></div><div class="card" id="tbl" style="padding:6px 8px"></div>`;
    const load = async () => {
      const r = await api('/customers?' + qs(st)), s = r.summary;
      $('#kp', v).innerHTML = kpi('Total customers', s.count, s.with_balance + ' with balance') + kpi('Total utang outstanding', peso0(s.outstanding), '', 'k-r', 'dn') + kpi('Overdue customers', s.overdue_customers, 'Need a reminder', 'k-o') + kpi('New this month', s.new_month, 'Added customers');
      $('#tbl', v).innerHTML = table(['Customer', 'Phone', 'Balance owed', 'Next due', 'Credit status', 'Limit', 'Last purchase', 'Portal', ''], r.items.map(c => row([`${KK.thumb(c.name)}<b>${esc(c.name)}</b>`, esc(c.phone || '—'), `<b>${peso(c.balance)}</b>`, c.next_due ? KK.fd(c.next_due) : '—', custStatus(c), peso0(c.credit_limit), c.last_purchase ? KK.fd(c.last_purchase) : '—', c.has_portal ? bdg('Active', 'g') : bdg('None', 'x'), `<button class="btn s o" data-id="${c.id}">View profile</button>`])), [2, 5], { cls: 'nowrap-sm', empty: 'No customers match your search.' }) + `<div class="pager"><span>${r.total} customer${r.total === 1 ? '' : 's'}</span></div>`;
    };
    await load(); const reload = () => load().catch(e => KK.toast(e.message, 'bad'));
    $('#q', v).addEventListener('input', KK.debounce(() => { st.q = $('#q', v).value.trim(); reload(); })); $('#s', v).onchange = e => { st.status = e.target.value; reload(); }; $('#o', v).onchange = e => { st.sort = e.target.value; reload(); };
    $('#add', v).onclick = () => customerModal(null, reload); $('#tbl', v).addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) KK.go('customers/' + b.dataset.id); });
  }
  async function profile(v, id) {
    const d = await api('/customers/' + id), c = d.customer, reload = () => KK.route(); const sub = document.getElementById('sub'); if (sub) sub.textContent = 'Customers › ' + c.name;
    const open = d.credits.filter(x => x.status === 'open'), od = open.filter(x => x.state === 'overdue');
    v.innerHTML = `<div><a href="#/customers">‹ Back to customers</a></div><div class="row" style="align-items:flex-start"><div style="flex:0 0 330px;max-width:100%;display:flex;flex-direction:column;gap:14px"><div class="card" style="text-align:center"><div class="av" style="width:64px;height:64px;font-size:24px;margin:0 auto 8px;background:var(--g3);color:var(--g)">${esc(KK.initials(c.name))}</div><b style="font-size:17px">${esc(c.name)}</b><div class="tag">Customer since ${KK.fd(c.created_at)}</div><div style="margin:8px 0">${custStatus(c)}</div><div style="text-align:left;line-height:1.9;border-top:1px solid var(--bd);padding-top:8px">📞 ${esc(c.phone || '—')}<br>📍 ${esc(c.address || '—')}<br>Credit limit: <b>${peso(c.credit_limit)}</b><br>Available credit: <b>${peso(c.available)}</b><br>Portal login: ${c.has_portal ? bdg('Active', 'g') : bdg('None', 'x')}</div></div>
    <div class="card"><h3>Credit Summary</h3><div class="li"><span>Total borrowed (lifetime)</span><b>${peso(d.lifetime.borrowed)}</b></div><div class="li"><span>Total paid</span><b>${peso(d.lifetime.paid)}</b></div><div class="li"><span>Outstanding balance</span><b class="${c.balance > 0 ? 'dn' : ''}">${peso(c.balance)}</b></div><div class="li"><span>Open credits</span><b>${open.length}</b></div></div>
    <div class="card"><h3>Actions</h3><div style="display:flex;flex-direction:column;gap:8px"><button class="btn g" id="pay" ${open.length ? '' : 'disabled'}>Record Payment</button><button class="btn" id="rem" ${open.length ? '' : 'disabled'}>Payment Reminder Message</button><button class="btn o" id="edit">Edit customer</button>${isAdmin() ? '<button class="btn o" id="pw">' + (c.has_portal ? 'Reset portal password' : 'Create portal login') + '</button>' : ''}</div></div></div>
    <div style="flex:1 1 480px;display:flex;flex-direction:column;gap:14px;min-width:0"><div class="card"><h3>Credit Records <span class="sub">Utang transactions</span></h3>${table(['Transaction', 'Borrowed', 'Amount', 'Paid', 'Balance', 'Due date', 'Status', ''], d.credits.map(x => row([`<b>${esc(x.code || 'CR-' + x.id)}</b>`, KK.fd(x.borrowed_on), peso(x.amount), peso(x.paid), peso(x.balance), KK.fd(x.due_date), KK.creditBadge(x), isAdmin() && x.status === 'open' ? `<button class="btn s o" data-due="${x.id}">Due date</button>` : ''])), [2, 3, 4], { cls: 'nowrap-sm', empty: 'No utang records yet.' })}</div>
    <div class="card"><h3>Payment History <span class="sub">Partial payments accepted</span></h3>${table(['Date', 'Applied to', 'Method', 'Amount', 'Status', 'Recorded by'], d.payments.map(p => row([KK.fdt(p.created_at), esc(p.code), p.method === 'ewallet' ? 'E-wallet' : 'Cash', `<b>${peso(p.amount)}</b>`, p.status === 'confirmed' ? bdg('Confirmed', 'g') : p.status === 'pending' ? bdg('Pending', 'y') : bdg('Rejected', 'r'), esc(p.recorded_by_name || 'Customer portal')])), [3], { cls: 'nowrap-sm', empty: 'No payments recorded yet.' })}</div></div></div>`;
    d.credits.forEach(x => { x.code = x.code || 'CR-' + x.id; });
    $('#pay', v).onclick = () => KK.payModal(c, d.credits, reload); $('#edit', v).onclick = () => customerModal(c, reload);
    $('#rem', v).onclick = () => { const msg = `Hello ${c.name.split(' ')[0]}! This is ${S.cfg.store.name}. Friendly reminder: your utang balance is ${peso(c.balance)}${od.length ? `, with ${peso(od.reduce((a, x) => a + x.balance, 0))} already past due` : ''}. Next due date: ${KK.fd(c.next_due)}. Salamat po!`; const m = KK.modal('Payment reminder', `<p class="tag" style="margin:12px 0">Copy this message and send it by SMS or Messenger.</p><textarea class="inp" rows="6" readonly>${esc(msg)}</textarea><button class="btn g block" id="cp" style="margin-top:12px">Copy message</button>`); $('#cp', m).onclick = () => (navigator.clipboard ? navigator.clipboard.writeText(msg) : Promise.reject()).then(() => KK.toast('Message copied', 'ok'), () => { $('textarea', m).select(); KK.toast('Select and copy the text manually', ''); }); };
    const pw = $('#pw', v); if (pw) pw.onclick = () => { const m = KK.modal('Customer portal login', `<form id="pf"><p class="tag" style="margin:12px 0">The customer logs in with their mobile number (<b>${esc(c.phone || 'add a number first')}</b>) and this password.</p>${field('Password (min. 6 characters)', 'password', '', { type: 'password', req: true, ac: 'new-password' })}<button class="btn g block" type="submit" style="margin-top:14px">Save login</button></form>`); KK.submit($('#pf', m), async dd => { await api(`/customers/${c.id}/portal-account`, { method: 'POST', body: dd }); m.remove(); KK.toast('Portal login saved', 'ok'); reload(); }); };
    v.addEventListener('click', e => { const b = e.target.closest('[data-due]'); if (b) KK.editDueModal(d.credits.find(x => x.id === +b.dataset.due), reload); });
  }

  /* ================= CREDIT ================= */
  R.credit = { title: 'Credit Management', sub: 'Approve requests, record credit purchases, set due dates, and record payments', roles: AC, render: async (v, ctx) => {
    let tab = ctx.params.get('tab') || 'active'; const adm = isAdmin();
    const data = await api('/credits'), s = data.summary; let credits = data.items;
    v.innerHTML = `<div class="row">${kpi('Total amount owed', peso0(s.owed), `Across ${s.customers} customers`, 'k-b')}${kpi('Total past due', peso0(s.past_due), `${s.past_due_customers} customers overdue`, 'k-p', 'dn')}${kpi('Due within 7 days', peso0(s.due_7), '')}${kpi('Collected this month', peso0(s.collected_month), `${s.payments_month} payments recorded`, 'k-g', 'up')}</div><div><div class="tabs" id="tabs"><button data-t="active">Active utang</button><button data-t="requests">Credit requests</button><button data-t="payments">Payments</button></div></div><div id="body"></div>`;
    const reload = () => KK.route();
    const draw = async () => {
      $$('#tabs button', v).forEach(b => b.classList.toggle('on', b.dataset.t === tab)); const body = $('#body', v);
      if (tab === 'active') {
        body.innerHTML = `<div class="card" style="padding:6px 8px">${table(['Customer', 'Transaction', 'Amount', 'Borrowed', 'Due date', 'Due status', 'Paid', 'Balance', 'Reminder', ''], credits.map(c => row([custLink(c.customer_id, c.customer_name), esc(c.code), peso(c.amount), KK.fd(c.borrowed_on), KK.fd(c.due_date), KK.creditBadge(c), peso(c.paid), `<b>${peso(c.balance)}</b>`, adm ? `<button class="btn s o" data-fu="${c.id}">${c.follow_up ? '<span style="color:#d97706">● ON</span>' : '○ OFF'}</button>` : (c.follow_up ? '● ON' : '○ OFF'), `<span style="white-space:nowrap"><button class="btn s g" data-pay="${c.id}">Pay</button>${adm ? ` <button class="btn s o" data-due="${c.id}">Due date</button>` : ''}</span>`]), [2, 6, 7]), [2, 6, 7], { cls: 'nowrap-sm', empty: 'No unpaid utang. 🎉' })}</div>`;
      } else if (tab === 'requests') {
        const rq = await api('/credit-requests');
        body.innerHTML = rq.length ? `<div class="row">${rq.map(r => `<div class="card" style="flex:1 1 300px;max-width:420px"><div class="li" style="border:0"><b>${custLink(r.customer_id, r.customer_name)}</b><b>${peso(r.amount)}</b></div><div class="tag">${esc(r.items)}</div>${r.note ? `<div class="tag">Note: ${esc(r.note)}</div>` : ''}<div class="tag">Wants due: ${KK.fd(r.preferred_due)} · Available credit: ${peso0(r.available)} · Sent ${KK.fd(r.created_at)}</div><div style="margin-top:10px">${r.status === 'pending' ? (adm ? `<button class="btn s g" data-ap="${r.id}">Approve</button> <button class="btn s r" data-dc="${r.id}">Decline</button>` : '<span class="tag">Waiting for the owner to review</span>') : `${bdg(KK.cap(r.status), r.status === 'approved' ? 'g' : 'r')} <span class="tag">${esc(r.owner_note)}</span>`}</div></div>`).join('')}</div>` : '<div class="card empty">No credit requests yet.</div>';
        body._rq = rq;
      } else {
        const pay = await api('/payments'), pend = pay.filter(p => p.status === 'pending' && p.provider !== 'paymongo');
        body.innerHTML = `${pend.length ? `<div class="card"><h3>Manual e-wallet payments to confirm <span class="sub">${pend.length} pending</span></h3>${table(['Customer', 'For', 'Amount', 'Reference', 'Sent', ''], pend.map(p => row([esc(p.customer_name), esc(p.code), `<b>${peso(p.amount)}</b>`, esc(p.reference), KK.fdt(p.created_at), `<button class="btn s g" data-ok="${p.id}">Confirm</button> <button class="btn s r" data-no="${p.id}">Reject</button>`]), [2]), [2], { cls: 'nowrap-sm' })}<div class="tag" style="margin-top:8px">Check your e-wallet app for the reference number before confirming.</div></div>` : ''}<div class="card"><h3>Payment history</h3>${table(['Date', 'Customer', 'Applied to', 'Method', 'Amount', 'Status', 'Recorded by'], pay.filter(p => p.status !== 'pending' || p.provider === 'paymongo').map(p => row([KK.fdt(p.created_at), esc(p.customer_name), esc(p.code), p.paymongo_method_type === 'gcash' ? 'GCash' : p.paymongo_method_type === 'qrph' ? 'QR Ph' : p.method === 'ewallet' ? 'E-wallet' : 'Cash', `<b>${peso(p.amount)}</b>`, p.status === 'confirmed' ? bdg('Confirmed', 'g') : p.status === 'pending' ? bdg('Awaiting PayMongo', 'y') : bdg('Rejected', 'r'), esc(p.recorded_by_name || (p.provider === 'paymongo' ? 'Gateway' : '—'))]), [4]), [4], { cls: 'nowrap-sm' })}</div>`;
      }
    };
    await draw(); $('#tabs', v).addEventListener('click', async e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; try { await draw(); } catch (x) { KK.toast(x.message, 'bad'); } } });
    $('#body', v).addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return; const body = $('#body', v);
      try {
        if (b.dataset.pay) { const cr = credits.find(x => x.id === +b.dataset.pay), cu = await api('/customers/' + cr.customer_id); KK.payModal(cu.customer, cu.credits.map(x => ({ ...x, code: x.code || 'CR-' + x.id })), reload); }
        if (b.dataset.due) KK.editDueModal(credits.find(x => x.id === +b.dataset.due), reload);
        if (b.dataset.fu) { const cr = credits.find(x => x.id === +b.dataset.fu); await api('/credits/' + cr.id, { method: 'PUT', body: { follow_up: !cr.follow_up } }); reload(); }
        if (b.dataset.ok || b.dataset.no) { const id = b.dataset.ok || b.dataset.no; await api(`/payments/${id}/${b.dataset.ok ? 'confirm' : 'reject'}`, { method: 'POST', body: {} }); KK.toast(b.dataset.ok ? 'Payment confirmed' : 'Payment rejected', 'ok'); reload(); }
        if (b.dataset.dc) { const r = body._rq.find(x => x.id === +b.dataset.dc), m = KK.modal('Decline request', `<form id="df"><p class="tag" style="margin:12px 0">${esc(r.customer_name)} · ${peso(r.amount)}</p>${field('Reason (the customer will see this)', 'note', 'Please settle your old balance first')}<button class="btn r block" type="submit" style="margin-top:14px">Decline request</button></form>`); KK.submit($('#df', m), async d => { await api(`/credit-requests/${r.id}/decline`, { method: 'POST', body: d }); m.remove(); KK.toast('Request declined', 'ok'); reload(); }); }
        if (b.dataset.ap) {
          const r = body._rq.find(x => x.id === +b.dataset.ap), over = r.amount > r.available, m = KK.modal('Approve credit request', `<form id="af"><div class="note grn" style="margin-top:12px"><b>${esc(r.customer_name)}</b> · ${esc(r.items)}</div>${over ? `<div class="note red" style="margin-top:8px">⚠ Amount is above the customer's available credit (${peso(r.available)}).</div><label class="chk"><input type="checkbox" name="override" value="1"> Approve anyway (owner override)</label>` : ''}<div class="fgrid">${field('Amount (₱)', 'amount', r.amount, { type: 'number', step: '0.01', min: 1, req: true })}${field('Due date', 'due_date', r.preferred_due < KK.ymd() ? KK.ymd() : r.preferred_due, { type: 'date', req: true, min: KK.ymd() })}</div><button class="btn g block" type="submit" style="margin-top:14px">Approve &amp; record utang</button></form>`);
          KK.submit($('#af', m), async d => { await api(`/credit-requests/${r.id}/approve`, { method: 'POST', body: { amount: +d.amount, due_date: d.due_date, override: d.override === '1' } }); m.remove(); KK.toast('Request approved', 'ok'); reload(); });
        }
      } catch (x) { KK.toast(x.message, 'bad'); }
    });
  } };

  /* ================= TRANSACTIONS ================= */
  R.transactions = { title: 'Transactions', sub: 'Completed sales and transaction history', roles: AC, render: async (v) => {
    const LIM = 15, st = { q: '', from: '', to: '', type: '', status: '', page: 0 };
    v.innerHTML = `<div id="kp" class="row"></div><div class="toolbar"><input class="inp search" id="q" placeholder="⌕ Transaction ID or customer…"><label class="tag">From <input class="inp" type="date" id="from"></label><label class="tag">To <input class="inp" type="date" id="to"></label><select class="inp" id="type"><option value="">All payment types</option><option value="cash">Cash</option><option value="ewallet">E-wallet</option><option value="utang">Utang</option></select><select class="inp" id="status"><option value="">All status</option><option value="completed">Completed</option><option value="voided">Voided</option></select>${isAdmin() ? '<button class="btn o" id="csv">⬇ Export CSV</button>' : ''}</div><div class="card" id="tbl" style="padding:6px 8px"></div>`;
    let items = [];
    const load = async () => {
      const r = await api('/sales?' + qs({ ...st, limit: LIM, offset: st.page * LIM })), s = r.summary; items = r.items;
      $('#kp', v).innerHTML = kpi('Transactions', r.total, 'In this view') + kpi('Total sales', peso0(s.total), '', 'k-g') + kpi('Cash / E-wallet / Utang', `<span style="font-size:17px">${peso0(s.cash)} / ${peso0(s.ewallet)} / ${peso0(s.utang)}</span>`, '') + kpi('Voided', s.voided, peso0(s.voided_total), '', 'dn');
      $('#tbl', v).innerHTML = table(['Transaction', 'Date / time', 'Customer', 'Items', 'Total', 'Payment', 'Cashier', 'Status', ''], items.map(x => row([`<b>${esc(x.code)}</b>`, KK.fdt(x.created_at), esc(x.customer_name || 'Walk-in'), x.item_count, `<b>${peso(x.total)}</b>`, KK.payBadge(x.payment_type), esc(x.cashier_name || '—'), x.status === 'voided' ? bdg('Voided', 'r') : x.payment_type === 'utang' ? bdg('Credit', 'y') : bdg('Completed', 'g'), `<button class="btn s o" data-id="${x.id}">View</button>`]), [3, 4]), [3, 4], { cls: 'nowrap-sm', empty: 'No transactions match these filters.' }) + KK.pager(r.total, st.page * LIM, LIM);
    };
    await load(); const reload = () => load().catch(e => KK.toast(e.message, 'bad')); const set = (k, el) => { st[k] = el.value; st.page = 0; reload(); };
    $('#q', v).addEventListener('input', KK.debounce(e => set('q', e.target))); ['from', 'to', 'type', 'status'].forEach(k => $('#' + k, v).addEventListener('change', e => set(k, e.target)));
    const csv = $('#csv', v); if (csv) csv.onclick = async () => { try { const rows = (await api('/sales?' + qs({ ...st, limit: 200 }))).items; const lines = ['Transaction,Date,Customer,Items,Total,Payment,Cashier,Status'].concat(rows.map(x => [x.code, x.created_at, x.customer_name || 'Walk-in', x.item_count, x.total, x.payment_type, x.cashier_name, x.status].map(c => { let s = String(c ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','))); const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv' })), a = document.createElement('a'); a.href = url; a.download = 'transactions.csv'; a.click(); URL.revokeObjectURL(url); } catch (e) { KK.toast(e.message, 'bad'); } };
    $('#tbl', v).addEventListener('click', async e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.pg) { st.page = +b.dataset.pg - 1; return reload(); } if (b.dataset.id) { try { KK.showReceipt(await api('/sales/' + b.dataset.id), { canVoid: isAdmin(), onVoid: reload }); } catch (x) { KK.toast(x.message, 'bad'); } } });
  } };

  /* ================= REPORTS ================= */
  R.reports = { title: 'Reports', sub: 'Sales, profit, inventory and credit reports', roles: A, render: async (v) => {
    let tab = 'sales'; const st = { from: KK.addDays(null, -6), to: KK.ymd(), group: 'day' };
    v.innerHTML = `<div class="toolbar no-print"><div class="tabs" id="tabs"><button data-t="sales" class="on">Sales &amp; Profit</button><button data-t="inventory">Inventory</button><button data-t="credit">Credit</button></div><span class="grow"></span><button class="btn o" id="csv">⬇ CSV</button><button class="btn o" id="print">🖨 Print</button></div><div id="body" style="display:flex;flex-direction:column;gap:16px"></div>`;
    const body = $('#body', v), draw = async () => {
      if (tab === 'sales') {
        const r = await api('/reports/sales?' + qs(st)), t = r.totals;
        body.innerHTML = `<div class="toolbar no-print"><label class="tag">From <input class="inp" type="date" id="from" value="${r.from}"></label><label class="tag">To <input class="inp" type="date" id="to" value="${r.to}"></label><div class="tabs" id="grp"><button data-g="day">Daily</button><button data-g="week">Weekly</button><button data-g="month">Monthly</button></div></div>
        <div class="row">${kpi('Revenue', peso0(t.revenue), `${r.from} to ${r.to}`, 'k-g')}${kpi('Cost of goods', peso0(t.cost))}${kpi('Gross profit', peso0(t.profit), t.margin + '% margin', 'k-p')}${kpi('Transactions', t.transactions, 'Avg ' + peso(t.avg))}</div>
        <div class="card"><h3>Revenue vs Profit</h3>${r.rows.length ? KK.barChart(r.rows.map(x => st.group === 'month' ? x.period : x.period.slice(5)), [{ vals: r.rows.map(x => x.revenue), color: '#0038a8' }, { vals: r.rows.map(x => x.profit), color: '#fcd116' }]) : '<div class="empty">No sales in this period.</div>'}<div class="legend"><span>■ <b style="color:#0038a8">Revenue</b></span><span>■ <b style="color:#b78900">Profit</b></span></div></div>
        <div class="card"><h3>${{ day: 'Daily', week: 'Weekly (week starting Monday)', month: 'Monthly' }[st.group]} Sales Report</h3>${table(['Period', 'Transactions', 'Revenue', 'Cost', 'Profit', 'Margin'], r.rows.map(x => row([esc(x.period), x.transactions, peso(x.revenue), peso(x.cost), `<b>${peso(x.profit)}</b>`, x.margin + '%'])).concat(r.rows.length ? [row(['<b>Total</b>', `<b>${t.transactions}</b>`, `<b>${peso(t.revenue)}</b>`, `<b>${peso(t.cost)}</b>`, `<b>${peso(t.profit)}</b>`, `<b>${t.margin}%</b>`])] : []), [1, 2, 3, 4, 5], { cls: 'nowrap-sm' })}</div>`;
        $$('#grp button', body).forEach(b => { b.classList.toggle('on', b.dataset.g === st.group); b.onclick = () => { st.group = b.dataset.g; run(); }; });
        $('#from', body).onchange = e => { st.from = e.target.value; run(); }; $('#to', body).onchange = e => { st.to = e.target.value; run(); };
      } else if (tab === 'inventory') {
        const r = await api('/reports/inventory');
        body.innerHTML = `<div class="row">${kpi('Stock value (cost)', peso0(r.value_cost))}${kpi('Stock value (retail)', peso0(r.value_retail), 'Potential revenue')}${kpi('Low / out of stock', `${r.low} / ${r.out}`, 'Items needing attention', '', 'dn')}</div><div class="card"><h3>Low stock &amp; near expiry</h3>${table(['Product', 'Stock', 'Reorder level', 'Expiry', 'Status'], r.attention.map(p => row([esc(p.name), p.stock, p.reorder_level, KK.fd(p.expiry_date), KK.stockBadge(p) + (p.near_expiry ? ' ' + bdg('Near expiry', 'p') : '')]), [1, 2]), [1, 2], { cls: 'nowrap-sm' })}</div><div class="card"><h3>Recent restocks</h3>${table(['Product', 'Restock date', 'Qty', 'Cost', 'Supplier'], r.restocks.map(h => row([esc(h.name), KK.fd(h.date), h.qty, peso(h.cost), esc(h.supplier || '—')]), [2, 3]), [2, 3], { cls: 'nowrap-sm' })}</div>`;
      } else {
        const r = await api('/reports/credit');
        body.innerHTML = `<div class="row">${kpi('Outstanding', peso0(r.outstanding), '', 'k-b')}${kpi('Overdue', peso0(r.overdue), '', 'k-r', 'dn')}${kpi('Collected this month', peso0(r.collected_month), '', 'k-g')}</div><div class="row"><div class="card grow" style="flex-basis:320px"><h3>Credit aging</h3>${KK.hbars(r.aging.map(a => ({ name: a.label, v: a.v })), peso0, '#d97706')}</div><div class="card grow2" style="flex-basis:420px"><h3>Biggest debtors</h3>${table(['Customer', 'Balance', 'Oldest due', 'Status'], r.debtors.map(d => row([custLink(d.id, d.name), `<b>${peso(d.balance)}</b>`, KK.fd(d.due), d.days_left < 0 ? bdg('Overdue ' + Math.abs(d.days_left) + ' d', 'r') : bdg('Due in ' + d.days_left + ' d', d.days_left <= 7 ? 'y' : 'b')]), [1]), [1], { cls: 'nowrap-sm', empty: 'No unpaid utang 🎉' })}</div></div>`;
      }
    }, run = () => draw().catch(e => KK.toast(e.message, 'bad'));
    await draw();
    $('#tabs', v).addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; tab = b.dataset.t; $$('#tabs button', v).forEach(x => x.classList.toggle('on', x === b)); run(); });
    $('#print', v).onclick = () => window.print();
    $('#csv', v).onclick = async () => { try { await KK.download(`/reports/${tab}?${tab === 'sales' ? qs({ ...st, format: 'csv' }) : 'format=csv'}`, `${tab}-report.csv`); } catch (e) { KK.toast(e.message, 'bad'); } };
  } };

  /* ================= EXPENSES ================= */
  R.expenses = { title: 'Expenses (Optional)', sub: 'Supplier purchases, electricity, ice, and transport', roles: A, render: async (v) => {
    const st = { month: KK.ymd().slice(0, 7), category: '' }; const cats = (await api('/expenses')).categories;
    v.innerHTML = `<div id="kp" class="row"></div><div class="row" style="align-items:flex-start"><div class="card grow2" style="flex-basis:460px;padding-bottom:8px"><h3>Expense Log <span style="display:flex;gap:8px"><input class="inp" type="month" id="mo" value="${st.month}" style="width:auto"><select class="inp" id="cat" style="width:auto"><option value="">All categories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></span></h3><div id="log"></div></div>
    <div style="flex:1 1 300px;display:flex;flex-direction:column;gap:14px"><div class="card"><h3>+ Add Expense</h3><form id="ef"><div class="fgrid">${field('Date', 'date', KK.ymd(), { type: 'date', req: true })}${field('Category', 'category', 'Supplier purchase', { select: cats, req: true })}</div>${field('Description', 'description', '')}<div class="fgrid">${field('Amount (₱)', 'amount', '', { type: 'number', step: '0.01', min: 0.01, req: true })}${field('Paid to', 'paid_to', '')}</div><button class="btn g block" type="submit" style="margin-top:14px">Save expense</button></form></div><div class="card"><h3>By Category</h3><div id="bycat"></div></div></div></div>`;
    const load = async () => {
      const d = await api('/expenses?' + qs(st)), top = d.by_category[0];
      $('#kp', v).innerHTML = kpi('Expenses · ' + d.month, peso0(d.total), '', 'k-o') + kpi('Gross profit', peso0(d.gross_profit), 'Sales profit before expenses', 'k-g') + kpi('Net profit', peso0(d.net_profit), 'Gross profit − expenses', 'k-p', d.net_profit < 0 ? 'dn' : '') + kpi('Biggest expense', top ? esc(top.category) : '—', top ? `${peso0(top.value)} · ${Math.round(top.value / d.total * 100)}%` : '');
      $('#log', v).innerHTML = table(['Date', 'Category', 'Description', 'Paid to', 'Amount', ''], d.items.map(x => row([KK.fd(x.date), bdg(x.category, { 'Supplier purchase': 'g', Electricity: 'r', Ice: 'b', Transport: 'y' }[x.category] || 'x'), esc(x.description), esc(x.paid_to || '—'), `<b>${peso(x.amount)}</b>`, `<button class="btn s o" data-del="${x.id}" aria-label="Delete" style="color:var(--r)">✕</button>`]), [4]), [4], { cls: 'nowrap-sm', empty: 'No expenses recorded for this month.' });
      $('#bycat', v).innerHTML = KK.hbars(d.by_category.map(b => ({ name: b.category, v: b.value })), peso0, '#d97706');
    };
    await load(); const reload = () => load().catch(e => KK.toast(e.message, 'bad'));
    $('#mo', v).onchange = e => { if (e.target.value) { st.month = e.target.value; reload(); } }; $('#cat', v).onchange = e => { st.category = e.target.value; reload(); };
    KK.submit($('#ef', v), async d => { await api('/expenses', { method: 'POST', body: { ...d, amount: +d.amount } }); KK.toast('Expense saved', 'ok'); $('#ef', v).amount.value = ''; $('#ef', v).description.value = ''; reload(); });
    $('#log', v).addEventListener('click', async e => { const b = e.target.closest('[data-del]'); if (b && await KK.confirm('Delete this expense?', 'Delete', true)) { try { await api('/expenses/' + b.dataset.del, { method: 'DELETE' }); KK.toast('Expense deleted', 'ok'); reload(); } catch (x) { KK.toast(x.message, 'bad'); } } });
  } };

  /* ================= USERS ================= */
  R.users = { title: 'User Management', sub: 'Manage admin and cashier accounts, permissions, and login activity', roles: A, render: async (v) => {
    const d = await api('/users'), reload = () => KK.route();
    const userModal = u => { const m = KK.modal(u ? 'Edit User' : 'Add User', `<form id="uf">${field('Full name', 'name', u ? u.name : '', { req: true })}${field('Email', 'email', u ? u.email : '', { type: 'email', req: true })}<div class="fgrid">${field('Role', 'role', u ? u.role : 'cashier', { select: [['cashier', 'Cashier'], ['admin', 'Admin']] })}${field('Status', 'status', u ? u.status : 'active', { select: [['active', 'Active'], ['inactive', 'Inactive']] })}</div>${field(u ? 'New password (leave blank to keep)' : 'Temporary password', 'password', '', { type: 'password', req: !u, ac: 'new-password' })}<button class="btn g block" type="submit" style="margin-top:16px">Save user</button></form>`); KK.submit($('#uf', m), async x => { if (!x.password) delete x.password; await api(u ? '/users/' + u.id : '/users', { method: u ? 'PUT' : 'POST', body: x }); m.remove(); KK.toast('User saved', 'ok'); reload(); }); };
    v.innerHTML = `<div class="row" style="align-items:flex-start"><div style="flex:1.5 1 460px;display:flex;flex-direction:column;gap:14px;min-width:0"><div class="card"><h3>Owner &amp; Staff Accounts <button class="btn s" id="add">+ Add User</button></h3>${table(['User', 'Role', 'Email', 'Status', 'Last login', ''], d.users.map(u => row([`${KK.thumb(u.name)}<b>${esc(u.name)}</b>`, bdg(u.role === 'admin' ? 'Owner / Admin' : 'Cashier', u.role === 'admin' ? 'p' : 'b'), esc(u.email), u.status === 'active' ? bdg('Active', 'g') : bdg('Inactive', 'x'), u.last_login ? KK.fdt(u.last_login) : 'Never', `<button class="btn s o" data-e="${u.id}">Edit</button>`])), [], { cls: 'nowrap-sm' })}<div class="tag" style="margin-top:8px">${d.customers} customer portal account${d.customers === 1 ? '' : 's'} are managed from the Customers page.</div></div>
    <div class="card"><h3>Login Activity</h3>${table(['User', 'Action', 'Device', 'Time', 'Result'], d.log.map(l => row([esc(l.name || l.identifier), esc(l.action), esc(l.device), KK.fdt(l.created_at), l.result === 'Success' ? bdg('Success', 'g') : bdg('Failed', 'r')])), [], { cls: 'nowrap-sm' })}</div></div>
    <div class="card" style="flex:1 1 300px"><h3>Role Permissions</h3>${table(['Module', 'Admin', 'Cashier', 'Customer'], [['Dashboard / Insights', '✓', '—', '—'], ['POS / Checkout', '✓', '✓', '—'], ['Inventory', '✓ edit', 'View only', '—'], ['Cost prices &amp; profit', '✓', '—', '—'], ['Customers &amp; Credit', '✓', 'Record payments', 'Own only'], ['Approve credit requests', '✓', '—', '—'], ['Void sales', '✓', '—', '—'], ['Transactions', '✓', '✓', 'Own only'], ['Reports / Expenses', '✓', '—', '—'], ['User Management', '✓', '—', '—'], ['Portal (credit, products)', '—', '—', '✓']].map(r => row(r)))}</div></div>`;
    $('#add', v).onclick = () => userModal(null); v.addEventListener('click', e => { const b = e.target.closest('[data-e]'); if (b) userModal(d.users.find(u => u.id === +b.dataset.e)); });
  } };
})();
