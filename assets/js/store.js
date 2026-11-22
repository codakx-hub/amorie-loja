// ================= AMORIÊ — loja =================
import { api, IS_DEMO } from './api.js';
import {
  $, $$, esc, BRL, digits, norm, uid, store, session, effPrice, isPromo, offPct, maskPhone, maskCPF, maskCEP,
  validCPF, waLink, moneyIn, dateBR, toast, icon, logoHTML, quote, STATUS, PAY, payText,
} from './util.js';
import { pixPayload, normalizeKey, qrSVG } from './pix.js';

const S = { settings: {}, categories: [], products: [], user: null, profile: null, firstEligible: false };
const view = { cat: 'all', q: '', promo: false, sort: 'default' };
let cart = store.get('amorie_cart', []);
let cartId = store.get('amorie_cart_id') || (() => { const id = uid(); store.set('amorie_cart_id', id); return id; })();
let cartCoupon = store.get('amorie_coupon', null); // {code, ...resultado}
const ck = { delivery: 'retirada', pay: 'pix', authTab: 'signup' };
const interest = session.get('amorie_interest', {});

const catById = id => S.categories.find(c => c.id === id);
const prodById = id => S.products.find(p => p.id === id);
const inCat = (p, id) => p.category_id === id || (p.extra_categories || []).includes(id);
const catCount = id => S.products.filter(p => inCat(p, id)).length;
const visibleCats = () => S.categories.filter(c => catCount(c.id) > 0);
const s = () => S.settings;

/* ---------------- marca e textos ---------------- */
function applyBrand() {
  const st = s();
  $('#brand').innerHTML = logoHTML(st);
  $('#menuLogo').innerHTML = logoHTML(st);
  $('#introLogo').innerHTML = logoHTML(st, 'lg').replace('wordmark lg', 'wordmark lg light');
  $('#vipLogo').innerHTML = logoHTML(st).replace('class="wordmark ', 'class="wordmark light ');
  $('#footLogo').innerHTML = logoHTML(st).replace('class="wordmark ', 'class="wordmark light ');
  $('#introTitle').textContent = st.welcomeTitle;
  $('#introText').textContent = st.welcomeText;
  $('#footTag').textContent = st.tagline;
  $('#footAddr').textContent = st.address;
  $('#footPhone').textContent = 'WhatsApp ' + maskPhone(st.whatsapp);
  $('#footInsta').href = st.instagram || '#';
  $('#yr').textContent = new Date().getFullYear();
  const top = ['Compra 100% discreta', 'Embalagem presente AMORIÊ', 'Entre no Grupo AMORIÊ', 'Novidades toda semana', 'Retirada na loja ou entrega'];
  const t = top.map(x => `<span>${esc(x)}</span>`).join('');
  $('#topTrack').innerHTML = t + t;
  const r1 = ['Compra 100% discreta', 'Embalagem presente AMORIÊ', 'Entre no Grupo AMORIÊ', 'Novidades toda semana'];
  const r2 = ['Lingeries', 'Géis beijáveis', 'Óleos & massagem', 'Lubrificantes', 'Vibradores', 'Kits presente', 'Acessórios & fetiche'];
  const a = r1.map(x => `<span>${x}</span>`).join(''), b = r2.map(x => `<span>${x}</span>`).join('');
  $('#rb1').innerHTML = a + a + a; $('#rb2').innerHTML = b + b;
}
function staticIcons() {
  $('#btnMenu').innerHTML = icon('menu'); $('#btnAcc').innerHTML = icon('user'); $('#btnCart').innerHTML = icon('bag') + '<span class="badge" id="cartN" hidden>0</span>';
  $('#sbtn').innerHTML = icon('search', 'ico', 2); $('#fab').innerHTML = icon('wa', 'ico', 1.8);
  $('#menuClose').innerHTML = icon('close'); $('#cartClose').innerHTML = icon('close');
}
function placeSearch() {
  const box = $('#searchBox'); const desk = matchMedia('(min-width:960px)').matches;
  const target = desk ? $('#searchDesk') : $('.search-row');
  if (box.parentElement !== target) target.appendChild(box);
}

/* ---------------- abertura ---------------- */
function intro() {
  const el = $('#intro');
  if (session.get('amorie_in') || location.hash.startsWith('#/p/')) { el.remove(); document.body.classList.remove('lock'); return; }
  const finish = () => { el.classList.add('fade'); setTimeout(() => { el.remove(); document.body.classList.remove('lock'); }, 800); session.set('amorie_in', 1); };
  const open = () => { el.classList.add('open'); setTimeout(finish, 1750); };
  $('#btnEnter').onclick = () => {
    const v = s().introVideo;
    if (v) {
      const vid = $('#introVideo'); vid.src = v; vid.hidden = false; $('#skipVideo').hidden = false;
      vid.onended = finish; vid.onerror = open; $('#skipVideo').onclick = finish; vid.play().catch(open);
    } else open();
  };
}

