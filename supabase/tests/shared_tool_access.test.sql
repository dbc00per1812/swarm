begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temporary table swarm_test_results(message text not null);
create function pg_temp.swarm_record(message text) returns text language plpgsql as $$
begin insert into swarm_test_results values(message); return message; end; $$;
select no_plan();
create temporary table access_fixture as select gen_random_uuid() owner,gen_random_uuid() member,
  gen_random_uuid() outsider,gen_random_uuid() connection;
insert into auth.users(id) select owner from access_fixture union all select member from access_fixture union all select outsider from access_fixture;
insert into public.swarm_user_connections(id,user_id,kind,provider,name,ciphertext,tool_catalog,enabled_tools)
select connection,owner,'native','github','Same name','synthetic-secret',
  '[{"id":"read"},{"id":"new"},{"id":"disabled"}]'::jsonb,array['read','new'] from access_fixture;
create temporary table access_org as select (public.swarm_team_manage(owner,'create',null,'{"name":"Fixture"}')->>'id')::uuid id from access_fixture;
select public.swarm_team_manage(owner,'invite',id,jsonb_build_object('tokenHash',repeat('a',64))) from access_fixture,access_org;
select public.swarm_team_manage(member,'accept',null,jsonb_build_object('tokenHash',repeat('a',64))) from access_fixture;
select public.swarm_team_manage(owner,'share',id,jsonb_build_object('connectionId',connection,'toolIds',array['read'])) from access_fixture,access_org;
-- Use the actual gateway role for all execution permission reads and conflicting writes.
grant select on access_fixture,access_org to service_role;
grant insert on swarm_test_results to service_role;
set local role service_role;
select pg_temp.swarm_record(is((select count(*) from access_fixture,lateral public.swarm_team_connections(member)),1::bigint,'a current member can resolve an explicit share'));
select pg_temp.swarm_record(is((select c.enabled_tools from access_fixture,lateral public.swarm_team_connections(member) c),array['read'],'a share does not include other enabled or new tools'));
select pg_temp.swarm_record(is((select jsonb_array_length(c.tool_catalog) from access_fixture,lateral public.swarm_team_connections(member) c),1,'shared discovery contains only selected tools'));
select pg_temp.swarm_record(is((select count(*) from access_fixture,lateral public.swarm_team_connections(outsider)),0::bigint,'foreign users cannot resolve a connection'));
select pg_temp.swarm_record(is((select count(*) from access_fixture,lateral public.swarm_team_connections(member,gen_random_uuid())),0::bigint,'foreign connection IDs grant no access'));
select pg_temp.swarm_record(is((select cardinality(c.enabled_tools) from access_fixture,lateral public.swarm_team_connections(owner) c),2,'the owner retains their enabled tools'));
update public.swarm_user_connections set enabled_tools=array['new'] where id=(select connection from access_fixture);
select pg_temp.swarm_record(is((select count(*) from access_fixture,lateral public.swarm_team_connections(member)),0::bigint,'disabled owner tools are unavailable to members'));
update public.swarm_user_connections set enabled_tools=array['read','new'] where id=(select connection from access_fixture);
select pg_temp.swarm_record(ok((select public.swarm_user_save_credential(owner,connection,c.revision,'refreshed','Same name',c.ciphertext,true) from access_fixture join public.swarm_user_connections c on c.id=connection),'routine refresh saves with current revision and ciphertext'));
select pg_temp.swarm_record(is((select count(*) from access_fixture,lateral public.swarm_team_connections(member)),1::bigint,'routine refresh preserves grants'));
select pg_temp.swarm_record(ok(not (select public.swarm_user_save_credential(outsider,connection,c.revision,'foreign','Same name',c.ciphertext,false) from access_fixture join public.swarm_user_connections c on c.id=connection),'a foreign credential replacement is rejected'));
select pg_temp.swarm_record(ok(not (select public.swarm_user_save_credential(owner,connection,c.revision-1,'stale','Same name',c.ciphertext,false) from access_fixture join public.swarm_user_connections c on c.id=connection),'a stale replacement is rejected'));
select pg_temp.swarm_record(is((select count(*) from access_fixture,lateral public.swarm_team_connections(member)),1::bigint,'failed replacements preserve grants'));
select public.swarm_user_save_credential(owner,connection,c.revision,'replacement','Same name',c.ciphertext) from access_fixture join public.swarm_user_connections c on c.id=connection;
select pg_temp.swarm_record(is((select count(*) from access_fixture,lateral public.swarm_team_connections(member)),0::bigint,'manual replacement withdraws grants even with the same display name'));
select pg_temp.swarm_record(ok(exists(select 1 from public.swarm_team_audit where action='unshare'),'automatic withdrawal records an audit event'));
select public.swarm_team_manage(owner,'share',id,jsonb_build_object('connectionId',connection,'toolIds',array['read'])) from access_fixture,access_org;
select pg_temp.swarm_record(throws_ok(
  format('select public.swarm_user_begin_oauth(%L,%L,''invalid'',%L,now()+interval ''5 minutes'')',owner,connection,repeat('v',64)),
  '23514',null,'a failed reconnect rolls back its credential and grant writes')) from access_fixture;
