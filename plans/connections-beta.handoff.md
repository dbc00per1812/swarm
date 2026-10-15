# Connections beta handoff

## Current increment

Increment 1 added user-owned connection storage. Increment 2 is the gateway.
Increment 3 is the website and release setup. The user requested a fresh chat
after each increment. Continue automatically until the complete product works.
Keep the implementation small and preserve the existing personal agent
connection.

## Completed and deployed

- Applied `supabase/migrations/20261015191814_user_connections.sql` through the
  Supabase migration API.
- Added `swarm_user_connections`, `swarm_user_oauth_states`, and
  `swarm_user_mcp_keys`.
- Added account-specific OAuth begin/consume, conditional credential save, and
  active key-owner lookup functions.
- Browser database roles cannot read these tables or call their functions.
- Legacy tables and the deployed gateway remain unchanged. All four legacy
  service reads still pass.
- New tables are empty. No credentials or accounts have been imported yet.

## Evidence

- The SQL suite failed before the new storage existed.
- All 26 checks in `supabase/tests/user_connections.test.sql` pass on actual
  Supabase Postgres.
- Each suite run uses a transaction and rolls back its fixtures, extension, and
  changes.
- Removing the credential-save ownership condition makes two checks fail.
- The existing 20 Deno tests, type check, and lint pass.
- Code and security reviews found no blockers. The database review requested an
  owner index; that index was added and approved.
- After migration, all four hosted MCP service read calls pass. Legacy storage
  still contains four connected providers.

## Storage contracts for the gateway

The complete product and API contracts remain in `connections-beta.md`.

- Every connection has an owner UUID and a stable connection UUID.
- `account_label` is available for the upstream account identity.
- `settings` is an object. Store each GitHub connection's repository allowlist
  there.
- `tool_catalog` is an array, limited to 100 entries and 256 KiB. Store upstream
  mappings and schemas there.
- `enabled_tools` is a text array. New custom connections must start with no
  enabled tools.
- Every connection UPDATE increments `revision` automatically and changes
  `updated_at` through a trigger.
- `swarm_user_begin_oauth(user_id, connection_id, state_hash, verifier, expires_at)`
  returns the new revision.
- `swarm_user_consume_oauth(state_hash, provider)` returns zero or one state
  row, including its owner and connection ID.
- `swarm_user_save_credential(user_id, connection_id, revision, ciphertext, account_label, previous_ciphertext)`
  returns a boolean.
- `swarm_user_key_owner(token_hash)` returns an owner UUID, or null for an
  unknown or revoked key.
- All functions are service-role-only and use invoker security. Validate
  identity before privileged calls.
- The storage increment does not implement the atomic legacy-import operation.
  Add a small migration if the gateway needs that transaction.
- Bind new AES-GCM ciphertext to both user UUID and connection UUID. Preserve
  old ciphertext until its import succeeds.
- Import the existing agent token hash for the verified legacy owner, then
  remove global credential fallbacks.

## Continue with increment 2

1. Read the plan and inspect the existing gateway, store, adapters, and tests.
2. Add boundary tests for two users, two accounts, tool selections, key
   revocation, and custom MCP calls.
3. Implement the user store and gateway using the current SDK and provider
   exchange code.
4. Preserve the current MCP URL, five built-in tool names, and existing agent
   token during owner-bound migration.
5. Use optional `connection_id` for built-in reads; require it when multiple
   enabled accounts match.
6. Start custom MCP connections with HTTPS, no authentication or bearer
   authentication, as the plan specifies.
7. Verify actual hosted DNS and outbound controls; use approved hosts until
   unrestricted public destinations are safe.
8. Run the required code, language, and security reviews. Commit the increment
   and test the live agent path.
9. Start a fresh chat for increment 3, with a compact handoff and no full
   conversation history.

## Access and deployment

- The actual repository is the current `feature/swarm-mcp-poc` worktree, inside
  the workspace container.
- Existing draft pull request: `https://github.com/dbc00per1812/swarm/pull/4`.
  Do not merge without the required release review.
- Private management access is saved in `~/.config/swarm/management.json`. It
  contains `projectRef` and `accessToken`.
- Private provider OAuth client pairs are in
  `~/.config/swarm/provider-credentials.json`.
- Private agent configuration is in `~/.config/swarm/mcp-connection.json`.
- These files are outside the public repository. Never print or commit their
  contents.
- The project URL follows `https://<projectRef>.supabase.co`; its deployed
  function is `/functions/v1/mcp`.
- Use the Supabase Management API with the private management credential. Do not
  depend on another chat's Node bindings.
- The local Docker daemon is unavailable, and Supabase CLI and psql are not
  installed.
- SQL tests were executed through `/v1/projects/<ref>/database/query` using
  their rollback transaction.
- Management responses expose only the last SELECT. The SQL suite raises an
  exception when any pgTAP result fails.
- The new migration is registered in remote migration history. The older
  personal migration predates that history.
- Do not run `db reset` against the hosted project.
- No paid service or upgrade is authorized. Signup still needs a production
  email sender or a free social-login setup.
- Slack and Linear distribution still need checking for other workspaces. Gmail
  remains a testing application.

## Release completion

Finish the existing Connections page, not an agent dashboard. Prove signup,
persistent sessions, two accounts, per-connection tool controls, custom MCP
calls, and saved agent setup. Use actual browser and MCP checks. Report provider
restrictions accurately rather than claiming unrestricted public access.
