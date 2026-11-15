-- =====================================================================
-- IS Lab Study Hub — Kosakata (glosarium + klasifikasi domain)
-- Spesifikasi: docs/SPEC_KOSAKATA_PETA_OTAK.md §3, §5
--
-- Sama seperti tabel lain:
--   • id uuid, user_id default auth.uid(), updated_at otomatis
--   • Row Level Security: hanya pemilik; anon tidak punya akses
-- Tambahan di sini:
--   • deleted_at (soft delete, siap untuk sinkronisasi offline)
--   • embedding pgvector 512 dimensi untuk istilah dan prototipe domain
-- =====================================================================

create extension if not exists vector with schema extensions;


-- ---------------------------------------------------------------------
-- vocab_domains: bidang (tanpa induk) atau cabang (punya induk)
-- ---------------------------------------------------------------------
create table public.vocab_domains (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 60),
  -- Deskripsi ikut dipakai untuk klasifikasi (lihat prototipe di Edge Function)
  description     text not null default '' check (char_length(description) <= 1000),
  -- Nama token palet di globals.css (--domain-1 … --domain-10, --domain-none)
  color           text not null default 'domain-1' check (color ~ '^domain-(10|[1-9]|none)$'),
  parent_id       uuid references public.vocab_domains (id) on delete set null,
  -- Prototipe: embedding dari "nama: deskripsi. Contoh istilah: …"
  embedding       extensions.vector(512),
  embedding_model text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint vocab_domains_not_own_parent check (parent_id is null or parent_id <> id)
);

create unique index vocab_domains_user_name_key
  on public.vocab_domains (user_id, lower(name)) where deleted_at is null;
create index vocab_domains_parent_idx on public.vocab_domains (parent_id);


-- ---------------------------------------------------------------------
-- vocab_terms: istilah + definisi (Markdown + LaTeX)
-- ---------------------------------------------------------------------
create table public.vocab_terms (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  term             text not null check (char_length(term) between 1 and 120),
  aliases          text[] not null default '{}' check (cardinality(aliases) <= 12),
  definition       text not null default '' check (char_length(definition) <= 20000),
  learned_on       date not null default current_date,

  domain_id        uuid references public.vocab_domains (id) on delete set null,
  -- pending   = belum ada domain (belum diproses atau sistem ragu)
  -- auto      = dipilih sistem, belum ditinjau        → boleh diubah sistem
  -- confirmed = tebakan sistem disetujui pengguna     → tidak pernah diubah sistem
  -- manual    = dipilih pengguna sendiri              → tidak pernah diubah sistem
  domain_source    text not null default 'pending'
                   check (domain_source in ('pending', 'auto', 'confirmed', 'manual')),
  -- Tiga skor teratas dari klasifikasi terakhir: [{ "domain_id": …, "score": … }]
  domain_scores    jsonb,

  subject_id       uuid references public.subjects (id) on delete set null,
  syllabus_item_id uuid references public.syllabus_items (id) on delete set null,
  note_id          uuid references public.notes (id) on delete set null,

  embedding        extensions.vector(512),
  embedding_model  text,
  embedded_at      timestamptz,

  -- Posisi di Peta Otak (diisi mulai Fase 3)
  map_x            real,
  map_y            real,
  map_placed       text check (map_placed in ('layout', 'knn')),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create unique index vocab_terms_user_term_key
  on public.vocab_terms (user_id, lower(term)) where deleted_at is null;
create index vocab_terms_user_learned_idx on public.vocab_terms (user_id, learned_on);
create index vocab_terms_domain_idx on public.vocab_terms (domain_id);
create index vocab_terms_note_idx on public.vocab_terms (note_id);
create index vocab_terms_syllabus_item_idx on public.vocab_terms (syllabus_item_id);
-- Tidak ada indeks vektor (HNSW/IVFFlat): untuk ribuan baris, scan biasa sudah cepat.


-- ---------------------------------------------------------------------
-- Metadata layout Peta Otak (diisi mulai Fase 3) + konvensi Week
-- ---------------------------------------------------------------------
alter table public.profiles
  add column vocab_layout_params jsonb,
  add column vocab_layout_at     timestamptz;

-- Week 1 mulai Senin 28 Sep 2026 (sebelumnya default-nya Selasa 29 Sep).
alter table public.profiles alter column program_start set default '2026-09-28';


-- ---------------------------------------------------------------------
-- Trigger: domain
--   • nama/deskripsi berubah → prototipe (embedding) dikosongkan
--   • induk harus milik pengguna yang sama, masih aktif, dan bukan cabang
--   • domain yang punya cabang tidak boleh diberi induk (maks dua tingkat)
-- ---------------------------------------------------------------------
create or replace function public.vocab_domains_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (new.name is distinct from old.name or new.description is distinct from old.description) then
    new.embedding = null;
    new.embedding_model = null;
  end if;

  if new.parent_id is not null
     and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id) then
    if not exists (
      select 1 from public.vocab_domains p
      where p.id = new.parent_id
        and p.user_id = new.user_id
        and p.deleted_at is null
        and p.parent_id is null
    ) then
      raise exception 'Induk domain tidak valid: harus domain aktif milikmu yang bukan cabang.'
        using errcode = '23514';
    end if;
    if exists (
      select 1 from public.vocab_domains c
      where c.parent_id = new.id and c.deleted_at is null
    ) then
      raise exception 'Domain yang punya cabang tidak bisa dijadikan cabang (maksimal dua tingkat).'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- Trigger: istilah
