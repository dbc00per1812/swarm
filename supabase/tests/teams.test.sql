begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
create temporary table swarm_test_results (message text not null);
create function pg_temp.swarm_record(message text) returns text language plpgsql as $$
begin insert into swarm_test_results values(message); return message; end; $$;
select no_plan();
create temporary table team_fixture as select gen_random_uuid() a, gen_random_uuid() b,
  gen_random_uuid() c, gen_random_uuid() connection_a, gen_random_uuid() connection_b;
insert into auth.users(id) select a from team_fixture union all select b from team_fixture union all select c from team_fixture;
insert into public.swarm_user_connections(id,user_id,kind,provider,name,ciphertext,tool_catalog,enabled_tools)
select connection_a,a,'native','github','First','synthetic-a','[{"id":"read"},{"id":"disabled"}]'::jsonb,array['read'] from team_fixture union all
select connection_b,b,'native','github','Second','synthetic-b','[{"id":"read"}]'::jsonb,array['read'] from team_fixture;
create temporary table team_created as select public.swarm_team_manage(a,'create',null,'{"name":"Test organization"}') as result from team_fixture;
create temporary table team_org as select (result->>'id')::uuid id from team_created;
select pg_temp.swarm_record(is((select count(*) from public.swarm_team_memberships),1::bigint,'creation adds the owner membership'));
select pg_temp.swarm_record(is((select public.swarm_team_manage(a,'list')->0->>'role' from team_fixture),'owner','the creator has the owner role'));
select pg_temp.swarm_record(is((select jsonb_array_length(public.swarm_team_manage(b,'list')) from team_fixture),0,'foreign organizations are hidden'));
select pg_temp.swarm_record(is((select public.swarm_team_manage(b,'detail',id)->>'status' from team_fixture,team_org),'404','foreign details are denied'));
select pg_temp.swarm_record(is((select public.swarm_team_manage(b,'delete',id)->>'status' from team_fixture,team_org),'404','foreign deletion is denied'));
select pg_temp.swarm_record(is((select public.swarm_team_manage(a,'remove_member',id,jsonb_build_object('userId',a))->>'status' from team_fixture,team_org),'409','an owner cannot leave'));
select public.swarm_team_manage(a,'invite',id,jsonb_build_object('tokenHash',repeat('a',64))) from team_fixture,team_org;
select pg_temp.swarm_record(is((select public.swarm_team_manage(b,'preview',null,jsonb_build_object('tokenHash',repeat('a',64)))->>'name' from team_fixture),'Test organization','preview returns the organization name'));
select pg_temp.swarm_record(is((select count(*) from public.swarm_team_memberships),1::bigint,'preview does not accept an invitation'));
select pg_temp.swarm_record(is((select count(*) from team_fixture, lateral jsonb_object_keys(public.swarm_team_manage(b,'preview',null,jsonb_build_object('tokenHash',repeat('a',64))))),2::bigint,'preview exposes only ID and name'));
select public.swarm_team_manage(b,'accept',null,jsonb_build_object('tokenHash',repeat('a',64))) from team_fixture;
select pg_temp.swarm_record(is((select count(*) from public.swarm_team_memberships),2::bigint,'explicit acceptance adds one member'));
select pg_temp.swarm_record(is((select public.swarm_team_manage(c,'accept',null,jsonb_build_object('tokenHash',repeat('a',64)))->>'status' from team_fixture),'404','an invitation cannot be reused'));
select pg_temp.swarm_record(is((select public.swarm_team_manage(b,'invite',id,jsonb_build_object('tokenHash',repeat('b',64)))->>'status' from team_fixture,team_org),'403','members cannot invite'));
select pg_temp.swarm_record(is((select public.swarm_team_manage(b,'delete',id)->>'status' from team_fixture,team_org),'403','members cannot delete an organization'));
select pg_temp.swarm_record(is((select public.swarm_team_manage(b,'remove_member',id,jsonb_build_object('userId',a))->>'status' from team_fixture,team_org),'403','members cannot remove others'));
select pg_temp.swarm_record(is((select public.swarm_team_manage(a,'share',id,jsonb_build_object('connectionId',connection_b,'toolIds',array['read']))->>'status' from team_fixture,team_org),'404','sharing a foreign connection is denied'));
select pg_temp.swarm_record(is((select public.swarm_team_manage(a,'share',id,jsonb_build_object('connectionId',connection_a,'toolIds',array['disabled']))->>'status' from team_fixture,team_org),'400','disabled tools cannot be shared'));
select pg_temp.swarm_record(is((select public.swarm_team_manage(a,'share',id,jsonb_build_object('connectionId',connection_a,'toolIds',array['unknown']))->>'status' from team_fixture,team_org),'400','unknown tools cannot be shared'));
select public.swarm_team_manage(a,'share',id,jsonb_build_object('connectionId',connection_a,'toolIds',array['read'])) from team_fixture,team_org;
select public.swarm_team_manage(b,'share',id,jsonb_build_object('connectionId',connection_b,'toolIds',array['read'])) from team_fixture,team_org;
select pg_temp.swarm_record(is((select count(*) from public.swarm_team_grants),2::bigint,'each member can share their own tools'));
select pg_temp.swarm_record(ok((select public.swarm_team_manage(b,'detail',id)::text !~ 'synthetic-|ciphertext|endpoint_url|account_label|token_hash' from team_fixture,team_org),'shared metadata contains no credential or invitation hash'));
select pg_temp.swarm_record(is((select public.swarm_team_manage(a,'unshare',id,jsonb_build_object('connectionId',connection_b))->>'status' from team_fixture,team_org),'404','an organization owner cannot change another member share'));
select public.swarm_team_manage(a,'remove_member',id,jsonb_build_object('userId',b)) from team_fixture,team_org;
select pg_temp.swarm_record(is((select count(*) from public.swarm_team_grants),1::bigint,'removal deletes departing connection owner shares'));
select pg_temp.swarm_record(is((select public.swarm_team_manage(b,'detail',id)->>'status' from team_fixture,team_org),'404','removed members lose organization access'));
select public.swarm_team_manage(a,'invite',id,jsonb_build_object('tokenHash',repeat('b',64))) from team_fixture,team_org;
select public.swarm_team_manage(a,'revoke_invite',team_org.id,jsonb_build_object('invitationId',i.id)) from team_fixture,team_org,public.swarm_team_invitations i where i.token_hash=repeat('b',64);
select pg_temp.swarm_record(is((select public.swarm_team_manage(b,'accept',null,jsonb_build_object('tokenHash',repeat('b',64)))->>'status' from team_fixture),'404','revoked invitations cannot be accepted'));
select public.swarm_team_manage(a,'invite',id,jsonb_build_object('tokenHash',repeat('c',64))) from team_fixture,team_org;
update public.swarm_team_invitations set created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' where token_hash=repeat('c',64);
select pg_temp.swarm_record(is((select public.swarm_team_manage(b,'accept',null,jsonb_build_object('tokenHash',repeat('c',64)))->>'status' from team_fixture),'404','expired invitations cannot be accepted'));
select pg_temp.swarm_record(ok(not exists(select 1 from (values('anon'),('authenticated')) r(name)
  cross join (values('swarm_organizations'),('swarm_team_memberships'),('swarm_team_invitations'),('swarm_team_grants'),('swarm_team_audit')) t(name)
  where has_table_privilege(r.name,'public.'||t.name,'SELECT,INSERT,UPDATE,DELETE')),'browser roles cannot access team storage'));
