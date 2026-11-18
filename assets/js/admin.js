// ================= AMORIÊ — painel administrativo =================
import { api, IS_DEMO } from './api.js';
import {
  $, $$, esc, BRL, digits, norm, toast, icon, ICON_NAMES, logoHTML, effPrice, isPromo, maskPhone, hideCPF, fmtPhone,
  waLink, moneyIn, moneyOut, dateBR, ago, MES, STATUS, PAY, payText, round2, uid, store,
} from './util.js';

let D = null; // dados carregados
let tab = store.get('amorie_adm_tab', 'dash');
const ui = { period: 'mes', from: '', to: '', oStatus: 'todos', oRange: 'todos', oq: '', cartTab: 'abandonados', cq: '', fiel: false, pq: '', pcat: 'todas' };

/* ---------- utilidades de período ---------- */
const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mon = d => addD(sod(d), -((d.getDay() + 6) % 7));
const firstM = (d, k = 0) => new Date(d.getFullYear(), d.getMonth() - k, 1);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function range(key) {
  const now = new Date(), t = sod(now), tm = addD(t, 1);
  switch (key) {
    case 'hoje': return { a: t, b: tm, pa: addD(t, -1), pb: t, l: 'Hoje', vs: 'ontem' };
    case 'ontem': return { a: addD(t, -1), b: t, pa: addD(t, -2), pb: addD(t, -1), l: 'Ontem', vs: 'anteontem' };
    case '3d': return { a: addD(t, -2), b: tm, pa: addD(t, -5), pb: addD(t, -2), l: 'Últimos 3 dias', vs: '3 dias anteriores' };
    case '7d': return { a: addD(t, -6), b: tm, pa: addD(t, -13), pb: addD(t, -6), l: 'Últimos 7 dias', vs: '7 dias anteriores' };
    case 'semana': return { a: mon(now), b: tm, pa: addD(mon(now), -7), pb: addD(tm, -7), l: 'Esta semana', vs: 'mesmo período da semana passada' };
    case 'semana_passada': return { a: addD(mon(now), -7), b: mon(now), pa: addD(mon(now), -14), pb: addD(mon(now), -7), l: 'Semana passada', vs: 'semana anterior' };
    case 'mes': return { a: firstM(now), b: tm, pa: firstM(now, 1), pb: addD(firstM(now, 1), Math.round((tm - firstM(now)) / 864e5)), l: 'Este mês', vs: 'mesmo período do mês passado' };
    case 'mes_passado': return { a: firstM(now, 1), b: firstM(now), pa: firstM(now, 2), pb: firstM(now, 1), l: 'Mês passado (' + MES[firstM(now, 1).getMonth()] + ')', vs: 'mês anterior' };
    case 'mes_retrasado': return { a: firstM(now, 2), b: firstM(now, 1), pa: firstM(now, 3), pb: firstM(now, 2), l: 'Mês retrasado (' + MES[firstM(now, 2).getMonth()] + ')', vs: 'mês anterior' };
    case '12m': return { a: firstM(now, 11), b: tm, pa: firstM(now, 23), pb: firstM(now, 11), l: 'Últimos 12 meses', vs: '12 meses anteriores' };
    case 'ano': return { a: new Date(now.getFullYear(), 0, 1), b: tm, pa: new Date(now.getFullYear() - 1, 0, 1), pb: addD(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()), 1), l: 'Este ano', vs: 'mesmo período do ano passado' };
    case 'custom': {
      const a = ui.from ? new Date(ui.from + 'T00:00:00') : addD(t, -29); const b = ui.to ? addD(new Date(ui.to + 'T00:00:00'), 1) : tm;
      const len = Math.max(1, Math.round((b - a) / 864e5));
      return { a, b, pa: addD(a, -len), pb: a, l: `${dateBR(a)} a ${dateBR(addD(b, -1))}`, vs: `${len} dias anteriores` };
    }
  }
}
const PERIODS = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['3d', '3 dias'], ['7d', '7 dias'], ['semana', 'Esta semana'], ['semana_passada', 'Semana passada'], ['mes', 'Este mês'], ['mes_passado', 'Mês passado'], ['mes_retrasado', 'Mês retrasado'], ['12m', '12 meses'], ['ano', 'Este ano'], ['custom', 'Personalizado']];
const valid = () => D.orders.filter(o => o.status !== 'cancelado');
function sumR(a, b) { let v = 0, n = 0; const os = []; valid().forEach(o => { const t = new Date(o.created_at); if (t >= a && t < b) { v += +o.total || 0; n++; os.push(o); } }); return { v: round2(v), n, os }; }
function delta(a, b) { if (!b) return a ? '<span class="up">novo</span>' : '<span class="muted">—</span>'; const p = (a - b) / b * 100; return `<span class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}%</span>`; }
const abbr = v => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',') + ' mil' : String(Math.round(v));

