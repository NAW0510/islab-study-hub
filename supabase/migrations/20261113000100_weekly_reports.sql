-- =====================================================================
-- IS Lab Study Hub — Laporan Mingguan (Weekly Progress)
-- Jalankan SETELAH schema.sql, sekali saja, di Supabase → SQL Editor.
-- =====================================================================


-- ---------------------------------------------------------------------
-- profiles: identitas yang muncul di kepala laporan
-- ---------------------------------------------------------------------
create table public.profiles (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  full_name     text,
  group_number  text,
  group_name    text,
  mentor_name   text,
  -- Hari pertama "Week 1" program intern (dipakai untuk menghitung nomor minggu)
  program_start date not null default '2026-09-29',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- weekly_reports: satu laporan per minggu
-- Isi tiap bagian berupa Markdown.
-- ---------------------------------------------------------------------
create table public.weekly_reports (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_number          integer not null check (week_number between 0 and 52),
  period_start         date not null,
  period_end           date not null,

  -- Learning Progress (template "Tabel Weekly Progress" di guidebook)
  learning_worked_on   text not null default '',
  learning_learned     text not null default '',
  learning_challenge   text not null default '',
  learning_next_target text not null default '',

  -- Project Progress (4 hal yang dilaporkan saat Weekly Meeting)
  project_done         text not null default '',
  project_decisions    text not null default '',
  project_next         text not null default '',
  project_obstacles    text not null default '',

  links                text not null default '',
  status               text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at              timestamptz,
  -- Token rahasia untuk link berbagi publik; null = tidak dibagikan
  share_token          text unique check (share_token is null or char_length(share_token) >= 20),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint weekly_reports_period check (period_end >= period_start),
  constraint weekly_reports_one_per_week unique (user_id, week_number)
);

create index weekly_reports_user_week_idx on public.weekly_reports (user_id, week_number desc);


-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger weekly_reports_set_updated_at
  before update on public.weekly_reports
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.weekly_reports enable row level security;

create policy "Owner full access" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owner full access" on public.weekly_reports
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.profiles, public.weekly_reports from anon;
grant select, insert, update, delete on public.profiles, public.weekly_reports to authenticated;


-- ---------------------------------------------------------------------
-- Link berbagi: orang tanpa akun hanya bisa membaca SATU laporan,
-- dan hanya kalau tahu token-nya. Tabel tetap tertutup untuk anon;
-- akses lewat fungsi ini saja.
-- ---------------------------------------------------------------------
create or replace function public.get_shared_report(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'report',  to_jsonb(r) - 'user_id' - 'share_token',
    'profile', jsonb_build_object(
      'full_name',    p.full_name,
      'group_number', p.group_number,
      'group_name',   p.group_name,
      'mentor_name',  p.mentor_name
    )
  )
  from public.weekly_reports r
  left join public.profiles p on p.user_id = r.user_id
  where p_token is not null
    and char_length(p_token) >= 20
    and r.share_token = p_token;
$$;

revoke all on function public.get_shared_report(text) from public;
grant execute on function public.get_shared_report(text) to anon, authenticated;
