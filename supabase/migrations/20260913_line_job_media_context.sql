-- SIGN BUSINESS: LINE -> job media context and traceability
-- Additive migration. Existing app uploads continue to work.

alter table public.job_media
  drop constraint if exists job_media_media_type_check;

alter table public.job_media
  add constraint job_media_media_type_check
  check (media_type in ('artwork','before_install','during_install','after_install'));

alter table public.job_media
  add column if not exists source text not null default 'app',
  add column if not exists line_message_id text,
  add column if not exists line_group_id text,
  add column if not exists line_user_id text,
  add column if not exists captured_at timestamptz;

alter table public.job_media
  drop constraint if exists job_media_source_check;

alter table public.job_media
  add constraint job_media_source_check
  check (source in ('app','line'));

create unique index if not exists job_media_line_message_id_uidx
  on public.job_media (line_message_id)
  where line_message_id is not null;

create index if not exists job_media_created_at_idx
  on public.job_media (created_at desc);

create table if not exists public.job_line_contexts (
  group_id text primary key,
  installation_job_id uuid not null references public.installation_jobs(id) on delete cascade,
  media_type text not null check (media_type in ('artwork','before_install','during_install','after_install')),
  set_by_line_user_id text,
  expires_at timestamptz not null default (now() + interval '12 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.job_line_contexts enable row level security;

-- Context rows are webhook-internal state. Browser clients do not need direct access.
revoke all on public.job_line_contexts from anon, authenticated;
grant all on public.job_line_contexts to service_role;

grant select, insert, update, delete on public.job_media to authenticated;
grant all on public.job_media to service_role;
