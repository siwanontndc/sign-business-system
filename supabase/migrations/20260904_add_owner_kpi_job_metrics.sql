create table if not exists public.job_metrics (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null unique references public.quotations(id) on delete cascade,
  due_date date,
  estimated_cost numeric(12,2) not null default 0 check (estimated_cost >= 0),
  actual_material_cost numeric(12,2) not null default 0 check (actual_material_cost >= 0),
  actual_labor_cost numeric(12,2) not null default 0 check (actual_labor_cost >= 0),
  actual_installation_cost numeric(12,2) not null default 0 check (actual_installation_cost >= 0),
  actual_travel_cost numeric(12,2) not null default 0 check (actual_travel_cost >= 0),
  actual_outsource_cost numeric(12,2) not null default 0 check (actual_outsource_cost >= 0),
  other_cost numeric(12,2) not null default 0 check (other_cost >= 0),
  labor_hours numeric(10,2) not null default 0 check (labor_hours >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_metrics_quotation_id_idx on public.job_metrics(quotation_id);
alter table public.job_metrics enable row level security;
grant select, insert, update, delete on public.job_metrics to authenticated;

create policy job_metrics_owner_select on public.job_metrics for select to authenticated using ((select public.current_user_role()) = 'owner');
create policy job_metrics_owner_insert on public.job_metrics for insert to authenticated with check ((select public.current_user_role()) = 'owner');
create policy job_metrics_owner_update on public.job_metrics for update to authenticated using ((select public.current_user_role()) = 'owner') with check ((select public.current_user_role()) = 'owner');
create policy job_metrics_owner_delete on public.job_metrics for delete to authenticated using ((select public.current_user_role()) = 'owner');
