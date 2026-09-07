grant select,insert,update on public.finance_transactions to authenticated;

alter table public.line_account_entries
  add column if not exists linked_note text,
  add column if not exists is_context_note boolean not null default false;
