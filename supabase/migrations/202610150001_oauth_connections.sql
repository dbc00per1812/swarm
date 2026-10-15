create table public.swarm_connections (
  provider text primary key check (provider in ('github', 'slack', 'linear', 'gmail')),
  ciphertext text,
  account_label text,
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.swarm_oauth_states (
  state_hash text primary key,
  provider text not null check (provider in ('github', 'slack', 'linear', 'gmail')),
  verifier text not null,
  revision integer not null,
  expires_at timestamptz not null
);

alter table public.swarm_connections enable row level security;
alter table public.swarm_oauth_states enable row level security;
revoke all on public.swarm_connections, public.swarm_oauth_states from anon, authenticated;
grant select, insert, update, delete on public.swarm_connections, public.swarm_oauth_states to service_role;

create policy "Only the server manages connections" on public.swarm_connections
  for all to service_role using (true) with check (true);
create policy "Only the server manages authorization state" on public.swarm_oauth_states
  for all to service_role using (true) with check (true);

create function public.swarm_begin_oauth(p_state_hash text, p_provider text, p_verifier text, p_expires_at timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
declare current_revision integer;
begin
  insert into public.swarm_connections(provider) values(p_provider)
    on conflict(provider) do update set revision = swarm_connections.revision + 1
    returning revision into current_revision;
  delete from public.swarm_oauth_states where expires_at < now() or provider = p_provider;
  insert into public.swarm_oauth_states(state_hash, provider, verifier, revision, expires_at)
    values(p_state_hash, p_provider, p_verifier, current_revision, p_expires_at);
end;
$$;

create function public.swarm_disconnect(p_provider text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.swarm_connections(provider, ciphertext) values(p_provider, null)
    on conflict(provider) do update set ciphertext = null, account_label = null,
      revision = swarm_connections.revision + 1, updated_at = now();
  delete from public.swarm_oauth_states where provider = p_provider;
end;
$$;
revoke all on function public.swarm_begin_oauth(text,text,text,timestamptz), public.swarm_disconnect(text) from public, anon, authenticated;
grant execute on function public.swarm_begin_oauth(text,text,text,timestamptz), public.swarm_disconnect(text) to service_role;
