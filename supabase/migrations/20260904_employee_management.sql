alter table public.profiles add column if not exists phone text, add column if not exists position text, add column if not exists is_active boolean not null default true;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner','staff','finance','production'));
drop policy if exists profiles_owner_manage on public.profiles;
create policy profiles_owner_manage on public.profiles for all to authenticated using ((select public.current_user_role()) = 'owner') with check ((select public.current_user_role()) = 'owner');
create or replace function public.current_user_role() returns text language sql stable security definer set search_path = public as $$ select role from public.profiles where id = auth.uid() and coalesce(is_active,true) = true limit 1; $$;
revoke execute on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;
