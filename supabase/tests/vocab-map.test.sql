-- pgTAP tests for the Peta Otak RPCs (supabase/migrations/*_vocab_map.sql).
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
-- User A: five terms. Axis 1 and axis 2 are two "topics".
-- ---------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000a');

insert into public.vocab_terms (id, term, definition) values
  ('30000000-0000-0000-0000-000000000001', 'alfa', repeat('a', 300)),
  ('30000000-0000-0000-0000-000000000002', 'beta', 'dekat alfa'),
  ('30000000-0000-0000-0000-000000000003', 'gama', 'topik kedua'),
  ('30000000-0000-0000-0000-000000000004', 'delta', 'topik kedua juga'),
  ('30000000-0000-0000-0000-000000000005', 'baru', 'istilah baru, mirip topik pertama');

select public.save_vocab_embeddings('term', (
  select jsonb_agg(jsonb_build_object('id', t.id, 'model', 'test', 'seen_at', t.updated_at, 'embedding',
    case t.term when 'alfa' then tests.vec(1, 0, 0.123456)
                when 'beta' then tests.vec(0.9, 0.1)
                when 'gama' then tests.vec(0, 1)
                when 'delta' then tests.vec(0.1, 0.9)
                else tests.vec(0.95, 0.05) end::jsonb))
  from public.vocab_terms t));

select is((select count(*) from public.vocab_map_points()), 5::bigint, 'map points: one row per active term');
select is(
  (select length(snippet) from public.vocab_map_points() where term = 'alfa'), 200,
  'map points carry only the first 200 characters of the definition');
select ok(
  (select bool_and(has_embedding and map_x is null) from public.vocab_map_points()),
  'terms start embedded but without a position');

-- ---------------------------------------------------------------------
-- Layout: saved in one call, with its metadata on the profile
-- ---------------------------------------------------------------------
select is(
  public.save_vocab_layout(
    '[{"id":"30000000-0000-0000-0000-000000000001","x":-0.8,"y":0.1},
      {"id":"30000000-0000-0000-0000-000000000002","x":-0.6,"y":0.2},
      {"id":"30000000-0000-0000-0000-000000000003","x":0.7,"y":-0.3},
      {"id":"30000000-0000-0000-0000-000000000004","x":0.8,"y":-0.1}]'::jsonb,
    '{"seed":42,"method":"pca","n":4}'::jsonb),
  4, 'layout saves every coordinate');

select is(
  (select count(*) from public.vocab_map_points() where map_placed = 'layout'), 4::bigint,
  'laid-out terms are marked as layout');
select is(
  (select vocab_layout_params ->> 'seed' from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
  '42', 'layout metadata is stored on the profile (row created when missing)');
select ok(
  (select vocab_layout_at is not null from public.profiles where user_id = '00000000-0000-0000-0000-00000000000a'),
  'layout time is recorded');

-- ---------------------------------------------------------------------
-- kNN: neighbours with a position only, nearest first
-- ---------------------------------------------------------------------
select is(
  (select array_agg(neighbor_id order by similarity desc)
   from public.vocab_knn_neighbors(array['30000000-0000-0000-0000-000000000005']::uuid[], 2)),
  -- beta (0.9, 0.1) points almost the same way as baru (0.95, 0.05); alfa has a
  -- third component that tilts it slightly away.
  array['30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001']::uuid[],
  'the two nearest placed neighbours of the new term are beta, then alfa');

select is(
  (select count(*) from public.vocab_knn_neighbors(array['30000000-0000-0000-0000-000000000001']::uuid[], 20)),
  3::bigint, 'unplaced terms and the term itself are never neighbours');

select is(
  public.save_vocab_placements('[{"id":"30000000-0000-0000-0000-000000000005","x":-0.7,"y":0.15}]'::jsonb),
  1, 'a term without a position can be placed');
select is(
  (select map_placed from public.vocab_terms where id = '30000000-0000-0000-0000-000000000005'),
  'knn', 'placed terms are marked as knn');

select is(
  public.save_vocab_placements(
    '[{"id":"30000000-0000-0000-0000-000000000001","x":0,"y":0},
      {"id":"30000000-0000-0000-0000-000000000005","x":0,"y":0}]'::jsonb),
  0, 'placement never overwrites an existing position');
select is(
  (select map_x::numeric(4,2) || ' ' || map_placed from public.vocab_terms where id = '30000000-0000-0000-0000-000000000001'),
  '-0.80 layout', 'the layout position survived');

-- ---------------------------------------------------------------------
-- Embeddings for relayout: full length, rounded to four decimals
-- ---------------------------------------------------------------------
select is((select count(*) from public.vocab_embeddings()), 5::bigint, 'embeddings: one row per embedded term');
select is(
  (select cardinality(embedding) from public.vocab_embeddings() where id = '30000000-0000-0000-0000-000000000001'),
  512, 'embeddings keep all 512 dimensions');
select is(
  (select embedding[3]::numeric from public.vocab_embeddings() where id = '30000000-0000-0000-0000-000000000001'),
  0.1235, 'values are rounded to four decimals');

-- ---------------------------------------------------------------------
-- Editing the text clears the position together with the embedding
-- ---------------------------------------------------------------------
update public.vocab_terms set definition = 'makna baru' where id = '30000000-0000-0000-0000-000000000002';
select ok(
  (select map_x is null and map_y is null and map_placed is null and embedding is null
   from public.vocab_terms where id = '30000000-0000-0000-0000-000000000002'),
  'changing the definition clears the map position');

update public.vocab_terms set learned_on = '2026-10-05' where id = '30000000-0000-0000-0000-000000000003';
select ok(
  (select map_x is not null from public.vocab_terms where id = '30000000-0000-0000-0000-000000000003'),
  'changing other fields keeps the position');

-- ---------------------------------------------------------------------
-- User B and anon
-- ---------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000b');

select is((select count(*) from public.vocab_map_points()), 0::bigint, 'B sees none of A''s map points');
select is((select count(*) from public.vocab_embeddings()), 0::bigint, 'B sees none of A''s embeddings');
select is(
  public.save_vocab_layout('[{"id":"30000000-0000-0000-0000-000000000001","x":0.5,"y":0.5}]'::jsonb, '{}'::jsonb),
  0, 'B cannot move A''s points');
select is(
  (select count(*) from public.vocab_knn_neighbors(array['30000000-0000-0000-0000-000000000005']::uuid[], 5)),
  0::bigint, 'B gets no neighbours for A''s term');

select tests.login('00000000-0000-0000-0000-00000000000a');
select is(
  (select map_x::numeric(4,2) from public.vocab_terms where id = '30000000-0000-0000-0000-000000000001'),
  -0.80, 'A''s position was not changed by B');

select tests.login(null);
select throws_ok('select * from public.vocab_map_points()', '42501', null, 'anon cannot read map points');
select throws_ok('select * from public.vocab_embeddings()', '42501', null, 'anon cannot read embeddings');
select throws_ok($$ select public.save_vocab_layout('[]'::jsonb, '{}'::jsonb) $$, '42501', null, 'anon cannot save a layout');
select throws_ok($$ select public.save_vocab_placements('[]'::jsonb) $$, '42501', null, 'anon cannot place terms');

select * from finish();
rollback;
