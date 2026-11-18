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
