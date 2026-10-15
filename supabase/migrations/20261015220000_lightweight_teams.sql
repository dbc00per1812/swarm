-- Additive team storage. Personal credential ownership remains unchanged.
-- Reversal requires a forward migration after team routes stop using this storage.
create table public.swarm_organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create index swarm_organizations_owner on public.swarm_organizations(owner_id);
create table public.swarm_team_memberships (
  organization_id uuid not null references public.swarm_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index swarm_team_memberships_user on public.swarm_team_memberships(user_id);
-- A deferred reference permits atomic creation and cascading organization deletion.
alter table public.swarm_organizations add constraint swarm_organizations_owner_membership
  foreign key (id,owner_id) references public.swarm_team_memberships(organization_id,user_id)
  deferrable initially deferred;
create table public.swarm_team_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.swarm_organizations(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '24 hours'),
  used_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at+interval '24 hours')
);
create index swarm_team_invitations_organization on public.swarm_team_invitations(organization_id);
create table public.swarm_team_grants (
  organization_id uuid not null,
  connection_id uuid not null,
  connection_owner_id uuid not null,
  tool_ids text[] not null check (cardinality(tool_ids) between 1 and 100 and array_position(tool_ids,null) is null),
  primary key (organization_id,connection_id),
  foreign key (organization_id,connection_owner_id)
    references public.swarm_team_memberships(organization_id,user_id) on delete cascade,
  foreign key (connection_id,connection_owner_id)
    references public.swarm_user_connections(id,user_id) on delete cascade
);
create index swarm_team_grants_connection on public.swarm_team_grants(connection_id,connection_owner_id);
create index swarm_team_grants_member on public.swarm_team_grants(organization_id,connection_owner_id);
-- Audit rows retain identifiers after deletion. They contain no names, tokens, or credentials.
create table public.swarm_team_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  organization_id uuid not null,
  action text not null check (action in ('create','delete','invite','revoke_invite','accept','remove_member','share','unshare')),
  target_id uuid,
  created_at timestamptz not null default now()
);
create index swarm_team_audit_organization on public.swarm_team_audit(organization_id,created_at);
alter table public.swarm_organizations enable row level security;
alter table public.swarm_team_memberships enable row level security;
alter table public.swarm_team_invitations enable row level security;
alter table public.swarm_team_grants enable row level security;
alter table public.swarm_team_audit enable row level security;
revoke all on public.swarm_organizations, public.swarm_team_memberships, public.swarm_team_invitations,
  public.swarm_team_grants, public.swarm_team_audit from public, anon, authenticated, service_role;
grant select,insert,update,delete on public.swarm_organizations, public.swarm_team_memberships,
  public.swarm_team_invitations, public.swarm_team_grants to service_role;
grant select,insert on public.swarm_team_audit to service_role;
create policy "The server manages organizations" on public.swarm_organizations
  for all to service_role using (true) with check (true);
create policy "The server manages memberships" on public.swarm_team_memberships
  for all to service_role using (true) with check (true);
create policy "The server manages invitations" on public.swarm_team_invitations
  for all to service_role using (true) with check (true);
create policy "The server manages grants" on public.swarm_team_grants
  for all to service_role using (true) with check (true);
create policy "The server reads team audit" on public.swarm_team_audit for select to service_role using (true);
create policy "The server records team audit" on public.swarm_team_audit for insert to service_role with check (true);