select pg_temp.swarm_record(ok(not exists(select 1 from (values('anon'),('authenticated')) r(name)
  where has_function_privilege(r.name,'public.swarm_team_manage(uuid,text,uuid,jsonb)','EXECUTE')),'browser roles cannot spoof the server identity'));
select pg_temp.swarm_record(ok(not exists(select 1 from pg_class where relnamespace='public'::regnamespace
  and relname in ('swarm_organizations','swarm_team_memberships','swarm_team_invitations','swarm_team_grants','swarm_team_audit') and not relrowsecurity),'all team tables use RLS'));
select pg_temp.swarm_record(ok(not has_table_privilege('service_role','public.swarm_team_audit','UPDATE,DELETE,TRUNCATE'), 'the gateway role cannot alter or erase audit evidence'));
select pg_temp.swarm_record(ok(exists(select 1 from public.swarm_team_audit where action='remove_member'),'privileged changes record an audit event'));
select public.swarm_team_manage(a,'unshare',id,jsonb_build_object('connectionId',connection_a)) from team_fixture,team_org;
select pg_temp.swarm_record(is((select count(*) from public.swarm_team_grants),0::bigint,'withdrawal removes the grant'));
select public.swarm_team_manage(a,'share',id,jsonb_build_object('connectionId',connection_a,'toolIds',array['read'])) from team_fixture,team_org;
delete from public.swarm_user_connections where id=(select connection_a from team_fixture);
select pg_temp.swarm_record(is((select count(*) from public.swarm_team_grants),0::bigint,'connection deletion removes grants'));
select pg_temp.swarm_record(is((select ciphertext from public.swarm_user_connections where id=(select connection_b from team_fixture)),'synthetic-b','team operations preserve personal credentials'));
-- Exercise the real gateway database role with RLS and table grants active.
grant select on team_fixture,team_org to service_role;
grant insert on swarm_test_results to service_role;
set local role service_role;
select pg_temp.swarm_record(is((select public.swarm_team_manage(a,'detail',id)->>'role' from team_fixture,team_org),'owner','the gateway role can read an authorized organization'));
select pg_temp.swarm_record(is((select public.swarm_team_manage(b,'detail',id)->>'status' from team_fixture,team_org),'404','the gateway role still rejects foreign organization access'));
select pg_temp.swarm_record(is((select public.swarm_team_manage(c,'create',null,'{"name":"Gateway fixture"}')->>'role' from team_fixture),'owner','the gateway role can create an organization and its audit event'));
select public.swarm_team_manage(c,'delete',o.id) from team_fixture,public.swarm_organizations o where o.owner_id=c;
reset role;
select public.swarm_team_manage(a,'invite',id,jsonb_build_object('tokenHash',repeat('d',64))) from team_fixture,team_org;
select public.swarm_team_manage(b,'accept',null,jsonb_build_object('tokenHash',repeat('d',64))) from team_fixture;
select public.swarm_team_manage(b,'share',id,jsonb_build_object('connectionId',connection_b,'toolIds',array['read'])) from team_fixture,team_org;
select public.swarm_team_manage(b,'remove_member',id,jsonb_build_object('userId',b)) from team_fixture,team_org;
select pg_temp.swarm_record(is((select count(*) from public.swarm_team_grants),0::bigint,'a member can leave and their shares are removed'));
select public.swarm_team_manage(a,'delete',id) from team_fixture,team_org;
select pg_temp.swarm_record(is((select count(*) from public.swarm_team_memberships),0::bigint,'organization deletion removes memberships'));
select pg_temp.swarm_record(is((select count(*) from public.swarm_team_invitations),0::bigint,'organization deletion removes invitations'));
select pg_temp.swarm_record(ok(exists(select 1 from public.swarm_team_audit where action='delete'),'deletion preserves audit evidence'));
-- Account deletion must also remove owned organizations without an orphaned owner.
select public.swarm_team_manage(a,'create',null,'{"name":"Deletion fixture"}') from team_fixture;
delete from auth.users where id=(select a from team_fixture);
set constraints all immediate;
select pg_temp.swarm_record(ok(not exists(select 1 from public.swarm_organizations where owner_id=(select a from team_fixture)), 'account deletion removes owned organizations'));
select pg_temp.swarm_record(ok(exists(select 1 from public.swarm_team_audit where actor_id=(select a from team_fixture)), 'account deletion retains identifier-only audit evidence'));
select pg_temp.swarm_record(result) from finish() as f(result);
do $$ begin
  if exists(select 1 from swarm_test_results where message like 'not ok%' or message like '# Looks like%') then
    raise exception 'Team storage tests failed';
  end if;
end; $$;
rollback;
