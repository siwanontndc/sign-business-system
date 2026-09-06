create extension if not exists pgcrypto;

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date timestamptz not null default now(),
  direction text not null check (direction in ('income','expense')),
  amount numeric(14,2) not null check (amount >= 0),
  category text not null default 'อื่น ๆ',
  description text,
  source text not null default 'manual' check (source in ('manual','gallery','line','invoice','receipt')),
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  project_name text,
  quotation_id uuid,
  production_job_id uuid,
  counterparty text,
  bank_name text,
  reference_no text,
  evidence_path text,
  line_message_id text,
  line_group_id text,
  line_user_id text,
  raw_text text,
  fingerprint text,
  ai_confidence numeric(5,4),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists finance_transactions_fingerprint_uq
  on public.finance_transactions(fingerprint) where fingerprint is not null;
create unique index if not exists finance_transactions_line_message_uq
  on public.finance_transactions(line_message_id) where line_message_id is not null;
create index if not exists finance_transactions_date_idx on public.finance_transactions(transaction_date desc);
create index if not exists finance_transactions_project_idx on public.finance_transactions(project_name);
create index if not exists finance_transactions_status_idx on public.finance_transactions(status);

alter table public.finance_transactions enable row level security;

drop policy if exists finance_read on public.finance_transactions;
create policy finance_read on public.finance_transactions for select to authenticated
using (coalesce(public.current_user_role()::text,'') in ('owner','manager','finance'));

drop policy if exists finance_insert on public.finance_transactions;
create policy finance_insert on public.finance_transactions for insert to authenticated
with check (coalesce(public.current_user_role()::text,'') in ('owner','manager','finance'));

drop policy if exists finance_update on public.finance_transactions;
create policy finance_update on public.finance_transactions for update to authenticated
using (coalesce(public.current_user_role()::text,'') in ('owner','manager','finance'))
with check (coalesce(public.current_user_role()::text,'') in ('owner','manager','finance'));

drop policy if exists finance_delete on public.finance_transactions;
create policy finance_delete on public.finance_transactions for delete to authenticated
using (coalesce(public.current_user_role()::text,'') in ('owner','manager'));

insert into storage.buckets (id, name, public)
values ('finance-evidence','finance-evidence',false)
on conflict (id) do nothing;

drop policy if exists finance_evidence_read on storage.objects;
create policy finance_evidence_read on storage.objects for select to authenticated
using (bucket_id='finance-evidence' and coalesce(public.current_user_role()::text,'') in ('owner','manager','finance'));

drop policy if exists finance_evidence_insert on storage.objects;
create policy finance_evidence_insert on storage.objects for insert to authenticated
with check (bucket_id='finance-evidence' and coalesce(public.current_user_role()::text,'') in ('owner','manager','finance'));

drop policy if exists finance_evidence_update on storage.objects;
create policy finance_evidence_update on storage.objects for update to authenticated
using (bucket_id='finance-evidence' and coalesce(public.current_user_role()::text,'') in ('owner','manager','finance'));

create or replace function public.touch_finance_transaction_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_touch_finance_transaction on public.finance_transactions;
create trigger trg_touch_finance_transaction before update on public.finance_transactions
for each row execute function public.touch_finance_transaction_updated_at();
