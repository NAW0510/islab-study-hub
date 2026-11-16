-- =====================================================================
-- IS Lab Study Hub — Peta Otak (posisi 2D istilah)
-- Spesifikasi: docs/SPEC_KOSAKATA_PETA_OTAK.md §4, §5
--
-- Kolom map_x / map_y / map_placed dan kolom layout di profiles sudah ada
-- sejak migrasi vocab. Migrasi ini menambah RPC untuk peta dan membuat
-- posisi ikut dikosongkan ketika teks istilah berubah.
-- Semua RPC SECURITY INVOKER: RLS tetap berlaku.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Trigger istilah (ganti versi sebelumnya): teks berubah → embedding DAN
-- posisi di peta dikosongkan, supaya istilah ditempatkan ulang sesuai
-- makna barunya. Bagian lain sama persis dengan migrasi vocab.
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
    new.map_x = null;
    new.map_y = null;
    new.map_placed = null;
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


-- ---------------------------------------------------------------------
-- Data ringan untuk membuka peta: tanpa vektor, satu baris per istilah.
-- `snippet` = 200 karakter pertama definisi (untuk tooltip).
-- ---------------------------------------------------------------------
create or replace function public.vocab_map_points()
returns table (
  id            uuid,
  term          text,
  aliases       text[],
  domain_id     uuid,
  domain_source text,
  learned_on    date,
  snippet       text,
  has_embedding boolean,
  map_x         real,
  map_y         real,
  map_placed    text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.term, t.aliases, t.domain_id, t.domain_source, t.learned_on,
         left(t.definition, 200), t.embedding is not null, t.map_x, t.map_y, t.map_placed
  from public.vocab_terms t
  where t.deleted_at is null
  order by t.created_at;
$$;


-- ---------------------------------------------------------------------
-- Vektor untuk menyusun ulang peta di browser. Dibulatkan ke 4 desimal
-- supaya payload lebih kecil; hanya dipanggil saat "Susun ulang".
-- ---------------------------------------------------------------------
create or replace function public.vocab_embeddings()
returns table (
  id            uuid,
  domain_id     uuid,
  domain_source text,
  embedding     real[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.domain_id, t.domain_source,
         (select array_agg(round(u.v::numeric, 4)::real order by u.ord)
          from unnest(t.embedding::real[]) with ordinality as u(v, ord))
  from public.vocab_terms t
  where t.deleted_at is null and t.embedding is not null
  order by t.created_at;
$$;


-- ---------------------------------------------------------------------
-- Simpan hasil susun ulang dalam satu panggilan.
--   p_coords : [{ "id": uuid, "x": number, "y": number }]
--   p_params : metadata layout (seed, metode, parameter UMAP, jumlah istilah)
-- Mengembalikan jumlah istilah yang posisinya disimpan.
-- ---------------------------------------------------------------------
create or replace function public.save_vocab_layout(p_coords jsonb, p_params jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.vocab_terms t
  set map_x = c.x, map_y = c.y, map_placed = 'layout'
  from jsonb_to_recordset(p_coords) as c(id uuid, x real, y real)
  where t.id = c.id and t.deleted_at is null;
  get diagnostics affected = row_count;

  insert into public.profiles (user_id, vocab_layout_params, vocab_layout_at)
  values ((select auth.uid()), p_params, now())
  on conflict (user_id) do update
    set vocab_layout_params = excluded.vocab_layout_params,
        vocab_layout_at = excluded.vocab_layout_at;

  return affected;
end;
$$;


-- ---------------------------------------------------------------------
-- Tetangga terdekat YANG SUDAH PUNYA POSISI, untuk menempatkan istilah baru
-- tanpa menyusun ulang seluruh peta. Rumus posisinya ada di Edge Function
-- (_shared/knn-place.ts).
-- ---------------------------------------------------------------------
create or replace function public.vocab_knn_neighbors(p_term_ids uuid[], p_k integer default 5)
returns table (
  term_id     uuid,
  neighbor_id uuid,
  similarity  double precision,
  map_x       real,
  map_y       real
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, n.id, n.similarity, n.map_x, n.map_y
  from public.vocab_terms t
  cross join lateral (
    select o.id,
           1 - (o.embedding operator(extensions.<=>) t.embedding) as similarity,
           o.map_x,
           o.map_y
    from public.vocab_terms o
    where o.user_id = t.user_id
      and o.id <> t.id
      and o.deleted_at is null
      and o.embedding is not null
      and o.map_x is not null
      and o.map_y is not null
    order by o.embedding operator(extensions.<=>) t.embedding
    limit least(greatest(coalesce(p_k, 5), 1), 20)
  ) n
  where t.id = any (p_term_ids)
    and t.deleted_at is null
    and t.embedding is not null;
$$;


-- ---------------------------------------------------------------------
-- Simpan posisi hasil kNN.
--   p_items : [{ "id": uuid, "x": number, "y": number }]
-- JAMINAN: hanya baris yang BELUM punya posisi yang diisi, jadi hasil
-- susun ulang (layout) tidak pernah tertimpa penempatan otomatis.
-- ---------------------------------------------------------------------
create or replace function public.save_vocab_placements(p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.vocab_terms t
  set map_x = i.x, map_y = i.y, map_placed = 'knn'
  from jsonb_to_recordset(p_items) as i(id uuid, x real, y real)
  where t.id = i.id
    and t.deleted_at is null
    and t.map_x is null
    and t.map_y is null;

  get diagnostics affected = row_count;
  return affected;
end;
$$;


revoke all on function
  public.vocab_map_points(),
  public.vocab_embeddings(),
  public.save_vocab_layout(jsonb, jsonb),
  public.vocab_knn_neighbors(uuid[], integer),
  public.save_vocab_placements(jsonb)
from public, anon;

grant execute on function
  public.vocab_map_points(),
  public.vocab_embeddings(),
  public.save_vocab_layout(jsonb, jsonb),
  public.vocab_knn_neighbors(uuid[], integer),
  public.save_vocab_placements(jsonb)
to authenticated;
