'use strict';
/* Kita Kita front end — Customer Portal pages */
(function () {
  const { api, esc, peso, peso0, bdg, kpi, table, row, field, $, $$ } = KK, R = KK.portalRoutes;
  const head = (t, s) => `<div><h2 style="font-size:22px;color:var(--g)">${t}</h2><div class="mu">${s}</div></div>`;
  const wrap = v => { v.style.maxWidth = '1200px'; v.style.margin = '0 auto'; v.style.width = '100%'; };
  const kv = (a, b) => `<div class="kv"><span>${a}</span><b>${b}</b></div>`;
  const acct = (s, nearest) => `<div class="acct"><div style="display:flex;justify-content:space-between;align-items:center"><b style="color:#fff">My Account</b>${KK.bdg('Active', 'g')}</div><div style="color:#9ca3af;font-size:12px;margin-top:10px">Total outstanding credit</div><div class="big">${peso(s.outstanding)}</div>
    ${nearest ? `<hr><b style="color:#fff">Credit Details</b>${kv('Transaction', esc(nearest.code))}${kv('Purchase date', KK.fd(nearest.borrowed_on))}${kv('Due date', KK.fd(nearest.due_date))}${kv('Amount paid', peso(nearest.paid))}${kv('Remaining balance', peso(nearest.balance))}<div style="margin-top:6px">${nearest.payment_status === 'pending_verification' ? KK.bdg(`Pending Verification · ${peso(nearest.pending)}`, 'b') + ' ' : ''}${nearest.state === 'overdue' ? KK.bdg('Payment pending', 'y') + ' ' + KK.bdg(`${Math.abs(nearest.days_left)} day${Math.abs(nearest.days_left) === 1 ? '' : 's'} overdue`, 'r') : KK.creditBadge(nearest)}</div>` : '<hr><div style="color:#4ade80">✓ You have no unpaid utang. Salamat po!</div>'}
    <hr><b style="color:#fff">Payment Options</b><div style="padding:6px 0">👛 Cash <span class="tag">— pay at the store counter</span></div><div style="padding:3px 0">📱 GCash <span class="tag">— scan the store QR; transfer fees may apply</span></div>${nearest && nearest.balance - nearest.pending > 0.001 ? `<a class="btn block" href="#/payment?credit_id=${nearest.id}" style="margin-top:12px">Submit QR Payment</a>` : ''}</div>`;

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
    const payable = c => Math.max(0, Math.round((c.balance - c.pending) * 100) / 100);
    wrap(v); const [s, credits] = await Promise.all([api('/portal/summary'), api('/portal/credit')]), open = credits.filter(c => c.status === 'open'), payableCredits = open.filter(c => payable(c) > 0.001), nearest = open.slice().sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    v.innerHTML = head('My Credit', 'Outstanding balance, due dates, and credit status') + `<div class="row" style="align-items:flex-start"><div style="flex:0 1 400px;min-width:280px;width:100%">${acct(s, nearest).replace(/<a class="btn block"[^>]*>.*?<\/a>/, '')}</div><div style="flex:1 1 420px;display:flex;flex-direction:column;gap:14px;min-width:0">
    <div class="row">${kpi('Total outstanding', peso(s.outstanding), `${open.length} open credit${open.length === 1 ? '' : 's'}`, 'k-r', 'dn')}${kpi('Credit limit', peso0(s.credit_limit), '')}${kpi('Available credit', peso0(s.available), '', 'k-g')}</div>
    <div class="card"><h3>Credit Records</h3>${table(['Transaction', 'Purchase date', 'Due date', 'Amount', 'Paid', 'Remaining', 'Status'], credits.map(c => row([`<b>${esc(c.code)}</b>`, KK.fd(c.borrowed_on), KK.fd(c.due_date), peso(c.amount), peso(c.paid), peso(c.balance), (c.payment_status === 'pending_verification' ? bdg('Pending Verification', 'y') + ' ' : '') + KK.creditBadge(c) + (c.pending > 0 ? '<div class="tag">' + peso(c.pending) + ' awaiting verification</div>' : '')]), [3, 4, 5]), [3, 4, 5], { cls: 'nowrap-sm', empty: 'No credit records yet.' })}</div>
    ${payableCredits.length ? `<div class="card" id="paybox"><h3>Make a payment</h3><p class="tag">Scan the store's GCash QR, then submit your reference digits and receipt for manual verification.</p><a class="btn g block" href="#/payment?credit_id=${payableCredits[0].id}" style="margin-top:12px">Submit QR Payment</a></div>` : ''}</div></div>`;
  } };

  R.payment = { title: 'Pay by GCash QR', roles: ['customer'], render: async (v, ctx) => {
    wrap(v);
    const credits = await api('/portal/credit');
    const open = credits.filter(c => c.status === 'open' && c.balance - c.pending > 0.001), selected = open.find(c => c.id === Number(ctx.params.get('credit_id'))) || open[0];
    v.innerHTML = head('Pay with GCash QR', 'Send the payment yourself, then upload the receipt for the store to verify') + `<a href="#/credit">‹ Back to My Credit</a>
      ${!open.length ? '<div class="card empty">No balance is currently available for a new payment. Any submitted proof is pending verification.</div>' : `<div class="row" style="align-items:flex-start;margin-top:12px"><div class="card" style="flex:0 1 360px;text-align:center"><h3>Scan to pay</h3><img class="payment-qr" src="/images/gcash-payment-qr.png" alt="Store GCash QR code"><p class="tag">Enter the payment amount shown here in your GCash app. Transfer fees may apply.</p><div class="note" style="margin-top:12px">Your balance changes only after the store checks its account and confirms your payment.</div></div>
      <div class="card" style="flex:1 1 420px;min-width:280px"><h3>Submit Payment Proof</h3><form id="payform">${field('Which utang?', 'credit_id', selected.id, { select: open.map(c => [c.id, `${c.code} · ${peso(Math.max(0, c.balance - c.pending))} available · due ${KK.fd(c.due_date)}`]) })}
      <div style="margin-top:12px"><label class="lab" for="amount">Amount sent (₱)</label><input class="inp" id="amount" name="amount" type="number" min="0.01" max="${Math.max(0, selected.balance - selected.pending).toFixed(2)}" step="0.01" value="${Math.max(0, selected.balance - selected.pending).toFixed(2)}" required></div>
      <div style="margin-top:12px"><label class="lab" for="reference_last4">Last 4 digits of the reference number</label><input class="inp" id="reference_last4" name="reference_last4" type="text" inputmode="numeric" maxlength="4" pattern="\\d{4}" autocomplete="off" required></div>
      <div style="margin-top:12px"><label class="lab" for="receipt">Screenshot of receipt</label><input class="inp" id="receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp" required><div class="tag">JPEG, PNG, or WebP · 4 MB maximum</div></div>
      ${selected.pending > 0 ? `<div class="note" style="margin-top:12px">${peso(selected.pending)} is already pending verification for this utang.</div>` : ''}
      <button class="btn g block" type="submit" style="margin-top:14px">Submit Payment Proof</button></form></div></div>`}`;
    const form = $('#payform', v); if (!form) return;
    const amount = $('#amount', form), setAmount = () => {
      const credit = open.find(c => c.id === Number(form.credit_id.value));
      amount.max = Math.max(0, credit.balance - credit.pending).toFixed(2);
      amount.value = amount.max;
    };
    form.credit_id.onchange = setAmount;
    KK.submit(form, async d => {
      if (!(d.receipt instanceof File) || !d.receipt.size) throw new Error('Choose a receipt screenshot to upload.');
      if (d.receipt.size > 4 * 1024 * 1024) throw new Error('Receipt image must be 4 MB or smaller.');
      const receiptImage = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read the receipt image.'));
        reader.readAsDataURL(d.receipt);
      });
      const result = await api('/portal/payment-proofs', { method: 'POST', body: {
        credit_id: Number(d.credit_id), amount: Number(d.amount), reference_last4: d.reference_last4, receipt_image: receiptImage,
      } });
      KK.toast(result.message, 'ok'); KK.route();
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
    <div class="card"><h3>Payment History <span class="sub">Recorded by the store</span></h3>${table(['Date', 'Applied to', 'Method', 'Reference (last 4)', 'Amount', 'Verified at', 'Status'], p.items.map(x => row([KK.fdt(x.created_at), esc(x.code), x.method === 'ewallet' ? 'GCash / e-wallet' : 'Cash', esc(x.reference_last4 || x.reference || '—'), `<b>${peso(x.amount)}</b>`, x.confirmed_at ? KK.fdt(x.confirmed_at) : '—', x.status === 'confirmed' ? bdg('Confirmed', 'g') : x.status === 'pending' ? bdg(x.provider === 'manual_qr' ? 'Pending Verification' : 'Pending', 'y') : bdg('Rejected', 'r')]), [4]), [4], { cls: 'nowrap-sm', empty: 'No payments yet.' })}${s.outstanding > 0 ? '<div class="note" style="margin-top:12px">You still have a balance. Go to <a href="#/credit"><b>My Credit</b></a> to submit proof with the store QR or pay at the counter.</div>' : ''}</div>`;
  } };
})();
