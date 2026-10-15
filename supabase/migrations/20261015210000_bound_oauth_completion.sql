-- Add an owner and browser-bound completion path without changing stored credentials.
-- Rollback requires a forward migration after the gateway stops using this function.
create function public.swarm_user_complete_oauth(
  p_user_id uuid, p_state_hash text, p_provider text, p_verifier text
) returns setof public.swarm_user_oauth_states
language sql security invoker set search_path = '' as $$
  delete from public.swarm_user_oauth_states as s using public.swarm_user_connections as c
    where s.state_hash = p_state_hash and s.user_id = p_user_id and s.verifier = p_verifier
      and s.connection_id = c.id and s.user_id = c.user_id
      and c.kind = 'native' and c.provider = p_provider
      and c.revision = s.revision and s.expires_at > now()
    returning s.*;
$$;
revoke all on function public.swarm_user_complete_oauth(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.swarm_user_complete_oauth(uuid,text,text,text) to service_role;