/* ---------------- busca inteligente ---------------- */
const SYN = [
  [['lingerie', 'lingeries', 'conjunto', 'sutia', 'calcinha', 'body', 'camisola', 'babydoll', 'renda', 'espartilho', 'cinta', 'liga', 'intima', 'intimas', 'roupa', 'tanga', 'fio'], ['lingeries', 'pecas-intimas']],
  [['fantasia', 'fantasias', 'cosplay', 'enfermeira', 'policial', 'roleplay'], ['fantasias']],
  [['excitante', 'excitantes', 'estimulante', 'esquenta', 'esfria', 'gela', 'pulsa', 'jambu', 'retardante', 'bolinha', 'bolinhas', 'quente', 'tesao', 'libido', 'orgasmo', 'xana', 'loka'], ['excitantes']],
  [['oral', 'beijavel', 'beijaveis', 'calda', 'sabor', 'comestivel', 'chupar', 'boquete', 'garganta', 'halls'], ['gel-beijavel']],
  [['lubrificante', 'lubrificantes', 'lubri', 'lub', 'deslizante', 'molhada', 'agua', 'siliconado'], ['lubrificantes']],
  [['oleo', 'oleos', 'massagem', 'vela', 'corporal', 'aromatico', 'relaxar'], ['oleos-massagem']],
  [['vibrador', 'vibradores', 'vibro', 'vibra', 'brinquedo', 'brinquedos', 'sugador', 'clitoris', 'varinha', 'wand', 'bullet', 'capsula', 'egg', 'aplicativo', 'controle', 'anel'], ['vibradores']],
  [['protese', 'proteses', 'penis', 'consolo', 'dildo', 'borracha', 'realistica'], ['proteses']],
  [['plug', 'plugs', 'anal', 'joia'], ['plugs', 'dessensibilizante']],
  [['fetiche', 'algema', 'algemas', 'sado', 'bdsm', 'chicote', 'venda', 'harness', 'acessorio', 'acessorios', 'tatuagem', 'petalas'], ['acessorios-fetiche']],
  [['jogo', 'jogos', 'cartas', 'baralho', 'dados', 'brincadeira', 'kama', 'sutra', 'drinks'], ['jogos-casal']],
  [['kit', 'kits', 'presente', 'presentes', 'caixa', 'surpresa', 'namorados', 'aniversario', 'casal'], ['kits-presente']],
  [['higiene', 'desodorante', 'perfume', 'feromonio', 'phero', 'ducha', 'cuidado', 'autocuidado', 'bruma', 'cheirosa'], ['autocuidado']],
  [['adstringente', 'virgem', 'aperta', 'apertadinha', 'lacradinha'], ['adstringente']],
  [['dessensibilizante', 'relaxante', 'anestesico', 'dor'], ['dessensibilizante']],
];
const PROMO_WORDS = ['promocao', 'promo', 'oferta', 'ofertas', 'desconto', 'barato', 'liquidacao', 'sale'];
function lev(a, b) { const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
function near(a, b) { if (a.length < 4 || b.length < 3) return false; const m = a.length >= 7 ? 2 : 1; if (Math.abs(a.length - b.length) > m) return false; return lev(a, b) <= m; }
function smartSearch(q) {
  const toks = norm(q).split(' ').filter(t => t.length > 1);
  if (!toks.length) return { items: [], related: false, cats: [] };
  const cats = new Set(); const words = new Set();
  toks.forEach(t => SYN.forEach(([ws, cs]) => { if (ws.some(w => w === t || (t.length >= 3 && w.startsWith(t)) || near(t, w))) { cs.forEach(c => cats.add(c)); ws.forEach(w => words.add(w)); } }));
  const wantPromo = toks.some(t => PROMO_WORDS.some(w => w === t || near(t, w)));
  let anyDirect = false;
  const sing = w => w.length > 4 ? w.replace(/(oes|aes|es|s)$/, '') : w;
  const res = S.products.map(p => {
    const nameW = norm(p.name).split(' '); const hay = norm([p.name, catById(p.category_id)?.name, p.tags, p.description].join(' ')).split(' ');
    let sc = 0, direct = 0;
    toks.forEach(t => {
      const st = sing(t);
      if (nameW.some(w => w === t || sing(w) === st)) { sc += 8; direct++; }
      else if (t.length >= 3 && nameW.some(w => w.startsWith(t))) { sc += 6; direct++; }
      else if (hay.some(w => w === t || sing(w) === st)) { sc += 4; direct++; }
      else if (t.length >= 3 && hay.some(w => w.startsWith(t))) { sc += 3; direct++; }
      else if (nameW.some(w => near(t, w))) { sc += 4; direct++; }
      else if (hay.some(w => near(t, w))) { sc += 2; direct++; }
    });
    if ([...cats].some(c => inCat(p, c))) sc += 3;
    let e = 0; words.forEach(w => { if (hay.includes(w)) e++; }); sc += Math.min(e, 3);
    if (wantPromo && isPromo(p)) sc += 6;
    if (direct) anyDirect = true;
    return { p, sc };
  }).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc);
  const top = res[0]?.sc || 0; const cut = Math.max(4, top * 0.45);
  res.splice(0, res.length, ...res.filter(x => x.sc >= cut));
  return { items: res.map(x => x.p), related: !anyDirect && res.length > 0, cats: [...cats].filter(c => catCount(c) > 0) };
}
function renderSugg() {
  const q = $('#sq').value.trim(), box = $('#sugg');
  if (q.length < 2) { box.hidden = true; return; }
  const r = smartSearch(q); const items = r.items.slice(0, 6);
  const nq = norm(q);
  const cats = [...new Set([...visibleCats().filter(c => norm(c.name).includes(nq)).map(c => c.id), ...r.cats])].slice(0, 3).map(catById).filter(Boolean);
  let h = `<a href="#" data-action="dosearch"><span class="sthumb">${icon('search')}</span><span>Ver resultados para <b>“${esc(q)}”</b></span></a>`;
  if (cats.length) h += `<div class="shead">Categorias</div>` + cats.map(c => `<a href="#" data-cat="${c.id}"><span class="sthumb">${icon(c.icon)}</span><span>${esc(c.name)}<div class="shint">${catCount(c.id)} produtos</div></span></a>`).join('');
  if (items.length) h += `<div class="shead">${r.related ? 'Itens parecidos' : 'Produtos'}</div>` + items.map(p => `<a href="#" data-open="${p.id}"><span class="sthumb">${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="" loading="lazy">` : icon(catById(p.category_id)?.icon)}</span><span>${esc(p.name)}<div class="shint">${BRL(effPrice(p))}</div></span></a>`).join('');
  else h += `<div class="shead">Nada encontrado. Tente outra palavra</div>`;
  box.innerHTML = h; box.hidden = false;
}
function doSearch() { const q = $('#sq').value.trim(); $('#sugg').hidden = true; $('#sq').blur(); view.q = q; view.cat = 'all'; renderChips(); renderGrid(); scrollGrid(); }

/* ---------------- vitrine ---------------- */
function thumbHTML(p, cls = '') { return p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy" ${cls}>` : icon(catById(p.category_id)?.icon); }
function priceHTML(p) { return isPromo(p) ? `<div class="price"><b>${BRL(p.promo_price)}</b><s>${BRL(p.price)}</s></div>` : `<div class="price"><b>${BRL(p.price)}</b></div>`; }
function card(p) {
  const c = catById(p.category_id);
  const tag = isPromo(p) ? `<span class="tag off">-${offPct(p)}%</span>` : (p.featured ? `<span class="tag feat">Destaque</span>` : '');
  return `<article class="pcard" data-open="${p.id}"><div class="thumb">${tag}${thumbHTML(p)}</div><div class="pinfo"><span class="pcat">${esc(c?.name || '')}</span><h4>${esc(p.name)}</h4>${priceHTML(p)}<button class="btn-add" data-add="${p.id}" aria-label="Adicionar ${esc(p.name)} à sacola">${icon('bag')} Adicionar</button></div></article>`;
}
function renderChips() {
  const all = `<button class="chip ${view.cat === 'all' && !view.q ? 'on' : ''}" data-cat="all"><span class="cc">${icon('star')}</span>Tudo</button>`;
  $('#chips').innerHTML = all + visibleCats().map(c => `<button class="chip ${view.cat === c.id ? 'on' : ''}" data-cat="${c.id}"><span class="cc">${icon(c.icon)}</span>${esc(c.name)}</button>`).join('');
}
function renderRows() {
  const feat = [...S.products].sort((a, b) => (b.featured - a.featured) || ((b.sold * 3 + b.views) - (a.sold * 3 + a.views)) || (a.position - b.position)).slice(0, 10);
  $('#featRow').innerHTML = feat.map(card).join('');
  $('#heroArt').innerHTML = feat.filter(p => p.images?.[0]).slice(0, 3).map(p => `<div class="ph"><img src="${esc(p.images[0])}" alt=""></div>`).join('');
  const promo = S.products.filter(isPromo);
  $('#secPromo').hidden = !promo.length; $('#promoRow').innerHTML = promo.map(card).join('');
}
function renderGrid() {
  let list = S.products, title = 'Todos os produtos', note = '';
  if (view.q) { const r = smartSearch(view.q); list = r.items; title = `Resultados para “${esc(view.q)}”`; if (r.related) note = 'Não achamos exatamente isso, mas separamos itens parecidos para você.'; }
  else if (view.cat !== 'all') { list = list.filter(p => inCat(p, view.cat)); title = esc(catById(view.cat)?.name || 'Categoria'); }
  if (view.promo) { list = list.filter(isPromo); if (!view.q && view.cat === 'all') title = 'Promoções'; }
  if (view.sort === 'az') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (view.sort === 'low') list = [...list].sort((a, b) => effPrice(a) - effPrice(b));
  if (view.sort === 'high') list = [...list].sort((a, b) => effPrice(b) - effPrice(a));
  $('#gridTitle').innerHTML = title; $('#gridCount').textContent = list.length + (list.length === 1 ? ' produto' : ' produtos');
  $('#gridNote').hidden = !note; $('#gridNote').textContent = note;
  $('#clearFilter').hidden = !(view.q || view.cat !== 'all' || view.promo);
  $('#grid').innerHTML = list.length ? list.map(card).join('') : `<div class="empty" style="grid-column:1/-1">Nenhum produto encontrado.<br><br><button class="btn btn-ghost btn-sm" data-action="wa">Perguntar no WhatsApp</button></div>`;
  $$('.seg [data-promo]').forEach(b => b.classList.toggle('on', (b.dataset.promo === '1') === view.promo));
}
function scrollGrid() { $('#produtos').scrollIntoView({ behavior: 'smooth' }); }
function renderMenu() {
  const st = s(); const name = S.profile?.name?.split(' ')[0];
  $('#menuBody').innerHTML = `
  <div class="menu-hello">${S.user ? `Olá, <b>${esc(name || 'cliente')}</b> 💕` : `<a href="#" data-action="account"><b>Entre ou cadastre-se</b> e ganhe ${st.firstPercent}% na 1ª compra com CPF</a>`}</div>
  <a class="mlink" href="#" data-cat="all">${icon('home')}Início</a>
  <a class="mlink" href="#" data-action="promoall">${icon('tag')}Promoções</a>
  <div class="mlabel">Categorias</div>
  ${visibleCats().map(c => `<a class="mlink" href="#" data-cat="${c.id}">${icon(c.icon)}${esc(c.name)}<span class="cnt">${catCount(c.id)}</span></a>`).join('')}
  <div class="mlabel">Atendimento</div>
  <a class="mlink" href="#" data-action="group">${icon('star')}Grupo VIP AMORIÊ</a>
  <a class="mlink" href="#" data-action="wa">${icon('wa')}Falar no WhatsApp</a>
  <a class="mlink" href="#" data-action="howbuy">${icon('heart')}Como comprar</a>
  ${st.instagram ? `<a class="mlink" href="${esc(st.instagram)}" target="_blank" rel="noopener">${icon('insta')}Instagram</a>` : ''}
  <div class="mlabel">Loja</div>
  <a class="mlink" href="#" data-action="account">${icon('user')}Minha conta</a>
  <a class="mlink admin" href="admin.html">${icon('key')}Painel administrativo</a>
  <div style="height:24px"></div>`;
}
function renderAll() { applyBrand(); renderChips(); renderRows(); renderGrid(); renderMenu(); renderCartBadge(); }

