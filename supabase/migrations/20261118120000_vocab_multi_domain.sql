-- =====================================================================
-- Kosakata: satu istilah, banyak domain.
--
-- Domain utama tetap di vocab_terms.domain_id: ia yang menentukan warna,
-- posisi dasar di peta, sampul, dan diubah oleh klasifikasi otomatis.
-- Domain TAMBAHAN (mis. "Allah" di Islam, Katolik, dan Kristen) ada di
-- vocab_term_domains, dan hanya kamu yang memasangnya (sistem cuma
-- menyarankan, lihat alsoFits di _shared/vocab-classify.ts).
-- =====================================================================

create table public.vocab_term_domains (
  term_id    uuid not null references public.vocab_terms (id) on delete cascade,
  domain_id  uuid not null references public.vocab_domains (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (term_id, domain_id)
);

create index vocab_term_domains_domain_idx on public.vocab_term_domains (domain_id);
create index vocab_term_domains_user_idx on public.vocab_term_domains (user_id);


-- ---------------------------------------------------------------------
-- Trigger: domain tambahan
--   • istilah dan domain harus milik pengguna yang sama dan masih aktif
--   • domain tambahan tidak boleh sama dengan domain utama istilahnya
-- ---------------------------------------------------------------------
create or replace function public.vocab_term_domains_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.vocab_terms t
    where t.id = new.term_id and t.user_id = new.user_id and t.deleted_at is null
  ) then
    raise exception 'Istilah tidak ditemukan.' using errcode = '23503';
  end if;
  if not exists (
    select 1 from public.vocab_domains d
    where d.id = new.domain_id and d.user_id = new.user_id and d.deleted_at is null
  ) then
    raise exception 'Domain tidak ditemukan.' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.vocab_terms t where t.id = new.term_id and t.domain_id = new.domain_id
  ) then
    raise exception 'Domain itu sudah menjadi domain utama istilah ini.' using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger vocab_term_domains_before_write
  before insert or update on public.vocab_term_domains
  for each row execute function public.vocab_term_domains_before_write();


-- Domain tambahan yang naik menjadi domain utama tidak lagi tercatat sebagai tambahan.
create or replace function public.vocab_terms_after_domain_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.domain_id is not null and new.domain_id is distinct from old.domain_id then
    delete from public.vocab_term_domains where term_id = new.id and domain_id = new.domain_id;
  end if;
  return null;
end;
$$;

create trigger vocab_terms_after_domain_change
  after update of domain_id on public.vocab_terms
  for each row execute function public.vocab_terms_after_domain_change();


-- ---------------------------------------------------------------------
-- Row Level Security: hanya pemilik; anon tidak punya akses sama sekali
-- ---------------------------------------------------------------------
alter table public.vocab_term_domains enable row level security;

create policy "Owner full access" on public.vocab_term_domains
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.vocab_term_domains from anon;
grant select, insert, update, delete on public.vocab_term_domains to authenticated;


