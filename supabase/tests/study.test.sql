-- pgTAP tests for the Ruang Studi's Bahasa (supabase/migrations/*_study_languages.sql).
-- Run against the local stack:  npm run test:db

begin;

create extension if not exists pgtap with schema extensions;
select * from no_plan();

create schema tests;
grant usage on schema tests to authenticated, anon;

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
-- User A: Japanese and Spanish, a few words
-- ---------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000a');

select lives_ok($$
  insert into public.study_languages (id, name, code, countries, color) values
    ('1a000000-0000-0000-0000-000000000001', 'Jepang', 'ja', '{JP}', 'domain-8'),
    ('1a000000-0000-0000-0000-000000000002', 'Spanyol', 'es', '{ES,MX,AR}', 'domain-2')
$$, 'a user adds languages with their countries');

select is((select user_id from public.study_languages where code = 'ja'), '00000000-0000-0000-0000-00000000000a'::uuid,
  'user_id defaults to the signed-in user');

select throws_ok($$insert into public.study_languages (name) values (' jepang ')$$,
  '23505', null, 'language names are unique per user, ignoring case and spaces');
select throws_ok($$insert into public.study_languages (name, countries) values ('Prancis', '{fr}')$$,
  '23514', null, 'countries are upper-case alpha-2 codes');
select throws_ok($$insert into public.study_languages (name, color) values ('Korea', 'red')$$,
  '23514', null, 'colours come from the domain palette');
select throws_ok($$insert into public.study_languages (name, code) values ('Bali', 'Bali')$$,
  '23514', null, 'codes look like ISO 639');
select lives_ok($$insert into public.study_languages (name, code, countries) values ('Bali', 'ban', '{ID}')$$,
  'a language of one''s own (a regional one) is fine');

select lives_ok($$
  insert into public.study_words (id, language_id, word, reading, meaning, example) values
    ('2a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', '勉強', 'benkyou', 'belajar', '毎日勉強します。'),
    ('2a000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-000000000002', 'coche', null, 'mobil', null)
$$, 'a user adds words');
select lives_ok($$
  insert into public.study_words (language_id, word, meaning, region) values
    ('1a000000-0000-0000-0000-000000000002', 'carro', 'mobil', 'MX')
$$, 'a word can belong to one country of its language');
select throws_ok($$
  insert into public.study_words (language_id, word, meaning) values ('1a000000-0000-0000-0000-000000000001', ' 勉強 ', 'lagi')
$$, '23505', null, 'words are unique per language');
select lives_ok($$
  insert into public.study_words (language_id, word, meaning) values ('1a000000-0000-0000-0000-000000000002', '勉強', 'bukan bahasa Spanyol')
$$, 'the same word may stand in another language');
select throws_ok($$
  insert into public.study_words (language_id, word, region) values ('1a000000-0000-0000-0000-000000000002', 'auto', 'mx')
$$, '23514', null, 'a region is an upper-case alpha-2 code');
select is((select learned_on from public.study_words where word = 'coche'), current_date, 'learned_on defaults to today');

-- updated_at moves on edit
update public.study_words set updated_at = now() - interval '1 day' where word = 'coche';
update public.study_words set meaning = 'mobil (Spanyol)' where word = 'coche';
select ok((select updated_at > now() - interval '1 minute' from public.study_words where word = 'coche'), 'updated_at is set on edit');

-- A language with live words cannot be deleted; once its words are gone, it can.
select throws_ok($$update public.study_languages set deleted_at = now() where code = 'es'$$,
  '23514', null, 'a language with words cannot be deleted');
update public.study_words set deleted_at = now() where language_id = '1a000000-0000-0000-0000-000000000002';
select lives_ok($$update public.study_languages set deleted_at = now() where code = 'es'$$,
  'a language without live words can be deleted');
select throws_ok($$
  insert into public.study_words (language_id, word) values ('1a000000-0000-0000-0000-000000000002', 'nuevo')
$$, '23503', null, 'no new words in a deleted language');
select lives_ok($$insert into public.study_languages (name, countries) values ('Spanyol', '{ES}')$$,
  'a deleted language''s name is free again');

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-00000000000b');
select is((select count(*) from public.study_languages), 0::bigint, 'another user sees no languages');
select is((select count(*) from public.study_words), 0::bigint, 'another user sees no words');
select throws_ok($$
  insert into public.study_words (language_id, word) values ('1a000000-0000-0000-0000-000000000001', 'hack')
$$, '23503', null, 'another user cannot add words to someone else''s language');
-- (A word as someone else stops at the trigger already: their language is invisible here.)
select throws_ok($$
  insert into public.study_words (user_id, language_id, word)
  values ('00000000-0000-0000-0000-00000000000a', '1a000000-0000-0000-0000-000000000001', 'hack')
$$, '23503', null, 'another user cannot write words as someone else');
select throws_ok($$
  insert into public.study_languages (user_id, name) values ('00000000-0000-0000-0000-00000000000a', 'Hack')
$$, '42501', null, 'another user cannot write languages as someone else');
update public.study_words set meaning = 'diubah' where word = '勉強';
select tests.login('00000000-0000-0000-0000-00000000000a');
select is((select meaning from public.study_words where id = '2a000000-0000-0000-0000-000000000001'), 'belajar',
  'another user''s update touches nothing');

select tests.login(null);
select throws_ok($$select count(*) from public.study_words$$, '42501', null, 'anon has no access to words');
select throws_ok($$select count(*) from public.study_languages$$, '42501', null, 'anon has no access to languages');

select * from finish();
rollback;
