// MODO DEMONSTRAÇÃO: imita o banco do Supabase dentro do navegador.
// Mesmas regras do servidor (preços recalculados, cupons, 1ª compra com CPF).
import { SEED } from './seed.js';
import { DEFAULT_SETTINGS } from './config.js';
import { uid, digits, round2, effPrice, store, session, genCPF, validCPF } from './util.js';

const KEY = 'amorie_demo_db_v1';
const USER_KEY = 'amorie_demo_user';
const ADM_KEY = 'amorie_demo_admin';
const now = () => new Date().toISOString();
const rnd = n => Math.random().toString(36).slice(2, 2 + n).toUpperCase();

async function sha(t) {
  try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('amorie:' + t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  catch { return 'plain:' + t; }
}

let db = null;
function load() {
  if (db) return db;
  db = store.get(KEY);
  if (!db || !Array.isArray(db.products)) {
    db = {
      settings: { ...DEFAULT_SETTINGS },
      categories: SEED.categories.map(c => ({ ...c })),
      products: SEED.products.map((p, i) => ({
        id: 'p' + (i + 1), name: p.name, description: p.desc, tags: p.tags, price: p.price, promo_price: p.promo,
        category_id: p.cat, extra_categories: p.extra, images: [p.img], featured: false, active: true, stock: null,
        views: 0, sold: 0, position: p.pos, created_at: now(),
      })),
      orders: [], carts: [], coupons: [], events: [], profiles: [], users: {}, pinHash: null, seq: 1,
    };
    save();
  }
  db.settings = { ...DEFAULT_SETTINGS, ...db.settings };
  return db;
}
function save() { if (!store.set(KEY, db)) throw new Error('Armazenamento do navegador cheio. Use imagens menores.'); }
const me = () => store.get(USER_KEY);
const myProfile = () => { const u = me(); return u ? load().profiles.find(p => p.id === u.id) || null : null; };
const prodById = id => load().products.find(p => p.id === id);
const authCbs = [];
const fireAuth = () => authCbs.forEach(cb => cb(me()));

function couponDiscount(code, base, userId, whatsapp) {
  const c = load().coupons.find(x => x.code === String(code || '').trim().toUpperCase());
  if (!c || !c.active) return { ok: false, error: 'Cupom inválido' };
  if (c.expires_at && new Date(c.expires_at) < new Date()) return { ok: false, error: 'Cupom expirado' };
  if (c.max_uses != null && c.uses >= c.max_uses) return { ok: false, error: 'Cupom já utilizado' };
  const w = digits(whatsapp);
  if ((c.customer_user && c.customer_user !== userId && (!c.customer_whatsapp || c.customer_whatsapp !== w)) ||
    (!c.customer_user && c.customer_whatsapp && c.customer_whatsapp !== w)) return { ok: false, error: 'Este cupom é de outra cliente' };
  const discount = c.kind === 'percent' ? round2(base * c.value / 100) : Math.min(+c.value, base);
  return { ok: true, code: c.code, kind: c.kind, value: +c.value, discount, label: c.kind === 'percent' ? `Cupom ${c.code} (${+c.value}%)` : `Cupom ${c.code}` };
}
function firstEligibleSync() {
  const p = myProfile(); if (!p || !p.cpf) return false;
  return !load().orders.some(o => o.status !== 'cancelado' && (o.user_id === p.id || o.cpf === p.cpf));
}
function requireAdmin() { if (!session.get(ADM_KEY)) throw new Error('not_admin'); }

export const backend = {
  mode: 'demo',
  async catalog() {
    const d = load();
    return { settings: d.settings, categories: [...d.categories].sort((a, b) => a.position - b.position), products: d.products.filter(p => p.active) };
  },
  async track(type, productId) {
    const d = load(); d.events.push({ id: d.seq++, type, product_id: productId || null, created_at: now() });
    if (type === 'view' && productId) { const p = prodById(productId); if (p) p.views = (p.views || 0) + 1; }
    if (d.events.length > 3000) d.events = d.events.slice(-2000);
    save();
  },
  async saveCart(cartId, items, name, whatsapp) {
    const d = load(); let c = d.carts.find(x => x.id === cartId);
    if (c && !['open', 'contacted'].includes(c.status)) return;
    const lines = items.map(i => { const p = prodById(i.id); return p && p.active ? { id: p.id, name: p.name, qty: Math.max(1, Math.min(99, i.qty | 0)), price: effPrice(p), image: p.images[0] } : null; }).filter(Boolean);
    const total = round2(lines.reduce((s, l) => s + l.qty * l.price, 0));
    if (!c) { c = { id: cartId, status: 'open', created_at: now() }; d.carts.push(c); }
    Object.assign(c, { user_id: me()?.id || c.user_id || null, name: name || c.name || null, whatsapp: digits(whatsapp) || c.whatsapp || null, items: lines, total, updated_at: now() });
    save();
  },
  async exitCoupon(productId) {
    const d = load(); const sid = session.get('amorie_sid');
    let c = d.coupons.find(x => x.origin === 'exit' && x.session_id === sid && Date.now() - new Date(x.created_at) < 864e5);
    if (!c) {
      c = { code: 'VOLTA' + rnd(5), kind: 'percent', value: +d.settings.exitPercent || 10, expires_at: new Date(Date.now() + 864e5).toISOString(), max_uses: 1, uses: 0, origin: 'exit', customer_user: me()?.id || null, session_id: sid, note: 'Popup de saída', active: true, created_at: now() };
      d.coupons.push(c); d.events.push({ id: d.seq++, type: 'popup_converted', product_id: productId || null, created_at: now() }); save();
    }
    return { code: c.code, percent: c.value, expires_at: c.expires_at };
  },
  async validateCoupon(code, subtotal) { return couponDiscount(code, Math.max(0, subtotal), me()?.id, myProfile()?.whatsapp); },

  // ---------- Conta da cliente ----------
  async currentUser() { return me(); },
  onAuth(cb) { authCbs.push(cb); },
  async signUp({ email, password, name, whatsapp, cpf }) {
    const d = load(); email = String(email).trim().toLowerCase();
    if (d.users[email]) throw new Error('Este e-mail já tem cadastro. Entre com sua senha.');
    if (cpf && d.profiles.some(p => p.cpf === digits(cpf))) throw new Error('Este CPF já está cadastrado em outra conta.');
    const id = uid(); d.users[email] = { id, pw: await sha(password) };
    d.profiles.push({ id, email, name, whatsapp: digits(whatsapp), cpf: digits(cpf) || null, address: {}, created_at: now() });
    save(); store.set(USER_KEY, { id, email }); fireAuth(); return { id, email };
  },
  async signIn(email, password) {
    const u = load().users[String(email).trim().toLowerCase()];
    if (!u || u.pw !== await sha(password)) throw new Error('E-mail ou senha incorretos.');
    store.set(USER_KEY, { id: u.id, email: String(email).trim().toLowerCase() }); fireAuth(); return me();
  },
  async signOut() { store.del(USER_KEY); fireAuth(); },
  async resetPassword() { return true; },
  async getProfile() { return myProfile(); },
  async saveProfile(p) {
    const d = load(); const u = me(); if (!u) throw new Error('Entre na sua conta');
    let prof = d.profiles.find(x => x.id === u.id);
    if (!prof) { prof = { id: u.id, email: u.email, created_at: now() }; d.profiles.push(prof); }
    const cpf = digits(p.cpf);
    if (cpf && !prof.cpf) { if (!validCPF(cpf)) throw new Error('CPF inválido'); if (d.profiles.some(x => x.cpf === cpf && x.id !== u.id)) throw new Error('Este CPF já está cadastrado em outra conta.'); prof.cpf = cpf; }
    Object.assign(prof, { name: p.name ?? prof.name, whatsapp: p.whatsapp != null ? digits(p.whatsapp) : prof.whatsapp, birth_date: p.birth_date ?? prof.birth_date, address: p.address ?? prof.address ?? {} });
    save(); return prof;
  },
  async firstEligible() { return firstEligibleSync(); },
  async placeOrder(p) {
    const d = load(); const u = me(); if (!u) throw new Error('login_required');
    const prof = myProfile(); if (!prof || !prof.name || digits(prof.whatsapp).length < 10) throw new Error('profile_incomplete');
    const items = []; let sub = 0;
    for (const it of p.items || []) {
      const pr = prodById(it.id); if (!pr || !pr.active) continue; const q = Math.max(1, Math.min(99, it.qty | 0));
      if (pr.stock != null && pr.stock < q) throw new Error('sem_estoque:' + pr.name);
      items.push({ id: pr.id, name: pr.name, qty: q, price: effPrice(pr), image: pr.images[0] }); sub += q * effPrice(pr);
    }
    if (!items.length) throw new Error('carrinho_vazio');
    sub = round2(sub); const detail = []; let d1 = 0, d2 = 0, cup = null;
    if (firstEligibleSync() && +d.settings.firstPercent > 0) { d1 = round2(sub * d.settings.firstPercent / 100); detail.push({ label: `1ª compra com CPF (${d.settings.firstPercent}%)`, value: d1 }); }
    if (String(p.coupon || '').trim()) { cup = couponDiscount(p.coupon, sub - d1, u.id, prof.whatsapp); if (!cup.ok) throw new Error('cupom:' + cup.error); d2 = cup.discount; detail.push({ label: cup.label, value: d2 }); }
    const method = p.delivery_method === 'entrega' ? 'entrega' : 'retirada';
    if (method === 'entrega' && (!p.address?.street || !p.address?.number)) throw new Error('endereco_incompleto');
    let fee = 0; if (method === 'entrega') { fee = +d.settings.deliveryFee || 0; if (+d.settings.freeShippingAbove > 0 && sub >= +d.settings.freeShippingAbove) fee = 0; }
    const pay = ['pix', 'cartao', 'dinheiro'].includes(p.payment_method) ? p.payment_method : 'pix';
    const dt = new Date(); const code = `AM${String(dt.getDate()).padStart(2, '0')}${String(dt.getMonth() + 1).padStart(2, '0')}-${rnd(4)}`;
    const o = { id: d.seq++, code, user_id: u.id, customer_name: prof.name, whatsapp: digits(prof.whatsapp), cpf: prof.cpf, items, subtotal: sub, discount: round2(d1 + d2), discount_detail: detail, delivery_fee: fee, total: Math.max(0, round2(sub - d1 - d2 + fee)), delivery_method: method, address: method === 'entrega' ? p.address : null, payment_method: pay, change_for: pay === 'dinheiro' ? (p.change_for || null) : null, notes: (p.notes || '').slice(0, 500), coupon_code: cup?.code || null, status: 'novo', source: 'site', created_at: now() };
    d.orders.push(o);
    if (cup) { const c = d.coupons.find(x => x.code === cup.code); c.uses++; }
    items.forEach(i => { const pr = prodById(i.id); pr.sold = (pr.sold || 0) + i.qty; if (pr.stock != null) pr.stock = Math.max(0, pr.stock - i.qty); });
    d.carts.forEach(c => { if ((c.id === p.cart_id || c.user_id === u.id || (c.whatsapp && c.whatsapp === o.whatsapp)) && ['open', 'contacted'].includes(c.status)) { c.status = c.status === 'contacted' ? 'recovered' : 'ordered'; c.order_code = code; } });
    save(); return o;
  },
  async myOrders() { const u = me(); return u ? load().orders.filter(o => o.user_id === u.id).sort((a, b) => b.created_at.localeCompare(a.created_at)) : []; },
  async myCoupons() {
    const u = me(); const p = myProfile(); if (!u) return [];
    return load().coupons.filter(c => c.active && (!c.expires_at || new Date(c.expires_at) > new Date()) && (c.max_uses == null || c.uses < c.max_uses) && (c.customer_user === u.id || (p && c.customer_whatsapp && c.customer_whatsapp === digits(p.whatsapp))));
  },

  // ---------- Painel ----------
  async adminLogin(pin) {
    const d = load(); if (!d.pinHash) { d.pinHash = await sha('0202'); save(); }
    const tries = session.get('amorie_demo_tries', { n: 0, until: 0 });
    if (tries.until > Date.now()) throw new Error('Muitas tentativas. Aguarde alguns minutos.');
    if (await sha(pin) !== d.pinHash) { tries.n++; if (tries.n >= 5) { tries.until = Date.now() + 5 * 60e3; tries.n = 0; } session.set('amorie_demo_tries', tries); throw new Error('Senha incorreta'); }
    session.set('amorie_demo_tries', { n: 0, until: 0 }); session.set(ADM_KEY, true); return true;
  },
  async adminLogout() { session.set(ADM_KEY, false); },
  async adminCheck() { return !!session.get(ADM_KEY); },
  async adminChangePin(cur, next) {
    requireAdmin(); const d = load(); if (!d.pinHash) d.pinHash = await sha('0202');
    if (await sha(cur) !== d.pinHash) throw new Error('Senha atual incorreta');
    d.pinHash = await sha(next); save();
  },
  async adminLoad() {
    requireAdmin(); const d = load();
    return { settings: d.settings, categories: [...d.categories].sort((a, b) => a.position - b.position), products: [...d.products].sort((a, b) => a.position - b.position), orders: d.orders, carts: d.carts, coupons: d.coupons, profiles: d.profiles, events: d.events };
  },
  async adminSaveProduct(p) {
    requireAdmin(); const d = load();
    if (p.id) { Object.assign(prodById(p.id), p); } else { p.id = 'p' + uid().slice(0, 8); p.views = 0; p.sold = 0; p.created_at = now(); p.position = -1; d.products.unshift(p); }
    save(); return p;
  },
  async adminDeleteProduct(id) { requireAdmin(); const d = load(); d.products = d.products.filter(p => p.id !== id); save(); },
  async adminSaveCategory(c) { requireAdmin(); const d = load(); const ex = d.categories.find(x => x.id === c.id); if (ex) Object.assign(ex, c); else d.categories.push({ position: d.categories.length, ...c }); save(); },
  async adminDeleteCategory(id) { requireAdmin(); const d = load(); d.categories = d.categories.filter(c => c.id !== id); d.products.forEach(p => { if (p.category_id === id) p.category_id = null; p.extra_categories = (p.extra_categories || []).filter(x => x !== id); }); save(); },
  async adminReorderCategories(ids) { requireAdmin(); const d = load(); ids.forEach((id, i) => { const c = d.categories.find(x => x.id === id); if (c) c.position = i; }); save(); },
  async adminSaveSettings(s) { requireAdmin(); const d = load(); d.settings = { ...d.settings, ...s }; save(); },
  async adminSaveCoupon(c) { requireAdmin(); const d = load(); c.code = c.code.trim().toUpperCase(); const ex = d.coupons.find(x => x.code === c.code); if (ex) Object.assign(ex, c); else d.coupons.push({ uses: 0, active: true, origin: 'manual', created_at: now(), ...c }); save(); },
  async adminDeleteCoupon(code) { requireAdmin(); const d = load(); d.coupons = d.coupons.filter(c => c.code !== code); save(); },
  async adminSetOrderStatus(id, status) { requireAdmin(); const o = load().orders.find(x => x.id === id); o.status = status; o.updated_at = now(); save(); },
  async adminInsertOrder(o) { requireAdmin(); const d = load(); d.orders.push({ id: d.seq++, discount: 0, discount_detail: [], delivery_fee: 0, status: 'pago', source: 'manual', created_at: now(), ...o }); save(); },
  async adminDeleteOrder(id) { requireAdmin(); const d = load(); d.orders = d.orders.filter(o => o.id !== id); save(); },
  async adminCartOffer(cartId, pct) {
    requireAdmin(); const d = load(); const c = d.carts.find(x => x.id === cartId); const code = 'AMOR' + rnd(5);
    const exp = new Date(); exp.setDate(exp.getDate() + 1); exp.setHours(23, 59, 59, 0);
    d.coupons.push({ code, kind: 'percent', value: pct, expires_at: exp.toISOString(), max_uses: 1, uses: 0, origin: 'abandoned', customer_user: c.user_id, customer_whatsapp: c.whatsapp, note: 'Carrinho abandonado', active: true, created_at: now() });
    Object.assign(c, { status: 'contacted', contacted_at: now(), offer_code: code }); save(); return code;
  },
  async adminSetCartStatus(id, status) { requireAdmin(); const c = load().carts.find(x => x.id === id); c.status = status; save(); },
  async adminUpload(file) {
    requireAdmin();
    if (file.type.startsWith('video/')) throw new Error('No modo demonstração, cole o link do vídeo. O envio de vídeo funciona com o Supabase conectado.');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('Formato não permitido. Envie JPG, PNG, WEBP ou GIF.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Imagem muito grande (máx. 10 MB).');
    return await shrinkImage(file);
  },
  async adminSeedDemo() { requireAdmin(); seedDemo(load(), true); save(); },
  async adminClearDemo() { requireAdmin(); const d = load(); d.orders = d.orders.filter(o => !o.demo); d.carts = d.carts.filter(c => !c.demo); d.events = d.events.filter(e => !e.demo); d.profiles = d.profiles.filter(p => !p.demo); save(); },
};

export function shrinkImage(file, max = 900) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => { const sc = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .82)); }; img.onerror = () => rej(new Error('Imagem inválida')); img.src = r.result; };
    r.readAsDataURL(file);
  });
}

