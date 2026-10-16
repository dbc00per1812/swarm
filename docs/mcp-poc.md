# Swarm Connections beta

Swarm connects user accounts to one authenticated MCP endpoint. Each user
controls their own connections, tools, repository settings, and agent keys.

The website uses GitHub Pages. Supabase provides authentication, encrypted
credential storage, and the Deno gateway. The beta uses the existing free
services.

## Website and authentication

The `web/` directory contains the static website. Build it with Node.js:

```sh
npm ci
npm test
```

Publish `.nojekyll`, `index.html`, `styles.css`, `callback.html`,
`gmail-data.html`, `dist/app.js`, and `dist/callback.js` from `web/`. Keep the
`dist/` directory in the published output. The build bundles the pinned Supabase
browser client. Generated files stay outside the source branch. GitHub Pages
serves the `gh-pages` branch.

The prepared Google site-verification file is `web/googledfccf295f08c8741.html`.
Publish it only after the operator approves this verification attempt. Keep its
original bytes and filename.

Set `SWARM_UI_URL`, the Supabase Auth site URL, and its redirect allowlist to
the website URL. Configure GitHub in Supabase Auth for account creation and
sign-in. Add `https://<project-ref>.supabase.co/auth/v1/callback` to the GitHub
OAuth app. Keep the separate service connection callback described below.

GitHub sign-in requests read-only email access. The browser client uses PKCE,
which binds authorization to the initiating browser. Supabase stores and
refreshes the browser session. Sign-out removes the session from that browser.

Existing confirmed email accounts can use password sign-in. The page does not
offer email signup while the production email sender is unavailable. The
built-in Supabase sender is unsuitable for public signup.

## Account controls

Each saved account has its own card. Users can add accounts, rename them,
authorize or reconnect them, remove them, and select tools. Removing a
connection deletes its saved credentials and pending authorization. It does not
revoke the application at the provider.

GitHub accounts have separate public repository allowlists. Enter one
`owner/repo` value per line in Account settings. Empty lists grant no repository
access.

| Service | Built-in tool               | Provider restriction                                              |
| ------- | --------------------------- | ----------------------------------------------------------------- |
| GitHub  | `github_list_pull_requests` | Selected public repositories only.                                |
| Slack   | `slack_search`              | Workspace installation and user `search:read` approval.           |
| Linear  | `linear_list_issues`        | Workspace installation and `read` approval.                       |
| Gmail   | `gmail_search`              | Approved Google test users only while the app remains in testing. |

Slack distribution and Linear public availability are enabled. Workspace
administrators can still restrict installation. Neither setting proves an
installation in another workspace.

Google test authorizations can expire after seven days. Gmail is not verified
for general distribution. Existing personal connections remain available.

The website includes a Gmail data-use notice and access-removal instructions.
This technical notice does not replace the operator's complete privacy policy.
See `docs/integrations/google-gmail-oauth.md` for public verification
requirements.

## Custom MCP servers

The beta accepts HTTPS Streamable HTTP MCP servers on approved hosts. The
deployed host list contains `mcp.deepwiki.com`. Arbitrary public hosts are
unavailable.

Users supply a URL, name, and optional bearer token. Discovery starts with no
enabled tools. Users must select tools explicitly. Rediscovery or credential
replacement clears the selections. Endpoint changes require removal and
creation.

Custom tools retain upstream capabilities. They can change data. The page shows
the upstream read-only annotation when supplied, but the annotation is not a
security guarantee.

The gateway checks DNS, rejects private destinations and redirects, and applies
deadlines and response limits. The runtime cannot pin DNS results to TLS
requests. Keep `SWARM_CUSTOM_MCP_HOSTS` restricted until that control is
available.

## Agent setup

Create a key in Connect an agent. Copy the token or JSON configuration, or save
the configuration file. Raw tokens appear only during the current page session.
The configuration includes the `Bearer` prefix.

Use an MCP client that supports HTTP and custom Authorization headers. All
agents with one user's key share that user's enabled connections and tools.
Agent OAuth, organizations, billing, and an activity dashboard are outside this
beta.

This browser saves key IDs and creation times for revocation. It does not save
raw agent tokens. Other browsers cannot retrieve those IDs through the current
API. If metadata storage fails, revoke the new key before leaving the page.

`hub_status` reports connection IDs, names, and tool selections. Built-in reads
accept `connection_id`. Multiple matching accounts require an explicit ID.
Disabled tools disappear from discovery and fail when called directly.
Revocation rejects the key's next request.

## Gateway setup and checks

Apply all migrations in `supabase/migrations/` before deploying `mcp`. Set
`verify_jwt: false`; the gateway validates browser sessions and agent keys
itself.

The required server settings are `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ANON_KEY`, `SWARM_UI_URL`, and `SWARM_ENCRYPTION_KEY`. The encryption
key contains 32 random bytes encoded as 64 hexadecimal characters. Keep
credentials in Supabase secrets. Never include them in source files or command
arguments.

Register provider callbacks at
`https://<project-ref>.supabase.co/functions/v1/mcp/callback/<provider>`. Use
`github`, `slack`, `linear`, or `gmail` for `<provider>`. Configure each
`SWARM_<PROVIDER>_CLIENT_ID` and `SWARM_<PROVIDER>_CLIENT_SECRET` pair on the
server.

A provider callback returns its code and state to the website without saving
credentials. The website completes authorization through an authenticated API
request. Completion requires the initiating user and a browser proof stored
before provider navigation. A forwarded provider link cannot supply that proof.
The server consumes valid state once and checks the connection revision.

Legacy owner settings support the one-time import only. An import marker
prevents later cold starts from restoring deleted connections or revoked keys.
The production gateway does not use global service credential fallbacks.

Run these checks from the repository root:

```sh
deno task test
deno task check
deno lint supabase/functions/mcp web/app.js web/callback.js web/tests
npm test
npm audit --audit-level=high
```

The automated suites cover ownership, OAuth races, custom destinations, tool
permissions, session changes, and browser storage failures. Hosted browser
checks remain separate evidence. See the gateway and website verification
reports under `plans/`.

## References

- [Supabase GitHub sign-in](https://supabase.com/docs/guides/auth/social-login/auth-github)
- [Supabase email sender configuration](https://supabase.com/docs/guides/auth/auth-smtp)
- [Slack distribution](https://docs.slack.dev/app-management/distribution/)
- [Linear OAuth applications](https://linear.app/developers/oauth-app-manifests)
- [Google testing restrictions](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)
