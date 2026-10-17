-- Additive Gmail consent storage. Deploy before the gateway that requires it.
-- Rollback: retain the table and keep Gmail blocked until a reviewed replacement exists.
create table public.swarm_gmail_approvals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.swarm_user_connections(id) on delete cascade,
  key_hash text not null references public.swarm_user_mcp_keys(token_hash) on delete cascade,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  revision integer not null check (revision >= 0),
  ciphertext text check (char_length(ciphertext) between 1 and 4096),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp()+interval '10 minutes'),
  approved_at timestamptz,
  consumed_at timestamptz,
  denied_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at+interval '11 minutes'),
  check (consumed_at is null or approved_at is not null),
  check (denied_at is null or approved_at is null)
);
create index swarm_gmail_approvals_user on public.swarm_gmail_approvals(user_id,expires_at);
create index swarm_gmail_approvals_connection on public.swarm_gmail_approvals(connection_id);
create index swarm_gmail_approvals_key on public.swarm_gmail_approvals(key_hash);
alter table public.swarm_gmail_approvals enable row level security;
revoke all on public.swarm_gmail_approvals from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.swarm_gmail_approvals to service_role;
create policy "The server manages Gmail approvals" on public.swarm_gmail_approvals
  for all to service_role using (true) with check (true);

-- Browser identity and agent identity are verified separately by the gateway.
-- This function checks current key, connection, and team permissions again.
create function public.swarm_gmail_approval(p_user_id uuid,p_id uuid,p_action text,p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  item public.swarm_gmail_approvals;
  connection public.swarm_user_connections;
  key_hash text;
begin
  if p_action='create' then
    -- Serialize the per-user pending-request limit across keys and function instances.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
    if (select count(*) from public.swarm_gmail_approvals where user_id=p_user_id
      and expires_at>clock_timestamp() and consumed_at is null and denied_at is null)>=20 then
      return 'false'::jsonb;
    end if;
    key_hash := p_input->>'key_hash';
    select * into connection from public.swarm_team_connections(p_user_id,(p_input->>'connection_id')::uuid);
    if not found or connection.kind<>'native' or connection.provider<>'gmail' or connection.ciphertext is null
      or connection.revision<>(p_input->>'revision')::integer or not 'gmail_search'=any(connection.enabled_tools) then
      return 'false'::jsonb;
    end if;
    if not exists(select 1 from public.swarm_user_mcp_keys k where k.user_id=p_user_id
      and k.token_hash=key_hash and k.revoked_at is null) then return 'false'::jsonb; end if;
    insert into public.swarm_gmail_approvals(id,user_id,connection_id,key_hash,request_hash,revision,ciphertext)
      values(p_id,p_user_id,connection.id,key_hash,p_input->>'request_hash',connection.revision,p_input->>'ciphertext');
    -- Acquire parent foreign-key locks before cleanup. Never wait on another request's cleanup rows.
    with expired as (
      select id from public.swarm_gmail_approvals
      where user_id=p_user_id and expires_at<=clock_timestamp() and ciphertext is not null
      order by id for update skip locked
    )
    update public.swarm_gmail_approvals a set ciphertext=null from expired e where a.id=e.id;
    return 'true'::jsonb;
  end if;
  select * into item from public.swarm_gmail_approvals where id=p_id and user_id=p_user_id for update;
  -- The target is locked first. Cleanup skips records held by concurrent removal or approval.
  with expired as (
    select id from public.swarm_gmail_approvals
    where user_id=p_user_id and expires_at<=clock_timestamp() and ciphertext is not null
    order by id for update skip locked
  )
  update public.swarm_gmail_approvals a set ciphertext=null from expired e where a.id=e.id;
  if item.id is null or item.expires_at<=clock_timestamp() then return 'null'::jsonb; end if;
  if not exists(select 1 from public.swarm_user_mcp_keys k where k.user_id=p_user_id
    and k.token_hash=item.key_hash and k.revoked_at is null) then return 'null'::jsonb; end if;
  select * into connection from public.swarm_team_connections(p_user_id,item.connection_id);
  if not found or connection.kind<>'native' or connection.provider<>'gmail' or connection.ciphertext is null
    or connection.revision<>item.revision or not 'gmail_search'=any(connection.enabled_tools) then
    return 'null'::jsonb;
  end if;
  if p_action='get' then return to_jsonb(item); end if;
  if item.consumed_at is not null or item.denied_at is not null then return 'false'::jsonb; end if;
  if p_action='consume' then
    if item.approved_at is null or item.key_hash is distinct from p_input->>'key_hash'
      or item.request_hash is distinct from p_input->>'request_hash' then return 'false'::jsonb; end if;
    update public.swarm_gmail_approvals set consumed_at=clock_timestamp(),ciphertext=null where id=item.id;
    return 'true'::jsonb;
  end if;
  if item.approved_at is not null then return 'false'::jsonb; end if;
  if p_action='approve' then
    update public.swarm_gmail_approvals set approved_at=clock_timestamp() where id=item.id;
    return 'true'::jsonb;
  elsif p_action='deny' then
    update public.swarm_gmail_approvals set denied_at=clock_timestamp(),ciphertext=null where id=item.id;
    return 'true'::jsonb;
  end if;
  return 'false'::jsonb;
end;
$$;
revoke all on function public.swarm_gmail_approval(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.swarm_gmail_approval(uuid,uuid,text,jsonb) to service_role;