select pg_temp.swarm_record(is((select count(*) from access_fixture,lateral public.swarm_team_connections(member)),1::bigint,'a failed reconnect preserves the prior grant'));
select public.swarm_user_begin_oauth(owner,connection,repeat('b',64),repeat('v',64),now()+interval '5 minutes') from access_fixture;
select pg_temp.swarm_record(is((select count(*) from access_fixture,lateral public.swarm_team_connections(member)),0::bigint,'manual reconnect withdraws grants before authorization'));
select public.swarm_team_manage(owner,'share',id,jsonb_build_object('connectionId',connection,'toolIds',array['read'])) from access_fixture,access_org;
update public.swarm_user_connections set tool_catalog=tool_catalog where id=(select connection from access_fixture);
select pg_temp.swarm_record(is((select count(*) from access_fixture,lateral public.swarm_team_connections(member)),0::bigint,'catalog replacement withdraws grants even for identical tools'));
select public.swarm_team_manage(owner,'share',id,jsonb_build_object('connectionId',connection,'toolIds',array['read'])) from access_fixture,access_org;
select public.swarm_team_manage(owner,'unshare',id,jsonb_build_object('connectionId',connection)) from access_fixture,access_org;
select pg_temp.swarm_record(is((select count(*) from access_fixture,lateral public.swarm_team_connections(member)),0::bigint,'withdrawal stops subsequent permission reads'));
select public.swarm_team_manage(owner,'share',id,jsonb_build_object('connectionId',connection,'toolIds',array['read'])) from access_fixture,access_org;
select public.swarm_team_manage(owner,'remove_member',id,jsonb_build_object('userId',member)) from access_fixture,access_org;
select pg_temp.swarm_record(is((select count(*) from access_fixture,lateral public.swarm_team_connections(member)),0::bigint,'member removal stops access'));
select public.swarm_team_manage(owner,'invite',id,jsonb_build_object('tokenHash',repeat('c',64))) from access_fixture,access_org;
select public.swarm_team_manage(member,'accept',null,jsonb_build_object('tokenHash',repeat('c',64))) from access_fixture;
select public.swarm_team_manage(owner,'delete',id) from access_fixture,access_org;
select pg_temp.swarm_record(is((select count(*) from access_fixture,lateral public.swarm_team_connections(member)),0::bigint,'organization deletion removes shared access'));
-- A connection owner can be an ordinary member of another organization.
create temporary table departure_org as select (public.swarm_team_manage(member,'create',null,'{"name":"Departure"}')->>'id')::uuid id from access_fixture;
select public.swarm_team_manage(member,'invite',id,jsonb_build_object('tokenHash',repeat('d',64))) from access_fixture,departure_org;
select public.swarm_team_manage(owner,'accept',null,jsonb_build_object('tokenHash',repeat('d',64))) from access_fixture;
select public.swarm_team_manage(owner,'share',id,jsonb_build_object('connectionId',connection,'toolIds',array['read'])) from access_fixture,departure_org;
select public.swarm_team_manage(owner,'remove_member',id,jsonb_build_object('userId',owner)) from access_fixture,departure_org;
select pg_temp.swarm_record(is((select count(*) from access_fixture,lateral public.swarm_team_connections(member)),0::bigint,'connection owner departure removes their shares'));
select public.swarm_team_manage(member,'invite',id,jsonb_build_object('tokenHash',repeat('e',64))) from access_fixture,departure_org;
select public.swarm_team_manage(owner,'accept',null,jsonb_build_object('tokenHash',repeat('e',64))) from access_fixture;
select public.swarm_team_manage(owner,'share',id,jsonb_build_object('connectionId',connection,'toolIds',array['read'])) from access_fixture,departure_org;
delete from public.swarm_user_connections where id=(select connection from access_fixture);
select pg_temp.swarm_record(is((select count(*) from access_fixture,lateral public.swarm_team_connections(member)),0::bigint,'connection deletion removes shared access'));
reset role;
select pg_temp.swarm_record(ok(not exists(select 1 from (values('anon'),('authenticated')) r(name)
  cross join (values('public.swarm_team_connections(uuid,uuid)'),
    ('public.swarm_user_save_credential(uuid,uuid,integer,text,text,text,boolean)'),
    ('public.swarm_team_clear_catalog_grants()'),('public.swarm_team_withdraw_connection_grants(uuid,uuid)')) f(signature)
  where has_function_privilege(r.name,f.signature,'EXECUTE')),'browser roles cannot invoke execution or withdrawal functions'));
select pg_temp.swarm_record(result) from finish() as f(result);
do $$ begin
  if exists(select 1 from swarm_test_results where message like 'not ok%' or message like '# Looks like%') then
    raise exception 'Shared tool storage tests failed';
  end if;
end; $$;
rollback;
