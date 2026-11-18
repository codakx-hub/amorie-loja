// Utilidades compartilhadas (loja + painel)
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const BRL = v => brl.format(+v || 0);
export const digits = s => String(s || '').replace(/\D/g, '');
export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
export const round2 = n => Math.round((+n || 0) * 100) / 100;
export const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { } },
};
export const session = {
  get(k, d = null) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { } },
};

export const effPrice = p => (p.promo_price != null && +p.promo_price > 0 && +p.promo_price < +p.price) ? +p.promo_price : +p.price;
export const isPromo = p => p.promo_price != null && +p.promo_price > 0 && +p.promo_price < +p.price;
export const offPct = p => isPromo(p) ? Math.round((1 - p.promo_price / p.price) * 100) : 0;

export function maskPhone(v) { const d = digits(v).replace(/^55(?=\d{10,11}$)/, '').slice(0, 11); if (d.length <= 2) return d; if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`; return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`; }
export function maskCPF(v) { const d = digits(v).slice(0, 11); return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); }
export function maskCEP(v) { const d = digits(v).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; }
export function hideCPF(c) { c = digits(c); return c.length === 11 ? `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**` : '—'; }
export function fmtPhone(v) { return maskPhone(v) || '—'; }
export function validCPF(c) { c = digits(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false; const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const d = (s * 10) % 11; return d === 10 ? 0 : d; }; return dv(9) === +c[9] && dv(10) === +c[10]; }
export function genCPF() { const n = [...Array(9)].map(() => Math.floor(Math.random() * 10)); const dv = f => { let s = 0; n.forEach((x, i) => s += x * (f - i)); const d = (s * 10) % 11; return d === 10 ? 0 : d; }; n.push(dv(10)); n.push(dv(11)); return n.join(''); }
export function waNumber(n) { const d = digits(n); return d.startsWith('55') ? d : '55' + d; }
export function waLink(number, text) { return `https://wa.me/${waNumber(number)}?text=${encodeURIComponent(text || '')}`; }
export function moneyIn(v) { v = String(v ?? '').trim(); if (!v) return 0; if (/^\d+(\.\d{1,2})?$/.test(v)) return +v; const n = parseFloat(v.replace(/\./g, '').replace(',', '.')); return isNaN(n) ? 0 : round2(n); }
export function moneyOut(v) { return v == null || v === '' ? '' : String((+v).toFixed(2)).replace('.', ','); }
export function dateBR(d, withTime = false) { const x = new Date(d); return withTime ? x.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : x.toLocaleDateString('pt-BR'); }
export function ago(d) { const s = (Date.now() - new Date(d)) / 1000; if (s < 60) return 'agora'; if (s < 3600) return Math.floor(s / 60) + ' min'; if (s < 86400) return Math.floor(s / 3600) + ' h'; return Math.floor(s / 86400) + ' d'; }

export function toast(msg, ms = 2600) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), ms);
}

