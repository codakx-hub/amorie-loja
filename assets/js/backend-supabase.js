// MODO REAL: Supabase (banco, login das clientes, painel e fotos)
import { CONFIG, DEFAULT_SETTINGS } from './config.js';
import { digits, session, uid } from './util.js';
import { seedDemo, shrinkImage } from './backend-local.js';

// Restringe uploads: só imagens (até 10 MB, regravadas em JPEG sem metadados/GPS) e vídeos (até 50 MB)
const IMG_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VID_OK = ['video/mp4', 'video/webm', 'video/quicktime'];
async function safeUpload(file) {
  if (IMG_OK.includes(file.type)) {
    if (file.size > 10 * 1024 * 1024) throw new Error('Imagem muito grande (máx. 10 MB).');
    const dataUrl = await shrinkImage(file, 1400);
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], 'foto.jpg', { type: 'image/jpeg' });
  }
  if (VID_OK.includes(file.type)) { if (file.size > 50 * 1024 * 1024) throw new Error('Vídeo muito grande (máx. 50 MB).'); return file; }
  throw new Error('Formato não permitido. Envie JPG, PNG, WEBP, GIF ou vídeo MP4/WEBM/MOV.');
}

// Biblioteca oficial do Supabase em versão fixa, com verificação de integridade (SRI):
// se o arquivo do CDN for alterado por alguém, o navegador se recusa a executá-lo.
const SB_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
const SB_SRI = 'sha384-TcHRA3zBbn+Lexh5n+Oil4guNPOS3rjNDpGRAN46u/s/mB2IZ50ceC6TYDU2yvgK';
let sb = null, adm = null, createClient = null;

async function lib() {
  if (!createClient) {
    await new Promise((res, rej) => {
      if (window.supabase?.createClient) return res();
      const el = document.createElement('script');
      el.src = SB_SRC; el.integrity = SB_SRI; el.crossOrigin = 'anonymous'; el.referrerPolicy = 'no-referrer';
      el.onload = res; el.onerror = () => rej(new Error('Não foi possível carregar a loja. Verifique sua internet.'));
      document.head.appendChild(el);
    });
    createClient = window.supabase.createClient;
  }
  return createClient;
}
async function client() {
  if (!sb) { const cc = await lib(); sb = cc(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { storageKey: 'amorie-cliente', persistSession: true } }); }
  return sb;
}
async function admin() {
  if (!adm) { const cc = await lib(); adm = cc(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { storageKey: 'amorie-painel', storage: window.sessionStorage, persistSession: true } }); }
  return adm;
}
const PROFILE_COLS = 'id,name,whatsapp,cpf,birth_date,address';
const ORDER_COLS = 'id,code,created_at,status,items,subtotal,discount,discount_detail,delivery_fee,total,delivery_method,payment_method';
const chk = ({ data, error }) => { if (error) throw new Error(error.message || String(error)); return data; };
const pinPass = pin => 'amorie-' + String(pin).trim();
const sid = () => session.get('amorie_sid');

