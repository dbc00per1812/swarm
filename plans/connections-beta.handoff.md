# Connections beta handoff

## Current increment

Increments 1 and 2 are complete, deployed, and verified. Increment 3 must finish
the Connections website and release setup. The user requested a fresh chat after
each increment. Continue automatically until the complete product works.

The user also requested a default model correction. The local Codex
configuration now uses `model = "gpt-6.1-sol"`. The previous value was
`gpt-6-sol.1`. The configuration parses successfully. Claude configuration
remains unchanged.

## Repository

- Worktree: `/Users/darragh/SWARM/.wt-swarm-mcp-poc`.
- Branch: `feature/swarm-mcp-poc`. Use the latest committed state.
- The workspace root is a container, not a Git repository.
- Draft pull request: `https://github.com/dbc00per1812/swarm/pull/4`.
- This repository is public. Never print or commit private credentials or
  account identities. Keep Claude configuration unchanged.
- The complete product contracts remain in `plans/connections-beta.md`.
- Review results and evidence are in `plans/connections-beta.gateway-review.md`.

## Deployed gateway

- Production uses `index.ts` and `beta-gateway.ts` under
  `supabase/functions/mcp/`.
- The original MCP URL, original agent token, and five tool names remain usable.
- All four imported personal service reads pass through the new gateway.
- The preview function was removed after production verification.
- `gateway.ts` retains the old implementation for its baseline regression tests.
  The production entry point does not import it or use global provider
  fallbacks.
- `provider-oauth.ts` reuses the provider exchange and identity lookup logic.
- `user-store.ts` applies owner filters, encryption, revision checks, and key
  lookup.
- `custom-mcp.ts` uses the official client SDK, bounded streams, pagination, and
  permission checks before each upstream request.

## Storage

Both migrations are installed and registered in remote migration history:

- `20261015191814_user_connections.sql`.
- `20261015193609_legacy_user_import.sql`.

The gateway imported four legacy connections in one transaction. It bound the
original token hash to the confirmed owner. Credentials use AES-GCM with the
user UUID and connection UUID as authenticated data. Legacy ciphertext remains
intact.

The import marker prevents later cold starts from restoring removed connections
or revoked keys. The restricted owner lookup uses `SECURITY DEFINER` because the
service role cannot select `auth.users`. The import function uses invoker
security. Browser roles cannot read credential tables or execute privileged
functions.

Production retains four native connections, one agent key, one import marker,
and no pending user OAuth states. All disposable test users were removed.

## Website API

The public `GET /config` route returns `projectUrl`, `anonKey`, `services`, and
`customApprovedHosts`. Every `/v1/` operation requires a valid confirmed
Supabase session in `Authorization: Bearer <access_token>`.

Use the C2 routes in the plan. All routes are implemented:

- `GET /v1/connections` returns `{ connections, endpointUrl }`.
- `POST /v1/connections` creates a native account or custom MCP connection.
- `PATCH /v1/connections/:id` changes name, GitHub settings, tool selections, or
  the custom bearer credential.
- `DELETE /v1/connections/:id` removes the account and its pending
  authorization.
- `POST /v1/connections/:id/authorize` returns `{ authorizationUrl }`.
- `POST /v1/connections/:id/discover` returns `{ tools }`.
- `POST /v1/access-keys` returns `{ id, token, endpointUrl, configuration }`.
- `DELETE /v1/access-keys/:id` revokes the key.

Create and key responses use HTTP 201. Delete responses use HTTP 204. Unknown
and foreign connection IDs return the same HTTP 404. The response exposes safe
settings and tool schemas, without stored credentials. The generated
configuration includes the `Bearer` prefix. Show the raw token once.

Native account inputs are `{ kind: "native", provider, name, settings? }`.
GitHub settings use `{ repositories: ["owner/repo"] }`. Each connection has its
own allowlist. New native accounts start with their single read tool enabled.

Custom inputs are `{ kind: "mcp", name, endpointUrl, bearerToken? }`. Custom
connections start with no enabled tools. Discovery also clears selections. A
bearer replacement clears the catalog and selections. An empty bearer removes
upstream authentication. Endpoint changes require removal and creation.

Use `connection.tools`, `connection.enabledTools`, and tool `id` values for
controls. Use optional `connection_id` in built-in reads. Multiple permitted
accounts require explicit selection. Custom tools have stable names defined by
C3 in the plan.

The old `/signin`, `/connections`, `/connect/:provider`, and
`/disconnect/:provider` browser routes are no longer supported. Update
`web/app.js` immediately. Provider callbacks remain at `/callback/:provider` and
return to `callback.html`.

## Custom destination restriction

The deployed approved host is `mcp.deepwiki.com`. A hosted DeepWiki discovery
and `read_wiki_structure` call passed through Swarm. Use `/config` to show
supported hosts in the form. Reject unapproved hosts with a useful message.

The runtime checks DNS before each request and rejects private IPv4 results. It
rejects redirects and changes to the endpoint URL. It cannot pin the DNS result
to the TLS request. Keep the approved host list until that control is available.
Do not claim support for arbitrary public servers.

## Verification

- `deno task test`: 39 passing tests, including the existing 20 tests.
- `deno task check`, `deno lint`, and formatting checks pass.
- Hosted Postgres: 26 storage assertions and 12 import assertions pass.
- Database tests use rollback transactions. Never reset the hosted database.
- Ownership and schema-ordering mutations make the relevant tests fail.
- Code, TypeScript, and security reviews found no remaining blockers.
- The live gateway passed personal reads, two-user separation, foreign
  operations, independent account authorization, key revocation, and custom tool
  controls.

## Private deployment access

All private files are outside the repository, under `~/.config/swarm/`:

- `management.json` has `projectRef` and `accessToken`.
- `provider-credentials.json` has the four provider OAuth client pairs.
- `mcp-connection.json` has the current private agent configuration.
- `increment2-ops.py` supports deployment and safe read checks. Inspect it
  before use.
- `increment2-live.py` creates disposable users, runs hosted API/custom checks,
  and removes the users. It accepts the function slug as its argument.

These operation scripts contain file paths, not embedded credentials. They read
private access files at runtime. Never print those files or raw API responses
that contain credentials or identities.

The project URL follows `https://<projectRef>.supabase.co`. The function route
is `/functions/v1/mcp`. Supabase Management API access works. Local Docker,
Supabase CLI, and `psql` are unavailable.

The deployment script uploads function files as multipart form data. Metadata
uses `entrypoint_path: "index.ts"` and `verify_jwt: false`. The gateway performs
its own MCP key and Supabase session validation. Browser API CORS permits the
configured website origin. The approved host list is stored in
`SWARM_CUSTOM_MCP_HOSTS`.

No paid purchase or upgrade is authorized.

## Finish increment 3

1. Read the plan and preserve the existing website style and hosting.
2. Finish the Connections page with persistent Supabase Auth sessions.
3. Provide signup, signin, signout, account cards, tool controls, and custom MCP
   setup.
4. Provide agent key creation, copy actions, and revocation of the created key.
5. Establish a working production email sender or tested free social login path.
6. Check Slack and Linear distribution for other workspaces. Report Gmail's
   testing restrictions accurately. Preserve all existing personal connections.
7. Deploy the website and exercise desktop and mobile browser journeys.
8. Prove persistent sessions, two accounts, tool controls, custom MCP calls, and
   saved agent setup through actual browser and MCP checks.
9. Run the required reviews, commit and push the website increment, and report
   the completed product and any provider restrictions.

Finish the Connections product. Do not expand it into an agent dashboard. Do not
end with an offer to continue or ask the user to restart the work.
