-- =====================================================================
-- AMORIÊ Lingerie — banco de dados (Supabase / Postgres)
-- Rode este arquivo inteiro no SQL Editor do Supabase, depois 02_seed.sql
-- e por último 03_admin.sql.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- Tabelas ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.settings (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

create table if not exists public.categories (
  id text primary key,
  name text not null,
  icon text not null default 'heart',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  tags text not null default '',
  price numeric(10,2) not null default 0 check (price >= 0),
  promo_price numeric(10,2) check (promo_price is null or promo_price >= 0),
  category_id text references public.categories(id) on update cascade on delete set null,
  extra_categories text[] not null default '{}',
  images text[] not null default '{}',
  featured boolean not null default false,
  active boolean not null default true,
  stock int,
  views int not null default 0,
  sold int not null default 0,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_category_idx on public.products(category_id);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  whatsapp text,
  cpf text unique,
  birth_date date,
  address jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  code text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  customer_name text,
  whatsapp text,
  cpf text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  discount_detail jsonb not null default '[]'::jsonb,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  delivery_method text not null default 'retirada' check (delivery_method in ('retirada','entrega')),
  address jsonb,
  payment_method text not null default 'pix' check (payment_method in ('pix','cartao','dinheiro')),
  change_for numeric(10,2),
  notes text,
  coupon_code text,
  status text not null default 'novo'
    check (status in ('novo','confirmado','pago','saiu_entrega','pronto_retirada','entregue','cancelado')),
  source text not null default 'site' check (source in ('site','manual')),
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_created_idx on public.orders(created_at);
create index if not exists orders_user_idx on public.orders(user_id);

create table if not exists public.carts (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete set null,
  name text,
  whatsapp text,
  items jsonb not null default '[]'::jsonb,
  total numeric(10,2) not null default 0,
  status text not null default 'open' check (status in ('open','ordered','contacted','recovered','dismissed')),
  order_code text,
  offer_code text,
  contacted_at timestamptz,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists carts_status_idx on public.carts(status, updated_at);

create table if not exists public.coupons (
  code text primary key,
  kind text not null default 'percent' check (kind in ('percent','fixed')),
  value numeric(10,2) not null check (value > 0),
  expires_at timestamptz,
  max_uses int,
  uses int not null default 0,
  origin text not null default 'manual' check (origin in ('manual','exit','abandoned','loyalty')),
  customer_user uuid references auth.users(id) on delete set null,
  customer_whatsapp text,
  session_id text,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  type text not null check (type in ('view','add_to_cart','popup_shown','popup_converted')),
  product_id uuid references public.products(id) on delete set null,
  session_id text,
  demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists events_type_idx on public.events(type, created_at);

-- ---------- Funções auxiliares ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.only_digits(t text) returns text
language sql immutable as $$ select regexp_replace(coalesce(t,''), '\D', '', 'g'); $$;

create or replace function public.effective_price(p public.products) returns numeric
language sql immutable as $$
  select case when p.promo_price is not null and p.promo_price > 0 and p.promo_price < p.price
              then p.promo_price else p.price end;
$$;

create or replace function public.setting_num(key text, fallback numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(data->>key,'')::numeric, fallback) from public.settings where id = 1;
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists t_products_upd on public.products;
create trigger t_products_upd before update on public.products for each row execute function public.touch_updated_at();
drop trigger if exists t_orders_upd on public.orders;
create trigger t_orders_upd before update on public.orders for each row execute function public.touch_updated_at();
drop trigger if exists t_profiles_upd on public.profiles;
create trigger t_profiles_upd before update on public.profiles for each row execute function public.touch_updated_at();

-- Clientes não podem trocar o CPF depois de cadastrado (evita abuso do desconto)
create or replace function public.lock_cpf() returns trigger language plpgsql as $$
begin
  if old.cpf is not null and new.cpf is distinct from old.cpf and not public.is_admin() then
    new.cpf := old.cpf;
  end if;
  return new;
end; $$;
drop trigger if exists t_profiles_cpf on public.profiles;
create trigger t_profiles_cpf before update on public.profiles for each row execute function public.lock_cpf();

-- Cria o perfil automaticamente quando a cliente se cadastra
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cpf text := public.only_digits(new.raw_user_meta_data->>'cpf');
begin
  if length(v_cpf) <> 11 or exists (select 1 from public.profiles where cpf = v_cpf) then v_cpf := null; end if;
  insert into public.profiles(id, name, whatsapp, cpf)
  values (new.id, left(new.raw_user_meta_data->>'name', 120), public.only_digits(new.raw_user_meta_data->>'whatsapp'), v_cpf)
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Segurança (RLS) ----------
alter table public.settings   enable row level security;
alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.admins     enable row level security;
alter table public.profiles   enable row level security;
alter table public.orders     enable row level security;
alter table public.carts      enable row level security;
alter table public.coupons    enable row level security;
alter table public.events     enable row level security;

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using (true);
drop policy if exists settings_admin on public.settings;
create policy settings_admin on public.settings for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select using (true);
drop policy if exists categories_admin on public.categories;
create policy categories_admin on public.categories for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_read on public.products;
create policy products_read on public.products for select using (active or public.is_admin());
drop policy if exists products_admin on public.products;
create policy products_admin on public.products for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins for select using (user_id = auth.uid());

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists orders_admin on public.orders;
create policy orders_admin on public.orders for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists carts_admin on public.carts;
create policy carts_admin on public.carts for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists coupons_admin on public.coupons;
create policy coupons_admin on public.coupons for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists events_admin on public.events;
create policy events_admin on public.events for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Funções públicas (chamadas pelo site) ----------

-- Registra visualizações, sacola e popups
create or replace function public.track_event(p_type text, p_product uuid default null, p_session text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_type not in ('view','add_to_cart','popup_shown','popup_converted') then return; end if;
  insert into events(type, product_id, session_id) values (p_type, p_product, left(p_session, 64));
  if p_type = 'view' and p_product is not null then
    update products set views = views + 1 where id = p_product;
  end if;
end; $$;

-- Salva a sacola para o painel de carrinhos abandonados (preços recalculados aqui)
create or replace function public.save_cart(p_id uuid, p_items jsonb, p_name text default null, p_whatsapp text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_items jsonb := '[]'::jsonb; v_total numeric := 0; it jsonb; pr products; q int;
begin
  if p_id is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 60 then return; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    q := greatest(1, least(99, coalesce((it->>'qty')::int, 1)));
    select * into pr from products where id = (it->>'id')::uuid and active;
    if found then
      v_items := v_items || jsonb_build_object('id', pr.id, 'name', pr.name, 'qty', q,
                   'price', effective_price(pr), 'image', pr.images[1]);
      v_total := v_total + q * effective_price(pr);
    end if;
  end loop;
  insert into carts(id, user_id, name, whatsapp, items, total, updated_at)
  values (p_id, auth.uid(), left(p_name,120), only_digits(p_whatsapp), v_items, v_total, now())
  on conflict (id) do update set
    user_id  = coalesce(auth.uid(), carts.user_id),
    name     = coalesce(nullif(left(excluded.name,120),''), carts.name),
    whatsapp = coalesce(nullif(excluded.whatsapp,''), carts.whatsapp),
    items    = excluded.items,
    total    = excluded.total,
    updated_at = now()
  where carts.status in ('open','contacted');
end; $$;

-- Gera o cupom do popup de saída (1 por sessão a cada 24h)
create or replace function public.create_exit_coupon(p_product uuid default null, p_session text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pct numeric := setting_num('exitPercent', 10); v_code text; v_exp timestamptz;
begin
  select code, expires_at into v_code, v_exp from coupons
   where origin = 'exit' and session_id = left(p_session,64) and created_at > now() - interval '24 hours' limit 1;
  if v_code is null then
    v_code := 'VOLTA' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    v_exp := now() + interval '24 hours';
    insert into coupons(code, kind, value, expires_at, max_uses, origin, customer_user, session_id, note)
    values (v_code, 'percent', v_pct, v_exp, 1, 'exit', auth.uid(), left(p_session,64), 'Popup de saída');
    perform track_event('popup_converted', p_product, p_session);
  end if;
  return jsonb_build_object('code', v_code, 'percent', v_pct, 'expires_at', v_exp);
end; $$;

-- Calcula o desconto de um cupom (uso interno)
create or replace function public.coupon_discount(p_code text, p_base numeric, p_uid uuid, p_whatsapp text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c coupons; d numeric;
begin
  select * into c from coupons where code = upper(trim(p_code));
  if not found or not c.active then return jsonb_build_object('ok', false, 'error', 'Cupom inválido'); end if;
  if c.expires_at is not null and c.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'Cupom expirado'); end if;
  if c.max_uses is not null and c.uses >= c.max_uses then return jsonb_build_object('ok', false, 'error', 'Cupom já utilizado'); end if;
  if (c.customer_user is not null and c.customer_user is distinct from p_uid)
     and (c.customer_whatsapp is null or c.customer_whatsapp <> only_digits(p_whatsapp)) then
    return jsonb_build_object('ok', false, 'error', 'Este cupom é de outra cliente');
  end if;
  if c.customer_user is null and c.customer_whatsapp is not null and c.customer_whatsapp <> only_digits(p_whatsapp) then
    return jsonb_build_object('ok', false, 'error', 'Este cupom é de outra cliente');
  end if;
  d := case when c.kind = 'percent' then round(p_base * c.value / 100, 2) else least(c.value, p_base) end;
  return jsonb_build_object('ok', true, 'code', c.code, 'kind', c.kind, 'value', c.value, 'discount', d,
    'label', case when c.kind = 'percent' then 'Cupom ' || c.code || ' (' || trim(to_char(c.value,'FM990.##')) || '%)' else 'Cupom ' || c.code end);
end; $$;

create or replace function public.validate_coupon(p_code text, p_subtotal numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_whats text;
begin
  select whatsapp into v_whats from profiles where id = auth.uid();
  return coupon_discount(p_code, greatest(0, p_subtotal), auth.uid(), v_whats);
end; $$;

-- Cupons da cliente logada
create or replace function public.my_coupons()
returns setof public.coupons language sql stable security definer set search_path = public as $$
  select c.* from coupons c
   where c.active and (c.expires_at is null or c.expires_at > now())
     and (c.max_uses is null or c.uses < c.max_uses)
     and auth.uid() is not null
     and (c.customer_user = auth.uid()
          or c.customer_whatsapp = (select only_digits(whatsapp) from profiles where id = auth.uid()))
   order by c.created_at desc;
$$;

-- A cliente tem direito ao desconto da 1ª compra com CPF?
create or replace function public.first_purchase_eligible()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from profiles p where p.id = auth.uid() and p.cpf is not null)
     and not exists (select 1 from orders o where o.status <> 'cancelado'
                      and (o.user_id = auth.uid()
                           or o.cpf = (select cpf from profiles where id = auth.uid())));
$$;

-- Fecha o pedido: recalcula tudo no servidor
create or replace function public.place_order(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); prof profiles; it jsonb; pr products; q int;
  v_items jsonb := '[]'::jsonb; v_sub numeric := 0; v_d1 numeric := 0; v_d2 numeric := 0; v_fee numeric := 0;
  v_detail jsonb := '[]'::jsonb; v_cup jsonb; v_code text; v_method text; v_pay text; v_total numeric;
  v_first boolean; v_pct numeric; v_free numeric; v_cart uuid; v_change numeric;
begin
  if v_uid is null then raise exception 'login_required'; end if;
  select * into prof from profiles where id = v_uid;
  if not found or coalesce(prof.name,'') = '' or length(only_digits(prof.whatsapp)) < 10 then
    raise exception 'profile_incomplete';
  end if;

  for it in select * from jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) loop
    q := greatest(1, least(99, coalesce((it->>'qty')::int, 1)));
    select * into pr from products where id = (it->>'id')::uuid and active;
    if not found then continue; end if;
    if pr.stock is not null and pr.stock < q then raise exception 'sem_estoque:%', pr.name; end if;
    v_items := v_items || jsonb_build_object('id', pr.id, 'name', pr.name, 'qty', q,
                 'price', effective_price(pr), 'image', pr.images[1]);
    v_sub := v_sub + q * effective_price(pr);
  end loop;
  if jsonb_array_length(v_items) = 0 then raise exception 'carrinho_vazio'; end if;

  v_first := first_purchase_eligible();
  if v_first then
    v_pct := setting_num('firstPercent', 5);
    if v_pct > 0 then
      v_d1 := round(v_sub * v_pct / 100, 2);
      v_detail := v_detail || jsonb_build_object('label', '1ª compra com CPF (' || trim(to_char(v_pct,'FM990.##')) || '%)', 'value', v_d1);
    end if;
  end if;

  if coalesce(trim(p->>'coupon'),'') <> '' then
    v_cup := coupon_discount(p->>'coupon', v_sub - v_d1, v_uid, prof.whatsapp);
    if not (v_cup->>'ok')::boolean then raise exception 'cupom:%', v_cup->>'error'; end if;
    v_d2 := (v_cup->>'discount')::numeric;
    v_detail := v_detail || jsonb_build_object('label', v_cup->>'label', 'value', v_d2);
    update coupons set uses = uses + 1 where code = v_cup->>'code';
  end if;

  v_method := coalesce(p->>'delivery_method','retirada');
  if v_method not in ('retirada','entrega') then v_method := 'retirada'; end if;
  if v_method = 'entrega' then
    if coalesce(p->'address'->>'street','') = '' or coalesce(p->'address'->>'number','') = '' then
      raise exception 'endereco_incompleto';
    end if;
    v_fee := setting_num('deliveryFee', 0);
    v_free := setting_num('freeShippingAbove', 0);
    if v_free > 0 and v_sub >= v_free then v_fee := 0; end if;
  end if;

  v_pay := coalesce(p->>'payment_method','pix');
  if v_pay not in ('pix','cartao','dinheiro') then v_pay := 'pix'; end if;
  v_change := nullif(p->>'change_for','')::numeric;

  v_total := greatest(0, v_sub - v_d1 - v_d2 + v_fee);
  v_code := 'AM' || to_char(now() at time zone 'America/Belem', 'DDMM') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));

  insert into orders(code, user_id, customer_name, whatsapp, cpf, items, subtotal, discount, discount_detail,
                     delivery_fee, total, delivery_method, address, payment_method, change_for, notes, coupon_code)
  values (v_code, v_uid, prof.name, only_digits(prof.whatsapp), prof.cpf, v_items, v_sub, v_d1 + v_d2, v_detail,
          v_fee, v_total, v_method, case when v_method = 'entrega' then p->'address' end, v_pay,
          case when v_pay = 'dinheiro' then v_change end, left(p->>'notes', 500), v_cup->>'code');

  for it in select * from jsonb_array_elements(v_items) loop
    update products set sold = sold + (it->>'qty')::int,
                        stock = case when stock is null then null else greatest(0, stock - (it->>'qty')::int) end
     where id = (it->>'id')::uuid;
  end loop;

  begin v_cart := nullif(p->>'cart_id','')::uuid; exception when others then v_cart := null; end;
  if v_cart is not null then
    update carts set status = case when status = 'contacted' then 'recovered' else 'ordered' end,
                     order_code = v_code, user_id = v_uid, updated_at = now()
     where id = v_cart;
  end if;
  -- outros carrinhos abertos da mesma cliente deixam de contar como abandonados
  update carts set status = case when status = 'contacted' then 'recovered' else 'ordered' end, order_code = v_code
   where status in ('open','contacted') and (user_id = v_uid or whatsapp = only_digits(prof.whatsapp))
     and updated_at > now() - interval '7 days';

  return jsonb_build_object('code', v_code, 'subtotal', v_sub, 'discount', v_d1 + v_d2, 'discount_detail', v_detail,
    'delivery_fee', v_fee, 'total', v_total, 'items', v_items, 'delivery_method', v_method,
    'payment_method', v_pay, 'change_for', v_change, 'customer_name', prof.name);
end; $$;

-- ---------- Funções do painel ----------
create or replace function public.admin_cart_offer(p_cart uuid, p_percent numeric)
returns text language plpgsql security definer set search_path = public as $$
declare c carts; v_code text;
begin
  if not is_admin() then raise exception 'not_admin'; end if;
  select * into c from carts where id = p_cart;
  if not found then raise exception 'carrinho_nao_encontrado'; end if;
  v_code := 'AMOR' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
  insert into coupons(code, kind, value, expires_at, max_uses, origin, customer_user, customer_whatsapp, note)
  values (v_code, 'percent', greatest(1, least(90, p_percent)),
          date_trunc('day', now() at time zone 'America/Belem') at time zone 'America/Belem' + interval '2 days' - interval '1 second',
          1, 'abandoned', c.user_id, c.whatsapp, 'Carrinho abandonado');
  update carts set status = 'contacted', contacted_at = now(), offer_code = v_code where id = p_cart;
  return v_code;
end; $$;

-- ---------- Permissões das funções ----------
revoke execute on function public.coupon_discount(text, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.track_event(text, uuid, text) to anon, authenticated;
grant execute on function public.save_cart(uuid, jsonb, text, text) to anon, authenticated;
grant execute on function public.create_exit_coupon(uuid, text) to anon, authenticated;
grant execute on function public.validate_coupon(text, numeric) to anon, authenticated;
grant execute on function public.my_coupons() to authenticated;
grant execute on function public.first_purchase_eligible() to authenticated;
grant execute on function public.place_order(jsonb) to authenticated;
grant execute on function public.admin_cart_offer(uuid, numeric) to authenticated;

-- ---------- Fotos e vídeo (Storage) ----------
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select using (bucket_id = 'media');
drop policy if exists media_admin_insert on storage.objects;
create policy media_admin_insert on storage.objects for insert with check (bucket_id = 'media' and public.is_admin());
drop policy if exists media_admin_update on storage.objects;
create policy media_admin_update on storage.objects for update using (bucket_id = 'media' and public.is_admin());
drop policy if exists media_admin_delete on storage.objects;
create policy media_admin_delete on storage.objects for delete using (bucket_id = 'media' and public.is_admin());
-- Dados iniciais: categorias e 95 produtos
insert into public.categories(id,name,icon,position) values
('lingeries','Lingeries','lingerie',0),
('pecas-intimas','Peças íntimas','panty',1),
('fantasias','Fantasias','mask',2),
('excitantes','Excitantes','flame',3),
('gel-beijavel','Gel beijável','lips',4),
('lubrificantes','Lubrificantes','drop',5),
('oleos-massagem','Óleos & massagem','bottle',6),
('vibradores','Vibradores','toy',7),
('proteses','Próteses','toy2',8),
('plugs','Plugs','plug',9),
('acessorios-fetiche','Acessórios & fetiche','lock',10),
('jogos-casal','Jogos para casal','dice',11),
('kits-presente','Kits presente','gift',12),
('autocuidado','Autocuidado & higiene íntima','leaf',13),
('adstringente','Adstringente','spark',14),
('dessensibilizante','Dessensibilizante anal','feather',15)
on conflict (id) do nothing;
insert into public.products(name,description,tags,price,promo_price,category_id,extra_categories,images,position) values
('Toque da virgem gel adstringente','Sensação de firmeza e frescor para momentos especiais.','adstringente aperta virgem',89.99,null,'adstringente',array['excitantes','gel-beijavel']::text[],array['https://cdn.offstoreimages.me/compressed/adb00ca1cbab7caf2b4f156cadc38cd5.webp'],0),
('Óleo corporal Ousada','Para desacelerar, relaxar e se entregar ao toque.','oleo massagem vela corporal aromatico',49.99,null,'oleos-massagem','{}'::text[],array['https://cdn.offstoreimages.me/compressed/d473ae2408356c20be8fbe60580a3051.webp'],1),
('Gel estimulante aquece e vibra sabor baballo','Para elevar a temperatura do momento a dois.','excitante estimulante esquenta pulsa vibra quente sensação',85.0,null,'excitantes',array['gel-beijavel']::text[],array['https://cdn.offstoreimages.me/compressed/d8747fefb5a2a626adb49dbccbe111fa.webp'],2),
('Kit Suculenta (lubrificante + calda)','Combinação pensada para uma noite inesquecível.','kit presente caixa casal',179.99,159.99,'kits-presente','{}'::text[],array['https://cdn.offstoreimages.me/compressed/29948a09b096ebbadf98cde8abede6a2.webp'],3),
('Jogo casal TalkMe 54 cartas','Brincadeira a dois para criar intimidade e muita diversão.','jogo casal cartas brincadeira',45.0,null,'jogos-casal',array['acessorios-fetiche']::text[],array['https://cdn.offstoreimages.me/compressed/a4dd9340cd45f5c1b1fab22cc19ed2d5.webp'],4),
('Melzinho do amor estimulante unissex','Para elevar a temperatura do momento a dois.','excitante estimulante esquenta pulsa vibra quente sensação',25.0,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/c1ac4d5b5bb6d6f58f3cbd4e6745507d.webp'],5),
('Breeze gel excitante com jambu','Sensações que aquecem, pulsam e despertam cada toque.','excitante estimulante esquenta pulsa vibra quente sensação',109.99,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/a1f4ef2781ba862569dc35a5e26ae257.webp'],6),
('Kit prazer em dobro','Um convite para sentir mais: efeito intenso e envolvente.','excitante estimulante esquenta pulsa vibra quente sensação',55.0,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/8cf861cca3baa99ecfe2ba35ae782f55.webp'],7),
('Desodorante íntimo aroma menta','Cuidado íntimo com frescor, perfume e bem-estar.','higiene intima desodorante perfume cuidado',49.99,null,'autocuidado','{}'::text[],array['https://cdn.offstoreimages.me/compressed/e3762e784f8f3c6c54aa88512d34addc.webp'],8),
('Desodorante íntimo aroma sedutor Deborah Secco','Autocuidado delicado para se sentir ainda mais confiante.','higiene intima desodorante perfume cuidado',89.99,null,'autocuidado','{}'::text[],array['https://cdn.offstoreimages.me/compressed/e108e94e323b1e7e89baa59d8a14bcec.webp'],9),
('Baralho kama sutra 50 cartas de posições','Brincadeira a dois para criar intimidade e muita diversão.','jogo casal cartas brincadeira',45.0,null,'jogos-casal',array['acessorios-fetiche']::text[],array['https://cdn.offstoreimages.me/compressed/56cc9d2423a710d79e6e1d34fd6b3563.webp'],10),
('Óleo de massagem breeze 120ml','Para desacelerar, relaxar e se entregar ao toque.','oleo massagem vela corporal aromatico',49.99,null,'oleos-massagem',array['autocuidado']::text[],array['https://cdn.offstoreimages.me/compressed/8038ddd8830863d2016b9ec2bafc8edc.webp'],11),
('Estimulante feminino beijável Excitation','Sensações que aquecem, pulsam e despertam cada toque.','excitante estimulante esquenta pulsa vibra quente sensação',109.99,null,'excitantes',array['gel-beijavel']::text[],array['https://cdn.offstoreimages.me/compressed/117f6d0474f2ead07929ab5ae5fde3c0.webp'],12),
('Jogo duelo do prazer picante','Desafios picantes para conhecer ainda mais o seu par.','jogo casal cartas brincadeira',29.99,null,'jogos-casal',array['acessorios-fetiche']::text[],array['https://cdn.offstoreimages.me/compressed/48e1a77d51b47fd50a0602d399802e22.webp'],13),
('Geme geme excitante feminino sabor chiclete','Para elevar a temperatura do momento a dois.','excitante estimulante esquenta pulsa vibra quente sensação',29.99,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/1edcca23c820276c848c082bd06175ca.webp'],14),
('Bubble Vibes 3 em 1 lubrificante e excitante','Sensações que aquecem, pulsam e despertam cada toque.','excitante estimulante esquenta pulsa vibra quente sensação',149.99,null,'excitantes',array['gel-beijavel']::text[],array['https://cdn.offstoreimages.me/compressed/6f772e3ea8dd00c31593306c49802696.webp'],15),
('Bruma Aromática Pélvica by Deborah Secco','Cuidado íntimo com frescor, perfume e bem-estar.','higiene intima desodorante perfume cuidado',89.99,null,'autocuidado','{}'::text[],array['https://cdn.offstoreimages.me/compressed/f681d610d6ee1654755ed9ee3fa0b9de.webp'],16),
('Pico Pulse suga, pulsa, gela excitante unissex','Para elevar a temperatura do momento a dois.','excitante estimulante esquenta pulsa vibra quente sensação',109.99,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/7e9ef6633be17eec9422f1bc5651aa48.webp'],17),
('Kit xana loka','Sensações que aquecem, pulsam e despertam cada toque.','excitante estimulante esquenta pulsa vibra quente sensação',45.0,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/f3f44500d2186609e0370b996dc8af6b.webp'],18),
('Pinto Loko excitante masculino','Um convite para sentir mais: efeito intenso e envolvente.','excitante estimulante esquenta pulsa vibra quente sensação',25.0,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/97f855f8c93430ac7487310c3bdec548.webp'],19),
('Lubrificante suculenta by Calianer','Deslize suave e confortável para mais prazer.','lubrificante lubri gel deslizante',109.99,null,'lubrificantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/6b5bed88eed01a483320ce04de736cdc.webp'],20),
('Desodorante íntimo phero','Autocuidado delicado para se sentir ainda mais confiante.','higiene intima desodorante perfume cuidado',59.99,null,'autocuidado','{}'::text[],array['https://cdn.offstoreimages.me/compressed/a6555a6d307919b005dc3d9403e31927.webp'],21),
('Perfume de calcinha phero (feromônio) 40ml','Cuidado íntimo com frescor, perfume e bem-estar.','higiene intima desodorante perfume cuidado',29.99,null,'autocuidado','{}'::text[],array['https://cdn.offstoreimages.me/compressed/b2c2aca7be8c1c4b6e58edc2ac919783.webp'],22),
('Suculenta calda comestível by Calianer','Para elevar a temperatura do momento a dois.','excitante estimulante esquenta pulsa vibra quente sensação',69.99,null,'excitantes',array['gel-beijavel']::text[],array['https://cdn.offstoreimages.me/compressed/569ce50a84ffad8ae730ef7317cf5503.webp'],23),
('Excitante estimulante feminino Vulv’s','Sensações que aquecem, pulsam e despertam cada toque.','excitante estimulante esquenta pulsa vibra quente sensação',55.0,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/25abff90b16699cb4aabb4c5fe430c09.webp'],24),
('Lubrificante beijável by Deborah Secco','Toque sedoso que deixa tudo mais leve e natural.','lubrificante lubri gel deslizante',89.99,null,'lubrificantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/6c8e1a5bac965f1b90fd4e0c1e55da3a.webp'],25),
('Capa extensora peniana','Um toque de ousadia para tirar a rotina do lugar.','acessorio fetiche algema sado bdsm',45.0,null,'acessorios-fetiche','{}'::text[],array['https://cdn.offstoreimages.me/compressed/b751737ea7a682ee03d0237920a0d70a.webp'],26),
('Gel excitante suga, pulsa, esquenta e vibra','Sensações que aquecem, pulsam e despertam cada toque.','excitante estimulante esquenta pulsa vibra quente sensação',49.99,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/766e77d6b86a854794867763b8f8d341.webp'],27),
('Kit anal perfeito','Seleção especial pronta para presentear ou se presentear.','kit presente caixa casal',165.0,null,'kits-presente','{}'::text[],array['https://cdn.offstoreimages.me/compressed/f56c46673f8fac1f247b290353e32287.webp'],28),
('Kit anal e prazer','Combinação pensada para uma noite inesquecível.','kit presente caixa casal',95.0,null,'kits-presente','{}'::text[],array['https://cdn.offstoreimages.me/compressed/7977310e0d1df0873f669faf4b2e4aee.webp'],29),
('Harness vermelho','Um toque de ousadia para tirar a rotina do lugar.','acessorio fetiche algema sado bdsm',89.99,null,'acessorios-fetiche','{}'::text[],array['https://cdn.offstoreimages.me/compressed/5ded9d32505f66e34dc22bb34cb71dc8.webp'],30),
('Calda para oral Ohh Delicia','Beijável, saboroso e feito para provocar.','beijavel oral sabor calda gel comestivel',59.99,null,'gel-beijavel','{}'::text[],array['https://cdn.offstoreimages.me/compressed/f36729dad354af6d08dac69c8b49d4bf.webp'],31),
('Kit anal basic','Conforto e relaxamento para explorar com tranquilidade.','dessensibilizante anal relaxante',95.0,null,'dessensibilizante',array['kits-presente']::text[],array['https://cdn.offstoreimages.me/compressed/c16d7904ec4ea4126e3a0cb33fff2b57.webp'],32),
('Kit prazer masculino','Combinação pensada para uma noite inesquecível.','kit presente caixa casal',50.0,null,'kits-presente','{}'::text[],array['https://cdn.offstoreimages.me/compressed/62bd505e65450c312447d0a7c954b60e.webp'],33),
('Kit noite em chamas','Um convite para sentir mais: efeito intenso e envolvente.','excitante estimulante esquenta pulsa vibra quente sensação',79.99,null,'excitantes',array['kits-presente','lubrificantes']::text[],array['https://cdn.offstoreimages.me/compressed/f880bb41f796b0fec754f0c87e6dd8a1.webp'],34),
('Lubrificante neutro sabor tutti frutti','Textura deliciosa para explorar sem pressa.','beijavel oral sabor calda gel comestivel',29.99,null,'gel-beijavel',array['lubrificantes']::text[],array['https://cdn.offstoreimages.me/compressed/f442489a4a6d942f5febdc3adee6700d.webp'],35),
('Bolinha sensação gela','Sensações que aquecem, pulsam e despertam cada toque.','excitante estimulante esquenta pulsa vibra quente sensação',15.0,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/e6937c7dfe0f30c9fa12b92628e24769.webp'],36),
('Lubpro lubrificante morango com chatilly','Toque sedoso que deixa tudo mais leve e natural.','lubrificante lubri gel deslizante',39.99,null,'lubrificantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/b4f3267e9f2200c5ee11e6ba359cfe6c.webp'],37),
('Vibrador de calcinha por aplicativo','Design delicado, vibrações intensas e prazer sob medida.','vibrador vibro brinquedo sugador massageador',189.99,null,'vibradores','{}'::text[],array['https://cdn.offstoreimages.me/compressed/43f716ea31eb479d1c07c341c4bac255.webp'],38),
('Anel peniano com vibro','Potência discreta para descobrir novas sensações.','vibrador vibro brinquedo sugador massageador',19.99,null,'vibradores','{}'::text[],array['https://cdn.offstoreimages.me/compressed/890e5179dbd54c31bdbe2047b2ad2c4c.webp'],39),
('Tesão na raba gel dessensibiliante excitante','Conforto e relaxamento para explorar com tranquilidade.','dessensibilizante anal relaxante',29.99,null,'dessensibilizante','{}'::text[],array['https://cdn.offstoreimages.me/compressed/516b4589517a21ca047f3df4ee3bb08a.webp'],40),
('Plug anal M','Formato anatômico e acabamento cuidadoso para explorar com segurança.','plug anal joia',55.0,null,'plugs',array['acessorios-fetiche']::text[],array['https://cdn.offstoreimages.me/compressed/f0f3aed533693e036be4fd15f6fbeb63.webp'],41),
('PikaTurbo Gel retardante masculino','Sensações que aquecem, pulsam e despertam cada toque.','excitante estimulante esquenta pulsa vibra quente sensação',29.99,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/b6941cc1416d863e9b57084ba5d2f6a4.webp'],42),
('Vibrador líquido com efeito quente, pulsante e vibrante','Um convite para sentir mais: efeito intenso e envolvente.','excitante estimulante esquenta pulsa vibra quente sensação',89.99,null,'excitantes',array['gel-beijavel']::text[],array['https://cdn.offstoreimages.me/compressed/85b4466e84fd6bd626f308f5d3c64c88.webp'],43),
('Kit aperta e prolonga','Para elevar a temperatura do momento a dois.','excitante estimulante esquenta pulsa vibra quente sensação',75.0,null,'excitantes',array['kits-presente']::text[],array['https://cdn.offstoreimages.me/compressed/da7a6c38b4acdba01bf58233edece013.webp'],44),
('Kit Jogo da sedução','Combinação pensada para uma noite inesquecível.','kit presente caixa casal',99.99,null,'kits-presente','{}'::text[],array['https://cdn.offstoreimages.me/compressed/92c42f677cf8923ff15931ebb52c0293.webp'],45),
('Gel para oral Ice babaloo vibra e gela','Beijável, saboroso e feito para provocar.','beijavel oral sabor calda gel comestivel',69.99,null,'gel-beijavel','{}'::text[],array['https://cdn.offstoreimages.me/compressed/7e02a74081bd13a566ebb32f5652ae85.webp'],46),
('Kit prazer a dois','Combinação pensada para uma noite inesquecível.','kit presente caixa casal',65.0,null,'kits-presente','{}'::text[],array['https://cdn.offstoreimages.me/compressed/6f4532e30294caf2a0c00664c6e2368b.webp'],47),
('Kit prazer feminino','Um toque de ousadia para tirar a rotina do lugar.','acessorio fetiche algema sado bdsm',60.0,null,'acessorios-fetiche',array['kits-presente']::text[],array['https://cdn.offstoreimages.me/compressed/18dc5c4df4c87a360340043e539a7097.webp'],48),
('Lacradinha gel adstringente','Sensação de firmeza e frescor para momentos especiais.','adstringente aperta virgem',29.99,null,'adstringente','{}'::text[],array['https://cdn.offstoreimages.me/compressed/f5ea77e33ba216f5651e688a08238a55.webp'],49),
('Tatuagem temporária (unidade)','Um toque de ousadia para tirar a rotina do lugar.','acessorio fetiche algema sado bdsm',5.0,null,'acessorios-fetiche','{}'::text[],array['https://cdn.offstoreimages.me/compressed/4e419158292601f16aa29c4e7e91747e.webp'],50),
('Lubrificante algodão doce intt','Toque sedoso que deixa tudo mais leve e natural.','lubrificante lubri gel deslizante',39.99,null,'lubrificantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/0d02863f88ba7280478895b8f54866a8.webp'],51),
('Sugalik frutas vermelhas','Beijável, saboroso e feito para provocar.','beijavel oral sabor calda gel comestivel',95.0,null,'gel-beijavel','{}'::text[],array['https://cdn.offstoreimages.me/compressed/92e2ebd5aa8298a4ed0af7a0efe72a7a.webp'],52),
('Vibrador Jelly','Potência discreta para descobrir novas sensações.','vibrador vibro brinquedo sugador massageador',69.99,null,'vibradores','{}'::text[],array['https://cdn.offstoreimages.me/compressed/3621dd782e27129a72f3d14e80cd5e9d.webp'],53),
('Kit AROMA & SEDUÇÃO','Seleção especial pronta para presentear ou se presentear.','kit presente caixa casal',159.99,null,'kits-presente','{}'::text[],array['https://cdn.offstoreimages.me/compressed/35162838eafe255d7c821bdcb304752d.webp'],54),
('Lubrificante hot sabor morango Intt','Toque sedoso que deixa tudo mais leve e natural.','lubrificante lubri gel deslizante',39.99,null,'lubrificantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/dcbbba94d2c5eef775472305dc651a32.webp'],55),
('Kit Sado (algema, chicote e venda para os olhos)','Um toque de ousadia para tirar a rotina do lugar.','acessorio fetiche algema sado bdsm',79.99,null,'acessorios-fetiche',array['kits-presente']::text[],array['https://cdn.offstoreimages.me/compressed/87c63a7e5f88b4c4ab6b093beb6d9b84.webp'],56),
('Bolinha Xana Loka','Sensações que aquecem, pulsam e despertam cada toque.','excitante estimulante esquenta pulsa vibra quente sensação',19.99,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/d756caf83984cf080bcce7805bdd0401.webp'],57),
('Dados jogo do prazer','Brincadeira a dois para criar intimidade e muita diversão.','jogo casal cartas brincadeira',19.99,null,'jogos-casal',array['acessorios-fetiche']::text[],array['https://cdn.offstoreimages.me/compressed/a5e83033e135b2fabf6b1016b3cc5e53.webp'],58),
('Calda para oral frutas vermelhas by Deborah Secco','Textura deliciosa para explorar sem pressa.','beijavel oral sabor calda gel comestivel',59.99,null,'gel-beijavel','{}'::text[],array['https://cdn.offstoreimages.me/compressed/3ad5fb30f23b410505f8633d952bcb03.webp'],59),
('Rosa sugador de clítoris','Design delicado, vibrações intensas e prazer sob medida.','vibrador vibro brinquedo sugador massageador',99.9,null,'vibradores','{}'::text[],array['https://cdn.offstoreimages.me/compressed/66e6b8f398f968060bd11de857fcb7f7.webp'],60),
('Ducha higiênica','Autocuidado delicado para se sentir ainda mais confiante.','higiene intima desodorante perfume cuidado',49.99,null,'autocuidado','{}'::text[],array['https://cdn.offstoreimages.me/compressed/aa2b6ede47703b41606c8136e4053848.webp'],61),
('Plug anal P','Formato anatômico e acabamento cuidadoso para explorar com segurança.','plug anal joia',45.0,null,'plugs',array['acessorios-fetiche','excitantes']::text[],array['https://cdn.offstoreimages.me/compressed/f1aa632ddd22484920c60f7d0aa543ff.webp'],62),
('Algemas','Detalhes que transformam a noite em uma experiência.','acessorio fetiche algema sado bdsm',25.0,null,'acessorios-fetiche','{}'::text[],array['https://cdn.offstoreimages.me/compressed/478be623a7d2cf3e2fac9ab35834b854.webp'],63),
('Vibrador varinha mágica','Design delicado, vibrações intensas e prazer sob medida.','vibrador vibro brinquedo sugador massageador',119.99,null,'vibradores','{}'::text[],array['https://cdn.offstoreimages.me/compressed/34b0e77c8f0cbf9c528ab0234a96ae37.webp'],64),
('Vibrador via aplicativo','Potência discreta para descobrir novas sensações.','vibrador vibro brinquedo sugador massageador',189.99,null,'vibradores','{}'::text[],array['https://cdn.offstoreimages.me/compressed/ded3b178b54bd7923c827ebc06855da1.webp'],65),
('Sedenta por oral Gel vibrante','Sabor irresistível e toque macio para momentos de carinho.','beijavel oral sabor calda gel comestivel',39.99,null,'gel-beijavel','{}'::text[],array['https://cdn.offstoreimages.me/compressed/e3d7af78560cd7d54c0ae0bc357711a6.webp'],66),
('Goze+ acelerador de orgasmo','Um convite para sentir mais: efeito intenso e envolvente.','excitante estimulante esquenta pulsa vibra quente sensação',29.99,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/99ce89cf0065ae828e72049d02df20ef.webp'],67),
('Lubrificante Babalub','Deslize suave e confortável para mais prazer.','lubrificante lubri gel deslizante',39.99,null,'lubrificantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/788a47deb660127ff33235e3eace6a20.webp'],68),
('Jogo desejos e drinks','Desafios picantes para conhecer ainda mais o seu par.','jogo casal cartas brincadeira',39.99,null,'jogos-casal',array['acessorios-fetiche']::text[],array['https://cdn.offstoreimages.me/compressed/9ae6f3700d23c36dc5fe13ea530b3d51.webp'],69),
('Pétalas decorativas (125 unidades)','Um toque de ousadia para tirar a rotina do lugar.','acessorio fetiche algema sado bdsm',25.0,null,'acessorios-fetiche','{}'::text[],array['https://cdn.offstoreimages.me/compressed/c86176da92de41c8811d53f280dfac15.webp'],70),
('Power Black (Idêntico ao halls preto)','Textura deliciosa para explorar sem pressa.','beijavel oral sabor calda gel comestivel',35.0,null,'gel-beijavel','{}'::text[],array['https://cdn.offstoreimages.me/compressed/1003829e2c10aa370ebc59420943161d.webp'],71),
('Vibrador Rosa 2 em 1','Design delicado, vibrações intensas e prazer sob medida.','vibrador vibro brinquedo sugador massageador',189.99,null,'vibradores','{}'::text[],array['https://cdn.offstoreimages.me/compressed/6abdc0e00f75ac00ef3be899759a7899.webp'],72),
('Jogo da sedução','Desafios picantes para conhecer ainda mais o seu par.','jogo casal cartas brincadeira',39.99,null,'jogos-casal',array['acessorios-fetiche']::text[],array['https://cdn.offstoreimages.me/compressed/7e5018f954b0c77ddd12e5516614fae8.webp'],73),
('Lubrificante excitante Sedenta por sexo','Para elevar a temperatura do momento a dois.','excitante estimulante esquenta pulsa vibra quente sensação',39.99,null,'excitantes',array['lubrificantes']::text[],array['https://cdn.offstoreimages.me/compressed/3ca61f5bc3f181808d8649431357c6a8.webp'],74),
('Óleo para massagem beijável morango','Para desacelerar, relaxar e se entregar ao toque.','oleo massagem vela corporal aromatico',49.99,null,'oleos-massagem','{}'::text[],array['https://cdn.offstoreimages.me/compressed/668e5a1691746f2fa45e730d098a4c3c.webp'],75),
('Volumão intensificador masculino','Um convite para sentir mais: efeito intenso e envolvente.','excitante estimulante esquenta pulsa vibra quente sensação',35.0,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/f971d3be2c7e06e36848ad00ffc08ddd.webp'],76),
('Algemas peluciadas','Detalhes que transformam a noite em uma experiência.','acessorio fetiche algema sado bdsm',29.99,null,'acessorios-fetiche','{}'::text[],array['https://cdn.offstoreimages.me/compressed/0c5e48d1aad0575efa467497fc82c44a.webp'],77),
('Fruta proibida desodorante íntimo','Cuidado íntimo com frescor, perfume e bem-estar.','higiene intima desodorante perfume cuidado',59.99,null,'autocuidado','{}'::text[],array['https://cdn.offstoreimages.me/compressed/cee846ea67c4c628f1198ec7c8381f2d.webp'],78),
('Lubrificante neutro Sedenta Molhada','Toque sedoso que deixa tudo mais leve e natural.','lubrificante lubri gel deslizante',29.99,null,'lubrificantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/47266242b9257f53c9f2ed256e91c9bc.webp'],79),
('Lis-in dessensibilizante anal','Conforto e relaxamento para explorar com tranquilidade.','dessensibilizante anal relaxante',69.99,null,'dessensibilizante','{}'::text[],array['https://cdn.offstoreimages.me/compressed/be39939e68957a59499a7eebce643464.webp'],80),
('Love lub lubrificante','Toque sedoso que deixa tudo mais leve e natural.','lubrificante lubri gel deslizante',25.0,null,'lubrificantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/fc303c2ff344a8e9246076d28eaad56c.webp'],81),
('Sete sensações dessensibilizante anal','Conforto e relaxamento para explorar com tranquilidade.','dessensibilizante anal relaxante',39.99,null,'dessensibilizante','{}'::text[],array['https://cdn.offstoreimages.me/compressed/422c9434832701489e53da88eb5f5866.webp'],82),
('Sempre virgem gel adstringente','Para elevar a temperatura do momento a dois.','excitante estimulante esquenta pulsa vibra quente sensação',39.99,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/7be305e234afc028f3dee76878734abe.webp'],83),
('Gel kuloko','Conforto e relaxamento para explorar com tranquilidade.','dessensibilizante anal relaxante',25.0,null,'dessensibilizante','{}'::text[],array['https://cdn.offstoreimages.me/compressed/7638c625f694e2a3b2cc429d522bc695.webp'],84),
('Vela beijavel para massagem','Para desacelerar, relaxar e se entregar ao toque.','oleo massagem vela corporal aromatico',29.99,null,'oleos-massagem',array['gel-beijavel']::text[],array['https://cdn.offstoreimages.me/compressed/dfd24292b08a038dc047280a740cd00f.webp'],85),
('Kit iniciante','Seleção especial pronta para presentear ou se presentear.','kit presente caixa casal',49.99,null,'kits-presente','{}'::text[],array['https://cdn.offstoreimages.me/compressed/10ab6994374cd8491b136400dd396c69.webp'],86),
('Sedenta por garganta profunda','Sabor irresistível e toque macio para momentos de carinho.','beijavel oral sabor calda gel comestivel',39.99,null,'gel-beijavel','{}'::text[],array['https://cdn.offstoreimages.me/compressed/f2f2e2d209a57ae597297dea12f2ff0c.webp'],87),
('Perfume phero (feromônio)','Cuidado íntimo com frescor, perfume e bem-estar.','higiene intima desodorante perfume cuidado',35.0,null,'autocuidado','{}'::text[],array['https://cdn.offstoreimages.me/compressed/9447b2b3fa964afce2fa7c94b41cf1f8.webp'],88),
('Gel feminino Siriryka','Para elevar a temperatura do momento a dois.','excitante estimulante esquenta pulsa vibra quente sensação',19.99,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/09a10c261cdf33be7661b270e6f3ebab.webp'],89),
('Cliv Intt dessensibilizante','Conforto e relaxamento para explorar com tranquilidade.','dessensibilizante anal relaxante',89.99,null,'dessensibilizante','{}'::text[],array['https://cdn.offstoreimages.me/compressed/2eb8eda8ef6281eb3a346c62027e1dbf.webp'],90),
('Vibrador golfinho','Potência discreta para descobrir novas sensações.','vibrador vibro brinquedo sugador massageador',39.99,null,'vibradores','{}'::text[],array['https://cdn.offstoreimages.me/compressed/e7719f0db54e019a357c002df73da9a0.webp'],91),
('Xana Loka gel','Para elevar a temperatura do momento a dois.','excitante estimulante esquenta pulsa vibra quente sensação',25.0,null,'excitantes','{}'::text[],array['https://cdn.offstoreimages.me/compressed/0c93a46e3afdc845cd3ab5fe2cd6edfe.webp'],92),
('Egg massageador masculino','Potência discreta para descobrir novas sensações.','vibrador vibro brinquedo sugador massageador',29.99,null,'vibradores','{}'::text[],array['https://cdn.offstoreimages.me/compressed/30a8bc091c32ee5506fb1707466bcc53.webp'],93),
('Blow Girl','Beijável, saboroso e feito para provocar.','beijavel oral sabor calda gel comestivel',75.0,69.99,'gel-beijavel','{}'::text[],array['https://cdn.offstoreimages.me/compressed/8cebb8c8dee932ea99871efb92014125.webp'],94);