/* ---------------- painéis ---------------- */
function openPanel(sel) { closeAll(true); $(sel).classList.add('on'); $('#ov').classList.add('on'); document.body.classList.add('lock'); }
function closeAll(keep) { $$('.drawer.on,.modal.on').forEach(e => e.classList.remove('on')); $('#ov').classList.remove('on'); if (!keep && !$('#intro')) document.body.classList.remove('lock'); if (!keep && location.hash.startsWith('#/p/')) history.replaceState(null, '', location.pathname + location.search); }
function modal(title, html, wide = false) {
  $('#modal').classList.toggle('wide', wide);
  $('#modalBox').innerHTML = `<div class="mhead"><h3>${title}</h3><button class="iconbtn" data-action="close" aria-label="Fechar">${icon('close')}</button></div><div class="mbody">${html}</div>`;
  openPanel('#modal'); $('#modalBox').scrollTop = 0;
}
const modalOpen = () => $('#modal').classList.contains('on') || $('.drawer.on');

/* ---------------- produto ---------------- */
function bumpInterest(id, n) { interest[id] = (interest[id] || 0) + n; session.set('amorie_interest', interest); }
function openProduct(id) {
  const p = prodById(id); if (!p) return; const c = catById(p.category_id);
  bumpInterest(id, 1); api.track('view', id);
  history.replaceState(null, '', '#/p/' + id);
  const imgs = p.images?.length ? p.images : [];
  const rel = S.products.filter(x => x.id !== p.id && inCat(x, p.category_id)).slice(0, 8);
  modal(esc(c?.name || 'Produto'), `<div class="pm">
    <div><div class="pm-img" id="pmImg">${isPromo(p) ? `<span class="tag off" style="position:absolute;top:12px;left:12px;z-index:2">-${offPct(p)}%</span>` : ''}${imgs[0] ? `<img src="${esc(imgs[0])}" alt="${esc(p.name)}">` : icon(c?.icon, 'ico', 1)}</div>
    ${imgs.length > 1 ? `<div class="pm-thumbs">${imgs.map((u, i) => `<button class="${i ? '' : 'on'}" data-img="${esc(u)}"><img src="${esc(u)}" alt=""></button>`).join('')}</div>` : ''}</div>
    <div><h2>${esc(p.name)}</h2>${priceHTML(p)}
    <p class="muted mt" style="font-size:14.5px">${esc(p.description || '')}</p>
    <div class="row mt2"><span class="muted">Quantidade</span><div class="qty"><button data-pq="-1" aria-label="Menos">${icon('minus')}</button><span id="pq">1</span><button data-pq="1" aria-label="Mais">${icon('plus')}</button></div></div>
    <button class="btn btn-pri btn-block mt2" data-addq="${p.id}">${icon('bag')} Adicionar à sacola</button>
    <a class="btn btn-ghost btn-block mt" target="_blank" rel="noopener" href="${waLink(s().whatsapp, 'Olá! Tenho interesse em: ' + p.name)}">${icon('wa')} Tirar dúvida no WhatsApp</a>
    <div class="perk-list"><div>${icon('box')}Embalagem discreta, sem identificação</div><div>${icon('truck')}Retirada na loja ou entrega em Parauapebas</div><div>${icon('ticket')}${s().firstPercent}% off na 1ª compra com CPF</div></div></div></div>
    ${rel.length ? `<div class="sec-h" style="margin-top:26px"><div><h3 style="font-size:22px">Você também vai gostar</h3></div></div><div class="hscroll">${rel.map(card).join('')}</div>` : ''}`, true);
}

/* ---------------- sacola ---------------- */
let cartTimer;
function syncCart() { clearTimeout(cartTimer); cartTimer = setTimeout(() => { api.saveCart(cartId, cart, S.profile?.name || ck.name, S.profile?.whatsapp || ck.whatsapp).catch(() => { }); }, 800); }
function setCart(c) { cart = c.filter(x => prodById(x.id)); store.set('amorie_cart', cart); renderCartBadge(); syncCart(); }
function addCart(id, q = 1) {
  const it = cart.find(x => x.id === id); if (it) it.qty = Math.min(99, it.qty + q); else cart.push({ id, qty: q });
  setCart(cart); bumpInterest(id, 3); api.track('add_to_cart', id);
  toast('Adicionado à sacola 💕');
}
function renderCartBadge() { const n = cart.reduce((a, x) => a + x.qty, 0); const b = $('#cartN'); if (b) { b.textContent = n; b.hidden = !n; } }
function renderCart() {
  const q = quote({ items: cart, products: S.products, settings: s(), firstEligible: false, coupon: cartCoupon });
  $('#cartBody').innerHTML = q.lines.length ? q.lines.map(l => `<div class="citem"><div class="cth">${thumbHTML(l.p)}</div><div style="flex:1;min-width:0"><h6>${esc(l.p.name)}</h6><div class="muted" style="font-size:13px">${BRL(effPrice(l.p))}</div><div class="qty"><button data-cq="${l.id}" data-d="-1" aria-label="Menos">${icon('minus')}</button><span>${l.qty}</span><button data-cq="${l.id}" data-d="1" aria-label="Mais">${icon('plus')}</button></div></div><button class="iconbtn" data-crm="${l.id}" aria-label="Remover">${icon('trash')}</button></div>`).join('')
    : `<div class="empty" style="margin:16px">Sua sacola está vazia.<br><br><button class="btn btn-pri btn-sm" data-action="close">Ver produtos</button></div>`;
  $('#cartFoot').innerHTML = q.lines.length ? `
    <div class="lbl">Tem um cupom?</div>
    <div class="coupon-row"><input class="inp" id="cupIn" placeholder="CÓDIGO" value="${esc(cartCoupon?.code || '')}" autocomplete="off"><button class="btn btn-ghost btn-sm" data-action="applycoupon">Aplicar</button></div>
    ${cartCoupon?.ok ? `<div class="hint ok" style="margin:-4px 0 8px">${esc(cartCoupon.label)} aplicado · <a href="#" data-action="rmcoupon" style="text-decoration:underline">remover</a></div>` : ''}
    <div class="row"><span>Subtotal</span><span>${BRL(q.subtotal)}</span></div>
    ${q.detail.map(d => `<div class="row"><span>${esc(d.label)}</span><span class="disc">− ${BRL(d.value)}</span></div>`).join('')}
    <div class="row big"><span>Total</span><span>${BRL(q.total)}</span></div>
    <p class="hint" style="margin:4px 0 12px">Cadastre seu CPF e ganhe ${s().firstPercent}% na 1ª compra.</p>
    <button class="btn btn-pri btn-block" data-action="checkout">Finalizar compra</button>` : '';
}
async function applyCoupon(code) {
  code = String(code || '').trim().toUpperCase(); if (!code) return;
  const sub = quote({ items: cart, products: S.products, settings: s() }).subtotal;
  try { const r = await api.validateCoupon(code, sub); if (!r.ok) { toast(r.error); cartCoupon = null; } else { cartCoupon = { ...r, code }; toast('Cupom aplicado 💕'); } }
  catch (e) { toast('Não foi possível validar o cupom'); }
  store.set('amorie_coupon', cartCoupon);
}

