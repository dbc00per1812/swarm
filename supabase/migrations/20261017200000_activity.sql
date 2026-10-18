-- Tool activity stores fixed metadata. It never stores tool arguments or provider content.
create table public.swarm_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key_id uuid not null,
  connection_id uuid,
  tool_id text check (tool_id is null or length(tool_id) between 1 and 100),
  outcome text not null check (outcome in ('allowed','denied','failed','approval_required')),
  reason text not null check (reason in ('execution_started','completed','tool_unavailable','connection_required',
    'resource_denied','permission_changed','provider_failed','approval_required')),
  created_at timestamptz not null default now(),
  check (
    (outcome = 'allowed' and reason in ('execution_started','completed')) or
    (outcome = 'denied' and reason in ('tool_unavailable','connection_required','resource_denied','permission_changed')) or
    (outcome = 'failed' and reason = 'provider_failed') or
    (outcome = 'approval_required' and reason = 'approval_required')
  )
);
create index swarm_activity_owner_time on public.swarm_activity(user_id,created_at desc,id desc);
alter table public.swarm_activity enable row level security;
revoke all on public.swarm_activity from public,anon,authenticated,service_role;
grant select,insert,update on public.swarm_activity to service_role;
create policy "The server reads tool activity" on public.swarm_activity
  for select to service_role using (true);
create policy "The server records tool activity" on public.swarm_activity
  for insert to service_role with check (true);
create policy "The server completes tool activity" on public.swarm_activity
  for update to service_role using (true) with check (true);

create function public.swarm_finish_activity() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.reason <> 'execution_started' or new.reason = 'execution_started'
    or new.id is distinct from old.id or new.user_id is distinct from old.user_id
    or new.key_id is distinct from old.key_id or new.connection_id is distinct from old.connection_id
    or new.tool_id is distinct from old.tool_id or new.created_at is distinct from old.created_at then
    raise exception 'Activity metadata cannot change';
  end if;
  return new;
end;
$$;
create trigger swarm_finish_activity before update on public.swarm_activity
  for each row execute function public.swarm_finish_activity();
revoke all on function public.swarm_finish_activity() from public,anon,authenticated;

-- Each insert removes that owner's records older than 30 days.
-- Inactive owners need scheduled maintenance for a fixed storage retention limit.
create function public.swarm_prune_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.swarm_activity
    where user_id = new.user_id and created_at < now() - interval '30 days';
  return new;
end;
$$;
create trigger swarm_prune_activity before insert on public.swarm_activity
  for each row execute function public.swarm_prune_activity();
revoke all on function public.swarm_prune_activity() from public,anon,authenticated;
