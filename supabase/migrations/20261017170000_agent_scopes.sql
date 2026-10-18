-- Existing keys retain their permissions. New browser-issued keys use explicit grants.
alter table public.swarm_user_mcp_keys
  add column name text not null default 'Legacy key' check (length(btrim(name)) between 1 and 100),
  add column grants jsonb,
  add column expires_at timestamptz;

create function public.swarm_valid_agent_grants(p_grants jsonb) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare
  item jsonb;
  tool jsonb;
  resource_name text;
  resource_values jsonb;
  connection_id text;
  connection_ids text[] := '{}';
begin
  if p_grants is null then return true; end if;
  if jsonb_typeof(p_grants) <> 'array' or jsonb_array_length(p_grants) > 100 then return false; end if;
  for item in select value from jsonb_array_elements(p_grants) loop
    if jsonb_typeof(item) <> 'object' or item - array['connectionId','toolIds','resources'] <> '{}'::jsonb
      or not (item ? 'connectionId' and item ? 'toolIds') then return false; end if;
    connection_id := item->>'connectionId';
    if jsonb_typeof(item->'connectionId') <> 'string'
      or connection_id !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
      or connection_id = any(connection_ids) then return false; end if;
    connection_ids := array_append(connection_ids, connection_id);
    if jsonb_typeof(item->'toolIds') <> 'array' or jsonb_array_length(item->'toolIds') > 100 then return false; end if;
    for tool in select value from jsonb_array_elements(item->'toolIds') loop
      if jsonb_typeof(tool) <> 'string' or length(tool #>> '{}') not between 1 and 100 then return false; end if;
    end loop;
    if item ? 'resources' then
      if jsonb_typeof(item->'resources') <> 'object'
        or (item->'resources') - array['repositories','channels','teams'] <> '{}'::jsonb then return false; end if;
      for resource_name, resource_values in select key,value from jsonb_each(item->'resources') loop
        if jsonb_typeof(resource_values) <> 'array' or jsonb_array_length(resource_values) > 100 then return false; end if;
        for tool in select value from jsonb_array_elements(resource_values) loop
          if jsonb_typeof(tool) <> 'string' then return false; end if;
          if resource_name = 'repositories' and (tool #>> '{}') !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}$' then return false; end if;
          if resource_name = 'channels' and (tool #>> '{}') !~ '^[A-Za-z0-9_-]{1,80}$' then return false; end if;
          if resource_name = 'teams' and (tool #>> '{}') !~ '^[A-Za-z0-9_-]{1,40}$' then return false; end if;
        end loop;
      end loop;
    end if;
  end loop;
  return true;
end;
$$;

alter table public.swarm_user_mcp_keys
  add constraint swarm_agent_grants_valid check (public.swarm_valid_agent_grants(grants)),
  add constraint swarm_agent_expiry_valid check (expires_at is null or expires_at > created_at);

create or replace function public.swarm_user_key_owner(p_token_hash text) returns uuid
language sql security invoker set search_path = '' as $$
  select user_id from public.swarm_user_mcp_keys
  where token_hash = p_token_hash and revoked_at is null
    and (expires_at is null or expires_at > now());
$$;

-- Keep audit metadata separate from tokens, token hashes, and connection credentials.
create table public.swarm_agent_key_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  key_id uuid not null,
  action text not null check (action in ('issued', 'revoked', 'changed')),
  metadata jsonb not null,
  created_at timestamptz not null default now()
);
create index swarm_agent_key_audit_actor on public.swarm_agent_key_audit(actor_id, created_at);
alter table public.swarm_agent_key_audit enable row level security;
revoke all on public.swarm_agent_key_audit from public, anon, authenticated, service_role;
grant select on public.swarm_agent_key_audit to service_role;
create policy "The server reads agent key audit" on public.swarm_agent_key_audit
  for select to service_role using (true);

create function public.swarm_audit_agent_key() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.swarm_agent_key_audit(actor_id, key_id, action, metadata)
  values(new.user_id, new.id,
    case when tg_op = 'INSERT' then 'issued'
      when old.revoked_at is null and new.revoked_at is not null then 'revoked'
      else 'changed' end,
    jsonb_build_object('legacy', new.grants is null,
      'connection_count', case when new.grants is null then null else jsonb_array_length(new.grants) end,
      'expires_at', new.expires_at));
  return new;
end;
$$;
create trigger swarm_audit_agent_key after insert or update on public.swarm_user_mcp_keys
  for each row execute function public.swarm_audit_agent_key();

revoke all on function public.swarm_valid_agent_grants(jsonb), public.swarm_audit_agent_key() from public, anon, authenticated;
grant execute on function public.swarm_valid_agent_grants(jsonb) to service_role;
