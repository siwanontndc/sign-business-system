create extension if not exists pgcrypto;

alter table public.line_account_entries
  add column if not exists finance_transaction_id uuid references public.finance_transactions(id);

create index if not exists line_account_entries_reviewed_by_idx
  on public.line_account_entries(reviewed_by);
create index if not exists line_account_entries_finance_transaction_id_idx
  on public.line_account_entries(finance_transaction_id);

alter table public.line_account_entries enable row level security;
drop policy if exists line_account_read on public.line_account_entries;
create policy line_account_read on public.line_account_entries
for select to authenticated
using (coalesce(public.current_user_role()::text,'') in ('owner','finance'));

grant select, insert, update on public.line_account_entries to service_role;
grant select, insert, update on public.finance_transactions to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'line-account','line-account',false,15728640,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists line_account_media_read on storage.objects;
create policy line_account_media_read on storage.objects
for select to authenticated
using (
  bucket_id='line-account'
  and coalesce(public.current_user_role()::text,'') in ('owner','finance')
);

create or replace function public.review_line_account_entry(
  p_id uuid,
  p_action text,
  p_direction text default null,
  p_amount numeric default null,
  p_category text default null,
  p_description text default null,
  p_project_name text default null,
  p_transaction_date timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  e public.line_account_entries%rowtype;
  t uuid;
begin
  if coalesce(public.current_user_role()::text,'') not in ('owner','finance') then
    raise exception 'Forbidden' using errcode='42501';
  end if;

  if p_action not in ('approve','reject') then
    raise exception 'Invalid action';
  end if;

  select * into e
  from public.line_account_entries
  where id=p_id
  for update;

  if not found then
    raise exception 'Entry not found';
  end if;

  if e.status <> 'pending' then
    raise exception 'Entry already reviewed';
  end if;

  if p_action='reject' then
    update public.line_account_entries
      set status='rejected', reviewed_by=auth.uid(), reviewed_at=now()
    where id=p_id;
    return jsonb_build_object('status','rejected');
  end if;

  if p_direction not in ('income','expense')
     or p_amount is null
     or p_amount <= 0
     or p_amount > 999999999999.99 then
    raise exception 'Invalid amount or direction';
  end if;

  if coalesce(e.message_text,'') ~* 'ทดสอบ[[:space:]]*[0-9]*' then
    raise exception 'Test messages cannot be approved';
  end if;

  if e.line_message_id is null then
    raise exception 'Missing source message ID';
  end if;

  insert into public.finance_transactions(
    transaction_date,direction,amount,category,description,project_name,
    source,status,line_message_id,line_group_id,line_user_id,raw_text,created_by
  ) values(
    coalesce(p_transaction_date,e.event_at,now()),
    p_direction,
    p_amount,
    coalesce(nullif(p_category,''),'อื่น ๆ'),
    p_description,
    p_project_name,
    'line',
    'confirmed',
    e.line_message_id,
    e.group_id,
    e.sender_id,
    e.message_text,
    auth.uid()
  )
  returning id into t;

  update public.line_account_entries
    set status='approved',
        entry_type=p_direction,
        amount=p_amount,
        category=p_category,
        job_reference=p_project_name,
        finance_transaction_id=t,
        reviewed_by=auth.uid(),
        reviewed_at=now()
  where id=p_id;

  return jsonb_build_object('status','approved','transaction_id',t);
end;
$$;

revoke all on function public.review_line_account_entry(uuid,text,text,numeric,text,text,text,timestamptz)
from public,anon;
grant execute on function public.review_line_account_entry(uuid,text,text,numeric,text,text,text,timestamptz)
to authenticated;

-- Keep webhook diagnostics private; the production webhook now writes diagnostics only server-side.
do $$
begin
  if to_regprocedure('public.record_line_webhook_diag(text,text,text)') is not null then
    revoke all on function public.record_line_webhook_diag(text,text,text) from public,anon,authenticated;
    grant execute on function public.record_line_webhook_diag(text,text,text) to service_role;
  end if;
end $$;
