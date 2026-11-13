-- =====================================================================
-- IS Lab Study Hub — skema database Supabase
-- Jalankan SEKALI di: Supabase Dashboard → SQL Editor → New query → Run
--
-- Semua tabel memakai:
--   • id uuid (aman untuk sinkronisasi offline dari mobile app nanti)
--   • user_id default auth.uid()  → client tidak perlu mengirim user_id
--   • updated_at otomatis via trigger → dasar untuk sync inkremental
--   • Row Level Security: setiap user hanya bisa melihat datanya sendiri
-- =====================================================================


-- ---------------------------------------------------------------------
-- Helper trigger: isi updated_at otomatis
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Helper trigger: isi completed_at saat status berubah menjadi 'completed'
create or replace function public.set_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' then
      new.completed_at = now();
    end if;
  else
    new.completed_at = null;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- subjects: bidang/mata pelajaran (mis. "Machine Learning", "Statistika")
-- ---------------------------------------------------------------------
create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  description text,
  color       text not null default 'teal'
              check (color in ('teal', 'blue', 'violet', 'rose', 'amber', 'green', 'slate')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index subjects_user_id_idx on public.subjects (user_id);


-- ---------------------------------------------------------------------
-- syllabus_items: topik-topik dalam silabus sebuah subjek
-- ---------------------------------------------------------------------
create table public.syllabus_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id   uuid not null references public.subjects (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 300),
  description  text,
  position     integer not null default 0,
  status       text not null default 'not_started'
               check (status in ('not_started', 'in_progress', 'completed')),
  target_date  date,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index syllabus_items_user_id_idx on public.syllabus_items (user_id);
create index syllabus_items_subject_position_idx on public.syllabus_items (subject_id, position);


-- ---------------------------------------------------------------------
-- notes: catatan materi yang sudah dipelajari (Markdown + LaTeX)
-- ---------------------------------------------------------------------
create table public.notes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id       uuid references public.subjects (id) on delete set null,
  syllabus_item_id uuid references public.syllabus_items (id) on delete set null,
  title            text not null check (char_length(title) between 1 and 300),
  content          text not null default '',
  tags             text[] not null default '{}',
  learned_on       date not null default current_date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index notes_user_learned_idx on public.notes (user_id, learned_on desc);
create index notes_subject_id_idx on public.notes (subject_id);
create index notes_syllabus_item_id_idx on public.notes (syllabus_item_id);
create index notes_tags_idx on public.notes using gin (tags);


-- ---------------------------------------------------------------------
-- resources: sumber belajar (YouTube, dokumen, artikel, kursus, dll.)
-- Bisa berupa link (url) ATAU file yang di-upload ke Storage (storage_path)
-- ---------------------------------------------------------------------
create table public.resources (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id       uuid references public.subjects (id) on delete set null,
  syllabus_item_id uuid references public.syllabus_items (id) on delete set null,
  title            text not null check (char_length(title) between 1 and 300),
  type             text not null default 'other'
                   check (type in ('youtube', 'document', 'article', 'course', 'other')),
  url              text,
  storage_path     text,
  status           text not null default 'not_started'
                   check (status in ('not_started', 'in_progress', 'completed')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint resources_url_or_file check (url is not null or storage_path is not null)
);

create index resources_user_id_idx on public.resources (user_id, created_at desc);
create index resources_subject_id_idx on public.resources (subject_id);
create index resources_syllabus_item_id_idx on public.resources (syllabus_item_id);


-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create trigger subjects_set_updated_at
  before update on public.subjects
  for each row execute function public.set_updated_at();

create trigger syllabus_items_set_updated_at
  before update on public.syllabus_items
  for each row execute function public.set_updated_at();

create trigger syllabus_items_set_completed_at
  before insert or update of status on public.syllabus_items
  for each row execute function public.set_completed_at();

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

create trigger resources_set_updated_at
  before update on public.resources
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- Row Level Security: hanya pemilik data yang bisa baca/tulis
-- ---------------------------------------------------------------------
alter table public.subjects       enable row level security;
alter table public.syllabus_items enable row level security;
alter table public.notes          enable row level security;
alter table public.resources      enable row level security;

create policy "Owner full access" on public.subjects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owner full access" on public.syllabus_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owner full access" on public.notes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owner full access" on public.resources
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Hak akses Data API: hanya user yang login; anon tidak punya akses sama sekali
revoke all on public.subjects, public.syllabus_items, public.notes, public.resources from anon;
grant select, insert, update, delete
  on public.subjects, public.syllabus_items, public.notes, public.resources
  to authenticated;


-- ---------------------------------------------------------------------
-- Storage: bucket privat "documents" untuk upload file (PDF, slide, dll.)
-- File disimpan di path: <user_id>/<nama-file>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800) -- 50 MB per file
on conflict (id) do nothing;

create policy "Documents: owner can read"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Documents: owner can upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Documents: owner can update"
  on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Documents: owner can delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
