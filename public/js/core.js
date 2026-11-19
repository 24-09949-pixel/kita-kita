'use strict';
/* Kita Kita front end — core: helpers, API client, UI kit, charts, auth screens, layout & router */
(function () {
  const KK = window.KK = { S: { token: null, user: null, cfg: { setup_required: false, payment_gateway: false, store: { name: 'Kita Kita Store', address: '', phone: '' } }, alerts: null, rt: 0 }, staffRoutes: {}, portalRoutes: {} };
  const S = KK.S;
  try { S.token = localStorage.getItem('kk_token'); } catch (e) { /* storage blocked */ }

  /* ---------- helpers ---------- */
  const $ = KK.$ = (s, el = document) => el.querySelector(s);
  KK.$$ = (s, el = document) => [...el.querySelectorAll(s)];
  KK.esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esc = KK.esc;
  KK.peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  KK.peso0 = n => '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 });
  KK.pct = n => (n === null || n === undefined ? '' : (n >= 0 ? '▲ ' : '▼ ') + Math.abs(n).toFixed(1) + '%');
  const p2 = n => String(n).padStart(2, '0');
  KK.ymd = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  KK.addDays = (s, n) => { const d = s ? new Date(s + 'T00:00:00') : new Date(); d.setDate(d.getDate() + n); return KK.ymd(d); };
  const pd = s => new Date(String(s).replace(' ', 'T').slice(0, 10) + 'T00:00:00');
  KK.fd = s => (s ? pd(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
  KK.ft = s => { if (!s || s.length < 16) return ''; const h = +s.slice(11, 13), m = s.slice(14, 16); return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`; };
  KK.fdt = s => (s ? `${KK.fd(s)} · ${KK.ft(s)}` : '—');
  KK.initials = n => String(n || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  KK.cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  const COLORS = ['#fff8cc', '#fee2e2', '#dbeafe', '#eff6ff', '#fde7eb', '#f3f4f6', '#e0e7ff', '#fff1c2', '#fce7f3', '#e5edff'];
  KK.thumb = name => `<span class="thumb" style="background:${COLORS[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]}">${esc(String(name)[0] || '?')}</span>`;
  KK.bdg = (t, k = 'g') => `<span class="bdg b-${k}">${esc(t)}</span>`;
  KK.kpi = (l, v, s = '', cls = '', sc = '') => `<div class="card kpi ${cls}"><div class="l">${esc(l)}</div><div class="v">${v}</div><div class="s ${sc}">${s}</div></div>`;
  KK.table = (heads, rows, right = [], opts = {}) => `<div class="tw"><table class="${opts.cls || ''}"><thead><tr>${heads.map((h, i) => `<th class="${right.includes(i) ? 'r' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r => `<tr ${r._attr || ''}>${r.cells.map((c, i) => `<td class="${right.includes(i) ? 'r' : ''}">${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${heads.length}" class="empty">${opts.empty || 'Nothing to show yet.'}</td></tr>`}</tbody></table></div>`;
  KK.row = (cells, attr = '') => ({ cells, _attr: attr });
  KK.creditBadge = c => c.state === 'paid' ? KK.bdg('Paid', 'g') : c.state === 'void' ? KK.bdg('Voided', 'x') : c.state === 'overdue' ? KK.bdg(`Overdue ${Math.abs(c.days_left)} day${Math.abs(c.days_left) === 1 ? '' : 's'}`, 'r') : c.days_left === 0 ? KK.bdg('Due today', 'y') : KK.bdg(`Due in ${c.days_left} day${c.days_left === 1 ? '' : 's'}`, c.state === 'due_soon' ? 'y' : 'b');
  KK.stockBadge = p => p.status === 'out' ? KK.bdg('Out of Stock', 'r') : p.status === 'low' ? KK.bdg('Low Stock', 'y') : KK.bdg('In Stock', 'g');
  KK.payBadge = t => KK.bdg(t === 'ewallet' ? 'E-wallet' : KK.cap(t), t === 'cash' ? 'g' : t === 'ewallet' ? 'b' : 'y');
  KK.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  KK.go = p => { if (location.hash === '#/' + p) KK.route(); else location.hash = '#/' + p; };

  /* ---------- API ---------- */
  KK.api = async (path, { method = 'GET', body } = {}) => {
    let r;
    try { r = await fetch('/api' + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) { throw new Error('Cannot reach the server. Check your connection.'); }
    let data = null; try { data = await r.json(); } catch (e) { /* no body */ }
    if (r.status === 401 && S.token) { KK.logout(true); throw new Error((data && data.error) || 'Session expired'); }
    if (!r.ok) throw new Error((data && data.error) || 'Request failed');
    return data;
  };
  KK.download = async (path, name) => {
    const r = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + S.token } });
    if (!r.ok) throw new Error('Export failed');
    const url = URL.createObjectURL(await r.blob()), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* ---------- UI kit ---------- */
  KK.toast = (msg, kind = '') => { const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'bad' ? 5000 : 3000); };
  KK.modal = (title, html, { wide = false } = {}) => {
    const b = document.createElement('div'); b.className = 'modal-back';
    b.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="modal-h"><b>${esc(title)}</b><button class="x no-print" data-close aria-label="Close">✕</button></div><div class="modal-b">${html}</div></div>`;
    document.body.appendChild(b);
    b.addEventListener('mousedown', e => { b._down = e.target === b; });
    b.addEventListener('click', e => { if ((e.target === b && b._down) || e.target.closest('[data-close]')) b.remove(); });
    const f = $('input:not([type=hidden]),select,textarea', b); if (f) f.focus();
    return b;
  };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const m = document.querySelectorAll('.modal-back'); if (m.length) m[m.length - 1].remove(); } });
  KK.confirm = (msg, okLabel = 'Confirm', danger = false) => new Promise(res => {
    const m = KK.modal('Please confirm', `<p style="margin:14px 0 18px;line-height:1.5">${esc(msg)}</p><div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn o" data-close>Cancel</button><button class="btn ${danger ? 'r' : 'g'}" data-ok>${esc(okLabel)}</button></div>`);
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    $('[data-ok]', m).onclick = () => { fin(true); m.remove(); };
    new MutationObserver(() => { if (!document.body.contains(m)) fin(false); }).observe(document.body, { childList: true });
  });
  KK.formData = f => { const o = {}; new FormData(f).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; }); return o; };
  KK.submit = (form, fn) => form.addEventListener('submit', async e => {
    e.preventDefault(); const btn = $('button[type=submit]', form), old = btn ? btn.textContent : ''; let er = $('.err', form); if (er) er.remove();
    if (btn) { btn.disabled = true; btn.textContent = 'Please wait…'; }
    try { await fn(KK.formData(form)); } catch (x) { er = document.createElement('div'); er.className = 'err'; er.textContent = x.message; form.appendChild(er); }
    finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  });
  KK.field = (label, name, val = '', o = {}) => `<div><label class="lab" for="f_${name}">${esc(label)}</label>${o.select ? `<select class="inp" id="f_${name}" name="${name}" ${o.req ? 'required' : ''}>${o.select.map(x => { const [v, t] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select>` : o.area ? `<textarea class="inp" id="f_${name}" name="${name}" rows="3" ${o.req ? 'required' : ''}>${esc(val)}</textarea>` : `<input class="inp" id="f_${name}" name="${name}" type="${o.type || 'text'}" value="${esc(val)}" ${o.req ? 'required' : ''} ${o.step ? `step="${o.step}"` : ''} ${o.min !== undefined ? `min="${o.min}"` : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.ro ? 'readonly' : ''} autocomplete="${o.ac || 'off'}">`}</div>`;
  KK.pager = (total, offset, limit) => { const pages = Math.max(1, Math.ceil(total / limit)), cur = Math.floor(offset / limit) + 1; return `<div class="pager"><span>${total ? `Showing ${offset + 1}–${Math.min(total, offset + limit)} of ${total}` : 'No results'}</span><span><button class="btn s o" data-pg="${cur - 1}" ${cur <= 1 ? 'disabled' : ''}>‹ Prev</button> <span style="margin:0 8px">Page ${cur} / ${pages}</span> <button class="btn s o" data-pg="${cur + 1}" ${cur >= pages ? 'disabled' : ''}>Next ›</button></span></div>`; };

  /* ---------- charts (inline SVG, no external libraries) ---------- */
  const niceMax = v => { if (v <= 0) return 10; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
  const kfmt = v => (v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0).replace(/\.0$/, '') + 'k' : String(Math.round(v)));
  KK.barChart = (labels, series, h = 210) => {
    const W = 640, pad = 40, mx = niceMax(Math.max(1, ...series.flatMap(s => s.vals)) * 1.05); let o = `<svg class="chart" viewBox="0 0 ${W} ${h + 28}" role="img" aria-label="Bar chart">`;
    for (let i = 0; i <= 4; i++) { const y = 8 + (h - 8) * i / 4; o += `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="#e5e7eb" stroke-dasharray="3"/><text x="0" y="${y + 4}" font-size="11" fill="#9ca3af">${kfmt(mx * (1 - i / 4))}</text>`; }
    const gw = (W - pad) / labels.length, bw = Math.min(26, gw * 0.7 / series.length);
    labels.forEach((l, i) => { const x0 = pad + i * gw + (gw - bw * series.length - 3 * (series.length - 1)) / 2; series.forEach((s, j) => { const bh = (h - 8) * (s.vals[i] || 0) / mx; o += `<rect x="${x0 + j * (bw + 3)}" y="${h - bh}" width="${bw}" height="${Math.max(0, bh)}" rx="4" fill="${s.color}"><title>${esc(l)}: ${KK.peso(s.vals[i])}</title></rect>`; }); o += `<text x="${pad + i * gw + gw / 2}" y="${h + 18}" font-size="11" fill="#6b7280" text-anchor="middle">${esc(l)}</text>`; });
    return o + '</svg>';
  };
  KK.lineChart = (labels, actual, forecast, h = 190) => {
    const W = 640, pad = 40, all = forecast !== null && forecast !== undefined ? actual.concat([forecast]) : actual, mx = niceMax(Math.max(1, ...all) * 1.1), st = (W - pad - 12) / Math.max(1, all.length - 1);
    const pt = (i, v) => [pad + i * st, h - (h - 8) * v / mx]; let o = `<svg class="chart" viewBox="0 0 ${W} ${h + 28}" role="img" aria-label="Sales trend">`;
    for (let i = 0; i <= 3; i++) { const y = 8 + (h - 8) * i / 3; o += `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="#e5e7eb"/><text x="0" y="${y + 4}" font-size="11" fill="#9ca3af">${kfmt(mx * (1 - i / 3))}</text>`; }
    o += `<polyline fill="none" stroke="#0038a8" stroke-width="3" points="${actual.map((v, i) => pt(i, v).join(',')).join(' ')}"/>`;
    if (all.length > actual.length) o += `<polyline fill="none" stroke="#ce1126" stroke-width="3" stroke-dasharray="6 4" points="${[actual.length - 1, actual.length].map(i => pt(i, all[i]).join(',')).join(' ')}"/>`;
    all.forEach((v, i) => { const [x, y] = pt(i, v); o += `<circle cx="${x}" cy="${y}" r="4" fill="${i < actual.length ? '#0038a8' : '#ce1126'}"><title>${KK.peso(v)}</title></circle>`; });
    labels.forEach((l, i) => { o += `<text x="${pad + i * st}" y="${h + 18}" font-size="11" fill="#6b7280" text-anchor="middle">${esc(l)}</text>`; });
    return o + '</svg>';
  };
  KK.donut = (parts, top, bottom) => {
    const r = 56, c = 2 * Math.PI * r, total = parts.reduce((a, p) => a + p.v, 0) || 1; let off = 0, o = '<svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label="Payment methods"><g transform="rotate(-90 75 75)"><circle cx="75" cy="75" r="56" fill="none" stroke="#f3f4f6" stroke-width="20"/>';
    parts.forEach(p => { const d = c * p.v / total; if (d > 0) o += `<circle cx="75" cy="75" r="${r}" fill="none" stroke="${p.color}" stroke-width="20" stroke-dasharray="${Math.max(0, d - 1.5)} ${c - d + 1.5}" stroke-dashoffset="${-off}"/>`; off += d; });
    return o + `</g><text x="75" y="73" text-anchor="middle" font-size="15" font-weight="800">${esc(top)}</text><text x="75" y="89" text-anchor="middle" font-size="9.5" fill="#6b7280">${esc(bottom)}</text></svg>`;
  };
  KK.hbars = (items, fmt = KK.peso0, color = 'var(--g2)') => { const mx = Math.max(1, ...items.map(i => i.v)); return items.length ? items.map(i => `<div style="margin:9px 0"><div class="li" style="padding:0;border:0"><span>${esc(i.name)}</span><b>${fmt(i.v)}</b></div><div class="bar"><div style="width:${Math.max(2, 100 * i.v / mx)}%;background:${color}"></div></div></div>`).join('') : '<div class="empty">No data yet.</div>'; };
  KK.heat = (grid, hours, days) => { const mx = Math.max(1, ...grid.flat()); return `<div class="tw"><table class="hm"><tr><th></th>${hours.map(h => `<th>${h}</th>`).join('')}</tr>${grid.map((r, i) => `<tr><th>${days[i]}</th>${r.map(v => { const t = v / mx; return `<td title="${v} sales" style="background:rgba(0,56,168,${(0.08 + t * 0.92).toFixed(2)});color:${t > .5 ? '#fff' : '#0038a8'}">${v}</td>`; }).join('')}</tr>`).join('')}</table></div>`; };

  /* ---------- receipt ---------- */
  KK.receiptHtml = s => {
    const st = S.cfg.store, line = (a, b, bold) => `<div class="rl" ${bold ? 'style="font-weight:bold;font-size:15px"' : ''}><span>${a}</span><span>${b}</span></div>`;
    let o = `<div class="receipt"><div class="c"><b style="font-size:16px">${esc(st.name.toUpperCase())}</b><br>${esc(st.address)}<br>${esc(st.phone)}</div><hr>Receipt: <b>${esc(s.code)}</b>${s.status === 'voided' ? ' <b>(VOIDED)</b>' : ''}<br>Date: ${esc(KK.fdt(s.created_at))}<br>Cashier: ${esc(s.cashier_name || '—')}<br>Customer: ${esc(s.customer_name || 'Walk-in customer')}<hr>`;
    o += s.items.map(i => `<div>${esc(i.name)}</div>${line(`&nbsp;&nbsp;${i.qty} × ${KK.peso(i.price)}`, KK.peso(i.qty * i.price))}`).join('') + '<hr>';
    if (s.discount > 0) o += line('Subtotal', KK.peso(s.subtotal)) + line('Discount', '-' + KK.peso(s.discount));
    o += line('TOTAL', KK.peso(s.total), true);
    if (s.payment_type === 'cash') o += line('Payment', 'Cash') + line('Received', KK.peso(s.amount_received)) + line('Change', KK.peso(s.change_due));
    else if (s.payment_type === 'ewallet') o += line('Payment', 'E-wallet') + (s.reference ? line('Ref', esc(s.reference)) : '');
    else { o += line('Payment', 'Utang (Credit)'); if (s.amount_received > 0) o += line('Down payment', KK.peso(s.amount_received)); if (s.credit) o += line('Balance owed', KK.peso(s.credit.amount)) + line('Due date', KK.fd(s.credit.due_date)); if (s.customer_balance !== null) o += line('Total utang', KK.peso(s.customer_balance)); }
    return o + '<hr><div class="c">Salamat po! Balik kayo.<br>Powered by Kita Kita</div></div>';
  };
  KK.printReceipt = () => { document.body.classList.add('print-receipt'); window.print(); setTimeout(() => document.body.classList.remove('print-receipt'), 500); };
  KK.showReceipt = (sale, { canVoid = false, onVoid } = {}) => {
    const m = KK.modal('Receipt · ' + sale.code, `${KK.receiptHtml(sale)}<div class="no-print" style="display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap"><button class="btn g" data-print>🖨 Print</button><button class="btn o" data-copy>Copy text</button>${canVoid && sale.status === 'completed' ? '<button class="btn r" data-void>Void sale</button>' : ''}<button class="btn o" data-close>Close</button></div>`);
    $('[data-print]', m).onclick = KK.printReceipt;
    $('[data-copy]', m).onclick = () => { const t = m.querySelector('.receipt').innerText; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => KK.toast('Receipt copied', 'ok'), () => KK.toast('Copy is not available in this browser', 'bad')); };
    const v = $('[data-void]', m); if (v) v.onclick = async () => { if (!await KK.confirm(`Void ${sale.code}? Stock will be returned and any utang cancelled.`, 'Void sale', true)) return; try { await KK.api(`/sales/${sale.id}/void`, { method: 'POST', body: {} }); m.remove(); KK.toast('Sale voided', 'ok'); if (onVoid) onVoid(); } catch (e) { KK.toast(e.message, 'bad'); } };
    return m;
  };

  /* ---------- auth screens ---------- */
  const heroLi = a => `<ul>${a.map(x => `<li>✓ ${x}</li>`).join('')}</ul>`;
  KK.staffLogin = () => {
    $('#app').innerHTML = `<div class="auth"><div class="hero"><div class="logo" style="font-size:26px;margin:0"><b>K</b>Kita Kita</div><h1>Alamin ang tunay na<br>kita ng tindahan mo.</h1><p>Sales, inventory, and utang in one place. Plain-language insights for sari-sari store owners.</p>${heroLi(['Real-time sales &amp; profit dashboards', 'Low-stock and near-expiry alerts', 'Utang tracking with due dates &amp; partial payments', 'Works on phones and computers'])}</div>
    <div class="form"><form class="box" id="lf" novalidate><h2>Staff Login</h2><p class="mu" style="margin:4px 0 16px">For the store owner and cashiers only</p>
    <div class="tabs" style="width:100%;margin-bottom:6px"><button type="button" class="on" data-role="admin" style="flex:1">Admin</button><button type="button" data-role="cashier" style="flex:1">Cashier</button></div>
    ${KK.field('Email', 'identifier', '', { type: 'email', req: true, ac: 'username' })}${KK.field('Password', 'password', '', { type: 'password', req: true, ac: 'current-password' })}
    <button class="btn g block" type="submit" style="margin-top:18px;padding:12px">Log in as Admin</button>
    <p style="text-align:center;margin-top:16px" class="mu">Are you a customer? <a href="#/customer"><b>Go to Customer Login →</b></a></p></form></div></div>`;
    let role = 'admin'; const form = $('#lf'), btn = $('button[type=submit]', form);
    KK.$$('[data-role]', form).forEach(b => b.onclick = () => { role = b.dataset.role; KK.$$('[data-role]', form).forEach(x => x.classList.toggle('on', x === b)); btn.textContent = 'Log in as ' + KK.cap(role); });
    KK.submit(form, async d => { const r = await KK.api('/auth/login', { method: 'POST', body: { identifier: d.identifier, password: d.password, portal: 'staff' } }); if (r.user.role !== role) { throw new Error(`This account is a ${r.user.role}. Choose the ${KK.cap(r.user.role)} tab.`); } KK.setSession(r); });
  };
  KK.ownerSetup = () => {
    $('#app').innerHTML = `<div class="auth"><div class="hero"><div class="logo" style="font-size:26px;margin:0"><b>K</b>Kita Kita</div><h1>Create your store owner account.</h1><p>This empty database has no demo data. Set up your owner account to begin.</p>${heroLi(['You control this store account', 'Create customer accounts after setup', 'Use a unique password with at least 12 characters'])}</div>
    <div class="form"><form class="box" id="of" novalidate><h2>First-time setup</h2><p class="mu" style="margin:4px 0 16px">This can only be done once.</p>
    ${KK.field('Owner name', 'name', '', { req: true, ac: 'name' })}${KK.field('Owner email', 'email', '', { type: 'email', req: true, ac: 'email' })}${KK.field('Password (at least 12 characters)', 'password', '', { type: 'password', req: true, ac: 'new-password' })}${KK.field('Confirm password', 'confirm', '', { type: 'password', req: true, ac: 'new-password' })}
    <button class="btn g block" type="submit" style="margin-top:18px;padding:12px">Create owner account</button></form></div></div>`;
    KK.submit($('#of'), async d => {
      if (d.password !== d.confirm) throw new Error('Passwords do not match');
      const r = await KK.api('/setup/owner', { method: 'POST', body: { name: d.name, email: d.email, password: d.password } });
      S.cfg.setup_required = false; KK.setSession(r);
    });
  };
  KK.customerLogin = () => {
    $('#app').innerHTML = `<div class="auth"><div class="hero cu"><div class="logo" style="font-size:26px;margin:0"><b>K</b>Kita Kita</div><div style="color:#fde68a;font-weight:700;letter-spacing:.1em;font-size:12px;margin-top:40px">CUSTOMER PORTAL</div><h1 style="margin-top:8px">Tingnan ang utang mo<br>anumang oras.</h1><p style="color:#dbeafe">Check your balance, due dates, purchases and payments from your phone — no need to ask at the store.</p>${heroLi(['See available products and prices', 'Personal credit balance &amp; payment deadlines', 'Request to buy on credit', 'Pay by cash or e-wallet, view payment history'])}</div>
    <div class="form"><div class="box"><h2 id="ct">Customer Login</h2><p class="mu" style="margin:4px 0 12px">Log in to view your account</p><div class="tabs" style="width:100%"><button class="on" data-m="in" style="flex:1">Log in</button><button data-m="up" style="flex:1">Create account</button></div>
    <form id="cf" novalidate>${KK.field('Mobile number or email', 'identifier', '', { req: true, ac: 'username' })}${KK.field('Password', 'password', '', { type: 'password', req: true, ac: 'current-password' })}<button class="btn g block" type="submit" style="margin-top:18px;padding:12px">Log in</button></form>
    <form id="rf" novalidate hidden>${KK.field('Full name', 'name', '', { req: true, ac: 'name' })}${KK.field('Mobile number', 'phone', '', { req: true, type: 'tel', ac: 'tel' })}${KK.field('Email (optional)', 'email', '', { type: 'email', ac: 'email' })}${KK.field('Create password (min. 6 characters)', 'password', '', { type: 'password', req: true, ac: 'new-password' })}<button class="btn block" type="submit" style="margin-top:18px;padding:12px">Register</button><p class="tag" style="margin-top:8px">New accounts start with no credit. The owner sets your credit limit. If the store already has your number, ask the owner to create your login.</p></form>
    <p style="text-align:center;margin-top:16px" class="mu">Store staff? <a href="#/"><b>Staff Login →</b></a></p></div></div></div>`;
    KK.$$('[data-m]').forEach(b => b.onclick = () => { const up = b.dataset.m === 'up'; KK.$$('[data-m]').forEach(x => x.classList.toggle('on', x === b)); $('#cf').hidden = up; $('#rf').hidden = !up; $('#ct').textContent = up ? 'Create account' : 'Customer Login'; });
    KK.submit($('#cf'), async d => KK.setSession(await KK.api('/auth/login', { method: 'POST', body: { identifier: d.identifier, password: d.password, portal: 'customer' } })));
    KK.submit($('#rf'), async d => KK.setSession(await KK.api('/auth/register', { method: 'POST', body: d })));
  };
  KK.setSession = r => { S.token = r.token; S.user = r.user; try { localStorage.setItem('kk_token', r.token); } catch (e) { /* ignore */ } KK.go(r.user.role === 'cashier' ? 'pos' : 'dashboard'); };
  KK.logout = async (silent) => {
    if (!silent && S.token) { try { await KK.api('/auth/logout', { method: 'POST', body: {} }); } catch (e) { /* ignore */ } }
    const wasCustomer = S.user && S.user.role === 'customer'; S.token = null; S.user = null; S.alerts = null; try { localStorage.removeItem('kk_token'); } catch (e) { /* ignore */ }
    document.querySelectorAll('.modal-back').forEach(m => m.remove()); KK.go(wasCustomer ? 'customer' : '');
  };
  KK.changePassword = () => {
    const m = KK.modal('Change password', `<form id="pw">${KK.field('Current password', 'current', '', { type: 'password', req: true, ac: 'current-password' })}${KK.field('New password (min. 6 characters)', 'next', '', { type: 'password', req: true, ac: 'new-password' })}<button class="btn g block" type="submit" style="margin-top:16px">Update password</button></form>`);
    KK.submit($('#pw', m), async d => { await KK.api('/auth/change-password', { method: 'POST', body: d }); m.remove(); KK.toast('Password updated', 'ok'); });
  };

  /* ---------- layout & router ---------- */
  const STAFF_NAV = [['dashboard', '◧', 'Dashboard', ['admin']], ['insights', '✦', 'Insights', ['admin']], ['pos', '⌗', 'POS / Checkout', ['admin', 'cashier']], ['inventory', '▤', 'Inventory', ['admin', 'cashier']], ['customers', '☺', 'Customers', ['admin', 'cashier']],
    ['credit', '₱', 'Credit (Utang)', ['admin', 'cashier']], ['transactions', '⇄', 'Transactions', ['admin', 'cashier']], ['reports', '▥', 'Reports', ['admin']], ['expenses', '⚑', 'Expenses', ['admin']], ['users', '⚙', 'Users', ['admin']]];
  const PORTAL_NAV = [['dashboard', 'Dashboard'], ['products', 'Products'], ['credit', 'My Credit'], ['requests', 'Credit Requests'], ['history', 'Purchase History'], ['payments', 'Payments']];
  KK.refreshAlerts = async () => {
    if (!S.user || S.user.role === 'customer') return;
    try { S.alerts = await KK.api('/alerts'); } catch (e) { return; }
    const a = S.alerts, set = (p, n) => { const el = $(`[data-nav="${p}"]`); if (!el) return; let s = $('small', el); if (n > 0) { if (!s) { s = document.createElement('small'); el.appendChild(s); } s.textContent = n; } else if (s) s.remove(); };
    set('inventory', a.low + a.out); set('credit', a.pending_requests + a.pending_payments + a.overdue); const bell = $('#bell'); if (bell) bell.textContent = '🔔 ' + (a.low + a.out + a.near_expiry + a.overdue + a.pending_requests + a.pending_payments);
  };
  KK.showAlerts = () => {
    const a = S.alerts || {}, it = [[a.out, 'Out of stock', 'inventory?status=out'], [a.low, 'Low stock items', 'inventory?status=low'], [a.near_expiry, 'Near-expiry items', 'inventory?status=near_expiry'], [a.overdue, 'Customers with overdue utang', 'credit'], [a.pending_requests, 'Pending credit requests', 'credit?tab=requests'], [a.pending_payments, 'E-wallet payments to confirm', 'credit?tab=payments']].filter(x => x[0] > 0);
    const m = KK.modal('Alerts', it.length ? it.map(x => `<div class="li"><span><b>${x[0]}</b> ${x[1]}</span><button class="btn s o" data-go="${x[2]}">View</button></div>`).join('') : '<div class="empty">All good! No alerts right now. 🎉</div>');
    KK.$$('[data-go]', m).forEach(b => b.onclick = () => { m.remove(); KK.go(b.dataset.go); });
  };
  const shellStaff = () => {
    const u = S.user, nav = STAFF_NAV.filter(n => n[3].includes(u.role));
    $('#app').innerHTML = `<div class="shell" data-shell="staff"><aside class="side" id="side"><div class="logo"><b>K</b>Kita Kita</div>${nav.map(n => `<button class="nav" data-nav="${n[0]}"><i>${n[1]}</i>${n[2]}</button>`).join('')}
    <div class="sidefoot"><div class="me"><div class="av">${esc(KK.initials(u.name))}</div><div><div style="color:#fff;font-weight:700">${esc(u.name)}</div><div class="tag" style="color:#bbf7d0">${u.role === 'admin' ? 'Owner / Admin' : 'Cashier'}</div></div></div>
    <button class="nav" id="pwbtn"><i>🔑</i>Change password</button><button class="nav" id="outbtn"><i>⎋</i>Log out</button></div></aside>
    <div class="main"><header class="top"><button class="burger" id="burger" aria-label="Menu">☰</button><div><h1 id="ttl"></h1><p id="sub"></p></div><div class="sp"><span class="chip hide-sm" id="clock"></span><button class="chip" id="bell" aria-label="Alerts">🔔</button></div></header><div id="viewbox"></div></div></div>`;
    KK.$$('[data-nav]').forEach(b => b.onclick = () => { $('#side').classList.remove('open'); KK.go(b.dataset.nav); });
    $('#outbtn').onclick = () => KK.logout(); $('#pwbtn').onclick = KK.changePassword; $('#bell').onclick = KK.showAlerts; $('#burger').onclick = () => $('#side').classList.toggle('open');
    const tick = () => { const c = $('#clock'); if (!c) return clearInterval(S.clock); const d = new Date(); c.textContent = d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }); };
    tick(); clearInterval(S.clock); S.clock = setInterval(tick, 30000);
  };
  const shellPortal = () => {
    const u = S.user;
    $('#app').innerHTML = `<div data-shell="portal"><nav class="ctop"><div class="logo"><b>K</b>Kita Kita</div>${PORTAL_NAV.map(n => `<button class="t" data-nav="${n[0]}">${n[1]}</button>`).join('')}<div class="who"><div class="av">${esc(KK.initials(u.name))}</div><span class="hide-sm">${esc(u.name)}</span><button class="btn s o" id="pwbtn">Password</button><button class="btn s" id="outbtn">Log out</button></div></nav><div id="viewbox"></div></div>`;
    KK.$$('[data-nav]').forEach(b => b.onclick = () => KK.go(b.dataset.nav)); $('#outbtn').onclick = () => KK.logout(); $('#pwbtn').onclick = KK.changePassword;
  };
  KK.route = async () => {
    const h = location.hash.replace(/^#\/?/, ''), [pathq, ...rest] = h.split('/'), [path, query = ''] = pathq.split('?'), args = rest, params = new URLSearchParams(query);
    if (!S.user) { if (S.token) { try { S.user = (await KK.api('/auth/me')).user; } catch (e) { S.token = null; } } }
    if (!S.user) return S.cfg.setup_required ? KK.ownerSetup() : path === 'customer' ? KK.customerLogin() : KK.staffLogin();
    const portal = S.user.role === 'customer', routes = portal ? KK.portalRoutes : KK.staffRoutes, kind = portal ? 'portal' : 'staff';
    const home = portal || S.user.role === 'admin' ? 'dashboard' : 'pos', key = path || home, def = routes[key];
    if (!def || (def.roles && !def.roles.includes(S.user.role))) { location.replace('#/' + home); return KK.route(); }
    if (!$(`[data-shell="${kind}"]`)) (portal ? shellPortal : shellStaff)();
    KK.$$('[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === key));
    const box = $('#viewbox'), v = document.createElement('div'); v.className = 'view'; v.innerHTML = '<div class="boot">Loading…</div>'; box.replaceChildren(v); const my = ++S.rt;
    if (!portal) { $('#ttl').textContent = def.title; $('#sub').textContent = def.sub || ''; }
    document.title = `${def.title} · Kita Kita`; window.scrollTo(0, 0);
    try { await def.render(v, { args, params, stale: () => my !== S.rt }); } catch (e) { if (my === S.rt) v.innerHTML = `<div class="card"><div class="err" style="margin:0">${esc(e.message || 'Something went wrong')}</div><button class="btn o" style="margin-top:12px" onclick="location.reload()">Reload page</button></div>`; }
    if (!portal && my === S.rt) KK.refreshAlerts();
  };
  KK.init = async () => {
    try { const c = await fetch('/api/config').then(r => r.json()); S.cfg = c; } catch (e) { /* defaults */ }
    window.addEventListener('hashchange', KK.route); await KK.route();
  };
})();