/* ---------- clientes (identificados por CPF, WhatsApp ou conta) ---------- */
function customers() {
  const prof = Object.fromEntries((D.profiles || []).map(p => [p.id, p]));
  const phoneToCpf = {}; D.orders.forEach(o => { if (o.cpf && o.whatsapp) phoneToCpf[digits(o.whatsapp)] = digits(o.cpf); });
  const map = {};
  valid().forEach(o => {
    const cpf = digits(o.cpf) || phoneToCpf[digits(o.whatsapp)] || digits(prof[o.user_id]?.cpf);
    const k = cpf || digits(o.whatsapp) || o.user_id || o.customer_name;
    const c = map[k] || (map[k] = { key: k, name: o.customer_name, whatsapp: o.whatsapp, cpf: '', count: 0, total: 0, first: o.created_at, last: o.created_at, user_id: o.user_id });
    c.count++; c.total = round2(c.total + (+o.total || 0)); if (cpf) c.cpf = cpf;
    if (o.created_at < c.first) c.first = o.created_at; if (o.created_at >= c.last) { c.last = o.created_at; c.name = o.customer_name || c.name; c.whatsapp = o.whatsapp || c.whatsapp; }
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}
function abandoned() {
  const h = +D.settings.abandonHours || 1; const lim = Date.now() - h * 36e5;
  return D.carts.filter(c => c.status === 'open' && (c.items || []).length && new Date(c.updated_at) < lim && (c.whatsapp || c.user_id));
}
function cartName(c) { const p = (D.profiles || []).find(x => x.id === c.user_id); return c.name || p?.name || 'Cliente'; }
function cartWa(c) { const p = (D.profiles || []).find(x => x.id === c.user_id); return c.whatsapp || p?.whatsapp || ''; }

/* ---------- gráfico de barras (1 série, com tooltip) ---------- */
function barChart(data, { h = 200, cur = -1 } = {}) {
  const max = Math.max(1, ...data.map(d => d.v)); const bw = data.length > 16 ? 24 : 34, gap = 2, W = data.length * (bw + gap), top = 22, bot = 26, ch = h - top - bot;
  const every = data.length > 16 ? 3 : 1; const bwi = bw - 10;
  const bars = data.map((d, i) => {
    const bh = d.v ? Math.max(3, Math.round(d.v / max * ch)) : 0, x = i * (bw + gap) + 5, y = top + ch - bh;
    const r = Math.min(4, bh / 2);
    const path = bh ? `M${x},${top + ch} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - 10 - r} Q${x + bw - 10},${y} ${x + bw - 10},${y + r} V${top + ch} Z` : '';
    return `<g><rect class="hit" x="${x - 3}" y="${top}" width="${bw}" height="${ch}" fill="transparent" data-tip="${esc(d.tip || (d.l + ': ' + BRL(d.v)))}" data-x="${x + (bw - 10) / 2}" data-y="${y}"/>${path ? `<path class="bar ${i === cur ? 'cur' : ''}" d="${path}" pointer-events="none"/>` : ''}
      ${i === cur && d.v ? `<text x="${x + (bw - 10) / 2}" y="${y - 6}" text-anchor="middle" font-size="10.5" fill="#3A1726" font-family="Poppins" font-weight="600">${abbr(d.v)}</text>` : ''}
      ${i % every === 0 || i === cur ? `<text x="${x + (bw - 10) / 2}" y="${h - 8}" text-anchor="middle" font-size="10" fill="#94707F" font-family="Poppins">${esc(d.l)}</text>` : ''}</g>`;
  }).join('');
  return `<div class="chart"><div class="tip"></div><svg viewBox="0 0 ${W + 10} ${h}" style="width:100%;min-width:${Math.round(W * 0.82)}px" role="img" aria-label="Gráfico de faturamento">
    <line x1="0" x2="${W + 10}" y1="${top + ch}" y2="${top + ch}" stroke="#F0D6E0"/>${bars}</svg></div>`;
}
function bindCharts() {
  $$('.chart').forEach(ch => {
    const tip = $('.tip', ch); const svg = $('svg', ch);
    const show = e => { const r = e.target.closest('[data-tip]'); if (!r) return tip.classList.remove('on'); const box = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal; const sx = box.width / vb.width; tip.textContent = r.dataset.tip; tip.style.left = (+r.dataset.x * sx + svg.getBoundingClientRect().left - ch.getBoundingClientRect().left + ch.scrollLeft) + 'px'; tip.style.top = Math.max(18, +r.dataset.y * sx) + 'px'; tip.classList.add('on'); };
    svg.addEventListener('mousemove', show); svg.addEventListener('click', show); svg.addEventListener('mouseleave', () => tip.classList.remove('on'));
  });
}
const hbars = (rows, fmt = v => v) => { const m = Math.max(1, ...rows.map(r => r[1])); return `<div class="bars-h">${rows.map(([l, v]) => `<div class="bh"><span>${esc(l)}</span><b>${fmt(v)}</b><div class="track"><i style="width:${Math.max(2, v / m * 100)}%"></i></div></div>`).join('') || '<p class="muted">Sem dados no período.</p>'}</div>`; };

/* ---------- modal ---------- */
function openModal(title, html, wide) { $('#modal').classList.toggle('wide', !!wide); $('#modalBox').innerHTML = `<div class="mhead"><h3>${title}</h3><button class="iconbtn" data-act="close" aria-label="Fechar">${icon('close')}</button></div><div class="mbody">${html}</div>`; $('#modal').classList.add('on'); $('#ov').classList.add('on'); document.body.classList.add('lock'); }
function closeModal() { $('#modal').classList.remove('on'); $('#ov').classList.remove('on'); document.body.classList.remove('lock'); }

/* ---------- login ---------- */
function loginView() {
  $('#app').innerHTML = `<div class="login"><div class="box">${logoHTML(D?.settings || {})}
    <h2>Painel administrativo</h2><p class="muted" style="font-size:13px">Acesso restrito à equipe AMORIÊ</p>
    <input class="inp pin" id="pin" type="password" inputmode="numeric" maxlength="12" placeholder="••••" autocomplete="current-password" aria-label="Senha do painel">
    <button class="btn btn-pri btn-block mt2" data-act="login">Entrar</button>
    <a class="btn btn-ghost btn-block mt" href="index.html">Voltar para a loja</a>
    ${IS_DEMO ? '<p class="hint mt">Modo demonstração. Senha inicial: 0202</p>' : ''}</div></div>`;
  setTimeout(() => $('#pin')?.focus(), 80);
}
async function doLogin() {
  const pin = $('#pin').value.trim(); if (!pin) return;
  const b = $('[data-act=login]'); b.disabled = true;
  try { await api.adminLogin(pin); await reload(); } catch (e) { toast(e.message); $('#pin').value = ''; } finally { if (b) b.disabled = false; }
}

/* ---------- estrutura ---------- */
async function reload(keepScroll) { const y = scrollY; D = await api.adminLoad(); shell(); if (keepScroll) scrollTo(0, y); }
function shell() {
  const ab = abandoned().length, novos = D.orders.filter(o => o.status === 'novo').length;
  const tabs = [['dash', 'Dashboard', 'chart'], ['pedidos', 'Pedidos', 'box', novos], ['carrinhos', 'Carrinhos', 'cart', ab], ['clientes', 'Clientes', 'users'], ['produtos', 'Produtos', 'tag'], ['categorias', 'Categorias', 'lingerie'], ['cupons', 'Cupons', 'ticket'], ['config', 'Configurações', 'cog']];
  $('#app').innerHTML = `<div class="adm-top"><div class="wrap"><div class="bar"><div class="t">${logoHTML(D.settings)}<small>Painel</small></div>
    <button class="iconbtn" data-act="refresh" title="Atualizar">${icon('arrow')}</button><a class="iconbtn" href="index.html" title="Ver loja">${icon('store')}</a><button class="iconbtn" data-act="logout" title="Sair">${icon('out')}</button></div></div>
    <nav class="tabs">${tabs.map(([k, l, ic, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${icon(ic)}${l}${n ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</nav></div>
    <div class="adm-body" id="body"></div>`;
  ({ dash, pedidos, carrinhos, clientes, produtos, categorias, cupons, config })[tab]();
}

/* ---------- DASHBOARD ---------- */
function dash() {
  const hasDemo = D.orders.some(o => o.demo);
  const quick = ['hoje', 'ontem', '3d', '7d', 'semana', 'semana_passada', 'mes', 'mes_passado', 'mes_retrasado'].map(k => { const r = range(k); const c = sumR(r.a, r.b), p = sumR(r.pa, r.pb); return `<div class="kpi ${k === 'hoje' || k === 'mes' ? 'hl' : ''}"><small>${r.l}</small><b>${BRL(c.v)}</b><div class="d">${c.n} pedido${c.n === 1 ? '' : 's'} · ${delta(c.v, p.v)}</div></div>`; }).join('');
  const r = range(ui.period); const cur = sumR(r.a, r.b), prev = sumR(r.pa, r.pb);
  const ticket = cur.n ? cur.v / cur.n : 0, pticket = prev.n ? prev.v / prev.n : 0;
  const cs = customers(); const inP = cs.filter(c => cur.os.some(o => (digits(o.cpf) && digits(o.cpf) === c.cpf) || digits(o.whatsapp) === digits(c.whatsapp)));
  const novos = inP.filter(c => new Date(c.first) >= r.a).length, voltaram = inP.length - novos;
  const fieis = cs.filter(c => c.count >= 2);
  const statusCount = Object.keys(STATUS).map(k => [STATUS[k], D.orders.filter(o => o.status === k && new Date(o.created_at) >= r.a && new Date(o.created_at) < r.b).length]).filter(x => x[1]);
  const sold = {}; cur.os.forEach(o => o.items.forEach(i => { sold[i.name] = (sold[i.name] || 0) + i.qty; }));
  const topSold = Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const views = {}; D.events.filter(e => e.type === 'view' && new Date(e.created_at) >= r.a && new Date(e.created_at) < r.b).forEach(e => { views[e.product_id] = (views[e.product_id] || 0) + 1; });
  let topViews = Object.entries(views).map(([id, v]) => [D.products.find(p => p.id === id)?.name || '—', v]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!topViews.length) topViews = [...D.products].filter(p => p.views).sort((a, b) => b.views - a.views).slice(0, 8).map(p => [p.name, p.views]);
  // 30 dias e 12 meses
  const t = sod(new Date()); const days = []; for (let k = 29; k >= 0; k--) { const a = addD(t, -k), b = addD(a, 1); const x = sumR(a, b); days.push({ l: String(a.getDate()).padStart(2, '0'), v: x.v, tip: `${dateBR(a)}: ${BRL(x.v)} · ${x.n} pedido(s)` }); }
  const months = []; for (let k = 11; k >= 0; k--) { const a = firstM(new Date(), k), b = firstM(new Date(), k - 1); const x = sumR(a, b); months.push({ l: MES[a.getMonth()], v: x.v, n: x.n, a, k, tip: `${MES[a.getMonth()]}/${a.getFullYear()}: ${BRL(x.v)} · ${x.n} pedido(s)` }); }
  const lastWithSales = [...months].reverse().find(m => m.k > 0 && m.v > 0);
  // carrinhos e popup
  const ab = abandoned(); const abV = round2(ab.reduce((s, c) => s + +c.total, 0));
  const contacted = D.carts.filter(c => ['contacted', 'recovered'].includes(c.status)).length, recovered = D.carts.filter(c => c.status === 'recovered').length;
  const shown = D.events.filter(e => e.type === 'popup_shown' && new Date(e.created_at) >= r.a && new Date(e.created_at) < r.b).length;
  const conv = D.events.filter(e => e.type === 'popup_converted' && new Date(e.created_at) >= r.a && new Date(e.created_at) < r.b).length;

  $('#body').innerHTML = `
  ${hasDemo ? `<div class="banner"><span>Você está vendo <b>dados de demonstração</b> para apresentar o painel. Pedidos reais entram automaticamente.</span><button class="btn btn-danger btn-sm" data-act="cleardemo">Apagar dados de demonstração</button></div>` : ''}
  ${!D.orders.length ? `<div class="banner"><span>Ainda não há pedidos. Quer ver o painel funcionando com dados fictícios para apresentar?</span><button class="btn btn-pri btn-sm" data-act="seeddemo">Gerar dados de demonstração</button></div>` : ''}
  <h2>Resumo de vendas</h2><p class="muted" style="font-size:13px;margin-bottom:12px">Faturamento de pedidos não cancelados. A seta compara com o período anterior equivalente.</p>
  <div class="kpis k3">${quick}</div>

  <div class="panel"><h3>Análise por período <span class="muted">${esc(r.l)} · comparado a ${esc(r.vs)}</span></h3>
    <div class="periods">${PERIODS.map(([k, l]) => `<button class="pill ${ui.period === k ? 'on' : ''}" data-period="${k}">${l}</button>`).join('')}</div>
    ${ui.period === 'custom' ? `<div class="grid2 mt"><div class="field"><label>De</label><input class="inp" type="date" id="rFrom" value="${ui.from}"></div><div class="field"><label>Até</label><input class="inp" type="date" id="rTo" value="${ui.to}"></div></div>` : ''}
    <div class="kpis mt">
      <div class="kpi hero hl"><small>Faturamento</small><b>${BRL(cur.v)}</b><div class="d">${delta(cur.v, prev.v)} · antes ${BRL(prev.v)}</div></div>
      <div class="kpi"><small>Pedidos</small><b>${cur.n}</b><div class="d">${delta(cur.n, prev.n)} · antes ${prev.n}</div></div>
      <div class="kpi"><small>Ticket médio</small><b>${BRL(ticket)}</b><div class="d">${delta(ticket, pticket)}</div></div>
      <div class="kpi"><small>Clientes que compraram</small><b>${inP.length}</b><div class="d">${novos} novas · ${voltaram} voltaram</div></div>
    </div></div>

  <div class="cols mt2">
    <div class="panel"><h3>Clientes no período</h3>
      <div class="split">${inP.length ? `<i style="flex:${novos || 0.0001};background:var(--blush-300)"></i><i style="flex:${voltaram || 0.0001};background:var(--berry)"></i>` : '<i style="flex:1;background:var(--blush-100)"></i>'}</div>
      <div class="legend"><span><i style="background:var(--blush-300)"></i>Novas: ${novos}</span><span><i style="background:var(--berry)"></i>Voltaram a comprar: ${voltaram}</span></div>
      <div class="kpis mt" style="grid-template-columns:1fr 1fr"><div class="kpi hl"><small>Clientes fiéis (2+ compras)</small><b>${fieis.length}</b><div class="d">de ${cs.length} clientes no total</div></div><div class="kpi"><small>Taxa de retorno</small><b>${cs.length ? Math.round(fieis.length / cs.length * 100) : 0}%</b><div class="d">voltaram a comprar</div></div></div>
      <button class="btn btn-ghost btn-sm mt" data-tab="clientes">Ver clientes</button></div>
    <div class="panel"><h3>Pedidos por status <span class="muted">${esc(r.l)}</span></h3>${hbars(statusCount)}<button class="btn btn-ghost btn-sm mt" data-tab="pedidos">Ver pedidos</button></div>
  </div>

  <div class="panel"><h3>Faturamento nos últimos 30 dias <span class="muted">toque nas barras para ver o valor</span></h3>${barChart(days, { cur: 29 })}</div>
  <div class="panel"><h3>Faturamento nos últimos 12 meses ${lastWithSales ? `<span class="muted">último mês anterior com vendas: ${MES[lastWithSales.a.getMonth()]}/${lastWithSales.a.getFullYear()} (há ${lastWithSales.k} ${lastWithSales.k === 1 ? 'mês' : 'meses'})</span>` : ''}</h3>${barChart(months, { cur: 11 })}
    <div class="tscroll mt"><table class="tbl"><thead><tr><th>Mês</th><th class="r">Pedidos</th><th class="r">Faturamento</th><th class="r">vs mês anterior</th><th class="r">Há</th></tr></thead><tbody>
    ${[...months].reverse().map((m, i, arr) => `<tr><td>${MES[m.a.getMonth()]}/${m.a.getFullYear()}</td><td class="r">${m.n}</td><td class="r"><b>${BRL(m.v)}</b></td><td class="r">${arr[i + 1] ? delta(m.v, arr[i + 1].v) : ''}</td><td class="r muted">${m.k === 0 ? 'este mês' : m.k === 1 ? '1 mês' : m.k + ' meses'}</td></tr>`).join('')}</tbody></table></div></div>

  <div class="cols mt2">
    <div class="panel"><h3>Mais vendidos <span class="muted">${esc(r.l)}</span></h3>${hbars(topSold, v => v + ' un.')}</div>
    <div class="panel"><h3>Mais vistos <span class="muted">${esc(r.l)}</span></h3>${hbars(topViews, v => v + ' visitas')}</div>
  </div>
  <div class="cols mt2">
    <div class="panel"><h3>Carrinhos abandonados</h3><div class="kpis" style="grid-template-columns:1fr 1fr">
      <div class="kpi hl"><small>Aguardando contato</small><b>${ab.length}</b><div class="d">${BRL(abV)} parados na sacola</div></div>
      <div class="kpi"><small>Recuperados</small><b>${recovered}</b><div class="d">de ${contacted} contatados${contacted ? ' · ' + Math.round(recovered / contacted * 100) + '%' : ''}</div></div></div>
      <button class="btn btn-pri btn-sm mt" data-tab="carrinhos">Enviar ofertas</button></div>
    <div class="panel"><h3>Aviso ao sair da página <span class="muted">${esc(r.l)}</span></h3><div class="kpis" style="grid-template-columns:1fr 1fr">
      <div class="kpi"><small>Vezes que apareceu</small><b>${shown}</b><div class="d">cupom do produto ou convite ao grupo</div></div>
      <div class="kpi hl"><small>Aceitaram</small><b>${conv}</b><div class="d">${shown ? Math.round(conv / shown * 100) + '% de conversão' : '—'}</div></div></div></div>
  </div>`;
  bindCharts();
}

/* ---------- PEDIDOS ---------- */
function pedidos() {
  let l = [...D.orders].reverse(); const q = norm(ui.oq);
  if (ui.oStatus !== 'todos') l = l.filter(o => o.status === ui.oStatus);
  if (ui.oRange !== 'todos') { const r = range(ui.oRange); l = l.filter(o => new Date(o.created_at) >= r.a && new Date(o.created_at) < r.b); }
  if (q) l = l.filter(o => norm([o.customer_name, o.whatsapp, o.cpf, o.code].join(' ')).includes(q));
  const tot = round2(l.filter(o => o.status !== 'cancelado').reduce((s, o) => s + +o.total, 0));
  $('#body').innerHTML = `<h2>Pedidos</h2>
  <div class="toolbar mt"><button class="btn btn-pri btn-sm" data-act="manualsale">${icon('plus', 'ico', 2)} Registrar venda</button>
    <select class="sel" data-ui="oStatus"><option value="todos">Todos os status</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${ui.oStatus === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <select class="sel" data-ui="oRange"><option value="todos">Todo o período</option>${PERIODS.filter(p => p[0] !== 'custom').map(([k, v]) => `<option value="${k}" ${ui.oRange === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <input class="inp" data-ui="oq" placeholder="Buscar nome, telefone, CPF ou nº" value="${esc(ui.oq)}"></div>
  <p class="muted" style="font-size:12.5px;margin-bottom:10px">${l.length} pedido(s) · ${BRL(tot)} (sem cancelados)</p>
  ${l.slice(0, 120).map(o => `<div class="ocard"><div class="top"><div><b>${esc(o.code)}</b> <span class="st ${o.status}">${STATUS[o.status]}</span>${o.source === 'manual' ? ' <span class="st">balcão</span>' : ''}${o.demo ? ' <span class="muted" style="font-size:11px">demo</span>' : ''}<div class="muted" style="font-size:12px">${dateBR(o.created_at, true)}</div></div><b style="font-size:17px;color:var(--berry)">${BRL(o.total)}</b></div>
    <div style="font-size:13.5px;margin-top:8px"><b style="font-weight:500">${esc(o.customer_name || '—')}</b> · ${esc(fmtPhone(o.whatsapp))}${o.cpf ? ' · CPF ' + hideCPF(o.cpf) : ''}</div>
    <div class="items">${(o.items || []).map(i => `${i.qty}x ${esc(i.name)}`).join(' · ')}</div>
    <div class="muted" style="font-size:12.5px">${o.delivery_method === 'entrega' ? '🚚 Entrega' + (o.address ? ': ' + esc([o.address.street, o.address.number, o.address.complement, o.address.district].filter(Boolean).join(', ')) + (o.address.reference ? ' (ref.: ' + esc(o.address.reference) + ')' : '') : '') : '🏬 Retirada na loja'} · ${PAY[o.payment_method] || ''}${o.change_for ? ' · troco p/ ' + BRL(o.change_for) : ''}${+o.discount ? ' · desconto ' + BRL(o.discount) : ''}${o.coupon_code ? ' (' + esc(o.coupon_code) + ')' : ''}${o.notes ? ' · Obs.: ' + esc(o.notes) : ''}</div>
    <div class="acts"><select class="sel" data-ostatus="${o.id}">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${waLink(o.whatsapp, `Olá, ${(o.customer_name || '').split(' ')[0]}! Aqui é da ${D.settings.storeName} 💕 Sobre o seu pedido ${o.code}: `)}">${icon('wa')} Cliente</a>
      <button class="ib" data-odel="${o.id}" title="Excluir">${icon('trash')}</button></div></div>`).join('') || '<div class="empty">Nenhum pedido encontrado.</div>'}
  ${l.length > 120 ? '<p class="muted" style="text-align:center">Mostrando os 120 mais recentes. Use os filtros.</p>' : ''}`;
}
function manualSale() {
  openModal('Registrar venda', `<p class="muted" style="font-size:13px;margin-bottom:12px">Para vendas no balcão ou direto no WhatsApp. Entra no faturamento e na fidelização.</p>
  <div class="field"><label>Nome da cliente *</label><input class="inp" id="mName"></div>
  <div class="grid2"><div class="field"><label>WhatsApp *</label><input class="inp" id="mWa" inputmode="tel"></div><div class="field"><label>CPF</label><input class="inp" id="mCpf" inputmode="numeric"></div></div>
  <div class="field"><label>O que comprou</label><input class="inp" id="mItems" placeholder="Ex.: Óleo Ousada + Gel Ice"></div>
  <div class="grid2"><div class="field"><label>Valor total (R$) *</label><input class="inp" id="mVal" inputmode="decimal" placeholder="0,00"></div><div class="field"><label>Data</label><input class="inp" type="date" id="mDate" value="${iso(new Date())}"></div></div>
  <div class="field"><label>Pagamento</label><select class="inp" id="mPay"><option value="pix">Pix</option><option value="cartao">Cartão</option><option value="dinheiro">Dinheiro</option></select></div>
  <button class="btn btn-pri btn-block" data-act="savemanual">Salvar venda</button>`);
}

/* ---------- CARRINHOS ABANDONADOS ---------- */
function carrinhos() {
  const lists = { abandonados: abandoned(), contatados: D.carts.filter(c => c.status === 'contacted'), recuperados: D.carts.filter(c => c.status === 'recovered') };
  const l = lists[ui.cartTab];
  $('#body').innerHTML = `<h2>Carrinhos abandonados</h2><p class="muted" style="font-size:13px">Clientes que colocaram produtos na sacola e não finalizaram em ${D.settings.abandonHours || 1}h. Envie uma oferta pelo WhatsApp com cupom exclusivo.</p>
  <div class="pills mt2">${[['abandonados', 'Aguardando contato'], ['contatados', 'Contatados'], ['recuperados', 'Recuperados']].map(([k, v]) => `<button class="pill ${ui.cartTab === k ? 'on' : ''}" data-carttab="${k}">${v} (${lists[k].length})</button>`).join('')}</div>
  <div class="mt2">${l.map(c => `<div class="ocard"><div class="top"><div><b>${esc(cartName(c))}</b> <span class="st ${c.status}">${{ open: 'Abandonado', contacted: 'Contatado', recovered: 'Recuperado' }[c.status] || c.status}</span><div class="muted" style="font-size:12px">${esc(fmtPhone(cartWa(c)))} · há ${ago(c.updated_at)}${c.offer_code ? ' · cupom ' + esc(c.offer_code) : ''}</div></div><b style="font-size:17px;color:var(--berry)">${BRL(c.total)}</b></div>
    <div class="items">${(c.items || []).map(i => `${i.qty}x ${esc(i.name)}`).join(' · ')}</div>
    <div class="acts">${c.status === 'open' ? `<button class="btn btn-pri btn-sm" data-offer="${c.id}">${icon('wa')} Enviar oferta</button><button class="btn btn-ghost btn-sm" data-cartst="${c.id}" data-st="dismissed">Descartar</button>` : ''}
    ${c.status === 'contacted' ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${waLink(cartWa(c), '')}">${icon('wa')} Conversa</a><button class="btn btn-ghost btn-sm" data-cartst="${c.id}" data-st="recovered">Marcar recuperado</button>` : ''}</div></div>`).join('') || '<div class="empty">Nada por aqui no momento. 💕</div>'}</div>`;
}
function offerModal(id) {
  const c = D.carts.find(x => x.id === id);
  openModal('Enviar oferta', `<p style="font-size:14px">Para <b>${esc(cartName(c))}</b> · ${esc(fmtPhone(cartWa(c)))}</p><p class="muted" style="font-size:12.5px;margin:4px 0 14px">${(c.items || []).map(i => esc(i.name)).join(', ')} · ${BRL(c.total)}</p>
  <div class="field"><label>Desconto do cupom (%)</label><input class="inp" id="ofPct" type="number" min="1" max="90" value="${D.settings.exitPercent || 10}"></div>
  <p class="hint">O cupom vale só para essa cliente, uma vez, até o fim de amanhã. O WhatsApp abre com a mensagem pronta.</p>
  <button class="btn btn-pri btn-block mt2" data-sendoffer="${id}">${icon('wa')} Gerar cupom e abrir WhatsApp</button>`);
}

/* ---------- CLIENTES ---------- */
function clientes() {
  let cs = customers(); const all = cs; const q = norm(ui.cq);
  if (ui.fiel) cs = cs.filter(c => c.count >= 2);
  if (q) cs = cs.filter(c => norm([c.name, c.whatsapp, c.cpf].join(' ')).includes(q));
  const fiel = all.filter(c => c.count >= 2);
  const accounts = (D.profiles || []).length;
  $('#body').innerHTML = `<h2>Clientes</h2>
  <div class="kpis mt"><div class="kpi"><small>Clientes que compraram</small><b>${all.length}</b><div class="d">${accounts} com conta no site</div></div><div class="kpi hl"><small>Fiéis (2+ compras)</small><b>${fiel.length}</b></div><div class="kpi"><small>Taxa de retorno</small><b>${all.length ? Math.round(fiel.length / all.length * 100) : 0}%</b></div><div class="kpi"><small>Gasto médio da fiel</small><b>${BRL(fiel.length ? fiel.reduce((s, c) => s + c.total, 0) / fiel.length : 0)}</b></div></div>
  <div class="panel"><div class="toolbar"><input class="inp" data-ui="cq" placeholder="Buscar nome, telefone ou CPF" value="${esc(ui.cq)}"><label class="check" style="align-items:center"><span class="switch"><input type="checkbox" id="fielOnly" ${ui.fiel ? 'checked' : ''}><span></span></span> Só fiéis</label></div>
  <p class="hint" style="margin-bottom:8px">A cliente é reconhecida pelo CPF (quando informado) ou pelo WhatsApp. Comprou 2 vezes ou mais = fiel.</p>
  <div class="tscroll"><table class="tbl"><thead><tr><th>Cliente</th><th>Contato</th><th class="r">Compras</th><th class="r">Total</th><th>Última</th><th></th></tr></thead><tbody>
  ${cs.slice(0, 200).map(c => `<tr><td><b style="font-weight:500">${esc(c.name || '—')}</b> ${c.count >= 2 ? '<span class="fiel">FIEL</span>' : ''}<div class="muted" style="font-size:11.5px">CPF ${hideCPF(c.cpf)}</div></td><td>${esc(fmtPhone(c.whatsapp))}</td><td class="r">${c.count}</td><td class="r">${BRL(c.total)}</td><td class="muted">${dateBR(c.last)}</td><td><a class="ib" target="_blank" rel="noopener" href="${waLink(c.whatsapp, `Oi, ${(c.name || '').split(' ')[0]}! Aqui é da ${D.settings.storeName} 💕 `)}" title="WhatsApp">${icon('wa')}</a></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhuma cliente ainda.</td></tr>'}</tbody></table></div></div>`;
}

/* ---------- PRODUTOS ---------- */
const catName = id => D.categories.find(c => c.id === id)?.name || 'Sem categoria';
function produtos() {
  let l = D.products; const q = norm(ui.pq);
  if (ui.pcat !== 'todas') l = l.filter(p => p.category_id === ui.pcat || (p.extra_categories || []).includes(ui.pcat));
  if (q) l = l.filter(p => norm(p.name + ' ' + p.tags).includes(q));
  $('#body').innerHTML = `<h2>Produtos</h2><p class="muted" style="font-size:13px">${D.products.length} produtos · ${D.products.filter(p => p.active).length} visíveis na loja · ${D.products.filter(isPromo).length} em promoção</p>
  <div class="toolbar mt2"><button class="btn btn-pri btn-sm" data-act="newprod">${icon('plus', 'ico', 2)} Novo produto</button>
  <select class="sel" data-ui="pcat"><option value="todas">Todas as categorias</option>${D.categories.map(c => `<option value="${c.id}" ${ui.pcat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
  <input class="inp" data-ui="pq" placeholder="Buscar produto" value="${esc(ui.pq)}"></div>
  <div class="panel" style="padding-top:4px">${l.map(p => `<div class="prow"><div class="pt">${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="" loading="lazy">` : icon(D.categories.find(c => c.id === p.category_id)?.icon)}</div><div class="pn"><b>${esc(p.name)}</b><small>${esc(catName(p.category_id))} · ${isPromo(p) ? `<b style="display:inline;color:var(--rose)">${BRL(p.promo_price)}</b> <s>${BRL(p.price)}</s>` : BRL(p.price)}${p.stock != null ? ' · estoque ' + p.stock : ''}${p.featured ? ' · ★' : ''}</small></div>
    <label class="switch" title="Visível na loja"><input type="checkbox" data-pact="${p.id}" ${p.active ? 'checked' : ''}><span></span></label><button class="ib" data-pedit="${p.id}" title="Editar">${icon('edit')}</button></div>`).join('') || '<p class="muted" style="padding:14px 0">Nenhum produto.</p>'}</div>`;
}
let editImgs = [];
function editProduct(id) {
  const p = id ? D.products.find(x => x.id === id) : { name: '', category_id: D.categories[0]?.id, extra_categories: [], price: 0, promo_price: null, description: '', tags: '', images: [], featured: false, active: true, stock: null };
  editImgs = [...(p.images || [])];
  openModal(id ? 'Editar produto' : 'Novo produto', `<input type="hidden" id="fId" value="${esc(p.id || '')}">
  <div class="field"><label>Nome *</label><input class="inp" id="fName" value="${esc(p.name)}"></div>
  <div class="grid2"><div class="field"><label>Preço (R$)</label><input class="inp" id="fPrice" inputmode="decimal" value="${moneyOut(p.price)}"></div><div class="field"><label>Preço promocional (R$)</label><input class="inp" id="fPromo" inputmode="decimal" value="${moneyOut(p.promo_price)}" placeholder="vazio = sem promoção"></div></div>
  <div class="grid2"><div class="field"><label>Categoria principal</label><select class="inp" id="fCat">${D.categories.map(c => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Estoque (opcional)</label><input class="inp" id="fStock" inputmode="numeric" value="${p.stock ?? ''}" placeholder="vazio = não controlar"></div></div>
  <div class="field"><label>Também aparece em</label><div class="pills">${D.categories.map(c => `<button type="button" class="pill ${(p.extra_categories || []).includes(c.id) ? 'on' : ''}" data-xcat="${c.id}">${esc(c.name)}</button>`).join('')}</div></div>
  <div class="field"><label>Fotos</label><div class="imgs" id="fImgs"></div><input class="inp mt" id="fUrl" placeholder="ou cole o link de uma imagem e tecle Enter"></div>
  <div class="field"><label>Descrição</label><textarea class="inp" id="fDesc">${esc(p.description)}</textarea></div>
  <div class="field"><label>Palavras de busca</label><input class="inp" id="fTags" value="${esc(p.tags)}" placeholder="ex.: renda vermelho conjunto"><span class="hint">Ajudam a busca inteligente a encontrar o produto.</span></div>
  <div class="row mt"><span>Destaque em "Mais desejados"</span><label class="switch"><input type="checkbox" id="fFeat" ${p.featured ? 'checked' : ''}><span></span></label></div>
  <div class="row mt"><span>Visível na loja</span><label class="switch"><input type="checkbox" id="fAct" ${p.active ? 'checked' : ''}><span></span></label></div>
  <button class="btn btn-pri btn-block mt2" data-act="saveprod">Salvar produto</button>
  ${id ? `<button class="btn btn-danger btn-block mt" data-pdel="${id}">Excluir produto</button>` : ''}`);
  renderImgs();
}
function renderImgs() { $('#fImgs').innerHTML = editImgs.map((u, i) => `<div class="im"><img src="${esc(u)}" alt=""><button type="button" data-rmimg="${i}" aria-label="Remover foto">${icon('close', 'ico', 2.5)}</button></div>`).join('') + `<label class="add">${icon('plus')}<span>Enviar foto</span><input type="file" accept="image/*" multiple hidden data-upload="prod"></label>`; }
async function saveProduct() {
  const name = $('#fName').value.trim(); if (!name) return toast('Informe o nome');
  const promo = moneyIn($('#fPromo').value); const stock = $('#fStock').value.trim();
  const row = { name, price: moneyIn($('#fPrice').value), promo_price: promo > 0 ? promo : null, category_id: $('#fCat').value, extra_categories: $$('[data-xcat].on').map(b => b.dataset.xcat).filter(x => x !== $('#fCat').value), images: editImgs, description: $('#fDesc').value.trim(), tags: $('#fTags').value.trim(), featured: $('#fFeat').checked, active: $('#fAct').checked, stock: stock === '' ? null : Math.max(0, parseInt(stock) || 0) };
  const id = $('#fId').value; if (id) row.id = id;
  try { await api.adminSaveProduct(row); closeModal(); toast('Produto salvo'); await reload(true); } catch (e) { toast(e.message); }
}

/* ---------- CATEGORIAS ---------- */
function categorias() {
  $('#body').innerHTML = `<h2>Categorias</h2><p class="muted" style="font-size:13px">Aparecem no menu ☰, nos atalhos redondos e na busca. Categorias sem produto ativo ficam ocultas na loja automaticamente.</p>
  <div class="panel">${D.categories.map((c, i) => `<div class="prow cat"><div class="pt" style="width:44px;height:44px;border-radius:50%">${icon(c.icon)}</div><div class="pn"><input class="inp" style="height:40px" data-cname="${c.id}" value="${esc(c.name)}"><small>${D.products.filter(p => p.category_id === c.id || (p.extra_categories || []).includes(c.id)).length} produto(s)</small></div>
    <select class="sel" data-cicon="${c.id}" style="width:104px">${ICON_NAMES.map(n => `<option ${n === c.icon ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <button class="ib" data-cup="${i}" title="Subir" ${i ? '' : 'disabled'}>↑</button><button class="ib" data-cdel="${c.id}" title="Excluir">${icon('trash')}</button></div>`).join('')}
  <div class="toolbar mt2"><input class="inp" id="newCat" placeholder="Nova categoria"><button class="btn btn-pri btn-sm" data-act="addcat">Adicionar</button></div></div>`;
}

/* ---------- CUPONS ---------- */
function cupons() {
  const origin = { manual: 'Manual', exit: 'Popup de saída', abandoned: 'Carrinho abandonado', loyalty: 'Fidelidade' };
  $('#body').innerHTML = `<h2>Cupons</h2><p class="muted" style="font-size:13px">Crie cupons para o Grupo AMORIÊ, clientes fiéis ou campanhas. Os cupons do popup e dos carrinhos são criados sozinhos.</p>
  <div class="panel"><h3>Novo cupom</h3><div class="grid2"><div class="field"><label>Código</label><input class="inp" id="kCode" placeholder="Ex.: GRUPOAMORIE" style="text-transform:uppercase"></div><div class="field"><label>Tipo</label><select class="inp" id="kKind"><option value="percent">% de desconto</option><option value="fixed">Valor fixo (R$)</option></select></div></div>
  <div class="grid2"><div class="field"><label>Valor</label><input class="inp" id="kVal" inputmode="decimal" placeholder="10"></div><div class="field"><label>Válido até (opcional)</label><input class="inp" id="kExp" type="date"></div></div>
  <div class="grid2"><div class="field"><label>Limite de usos (opcional)</label><input class="inp" id="kMax" inputmode="numeric" placeholder="vazio = ilimitado"></div><div class="field"><label>Observação</label><input class="inp" id="kNote" placeholder="Ex.: grupo VIP"></div></div>
  <button class="btn btn-pri" data-act="savecoupon">Criar cupom</button></div>
  <div class="panel"><div class="tscroll"><table class="tbl"><thead><tr><th>Código</th><th>Desconto</th><th>Origem</th><th class="r">Usos</th><th>Validade</th><th></th></tr></thead><tbody>
  ${D.coupons.slice(0, 200).map(c => { const exp = c.expires_at && new Date(c.expires_at) < new Date(); const used = c.max_uses != null && c.uses >= c.max_uses; return `<tr><td><b>${esc(c.code)}</b>${c.customer_whatsapp ? `<div class="muted" style="font-size:11px">${esc(fmtPhone(c.customer_whatsapp))}</div>` : ''}</td><td>${c.kind === 'percent' ? (+c.value) + '%' : BRL(c.value)}</td><td class="muted">${origin[c.origin] || c.origin}</td><td class="r">${c.uses}${c.max_uses != null ? '/' + c.max_uses : ''}</td><td>${c.expires_at ? dateBR(c.expires_at) : '—'} ${exp ? '<span class="st cancelado">vencido</span>' : used ? '<span class="st entregue">usado</span>' : ''}</td><td><button class="ib" data-kdel="${esc(c.code)}">${icon('trash')}</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">Nenhum cupom ainda.</td></tr>'}</tbody></table></div></div>`;
}

/* ---------- CONFIGURAÇÕES ---------- */
function config() {
  const s = D.settings; const f = (id, l, v, ph = '', hint = '', type = 'text') => `<div class="field"><label>${l}</label><input class="inp" id="${id}" type="${type}" value="${esc(v ?? '')}" placeholder="${esc(ph)}">${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  $('#body').innerHTML = `<h2>Configurações</h2>
  <div class="cols mt2"><div class="panel"><h3>Identidade</h3>${f('sName', 'Nome da loja', s.storeName)}${f('sTag', 'Frase do rodapé', s.tagline)}
    <div class="field"><label>Logo (opcional)</label><div class="toolbar" style="margin:0">${s.logoUrl ? `<img src="${esc(s.logoUrl)}" style="height:44px;border-radius:8px" alt="">` : '<span class="muted" style="font-size:13px">Usando o logo em texto AMORIÊ Lingerie</span>'}<label class="btn btn-ghost btn-sm" style="cursor:pointer">Enviar logo<input type="file" accept="image/*" hidden data-upload="logo"></label>${s.logoUrl ? '<button class="btn btn-ghost btn-sm" data-act="rmlogo">Remover</button>' : ''}</div></div></div>
  <div class="panel"><h3>Abertura (boas-vindas)</h3>${f('sWT', 'Título', s.welcomeTitle)}<div class="field"><label>Frase</label><textarea class="inp" id="sWX">${esc(s.welcomeText)}</textarea></div>
    ${f('sVid', 'Vídeo da porta da loja abrindo', s.introVideo, 'link .mp4', 'Envie o vídeo ou cole o link. Ele toca no lugar da animação das portas.')}
    <div class="toolbar" style="margin:0"><label class="btn btn-ghost btn-sm" style="cursor:pointer">Enviar vídeo<input type="file" accept="video/*" hidden data-upload="video"></label><a class="btn btn-ghost btn-sm" href="index.html" target="_blank" data-act="previntro">Ver abertura</a></div></div></div>
  <div class="cols mt2"><div class="panel"><h3>Contato</h3>${f('sWa', 'WhatsApp da loja (com DDD)', s.whatsapp, '5594991227330')}${f('sGroup', 'Link do Grupo AMORIÊ (VIP)', s.groupLink, 'https://chat.whatsapp.com/...', 'Se ficar vazio, o botão abre conversa no WhatsApp da loja.')}${f('sInsta', 'Instagram', s.instagram)}${f('sAddr', 'Endereço da loja', s.address)}</div>
  <div class="panel"><h3>Vendas</h3><div class="grid2">${f('sFee', 'Taxa de entrega (R$)', moneyOut(s.deliveryFee), '0,00', '0 = combinar no WhatsApp')}${f('sFree', 'Frete grátis acima de (R$)', moneyOut(s.freeShippingAbove), '0,00', '0 = desativado')}</div>
    ${f('sNote', 'Aviso da entrega', s.deliveryNote)}<div class="grid2">${f('sFirst', '% na 1ª compra com CPF', s.firstPercent, '5', '', 'number')}${f('sExit', '% do cupom ao sair da página', s.exitPercent, '10', '', 'number')}</div>
    ${f('sAband', 'Carrinho abandonado após (horas)', s.abandonHours, '1', '', 'number')}</div></div>
  <button class="btn btn-pri btn-block mt2" data-act="savecfg">Salvar configurações</button>
  <div class="cols mt2"><div class="panel"><h3>Senha do painel</h3><p class="muted" style="font-size:12.5px;margin-bottom:10px">Depois de trocar, só quem souber a nova senha entra.</p>
    <div class="field"><label>Senha atual</label><input class="inp" type="password" inputmode="numeric" id="pw0"></div><div class="grid2"><div class="field"><label>Nova senha</label><input class="inp" type="password" inputmode="numeric" id="pw1"></div><div class="field"><label>Repita a nova</label><input class="inp" type="password" inputmode="numeric" id="pw2"></div></div>
    <button class="btn btn-ghost btn-sm" data-act="changepin">${icon('key')} Trocar senha</button></div>
  <div class="panel"><h3>Dados</h3><p class="muted" style="font-size:12.5px;margin-bottom:10px">Baixe uma cópia de pedidos, clientes e produtos, ou gerencie os dados de demonstração.</p>
    <div class="toolbar" style="margin:0"><button class="btn btn-ghost btn-sm" data-act="export">Baixar cópia (JSON)</button><button class="btn btn-ghost btn-sm" data-act="exportcsv">Pedidos (planilha CSV)</button><button class="btn btn-ghost btn-sm" data-act="seeddemo">Gerar dados de demonstração</button><button class="btn btn-danger btn-sm" data-act="cleardemo">Apagar dados de demonstração</button></div>
    ${IS_DEMO ? '<p class="hint mt">Modo demonstração: tudo fica salvo só neste navegador.</p>' : ''}</div></div>`;
}

/* ---------- eventos ---------- */
function download(name, text, type) { const b = new Blob([text], { type }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }
async function run(fn, ok) { try { await fn(); if (ok) toast(ok); await reload(true); } catch (e) { toast(e.message || 'Erro'); } }
document.addEventListener('click', async e => {
  const t = e.target, g = s => t.closest(s); let el;
  if (g('#ov')) return closeModal();
  if ((el = g('[data-tab]'))) { tab = el.dataset.tab; store.set('amorie_adm_tab', tab); shell(); scrollTo(0, 0); return; }
  if ((el = g('[data-period]'))) { ui.period = el.dataset.period; return dash(); }
  if ((el = g('[data-carttab]'))) { ui.cartTab = el.dataset.carttab; return carrinhos(); }
  if ((el = g('[data-pedit]'))) return editProduct(el.dataset.pedit);
  if ((el = g('[data-xcat]'))) return el.classList.toggle('on');
  if ((el = g('[data-rmimg]'))) { editImgs.splice(+el.dataset.rmimg, 1); return renderImgs(); }
  if ((el = g('[data-pdel]'))) { if (confirm('Excluir este produto?')) { closeModal(); run(() => api.adminDeleteProduct(el.dataset.pdel), 'Produto excluído'); } return; }
  if ((el = g('[data-odel]'))) { if (confirm('Excluir este pedido? Ele sai do faturamento.')) run(() => api.adminDeleteOrder(+el.dataset.odel || el.dataset.odel), 'Pedido excluído'); return; }
  if ((el = g('[data-offer]'))) return offerModal(el.dataset.offer);
  if ((el = g('[data-sendoffer]'))) {
    const c = D.carts.find(x => x.id === el.dataset.sendoffer); const pct = Math.max(1, Math.min(90, +$('#ofPct').value || 10));
    const w = window.open('', '_blank');
    try { const code = await api.adminCartOffer(c.id, pct); const prod = c.items?.[0]?.name || 'seus produtos';
      const msg = `Oi, ${cartName(c).split(' ')[0]}! Aqui é da ${D.settings.storeName} 💕 Vi que você deixou *${prod}* na sacola. Separei um cupom exclusivo de *${pct}%* para você: *${code}*, válido até amanhã. É só aplicar na sacola do site. Posso ajudar em algo?`;
      if (w) w.location = waLink(cartWa(c), msg); closeModal(); toast('Cupom ' + code + ' criado'); await reload(true);
    } catch (er) { if (w) w.close(); toast(er.message); }
    return;
  }
  if ((el = g('[data-cartst]'))) return run(() => api.adminSetCartStatus(el.dataset.cartst, el.dataset.st), 'Atualizado');
  if ((el = g('[data-cup]'))) { const i = +el.dataset.cup; const ids = D.categories.map(c => c.id); [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; return run(() => api.adminReorderCategories(ids)); }
  if ((el = g('[data-cdel]'))) { const n = D.products.filter(p => p.category_id === el.dataset.cdel).length; if (confirm(n ? `Excluir a categoria? ${n} produto(s) ficarão sem categoria principal.` : 'Excluir a categoria?')) run(() => api.adminDeleteCategory(el.dataset.cdel), 'Categoria excluída'); return; }
  if ((el = g('[data-kdel]'))) { if (confirm('Excluir o cupom ' + el.dataset.kdel + '?')) run(() => api.adminDeleteCoupon(el.dataset.kdel), 'Cupom excluído'); return; }
  if ((el = g('[data-act]'))) {
    const a = el.dataset.act;
    switch (a) {
      case 'close': closeModal(); break;
      case 'login': doLogin(); break;
      case 'logout': await api.adminLogout(); D = null; loginView(); break;
      case 'refresh': await reload(true); toast('Atualizado'); break;
      case 'seeddemo': if (confirm('Gerar pedidos, carrinhos e visitas fictícias para apresentar o painel? Eles ficam marcados como demonstração e podem ser apagados.')) run(() => api.adminSeedDemo(), 'Dados de demonstração criados'); break;
      case 'cleardemo': if (confirm('Apagar todos os dados de demonstração?')) run(() => api.adminClearDemo(), 'Dados de demonstração apagados'); break;
      case 'manualsale': manualSale(); break;
      case 'savemanual': {
        const name = $('#mName').value.trim(), wa = digits($('#mWa').value), val = moneyIn($('#mVal').value);
        if (!name || wa.length < 10 || !val) return toast('Preencha nome, WhatsApp e valor');
        const dt = new Date($('#mDate').value + 'T12:00:00');
        closeModal(); run(() => api.adminInsertOrder({ code: 'BAL-' + uid().slice(0, 5).toUpperCase(), customer_name: name, whatsapp: wa, cpf: digits($('#mCpf').value) || null, items: [{ id: null, name: $('#mItems').value.trim() || 'Venda no balcão', qty: 1, price: val }], subtotal: val, total: val, delivery_method: 'retirada', payment_method: $('#mPay').value, created_at: (isNaN(dt) ? new Date() : dt).toISOString() }), 'Venda registrada'); break;
      }
      case 'newprod': editProduct(null); break;
      case 'saveprod': saveProduct(); break;
      case 'addcat': { const n = $('#newCat').value.trim(); if (!n) return; const id = norm(n).replace(/ /g, '-').slice(0, 40) || 'cat-' + uid().slice(0, 5); if (D.categories.some(c => c.id === id)) return toast('Já existe uma categoria com esse nome'); run(() => api.adminSaveCategory({ id, name: n, icon: 'heart', position: D.categories.length }), 'Categoria criada'); break; }
      case 'savecoupon': {
        const code = $('#kCode').value.trim().toUpperCase().replace(/\s+/g, ''); const val = moneyIn($('#kVal').value);
        if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return toast('Código: 3 a 30 letras/números, sem espaço'); if (!(val > 0)) return toast('Informe o valor');
        if ($('#kKind').value === 'percent' && val > 90) return toast('Máximo de 90%');
        const exp = $('#kExp').value; const max = $('#kMax').value.trim();
        run(() => api.adminSaveCoupon({ code, kind: $('#kKind').value, value: val, expires_at: exp ? new Date(exp + 'T23:59:59').toISOString() : null, max_uses: max ? Math.max(1, parseInt(max)) : null, note: $('#kNote').value.trim() || null, origin: 'manual', active: true }), 'Cupom criado'); break;
      }
      case 'savecfg': {
        const s = { storeName: $('#sName').value.trim() || 'AMORIÊ', tagline: $('#sTag').value.trim(), welcomeTitle: $('#sWT').value.trim() || 'Seja bem-vinda', welcomeText: $('#sWX').value.trim(), introVideo: $('#sVid').value.trim(), whatsapp: digits($('#sWa').value), groupLink: $('#sGroup').value.trim(), instagram: $('#sInsta').value.trim(), address: $('#sAddr').value.trim(), deliveryFee: moneyIn($('#sFee').value), freeShippingAbove: moneyIn($('#sFree').value), deliveryNote: $('#sNote').value.trim(), firstPercent: Math.max(0, Math.min(50, +$('#sFirst').value || 0)), exitPercent: Math.max(0, Math.min(50, +$('#sExit').value || 0)), abandonHours: Math.max(1, Math.min(72, +$('#sAband').value || 1)) };
        if (s.whatsapp.length < 12) return toast('WhatsApp: use o formato 55 + DDD + número');
        run(() => api.adminSaveSettings(s), 'Configurações salvas'); break;
      }
      case 'rmlogo': run(() => api.adminSaveSettings({ logoUrl: '' }), 'Logo removido'); break;
      case 'previntro': try { sessionStorage.removeItem('amorie_in'); } catch { } break;
      case 'changepin': {
        const a0 = $('#pw0').value, a1 = $('#pw1').value, a2 = $('#pw2').value;
        if (!/^\d{4,12}$/.test(a1)) return toast('A nova senha deve ter de 4 a 12 números'); if (a1 !== a2) return toast('As senhas novas não conferem');
        try { await api.adminChangePin(a0, a1); ['#pw0', '#pw1', '#pw2'].forEach(s => $(s).value = ''); toast('Senha alterada com sucesso'); } catch (er) { toast(er.message); } break;
      }
      case 'export': download(`amorie-backup-${iso(new Date())}.json`, JSON.stringify(D, null, 1), 'application/json'); break;
      case 'exportcsv': {
        const rows = [['pedido', 'data', 'status', 'cliente', 'whatsapp', 'itens', 'subtotal', 'desconto', 'entrega', 'total', 'recebimento', 'pagamento', 'cupom']].concat(D.orders.map(o => [o.code, dateBR(o.created_at, true), STATUS[o.status], o.customer_name, o.whatsapp, (o.items || []).map(i => i.qty + 'x ' + i.name).join(' | '), o.subtotal, o.discount, o.delivery_fee, o.total, o.delivery_method, PAY[o.payment_method], o.coupon_code || '']));
        download(`amorie-pedidos-${iso(new Date())}.csv`, '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv'); break;
      }
    }
  }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.ui) { ui[t.dataset.ui] = t.value; return ({ oStatus: pedidos, oRange: pedidos, pcat: produtos })[t.dataset.ui]?.(); }
  if (t.id === 'rFrom' || t.id === 'rTo') { ui[t.id === 'rFrom' ? 'from' : 'to'] = t.value; return dash(); }
  if (t.id === 'fielOnly') { ui.fiel = t.checked; return clientes(); }
  if (t.dataset.ostatus) { const id = isNaN(+t.dataset.ostatus) ? t.dataset.ostatus : +t.dataset.ostatus; return run(() => api.adminSetOrderStatus(id, t.value), 'Status atualizado'); }
  if (t.dataset.pact) { const p = D.products.find(x => x.id === t.dataset.pact); return run(() => api.adminSaveProduct({ ...p, active: t.checked }), t.checked ? 'Produto visível' : 'Produto oculto'); }
  if (t.dataset.cname) { const c = D.categories.find(x => x.id === t.dataset.cname); if (t.value.trim()) run(() => api.adminSaveCategory({ ...c, name: t.value.trim() }), 'Categoria renomeada'); return; }
  if (t.dataset.cicon) { const c = D.categories.find(x => x.id === t.dataset.cicon); return run(() => api.adminSaveCategory({ ...c, icon: t.value })); }
  if (t.dataset.upload) {
    const files = [...t.files]; if (!files.length) return; toast('Enviando...');
    try {
      if (t.dataset.upload === 'prod') { for (const f of files) editImgs.push(await api.adminUpload(f)); renderImgs(); toast('Foto adicionada'); }
      if (t.dataset.upload === 'logo') { const u = await api.adminUpload(files[0]); await api.adminSaveSettings({ logoUrl: u }); toast('Logo atualizado'); await reload(true); }
      if (t.dataset.upload === 'video') { const u = await api.adminUpload(files[0]); $('#sVid').value = u; toast('Vídeo enviado. Toque em Salvar configurações.'); }
    } catch (er) { toast(er.message, 4000); }
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (['oq', 'cq', 'pq'].includes(t.dataset.ui)) { ui[t.dataset.ui] = t.value; clearTimeout(window._q); window._q = setTimeout(() => { ({ oq: pedidos, cq: clientes, pq: produtos })[t.dataset.ui](); const i = $(`[data-ui=${t.dataset.ui}]`); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); }
  if (t.id === 'mWa') t.value = maskPhone(t.value);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'pin') doLogin();
  if (e.key === 'Enter' && e.target.id === 'fUrl') { const u = e.target.value.trim(); if (/^https?:\/\//.test(u)) { editImgs.push(u); e.target.value = ''; renderImgs(); } }
  if (e.key === 'Escape') closeModal();
});

(async function init() {
  try { if (await api.adminCheck()) return await reload(); } catch { }
  try { D = { settings: (await api.catalog()).settings }; } catch { D = { settings: {} }; }
  loginView(); D = null;
})();