-- The gateway supplies the verified user ID. Browser roles cannot execute this function.
-- Every organization write locks its organization before its invitation or connection.
create function public.swarm_team_manage(
  p_user_id uuid, p_action text, p_organization_id uuid default null, p_input jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  org public.swarm_organizations;
  invitation public.swarm_team_invitations;
  connection public.swarm_user_connections;
  result jsonb;
  target uuid;
  tools text[];
  member boolean;
begin
  if p_user_id is null then return jsonb_build_object('error','Sign in to Swarm.','status',401); end if;
  if p_action = 'create' then
    if p_input->>'name' is null or char_length(btrim(p_input->>'name')) not between 1 and 100 then
      return jsonb_build_object('error','Use an organization name with 1 to 100 characters.','status',400);
    end if;
    insert into public.swarm_organizations(owner_id,name) values(p_user_id,btrim(p_input->>'name')) returning * into org;
    insert into public.swarm_team_memberships(organization_id,user_id) values(org.id,p_user_id);
    result := jsonb_build_object('id',org.id,'name',org.name,'role','owner');
  elsif p_action = 'list' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,
      'role',case when o.owner_id=p_user_id then 'owner' else 'member' end) order by o.created_at,o.id)
      from public.swarm_organizations o join public.swarm_team_memberships m on m.organization_id=o.id
      where m.user_id=p_user_id),'[]'::jsonb);
  elsif p_action in ('preview','accept') then
    -- The initial lookup obtains only the lock key. Recheck after locking the organization.
    select organization_id into target from public.swarm_team_invitations where token_hash=p_input->>'tokenHash';
    select * into org from public.swarm_organizations where id=target for update;
    select * into invitation from public.swarm_team_invitations
      where token_hash=p_input->>'tokenHash' and organization_id=org.id
      and used_at is null and revoked_at is null and expires_at>clock_timestamp() for update;
    if not found then return jsonb_build_object('error','Invitation not found or expired.','status',404); end if;
    if p_action='preview' then return jsonb_build_object('id',org.id,'name',org.name); end if;
    if exists(select 1 from public.swarm_team_memberships where organization_id=org.id and user_id=p_user_id) then
      return jsonb_build_object('error','You already belong to this organization.','status',409);
    end if;
    insert into public.swarm_team_memberships(organization_id,user_id) values(org.id,p_user_id);
    update public.swarm_team_invitations set used_at=clock_timestamp() where id=invitation.id;
    target := invitation.id;
    result := jsonb_build_object('id',org.id,'name',org.name,'role','member');
  else
    select * into org from public.swarm_organizations where id=p_organization_id for update;
    member := exists(select 1 from public.swarm_team_memberships where organization_id=org.id and user_id=p_user_id);
    if org.id is null or not member then return jsonb_build_object('error','Organization not found.','status',404); end if;
    if p_action='detail' then
      return jsonb_build_object('id',org.id,'name',org.name,
        'role',case when org.owner_id=p_user_id then 'owner' else 'member' end,
        'members',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,
          'role',case when m.user_id=org.owner_id then 'owner' else 'member' end) order by m.joined_at,m.user_id)
          from public.swarm_team_memberships m where m.organization_id=org.id),'[]'::jsonb),
        'invitations',case when org.owner_id=p_user_id then coalesce((select jsonb_agg(jsonb_build_object(
          'id',i.id,'expiresAt',i.expires_at,'usedAt',i.used_at,'revokedAt',i.revoked_at) order by i.created_at,i.id)
          from public.swarm_team_invitations i where i.organization_id=org.id),'[]'::jsonb) else '[]'::jsonb end,
        'shares',coalesce((select jsonb_agg(jsonb_build_object('connectionId',c.id,'ownerId',g.connection_owner_id,
          'name',c.name,'kind',c.kind,'provider',c.provider,'toolIds',g.tool_ids,
          'tools',(select coalesce(jsonb_agg(t),'[]'::jsonb) from jsonb_array_elements(c.tool_catalog) t
            where t->>'id'=any(g.tool_ids) and t->>'id'=any(c.enabled_tools))))
          from public.swarm_team_grants g join public.swarm_user_connections c on c.id=g.connection_id and c.user_id=g.connection_owner_id
          where g.organization_id=org.id),'[]'::jsonb));
    elsif p_action in ('delete','invite','revoke_invite') then
      if org.owner_id<>p_user_id then return jsonb_build_object('error','The organization owner must do this.','status',403); end if;
      if p_action='delete' then
        delete from public.swarm_organizations where id=org.id;
      elsif p_action='invite' then
        insert into public.swarm_team_invitations(organization_id,token_hash)
          values(org.id,p_input->>'tokenHash') returning * into invitation;
        target := invitation.id;
        result := jsonb_build_object('id',invitation.id,'expiresAt',invitation.expires_at);
      else
        target := (p_input->>'invitationId')::uuid;
        update public.swarm_team_invitations set revoked_at=clock_timestamp()
          where id=target and organization_id=org.id and used_at is null and revoked_at is null;
        if not found then return jsonb_build_object('error','Invitation not found.','status',404); end if;
      end if;
    elsif p_action='remove_member' then
      target := (p_input->>'userId')::uuid;
      if org.owner_id<>p_user_id and target<>p_user_id then
        return jsonb_build_object('error','The organization owner must do this.','status',403);
      end if;
      if target=org.owner_id then return jsonb_build_object('error','Delete your organization before you leave.','status',409); end if;
      delete from public.swarm_team_memberships where organization_id=org.id and user_id=target;
      if not found then return jsonb_build_object('error','Member not found.','status',404); end if;
    elsif p_action in ('share','unshare') then
      target := (p_input->>'connectionId')::uuid;
      select * into connection from public.swarm_user_connections where id=target and user_id=p_user_id for update;
      if not found then return jsonb_build_object('error','Connection not found.','status',404); end if;
      if p_action='unshare' then
        delete from public.swarm_team_grants where organization_id=org.id and connection_id=target and connection_owner_id=p_user_id;
      else
        if jsonb_typeof(p_input->'toolIds') is distinct from 'array' then
          return jsonb_build_object('error','Select enabled tools from this connection.','status',400);
        end if;
        select array_agg(distinct value) into tools from jsonb_array_elements_text(p_input->'toolIds');
        if tools is null or cardinality(tools)>100 or array_position(tools,null) is not null
          or not tools <@ connection.enabled_tools
          or exists(select 1 from unnest(tools) t where not exists(
            select 1 from jsonb_array_elements(connection.tool_catalog) c where c->>'id'=t))
          or (connection.kind='native' and connection.ciphertext is null) then
          return jsonb_build_object('error','Select enabled tools from a connected account.','status',400);
        end if;
        insert into public.swarm_team_grants(organization_id,connection_id,connection_owner_id,tool_ids)
          values(org.id,target,p_user_id,tools)
          on conflict(organization_id,connection_id) do update set tool_ids=excluded.tool_ids;
        result := jsonb_build_object('connectionId',target,'toolIds',tools);
      end if;
    else
      return jsonb_build_object('error','Team operation not found.','status',404);
    end if;
  end if;
  insert into public.swarm_team_audit(actor_id,organization_id,action,target_id) values(p_user_id,org.id,p_action,target);
  return coalesce(result,'{}'::jsonb);
end;
$$;
revoke all on function public.swarm_team_manage(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.swarm_team_manage(uuid,text,uuid,jsonb) to service_role;