/* ---------------- conta / login ---------------- */
async function refreshUser() {
  S.user = await api.currentUser().catch(() => null);
  S.profile = S.user ? await api.getProfile().catch(() => null) : null;
  S.firstEligible = S.user ? await api.firstEligible().catch(() => false) : false;
  S.noOrders = S.user ? !(await api.myOrders().catch(() => [])).some(o => o.status !== 'cancelado') : true;
  renderMenu();
}
function authForm(ctx) {
  const tab = ck.authTab; ck.formAt = Date.now();
  return `<div class="authbox">
    <div class="authtabs"><button class="${tab === 'signup' ? 'on' : ''}" data-authtab="signup">Criar conta</button><button class="${tab === 'login' ? 'on' : ''}" data-authtab="login">Já tenho conta</button></div>
    ${tab === 'signup' ? `
      <div class="perk">${icon('ticket')}<span>Com CPF você ganha <b>${s().firstPercent}% de desconto</b> na 1ª compra e acumula benefícios.</span></div>
      <div class="hp" aria-hidden="true"><label>Não preencha<input id="aSite" tabindex="-1" autocomplete="off"></label></div>
      <div class="field"><label for="aName">Nome completo</label><input class="inp" id="aName" autocomplete="name" value="${esc(ck.name || '')}"></div>
      <div class="grid2"><div class="field"><label for="aWa">WhatsApp</label><input class="inp" id="aWa" inputmode="tel" autocomplete="tel" placeholder="(94) 99999-9999" value="${esc(maskPhone(ck.whatsapp || ''))}"></div>
      <div class="field"><label for="aCpf">CPF <span class="muted">(para o desconto)</span></label><input class="inp" id="aCpf" inputmode="numeric" placeholder="000.000.000-00"><span class="hint" id="aCpfHint"></span></div></div>
      <div class="field"><label for="aEmail">E-mail</label><input class="inp" id="aEmail" type="email" autocomplete="email"></div>
      <div class="field"><label for="aPw">Crie uma senha</label><input class="inp" id="aPw" type="password" autocomplete="new-password" placeholder="mínimo 6 caracteres"></div>
      <label class="check"><input type="checkbox" id="aAge"> <span>Tenho 18 anos ou mais e aceito receber meus pedidos e ofertas pelo WhatsApp.</span></label>
      <button class="btn btn-pri btn-block mt2" data-action="signup" data-ctx="${ctx}">Criar conta e continuar</button>`
      : `
      <div class="field"><label for="lEmail">E-mail</label><input class="inp" id="lEmail" type="email" autocomplete="email"></div>
      <div class="field"><label for="lPw">Senha</label><input class="inp" id="lPw" type="password" autocomplete="current-password"></div>
      <button class="btn btn-pri btn-block" data-action="login" data-ctx="${ctx}">Entrar</button>
      <button class="btn btn-ghost btn-block mt" data-action="forgot">Esqueci minha senha</button>`}
  </div>`;
}
async function doSignup(ctx) {
  const name = $('#aName').value.trim(), whatsapp = digits($('#aWa').value), cpf = digits($('#aCpf').value), email = $('#aEmail').value.trim(), pw = $('#aPw').value;
  if (name.length < 3) return toast('Informe seu nome completo');
  if (whatsapp.length < 10) return toast('Informe seu WhatsApp com DDD');
  if (cpf && !validCPF(cpf)) return toast('CPF inválido. Confira os números ou deixe em branco');
  if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Informe um e-mail válido');
  if (pw.length < 6) return toast('A senha precisa ter pelo menos 6 caracteres');
  if (!$('#aAge').checked) return toast('Confirme que você tem 18 anos ou mais');
  // anti-robô: campo invisível preenchido ou formulário enviado rápido demais
  if ($('#aSite').value || Date.now() - (ck.formAt || 0) < 3000) return toast('Confira seus dados e tente de novo em alguns segundos.');
  if (name.length > 120 || email.length > 160 || pw.length > 72) return toast('Algum campo está grande demais');
  ck.name = name; ck.whatsapp = whatsapp; syncCart();
  try { await api.signUp({ email, password: pw, name, whatsapp, cpf }); }
  catch (e) {
    if (e.message === 'confirm_email') return modal('Confirme seu e-mail', `<div class="done"><div class="seal">${icon('check')}</div><h3>Quase lá!</h3><p class="muted mt">Enviamos um link de confirmação para <b>${esc(email)}</b>. Abra o e-mail, confirme e volte para finalizar. Sua sacola fica guardada.</p></div>`);
    return toast(e.message);
  }
  await refreshUser(); toast('Conta criada 💕'); ctx === 'checkout' ? checkout() : account();
}
async function doLogin(ctx) {
  try { await api.signIn($('#lEmail').value.trim(), $('#lPw').value); } catch (e) { return toast(e.message); }
  await refreshUser(); toast('Bem-vinda de volta 💕'); ctx === 'checkout' ? checkout() : account();
}
async function account(tab = 'pedidos') {
  if (!S.user) { ck.authTab = 'login'; return modal('Minha conta', `<p class="muted" style="margin-bottom:14px">Entre para acompanhar pedidos, ver seus cupons e ganhar descontos.</p>${authForm('account')}`); }
  modal('Minha conta', `<div class="who"><div class="av">${esc((S.profile?.name || 'A')[0])}</div><div style="flex:1"><b>${esc(S.profile?.name || '')}</b><div class="muted" style="font-size:12.5px">${esc(S.user.email || '')}</div></div><button class="btn btn-ghost btn-sm" data-action="logout">Sair</button></div>
  <div class="pills mt2 acc-tabs">${[['pedidos', 'Meus pedidos'], ['cupons', 'Meus cupons'], ['dados', 'Meus dados']].map(([k, l]) => `<button class="pill ${tab === k ? 'on' : ''}" data-acctab="${k}">${l}</button>`).join('')}</div>
  <div id="accBody"><div class="spinner"></div></div>`);
  const b = $('#accBody');
  if (tab === 'pedidos') {
    const os = await api.myOrders().catch(() => []);
    b.innerHTML = os.length ? os.map(o => `<div class="ocard"><div class="top"><div><b>${esc(o.code)}</b> <span class="st ${o.status}">${STATUS[o.status] || o.status}</span><div class="muted" style="font-size:12px">${dateBR(o.created_at, true)}</div></div><b style="color:var(--berry)">${BRL(o.total)}</b></div><div class="muted" style="font-size:12.5px;margin-top:6px">${o.items.map(i => `${i.qty}x ${esc(i.name)}`).join(' · ')}</div></div>`).join('') : `<div class="empty">Você ainda não fez pedidos.</div>`;
  } else if (tab === 'cupons') {
    const cs = await api.myCoupons().catch(() => []);
    b.innerHTML = (S.firstEligible ? `<div class="perk">${icon('ticket')}<span>Você tem <b>${s().firstPercent}% de desconto</b> na sua 1ª compra (aplicado automaticamente).</span></div>` : '') +
      (cs.length ? cs.map(c => `<div class="cupom"><div><b>${esc(c.code)}</b><div class="muted" style="font-size:12px">${c.kind === 'percent' ? (+c.value) + '% de desconto' : BRL(c.value) + ' de desconto'}${c.expires_at ? ' · até ' + dateBR(c.expires_at, true) : ''}</div></div><button class="btn btn-pri btn-sm" data-usecoupon="${esc(c.code)}">Usar</button></div>`).join('') : (S.firstEligible ? '' : `<div class="empty">Nenhum cupom no momento. Entre no Grupo AMORIÊ para receber ofertas exclusivas.</div>`));
  } else {
    const p = S.profile || {}; const a = p.address || {};
    b.innerHTML = `<div class="field"><label>Nome</label><input class="inp" id="pName" value="${esc(p.name || '')}"></div>
    <div class="grid2"><div class="field"><label>WhatsApp</label><input class="inp" id="pWa" inputmode="tel" value="${esc(maskPhone(p.whatsapp || ''))}"></div>
    <div class="field"><label>CPF</label><input class="inp" id="pCpf" inputmode="numeric" value="${esc(maskCPF(p.cpf || ''))}" ${p.cpf ? 'disabled' : ''} placeholder="000.000.000-00">${p.cpf ? '<span class="hint">Para alterar o CPF, fale com a loja.</span>' : `<span class="hint">Cadastre e ganhe ${s().firstPercent}% na 1ª compra.</span>`}</div></div>
    <div class="field"><label>Data de nascimento (opcional)</label><input class="inp" id="pBirth" type="date" value="${esc(p.birth_date || '')}"></div>
    <div class="lbl" style="margin:6px 0 8px">Endereço de entrega</div>
    ${addrFields(a, 'p')}
    <button class="btn btn-pri btn-block" data-action="saveprofile">Salvar meus dados</button>`;
  }
}
function addrFields(a = {}, px = 'd') {
  return `<div class="grid2"><div class="field"><label>CEP</label><input class="inp" id="${px}Cep" inputmode="numeric" value="${esc(maskCEP(a.cep || ''))}" placeholder="68515-000" data-cep="${px}"></div>
  <div class="field"><label>Bairro</label><input class="inp" id="${px}District" value="${esc(a.district || '')}"></div></div>
  <div class="field"><label>Rua *</label><input class="inp" id="${px}Street" value="${esc(a.street || '')}" autocomplete="address-line1"></div>
  <div class="grid2"><div class="field"><label>Número *</label><input class="inp" id="${px}Number" value="${esc(a.number || '')}"></div>
  <div class="field"><label>Complemento</label><input class="inp" id="${px}Comp" value="${esc(a.complement || '')}"></div></div>
  <div class="field"><label>Ponto de referência</label><input class="inp" id="${px}Ref" value="${esc(a.reference || '')}"></div>`;
}
const readAddr = px => ({ cep: digits($('#' + px + 'Cep')?.value), district: $('#' + px + 'District')?.value.trim(), street: $('#' + px + 'Street')?.value.trim(), number: $('#' + px + 'Number')?.value.trim(), complement: $('#' + px + 'Comp')?.value.trim(), reference: $('#' + px + 'Ref')?.value.trim(), city: 'Parauapebas', uf: 'PA' });
async function cepLookup(px) {
  const cep = digits($('#' + px + 'Cep').value); if (cep.length !== 8) return;
  try { const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then(r => r.json()); if (r.erro) return toast('CEP não encontrado');
    if (r.logradouro && !$('#' + px + 'Street').value) $('#' + px + 'Street').value = r.logradouro;
    if (r.bairro && !$('#' + px + 'District').value) $('#' + px + 'District').value = r.bairro;
    $('#' + px + 'Number').focus();
  } catch { }
}

