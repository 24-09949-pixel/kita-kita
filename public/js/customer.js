'use strict';
/* Kita Kita front end — Customer Portal pages */
(function () {
  const { api, esc, peso, peso0, bdg, kpi, table, row, field, $, $$ } = KK, R = KK.portalRoutes;
  const head = (t, s) => `<div><h2 style="font-size:22px;color:var(--g)">${t}</h2><div class="mu">${s}</div></div>`;
  const wrap = v => { v.style.maxWidth = '1200px'; v.style.margin = '0 auto'; v.style.width = '100%'; };
  const kv = (a, b) => `<div class="kv"><span>${a}</span><b>${b}</b></div>`;
  const acct = (s, nearest) => `<div class="acct"><div style="display:flex;justify-content:space-between;align-items:center"><b style="color:#fff">My Account</b>${KK.bdg('Active', 'g')}</div><div style="color:#9ca3af;font-size:12px;margin-top:10px">Total outstanding credit</div><div class="big">${peso(s.outstanding)}</div>
    ${nearest ? `<hr><b style="color:#fff">Credit Details</b>${kv('Transaction', esc(nearest.code))}${kv('Purchase date', KK.fd(nearest.borrowed_on))}${kv('Due date', KK.fd(nearest.due_date))}${kv('Amount paid', peso(nearest.paid))}${kv('Remaining balance', peso(nearest.balance))}<div style="margin-top:6px">${nearest.state === 'overdue' ? KK.bdg('Payment pending', 'y') + ' ' + KK.bdg(`${Math.abs(nearest.days_left)} day${Math.abs(nearest.days_left) === 1 ? '' : 's'} overdue`, 'r') : KK.bdg('Payment pending', 'y') + ' ' + KK.creditBadge(nearest)}</div>` : '<hr><div style="color:#4ade80">✓ You have no unpaid utang. Salamat po!</div>'}
    <hr><b style="color:#fff">Payment Options</b><div style="padding:6px 0">👛 Cash <span class="tag">— pay at the store counter</span></div><div style="padding:3px 0">📱 E-wallet <span class="tag">— GCash or QR Ph</span></div>${nearest ? `<a class="btn block" href="#/payment?credit_id=${nearest.id}" style="margin-top:12px">Pay Outstanding Balance</a>` : ''}</div>`;

  R.dashboard = { title: 'Dashboard', roles: ['customer'], render: async v => {
    wrap(v); const s = await api('/portal/summary'), nearest = s.open.slice().sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    v.innerHTML = head(`Magandang araw, ${esc(s.customer.name.split(' ')[0])}! 👋`, 'Here is your account summary.') + `<div class="row" style="align-items:flex-start"><div style="flex:0 1 400px;min-width:280px;width:100%">${acct(s, nearest)}</div><div style="flex:1 1 420px;display:flex;flex-direction:column;gap:14px;min-width:0">
    <div class="row">${kpi('Credit limit', peso0(s.credit_limit), 'Set by the store owner')}${kpi('Available credit', peso0(s.available), `${peso0(s.outstanding)} in use`, 'k-g')}${kpi('Next payment due', s.next_due ? KK.fd(s.next_due) : '—', s.next_due ? (s.next_due_days < 0 ? Math.abs(s.next_due_days) + ' days overdue' : s.next_due_days === 0 ? 'Due today' : `In ${s.next_due_days} days`) : 'Nothing due', s.status === 'overdue' ? 'k-r' : '', s.status === 'overdue' ? 'dn' : '')}</div>
    <div class="card"><h3>Notifications</h3>${s.notifications.length ? s.notifications.map(n => `<div class="li"><span>${n.icon} <b>${esc(n.title)}</b><div class="tag">${esc(n.text)}</div></span></div>`).join('') : '<div class="empty">No new notifications.</div>'}</div>
    <div class="card"><h3>Recent Purchases <a class="sub" href="#/history">View all</a></h3>${table(['ID', 'Date', 'Total', 'Type'], s.recent.map(r => row([`<b>${esc(r.code)}</b>`, KK.fd(r.created_at), peso(r.total), KK.payBadge(r.payment_type)]), [2]), [2], { empty: 'No purchases yet.' })}</div></div></div>`;
  } };

  R.products = { title: 'Products', roles: ['customer'], render: async v => {
    wrap(v); const all = await api('/portal/products'), cats = [...new Set(all.map(p => p.category))].sort(); const st = { q: '', cat: '', inOnly: false };
    v.innerHTML = head('Available Products', 'Browse what the store has today and the current prices') + `<div class="toolbar"><input class="inp search" id="q" placeholder="⌕ Search products…"><select class="inp" id="c"><option value="">All categories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select><label class="chk"><input type="checkbox" id="io"> In stock only</label></div><div class="pgrid" id="g"></div><div class="note">Prices and availability are updated by the store. To buy on utang, go to <b>Credit Requests</b>.</div>`;
    const colors = ['#fff8cc', '#fee2e2', '#dbeafe', '#eff6ff', '#fde7eb', '#f3f4f6'];
    const draw = () => { const s = st.q.toLowerCase(), l = all.filter(p => (!st.cat || p.category === st.cat) && (!s || p.name.toLowerCase().includes(s)) && (!st.inOnly || p.availability !== 'out')); $('#g', v).innerHTML = l.map(p => `<div class="pcard" style="cursor:default"><div class="ph" style="background:${colors[p.id % 6]}">${esc(p.name[0])}</div><b class="n">${esc(p.name)}</b><span class="tag">${esc(p.category)}</span><div style="display:flex;justify-content:space-between;align-items:center"><b>${peso(p.price)}</b>${p.availability === 'out' ? bdg('Out of stock', 'r') : p.availability === 'low' ? bdg('Low stock', 'y') : bdg('In stock', 'g')}</div></div>`).join('') || '<div class="empty" style="grid-column:1/-1">No products match.</div>'; };
    draw(); $('#q', v).addEventListener('input', e => { st.q = e.target.value.trim(); draw(); }); $('#c', v).onchange = e => { st.cat = e.target.value; draw(); }; $('#io', v).onchange = e => { st.inOnly = e.target.checked; draw(); };
  } };

  R.credit = { title: 'My Credit', roles: ['customer'], render: async v => {
    wrap(v); const [s, credits] = await Promise.all([api('/portal/summary'), api('/portal/credit')]), open = credits.filter(c => c.status === 'open'), nearest = open.slice().sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    const payable = c => Math.max(0, Math.round((c.balance - c.pending) * 100) / 100);
    v.innerHTML = head('My Credit', 'Outstanding balance, due dates, and credit status') + `<div class="row" style="align-items:flex-start"><div style="flex:0 1 400px;min-width:280px;width:100%">${acct(s, nearest).replace(/<a class="btn block"[^>]*>.*?<\/a>/, '')}</div><div style="flex:1 1 420px;display:flex;flex-direction:column;gap:14px;min-width:0">
    <div class="row">${kpi('Total outstanding', peso(s.outstanding), `${open.length} open credit${open.length === 1 ? '' : 's'}`, 'k-r', 'dn')}${kpi('Credit limit', peso0(s.credit_limit), '')}${kpi('Available credit', peso0(s.available), '', 'k-g')}</div>
    <div class="card"><h3>Credit Records</h3>${table(['Transaction', 'Purchase date', 'Due date', 'Amount', 'Paid', 'Remaining', 'Status'], credits.map(c => row([`<b>${esc(c.code)}</b>`, KK.fd(c.borrowed_on), KK.fd(c.due_date), peso(c.amount), peso(c.paid), peso(c.balance), (c.status === 'open' ? bdg('Payment pending', 'y') + ' ' : '') + KK.creditBadge(c) + (c.pending > 0 ? ' ' + bdg('₱' + c.pending.toFixed(2) + ' awaiting confirmation', 'b') : '')]), [3, 4, 5]), [3, 4, 5], { cls: 'nowrap-sm', empty: 'No credit records yet.' })}</div>
    ${open.length ? `<div class="card" id="paybox"><h3>Make a payment</h3><p class="tag">Choose an amount and continue to the separate GCash / QR payment page.</p><a class="btn g block" href="#/payment?credit_id=${nearest.id}" style="margin-top:12px">Pay Outstanding Balance</a></div>` : ''}</div></div>`;
  } };

  R.payment = { title: 'Pay by GCash or QR', roles: ['customer'], render: async (v, ctx) => {
    wrap(v);
    const [credits, config] = await Promise.all([api('/portal/credit'), api('/config')]);
    const open = credits.filter(c => c.status === 'open' && c.balance - c.pending > 0.001), selected = open.find(c => c.id === Number(ctx.params.get('credit_id'))) || open[0];
    const returned = ctx.params.get('payment');
    let statusNote = returned === 'returned'
      ? '<div class="note grn">Returned from checkout. Your balance will change only after PayMongo confirms the payment.</div>'
      : returned === 'cancelled' ? '<div class="note">Payment was cancelled. No balance change was recorded.</div>' : '';
    v.innerHTML = head('Pay with GCash or QR', 'Choose how to pay this specific amount') + `<a href="#/credit">‹ Back to My Credit</a>${statusNote}
      ${!open.length ? '<div class="card empty">No unpaid balance is currently available to pay.</div>' : !config.payment_gateway ? '<div class="card"><h3>Online payments are not configured</h3><p class="tag">Set the PayMongo secret key and webhook secret on the server to enable amount-specific GCash and QR Ph payments.</p></div>' : `<div class="card" style="max-width:680px"><form id="payform">${field('Which utang?', 'credit_id', selected.id, { select: open.map(c => [c.id, `${c.code} · ${peso(Math.max(0, c.balance - c.pending))} available · due ${KK.fd(c.due_date)}`]) })}
      <label class="lab">Payment option</label><input type="hidden" name="gateway_method" value="gcash"><div class="row" id="methods">
      <button class="opt on" type="button" data-method="gcash"><b>📱 Open GCash app</b><div class="tag" style="margin-top:5px">Continue securely; PayMongo will open the GCash payment flow.</div></button>
      <button class="opt" type="button" data-method="qrph"><b>▦ Scan a QR code</b><div class="tag" style="margin-top:5px">PayMongo shows a QR Ph code for the exact amount. Scan it with GCash or another supported wallet.</div></button></div>
      <div style="margin-top:14px"><label class="lab" for="amount">Amount to pay (₱)</label><input class="inp" id="amount" name="amount" type="number" min="0.01" max="${Math.max(0, selected.balance - selected.pending).toFixed(2)}" step="0.01" value="${Math.max(0, selected.balance - selected.pending).toFixed(2)}" required></div>
      <div class="note grn" style="margin-top:12px">The gateway checkout is tied to this amount and credit record. Do not pay a different amount.</div>
      <button class="btn g block" type="submit" style="margin-top:14px">Continue to GCash</button></form></div>`}`;
    const form = $('#payform', v); if (!form) return;
    const amount = $('#amount', form), setAmount = () => {
      const credit = open.find(c => c.id === Number(form.credit_id.value));
      amount.max = Math.max(0, credit.balance - credit.pending).toFixed(2);
      amount.value = amount.max;
    };
    form.credit_id.onchange = setAmount;
    $$('.opt', form).forEach(option => option.onclick = () => {
      $$('.opt', form).forEach(item => item.classList.toggle('on', item === option));
      form.gateway_method.value = option.dataset.method;
      $('button[type="submit"]', form).textContent = option.dataset.method === 'qrph' ? 'Continue to QR checkout' : 'Continue to GCash';
    });
    KK.submit(form, async d => {
      const result = await api('/portal/pay', { method: 'POST', body: {
        credit_id: Number(d.credit_id), amount: Number(d.amount), method: 'ewallet', gateway_method: d.gateway_method,
      } });
      if (!result.checkout_url) throw new Error('The payment gateway did not return a checkout link.');
      window.location.assign(result.checkout_url);
    });
  } };

  R.requests = { title: 'Credit Requests', roles: ['customer'], render: async v => {
    wrap(v); const [s, list] = await Promise.all([api('/portal/summary'), api('/portal/requests')]);
    v.innerHTML = head('Credit Requests', 'Request to purchase products on credit') + `<div class="row" style="align-items:flex-start"><div class="card" style="flex:0 1 440px;min-width:280px;width:100%"><h3>+ New Credit Request</h3>${s.credit_limit <= 0 ? '<div class="note red">The store has not set your credit limit yet. Please ask the owner.</div>' : ''}<form id="rf">${field('Items you want', 'items', '', { area: true, req: true })}<div class="fgrid">${field('Estimated total (₱)', 'amount', '', { type: 'number', step: '0.01', min: 1, req: true })}${field('Preferred due date', 'preferred_due', KK.addDays(null, 14), { type: 'date', min: KK.ymd(), req: true })}</div>${field('Note to store owner (optional)', 'note', '')}<div class="note grn" style="margin-top:12px">Available credit: <b>${peso(s.available)}</b>. The owner reviews every request and may set a different due date.</div><button class="btn g block" type="submit" style="margin-top:12px" ${s.credit_limit <= 0 ? 'disabled' : ''}>Submit Request</button></form></div>
    <div class="card" style="flex:1 1 440px;min-width:0"><h3>My Requests</h3>${table(['Date', 'Items', 'Amount', 'Requested due', 'Status', 'Owner note'], list.map(r => row([KK.fd(r.created_at), esc(r.items), peso(r.amount), KK.fd(r.preferred_due), bdg(KK.cap(r.status), r.status === 'approved' ? 'g' : r.status === 'pending' ? 'y' : 'r'), esc(r.owner_note || '—')]), [2]), [2], { cls: 'nowrap-sm', empty: 'You have not made any requests yet.' })}</div></div>`;
    KK.submit($('#rf', v), async d => { await api('/portal/requests', { method: 'POST', body: { ...d, amount: +d.amount } }); KK.toast('Request sent to the store', 'ok'); KK.route(); });
  } };

  R.history = { title: 'Purchase History', roles: ['customer'], render: async v => {
    wrap(v); const st = { from: '', type: '' };
    v.innerHTML = head('Purchase History', 'View previous purchases and transaction details') + `<div class="toolbar"><label class="tag">From <input class="inp" type="date" id="from"></label><select class="inp" id="type"><option value="">All payment types</option><option value="cash">Cash</option><option value="ewallet">E-wallet</option><option value="utang">Utang</option></select></div><div class="row" style="align-items:flex-start"><div class="card" style="flex:1.3 1 420px;min-width:0" id="list"></div><div class="card" style="flex:1 1 340px" id="detail"><div class="empty">Select a purchase to see its details.</div></div></div>`;
    const load = async () => {
      const l = await api('/portal/purchases?' + new URLSearchParams(Object.entries(st).filter(([, x]) => x))); $('#list', v).innerHTML = table(['Transaction', 'Date', 'Items', 'Total', 'Payment', ''], l.map(r => row([`<b>${esc(r.code)}</b>`, KK.fd(r.created_at), r.item_count, peso(r.total), KK.payBadge(r.payment_type), `<button class="btn s o" data-id="${r.id}">View</button>`]), [3]), [3], { cls: 'nowrap-sm', empty: 'No purchases found.' });
    };
    await load(); const reload = () => load().catch(e => KK.toast(e.message, 'bad')); $('#from', v).onchange = e => { st.from = e.target.value; reload(); }; $('#type', v).onchange = e => { st.type = e.target.value; reload(); };
    $('#list', v).addEventListener('click', async e => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      try { const s = await api('/portal/purchases/' + b.dataset.id); $('#detail', v).innerHTML = `<h3>${esc(s.code)} · Details <span class="sub">${KK.fdt(s.created_at)}</span></h3>${s.items.map(i => `<div class="li"><span>${esc(i.name)}<div class="tag">${i.qty} × ${peso(i.price)}</div></span><b>${peso(i.line_total)}</b></div>`).join('')}<div class="li" style="font-size:17px"><b>Total</b><b>${peso(s.total)}</b></div><div class="li"><span>Payment type</span>${KK.payBadge(s.payment_type)}</div>${s.credit ? `<div class="li"><span>Due date</span><b>${KK.fd(s.credit.due_date)}</b></div><div class="li"><span>Remaining</span><b>${peso(s.credit.balance)}</b></div>` : ''}<button class="btn o block" id="rc" style="margin-top:12px">View / Print Receipt</button>`; $('#rc', v).onclick = () => KK.showReceipt(s); } catch (x) { KK.toast(x.message, 'bad'); }
    });
  } };

  R.payments = { title: 'Payments', roles: ['customer'], render: async v => {
    wrap(v); const [p, s] = await Promise.all([api('/portal/payments'), api('/portal/summary')]), last = p.items.find(x => x.status === 'confirmed');
    v.innerHTML = head('Payments', 'Recorded payments and payment history') + `<div class="row">${kpi('Total paid (lifetime)', peso(p.total_paid), `${p.items.filter(x => x.status === 'confirmed').length} payments`, 'k-g')}${kpi('Pending balance', peso(s.outstanding), s.next_due ? 'Next due ' + KK.fd(s.next_due) : 'Nothing due', s.outstanding > 0 ? 'k-r' : '', s.outstanding > 0 ? 'dn' : '')}${kpi('Last payment', last ? peso(last.amount) : '—', last ? KK.fd(last.created_at) + ' · ' + (last.method === 'ewallet' ? 'E-wallet' : 'Cash') : '')}</div>
    <div class="card"><h3>Payment History <span class="sub">Recorded by the store</span></h3>${table(['Date', 'Applied to', 'Method', 'Reference', 'Amount', 'Recorded by', 'Status'], p.items.map(x => row([KK.fdt(x.created_at), esc(x.code), x.paymongo_method_type === 'gcash' ? 'GCash' : x.paymongo_method_type === 'qrph' ? 'QR Ph' : x.method === 'ewallet' ? 'E-wallet' : 'Cash', x.provider === 'paymongo' && x.status === 'pending' && x.paymongo_checkout_url && x.paymongo_checkout_url.startsWith('https://checkout.paymongo.com/') ? `<a href="${esc(x.paymongo_checkout_url)}" target="_blank" rel="noopener noreferrer">Continue checkout</a>` : esc(x.reference || '—'), `<b>${peso(x.amount)}</b>`, esc(x.recorded_by_name || (x.status === 'pending' ? 'Awaiting confirmation' : 'Portal')), x.status === 'confirmed' ? bdg('Confirmed', 'g') : x.status === 'pending' ? bdg('Pending', 'y') : bdg('Rejected', 'r')]), [4]), [4], { cls: 'nowrap-sm', empty: 'No payments yet.' })}${s.outstanding > 0 ? '<div class="note" style="margin-top:12px">You still have a balance. Go to <a href="#/credit"><b>My Credit</b></a> to pay by cash or e-wallet.</div>' : ''}</div>`;
  } };
})();