-- ---------------------------------------------------------------------
-- Jadikan sebuah domain sebagai domain utama istilah: domain utama yang
-- lama turun menjadi domain tambahan, dalam satu transaksi. Pilihan ini
-- milikmu, jadi statusnya 'manual'.
-- ---------------------------------------------------------------------
create or replace function public.make_primary_vocab_domain(p_term_id uuid, p_domain_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_primary uuid;
begin
  select domain_id into old_primary
  from public.vocab_terms
  where id = p_term_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Istilah tidak ditemukan.' using errcode = '23503';
  end if;
  if old_primary is not distinct from p_domain_id then
    return;
  end if;

  update public.vocab_terms set domain_id = p_domain_id, domain_source = 'manual' where id = p_term_id;
  if old_primary is not null then
    insert into public.vocab_term_domains (term_id, domain_id) values (p_term_id, old_primary)
    on conflict do nothing;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- Centroid domain kini juga memakai keanggotaan tambahan (yang kamu
-- pasang sendiri, jadi setara confirmed/manual). Tanda tangan sama.
-- ---------------------------------------------------------------------
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
  with assigned as (
    select m.user_id, m.domain_id, m.embedding
    from public.vocab_terms m
    where m.deleted_at is null
      and m.embedding is not null
      and m.domain_id is not null
      and m.domain_source in ('confirmed', 'manual')
    union all
    select m.user_id, x.domain_id, m.embedding
    from public.vocab_term_domains x
    join public.vocab_terms m on m.id = x.term_id
    where m.deleted_at is null
      and m.embedding is not null
  ),
  members as (
    select a.user_id, a.domain_id, extensions.avg(a.embedding) as centroid, count(*)::integer as n
    from assigned a
    group by a.user_id, a.domain_id
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


-- ---------------------------------------------------------------------
-- Gabung domain: domain tambahan ikut pindah ke tujuan (tanpa duplikat,
-- dan tidak untuk istilah yang domain utamanya sudah tujuan).
-- ---------------------------------------------------------------------
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

  -- Domain utama dulu: istilah yang tadinya punya tujuan sebagai tambahan
  -- kehilangan baris itu lewat trigger, jadi tidak ada duplikat.
  update public.vocab_terms set domain_id = p_into where domain_id = p_from;
  get diagnostics moved = row_count;

  insert into public.vocab_term_domains (term_id, domain_id, user_id, created_at)
  select x.term_id, p_into, x.user_id, x.created_at
  from public.vocab_term_domains x
  join public.vocab_terms t on t.id = x.term_id
  where x.domain_id = p_from
    and t.deleted_at is null
    and t.domain_id is distinct from p_into
  on conflict do nothing;
  delete from public.vocab_term_domains where domain_id = p_from;

  if into_parent = p_from then
    update public.vocab_domains set parent_id = null where id = p_into;
    into_parent := null;
  end if;

  update public.vocab_domains
  set parent_id = case when into_parent is null then p_into else null end
  where parent_id = p_from and id <> p_into;

  update public.vocab_domains set deleted_at = now() where id = p_from;
  return moved;
end;
$$;


-- ---------------------------------------------------------------------
-- Hapus domain: istilah yang domain utamanya hilang tapi punya domain
-- tambahan naik ke domain tambahan tertuanya (pilihanmu sendiri, jadi
-- 'manual'); yang tidak punya kembali menunggu domain. Mengembalikan
-- jumlah istilah yang kembali menunggu domain.
-- ---------------------------------------------------------------------
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

  update public.vocab_terms t
  set domain_id = e.domain_id, domain_source = 'manual'
  from (
    select distinct on (x.term_id) x.term_id, x.domain_id
    from public.vocab_term_domains x
    where x.domain_id <> p_id
    order by x.term_id, x.created_at
  ) e
  where t.domain_id = p_id and e.term_id = t.id;

  update public.vocab_terms
  set domain_id = null, domain_source = 'pending', domain_scores = null
  where domain_id = p_id;
  get diagnostics affected = row_count;

  delete from public.vocab_term_domains where domain_id = p_id;

  update public.vocab_domains set parent_id = null where parent_id = p_id;
  update public.vocab_domains set deleted_at = now() where id = p_id;
  return affected;
end;
$$;


-- ---------------------------------------------------------------------
-- Titik peta kini membawa domain tambahannya (urut waktu dipasang), untuk
-- "irisan" di visualisasi. Tipe kembaliannya berubah, jadi dibuat ulang.
-- ---------------------------------------------------------------------
drop function public.vocab_map_points();

create function public.vocab_map_points()
returns table (
  id               uuid,
  term             text,
  aliases          text[],
  domain_id        uuid,
  domain_source    text,
  learned_on       date,
  snippet          text,
  has_embedding    boolean,
  map_x            real,
  map_y            real,
  map_placed       text,
  extra_domain_ids uuid[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.term, t.aliases, t.domain_id, t.domain_source, t.learned_on,
         left(t.definition, 200), t.embedding is not null, t.map_x, t.map_y, t.map_placed,
         coalesce(
           (select array_agg(x.domain_id order by x.created_at, x.domain_id)
            from public.vocab_term_domains x
            where x.term_id = t.id),
           '{}'::uuid[])
  from public.vocab_terms t
  where t.deleted_at is null
  order by t.created_at;
$$;


revoke all on function
  public.make_primary_vocab_domain(uuid, uuid),
  public.vocab_map_points()
from public, anon;

grant execute on function
  public.make_primary_vocab_domain(uuid, uuid),
  public.vocab_map_points()
to authenticated;