// Dados fictícios para apresentar o painel (marcados como demo e removíveis)
export function seedDemo(d, local) {
  const first = ['Ana', 'Bruna', 'Carla', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Juliana', 'Karina', 'Larissa', 'Mariana', 'Natália', 'Patrícia', 'Rafaela', 'Sabrina', 'Tatiane', 'Vanessa', 'Yasmin', 'Lucas', 'Marcos', 'Rafael', 'Thiago', 'Camila', 'Jéssica', 'Aline', 'Bianca', 'Priscila', 'Renata'];
  const last = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Lima', 'Costa', 'Pereira', 'Rodrigues', 'Almeida', 'Ferreira'];
  const people = []; for (let i = 0; i < 90; i++) people.push({ name: first[i % first.length] + ' ' + last[(i * 7 + (i / first.length | 0)) % last.length], whatsapp: '9499' + String(1e6 + Math.floor(Math.random() * 8.99e6)), cpf: Math.random() < .65 ? genCPF() : null });
  const prods = d.products.filter(p => p.active); const nowMs = Date.now(); const out = [];
  for (let i = 0; i < 230; i++) {
    const c = people[Math.floor(Math.pow(Math.random(), 2.1) * people.length)];
    const agoD = Math.floor(Math.pow(Math.random(), 1.35) * 400);
    const dt = new Date(nowMs - agoD * 864e5); dt.setHours(9 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 60)); if (dt > new Date()) dt.setTime(nowMs - 3e5 - Math.random() * 3e6);
    const items = []; const n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) { const p = prods[Math.floor(Math.random() * prods.length)]; items.push({ id: p.id, name: p.name, qty: Math.random() < .18 ? 2 : 1, price: effPrice(p), image: p.images[0] }); }
    const sub = round2(items.reduce((s, x) => s + x.qty * x.price, 0)); const disc = c.cpf && Math.random() < .3 ? round2(sub * .05) : 0;
    const del = Math.random() < .55 ? 'entrega' : 'retirada';
    out.push({ id: local ? d.seq++ : undefined, code: 'DEMO-' + rnd(5), user_id: null, customer_name: c.name, whatsapp: c.whatsapp, cpf: c.cpf, items, subtotal: sub, discount: disc, discount_detail: disc ? [{ label: '1ª compra com CPF (5%)', value: disc }] : [], delivery_fee: 0, total: round2(sub - disc), delivery_method: del, address: del === 'entrega' ? { street: 'Rua Demo', number: String(10 + i), district: 'Centro' } : null, payment_method: ['pix', 'cartao', 'dinheiro'][i % 3], status: Math.random() < .05 ? 'cancelado' : (agoD < 1 ? 'novo' : 'entregue'), source: 'site', demo: true, created_at: dt.toISOString() });
  }
  out.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const carts = [];
  for (let i = 0; i < 9; i++) { const c = people[(i * 11) % people.length]; const p = prods[(i * 13) % prods.length]; const p2 = prods[(i * 7 + 3) % prods.length]; const items = [{ id: p.id, name: p.name, qty: 1, price: effPrice(p), image: p.images[0] }, ...(i % 2 ? [{ id: p2.id, name: p2.name, qty: 1, price: effPrice(p2), image: p2.images[0] }] : [])]; carts.push({ id: uid(), user_id: null, name: c.name, whatsapp: c.whatsapp, items, total: round2(items.reduce((s, x) => s + x.price * x.qty, 0)), status: i < 6 ? 'open' : (i < 8 ? 'contacted' : 'recovered'), created_at: new Date(nowMs - (i + 2) * 36e5 * 3).toISOString(), updated_at: new Date(nowMs - (i + 2) * 36e5 * 3).toISOString(), demo: true }); }
  const events = [];
  for (let i = 0; i < 900; i++) { const p = prods[Math.floor(Math.pow(Math.random(), 1.6) * prods.length)]; events.push({ type: 'view', product_id: p.id, created_at: new Date(nowMs - Math.random() * 60 * 864e5).toISOString(), demo: true }); }
  for (let i = 0; i < 140; i++) events.push({ type: 'popup_shown', product_id: null, created_at: new Date(nowMs - Math.random() * 30 * 864e5).toISOString(), demo: true });
  for (let i = 0; i < 31; i++) events.push({ type: 'popup_converted', product_id: null, created_at: new Date(nowMs - Math.random() * 30 * 864e5).toISOString(), demo: true });
  if (local) {
    d.orders.push(...out); d.carts.push(...carts); events.forEach(e => d.events.push({ id: d.seq++, ...e }));
    const views = {}; events.filter(e => e.type === 'view').forEach(e => views[e.product_id] = (views[e.product_id] || 0) + 1);
    d.products.forEach(p => { p.views = (p.views || 0) + (views[p.id] || 0); });
    d.orders.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  return { orders: out, carts, events };
}
