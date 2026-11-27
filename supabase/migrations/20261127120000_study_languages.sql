-- =====================================================================
-- IS Lab Study Hub — Ruang Studi › Bahasa (diksi per bahasa)
-- Spesifikasi: docs/SPEC_RUANG_STUDI.md §4, §5
--
-- Sama seperti tabel lain:
--   • id uuid, user_id default auth.uid(), updated_at otomatis
--   • soft delete (deleted_at)
--   • Row Level Security: hanya pemilik; anon tidak punya akses
-- Arti diksi ditulis sendiri; tidak ada terjemahan otomatis.
-- =====================================================================


-- ---------------------------------------------------------------------
-- study_languages: bahasa yang dipelajari dan negara-negaranya di peta
-- ---------------------------------------------------------------------
create table public.study_languages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  -- Kode ISO 639 (mis. ja, en, ban); boleh kosong untuk bahasa buatan sendiri
  code       text check (code is null or code ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  -- Negara (ISO 3166-1 alpha-2, huruf besar) tempat diksinya tampil di atlas
  countries  text[] not null default '{}'
             check (cardinality(countries) <= 60
                    and array_to_string(countries, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'),
  -- Nama token palet di globals.css (--domain-1 … --domain-10), sama dengan bidang
  color      text not null default 'domain-1' check (color ~ '^domain-(10|[1-9])$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index study_languages_user_name_key
  on public.study_languages (user_id, lower(btrim(name))) where deleted_at is null;


-- ---------------------------------------------------------------------
-- study_words: satu diksi dalam satu bahasa
-- ---------------------------------------------------------------------
create table public.study_words (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  language_id uuid not null references public.study_languages (id) on delete cascade,
  word        text not null check (char_length(btrim(word)) between 1 and 200),
  -- Cara baca: romaji, pinyin, transliterasi, …
  reading     text check (reading is null or char_length(reading) <= 200),
  meaning     text not null default '' check (char_length(meaning) <= 2000),
  example     text check (example is null or char_length(example) <= 2000),
  notes       text check (notes is null or char_length(notes) <= 4000),
  -- Khas satu negara (variasi regional); kosong = semua negara bahasanya
  region      text check (region is null or region ~ '^[A-Z]{2}$'),
  learned_on  date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index study_words_language_word_key
  on public.study_words (language_id, lower(btrim(word))) where deleted_at is null;
create index study_words_user_learned_idx on public.study_words (user_id, learned_on);


-- ---------------------------------------------------------------------
-- Trigger
--   • diksi: bahasanya harus milik pengguna yang sama dan masih aktif
--   • bahasa: tidak bisa dihapus selama masih punya diksi aktif
-- ---------------------------------------------------------------------
create or replace function public.study_words_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.language_id is distinct from old.language_id then
    if not exists (
      select 1 from public.study_languages l
      where l.id = new.language_id and l.user_id = new.user_id and l.deleted_at is null
    ) then
      raise exception 'Bahasa tidak ditemukan.' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

create trigger study_words_before_write
  before insert or update on public.study_words
  for each row execute function public.study_words_before_write();

create trigger study_words_set_updated_at
  before update on public.study_words
  for each row execute function public.set_updated_at();


create or replace function public.study_languages_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.deleted_at is not null and old.deleted_at is null
     and exists (select 1 from public.study_words w where w.language_id = new.id and w.deleted_at is null) then
    raise exception 'Bahasa ini masih punya diksi. Hapus atau pindahkan diksinya dulu.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger study_languages_before_write
  before update on public.study_languages
  for each row execute function public.study_languages_before_write();

create trigger study_languages_set_updated_at
  before update on public.study_languages
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- Row Level Security: hanya pemilik; anon tidak punya akses sama sekali
-- ---------------------------------------------------------------------
alter table public.study_languages enable row level security;
alter table public.study_words     enable row level security;

create policy "Owner full access" on public.study_languages
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owner full access" on public.study_words
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.study_languages, public.study_words from anon;
grant select, insert, update, delete on public.study_languages, public.study_words to authenticated;
