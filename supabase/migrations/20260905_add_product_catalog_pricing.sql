create table if not exists public.product_catalog (
  id uuid primary key default gen_random_uuid(),
  product_key text not null unique,
  name text not null,
  calculation text not null default 'normal' check (calculation in ('sqm','height_inch','normal','sheet_tier')),
  unit text not null default 'งาน',
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  tier_min_qty numeric(12,2),
  tier_unit_price numeric(12,2),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_catalog enable row level security;
grant select on public.product_catalog to authenticated;
grant insert, update, delete on public.product_catalog to authenticated;

drop policy if exists product_catalog_read_authenticated on public.product_catalog;
create policy product_catalog_read_authenticated on public.product_catalog for select to authenticated using (true);
drop policy if exists product_catalog_owner_insert on public.product_catalog;
create policy product_catalog_owner_insert on public.product_catalog for insert to authenticated with check (public.current_user_role() = 'owner');
drop policy if exists product_catalog_owner_update on public.product_catalog;
create policy product_catalog_owner_update on public.product_catalog for update to authenticated using (public.current_user_role() = 'owner') with check (public.current_user_role() = 'owner');
drop policy if exists product_catalog_owner_delete on public.product_catalog;
create policy product_catalog_owner_delete on public.product_catalog for delete to authenticated using (public.current_user_role() = 'owner');