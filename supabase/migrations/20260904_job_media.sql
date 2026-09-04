-- SIGN BUSINESS: แบบงาน / รูปก่อนติดตั้ง / รูปหลังติดตั้ง
-- ใช้กับ Supabase Postgres + Storage

create table if not exists public.job_media (
  id uuid primary key default gen_random_uuid(),
  installation_job_id uuid not null references public.installation_jobs(id) on delete cascade,
  media_type text not null check (media_type in ('artwork','before_install','after_install')),
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  note text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists job_media_installation_job_id_idx
  on public.job_media (installation_job_id);

create index if not exists job_media_type_idx
  on public.job_media (media_type);

alter table public.job_media enable row level security;

drop policy if exists "authenticated users can read job media" on public.job_media;
create policy "authenticated users can read job media"
  on public.job_media for select
  to authenticated
  using (true);

drop policy if exists "authenticated users can add job media" on public.job_media;
create policy "authenticated users can add job media"
  on public.job_media for insert
  to authenticated
  with check (uploaded_by = auth.uid());

drop policy if exists "authenticated users can update own job media" on public.job_media;
create policy "authenticated users can update own job media"
  on public.job_media for update
  to authenticated
  using (uploaded_by = auth.uid())
  with check (uploaded_by = auth.uid());

drop policy if exists "owner or uploader can delete job media" on public.job_media;
create policy "owner or uploader can delete job media"
  on public.job_media for delete
  to authenticated
  using (
    uploaded_by = auth.uid()
    or coalesce(public.current_user_role(), '') = 'owner'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-media',
  'job-media',
  true,
  15728640,
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated users can read job-media" on storage.objects;
create policy "authenticated users can read job-media"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'job-media');

drop policy if exists "authenticated users can upload job-media" on storage.objects;
create policy "authenticated users can upload job-media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'job-media');

drop policy if exists "authenticated users can delete job-media" on storage.objects;
create policy "authenticated users can delete job-media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'job-media');
