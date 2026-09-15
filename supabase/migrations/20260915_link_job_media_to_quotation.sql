alter table public.job_media
  add column if not exists quotation_id uuid references public.quotations(id) on delete cascade;

alter table public.job_media
  alter column installation_job_id drop not null;

update public.job_media jm
set quotation_id = ij.quotation_id
from public.installation_jobs ij
where jm.installation_job_id = ij.id
  and jm.quotation_id is null;

create index if not exists job_media_quotation_id_idx
  on public.job_media(quotation_id);

create index if not exists installation_jobs_quotation_id_idx
  on public.installation_jobs(quotation_id);
