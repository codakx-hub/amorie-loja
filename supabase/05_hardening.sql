-- =====================================================================
-- AMORIÊ — ajustes pedidos pelo Security Advisor do Supabase
-- =====================================================================

-- 1. Fotos continuam públicas pelo link, mas ninguém consegue LISTAR a pasta
drop policy if exists media_read on storage.objects;

-- 2. Funções que exigem cliente logada: visitante não executa
revoke execute on function public.place_order(jsonb) from public, anon;
revoke execute on function public.my_coupons() from public, anon;
revoke execute on function public.first_purchase_eligible() from public, anon;
revoke execute on function public.admin_cart_offer(uuid, numeric) from public, anon;
grant execute on function public.place_order(jsonb) to authenticated;
grant execute on function public.my_coupons() to authenticated;
grant execute on function public.first_purchase_eligible() to authenticated;
grant execute on function public.admin_cart_offer(uuid, numeric) to authenticated;

-- 3. Verificação de administradora sai da API pública (as regras continuam usando ela)
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'is_admin') then
    alter function public.is_admin() set schema private;
  end if;
end $$;
alter function private.is_admin() set search_path = public;
revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

-- funções que chamavam is_admin() passam a usar private.is_admin()
create or replace function public.lock_cpf() returns trigger language plpgsql set search_path = public as $$
begin
  if old.cpf is not null and new.cpf is distinct from old.cpf and not private.is_admin() then new.cpf := old.cpf; end if;
  return new;
end; $$;

create or replace function public.order_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'site' and not private.is_admin() and too_many('order', 5, 600) then raise exception 'muitas_tentativas'; end if;
  return new;
end; $$;

create or replace function public.admin_cart_offer(p_cart uuid, p_percent numeric)
returns text language plpgsql security definer set search_path = public as $$
declare c carts; v_code text;
begin
  if not private.is_admin() then raise exception 'not_admin'; end if;
  select * into c from carts where id = p_cart;
  if not found then raise exception 'carrinho_nao_encontrado'; end if;
  v_code := 'AMOR' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  insert into coupons(code, kind, value, expires_at, max_uses, origin, customer_user, customer_whatsapp, note)
  values (v_code, 'percent', greatest(1, least(90, p_percent)),
          date_trunc('day', now() at time zone 'America/Belem') at time zone 'America/Belem' + interval '2 days' - interval '1 second',
          1, 'abandoned', c.user_id, c.whatsapp, 'Carrinho abandonado');
  update carts set status = 'contacted', contacted_at = now(), offer_code = v_code where id = p_cart;
  return v_code;
end; $$;
revoke execute on function public.admin_cart_offer(uuid, numeric) from public, anon;
grant execute on function public.admin_cart_offer(uuid, numeric) to authenticated;
revoke execute on function public.order_guard() from public, anon, authenticated;

-- conferência
select p.proname as funcao, n.nspname as esquema, has_function_privilege('anon', p.oid, 'execute') as visitante_executa
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public','private') and p.prosecdef order by 3 desc, 1;