/* ---------------- checkout ---------------- */
async function checkout() {
  if (!cart.length) return;
  if (S.user && !S.profile) await refreshUser();
  const logged = !!S.user;
  const prof = S.profile || {};
  const needsProfile = logged && (!prof.name || digits(prof.whatsapp).length < 10);
  modal('Finalizar compra', `
    <div class="steps"><span class="on"></span><span class="${logged ? 'on' : ''}"></span><span class="${logged ? 'on' : ''}"></span><span></span></div>
    <section class="ck-sec"><h4><span class="n">1</span>Identificação</h4>
      ${logged ? `<div class="who"><div class="av">${esc((prof.name || 'A')[0])}</div><div style="flex:1"><b>${esc(prof.name || 'Complete seus dados')}</b><div class="muted" style="font-size:12.5px">${esc(maskPhone(prof.whatsapp || ''))}${prof.cpf ? ' · CPF cadastrado' : ''}</div></div><button class="btn btn-ghost btn-sm" data-action="logout" data-ctx="checkout">Trocar</button></div>
        ${needsProfile ? `<div class="mt"><div class="field"><label>Nome</label><input class="inp" id="cName" value="${esc(prof.name || '')}"></div><div class="field"><label>WhatsApp</label><input class="inp" id="cWa" inputmode="tel" value="${esc(maskPhone(prof.whatsapp || ''))}"></div></div>` : ''}
        ${!prof.cpf ? `<div class="field mt"><label>CPF <span class="muted">(ganhe ${s().firstPercent}% na 1ª compra)</span></label><input class="inp" id="cCpf" inputmode="numeric" placeholder="000.000.000-00"><span class="hint" id="cCpfHint"></span></div>` : ''}`
      : authForm('checkout')}
    </section>
    <div id="ckRest" ${logged ? '' : 'hidden'}>
    <section class="ck-sec"><h4><span class="n">2</span>Como quer receber?</h4>
      <div class="opts two" data-group="delivery">
        <button class="opt ${ck.delivery === 'retirada' ? 'on' : ''}" data-v="retirada">${icon('store')}<b>Retirada na loja</b><small>sem custo</small></button>
        <button class="opt ${ck.delivery === 'entrega' ? 'on' : ''}" data-v="entrega">${icon('truck')}<b>Entrega</b><small>${s().deliveryFee > 0 ? 'taxa ' + BRL(s().deliveryFee) : 'levamos até você'}</small></button>
      </div>
      <div id="addrBox" class="mt2" ${ck.delivery === 'entrega' ? '' : 'hidden'}>${addrFields(prof.address || {}, 'd')}${!(s().deliveryFee > 0) && s().deliveryNote ? `<p class="hint">${esc(s().deliveryNote)}</p>` : ''}</div>
      <p class="hint mt" id="pickupInfo" ${ck.delivery === 'retirada' ? '' : 'hidden'}>Retire em: ${esc(s().address)}</p>
    </section>
    <section class="ck-sec"><h4><span class="n">3</span>Forma de pagamento</h4>
      <div class="opts" data-group="pay">
        <button class="opt ${ck.pay === 'pix' ? 'on' : ''}" data-v="pix">${icon('pix')}<b>Pix</b><small>QR Code na hora</small></button>
        <button class="opt ${ck.pay === 'cartao' ? 'on' : ''}" data-v="cartao">${icon('card')}<b>Cartão</b><small>na loja ou na entrega</small></button>
        <button class="opt ${ck.pay === 'dinheiro' ? 'on' : ''}" data-v="dinheiro">${icon('cash')}<b>Dinheiro</b><small>na retirada ou entrega</small></button>
      </div>
      <div class="payinfo" id="payInfo"></div>
      <div class="field mt" id="trocoF" hidden><label>Troco para quanto?</label><input class="inp" id="cTroco" inputmode="decimal" placeholder="Ex.: 100,00 (deixe vazio se não precisar)"></div>
    </section>
    <section class="ck-sec"><h4><span class="n">4</span>Resumo</h4>
      <div class="coupon-row"><input class="inp" id="ckCup" placeholder="CUPOM" value="${esc(cartCoupon?.code || '')}"><button class="btn btn-ghost btn-sm" data-action="ckcoupon">Aplicar</button></div>
      <div class="summary" id="ckSum"></div>
      <div class="field mt"><label for="cObs">Observação</label><input class="inp" id="cObs" placeholder="Ex.: tamanho, cor, melhor horário"></div>
      <button class="btn btn-wa btn-block" data-action="placeorder">${icon('wa')} Confirmar e enviar pedido</button>
      <p class="hint mt" style="text-align:center">O pedido é registrado e enviado ao WhatsApp da loja para confirmar pagamento e entrega.</p>
    </section></div>`);
  updCheckout();
}
function updCheckout() {
  if (!$('#ckSum')) return;
  const cpfIn = $('#cCpf'); const cpf = cpfIn ? digits(cpfIn.value) : '';
  const firstNow = S.firstEligible || (!S.profile?.cpf && validCPF(cpf) && S.noOrders);
  const q = quote({ items: cart, products: S.products, settings: s(), firstEligible: !!firstNow, coupon: cartCoupon, delivery: ck.delivery });
  $('#ckSum').innerHTML = q.lines.map(l => `<div class="row" style="font-size:13px"><span>${l.qty}x ${esc(l.p.name)}</span><span>${BRL(effPrice(l.p) * l.qty)}</span></div>`).join('') + `<hr style="border:0;border-top:1px solid var(--line);margin:8px 0">
    <div class="row"><span>Subtotal</span><span>${BRL(q.subtotal)}</span></div>
    ${q.detail.map(d => `<div class="row"><span>${esc(d.label)}</span><span class="disc">− ${BRL(d.value)}</span></div>`).join('')}
    ${ck.delivery === 'entrega' ? `<div class="row"><span>Entrega</span><span>${q.fee > 0 ? BRL(q.fee) : (s().deliveryFee > 0 ? 'Grátis' : 'a combinar')}</span></div>` : ''}
    <div class="row big"><span>Total</span><span>${BRL(q.total)}</span></div>`;
  $('#payInfo').innerHTML = icon('heart') + '<span>' + esc(payText(ck.pay, ck.delivery)) + '</span>';
  $('#trocoF').hidden = ck.pay !== 'dinheiro';
  $('#addrBox').hidden = ck.delivery !== 'entrega'; $('#pickupInfo').hidden = ck.delivery !== 'retirada';
  const h = $('#cCpfHint'); if (h) { if (!cpf) { h.className = 'hint'; h.textContent = ''; } else if (cpf.length < 11) { h.className = 'hint'; h.textContent = 'Digite os 11 números.'; } else if (validCPF(cpf)) { h.className = 'hint ok'; h.textContent = `CPF válido: ${s().firstPercent}% de desconto na 1ª compra!`; } else { h.className = 'hint bad'; h.textContent = 'CPF inválido.'; } }
}
function errMsg(m) {
  m = String(m || '');
  if (m.includes('login_required')) return 'Entre na sua conta para finalizar.';
  if (m.includes('profile_incomplete')) return 'Complete seu nome e WhatsApp.';
  if (m.includes('endereco_incompleto')) return 'Informe rua e número para a entrega.';
  if (m.includes('carrinho_vazio')) return 'Sua sacola está vazia ou os produtos saíram de linha.';
  if (m.includes('sem_estoque:')) return 'Sem estoque: ' + m.split('sem_estoque:')[1];
  if (m.includes('cupom:')) return m.split('cupom:')[1];
  if (m.includes('muitas_tentativas')) return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  return 'Não foi possível enviar o pedido. Tente novamente ou chame no WhatsApp.';
}
async function placeOrder(btn) {
  const prof = S.profile || {};
  const patch = {};
  if ($('#cName')) { patch.name = $('#cName').value.trim(); patch.whatsapp = digits($('#cWa').value); if (patch.name.length < 3 || patch.whatsapp.length < 10) return toast('Informe nome e WhatsApp'); }
  if ($('#cCpf') && digits($('#cCpf').value)) { const c = digits($('#cCpf').value); if (!validCPF(c)) return toast('CPF inválido. Corrija ou deixe em branco'); patch.cpf = c; }
  let address = null;
  if (ck.delivery === 'entrega') { address = readAddr('d'); if (!address.street || !address.number) return toast('Informe rua e número para a entrega'); patch.address = address; }
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    if (Object.keys(patch).length) { S.profile = await api.saveProfile({ ...prof, ...patch, address: patch.address || prof.address }); }
    const order = await api.placeOrder({ items: cart.map(x => ({ id: x.id, qty: x.qty })), coupon: cartCoupon?.ok ? cartCoupon.code : '', delivery_method: ck.delivery, address, payment_method: ck.pay, change_for: moneyIn($('#cTroco')?.value) || null, notes: $('#cObs').value.trim(), cart_id: cartId });
    const st = s(); const a = order.address || address;
    const msg = `Olá, ${st.storeName}! Quero finalizar meu pedido *${order.code}* 💕\n\n` + order.items.map(i => `• ${i.qty}x ${i.name} — ${BRL(i.price * i.qty)}`).join('\n') +
      `\n\nSubtotal: ${BRL(order.subtotal)}` + (order.discount_detail || []).map(d => `\n${d.label}: −${BRL(d.value)}`).join('') +
      (order.delivery_method === 'entrega' ? `\nEntrega: ${+order.delivery_fee > 0 ? BRL(order.delivery_fee) : 'a combinar'}` : '') +
      `\n*Total: ${BRL(order.total)}*\n\nNome: ${order.customer_name}\nRecebimento: ${order.delivery_method === 'entrega' ? 'Entrega' : 'Retirada na loja'}` +
      (order.delivery_method === 'entrega' && a ? `\nEndereço: ${[a.street, a.number, a.complement, a.district].filter(Boolean).join(', ')}${a.reference ? ' (ref.: ' + a.reference + ')' : ''}` : '') +
      `\nPagamento: ${order.payment_method === 'pix' ? 'Pix' : payText(order.payment_method, order.delivery_method)}` + (order.change_for ? `\nTroco para: ${BRL(order.change_for)}` : '') + ($('#cObs')?.value.trim() ? `\nObs.: ${$('#cObs').value.trim()}` : '');
    cart = []; store.set('amorie_cart', cart); cartCoupon = null; store.set('amorie_coupon', null); renderCartBadge();
    cartId = uid(); store.set('amorie_cart_id', cartId);
    S.firstEligible = false;
    if (order.payment_method === 'pix') return showPix(order, msg);
    const link = waLink(st.whatsapp, msg); window.open(link, '_blank');
    modal('Pedido recebido', `<div class="done"><div class="seal">${icon('check')}</div><h3>Obrigada, ${esc((order.customer_name || '').split(' ')[0])}!</h3><div class="code-pill">${esc(order.code)}</div><p class="muted">Seu pedido foi registrado. Se o WhatsApp não abriu, toque abaixo para enviar à loja.</p>
      <a class="btn btn-wa btn-block mt2" href="${link}" target="_blank" rel="noopener">${icon('wa')} Enviar no WhatsApp</a>
      <button class="btn btn-ghost btn-block mt" data-action="group">Entrar no Grupo AMORIÊ</button></div>`);
  } catch (e) { toast(errMsg(e.message), 4000); btn.disabled = false; btn.innerHTML = icon('wa') + ' Confirmar e enviar pedido'; }
}

