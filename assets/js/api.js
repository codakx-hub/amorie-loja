// Escolhe automaticamente: Supabase (se configurado) ou modo demonstração
import { CONFIG } from './config.js';
import { session, uid } from './util.js';

if (!session.get('amorie_sid')) session.set('amorie_sid', uid());

const live = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
const mod = live ? await import('./backend-supabase.js') : await import('./backend-local.js');
export const api = mod.backend;
export const IS_DEMO = !live;
