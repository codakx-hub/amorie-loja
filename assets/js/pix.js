// Pix "copia e cola" (BR Code / EMV do Banco Central) + QR Code gerado no navegador.
// Funciona com Pix estático: a cliente paga o valor exato do pedido para a chave da loja.

const strip = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').trim();
const f = (id, v) => id + String(v.length).padStart(2, '0') + v;

function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Normaliza a chave: celular → +55DDDNUMERO; e-mail/CPF/CNPJ/aleatória ficam como estão
export function normalizeKey(key, type = 'celular') {
  const k = String(key || '').trim();
  if (type === 'celular') { let d = k.replace(/\D/g, ''); if (!d.startsWith('55')) d = '55' + d; return '+' + d; }
  if (type === 'cpf' || type === 'cnpj') return k.replace(/\D/g, '');
  if (type === 'email') return k.toLowerCase();
  return k;
}

export function pixPayload({ key, keyType = 'celular', name, city, amount, txid, description }) {
  const chave = normalizeKey(key, keyType);
  const gui = f('00', 'br.gov.bcb.pix') + f('01', chave) + (description ? f('02', strip(description).slice(0, 40)) : '');
  const tx = (strip(txid).replace(/ /g, '') || '***').slice(0, 25);
  const body =
    f('00', '01') +                                   // formato
    f('26', gui) +                                    // conta Pix
    f('52', '0000') +                                 // categoria
    f('53', '986') +                                  // moeda BRL
    (amount > 0 ? f('54', (+amount).toFixed(2)) : '') +
    f('58', 'BR') +
    f('59', strip(name).toUpperCase().slice(0, 25) || 'LOJA') +
    f('60', strip(city).toUpperCase().slice(0, 15) || 'BRASIL') +
    f('62', f('05', tx));
  const toCrc = body + '6304';
  return toCrc + crc16(toCrc);
}

// QR Code: biblioteca pequena carregada sob demanda (cdnjs). Se falhar, mostramos só o copia e cola.
let qrLib = null;
function loadQR() {
  if (qrLib) return qrLib;
  qrLib = new Promise((res, rej) => {
    if (window.qrcode) return res(window.qrcode);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    s.integrity = 'sha512-ZDSPMa/JM1D+7kdg2x3BsruQ6T/JpJo3jWDWkCZsP+5yVyp1KfESqLI+7RqB5k24F7p2cV7i2YHh/890y6P6Sw==';
    s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer';
    s.onload = () => window.qrcode ? res(window.qrcode) : rej(new Error('qr'));
    s.onerror = () => { qrLib = null; rej(new Error('qr')); };
    document.head.appendChild(s);
  });
  return qrLib;
}
export async function qrSVG(text, size = 220) {
  const qrcode = await loadQR();
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 4, cell = size / (n + m * 2);
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${((c + m) * cell).toFixed(2)} ${((r + m) * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="QR Code Pix"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#2A0A1A"/></svg>`;
}
