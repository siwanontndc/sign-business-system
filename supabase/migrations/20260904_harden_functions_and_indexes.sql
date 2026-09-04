-- SIGN BUSINESS database hardening and performance indexes

create index if not exists job_media_uploaded_by_idx
  on public.job_media(uploaded_by);

create index if not exists quotation_items_quotation_id_idx
  on public.quotation_items(quotation_id);

create index if not exists quotations_customer_id_idx
  on public.quotations(customer_id);

alter function public.calculate_quotation_item_amount()
  set search_path = public;

alter function public.sync_installation_job_links()
  set search_path = public;

alter function public.sync_installation_quotation_id()
  set search_path = public;

revoke execute on function public.handle_new_user()
  from public, anon, authenticated;

revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;

revoke execute on function public.current_user_role()
  from public, anon;

grant execute on function public.current_user_role()
  to authenticated;

drop policy if exists profiles_select_authenticated
  on public.profiles;

create policy profiles_select_authenticated
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select public.current_user_role()) = 'owner'
  );

drop policy if exists profiles_update_owner
  on public.profiles;

create policy profiles_update_owner
  on public.profiles
  for update
  to authenticated
  using ((select public.current_user_role()) = 'owner')
  with check ((select public.current_user_role()) = 'owner');
