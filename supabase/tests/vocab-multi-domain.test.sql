-- pgTAP tests for multi-domain terms (supabase/migrations/*_vocab_multi_domain.sql).
-- Run against the local stack:  npm run test:db

begin;

create extension if not exists pgtap with schema extensions;
select * from no_plan();

create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.vec(variadic w double precision[])
returns text language sql immutable as $$
  select '[' || array_to_string(w || array_fill(0::double precision, array[512 - cardinality(w)]), ',') || ']';
$$;

create function tests.login(uid uuid)
returns void language plpgsql as $$
begin
  if uid is null then
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  else
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  end if;
end;
$$;
grant execute on all functions in schema tests to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@study-hub.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@study-hub.test');

-- ---------------------------------------------------------------------
-- User A: a field "Agama" with three branches, and one other field.
-- ---------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000a');

insert into public.vocab_domains (id, name, color) values
  ('d0000000-0000-0000-0000-000000000001', 'Agama', 'domain-3');
insert into public.vocab_domains (id, name, color, parent_id) values
  ('d0000000-0000-0000-0000-000000000011', 'Islam', 'domain-3', 'd0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000012', 'Katolik', 'domain-3', 'd0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000013', 'Kristen', 'domain-3', 'd0000000-0000-0000-0000-000000000001');
insert into public.vocab_domains (id, name, color) values
  ('d0000000-0000-0000-0000-000000000002', 'Sejarah', 'domain-7');

insert into public.vocab_terms (id, term, definition, domain_id, domain_source) values
  ('40000000-0000-0000-0000-000000000001', 'Allah', 'Tuhan', 'd0000000-0000-0000-0000-000000000011', 'manual'),
  ('40000000-0000-0000-0000-000000000002', 'Kitab', 'Buku suci', 'd0000000-0000-0000-0000-000000000011', 'manual');

-- ---------------------------------------------------------------------
-- Extra domains
-- ---------------------------------------------------------------------
insert into public.vocab_term_domains (term_id, domain_id) values
  ('40000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000012'),
  ('40000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000013');

select is(
  (select count(*) from public.vocab_term_domains where term_id = '40000000-0000-0000-0000-000000000001'), 2::bigint,
  'a term can belong to more domains than its primary one');

select throws_ok(
  $$insert into public.vocab_term_domains (term_id, domain_id)
    values ('40000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000011')$$,
  '23505', null, 'the primary domain cannot also be an extra one');

select throws_ok(
  $$insert into public.vocab_term_domains (term_id, domain_id)
    values ('40000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000012')$$,
  '23505', null, 'an extra domain is recorded once');

select is(
  (select extra_domain_ids from public.vocab_map_points() where term = 'Allah'),
  array['d0000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000013']::uuid[],
  'map points carry the extra domains');
select is(
  (select extra_domain_ids from public.vocab_map_points() where term = 'Kitab'), '{}'::uuid[],
  'a term with one domain has no extras');

-- ---------------------------------------------------------------------
-- Make another domain the primary one: the old primary becomes an extra
-- ---------------------------------------------------------------------
select public.make_primary_vocab_domain('40000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000013');
select is(
  (select domain_id from public.vocab_terms where term = 'Allah'), 'd0000000-0000-0000-0000-000000000013'::uuid,
  'make primary: the chosen domain becomes the primary one');
select is(
  (select domain_source from public.vocab_terms where term = 'Allah'), 'manual',
  'make primary: it is the user''s choice');
select is(
  (select array_agg(domain_id order by domain_id) from public.vocab_term_domains where term_id = '40000000-0000-0000-0000-000000000001'),
  array['d0000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000012']::uuid[],
  'make primary: the old primary is now an extra, the new one is not');

-- ---------------------------------------------------------------------
-- Centroids count extra memberships (Katolik has none as a primary)
-- ---------------------------------------------------------------------
select public.save_vocab_embeddings('term', (
  select jsonb_agg(jsonb_build_object('id', t.id, 'model', 'test', 'seen_at', t.updated_at, 'embedding', tests.vec(1, 0)::jsonb))
  from public.vocab_terms t));
select public.save_vocab_embeddings('domain', (
  select jsonb_agg(jsonb_build_object('id', d.id, 'model', 'test', 'seen_at', d.updated_at, 'embedding', tests.vec(0, 1)::jsonb))
  from public.vocab_domains d));
select is(
  (select n_terms from public.suggest_vocab_domains(array['40000000-0000-0000-0000-000000000002'::uuid], 1)
   where domain_id = 'd0000000-0000-0000-0000-000000000012'),
  1, 'centroids count terms that have the domain as an extra');

-- ---------------------------------------------------------------------
-- Merge: extras move to the target without duplicates
-- ---------------------------------------------------------------------
select public.merge_vocab_domains('d0000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000002');
select is(
  (select array_agg(domain_id order by domain_id) from public.vocab_term_domains where term_id = '40000000-0000-0000-0000-000000000001'),
  array['d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000011']::uuid[],
  'merge: the extra moves to the target domain');

-- ---------------------------------------------------------------------
-- Delete the primary: the oldest extra takes its place
-- ---------------------------------------------------------------------
select is(public.delete_vocab_domain('d0000000-0000-0000-0000-000000000013'), 0,
  'delete: a term with extras does not go back to pending');
select is(
  (select domain_id from public.vocab_terms where term = 'Allah'), 'd0000000-0000-0000-0000-000000000011'::uuid,
  'delete: the oldest extra becomes the primary domain');
select is(
  (select count(*) from public.vocab_term_domains where term_id = '40000000-0000-0000-0000-000000000001'), 1::bigint,
  'delete: the promoted domain is no longer an extra');

select is(public.delete_vocab_domain('d0000000-0000-0000-0000-000000000002'), 0,
  'delete an extra-only domain: no term goes back to pending');
select is(
  (select count(*) from public.vocab_term_domains where domain_id = 'd0000000-0000-0000-0000-000000000002'), 0::bigint,
  'delete: extra rows of a deleted domain are removed');

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000b');
select is((select count(*) from public.vocab_term_domains), 0::bigint, 'another user sees no extra domains');
select throws_ok(
  $$insert into public.vocab_term_domains (term_id, domain_id)
    values ('40000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000011')$$,
  '23503', null, 'another user cannot attach domains to someone else''s term');
select throws_ok(
  $$select public.make_primary_vocab_domain('40000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000011')$$,
  '23503', null, 'another user cannot change someone else''s primary domain');

select tests.login(null);
select throws_ok($$select count(*) from public.vocab_term_domains$$, '42501', null, 'anon has no access');

select * from finish();
rollback;