/* ---------------- pagamento Pix ---------------- */
async function copyText(t, okMsg) {
  try { await navigator.clipboard.writeText(t); }
  catch { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { } ta.remove(); }
  toast(okMsg);
}
function showPix(order, msg) {
  const st = s();
  const keyType = st.pixKeyType || 'celular';
  const payload = pixPayload({ key: st.pixKey, keyType, name: st.pixName, city: st.pixCity, amount: +order.total, txid: String(order.code).replace(/[^A-Za-z0-9]/g, '') });
  const keyShown = keyType === 'celular' ? maskPhone(st.pixKey) : st.pixKey;
  const keyCopy = keyType === 'celular' ? normalizeKey(st.pixKey, 'celular') : st.pixKey;
  const comprovante = msg + `\n\n✅ *Pagamento feito via Pix* (${BRL(order.total)}). Segue o comprovante 👇`;
  const link = waLink(st.whatsapp, comprovante);
  window._pix = { payload, keyCopy };
  modal('Pague com Pix', `<div class="pix">
    <div class="pix-head"><span class="muted">Pedido</span> <b>${esc(order.code)}</b><div class="pix-total">${BRL(order.total)}</div><div class="muted" style="font-size:12.5px">Pague o valor exato para confirmar seu pedido</div></div>
    <div class="pix-qr" id="pixQr"><div class="spinner"></div></div>
    <p class="hint" style="text-align:center">Abra o app do seu banco → <b>Pix</b> → <b>Ler QR Code</b></p>
    <div class="lbl mt2">Ou use o Pix copia e cola</div>
    <div class="pix-code"><code id="pixCode">${esc(payload)}</code><button class="btn btn-pri btn-sm" data-action="copypix">${icon('check')} Copiar código</button></div>
    <div class="pix-key"><div><span class="muted" style="font-size:12px">Chave Pix (${esc(keyType)})</span><b>${esc(keyShown)}</b><span class="muted" style="font-size:12px">${esc(st.pixName || '')}${st.pixBank ? ' · ' + esc(st.pixBank) : ''}</span></div><button class="btn btn-ghost btn-sm" data-action="copykey">Copiar chave</button></div>
    <div id="pixAfter" hidden>
      <div class="perk mt2">${icon('check')}<span><b>Pagamento feito?</b> Agora envie o comprovante no WhatsApp da loja. A mensagem já vai com o número e os detalhes do pedido.</span></div>
      <a class="btn btn-wa btn-block" href="${link}" target="_blank" rel="noopener">${icon('wa')} Enviar comprovante no WhatsApp</a>
    </div>
    <button class="btn btn-berry btn-block mt2" id="pixPaid" data-action="pixpaid">Já fiz o Pix</button>
    <p class="hint mt" style="text-align:center">Confira o nome <b>${esc(st.pixName || '')}</b> antes de confirmar no banco.</p>
  </div>`);
  qrSVG(payload, 230).then(svg => { const b = $('#pixQr'); if (b) b.innerHTML = svg; }).catch(() => { const b = $('#pixQr'); if (b) b.innerHTML = '<p class="hint" style="padding:20px">QR Code indisponível agora. Use o código copia e cola abaixo.</p>'; });
}

