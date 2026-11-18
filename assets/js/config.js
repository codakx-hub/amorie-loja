// =============================================================
// CONFIGURAÇÃO DA LOJA AMORIÊ
// Cole aqui a Project URL e a anon public key do Supabase.
// Enquanto ficarem vazias, o site roda em MODO DEMONSTRAÇÃO
// (tudo salvo só no navegador, ótimo para apresentar).
// =============================================================
export const CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  // usuário do painel criado no Supabase (Authentication → Users)
  ADMIN_EMAIL: 'painel@amorielingerie.com',
};

export const DEFAULT_SETTINGS = {
  storeName: 'AMORIÊ',
  tagline: 'Lingerie & sex shop · Parauapebas',
  welcomeTitle: 'Seja bem-vinda',
  welcomeText: 'Deixe a timidez do lado de fora. Aqui dentro, quem manda é o seu desejo.',
  whatsapp: '5594991227330',
  instagram: 'https://www.instagram.com/amorielingeriee',
  address: 'Rua Olavo Bilac, 08, entre Bom Jardim e VS10, Caetanópolis, Parauapebas–PA, CEP 68515-000',
  groupLink: '',
  deliveryFee: 0,
  deliveryNote: 'Taxa de entrega combinada no WhatsApp conforme o bairro.',
  freeShippingAbove: 0,
  firstPercent: 5,
  exitPercent: 10,
  abandonHours: 1,
  introVideo: '',
  logoUrl: '',
};