export const backend = {
  mode: 'live',
  async catalog() {
    const c = await client();
    const [s, cats, prods] = await Promise.all([
      c.from('settings').select('data').eq('id', 1).maybeSingle(),
      c.from('categories').select('*').order('position'),
      c.from('products').select('id,name,description,tags,price,promo_price,category_id,extra_categories,images,featured,active,stock,views,sold,position').eq('active', true).order('position').order('created_at', { ascending: false }),
    ]);
    return { settings: { ...DEFAULT_SETTINGS, ...(chk(s)?.data || {}) }, categories: chk(cats), products: chk(prods) };
  },
  async track(type, productId) { const c = await client(); c.rpc('track_event', { p_type: type, p_product: productId || null, p_session: sid() }).then(() => { }, () => { }); },
  async saveCart(cartId, items, name, whatsapp) { const c = await client(); await c.rpc('save_cart', { p_id: cartId, p_items: items.map(i => ({ id: i.id, qty: i.qty })), p_name: name || null, p_whatsapp: whatsapp || null }); },
  async exitCoupon(productId) { const c = await client(); return chk(await c.rpc('create_exit_coupon', { p_product: productId || null, p_session: sid() })); },
  async validateCoupon(code, subtotal) { const c = await client(); return chk(await c.rpc('validate_coupon', { p_code: code, p_subtotal: subtotal })); },

  // ---------- Conta da cliente ----------
  async currentUser() { const c = await client(); const { data } = await c.auth.getSession(); const u = data.session?.user; return u ? { id: u.id, email: u.email } : null; },
  onAuth(cb) { client().then(c => c.auth.onAuthStateChange((_e, s) => cb(s?.user ? { id: s.user.id, email: s.user.email } : null))); },
  async signUp({ email, password, name, whatsapp, cpf }) {
    const c = await client();
    const { data, error } = await c.auth.signUp({ email, password, options: { data: { name, whatsapp: digits(whatsapp), cpf: digits(cpf) }, emailRedirectTo: location.origin + location.pathname } });
    if (error) throw new Error(/registered/i.test(error.message) ? 'Este e-mail já tem cadastro. Entre com sua senha.' : error.message);
    if (!data.session) throw new Error('confirm_email');
    return { id: data.user.id, email: data.user.email };
  },
  async signIn(email, password) {
    const c = await client(); const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(/confirm/i.test(error.message) ? 'Confirme seu e-mail pelo link que enviamos antes de entrar.' : 'E-mail ou senha incorretos.');
    return { id: data.user.id, email: data.user.email };
  },
  async signOut() { const c = await client(); await c.auth.signOut(); },
  async resetPassword(email) { const c = await client(); chk(await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '#/conta' })); return true; },
  async getProfile() { const c = await client(); const u = await this.currentUser(); if (!u) return null; const p = chk(await c.from('profiles').select(PROFILE_COLS).eq('id', u.id).maybeSingle()); return p ? { ...p, email: u.email } : { id: u.id, email: u.email, address: {} }; },
  async saveProfile(p) {
    const c = await client(); const u = await this.currentUser(); if (!u) throw new Error('Entre na sua conta');
    const row = { name: String(p.name || '').trim().slice(0, 120), whatsapp: digits(p.whatsapp).slice(0, 13), address: p.address || {}, birth_date: p.birth_date || null };
    if (digits(p.cpf).length === 11) row.cpf = digits(p.cpf);
    let { data, error } = await c.from('profiles').update(row).eq('id', u.id).select(PROFILE_COLS).maybeSingle();
    if (!error && !data) ({ data, error } = await c.from('profiles').insert({ id: u.id, ...row }).select(PROFILE_COLS).single());
    if (error) throw new Error(/cpf/i.test(error.message) ? (/unique|duplicate/i.test(error.message) ? 'Este CPF já está cadastrado em outra conta.' : 'CPF inválido.') : /whatsapp/i.test(error.message) ? 'WhatsApp inválido.' : 'Não foi possível salvar seus dados.');
    return { ...data, email: u.email };
  },
  async firstEligible() { const c = await client(); const { data } = await c.rpc('first_purchase_eligible'); return !!data; },
  async placeOrder(payload) {
    const c = await client(); const { data, error } = await c.rpc('place_order', { p: payload });
    if (error) throw new Error(error.message); return data;
  },
  async myOrders() { const c = await client(); return chk(await c.from('orders').select(ORDER_COLS).order('created_at', { ascending: false }).limit(50)); },
  async myCoupons() { const c = await client(); return chk(await c.rpc('my_coupons')) || []; },

  // ---------- Painel ----------
  async adminLogin(pin) {
    const a = await admin();
    const { error } = await a.auth.signInWithPassword({ email: CONFIG.ADMIN_EMAIL, password: pinPass(pin) });
    if (error) throw new Error(/rate|many/i.test(error.message) ? 'Muitas tentativas. Aguarde alguns minutos.' : 'Senha incorreta');
    const { data } = await a.from('admins').select('user_id').maybeSingle();
    if (!data) { await a.auth.signOut(); throw new Error('Usuário sem acesso ao painel'); }
    return true;
  },
  async adminLogout() { const a = await admin(); await a.auth.signOut(); },
  async adminCheck() { const a = await admin(); const { data } = await a.auth.getSession(); if (!data.session) return false; const r = await a.from('admins').select('user_id').maybeSingle(); return !!r.data; },
  async adminChangePin(cur, next) {
    const a = await admin();
    const { error } = await a.auth.signInWithPassword({ email: CONFIG.ADMIN_EMAIL, password: pinPass(cur) });
    if (error) throw new Error('Senha atual incorreta');
    chk(await a.auth.updateUser({ password: pinPass(next) }));
  },
  async adminLoad() {
    const a = await admin();
    const all = async (q) => { const out = []; for (let from = 0; ; from += 1000) { const r = chk(await q().range(from, from + 999)); out.push(...r); if (r.length < 1000) break; } return out; };
    const [s, cats, prods, orders, carts, coupons, profiles, events] = await Promise.all([
      a.from('settings').select('data').eq('id', 1).maybeSingle(),
      a.from('categories').select('*').order('position'),
      all(() => a.from('products').select('*').order('position').order('created_at', { ascending: false })),
      all(() => a.from('orders').select('*').order('created_at')),
      all(() => a.from('carts').select('*').order('updated_at', { ascending: false })),
      a.from('coupons').select('*').order('created_at', { ascending: false }),
      all(() => a.from('profiles').select('*')),
      all(() => a.from('events').select('type,product_id,created_at').gte('created_at', new Date(Date.now() - 400 * 864e5).toISOString())),
    ]);
    return { settings: { ...DEFAULT_SETTINGS, ...(chk(s)?.data || {}) }, categories: chk(cats), products: prods, orders, carts, coupons: chk(coupons), profiles, events };
  },
  async adminSaveProduct(p) {
    const a = await admin(); const row = { ...p }; delete row.created_at; delete row.updated_at; delete row.views; delete row.sold;
    if (!row.id) delete row.id;
    return chk(await a.from('products').upsert(row).select().single());
  },
  async adminDeleteProduct(id) { const a = await admin(); chk(await a.from('products').delete().eq('id', id)); },
  async adminSaveCategory(c) { const a = await admin(); chk(await a.from('categories').upsert(c)); },
  async adminDeleteCategory(id) { const a = await admin(); chk(await a.from('categories').delete().eq('id', id)); },
  async adminReorderCategories(ids) { const a = await admin(); await Promise.all(ids.map((id, i) => a.from('categories').update({ position: i }).eq('id', id))); },
  async adminSaveSettings(s) { const a = await admin(); const cur = chk(await a.from('settings').select('data').eq('id', 1).maybeSingle())?.data || {}; chk(await a.from('settings').upsert({ id: 1, data: { ...cur, ...s }, updated_at: new Date().toISOString() })); },
  async adminSaveCoupon(c) { const a = await admin(); c.code = c.code.trim().toUpperCase(); chk(await a.from('coupons').upsert(c)); },
  async adminDeleteCoupon(code) { const a = await admin(); chk(await a.from('coupons').delete().eq('code', code)); },
  async adminSetOrderStatus(id, status) { const a = await admin(); chk(await a.from('orders').update({ status }).eq('id', id)); },
  async adminInsertOrder(o) { const a = await admin(); chk(await a.from('orders').insert({ status: 'pago', source: 'manual', ...o })); },
  async adminDeleteOrder(id) { const a = await admin(); chk(await a.from('orders').delete().eq('id', id)); },
  async adminCartOffer(cartId, pct) { const a = await admin(); return chk(await a.rpc('admin_cart_offer', { p_cart: cartId, p_percent: pct })); },
  async adminSetCartStatus(id, status) { const a = await admin(); chk(await a.from('carts').update({ status }).eq('id', id)); },
  async adminUpload(file) {
    const a = await admin();
    file = await safeUpload(file);
    const ext = file.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
    const path = `${file.type.startsWith('video/') ? 'videos' : 'fotos'}/${Date.now()}-${uid().slice(0, 8)}.${ext}`;
    chk(await a.storage.from('media').upload(path, file, { contentType: file.type, upsert: false }));
    return a.storage.from('media').getPublicUrl(path).data.publicUrl;
  },
  async adminSeedDemo() {
    const a = await admin(); const prods = chk(await a.from('products').select('*').eq('active', true));
    const { orders, carts, events } = seedDemo({ products: prods }, false);
    orders.forEach(o => delete o.id);
    for (let i = 0; i < orders.length; i += 100) chk(await a.from('orders').insert(orders.slice(i, i + 100)));
    chk(await a.from('carts').insert(carts));
    for (let i = 0; i < events.length; i += 300) chk(await a.from('events').insert(events.slice(i, i + 300)));
  },
  async adminClearDemo() {
    const a = await admin();
    chk(await a.from('orders').delete().eq('demo', true));
    chk(await a.from('carts').delete().eq('demo', true));
    chk(await a.from('events').delete().eq('demo', true));
  },
};
