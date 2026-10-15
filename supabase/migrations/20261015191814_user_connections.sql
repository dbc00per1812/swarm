-- Additive storage for the Connections beta. Legacy tables remain unchanged.
-- Reversal requires a new migration after the gateway stops using these tables.
create table public.swarm_user_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('native', 'mcp')),
  provider text,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  endpoint_url text,
  ciphertext text check (octet_length(ciphertext) <= 65536),
  account_label text check (char_length(account_label) <= 320),
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 32768),
  tool_catalog jsonb not null default '[]'::jsonb
    check (jsonb_typeof(tool_catalog) = 'array' and jsonb_array_length(tool_catalog) <= 100
      and octet_length(tool_catalog::text) <= 262144),
  enabled_tools text[] not null default '{}'::text[]
    check (cardinality(enabled_tools) <= 100 and array_position(enabled_tools, null) is null),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (
    (kind = 'native' and provider is not null
      and provider in ('github', 'slack', 'linear', 'gmail') and endpoint_url is null)
    or (kind = 'mcp' and provider is null and endpoint_url is not null
      and char_length(endpoint_url) <= 2048 and endpoint_url ~ '^https://[^[:space:]]+$')
  )
);
create index swarm_user_connections_owner on public.swarm_user_connections(user_id);

create table public.swarm_user_oauth_states (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null,
  connection_id uuid not null,
  verifier text not null check (verifier ~ '^[A-Za-z0-9._~-]{43,128}$'),
  revision integer not null check (revision >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  foreign key (connection_id, user_id)
    references public.swarm_user_connections(id, user_id) on delete cascade,
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes')
);
create index swarm_user_oauth_states_account on public.swarm_user_oauth_states(connection_id, user_id);
create index swarm_user_oauth_states_owner on public.swarm_user_oauth_states(user_id);

create table public.swarm_user_mcp_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index swarm_user_mcp_keys_owner on public.swarm_user_mcp_keys(user_id);

alter table public.swarm_user_connections enable row level security;
alter table public.swarm_user_oauth_states enable row level security;
alter table public.swarm_user_mcp_keys enable row level security;
revoke all on public.swarm_user_connections, public.swarm_user_oauth_states, public.swarm_user_mcp_keys
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.swarm_user_connections, public.swarm_user_oauth_states, public.swarm_user_mcp_keys to service_role;

-- Only the gateway accesses these tables. Its queries must include the verified user ID.
create policy "The server manages user connections" on public.swarm_user_connections
  for all to service_role using (true) with check (true);
create policy "The server manages user authorization" on public.swarm_user_oauth_states
  for all to service_role using (true) with check (true);
create policy "The server manages user access keys" on public.swarm_user_mcp_keys
  for all to service_role using (true) with check (true);

create function public.swarm_user_touch_connection() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger swarm_user_connection_changed before update on public.swarm_user_connections
  for each row execute function public.swarm_user_touch_connection();

create function public.swarm_user_begin_oauth(
  p_user_id uuid, p_connection_id uuid, p_state_hash text, p_verifier text, p_expires_at timestamptz
) returns integer language plpgsql security invoker set search_path = '' as $$
declare current_revision integer;
begin
  update public.swarm_user_connections set updated_at = now()
    where id = p_connection_id and user_id = p_user_id and kind = 'native'
    returning revision into current_revision;
  if not found then
    raise exception using errcode = 'P0002', message = 'Connection not found.';
  end if;
  delete from public.swarm_user_oauth_states
    where user_id = p_user_id and (expires_at <= now() or connection_id = p_connection_id);
  insert into public.swarm_user_oauth_states(state_hash, user_id, connection_id, verifier, revision, expires_at)
    values(p_state_hash, p_user_id, p_connection_id, p_verifier, current_revision, p_expires_at);
  return current_revision;
end;
$$;

create function public.swarm_user_consume_oauth(p_state_hash text, p_provider text)
returns setof public.swarm_user_oauth_states
language sql security invoker set search_path = '' as $$
  delete from public.swarm_user_oauth_states as s using public.swarm_user_connections as c
    where s.state_hash = p_state_hash and s.connection_id = c.id and s.user_id = c.user_id
      and c.kind = 'native' and c.provider = p_provider and s.revision = c.revision and s.expires_at > now()
    returning s.*;
$$;

create function public.swarm_user_save_credential(
  p_user_id uuid, p_connection_id uuid, p_revision integer,
  p_ciphertext text, p_account_label text, p_previous_ciphertext text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.swarm_user_connections set ciphertext = p_ciphertext, account_label = p_account_label
    where id = p_connection_id and user_id = p_user_id and revision = p_revision
      and (p_previous_ciphertext is null or ciphertext = p_previous_ciphertext);
  return found;
end;
$$;

create function public.swarm_user_key_owner(p_token_hash text) returns uuid
language sql stable security invoker set search_path = '' as $$
  select user_id from public.swarm_user_mcp_keys where token_hash = p_token_hash and revoked_at is null;
$$;

revoke all on function public.swarm_user_touch_connection(),
  public.swarm_user_begin_oauth(uuid,uuid,text,text,timestamptz),
  public.swarm_user_consume_oauth(text,text),
  public.swarm_user_save_credential(uuid,uuid,integer,text,text,text),
  public.swarm_user_key_owner(text) from public, anon, authenticated;
grant execute on function public.swarm_user_touch_connection(),
  public.swarm_user_begin_oauth(uuid,uuid,text,text,timestamptz),
  public.swarm_user_consume_oauth(text,text),
  public.swarm_user_save_credential(uuid,uuid,integer,text,text,text),
  public.swarm_user_key_owner(text) to service_role;
