-- SIGN BUSINESS: site survey before quotation

create table if not exists public.site_surveys (
  id uuid primary key default gen_random_uuid(),
  survey_no text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  contact_name text,
  phone text,
  project_name text,
  location_text text,
  dimensions text,
  electrical_notes text,
  access_notes text,
  note text,
  status text not null default 'surveying' check (status in ('surveying','ready_to_quote','quoted','cancelled')),
  quotation_id uuid references public.quotations(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_surveys_status_idx on public.site_surveys(status);
create index if not exists site_surveys_created_at_idx on public.site_surveys(created_at desc);
create index if not exists site_surveys_customer_id_idx on public.site_surveys(customer_id);

create table if not exists public.survey_media (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.site_surveys(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  note text,
  source text not null default 'app' check (source in ('app','line')),
  line_message_id text,
  line_group_id text,
  line_user_id text,
  captured_at timestamptz,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists survey_media_line_message_id_uidx on public.survey_media(line_message_id) where line_message_id is not null;
create index if not exists survey_media_survey_id_idx on public.survey_media(survey_id);
create index if not exists survey_media_created_at_idx on public.survey_media(created_at desc);

create table if not exists public.survey_line_contexts (
  group_id text primary key,
  survey_id uuid not null references public.site_surveys(id) on delete cascade,
  set_by_line_user_id text,
  expires_at timestamptz not null default (now() + interval '12 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_surveys enable row level security;
alter table public.survey_media enable row level security;
alter table public.survey_line_contexts enable row level security;

grant select, insert, update, delete on public.site_surveys to authenticated;
grant select, insert, update, delete on public.survey_media to authenticated;
grant all on public.site_surveys, public.survey_media, public.survey_line_contexts to service_role;
revoke all on public.survey_line_contexts from anon, authenticated;

drop policy if exists "authenticated read site surveys" on public.site_surveys;
create policy "authenticated read site surveys" on public.site_surveys for select to authenticated using (true);

drop policy if exists "authenticated create site surveys" on public.site_surveys;
create policy "authenticated create site surveys" on public.site_surveys for insert to authenticated with check ((select auth.uid()) = created_by);

drop policy if exists "staff update site surveys" on public.site_surveys;
create policy "staff update site surveys" on public.site_surveys for update to authenticated
using (coalesce(public.current_user_role(), '') in ('owner','staff','production'))
with check (coalesce(public.current_user_role(), '') in ('owner','staff','production'));

drop policy if exists "owner delete site surveys" on public.site_surveys;
create policy "owner delete site surveys" on public.site_surveys for delete to authenticated
using (coalesce(public.current_user_role(), '') = 'owner' or created_by = (select auth.uid()));

drop policy if exists "authenticated read survey media" on public.survey_media;
create policy "authenticated read survey media" on public.survey_media for select to authenticated using (true);

drop policy if exists "authenticated add survey media" on public.survey_media;
create policy "authenticated add survey media" on public.survey_media for insert to authenticated
with check ((select auth.uid()) = uploaded_by);

drop policy if exists "owner or uploader delete survey media" on public.survey_media;
create policy "owner or uploader delete survey media" on public.survey_media for delete to authenticated
using (uploaded_by = (select auth.uid()) or coalesce(public.current_user_role(), '') = 'owner');
