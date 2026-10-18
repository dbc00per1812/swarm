-- Personal vault content remains encrypted in the browser.
-- A forward migration is required to remove storage after vault routes stop.
create table public.swarm_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  format integer not null check (format = 1),
  iterations integer not null check (iterations = 600000),
  salt text not null check (salt ~ '^[A-Za-z0-9+/]{22}==$'),
  iv text not null check (iv ~ '^[A-Za-z0-9+/]{16}$'),
  ciphertext text not null check (char_length(ciphertext) between 24 and 1048576 and ciphertext ~ '^[A-Za-z0-9+/]+={0,2}$'),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);
-- Audit records contain identifiers, times, and revisions. They contain no vault content.
create table public.swarm_vault_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null check (action in ('create','update')),
  revision integer not null,
  created_at timestamptz not null default now()
);
create index swarm_vault_audit_actor on public.swarm_vault_audit(actor_id,created_at);
alter table public.swarm_vaults enable row level security;
alter table public.swarm_vault_audit enable row level security;
revoke all on public.swarm_vaults, public.swarm_vault_audit from public,anon,authenticated,service_role;
grant select,insert,update on public.swarm_vaults to service_role;
grant select,insert on public.swarm_vault_audit to service_role;
create policy "The server manages encrypted vaults" on public.swarm_vaults
  for all to service_role using (true) with check (true);
create policy "The server reads vault audit" on public.swarm_vault_audit
  for select to service_role using (true);
create policy "The server records vault audit" on public.swarm_vault_audit
  for insert to service_role with check (true);

-- Only the authenticated gateway can supply a verified owner ID.
create function public.swarm_vault_save(p_user_id uuid,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_revision integer;
  next_revision integer;
begin
  if p_user_id is null then
    return jsonb_build_object('error','Sign in to Swarm.','status',401);
  end if;
  if jsonb_typeof(p_input) is distinct from 'object'
    or (p_input->>'format') is distinct from '1'
    or (p_input->>'iterations') is distinct from '600000'
    or not coalesce(p_input->>'revision' ~ '^[0-9]{1,9}$',false)
    or not coalesce(p_input->>'salt' ~ '^[A-Za-z0-9+/]{22}==$',false)
    or not coalesce(p_input->>'iv' ~ '^[A-Za-z0-9+/]{16}$',false)
    or not coalesce(p_input->>'ciphertext' ~ '^[A-Za-z0-9+/]+={0,2}$',false)
    or coalesce(char_length(p_input->>'ciphertext'),0) not between 24 and 1048576
    or p_input - array['format','iterations','revision','salt','iv','ciphertext'] <> '{}'::jsonb
  then return jsonb_build_object('error','Invalid encrypted vault.','status',400); end if;
  -- The per-owner lock also serializes the first insert.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select revision into current_revision from public.swarm_vaults where user_id=p_user_id for update;
  if coalesce(current_revision,0)<>(p_input->>'revision')::integer then
    return jsonb_build_object('error','The vault changed in another session. Lock and unlock it before you save.','status',409);
  end if;
  next_revision := coalesce(current_revision,0)+1;
  insert into public.swarm_vaults(user_id,format,iterations,salt,iv,ciphertext,revision)
    values(p_user_id,1,600000,p_input->>'salt',p_input->>'iv',p_input->>'ciphertext',next_revision)
    on conflict(user_id) do update set salt=excluded.salt,iv=excluded.iv,ciphertext=excluded.ciphertext,
      revision=excluded.revision,updated_at=clock_timestamp();
  insert into public.swarm_vault_audit(actor_id,action,revision)
    values(p_user_id,case when current_revision is null then 'create' else 'update' end,next_revision);
  return jsonb_build_object('revision',next_revision);
end;
$$;
revoke all on function public.swarm_vault_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.swarm_vault_save(uuid,jsonb) to service_role;
