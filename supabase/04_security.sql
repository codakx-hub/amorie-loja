-- =====================================================================
-- AMORIÊ — reforço de segurança (rode depois dos arquivos 01, 02 e 03)
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- ---------- 1. Restringir acessos: visitante (anon) só LÊ o catálogo ----------
revoke all on all tables in schema public from anon;
grant select on public.settings, public.categories, public.products to anon;
revoke all on all sequences in schema public from anon;

-- ---------- 2. Bloquear mass assignment: cliente só altera os campos permitidos ----------
revoke insert, update on public.profiles from authenticated;
grant insert (id, name, whatsapp, cpf, birth_date, address) on public.profiles to authenticated;
grant update (name, whatsapp, cpf, birth_date, address) on public.profiles to authenticated;

-- ---------- 3. Validação dos dados no servidor (não depende do navegador) ----------
do $$ begin
  alter table public.profiles add constraint profiles_name_len check (name is null or char_length(name) between 1 and 120);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_whatsapp_fmt check (whatsapp is null or whatsapp = '' or whatsapp ~ '^[0-9]{10,13}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_cpf_fmt check (cpf is null or cpf ~ '^[0-9]{11}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_address_size check (pg_column_size(address) < 4000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.orders add constraint orders_notes_len check (notes is null or char_length(notes) <= 500);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.orders add constraint orders_values check (subtotal >= 0 and discount >= 0 and delivery_fee >= 0 and total >= 0 and total < 1000000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.products add constraint products_name_len check (char_length(name) between 1 and 200);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.products add constraint products_price_max check (price < 100000 and (promo_price is null or promo_price < 100000));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.products add constraint products_images_max check (cardinality(images) <= 12 and char_length(description) <= 4000 and char_length(tags) <= 500);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.coupons add constraint coupons_code_fmt check (code ~ '^[A-Z0-9_-]{3,30}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.coupons add constraint coupons_percent_max check (kind <> 'percent' or value <= 90);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.categories add constraint categories_id_fmt check (id ~ '^[a-z0-9-]{1,40}$' and char_length(name) between 1 and 60);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.settings add constraint settings_size check (pg_column_size(data) < 20000);
exception when duplicate_object then null; end $$;

-- ---------- 4. Rate limit (limite de tentativas por IP) ----------
create table if not exists public.rate_hits (
  key text not null,
  bucket timestamptz not null,
  hits int not null default 0,
  primary key (key, bucket)
);
alter table public.rate_hits enable row level security;   -- sem políticas: ninguém lê de fora
revoke all on public.rate_hits from anon, authenticated;

create or replace function public.client_ip() returns text
language sql stable set search_path = public as $$
  select coalesce(
    split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1),
    'desconhecido');
$$;

-- devolve true quando a pessoa passou do limite
create or replace function public.too_many(p_action text, p_max int, p_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_key text := p_action || ':' || coalesce(nullif(client_ip(), ''), 'desconhecido') || ':' || coalesce(auth.uid()::text, '');
        v_bucket timestamptz := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds);
        v_hits int;
begin
  insert into rate_hits(key, bucket, hits) values (v_key, v_bucket, 1)
  on conflict (key, bucket) do update set hits = rate_hits.hits + 1
  returning hits into v_hits;
  if random() < 0.01 then delete from rate_hits where bucket < now() - interval '1 day'; end if;
  return v_hits > p_max;
end; $$;
revoke execute on function public.too_many(text, int, int) from public, anon, authenticated;
revoke execute on function public.client_ip() from public, anon, authenticated;

-- track_event: no máximo 60 eventos por minuto por IP
create or replace function public.track_event(p_type text, p_product uuid default null, p_session text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_type not in ('view','add_to_cart','popup_shown','popup_converted') then return; end if;
  if too_many('event', 60, 60) then return; end if;
  insert into events(type, product_id, session_id) values (p_type, p_product, left(p_session, 64));
  if p_type = 'view' and p_product is not null then
    update products set views = views + 1 where id = p_product;
  end if;
end; $$;

-- save_cart: no máximo 30 salvamentos por minuto por IP
create or replace function public.save_cart(p_id uuid, p_items jsonb, p_name text default null, p_whatsapp text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_items jsonb := '[]'::jsonb; v_total numeric := 0; it jsonb; pr products; q int;
begin
  if p_id is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 60 then return; end if;
  if too_many('cart', 30, 60) then return; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    q := greatest(1, least(99, coalesce((it->>'qty')::int, 1)));
    select * into pr from products where id = (it->>'id')::uuid and active;
    if found then
      v_items := v_items || jsonb_build_object('id', pr.id, 'name', pr.name, 'qty', q, 'price', effective_price(pr), 'image', pr.images[1]);
      v_total := v_total + q * effective_price(pr);
    end if;
  end loop;
  insert into carts(id, user_id, name, whatsapp, items, total, updated_at)
  values (p_id, auth.uid(), left(p_name,120), left(only_digits(p_whatsapp), 13), v_items, v_total, now())
  on conflict (id) do update set
    user_id  = coalesce(auth.uid(), carts.user_id),
    name     = coalesce(nullif(left(excluded.name,120),''), carts.name),
    whatsapp = coalesce(nullif(excluded.whatsapp,''), carts.whatsapp),
    items    = excluded.items, total = excluded.total, updated_at = now()
  where carts.status in ('open','contacted');
end; $$;

-- cupom do popup: código mais longo e no máximo 5 por hora por IP
create or replace function public.create_exit_coupon(p_product uuid default null, p_session text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pct numeric := setting_num('exitPercent', 10); v_code text; v_exp timestamptz;
begin
  select code, expires_at into v_code, v_exp from coupons
   where origin = 'exit' and session_id = left(p_session,64) and created_at > now() - interval '24 hours' limit 1;
  if v_code is null then
    if too_many('exitcoupon', 5, 3600) then raise exception 'muitas_tentativas'; end if;
    v_code := 'VOLTA' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
    v_exp := now() + interval '24 hours';
    insert into coupons(code, kind, value, expires_at, max_uses, origin, customer_user, session_id, note)
    values (v_code, 'percent', v_pct, v_exp, 1, 'exit', auth.uid(), left(p_session,64), 'Popup de saída');
    perform track_event('popup_converted', p_product, p_session);
  end if;
  return jsonb_build_object('code', v_code, 'percent', v_pct, 'expires_at', v_exp);
end; $$;

-- validar cupom: no máximo 20 tentativas a cada 10 minutos (impede adivinhar códigos)
create or replace function public.validate_coupon(p_code text, p_subtotal numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_whats text;
begin
  if too_many('coupon', 20, 600) then return jsonb_build_object('ok', false, 'error', 'Muitas tentativas. Aguarde alguns minutos.'); end if;
  select whatsapp into v_whats from profiles where id = auth.uid();
  return coupon_discount(left(p_code, 30), greatest(0, least(p_subtotal, 1000000)), auth.uid(), v_whats);
end; $$;

-- fechar pedido: no máximo 5 pedidos a cada 10 minutos por cliente/IP
create or replace function public.order_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'site' and not public.is_admin() and too_many('order', 5, 600) then
    raise exception 'muitas_tentativas';
  end if;
  return new;
end; $$;
drop trigger if exists t_orders_guard on public.orders;
create trigger t_orders_guard before insert on public.orders for each row execute function public.order_guard();

-- ---------- 5. Funções com caminho fixo (evita sequestro de search_path) ----------
alter function public.only_digits(text) set search_path = public;
alter function public.effective_price(public.products) set search_path = public;
alter function public.touch_updated_at() set search_path = public;
alter function public.lock_cpf() set search_path = public;
revoke execute on function public.setting_num(text, numeric) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.order_guard() from public, anon, authenticated;

grant execute on function public.track_event(text, uuid, text) to anon, authenticated;
grant execute on function public.save_cart(uuid, jsonb, text, text) to anon, authenticated;
grant execute on function public.create_exit_coupon(uuid, text) to anon, authenticated;
grant execute on function public.validate_coupon(text, numeric) to anon, authenticated;

-- ---------- 6. Uploads: só imagens e vídeos, até 50 MB ----------
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
 where id = 'media';

-- ---------- 7. Dados do Pix na configuração da loja ----------
update public.settings set data = data || '{
  "pixKeyType": "celular",
  "pixKey": "(94) 99122-7330",
  "pixName": "Juliane Mendes Boaes Sampaio",
  "pixBank": "Itaú",
  "pixCity": "Parauapebas"
}'::jsonb, updated_at = now() where id = 1 and not (data ? 'pixKey');

-- ---------- 8. Conferência: toda tabela pública precisa estar com RLS ligado ----------
select tablename, rowsecurity as rls_ligado from pg_tables where schemaname = 'public' order by rowsecurity, tablename;