--   • istilah/alias/definisi berubah → embedding dikosongkan, supaya vektor
--     selalu sesuai teksnya
--   • tanpa domain = 'pending'; punya domain tidak boleh 'pending'
--   • domain, subjek, topik, dan catatan harus milik pengguna yang sama
--     (foreign key saja tidak menjamin ini)
-- ---------------------------------------------------------------------
create or replace function public.vocab_terms_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  restored boolean := tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null;
begin
  if tg_op = 'UPDATE'
     and (new.term is distinct from old.term
          or new.aliases is distinct from old.aliases
          or new.definition is distinct from old.definition) then
    new.embedding = null;
    new.embedding_model = null;
    new.embedded_at = null;
  end if;

  -- Istilah dipulihkan setelah domainnya dihapus → kembali menunggu domain.
  if restored and new.domain_id is not null and not exists (
    select 1 from public.vocab_domains d
    where d.id = new.domain_id and d.user_id = new.user_id and d.deleted_at is null
  ) then
    new.domain_id = null;
  end if;

  if new.domain_id is null then
    new.domain_source = 'pending';
  elsif new.domain_source = 'pending' then
    raise exception 'Istilah yang punya domain tidak boleh berstatus pending.' using errcode = '23514';
  end if;

  if new.domain_id is not null
     and (tg_op = 'INSERT' or new.domain_id is distinct from old.domain_id)
     and not exists (
       select 1 from public.vocab_domains d
       where d.id = new.domain_id and d.user_id = new.user_id and d.deleted_at is null
     ) then
    raise exception 'Domain tidak ditemukan.' using errcode = '23503';
  end if;

  if new.subject_id is not null
     and (tg_op = 'INSERT' or new.subject_id is distinct from old.subject_id)
     and not exists (
       select 1 from public.subjects s where s.id = new.subject_id and s.user_id = new.user_id
     ) then
    raise exception 'Subjek tidak ditemukan.' using errcode = '23503';
  end if;

  if new.syllabus_item_id is not null
     and (tg_op = 'INSERT' or new.syllabus_item_id is distinct from old.syllabus_item_id)
     and not exists (
       select 1 from public.syllabus_items i where i.id = new.syllabus_item_id and i.user_id = new.user_id
     ) then
    raise exception 'Topik silabus tidak ditemukan.' using errcode = '23503';
  end if;

  if new.note_id is not null
     and (tg_op = 'INSERT' or new.note_id is distinct from old.note_id)
     and not exists (
       select 1 from public.notes n where n.id = new.note_id and n.user_id = new.user_id
     ) then
    raise exception 'Catatan tidak ditemukan.' using errcode = '23503';
  end if;

  return new;
end;
$$;

create trigger vocab_domains_before_write
  before insert or update on public.vocab_domains
  for each row execute function public.vocab_domains_before_write();

create trigger vocab_domains_set_updated_at
  before update on public.vocab_domains
  for each row execute function public.set_updated_at();

create trigger vocab_terms_before_write
  before insert or update on public.vocab_terms
  for each row execute function public.vocab_terms_before_write();

create trigger vocab_terms_set_updated_at
  before update on public.vocab_terms
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------
-- Row Level Security: hanya pemilik; anon tidak punya akses sama sekali
-- ---------------------------------------------------------------------
alter table public.vocab_domains enable row level security;
alter table public.vocab_terms   enable row level security;

