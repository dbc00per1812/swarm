begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temporary table swarm_import_results(message text not null);
create function pg_temp.record_import(message text) returns text language plpgsql as $$
begin insert into swarm_import_results values(message); return message; end;
$$;
select plan(12);
-- These fixtures and legacy changes exist only inside this rollback transaction.
delete from public.swarm_user_legacy_import;
delete from public.swarm_connections;
create temporary table import_fixture as select gen_random_uuid() as owner_id,
  gen_random_uuid() as other_id, gen_random_uuid() as connection_id;
insert into auth.users(id,email,email_confirmed_at)
select owner_id, owner_id::text || '@example.test', now() from import_fixture union all
select other_id, other_id::text || '@example.test', null from import_fixture;
grant select on import_fixture to service_role;
set local role service_role;
select public.swarm_user_legacy_status(owner_id::text || '@example.test') from import_fixture;
reset role;
insert into public.swarm_connections(provider,ciphertext,revision) values('github','legacy-cipher',7);
create temporary table import_payload as select jsonb_build_array(jsonb_build_object(
  'id', connection_id, 'provider','github','name','Personal', 'ciphertext','new-owner-bound-cipher',
  'previous_ciphertext','legacy-cipher','previous_revision',7,
  'settings',jsonb_build_object('repositories',array['demo/project']),
  'tool_catalog',jsonb_build_array(jsonb_build_object('id','github_list_pull_requests')),
  'enabled_tools',jsonb_build_array('github_list_pull_requests')
)) as value from import_fixture;
select pg_temp.record_import(throws_ok(
  format('select public.swarm_user_import_legacy(%L,%L,%L)', other_id::text || '@example.test', repeat('c',64), (select value from import_payload)),
  'P0001','A unique confirmed legacy owner is required.','an unconfirmed user cannot receive the legacy import'
)) from import_fixture;
select pg_temp.record_import(throws_ok(
  format('select public.swarm_user_import_legacy(%L,%L,%L)', owner_id::text || '@example.test', repeat('c',64),
    jsonb_set((select value from import_payload),'{0,previous_revision}','6')),
  'P0001','A legacy connection changed.','a changed legacy revision cancels the whole import'
)) from import_fixture;
select pg_temp.record_import(is((select count(*) from public.swarm_user_legacy_import),0::bigint,'a failed import creates no completion record'));
select pg_temp.record_import(ok(public.swarm_user_import_legacy(owner_id::text || '@example.test',repeat('c',64),(select value from import_payload)),
  'a confirmed owner can import the legacy accounts atomically')) from import_fixture;
select pg_temp.record_import(is((select user_id from public.swarm_user_connections where id=(select connection_id from import_fixture)),
  (select owner_id from import_fixture),'the imported account belongs to the confirmed owner'));
select pg_temp.record_import(is(public.swarm_user_key_owner(repeat('c',64)),(select owner_id from import_fixture),
  'the legacy agent key belongs to that owner'));
select pg_temp.record_import(is((select ciphertext from public.swarm_connections where provider='github'),'legacy-cipher',
  'the import preserves legacy ciphertext'));
select pg_temp.record_import(ok(not public.swarm_user_import_legacy(owner_id::text || '@example.test',repeat('c',64),(select value from import_payload)),
  'repeated imports cannot duplicate or restore accounts')) from import_fixture;
update public.swarm_user_mcp_keys set revoked_at=now() where token_hash=repeat('c',64);
select public.swarm_user_import_legacy(owner_id::text || '@example.test',repeat('c',64),(select value from import_payload)) from import_fixture;
select pg_temp.record_import(is(public.swarm_user_key_owner(repeat('c',64)),null::uuid,'repeated imports cannot restore a revoked key'));
select pg_temp.record_import(ok(not has_function_privilege('authenticated','public.swarm_user_import_legacy(text,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.swarm_user_legacy_status(text)','EXECUTE'), 'browser roles cannot import accounts or query the legacy owner'));
select pg_temp.record_import(ok(not has_table_privilege('authenticated','public.swarm_user_legacy_import','SELECT'),
  'browser roles cannot read the import record'));
grant select on import_fixture to service_role;
set local role service_role;
select public.swarm_user_legacy_status(owner_id::text || '@example.test') from import_fixture;
reset role;
select pg_temp.record_import(is((select count(*) from public.swarm_user_connections where user_id=(select owner_id from import_fixture)),
  1::bigint,'the owner retains exactly one imported account'));
select pg_temp.record_import(f.result) from finish() as f(result);
do $$ begin
  if exists(select 1 from swarm_import_results where message like 'not ok%' or message like '# Looks like%') then
    raise exception 'Legacy import tests failed: %',(select string_agg(message,E'\n') from swarm_import_results where message like 'not ok%' or message like '# Looks like%');
  end if;
end; $$;
rollback;
