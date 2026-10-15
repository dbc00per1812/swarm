-- Add one atomic import operation. Keep legacy ciphertext for recovery.
-- Reverse through a new migration after the gateway stops using these functions.
create table public.swarm_user_legacy_import (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null,
  imported_at timestamptz not null default now()
);
alter table public.swarm_user_legacy_import enable row level security;
revoke all on public.swarm_user_legacy_import from public, anon, authenticated;
grant select, insert on public.swarm_user_legacy_import to service_role;
create policy "The server records the legacy import" on public.swarm_user_legacy_import
  for all to service_role using (true) with check (true);

create function public.swarm_user_legacy_status(p_owner_email text)
-- Read only the confirmed owner ID. Browser roles cannot execute this function.
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; imported_owner uuid;
begin
  select user_id into imported_owner from public.swarm_user_legacy_import where singleton;
  if imported_owner is not null then
    return jsonb_build_object('user_id', imported_owner, 'imported', true);
  end if;
  select id into strict owner_id from auth.users
    where lower(email) = lower(p_owner_email) and email_confirmed_at is not null;
  select user_id into imported_owner from public.swarm_user_legacy_import where singleton;
  if imported_owner is not null and imported_owner <> owner_id then
    raise exception 'The legacy owner changed.';
  end if;
  return jsonb_build_object('user_id', owner_id, 'imported', imported_owner is not null);
exception when no_data_found or too_many_rows then
  raise exception 'A unique confirmed legacy owner is required.';
end;
$$;

create function public.swarm_user_import_legacy(
  p_owner_email text, p_token_hash text, p_connections jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid; imported_owner uuid; item jsonb; legacy public.swarm_connections%rowtype;
begin
  -- Serialize cold starts and import attempts without locking unrelated user data.
  perform pg_advisory_xact_lock(733812, 1);
  select (public.swarm_user_legacy_status(p_owner_email)->>'user_id')::uuid into owner_id;
  select user_id into imported_owner from public.swarm_user_legacy_import where singleton;
  if imported_owner = owner_id then return false; end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'A legacy token hash is required.';
  end if;
  if p_connections is null or jsonb_typeof(p_connections) <> 'array' or jsonb_array_length(p_connections) > 4 then
    raise exception 'The legacy connection input is invalid.';
  end if;
  -- The legacy table has at most four rows. Block legacy reconnects during this transaction.
  lock table public.swarm_connections in share row exclusive mode;
  if jsonb_array_length(p_connections) <> (select count(*) from public.swarm_connections where ciphertext is not null)
    or (select count(distinct value->>'provider') from jsonb_array_elements(p_connections)) <> jsonb_array_length(p_connections) then
    raise exception 'The legacy connections changed.';
  end if;
  for item in select value from jsonb_array_elements(p_connections) loop
    select * into legacy from public.swarm_connections where provider = item->>'provider';
    if not found or legacy.ciphertext is null or legacy.ciphertext is distinct from item->>'previous_ciphertext'
      or legacy.revision is distinct from (item->>'previous_revision')::integer
      or item->>'ciphertext' is null then
      raise exception 'A legacy connection changed.';
    end if;
    insert into public.swarm_user_connections(
      id, user_id, kind, provider, name, ciphertext, account_label, settings, tool_catalog, enabled_tools
    ) values (
      (item->>'id')::uuid, owner_id, 'native', legacy.provider, item->>'name',
      item->>'ciphertext', legacy.account_label, coalesce(item->'settings', '{}'::jsonb),
      item->'tool_catalog', array(select jsonb_array_elements_text(item->'enabled_tools'))
    );
  end loop;
  insert into public.swarm_user_mcp_keys(user_id, token_hash) values(owner_id, p_token_hash);
  insert into public.swarm_user_legacy_import(singleton, user_id) values(true, owner_id);
  return true;
end;
$$;
revoke all on function public.swarm_user_legacy_status(text), public.swarm_user_import_legacy(text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.swarm_user_legacy_status(text), public.swarm_user_import_legacy(text,text,jsonb)
  to service_role;
