create or replace function public.save_line_account_draft(
  p_id uuid,
  p_direction text default null,
  p_amount numeric default null,
  p_category text default null,
  p_transaction_date timestamptz default null,
  p_counterparty text default null,
  p_bank_name text default null,
  p_reference_no text default null,
  p_description text default null
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if coalesce(public.current_user_role()::text,'') not in ('owner','finance') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  update public.line_account_entries
  set
    entry_type=case when p_direction in ('income','expense') then p_direction else entry_type end,
    amount=case when p_amount is not null and p_amount>0 then p_amount else amount end,
    category=coalesce(nullif(p_category,''),category),
    suggested_transaction_date=coalesce(p_transaction_date,suggested_transaction_date),
    suggested_counterparty=coalesce(nullif(p_counterparty,''),suggested_counterparty),
    suggested_bank_name=coalesce(nullif(p_bank_name,''),suggested_bank_name),
    suggested_reference_no=coalesce(nullif(p_reference_no,''),suggested_reference_no),
    suggested_description=coalesce(nullif(p_description,''),suggested_description),
    analyzed_at=now()
  where id=p_id and status='pending';
end
$$;
revoke all on function public.save_line_account_draft(uuid,text,numeric,text,timestamptz,text,text,text,text) from public,anon;
grant execute on function public.save_line_account_draft(uuid,text,numeric,text,timestamptz,text,text,text,text) to authenticated;
