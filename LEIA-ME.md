# Loja AMORIÊ Lingerie — como colocar no ar

Site: `index.html` (loja) · `admin.html` (painel, senha inicial **0202**).
Sem Supabase configurado, o site roda em **modo demonstração** (dados salvos só no navegador).

## 1. Supabase (banco de dados, login das clientes e fotos)
1. Crie um projeto em supabase.com (região São Paulo).
2. **SQL Editor → New query**: cole e rode, nesta ordem:
   `supabase/01_schema.sql`, depois `supabase/02_seed.sql` (95 produtos).
3. **Authentication → Users → Add user → Create new user**
   - E-mail: `painel@amorielingerie.com`
   - Senha: `amorie-0202` (o painel usa "amorie-" + a senha numérica)
   - Marque **Auto Confirm User**.
4. Rode `supabase/03_admin.sql` (dá acesso de administradora e grava as configurações da loja).
5. **Authentication → Providers → Email**: desligue *Confirm email* para a cliente comprar
   sem precisar abrir o e-mail (recomendado). Se deixar ligado, ela confirma pelo link.
6. **Authentication → URL Configuration**: em *Site URL* coloque o endereço do site publicado.
7. **Project Settings → API**: copie *Project URL* e *anon public key* para
   `assets/js/config.js` (`SUPABASE_URL` e `SUPABASE_ANON_KEY`).

Nunca coloque a chave *service_role* no site.

## 2. Publicar
Qualquer hospedagem de site estático serve (Netlify, Vercel, GitHub Pages, Hostinger).
Envie a pasta inteira. Não precisa de build.

## 3. Depois de publicar
- Painel → Configurações: link do Grupo AMORIÊ, vídeo da porta da loja, taxa de entrega.
- Painel → Configurações → Senha do painel: troque a 0202.
- As fotos dos produtos ainda vêm da loja antiga (Offstore). Ao trocar/enviar fotos pelo painel,
  elas passam a ficar no Supabase.