// ---------- Ícones (traço fino, estilo boutique) ----------
const P = {
  lingerie: 'M3 7c2.2 0 3.4 1.4 4.4 3.4S10 14 12 14s3.6-1.6 4.6-3.6S18.8 7 21 7M7.2 10.6C7.2 14 9.3 16.5 12 16.5s4.8-2.5 4.8-5.9M5 4.5l2 5.5M19 4.5l-2 5.5',
  panty: 'M3 7h18l-2.6 5.4C15.8 13 13.6 15 12 18.5 10.4 15 8.2 13 5.6 12.4z',
  mask: 'M2.5 9c3-2.2 6.3-2.2 9.5.2 3.2-2.4 6.5-2.4 9.5-.2 0 4.2-2.2 7.2-5.2 7.2-2 0-3.2-1.6-4.3-3-1.1 1.4-2.3 3-4.3 3-3 0-5.2-3-5.2-7.2zM7 11.2h2.5M14.5 11.2H17',
  flame: 'M12 2.8c1.2 4.2 5.4 5.4 5.4 10.6a5.4 5.4 0 0 1-10.8 0c0-3 1.9-4.2 2.3-6.3 1 1.1 1.8 2 3 2.2-.1-2.3-.9-4.3.1-6.5z',
  lips: 'M2.5 11.5c2-3.5 5-4.8 7-3.5 1 .6 1.6.6 2.5 0s1.5-.6 2.5 0c2-1.3 5 0 7 3.5-2.8 3.6-6 5.5-9.5 5.5S5.3 15.1 2.5 11.5zM2.5 11.5c3 .8 6 1.2 9.5 1.2s6.5-.4 9.5-1.2',
  drop: 'M12 3c4 5 6.2 8.2 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 11.2 8 8 12 3zM9.5 15.5a2.6 2.6 0 0 0 2.5 2.4',
  bottle: 'M10 2h4v3h-4zM8 5h8l1.2 4V20a2 2 0 0 1-2 2H8.8a2 2 0 0 1-2-2V9zM9 13h6',
  toy: 'M9 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM12 7v3M10.5 14h3',
  toy2: 'M12 2.5c2.2 0 3.5 1.8 3.5 4V17a3.5 3.5 0 0 1-7 0V6.5c0-2.2 1.3-4 3.5-4zM7 21.5h10',
  plug: 'M12 3c3 4 5 6.8 5 9.6a5 5 0 0 1-10 0C7 9.8 9 7 12 3zM12 17.6V20M8.5 21h7',
  lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v2.5',
  dice: 'M4 4h16v16H4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01',
  gift: 'M4 9h16v4H4zM5.5 13h13v8h-13zM12 9v12M12 9C10 5 6 4.6 6 7.3S12 9 12 9s6-.4 6-1.7S14 5 12 9',
  leaf: 'M5 19C5 10 10 5 20 4c0 9-5 15-14 15zM5 19l8-8',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  feather: 'M20 4C11 4 6 9 6 16v4M6 16c5 0 9-2 11-6M9 12c3 0 5.5-1 7-3',
  heart: 'M12 20.5s-7.5-4.7-7.5-10.3A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.8c0 5.6-7.5 10.3-7.5 10.3z',
  star: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  home: 'M3 11 12 3l9 8M5 9.5V21h14V9.5',
  wa: 'M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4zM9 9.5c.5 2.5 2.5 4.6 5.5 5.5',
  insta: 'M4 4h16v16H4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17 7h.01',
  key: 'M15 7a4 4 0 1 1-3.9 4.9L3 20M6 17l2 2M9 14l2 2',
  user: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM3.5 21a8.5 8.5 0 0 1 17 0',
  bag: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  truck: 'M2.5 6h11v10h-11zM13.5 9h4l3 3.5V16h-7M5 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  store: 'M3 9l1.5-5h15L21 9M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v8h14v-8',
  pix: 'M12 2.5l9.5 9.5-9.5 9.5L2.5 12zM8 12l4-4 4 4-4 4z',
  card: 'M2.5 6h19v12h-19zM2.5 10h19M6.5 15h4',
  cash: 'M2.5 7h19v10h-19zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM5.5 10v4M18.5 10v4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4.5-6.5',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  cart: 'M3 4h2.5l2.2 11h10.6L20.5 7H7M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  ticket: 'M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3zM10 4v16',
  box: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5 12 12l9-4.5M12 12v9',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
};
export const ICON_NAMES = ['lingerie', 'panty', 'mask', 'flame', 'lips', 'drop', 'bottle', 'toy', 'toy2', 'plug', 'lock', 'dice', 'gift', 'leaf', 'spark', 'feather', 'heart', 'star', 'tag'];
export const icon = (n, cls = 'ico', sw = 1.5) => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n] || P.heart}"/></svg>`;

// Logo AMORIÊ (texto) ou imagem enviada pelo painel
export function logoHTML(s, size = '') {
  if (s && s.logoUrl) return `<img class="logo-img ${size}" src="${esc(s.logoUrl)}" alt="${esc(s.storeName || 'AMORIÊ')}">`;
  return `<span class="wordmark ${size}"><b>${esc((s && s.storeName) || 'AMORIÊ')}</b><i>Lingerie</i></span>`;
}

// Cálculo de valores (prévia na tela; o servidor recalcula ao fechar o pedido)
export function quote({ items, products, settings, firstEligible, coupon, delivery }) {
  const byId = Object.fromEntries(products.map(p => [p.id, p]));
  const lines = items.map(i => ({ ...i, p: byId[i.id] })).filter(l => l.p && l.p.active !== false);
  const subtotal = round2(lines.reduce((s, l) => s + effPrice(l.p) * l.qty, 0));
  const detail = []; let d1 = 0, d2 = 0;
  if (firstEligible && +settings.firstPercent > 0) { d1 = round2(subtotal * settings.firstPercent / 100); detail.push({ label: `1ª compra com CPF (${settings.firstPercent}%)`, value: d1 }); }
  if (coupon && coupon.ok) { const base = subtotal - d1; d2 = coupon.kind === 'percent' ? round2(base * coupon.value / 100) : Math.min(+coupon.value, base); detail.push({ label: coupon.label, value: d2 }); }
  let fee = 0; if (delivery === 'entrega') { fee = +settings.deliveryFee || 0; if (+settings.freeShippingAbove > 0 && subtotal >= +settings.freeShippingAbove) fee = 0; }
  return { lines, subtotal, detail, discount: round2(d1 + d2), fee, total: Math.max(0, round2(subtotal - d1 - d2 + fee)) };
}

export const STATUS = {
  novo: 'Novo', confirmado: 'Confirmado', pago: 'Pago', saiu_entrega: 'Saiu para entrega',
  pronto_retirada: 'Pronto p/ retirada', entregue: 'Entregue', cancelado: 'Cancelado',
};
export const PAY = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };
export function payText(pay, del) {
  if (pay === 'cartao') return del === 'entrega' ? 'Cartão na maquininha do entregador, na entrega' : 'Cartão na loja, na retirada';
  if (pay === 'dinheiro') return del === 'entrega' ? 'Dinheiro ao entregador, na entrega' : 'Dinheiro na loja, na retirada';
  return 'Pix: a chave é enviada pelo WhatsApp';
}
