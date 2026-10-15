-- Only the gateway can read credentials for current personal or shared access.
create function public.swarm_team_connections(p_user_id uuid, p_connection_id uuid default null)
returns setof public.swarm_user_connections
language sql stable security invoker set search_path = '' as $$
  select c.id,c.user_id,c.kind,c.provider,c.name,c.endpoint_url,c.ciphertext,c.account_label,
    c.settings,
    case when c.user_id=p_user_id then c.tool_catalog else
      (select coalesce(jsonb_agg(t),'[]'::jsonb) from jsonb_array_elements(c.tool_catalog) t
        where t->>'id'=any(permitted.tools)) end,
    permitted.tools,c.revision,c.updated_at
  from public.swarm_user_connections c
  cross join lateral (
    select coalesce(array_agg(distinct t),'{}'::text[]) tools from unnest(c.enabled_tools) t
    where exists(select 1 from jsonb_array_elements(c.tool_catalog) catalog where catalog->>'id'=t)
      and (c.user_id=p_user_id or exists(
        select 1 from public.swarm_team_grants g
        join public.swarm_team_memberships recipient on recipient.organization_id=g.organization_id and recipient.user_id=p_user_id
        join public.swarm_team_memberships owner on owner.organization_id=g.organization_id and owner.user_id=g.connection_owner_id
        where g.connection_id=c.id and g.connection_owner_id=c.user_id and t=any(g.tool_ids)))
  ) permitted
  where (p_connection_id is null or c.id=p_connection_id)
    and (c.user_id=p_user_id or (cardinality(permitted.tools)>0 and (c.kind='mcp' or c.ciphertext is not null)));
$$;
revoke all on function public.swarm_team_connections(uuid,uuid) from public,anon,authenticated;
grant execute on function public.swarm_team_connections(uuid,uuid) to service_role;

-- Record automatic withdrawal without storing credential or account details.
create function public.swarm_team_withdraw_connection_grants(p_user_id uuid,p_connection_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.swarm_user_connections where id=p_connection_id and user_id=p_user_id for update;
  if not found then return; end if;
  with withdrawn as (
    delete from public.swarm_team_grants where connection_id=p_connection_id and connection_owner_id=p_user_id
      returning organization_id
  )
  insert into public.swarm_team_audit(actor_id,organization_id,action,target_id)
    select p_user_id,organization_id,'unshare',p_connection_id from withdrawn;
end;
$$;
revoke all on function public.swarm_team_withdraw_connection_grants(uuid,uuid) from public,anon,authenticated;
grant execute on function public.swarm_team_withdraw_connection_grants(uuid,uuid) to service_role;

-- Writers lock the connection before its grants. Team writes lock the organization first.
-- This trigger also clears grants when rediscovery returns an identical catalog.
create function public.swarm_team_clear_catalog_grants() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.swarm_team_withdraw_connection_grants(new.user_id,new.id);
  return new;
end;
$$;
create trigger swarm_team_catalog_replaced after update of tool_catalog on public.swarm_user_connections
  for each row execute function public.swarm_team_clear_catalog_grants();
revoke all on function public.swarm_team_clear_catalog_grants() from public,anon,authenticated;
grant execute on function public.swarm_team_clear_catalog_grants() to service_role;

-- Manual saves withdraw grants. Refresh saves preserve the same connection and grants.
drop function public.swarm_user_save_credential(uuid,uuid,integer,text,text,text);
create function public.swarm_user_save_credential(
  p_user_id uuid,p_connection_id uuid,p_revision integer,p_ciphertext text,p_account_label text,
  p_previous_ciphertext text default null,p_refresh boolean default false
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.swarm_user_connections set ciphertext=p_ciphertext,account_label=p_account_label
    where id=p_connection_id and user_id=p_user_id and revision=p_revision
      and (p_previous_ciphertext is null or ciphertext=p_previous_ciphertext);
  if not found then return false; end if;
  if p_refresh is not true then
    perform public.swarm_team_withdraw_connection_grants(p_user_id,p_connection_id);
  end if;
  return true;
end;
$$;
revoke all on function public.swarm_user_save_credential(uuid,uuid,integer,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.swarm_user_save_credential(uuid,uuid,integer,text,text,text,boolean) to service_role;

create or replace function public.swarm_user_begin_oauth(
  p_user_id uuid,p_connection_id uuid,p_state_hash text,p_verifier text,p_expires_at timestamptz
) returns integer language plpgsql security invoker set search_path = '' as $$
declare current_revision integer;
begin
  update public.swarm_user_connections set updated_at=now()
    where id=p_connection_id and user_id=p_user_id and kind='native'
    returning revision into current_revision;
  if not found then
    raise exception using errcode='P0002',message='Connection not found.';
  end if;
  perform public.swarm_team_withdraw_connection_grants(p_user_id,p_connection_id);
  delete from public.swarm_user_oauth_states
    where user_id=p_user_id and (expires_at<=now() or connection_id=p_connection_id);
  insert into public.swarm_user_oauth_states(state_hash,user_id,connection_id,verifier,revision,expires_at)
    values(p_state_hash,p_user_id,p_connection_id,p_verifier,current_revision,p_expires_at);
  return current_revision;
end;
$$;
