begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temporary table swarm_test_results (message text not null);
create function pg_temp.swarm_record(message text) returns text language plpgsql as $$
begin insert into swarm_test_results values(message); return message; end;
$$;
select plan(12);
create temporary table swarm_fixture as select gen_random_uuid() as user_a,
  gen_random_uuid() as user_b, gen_random_uuid() as account_a, gen_random_uuid() as account_b;
insert into auth.users(id) select user_a from swarm_fixture union all select user_b from swarm_fixture;
insert into public.swarm_user_connections(id,user_id,kind,provider,name,ciphertext)
select account_a,user_a,'native','github','First','existing-first' from swarm_fixture union all
select account_b,user_b,'native','github','Second','existing-second' from swarm_fixture;

select pg_temp.swarm_record(ok(to_regprocedure('public.swarm_user_complete_oauth(uuid,text,text,text)') is not null,
  'the bound completion function exists'));
select pg_temp.swarm_record(ok(not exists(select 1 from (values('anon'),('authenticated')) r(name)
  where has_function_privilege(r.name,'public.swarm_user_complete_oauth(uuid,text,text,text)','EXECUTE')),
  'browser database roles cannot execute completion'));
select public.swarm_user_begin_oauth(user_a,account_a,repeat('1',64),repeat('v',64),now()+interval '5 minutes') from swarm_fixture;
select pg_temp.swarm_record(is((select count(*) from public.swarm_user_complete_oauth(
  (select user_b from swarm_fixture),repeat('1',64),'github',repeat('v',64))),0::bigint,'a different owner cannot complete'));
select pg_temp.swarm_record(is((select count(*) from public.swarm_user_complete_oauth(
  (select user_a from swarm_fixture),repeat('1',64),'github',repeat('x',64))),0::bigint,'a different browser proof cannot complete'));
select pg_temp.swarm_record(is((select count(*) from public.swarm_user_complete_oauth(
  (select user_a from swarm_fixture),repeat('1',64),'slack',repeat('v',64))),0::bigint,'a different provider cannot complete'));
select pg_temp.swarm_record(is((select count(*) from public.swarm_user_oauth_states where state_hash=repeat('1',64)),
  1::bigint,'rejected attempts preserve the valid pending state'));
select pg_temp.swarm_record(is((select count(*) from public.swarm_user_complete_oauth(
  (select user_a from swarm_fixture),repeat('1',64),'github',repeat('v',64))),1::bigint,'the owner and starting browser can complete once'));
select pg_temp.swarm_record(is((select count(*) from public.swarm_user_complete_oauth(
  (select user_a from swarm_fixture),repeat('1',64),'github',repeat('v',64))),0::bigint,'completion cannot be replayed'));
select public.swarm_user_begin_oauth(user_a,account_a,repeat('2',64),repeat('w',64),now()+interval '5 minutes') from swarm_fixture;
update public.swarm_user_oauth_states set created_at=now()-interval '6 minutes',expires_at=now()-interval '1 minute'
  where state_hash=repeat('2',64);
select pg_temp.swarm_record(is((select count(*) from public.swarm_user_complete_oauth(
  (select user_a from swarm_fixture),repeat('2',64),'github',repeat('w',64))),0::bigint,'expired completion cannot succeed'));
select public.swarm_user_begin_oauth(user_a,account_a,repeat('3',64),repeat('z',64),now()+interval '5 minutes') from swarm_fixture;
update public.swarm_user_connections set name='Changed' where id=(select account_a from swarm_fixture);
select pg_temp.swarm_record(is((select count(*) from public.swarm_user_complete_oauth(
  (select user_a from swarm_fixture),repeat('3',64),'github',repeat('z',64))),0::bigint,'a stale connection revision cannot complete'));
delete from public.swarm_user_connections where id=(select account_a from swarm_fixture);
select pg_temp.swarm_record(is((select count(*) from public.swarm_user_complete_oauth(
  (select user_a from swarm_fixture),repeat('3',64),'github',repeat('z',64))),0::bigint,'a removed connection cannot complete'));
select pg_temp.swarm_record(is((select ciphertext from public.swarm_user_connections where id=(select account_b from swarm_fixture)),
  'existing-second','completion preserves the other account credential'));
select pg_temp.swarm_record(result) from finish() as f(result);
do $$ begin
  if exists(select 1 from swarm_test_results where message like 'not ok%' or message like '# Looks like%') then
    raise exception 'Bound OAuth completion tests failed';
  end if;
end; $$;
rollback;
