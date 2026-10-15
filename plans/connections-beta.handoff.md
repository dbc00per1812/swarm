# Connections beta handoff

## Current increment

All three increments are implemented. The final technical release review is
complete, including the OAuth account-linking correction. All 40 gateway tests
and 13 page tests pass. Twelve new hosted database assertions pass. See
`connections-beta.release-review.md` for the latest evidence and release limits.
The named release approval remains separate. Keep pull request 4 as a draft.

The owner approved GitHub read-only email access. Production social sign-in,
session reload, sign-out, and repeat sign-in pass. Reload restored all four
original connection cards. The original agent still reads all four services.

GitHub provides the tested free social-login path. No production email sender is
configured. Email signup remains unavailable in the page.

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

All three migrations are installed and registered in remote migration history:

- `20261015191814_user_connections.sql`.
- `20261015193609_legacy_user_import.sql`.
- `20261015210000_bound_oauth_completion.sql`.

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
- `POST /v1/connections/:id/authorize` returns
  `{ authorizationUrl, completionSecret }`.
- `POST /v1/oauth/complete` requires the initiating session, provider, state,
  code, and browser verifier. The public callback only returns to the website.
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
`/disconnect/:provider` browser routes are no longer supported. Provider
callbacks remain at `/callback/:provider` and return to `callback.html`.

## Custom destination restriction

The deployed approved host is `mcp.deepwiki.com`. A hosted DeepWiki discovery
and `read_wiki_structure` call passed through Swarm. Use `/config` to show
supported hosts in the form. Reject unapproved hosts with a useful message.

The runtime checks DNS before each request and rejects private IPv4 results. It
rejects redirects and changes to the endpoint URL. It cannot pin the DNS result
to the TLS request. Keep the approved host list until that control is available.
Do not claim support for arbitrary public servers.

## Verification

- `deno task test`: 40 passing tests, including the existing 20 tests.
- `deno task check`, `deno lint`, and formatting checks pass.
- Hosted Postgres: 26 storage assertions, 12 import assertions, and 12 bound
  OAuth completion assertions pass.
- `npm test`: 13 passing page tests.
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

## Increment 3 state

- GitHub Pages serves the new website from `gh-pages` deployment commit
  `5fe41b88ee9607b3186f6208304a2d83c9ed63d8`.
- The production gateway is active at version 14.
- Build with `npm ci` and `npm test`. Publish the six files listed in
  `docs/mcp-poc.md`, including both browser bundles.
- Supabase GitHub Auth is enabled with the existing private client pair. The
  GitHub app retains its service callback and adds `/auth/v1/callback`.
- Slack public distribution and Linear public availability are enabled. Actual
  installation in another workspace remains untested.
- Gmail remains a testing application. The page states its restrictions.
- Two disposable users exercised session persistence, account separation, two
  authorized GitHub cards, custom discovery, tool controls, copied
  configuration, custom execution, and key revocation. Their records and private
  files were removed.
- Production again contains four personal connections, one active key, and no
  pending provider authorization states. All four original service reads pass.
- Desktop and mobile screenshots remain outside this public repository.

No implementation steps remain for the agreed beta scope. The final social
sign-in check used the existing owner's account. It did not require another
human provider account, a paid sender, or a service upgrade.

Keep the pull request as a draft until the required release review. Do not merge
without that review. Keep Claude configuration and the Muse connector unchanged.

## Release review follow-up

The final review corrected a forwarded provider-link account-linking issue.
Provider completion now requires the initiating user and a separate browser
proof. A real provider popup and subsequent agent read passed in production. The
parent page required its supported Refresh accounts control in that check.

The earlier private credential-output incident remains open. Credential rotation
has not been verified. Technical review completion does not close that incident.
The named release approver must consider this operational item.

The user authorized lightweight team functionality after this review. Continue
from the reviewed release commit on a separate branch. Use the accepted scope
and increment boundaries in the team handoff. Start a new chat after each
completed increment and continue automatically. Keep the existing release gate.
