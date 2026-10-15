begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temporary table swarm_test_results (message text not null);
create function pg_temp.swarm_record(message text) returns text
language plpgsql as $$
begin
  insert into swarm_test_results values (message);
  return message;
end;
$$;

select plan(26);
create temporary table swarm_fixture as select
  gen_random_uuid() as user_a, gen_random_uuid() as user_b,
  gen_random_uuid() as account_a, gen_random_uuid() as account_a2,
  gen_random_uuid() as account_b;
insert into auth.users(id) select user_a from swarm_fixture union all select user_b from swarm_fixture;
insert into public.swarm_user_connections(id, user_id, kind, provider, name, ciphertext)
select account_a, user_a, 'native', 'github', 'Work', 'cipher-a' from swarm_fixture union all
select account_a2, user_a, 'native', 'github', 'Personal', 'cipher-a2' from swarm_fixture union all
select account_b, user_b, 'native', 'gmail', 'Mail', 'cipher-b' from swarm_fixture;

select pg_temp.swarm_record(throws_ok(
  format('insert into public.swarm_user_connections(user_id,kind,name) values(%L,''native'',''Missing service'')', user_a),
  '23514', null, 'a native account requires a service before it can be saved')) from swarm_fixture;

select pg_temp.swarm_record(is(
  (select count(*) from public.swarm_user_connections where user_id = (select user_a from swarm_fixture)),
  2::bigint, 'one user can keep two accounts for the same provider'));

select pg_temp.swarm_record(ok(public.swarm_user_save_credential(
  (select user_a from swarm_fixture), (select account_a from swarm_fixture), 0,
  'cipher-new', 'Work account', 'cipher-a'), 'the current account credential can be saved'));
select pg_temp.swarm_record(is(
  (select ciphertext from public.swarm_user_connections where id = (select account_a2 from swarm_fixture)),
  'cipher-a2', 'saving one account preserves the other account'));
select pg_temp.swarm_record(ok(not public.swarm_user_save_credential(
  (select user_b from swarm_fixture), (select account_a from swarm_fixture), 1,
  'foreign', 'Wrong owner', null), 'a foreign owner cannot save an account credential'));
select pg_temp.swarm_record(ok(not public.swarm_user_save_credential(
  (select user_a from swarm_fixture), (select account_a from swarm_fixture), 0,
  'stale', 'Stale refresh', 'cipher-a'), 'a stale revision cannot replace the saved credential'));
select pg_temp.swarm_record(is(
  (select ciphertext from public.swarm_user_connections where id = (select account_a from swarm_fixture)),
  'cipher-new', 'rejected writes preserve the current credential'));

select public.swarm_user_begin_oauth(user_a, account_a, repeat('1',64), repeat('v',64), now() + interval '5 minutes') from swarm_fixture;
select public.swarm_user_begin_oauth(user_a, account_a2, repeat('2',64), repeat('w',64), now() + interval '5 minutes') from swarm_fixture;
select pg_temp.swarm_record(is(
  (select count(*) from public.swarm_user_oauth_states where user_id = (select user_a from swarm_fixture)),
  2::bigint, 'two account authorization flows can run independently'));
select pg_temp.swarm_record(throws_ok(
  format('select public.swarm_user_begin_oauth(%L,%L,%L,%L,now()+interval ''5 minutes'')',
    user_b, account_a, repeat('3',64), repeat('x',64)),
  'P0002', 'Connection not found.', 'a foreign owner cannot start account authorization')) from swarm_fixture;
select pg_temp.swarm_record(throws_ok(
  format('insert into public.swarm_user_oauth_states(state_hash,user_id,connection_id,verifier,revision,expires_at) values(%L,%L,%L,%L,0,now()+interval ''5 minutes'')',
    repeat('4',64), user_b, account_a, repeat('x',64)),
  '23503', null, 'the database rejects authorization state bound to a different owner')) from swarm_fixture;
select pg_temp.swarm_record(is(
  (select count(*) from public.swarm_user_consume_oauth(repeat('1',64), 'gmail')),
  0::bigint, 'a callback for the wrong provider cannot consume authorization'));
select pg_temp.swarm_record(is(
  (select count(*) from public.swarm_user_consume_oauth(repeat('1',64), 'github')),
  1::bigint, 'the correct callback consumes its authorization once'));
select pg_temp.swarm_record(is(
  (select count(*) from public.swarm_user_consume_oauth(repeat('1',64), 'github')),
  0::bigint, 'a repeated callback cannot reuse authorization'));

