-- Run in a disposable database after all migrations. No production data is required.
begin;
set local plpgsql.check_asserts = on;
insert into auth.users(id,email,email_confirmed_at) values
  ('10000000-0000-4000-8000-000000000001','gmail-owner@example.test',now()),
  ('10000000-0000-4000-8000-000000000002','gmail-member@example.test',now());
insert into public.swarm_user_connections(id,user_id,kind,provider,name,ciphertext,tool_catalog,enabled_tools)
values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'native','gmail','Synthetic mailbox','synthetic-ciphertext','[{"id":"gmail_search"}]','{gmail_search}');
insert into public.swarm_user_mcp_keys(user_id,token_hash) values
  ('10000000-0000-4000-8000-000000000001',repeat('a',64)),
  ('10000000-0000-4000-8000-000000000001',repeat('b',64)),
  ('10000000-0000-4000-8000-000000000002',repeat('c',64));
set local role service_role;
do $$
declare
  owner_id uuid := '10000000-0000-4000-8000-000000000001';
  other_id uuid := '10000000-0000-4000-8000-000000000002';
  connection_id uuid := '20000000-0000-4000-8000-000000000001';
  request_id uuid;
  args jsonb;
  binding jsonb := jsonb_build_object('key_hash',repeat('a',64),'request_hash',repeat('d',64));
  result jsonb;
  scenario text;
  organization_id uuid;
  revision_value integer;
  i integer;
begin
  assert not has_table_privilege('anon','public.swarm_gmail_approvals','select');
  assert not has_table_privilege('authenticated','public.swarm_gmail_approvals','update');
  assert not has_function_privilege('authenticated','public.swarm_gmail_approval(uuid,uuid,text,jsonb)','execute');
  assert (select relrowsecurity from pg_class where oid='public.swarm_gmail_approvals'::regclass);
  args := binding || jsonb_build_object('connection_id',connection_id,'revision',0,'ciphertext','encrypted-query');
  request_id := gen_random_uuid();
  assert public.swarm_gmail_approval(owner_id,request_id,'create',args)='true'::jsonb;
  assert public.swarm_gmail_approval(other_id,request_id,'get')='null'::jsonb;
  assert public.swarm_gmail_approval(other_id,request_id,'approve')='null'::jsonb;
  assert public.swarm_gmail_approval(owner_id,request_id,'consume',binding)='false'::jsonb;
  assert public.swarm_gmail_approval(owner_id,request_id,'approve')='true'::jsonb;
  assert public.swarm_gmail_approval(owner_id,request_id,'consume',binding||jsonb_build_object('key_hash',repeat('b',64)))='false'::jsonb;
  assert public.swarm_gmail_approval(owner_id,request_id,'consume',binding||jsonb_build_object('request_hash',repeat('e',64)))='false'::jsonb;
  assert public.swarm_gmail_approval(owner_id,request_id,'consume',binding)='true'::jsonb;
  assert public.swarm_gmail_approval(owner_id,request_id,'consume',binding)='false'::jsonb;
  assert (select ciphertext is null and approved_at is not null and consumed_at is not null
    from public.swarm_gmail_approvals where id=request_id);
  foreach scenario in array array['denied','expired','disabled','revoked','changed'] loop
    request_id := gen_random_uuid();
    select revision into result from public.swarm_user_connections where id=connection_id;
    args := jsonb_set(args,'{revision}',result);
    assert public.swarm_gmail_approval(owner_id,request_id,'create',args)='true'::jsonb;
    if scenario='denied' then
      assert public.swarm_gmail_approval(owner_id,request_id,'deny')='true'::jsonb;
    else
      assert public.swarm_gmail_approval(owner_id,request_id,'approve')='true'::jsonb;
    end if;
    if scenario='expired' then
      update public.swarm_gmail_approvals set created_at=now()-interval '20 minutes',expires_at=now()-interval '10 minutes' where id=request_id;
    elsif scenario='disabled' then
      update public.swarm_user_connections set enabled_tools='{}' where id=connection_id;
    elsif scenario='revoked' then
      update public.swarm_user_mcp_keys set revoked_at=now() where token_hash=repeat('a',64);
    elsif scenario='changed' then
      update public.swarm_user_connections set name='Changed synthetic mailbox' where id=connection_id;
    end if;
    assert public.swarm_gmail_approval(owner_id,request_id,'consume',binding) is distinct from 'true'::jsonb, scenario;
    update public.swarm_user_connections set enabled_tools='{gmail_search}' where id=connection_id;
    update public.swarm_user_mcp_keys set revoked_at=null where token_hash=repeat('a',64);
  end loop;
  assert not exists(select 1 from public.swarm_gmail_approvals where expires_at<=clock_timestamp() and ciphertext is not null);
  organization_id := (public.swarm_team_manage(owner_id,'create',null,'{"name":"Synthetic organization"}') ->> 'id')::uuid;
  insert into public.swarm_team_memberships(organization_id,user_id) values(organization_id,other_id);
  perform public.swarm_team_manage(owner_id,'share',organization_id,
    jsonb_build_object('connectionId',connection_id,'toolIds',jsonb_build_array('gmail_search')));
  select revision into revision_value from public.swarm_user_connections where id=connection_id;
  request_id := gen_random_uuid();
  args := args || jsonb_build_object('key_hash',repeat('c',64),'revision',revision_value);
  assert public.swarm_gmail_approval(other_id,request_id,'create',args)='true'::jsonb;
  assert public.swarm_gmail_approval(other_id,request_id,'approve')='true'::jsonb;
  perform public.swarm_team_manage(owner_id,'unshare',organization_id,jsonb_build_object('connectionId',connection_id));
  assert public.swarm_gmail_approval(other_id,request_id,'consume',args) is distinct from 'true'::jsonb;
  update public.swarm_gmail_approvals set created_at=now()-interval '20 minutes',expires_at=now()-interval '10 minutes';
  args := args || jsonb_build_object('key_hash',repeat('a',64));
  for i in 1..21 loop
    result := public.swarm_gmail_approval(owner_id,gen_random_uuid(),'create',args);
    assert result=to_jsonb(i<=20), 'Pending approval limit';
  end loop;
end;
$$;
reset role;
select 'PASS: Gmail approval SQL permissions, binding, expiry, single use, and invalidation' as result;
rollback;
