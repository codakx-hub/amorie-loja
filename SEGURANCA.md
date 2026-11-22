# Segurança da loja AMORIÊ

| # | Item | Como está resolvido |
|---|---|---|
| 1 | Esconder API keys | O site só tem a chave pública (anon). A chave secreta (service_role) nunca entra no código. |
| 2 | Limpar secrets do git | Histórico inteiro verificado: nenhum segredo. `.gitignore` bloqueia `.env`, chaves e certificados. |
| 3 | Public key no DB | O navegador usa só a chave pública; o que ela pode fazer é decidido pelo RLS. |
| 4 | RLS | Ligado em todas as 10 tabelas (conferido no fim do `04_security.sql`). |
| 5 | Criptografia | Supabase grava o disco criptografado (AES-256) e toda conexão usa HTTPS/TLS. CPF só visível à dona do dado e ao painel; no painel aparece mascarado. |
| 6 | Auth no servidor | Preço, desconto, cupom, frete e total são recalculados no banco (`place_order`). Painel exige usuário administrador verificado no banco (`is_admin`). |
| 7 | Restringir acessos | Visitante só lê catálogo e configurações; não grava em tabela nenhuma. Funções internas sem acesso externo. |
| 8 | Mass assignment | Cliente só pode alterar nome, WhatsApp, CPF (uma vez), nascimento e endereço. Pedido é montado no servidor campo a campo. |
| 9 | Cookies / sessão | O site não usa cookies. Sessão da cliente no navegador; a do painel some ao fechar a aba. CSP reduz risco de roubo de sessão. |
| 10 | Hash nas senhas | Senhas das clientes e do painel ficam no Supabase Auth com bcrypt; ninguém vê a senha. |
| 11 | Rate limit | Por IP: cupons 20/10 min, pedidos 5/10 min, cupom de saída 5/h, eventos 60/min, sacola 30/min. Login com limite do Supabase. |
| 12 | Anti-robô | Campo invisível e tempo mínimo no cadastro, mais os limites acima. Próximo passo opcional: Cloudflare Turnstile no Supabase Auth. |
| 13 | Queries parametrizadas | Tudo passa pela API do Supabase e por funções SQL com parâmetros; não há SQL montado com texto. |
| 14 | Validação de inputs | No navegador (máscaras, CPF) e no banco (limites de tamanho e formato em clientes, pedidos, produtos, cupons, categorias). |
| 15 | Uploads | Só JPG/PNG/WEBP/GIF (até 10 MB, regravadas sem metadados/GPS) e vídeo MP4/WEBM/MOV (até 50 MB). Só o painel envia. |
| 16 | Respostas enxutas | Consultas pedem só as colunas necessárias; erros do servidor viram mensagens simples. |
| 17 | Cabeçalhos de segurança | Content-Security-Policy e Referrer-Policy nas páginas. |
| 18 | HTTPS | GitHub Pages com HTTPS obrigatório + `upgrade-insecure-requests`. |
| 19 | Dependências | supabase-js atualizado de 2.45.4 para 2.118.0 (corrige CVE-2025-48370), versões fixas e verificação de integridade (SRI) nas bibliotecas externas. |