select public.swarm_user_begin_oauth(user_a, account_a, repeat('5',64), repeat('v',64), now() + interval '5 minutes') from swarm_fixture;
select public.swarm_user_begin_oauth(user_a, account_a, repeat('6',64), repeat('v',64), now() + interval '5 minutes') from swarm_fixture;
select pg_temp.swarm_record(is(
  (select count(*) from public.swarm_user_consume_oauth(repeat('5',64), 'github')),
  0::bigint, 'a reconnect cancels an earlier callback for that account'));
select pg_temp.swarm_record(ok(
  exists(select 1 from public.swarm_user_oauth_states where state_hash = repeat('2',64)),
  'a reconnect preserves authorization for the other account'));
select pg_temp.swarm_record(ok(not public.swarm_user_save_credential(
  (select user_a from swarm_fixture), (select account_a from swarm_fixture), 2,
  'late-refresh', null, 'cipher-new'), 'a delayed refresh cannot overwrite a reconnect'));

delete from public.swarm_user_connections where id = (select account_a2 from swarm_fixture);
select pg_temp.swarm_record(ok(
  not exists(select 1 from public.swarm_user_oauth_states where state_hash = repeat('2',64))
  and exists(select 1 from public.swarm_user_oauth_states where state_hash = repeat('6',64)),
  'removing one account cancels only its pending authorization'));
update public.swarm_user_oauth_states set expires_at = now() - interval '1 minute', created_at = now() - interval '6 minutes'
where state_hash = repeat('6',64);
select pg_temp.swarm_record(is(
  (select count(*) from public.swarm_user_consume_oauth(repeat('6',64), 'github')),
  0::bigint, 'an expired authorization cannot be consumed'));

insert into public.swarm_user_mcp_keys(user_id, token_hash) select user_a, repeat('a',64) from swarm_fixture;
select pg_temp.swarm_record(is(public.swarm_user_key_owner(repeat('a',64)), user_a,
  'an active key resolves only to its owner')) from swarm_fixture;
select pg_temp.swarm_record(throws_ok(
  format('insert into public.swarm_user_mcp_keys(user_id,token_hash) values(%L,%L)', user_b, repeat('a',64)),
  '23505', null, 'one credential cannot identify two different users')) from swarm_fixture;
update public.swarm_user_mcp_keys set revoked_at = now() where token_hash = repeat('a',64);
select pg_temp.swarm_record(is(public.swarm_user_key_owner(repeat('a',64)), null::uuid,
  'revocation prevents key resolution'));
select pg_temp.swarm_record(is(public.swarm_user_key_owner(repeat('b',64)), null::uuid,
  'an unknown key grants no access'));

select pg_temp.swarm_record(ok(not exists(
  select 1 from (values ('anon'), ('authenticated')) r(role_name)
  cross join (values ('swarm_user_connections'), ('swarm_user_oauth_states'), ('swarm_user_mcp_keys')) t(table_name)
  where has_table_privilege(r.role_name, 'public.' || t.table_name, 'SELECT, INSERT, UPDATE, DELETE')
), 'browser database roles cannot read or change credentials, states, or keys'));
select pg_temp.swarm_record(ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated')) r(role_name)
  where n.nspname = 'public' and p.proname like 'swarm_user_%'
  and has_function_privilege(r.role_name, p.oid, 'EXECUTE')
), 'browser database roles cannot call privileged connection functions'));

delete from auth.users where id = (select user_a from swarm_fixture);
select pg_temp.swarm_record(ok(
  not exists(select 1 from public.swarm_user_connections where user_id = (select user_a from swarm_fixture))
  and not exists(select 1 from public.swarm_user_mcp_keys where user_id = (select user_a from swarm_fixture))
  and not exists(select 1 from public.swarm_user_oauth_states where user_id = (select user_a from swarm_fixture)),
  'deleting a user removes that user connections, states, and keys'));
select pg_temp.swarm_record(is(
  (select ciphertext from public.swarm_user_connections where id = (select account_b from swarm_fixture)),
  'cipher-b', 'deleting one user preserves the other user credential'));

select pg_temp.swarm_record(f.result) from finish() as f(result);
do $$
begin
  if exists(select 1 from swarm_test_results where message like 'not ok%' or message like '# Looks like%') then
    raise exception 'Connection storage tests failed: %',
      (select string_agg(message, E'\n') from swarm_test_results where message like 'not ok%' or message like '# Looks like%');
  end if;
end;
$$;
rollback;
