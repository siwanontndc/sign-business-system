alter table public.site_surveys
add column if not exists scheduled_at timestamptz;