create policy "Owner full access" on public.vocab_domains
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owner full access" on public.vocab_terms
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.vocab_domains, public.vocab_terms from anon;
grant select, insert, update, delete on public.vocab_domains, public.vocab_terms to authenticated;


-- =====================================================================
-- RPC. Semuanya SECURITY INVOKER: berjalan sebagai pengguna yang
-- memanggil, jadi RLS tetap berlaku. Dipakai Edge Function `vocab-embed`
-- (dengan JWT pengguna) dan Server Actions.
-- =====================================================================

-- Simpan embedding untuk banyak baris sekaligus.
--   p_kind  : 'term' atau 'domain'
--   p_items : [{ "id": uuid, "embedding": [512 angka], "model": text, "seen_at": timestamptz }]
-- `seen_at` = updated_at baris saat teksnya dibaca. Kalau baris berubah
-- sesudah itu (teks diedit selagi embedding dihitung), baris dilewati.
create or replace function public.save_vocab_embeddings(p_kind text, p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  if p_kind = 'term' then
    update public.vocab_terms t
    set embedding = i.embedding::extensions.vector(512),
        embedding_model = i.model,
        embedded_at = now()
    from jsonb_to_recordset(p_items) as i(id uuid, embedding text, model text, seen_at timestamptz)
    where t.id = i.id and t.deleted_at is null and t.updated_at = i.seen_at;
  elsif p_kind = 'domain' then
    update public.vocab_domains d
    set embedding = i.embedding::extensions.vector(512),
        embedding_model = i.model
    from jsonb_to_recordset(p_items) as i(id uuid, embedding text, model text, seen_at timestamptz)
    where d.id = i.id and d.deleted_at is null and d.updated_at = i.seen_at;
  else
    raise exception 'p_kind harus ''term'' atau ''domain''.' using errcode = '22023';
  end if;

  get diagnostics affected = row_count;
  return affected;
end;
$$;


-- Kemiripan tiap istilah dengan tiap domain aktif. Skor akhir dan keputusan
-- dihitung di Edge Function (lihat _shared/vocab-classify.ts).
--   proto_sim    : kosinus dengan prototipe domain
--   centroid_sim : kosinus dengan rata-rata istilah confirmed/manual di domain
--                  itu; null kalau anggotanya kurang dari p_min_terms.
-- Centroid hanya memakai confirmed/manual supaya tebakan sistem yang keliru
-- tidak ikut "mengajari" dirinya sendiri.
create or replace function public.suggest_vocab_domains(p_term_ids uuid[], p_min_terms integer default 3)
returns table (
  term_id      uuid,
  domain_id    uuid,
  parent_id    uuid,
  proto_sim    double precision,
  centroid_sim double precision,
  n_terms      integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with members as (
    select m.user_id, m.domain_id, extensions.avg(m.embedding) as centroid, count(*)::integer as n
    from public.vocab_terms m
    where m.deleted_at is null
      and m.embedding is not null
      and m.domain_id is not null
      and m.domain_source in ('confirmed', 'manual')
    group by m.user_id, m.domain_id
  )
  select t.id,
         d.id,
         d.parent_id,
         1 - (d.embedding operator(extensions.<=>) t.embedding),
         case when mm.n >= p_min_terms
              then 1 - (mm.centroid operator(extensions.<=>) t.embedding) end,
         coalesce(mm.n, 0)
  from public.vocab_terms t
  join public.vocab_domains d
    on d.user_id = t.user_id and d.deleted_at is null and d.embedding is not null
  left join members mm on mm.domain_id = d.id and mm.user_id = t.user_id
  where t.id = any (p_term_ids)
    and t.deleted_at is null
    and t.embedding is not null;
$$;


-- Simpan hasil klasifikasi untuk banyak istilah sekaligus.
--   p_items : [{ "id": uuid, "domain_id": uuid|null, "domain_source": 'auto'|'pending',
--               "domain_scores": [{ "domain_id": uuid, "score": number }] }]
-- JAMINAN: hanya baris berstatus pending/auto yang diubah. Pilihan pengguna
-- (confirmed/manual) tidak pernah ditimpa, apa pun yang dikirim pemanggil.
create or replace function public.save_vocab_classification(p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.vocab_terms t
  set domain_id = i.domain_id,
      domain_source = i.domain_source,
      domain_scores = i.domain_scores
  from jsonb_to_recordset(p_items)
       as i(id uuid, domain_id uuid, domain_source text, domain_scores jsonb)
  where t.id = i.id
    and t.deleted_at is null
    and t.domain_source in ('pending', 'auto')
    and i.domain_source in ('pending', 'auto');

  get diagnostics affected = row_count;
  return affected;
end;
$$;


-- Istilah lain yang paling mirip maknanya (dari embedding asli, bukan jarak 2D).
create or replace function public.match_vocab_terms(p_term_id uuid, p_count integer default 6)
returns table (
  id         uuid,
  term       text,
  domain_id  uuid,
  similarity double precision,
  map_x      real,
  map_y      real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.id,
         o.term,
         o.domain_id,
         1 - (o.embedding operator(extensions.<=>) s.embedding),
         o.map_x,
         o.map_y
  from public.vocab_terms s
  join public.vocab_terms o
    on o.user_id = s.user_id
   and o.id <> s.id
   and o.deleted_at is null
   and o.embedding is not null
  where s.id = p_term_id
    and s.embedding is not null
  order by o.embedding operator(extensions.<=>) s.embedding
  limit least(greatest(coalesce(p_count, 6), 1), 20);
$$;


-- Gabungkan domain p_from ke p_into: semua istilah pindah (status sumbernya
-- dipertahankan), cabang p_from ikut pindah bila memungkinkan, lalu p_from
-- di-soft-delete. Mengembalikan jumlah istilah yang dipindahkan.
create or replace function public.merge_vocab_domains(p_from uuid, p_into uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  into_parent uuid;
  moved integer;
begin
  if p_from = p_into then
    raise exception 'Domain asal dan tujuan tidak boleh sama.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.vocab_domains where id = p_from and deleted_at is null) then
    raise exception 'Domain asal tidak ditemukan.' using errcode = '23503';
  end if;
  select parent_id into into_parent from public.vocab_domains where id = p_into and deleted_at is null;
  if not found then
    raise exception 'Domain tujuan tidak ditemukan.' using errcode = '23503';
  end if;

  update public.vocab_terms set domain_id = p_into where domain_id = p_from;
  get diagnostics moved = row_count;

  -- Tujuan adalah cabang dari asal → jadikan bidang dulu, supaya tidak yatim.
  if into_parent = p_from then
    update public.vocab_domains set parent_id = null where id = p_into;
    into_parent := null;
  end if;

  -- Cabang milik asal: ikut ke tujuan kalau tujuan adalah bidang; kalau
  -- tujuan sendiri cabang, mereka menjadi bidang (maksimal dua tingkat).
  update public.vocab_domains
  set parent_id = case when into_parent is null then p_into else null end
  where parent_id = p_from and id <> p_into;

  update public.vocab_domains set deleted_at = now() where id = p_from;
  return moved;
end;
$$;


-- Hapus domain (soft delete): istilah di dalamnya kembali menunggu domain,
-- cabangnya menjadi bidang. Mengembalikan jumlah istilah yang terdampak.
create or replace function public.delete_vocab_domain(p_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  if not exists (select 1 from public.vocab_domains where id = p_id and deleted_at is null) then
    raise exception 'Domain tidak ditemukan.' using errcode = '23503';
  end if;

  update public.vocab_terms
  set domain_id = null, domain_source = 'pending', domain_scores = null
  where domain_id = p_id;
  get diagnostics affected = row_count;

  update public.vocab_domains set parent_id = null where parent_id = p_id;
  update public.vocab_domains set deleted_at = now() where id = p_id;
  return affected;
end;
$$;


-- Hanya pengguna yang login yang boleh memanggil RPC ini.
revoke all on function
  public.save_vocab_embeddings(text, jsonb),
  public.suggest_vocab_domains(uuid[], integer),
  public.save_vocab_classification(jsonb),
  public.match_vocab_terms(uuid, integer),
  public.merge_vocab_domains(uuid, uuid),
  public.delete_vocab_domain(uuid)
from public, anon;

grant execute on function
  public.save_vocab_embeddings(text, jsonb),
  public.suggest_vocab_domains(uuid[], integer),
  public.save_vocab_classification(jsonb),
  public.match_vocab_terms(uuid, integer),
  public.merge_vocab_domains(uuid, uuid),
  public.delete_vocab_domain(uuid)
to authenticated;
