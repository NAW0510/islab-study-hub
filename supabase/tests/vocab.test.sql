-- pgTAP tests for the vocabulary schema (supabase/migrations/*_vocab.sql).
-- Run against the local stack:  npm run test:db
-- Everything happens inside one transaction and is rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated, anon;

-- 512-dimensional vector as text/JSON: the given weights, then zeros.
create function tests.vec(variadic w double precision[])
returns text language sql immutable as $$
  select '[' || array_to_string(w || array_fill(0::double precision, array[512 - cardinality(w)]), ',') || ']';
$$;

-- Become a signed-in user (or anon when uid is null) for the rest of the transaction.
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

select has_table('public', 'vocab_domains', 'vocab_domains exists');
select has_table('public', 'vocab_terms', 'vocab_terms exists');

-- ---------------------------------------------------------------------
-- User A: domains and the two-level hierarchy
-- ---------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000a');

select lives_ok($$
  insert into public.vocab_domains (id, name, description, color, parent_id) values
    ('10000000-0000-0000-0000-000000000001', 'Machine Learning', 'Algoritma yang belajar dari data', 'domain-1', null),
    ('10000000-0000-0000-0000-000000000003', 'Statistika', 'Distribusi dan uji hipotesis', 'domain-4', null);
  insert into public.vocab_domains (id, name, description, color, parent_id) values
    ('10000000-0000-0000-0000-000000000002', 'Deep Learning', 'Jaringan saraf tiruan', 'domain-7',
     '10000000-0000-0000-0000-000000000001');
$$, 'owner can create a field and a branch under it');

select throws_ok($$
  insert into public.vocab_domains (name, parent_id)
  values ('CNN', '10000000-0000-0000-0000-000000000002');
$$, '23514', null, 'a branch cannot have its own branch (two levels max)');

select throws_ok($$
  update public.vocab_domains set parent_id = '10000000-0000-0000-0000-000000000003'
  where id = '10000000-0000-0000-0000-000000000001';
$$, '23514', null, 'a field that has branches cannot become a branch');

select throws_ok($$
  insert into public.vocab_domains (name) values ('machine learning');
$$, '23505', null, 'domain names are unique per user, case-insensitively');

select throws_ok($$
  insert into public.vocab_domains (name, color) values ('Warna salah', 'teal');
$$, '23514', null, 'colour must be a palette token');

-- ---------------------------------------------------------------------
-- User A: terms and the pending/domain rule
-- ---------------------------------------------------------------------
select lives_ok($$
  insert into public.vocab_terms (id, term, definition, domain_id, domain_source) values
    ('20000000-0000-0000-0000-000000000001', 'tensor', 'Struktur data multidimensi', null, 'pending'),
    ('20000000-0000-0000-0000-000000000002', 'p-value', 'Peluang hasil seekstrem itu',
     '10000000-0000-0000-0000-000000000003', 'manual'),
    ('20000000-0000-0000-0000-000000000003', 'backpropagation', 'Menghitung gradien loss',
     '10000000-0000-0000-0000-000000000002', 'confirmed'),
    ('20000000-0000-0000-0000-000000000004', 'layer', 'Lapisan jaringan saraf',
     '10000000-0000-0000-0000-000000000002', 'manual'),
    ('20000000-0000-0000-0000-000000000005', 'fungsi aktivasi', 'Fungsi nonlinear di tiap neuron',
     '10000000-0000-0000-0000-000000000002', 'confirmed'),
    ('20000000-0000-0000-0000-000000000006', 'dropout', 'Mematikan neuron secara acak',
     '10000000-0000-0000-0000-000000000002', 'auto');
$$, 'owner can add terms with and without a domain');

insert into public.vocab_terms (id, term, domain_source)
values ('20000000-0000-0000-0000-000000000007', 'epoch', 'auto');
select is(
  (select domain_source from public.vocab_terms where id = '20000000-0000-0000-0000-000000000007'),
  'pending', 'a term without a domain is always pending');

select throws_ok($$
  insert into public.vocab_terms (term, domain_id)
  values ('batch', '10000000-0000-0000-0000-000000000002');
$$, '23514', null, 'a term with a domain cannot be pending');

select throws_ok($$
  insert into public.vocab_terms (term) values ('Tensor');
$$, '23505', null, 'terms are unique per user, case-insensitively');

-- ---------------------------------------------------------------------
-- User B: sees nothing of A's, changes nothing of A's
-- ---------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000b');

select is((select count(*) from public.vocab_terms), 0::bigint, 'B cannot read A''s terms');
select is((select count(*) from public.vocab_domains), 0::bigint, 'B cannot read A''s domains');

update public.vocab_terms set term = 'diretas' where id = '20000000-0000-0000-0000-000000000001';
delete from public.vocab_terms where id = '20000000-0000-0000-0000-000000000002';
update public.vocab_domains set name = 'diretas' where id = '10000000-0000-0000-0000-000000000001';

select throws_ok($$
  insert into public.vocab_terms (term, domain_id, domain_source)
  values ('milik B', '10000000-0000-0000-0000-000000000002', 'manual');
$$, '23503', null, 'B cannot attach a term to A''s domain');

select throws_ok($$
  insert into public.vocab_terms (term, user_id)
  values ('untuk A', '00000000-0000-0000-0000-00000000000a');
$$, '42501', null, 'B cannot insert a row owned by A');

select throws_ok($$
  select public.delete_vocab_domain('10000000-0000-0000-0000-000000000001');
$$, '23503', null, 'B cannot delete A''s domain through the RPC');

select is(
  public.save_vocab_classification('[{"id":"20000000-0000-0000-0000-000000000001","domain_id":null,"domain_source":"pending","domain_scores":[]}]'::jsonb),
  0, 'B cannot classify A''s term through the RPC');

select lives_ok($$
  insert into public.vocab_domains (name) values ('Machine Learning');
$$, 'another user may reuse a domain name');

select tests.login('00000000-0000-0000-0000-00000000000a');

select is(
  (select term from public.vocab_terms where id = '20000000-0000-0000-0000-000000000001'),
  'tensor', 'A''s term was not renamed by B');
select is((select count(*) from public.vocab_terms), 7::bigint, 'A''s terms were not deleted by B');
select is(
  (select name from public.vocab_domains where id = '10000000-0000-0000-0000-000000000001'),
  'Machine Learning', 'A''s domain was not renamed by B');

-- ---------------------------------------------------------------------
-- anon: no access at all
-- ---------------------------------------------------------------------
select tests.login(null);

select throws_ok('select count(*) from public.vocab_terms', '42501', null, 'anon cannot read terms');
select throws_ok('select count(*) from public.vocab_domains', '42501', null, 'anon cannot read domains');
select throws_ok($$ select public.save_vocab_classification('[]'::jsonb) $$, '42501', null,
  'anon cannot call the classification RPC');
select throws_ok($$ select * from public.match_vocab_terms('20000000-0000-0000-0000-000000000001') $$, '42501', null,
  'anon cannot call the similarity RPC');

-- ---------------------------------------------------------------------
-- Embeddings: batch save, stale guard, cleared when the text changes
-- ---------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000a');

-- Axis 1 = Machine Learning, axis 2 = Deep Learning, axis 3 = Statistika.
select is(
  public.save_vocab_embeddings('domain', (
    select jsonb_agg(jsonb_build_object('id', d.id, 'model', 'test', 'seen_at', d.updated_at, 'embedding',
      case d.name when 'Machine Learning' then tests.vec(1, 0.1, 0)
                  when 'Deep Learning' then tests.vec(0.1, 1, 0)
                  else tests.vec(0, 0, 1) end::jsonb))
    from public.vocab_domains d)),
  3, 'domain prototypes are saved in one call');

select is(
  public.save_vocab_embeddings('term', (
    select jsonb_agg(jsonb_build_object('id', t.id, 'model', 'test', 'seen_at', t.updated_at, 'embedding',
      case t.term when 'tensor' then tests.vec(0.2, 0.9, 0.1)
                  when 'p-value' then tests.vec(0, 0.1, 1)
                  when 'backpropagation' then tests.vec(0.1, 1, 0)
                  -- same direction as tensor, twice the length: cosine similarity ignores length
                  when 'layer' then tests.vec(0.4, 1.8, 0.2)
                  when 'fungsi aktivasi' then tests.vec(0.1, 0.8, 0.1)
                  when 'dropout' then tests.vec(0.3, 0.9, 0)
                  else tests.vec(0.5, 0.5, 0.5) end::jsonb))
    from public.vocab_terms t)),
  7, 'term embeddings are saved in one call');

select is(
  public.save_vocab_embeddings('term', jsonb_build_array(jsonb_build_object(
    'id', '20000000-0000-0000-0000-000000000001', 'model', 'test',
    'seen_at', '2000-01-01T00:00:00Z', 'embedding', tests.vec(1, 0, 0)::jsonb))),
  0, 'an embedding computed from an older version of the row is skipped');

select throws_ok($$ select public.save_vocab_embeddings('lain', '[]'::jsonb) $$, '22023', null,
  'unknown kind is rejected');

-- ---------------------------------------------------------------------
-- Suggestions and similarity
-- ---------------------------------------------------------------------
select is(
  (select domain_id from public.suggest_vocab_domains(array['20000000-0000-0000-0000-000000000001']::uuid[])
   order by proto_sim desc limit 1),
  '10000000-0000-0000-0000-000000000002'::uuid,
  'tensor is closest to the Deep Learning prototype');

select is(
  (select count(*) from public.suggest_vocab_domains(array['20000000-0000-0000-0000-000000000001']::uuid[])),
  3::bigint, 'one row per active domain with a prototype');

select ok(
  (select centroid_sim is not null and n_terms = 3
   from public.suggest_vocab_domains(array['20000000-0000-0000-0000-000000000001']::uuid[])
   where domain_id = '10000000-0000-0000-0000-000000000002'),
  'a domain with 3 confirmed/manual terms gets a centroid (auto terms do not count)');

select ok(
  (select centroid_sim is null and n_terms = 1
   from public.suggest_vocab_domains(array['20000000-0000-0000-0000-000000000001']::uuid[])
   where domain_id = '10000000-0000-0000-0000-000000000003'),
  'a domain with fewer members than the minimum has no centroid');

select is(
  (select term from public.match_vocab_terms('20000000-0000-0000-0000-000000000001', 6) limit 1),
  'layer', 'the nearest term comes first');

select is(
  (select count(*) from public.match_vocab_terms('20000000-0000-0000-0000-000000000001', 3)),
  3::bigint, 'the similarity RPC honours its limit and skips the term itself');

-- ---------------------------------------------------------------------
-- Classification never overwrites the user's own choice
-- ---------------------------------------------------------------------
select is(
  public.save_vocab_classification(jsonb_build_array(
    jsonb_build_object('id', '20000000-0000-0000-0000-000000000001',
      'domain_id', '10000000-0000-0000-0000-000000000002', 'domain_source', 'auto',
      'domain_scores', '[{"domain_id":"10000000-0000-0000-0000-000000000002","score":0.9}]'::jsonb),
    jsonb_build_object('id', '20000000-0000-0000-0000-000000000002',
      'domain_id', '10000000-0000-0000-0000-000000000002', 'domain_source', 'auto', 'domain_scores', '[]'::jsonb),
    jsonb_build_object('id', '20000000-0000-0000-0000-000000000003',
      'domain_id', null, 'domain_source', 'pending', 'domain_scores', '[]'::jsonb),
    jsonb_build_object('id', '20000000-0000-0000-0000-000000000006',
      'domain_id', '10000000-0000-0000-0000-000000000001', 'domain_source', 'manual', 'domain_scores', '[]'::jsonb))),
  1, 'only pending/auto rows are classified, and only as auto/pending');

select is(
  (select domain_source || ' ' || domain_id from public.vocab_terms where id = '20000000-0000-0000-0000-000000000001'),
  'auto 10000000-0000-0000-0000-000000000002', 'the pending term became auto in Deep Learning');
select is(
  (select domain_source || ' ' || domain_id from public.vocab_terms where id = '20000000-0000-0000-0000-000000000002'),
  'manual 10000000-0000-0000-0000-000000000003', 'a manual choice is never overwritten');
select is(
  (select domain_source || ' ' || domain_id from public.vocab_terms where id = '20000000-0000-0000-0000-000000000003'),
  'confirmed 10000000-0000-0000-0000-000000000002', 'a confirmed choice is never overwritten');

-- ---------------------------------------------------------------------
-- Editing the text invalidates the embedding
-- ---------------------------------------------------------------------
update public.vocab_terms set definition = 'Generalisasi skalar, vektor, dan matriks'
where id = '20000000-0000-0000-0000-000000000001';
select ok(
  (select embedding is null and embedded_at is null and embedding_model is null
   from public.vocab_terms where id = '20000000-0000-0000-0000-000000000001'),
  'changing the definition clears the term embedding');

update public.vocab_terms set learned_on = '2026-10-05' where id = '20000000-0000-0000-0000-000000000004';
select ok(
  (select embedding is not null from public.vocab_terms where id = '20000000-0000-0000-0000-000000000004'),
  'changing other fields keeps the embedding');

update public.vocab_domains set description = 'Deskripsi baru' where id = '10000000-0000-0000-0000-000000000001';
select ok(
  (select embedding is null from public.vocab_domains where id = '10000000-0000-0000-0000-000000000001'),
  'changing a domain description clears its prototype');

-- ---------------------------------------------------------------------
-- Merge and delete domains
-- ---------------------------------------------------------------------
select is(public.delete_vocab_domain('10000000-0000-0000-0000-000000000003'), 1,
  'deleting a domain reports the affected terms');
select is(
  (select domain_source || ' ' || coalesce(domain_id::text, 'null') from public.vocab_terms
   where id = '20000000-0000-0000-0000-000000000002'),
  'pending null', 'terms of a deleted domain wait for a domain again');
select ok(
  (select deleted_at is not null from public.vocab_domains where id = '10000000-0000-0000-0000-000000000003'),
  'the domain is soft-deleted');
select lives_ok($$ insert into public.vocab_domains (name) values ('Statistika') $$,
  'the name of a deleted domain can be used again');

select is(public.merge_vocab_domains('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'), 5,
  'merging a branch into its field moves every term');
select is(
  (select count(*) from public.vocab_terms
   where domain_id = '10000000-0000-0000-0000-000000000001' and domain_source = 'confirmed'),
  2::bigint, 'merged terms keep their source status');
select ok(
  (select deleted_at is not null from public.vocab_domains where id = '10000000-0000-0000-0000-000000000002'),
  'the merged domain is soft-deleted');
select throws_ok($$
  select public.merge_vocab_domains('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
$$, '22023', null, 'a domain cannot be merged into itself');

-- ---------------------------------------------------------------------
-- Soft-deleted terms free their name
-- ---------------------------------------------------------------------
update public.vocab_terms set deleted_at = now() where id = '20000000-0000-0000-0000-000000000007';
select lives_ok($$ insert into public.vocab_terms (term) values ('Epoch') $$,
  'the name of a deleted term can be used again');
select throws_ok($$
  update public.vocab_terms set deleted_at = null where id = '20000000-0000-0000-0000-000000000007';
$$, '23505', null, 'restoring a term fails when its name was taken meanwhile');

select * from finish();
rollback;