/* ---------------- popup de saída ---------------- */
let exitArmed = false, lastY = scrollY, lastT = Date.now(), idleT;
function exitAllowed() { return exitArmed && !session.get('amorie_exit') && !$('#intro') && !modalOpen(); }
function topInterest() { const e = Object.entries(interest).filter(([id]) => prodById(id)).sort((a, b) => b[1] - a[1]); return e.length ? prodById(e[0][0]) : null; }
function showExit() {
  if (!exitAllowed()) return; session.set('amorie_exit', 1); api.track('popup_shown');
  const p = topInterest(); const st = s();
  if (p) {
    modal('', `<div class="exit"><div class="ex-img">${thumbHTML(p)}</div><span class="script">Ainda pensando nele?</span><h3>${esc(p.name)}</h3><div class="big">${st.exitPercent}% OFF</div><p class="muted">Liberamos um cupom exclusivo para você levar hoje. Válido por 24 horas.</p>
      <button class="btn btn-pri btn-block mt2" data-exitcoupon="${p.id}">Quero meu desconto</button><button class="btn btn-ghost btn-block mt" data-action="close">Agora não</button></div>`);
  } else {
    modal('', `<div class="exit"><span class="script">Antes de ir...</span><h3>Entre para o Grupo AMORIÊ</h3><p class="muted mt">Exclusividade em novidades e descontos. Quem está no grupo fica sabendo primeiro.</p>
      <button class="btn btn-pri btn-block mt2" data-action="group" data-conv="1">Quero entrar no grupo</button><button class="btn btn-ghost btn-block mt" data-action="close">Agora não</button></div>`);
  }
  $('#modalBox .mhead').classList.add('bare');
}
function armExit() {
  setTimeout(() => { exitArmed = true; }, 12000);
  document.addEventListener('mouseout', e => { if (!e.relatedTarget && e.clientY <= 0) showExit(); });
  addEventListener('scroll', () => { const t = Date.now(), y = scrollY; const v = (lastY - y) / Math.max(1, t - lastT); if (v > 2.6 && y > 600 && matchMedia('(pointer:coarse)').matches) showExit(); lastY = y; lastT = t; resetIdle(); }, { passive: true });
  ['touchstart', 'click', 'keydown'].forEach(ev => addEventListener(ev, resetIdle, { passive: true }));
  try { history.pushState({ amorieGuard: 1 }, ''); addEventListener('popstate', ev => { if (exitAllowed() && !location.hash) { showExit(); history.pushState({ amorieGuard: 1 }, ''); } }); } catch { }
}
function resetIdle() { clearTimeout(idleT); idleT = setTimeout(() => { if (Object.keys(interest).length) showExit(); }, 40000); }
async function exitCoupon(pid) {
  try { const r = await api.exitCoupon(pid); cartCoupon = null; await applyCoupon(r.code); if (!cart.some(x => x.id === pid)) cart.push({ id: pid, qty: 1 }); setCart(cart); closeAll(); openProduct(pid); toast(`Cupom ${r.code} aplicado na sacola 💕`, 4000); }
  catch (er) { toast(String(er.message).includes('muitas') ? 'Você já ganhou um cupom recentemente.' : 'Não foi possível gerar o cupom agora'); }
}

