# Swarm Connections beta

Base: `feature/swarm-mcp-poc` at `aaefef71b7f2955bc7f13efa3f3de0b134fa0d6b`.
Default branch: `origin/main`. Planning only; no deployment is part of this
change.

## Product

People need one place to connect their accounts and choose the tools their
agents can use. Swarm will provide signup and one Connections page, using the
current gateway and hosting.

```text
Sign up → Connections
            ├─ Add account → approve → name account → select tools
            ├─ Add custom MCP → URL + authentication → select tools
            └─ Connect an agent → copy URL + private token
                                      ↓
                             One Swarm MCP endpoint
                                      ↓
                         This user's enabled connections

Current limits: one owner and one account per provider ← replace these limits
```

## Assumptions and scope

- Preserve the working personal connections and the existing agent setup.
  [facts:7–9; r1-method#3]
- All agents using one user's credential share that user's enabled connections
  and tools.
- Keep read tools for the four built-in services. Custom tools retain their
  upstream capabilities and labels.
- Keep GitHub repository selection on each GitHub connection; retain
  public-repository access for this beta.
- Start custom connections with public HTTPS Streamable HTTP MCP servers using
  no authentication or a bearer token.
- Additional custom authentication schemes, including OAuth, can follow after
  that path works.
- Keep Supabase, Deno, the official MCP SDK, and the static website.
  [facts:1–3,12–13; r1-method#19]
- Separate agent permissions, organizations, billing, a marketplace, and an
  activity dashboard are outside this release.
- The plan uses the user's existing requirements; it does not require another
  product interview.

## Method

Extend the connection model, then route every tool call through one connection
resolver. [r1-method#5–6] Use an additive migration so the working personal
setup remains usable during the change. [r1-method#3–4] Use Supabase Auth for
signup and session handling; keep provider credentials behind the gateway.
[r2-supabase#1–3,9] No code generator removes the remaining work: storage,
gateway behavior, and the page each need a small change set. [facts:1–10]

## Three build steps

### 1. User-owned connections

Ownership: database schema under `supabase/migrations/` and database tests under
`supabase/tests/`. These paths form one database context; no other step changes
them. Branch suffix: `connections-data`.

- Add stable connection IDs, user ownership, names, tool selections, and custom
  MCP configuration. [facts:3–4; r2-supabase#11]
- Add a table for hashed Swarm access tokens, their owners, and revocation
  state. [facts:6; C1]
- Bind OAuth state and revision checks to the user and connection, including
  simultaneous accounts for one provider. [facts:7–8; C1]
- Preserve existing ciphertext until the gateway can import it for the confirmed
  current owner. [facts:7; r1-method#3–4]
- Keep credential tables inaccessible to browser database clients. Use explicit
  ownership filters in every privileged server query. [r2-supabase#4,9–11]

Done: database tests prove that adding or reconnecting one account cannot
replace another account's credentials. [C1; r2-supabase#19–20] Contract check:
`supabase test db` against a disposable local or preview database; never reset
the live project.

### 2. One endpoint for each user's connections

Ownership: `supabase/functions/mcp/`. Branch suffix: `connections-gateway`.

- Replace the fixed owner check with validated Supabase user identity. [facts:5;
  r2-supabase#1–3]
- Resolve MCP bearer credentials to a user; reject revoked or unknown
  credentials. [facts:6; C2]
- Keep existing built-in tool names and add optional `connection_id` selection.
  [facts:9; C3]
- Enforce enabled tools during discovery and again before execution.
  [r1-method#5–6; C3]
- Discover and call selected custom MCP tools through the official client SDK.
  [facts:12; C3]
- Generate copyable agent configuration and show a new raw token once. Never
  return saved provider credentials. [C2; r2-supabase#9]
- Import the legacy personal connections and bind the existing agent token only
  to the confirmed current owner. [facts:5–8; r1-method#3–4]

Done: two users can connect accounts and call tools through the same endpoint
without sharing data or permissions. [C1–C3] Contract check:
`deno test --allow-net=127.0.0.1 supabase/functions/mcp/connections_beta_test.ts`.

### 3. The Connections page

Ownership: `web/`. Branch suffix: `connections-web`.

- Add signup and persistent sessions using the Supabase browser client.
  [facts:1,10; r2-supabase#1–3]
- Render one card per saved account, grouped by service. [facts:4,10; C2]
- Provide Add account, Rename, Reconnect, Remove, and an expandable tool list.
  [C2]
- Add a custom MCP form with a URL, name, and optional secret input. [C2]
- Provide one Connect an agent panel with Copy token and Copy configuration
  actions. [C2]
- Label the raw token field clearly; keep `Bearer` formatting inside the
  generated configuration. [C2]
- Show useful loading, empty, expired-session, and connection-error states.
  Preserve the existing visual style. [facts:1,10]

Done: a new user can finish signup, add two accounts, disable a tool, and use
Swarm from an agent. [C2–C3] Contract check: exercise that journey in the
browser on desktop and mobile, then call the hosted endpoint from an MCP client.

## Frozen contracts

### C1. Storage — owned by step 1

`swarm_user_connections`: `id uuid`, `user_id uuid`, `kind native|mcp`,
`provider nullable`, `name`, `endpoint_url nullable`, `ciphertext nullable`,
`settings jsonb`, `tool_catalog jsonb`, `enabled_tools text[]`,
`revision integer`, `updated_at timestamptz`. Use a UUID primary key and an
index on `user_id`; do not make `(user_id, provider)` unique. [facts:4;
r1-method#4] The bounded tool catalog stores upstream names, stable exposed
names, schemas, descriptions, annotations, and the discovery time. GitHub
settings contain an explicit `repositories: string[]` allowlist. Import the
current owner's existing allowlist with that connection. New users never inherit
the legacy owner's provider credentials, repository settings, or MCP token.

`swarm_user_oauth_states`: hashed state, `user_id`, `connection_id`, verifier,
expected revision, expiry. Consume each state once. Reconnect and removal
invalidate pending states for that connection only. [facts:7–8]

`swarm_user_mcp_keys`: ID, `user_id`, SHA-256 hash of a random 32-byte token,
creation time, nullable revocation time. Keep raw tokens out of database
responses and logs. The browser receives a token only when creating it.
[facts:6; C2]

Keep the old tables during migration. The gateway imports their rows in one
transaction after confirming the legacy owner. Run this import before admitting
new users. Store the current agent token's hash as a key belonging only to that
owner. After import, resolve that token through its key record and remove the
global credential fallback. A missing or revoked key must fail authentication,
even if its old value remains in an environment variable. Re-encrypt imported
credentials with user ID and connection ID as AES-GCM additional authenticated
data. [facts:7; r1-method#3–4] Save with revision and prior-ciphertext checks,
preserving the existing reconnect and refresh protections. [facts:7–8]

### C2. Browser API — owned by step 2

All `/v1/` requests require a validated Supabase session. Derive `user_id` on
the server. No request may select its owner. Unknown and foreign connection IDs
return the same HTTP 404. [r2-supabase#1–3,9]

| Route                                | Request                                                            | Response                                     |
| ------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------- |
| `GET /v1/connections`                | None                                                               | `{ connections: Connection[], endpointUrl }` |
| `POST /v1/connections`               | `{ kind, provider?, name, settings?, endpointUrl?, bearerToken? }` | `{ connection: Connection }`                 |
| `PATCH /v1/connections/:id`          | `{ name?, settings?, enabledTools?, bearerToken? }`                | `{ connection: Connection }`                 |
| `DELETE /v1/connections/:id`         | None                                                               | HTTP 204                                     |
| `POST /v1/connections/:id/authorize` | None                                                               | `{ authorizationUrl }`                       |
| `POST /v1/connections/:id/discover`  | None                                                               | `{ tools: Tool[] }`                          |
| `POST /v1/access-keys`               | None                                                               | `{ id, token, endpointUrl, configuration }`  |
| `DELETE /v1/access-keys/:id`         | None                                                               | HTTP 204                                     |

`Connection` has `id`, `kind`, nullable `provider`, `name`, `status`, nullable
`accountLabel`, `tools`, and `enabledTools`. It also exposes safe settings,
including the GitHub repository allowlist, but no secret fields. `Tool` has
`id`, `name`, `description`, `inputSchema`, and upstream annotations where
available. Never include ciphertext or authentication fields in these objects.
Custom reconnect replaces the bearer credential through PATCH. Keep endpoint
changes as remove-and-add to avoid credential reuse across hosts. A credential
replacement invalidates its cached catalog and selections; rediscover tools and
ask the user to select them again. Default new custom tool selections to empty
until the user selects tools. Return HTTP 400 for invalid inputs, 401 for
invalid sessions, 429 for rate limits, and safe errors for upstream failures.

### C3. MCP behavior — owned by step 2

Keep the deployed MCP URL and the existing five tool names. [facts:9,13;
r1-method#3] The four built-in read tools accept optional `connection_id` in
addition to their existing inputs. If exactly one permitted account matches,
omission selects it. Multiple matches require explicit selection; never choose
an arbitrary account. `hub_status` keeps its existing provider booleans and adds
owned connection IDs, names, and enabled tool IDs. Register a built-in tool only
when at least one owned connection enables it. Recheck the selected connection
before each call.

Custom tools use stable names:
`custom_<connection UUID without hyphens>_<first 16 hex characters of SHA-256(upstream tool name)>`.
Persist the mapping and schema during discovery; labels and descriptions
identify the account and original tool. A schema or capability change requires
rediscovery and explicit selection. Never enable newly discovered tools
automatically. Custom calls use only that connection's upstream credential.
Never forward the Swarm token, browser session, or Supabase key. Reject private,
loopback, link-local, and metadata destinations, including redirect and
DNS-resolution changes. Validate the hosted runtime's DNS and request controls
before allowing arbitrary public endpoints; use an approved-host list until
then. Apply request deadlines and response-size limits. Close upstream clients
after each operation. If a custom server fails, report that connection's error
while keeping other connections available.

## Acceptance and baseline

Baseline at the base commit: `deno task test` passes 20 tests; `deno task check`
and `deno lint` exit 0. The new checks below are requirements, not claims about
the existing implementation. [facts:11; r1-method#14]

| Check                      | Proof                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Existing behavior survives | Existing Deno suite plus a live call from the already configured agent.                                         |
| A second user can start    | Signup, signout, signin, and reload preserve the correct user session.                                          |
| Account selection works    | Two accounts of one provider return distinct fixture results when explicitly selected.                          |
| User boundaries hold       | Foreign list/read/update/delete/callback/key attempts cannot reach another user's credentials or upstream API.  |
| Tool controls work         | A disabled tool disappears from discovery and fails when called directly.                                       |
| Custom MCP works           | A controlled upstream fixture supports discovery, selection, execution, timeout, and malformed-response checks. |
| Token controls work        | A newly issued key works; revocation stops its next call.                                                       |
| No temporary code survives | `! git grep -n 'TEMP(' -- supabase/functions/mcp web`                                                           |

Run the new automated boundary cases in `connections_beta_test.ts`; its command
currently exits 1 because the file does not exist. Use `supabase test db` for
actual database grants and RPC ownership checks. [r2-supabase#11,19–20] Verify
browser journeys against the assembled preview; mocked UI responses alone do not
prove signup or connection success.

## Landing and release

Build the three contexts against C1–C3. Land database, gateway, then website.
The interfaces remove build-time dependencies; the final browser and live MCP
checks require the assembled preview. An API fixture may support page work
temporarily; it cannot satisfy acceptance. The current machine reports six
available CPU slots after reservation; this plan has only three implementation
contexts.

Configure a production sign-in email sender or a tested social-login path before
opening signup. Enable provider distribution for other workspaces, and show
Gmail's test status honestly while verification proceeds. These are provider
setup tasks, not extra website features. No paid upgrade is authorized by this
plan. Keep the existing personal gateway active until migration, reconnection,
and the current agent's read checks pass.

## Review

Independent review found three contract gaps: catalog storage, custom credential
replacement, and removal of the global credential fallback. All three are now
specified above. No additional product area was required. During implementation,
deliberately remove an isolation or tool-selection guard and confirm its
boundary test fails. Use the existing test runner; no mutation-testing framework
is required. Keep the old gateway deployment until the preview passes, rather
than adding an unsafe global-token fallback. The source review and disposition
are recorded in `connections-beta.research/review.json`.

## Source references

`facts:n` refers to `connections-beta.facts.md`. `r1-method#n` refers to the
retrieved incremental-migration canon, recorded in
`connections-beta.research/r1-method.json`. `r2-supabase#n` refers to the
retrieved Supabase canon, recorded in
`connections-beta.research/r2-supabase.json`. Notebook recommendations are
guidance. The inspected repository and contracts above define the actual
implementation.

Provider release references:
[Supabase email](https://supabase.com/docs/guides/auth/auth-smtp),
[Slack distribution](https://docs.slack.dev/app-management/distribution/),
[Linear distribution](https://linear.app/developers/oauth-app-manifests),
[Google verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).
