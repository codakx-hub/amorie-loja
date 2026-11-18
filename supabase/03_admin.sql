-- Depois de criar o usuário do painel em Authentication → Users → "Add user"
-- (e-mail: painel@amorielingerie.com  |  senha: amorie-0202  |  marcar "Auto Confirm User"),
-- rode este comando para dar acesso de administradora a ele:
insert into public.admins (user_id)
select id from auth.users where email = 'painel@amorielingerie.com'
on conflict do nothing;

-- Configurações iniciais da loja
update public.settings set data = '{
  "storeName": "AMORIÊ",
  "tagline": "Lingerie & sex shop · Parauapebas",
  "welcomeTitle": "Seja bem-vinda",
  "welcomeText": "Deixe a timidez do lado de fora. Aqui dentro, quem manda é o seu desejo.",
  "whatsapp": "5594991227330",
  "instagram": "https://www.instagram.com/amorielingeriee",
  "address": "Rua Olavo Bilac, 08, entre Bom Jardim e VS10, Caetanópolis, Parauapebas–PA, CEP 68515-000",
  "groupLink": "",
  "deliveryFee": 0,
  "deliveryNote": "Taxa de entrega combinada no WhatsApp conforme o bairro.",
  "freeShippingAbove": 0,
  "firstPercent": 5,
  "exitPercent": 10,
  "abandonHours": 1,
  "introVideo": "",
  "logoUrl": ""
}'::jsonb, updated_at = now() where id = 1;