/* ---------------- ações ---------------- */
function openGroup() { const l = s().groupLink; window.open(l || waLink(s().whatsapp, 'Oi! Quero entrar no Grupo AMORIÊ 💕'), '_blank'); }
function howBuy() {
  modal('Como comprar', `<ol style="padding-left:20px;line-height:2;font-size:14.5px">
    <li>Escolha seus produtos e toque em <b>Adicionar</b>.</li><li>Abra a <b>sacola</b> e toque em <b>Finalizar compra</b>.</li>
    <li>Entre ou crie sua conta. Com CPF você ganha <b>${s().firstPercent}% na 1ª compra</b>.</li><li>Escolha <b>retirada na loja</b> ou <b>entrega</b>.</li>
    <li>Escolha <b>Pix, cartão ou dinheiro</b>.</li><li>Confirme: o pedido vai para o WhatsApp da loja, que confirma pagamento e entrega.</li></ol>
    <div class="perk mt2">${icon('box')}<span>Todos os pedidos vão em <b>embalagem discreta</b>, sem identificação do conteúdo.</span></div>
    <a class="btn btn-wa btn-block" href="${waLink(s().whatsapp, 'Olá! Tenho uma dúvida sobre como comprar.')}" target="_blank" rel="noopener">${icon('wa')} Tirar dúvida no WhatsApp</a>`);
}
function bind() {
  document.addEventListener('click', async e => {
    const t = e.target, g = sel => t.closest(sel); let el;
    if (g('#ov')) return closeAll();
    if ((el = g('[data-add]'))) { e.preventDefault(); e.stopPropagation(); return addCart(el.dataset.add); }
    if ((el = g('[data-addq]'))) { addCart(el.dataset.addq, +$('#pq').textContent); closeAll(); return; }
    if ((el = g('[data-pq]'))) { const sp = $('#pq'); sp.textContent = Math.max(1, Math.min(99, +sp.textContent + +el.dataset.pq)); return; }
    if ((el = g('[data-img]'))) { $('#pmImg img').src = el.dataset.img; $$('.pm-thumbs button').forEach(b => b.classList.toggle('on', b === el)); return; }
    if ((el = g('[data-open]'))) { e.preventDefault(); $('#sugg').hidden = true; return openProduct(el.dataset.open); }
    if ((el = g('[data-cat]'))) { e.preventDefault(); view.cat = el.dataset.cat; view.q = ''; view.promo = false; $('#sq').value = ''; $('#sugg').hidden = true; closeAll(); renderChips(); renderGrid(); return scrollGrid(); }
    if ((el = g('[data-promo]'))) { view.promo = el.dataset.promo === '1'; return renderGrid(); }
    if ((el = g('[data-cq]'))) { const it = cart.find(x => x.id === el.dataset.cq); it.qty += +el.dataset.d; if (it.qty < 1) cart = cart.filter(x => x !== it); setCart(cart); return renderCart(); }
    if ((el = g('[data-crm]'))) { setCart(cart.filter(x => x.id !== el.dataset.crm)); return renderCart(); }
    if ((el = g('.opt')) && el.parentElement.dataset.group) { ck[el.parentElement.dataset.group] = el.dataset.v; $$('.opt', el.parentElement).forEach(o => o.classList.toggle('on', o === el)); return updCheckout(); }
    if ((el = g('[data-authtab]'))) { ck.authTab = el.dataset.authtab; const ctx = $('[data-ctx]')?.dataset.ctx || 'account'; return ctx === 'checkout' ? checkout() : account(); }
    if ((el = g('[data-acctab]'))) return account(el.dataset.acctab);
    if ((el = g('[data-usecoupon]'))) { await applyCoupon(el.dataset.usecoupon); closeAll(); renderCart(); return openPanel('#cartD'); }
    if ((el = g('[data-exitcoupon]'))) return exitCoupon(el.dataset.exitcoupon);
    if ((el = g('[data-action]'))) {
      const a = el.dataset.action;
      if (el.tagName === 'A' && !el.getAttribute('href')?.startsWith('#produtos')) e.preventDefault();
      switch (a) {
        case 'menu': renderMenu(); openPanel('#menu'); break;
        case 'cart': renderCart(); openPanel('#cartD'); break;
        case 'close': closeAll(); break;
        case 'home': e.preventDefault(); view.cat = 'all'; view.q = ''; view.promo = false; $('#sq').value = ''; renderChips(); renderGrid(); scrollTo({ top: 0, behavior: 'smooth' }); break;
        case 'scrollgrid': e.preventDefault(); scrollGrid(); break;
        case 'promoall': closeAll(); view.cat = 'all'; view.q = ''; view.promo = true; renderChips(); renderGrid(); scrollGrid(); break;
        case 'clearfilter': view.cat = 'all'; view.q = ''; view.promo = false; $('#sq').value = ''; renderChips(); renderGrid(); break;
        case 'dosearch': doSearch(); break;
        case 'group': if (el.dataset.conv) api.track('popup_converted'); openGroup(); break;
        case 'wa': window.open(waLink(s().whatsapp, 'Olá! Vim pelo site da AMORIÊ e gostaria de atendimento.'), '_blank'); break;
        case 'howbuy': howBuy(); break;
        case 'account': account(); break;
        case 'checkout': checkout(); break;
        case 'applycoupon': await applyCoupon($('#cupIn').value); renderCart(); break;
        case 'rmcoupon': cartCoupon = null; store.set('amorie_coupon', null); renderCart(); break;
        case 'ckcoupon': await applyCoupon($('#ckCup').value); updCheckout(); break;
        case 'signup': el.disabled = true; await doSignup(el.dataset.ctx); el.disabled = false; break;
        case 'login': el.disabled = true; await doLogin(el.dataset.ctx); el.disabled = false; break;
        case 'forgot': { const em = $('#lEmail').value.trim(); if (!/^\S+@\S+\.\S+$/.test(em)) return toast('Digite seu e-mail acima'); await api.resetPassword(em).catch(() => { }); toast(IS_DEMO ? 'No modo demonstração a senha não pode ser recuperada.' : 'Enviamos um link para redefinir sua senha.', 4000); break; }
        case 'logout': await api.signOut(); await refreshUser(); toast('Você saiu da conta'); el.dataset.ctx === 'checkout' ? checkout() : closeAll(); break;
        case 'saveprofile': try { S.profile = await api.saveProfile({ name: $('#pName').value.trim(), whatsapp: $('#pWa').value, cpf: $('#pCpf').disabled ? S.profile?.cpf : $('#pCpf').value, birth_date: $('#pBirth').value || null, address: readAddr('p') }); S.firstEligible = await api.firstEligible(); toast('Dados salvos'); account('dados'); } catch (er) { toast(er.message); } break;
        case 'reload': location.reload(); break;
        case 'placeorder': placeOrder(el); break;
        case 'copypix': copyText(window._pix?.payload || '', 'Código Pix copiado! Cole no app do seu banco.'); break;
        case 'copykey': copyText(window._pix?.keyCopy || '', 'Chave Pix copiada!'); break;
        case 'pixpaid': $('#pixAfter').hidden = false; el.hidden = true; $('#pixAfter').scrollIntoView({ behavior: 'smooth', block: 'center' }); break;
      }
      return;
    }
    if (!g('.search')) $('#sugg').hidden = true;
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'sq') { clearTimeout(window._st); window._st = setTimeout(renderSugg, 120); }
    if (['aCpf', 'cCpf', 'pCpf'].includes(t.id)) { t.value = maskCPF(t.value); if (t.id === 'cCpf') updCheckout(); if (t.id === 'aCpf') { const d = digits(t.value), h = $('#aCpfHint'); h.className = 'hint ' + (d.length === 11 ? (validCPF(d) ? 'ok' : 'bad') : ''); h.textContent = d.length === 11 ? (validCPF(d) ? `${s().firstPercent}% off na 1ª compra garantido!` : 'CPF inválido') : ''; } }
    if (['aWa', 'cWa', 'pWa'].includes(t.id)) { t.value = maskPhone(t.value); if (t.id === 'aWa' && digits(t.value).length >= 10) { ck.whatsapp = digits(t.value); syncCart(); } }
    if (t.dataset.cep) { t.value = maskCEP(t.value); if (digits(t.value).length === 8) cepLookup(t.dataset.cep); }
    if (t.id === 'aName') ck.name = t.value.trim();
  });
  document.addEventListener('change', e => { if (e.target.id === 'sortSel') { view.sort = e.target.value; renderGrid(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAll(); $('#sugg').hidden = true; } });
  $('#sform').addEventListener('submit', e => { e.preventDefault(); doSearch(); });
  addEventListener('resize', placeSearch);
  addEventListener('hashchange', route);
}
function route() {
  const h = location.hash;
  if (h.startsWith('#/p/')) { const id = decodeURIComponent(h.slice(4)); if (prodById(id) && !$('#modal').classList.contains('on')) openProduct(id); }
  else if (h === '#/conta') account();
  else if (h.startsWith('#/c/')) { view.cat = h.slice(4); renderChips(); renderGrid(); scrollGrid(); }
}

/* ---------------- início ---------------- */
(async function init() {
  document.addEventListener('error', ev => { const im = ev.target; if (im.tagName === 'IMG' && !im.dataset.off) { im.dataset.off = 1; im.classList.add('img-off'); } }, true);
  staticIcons(); placeSearch(); bind();
  $('#demoBar').hidden = !IS_DEMO;
  try {
    const c = await api.catalog(); Object.assign(S, c);
  } catch (e) {
    $('#grid').innerHTML = `<div class="empty" style="grid-column:1/-1">Não foi possível carregar a loja agora. <br><br><button class="btn btn-pri btn-sm" data-action="reload">Tentar de novo</button></div>`;
    return;
  }
  applyBrand(); intro(); renderAll();
  await refreshUser();
  api.onAuth(async () => { await refreshUser(); });
  if (cart.length) syncCart();
  armExit(); resetIdle(); route();
})();
