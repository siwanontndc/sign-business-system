alter table public.line_account_entries
  add column if not exists suggested_description text,
  add column if not exists suggested_counterparty text,
  add column if not exists suggested_bank_name text,
  add column if not exists suggested_reference_no text,
  add column if not exists ai_confidence numeric(5,4),
  add column if not exists analyzed_at timestamptz,
  add column if not exists suggested_transaction_date timestamptz;

create index if not exists line_account_entries_finance_transaction_idx
  on public.line_account_entries(finance_transaction_id)
  where finance_transaction_id is not null;

create index if not exists line_account_entries_reviewed_by_idx
  on public.line_account_entries(reviewed_by)
  where reviewed_by is not null;

drop index if exists public.finance_line_source_uq;
revoke execute on function public.record_line_webhook_diag(text,text,text) from anon, authenticated;

create or replace function public.review_line_account_entry_v2(
  p_id uuid,
  p_action text,
  p_direction text default null,
  p_amount numeric default null,
  p_category text default null,
  p_description text default null,
  p_project_name text default null,
  p_transaction_date timestamptz default null,
  p_counterparty text default null,
  p_bank_name text default null,
  p_reference_no text default null,
  p_ai_confidence numeric default null
) returns jsonb
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
  if p_action not in ('approve','reject') then raise exception 'Invalid action'; end if;

  select * into e from public.line_account_entries where id=p_id for update;
  if not found then raise exception 'Entry not found'; end if;
  if e.status <> 'pending' then raise exception 'Entry already reviewed'; end if;

  if p_action='reject' then
    update public.line_account_entries
      set status='rejected', reviewed_by=auth.uid(), reviewed_at=now()
      where id=p_id;
    return jsonb_build_object('status','rejected');
  end if;

  if p_direction not in ('income','expense') or p_amount is null or p_amount<=0 or p_amount>999999999999.99 then
    raise exception 'Invalid amount or direction';
  end if;
  if coalesce(e.message_text,'') ~* 'ทดสอบ[[:space:]]*[0-9]*' then raise exception 'Test messages cannot be approved'; end if;
  if e.line_message_id is null then raise exception 'Missing source message ID'; end if;

  insert into public.finance_transactions(
    transaction_date,direction,amount,category,description,project_name,
    source,status,line_message_id,line_group_id,line_user_id,raw_text,created_by,
    counterparty,bank_name,reference_no,ai_confidence,evidence_path
  ) values(
    coalesce(p_transaction_date,e.suggested_transaction_date,e.event_at,now()),
    p_direction,p_amount,coalesce(nullif(p_category,''),'อื่น ๆ'),p_description,p_project_name,
    'line','confirmed',e.line_message_id,e.group_id,e.sender_id,e.message_text,auth.uid(),
    p_counterparty,p_bank_name,p_reference_no,
    case when p_ai_confidence is null then null else greatest(0,least(1,p_ai_confidence)) end,
    e.storage_path
  ) returning id into t;

  update public.line_account_entries
    set status='approved',entry_type=p_direction,amount=p_amount,category=p_category,
        job_reference=p_project_name,finance_transaction_id=t,reviewed_by=auth.uid(),reviewed_at=now()
    where id=p_id;

  return jsonb_build_object('status','approved','transaction_id',t);
end
$$;

revoke all on function public.review_line_account_entry_v2(uuid,text,text,numeric,text,text,text,timestamptz,text,text,text,numeric) from public,anon;
grant execute on function public.review_line_account_entry_v2(uuid,text,text,numeric,text,text,text,timestamptz,text,text,text,numeric) to authenticated;
