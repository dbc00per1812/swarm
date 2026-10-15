# Personal MCP proof of concept

Swarm exposes personal service tools through one authenticated HTTP endpoint.
This proof of concept supports one owner. It uses the Supabase Free plan.

## Implemented tools

- Authenticate each request with a separate random bearer credential.
- Discover tools through the standard MCP transport.
- List GitHub pull requests from explicitly allowed repositories.
- Reject unauthorized requests before service access.
- Return service errors without credentials or response bodies.
- Search Slack messages with `search:read` permission.
- List Linear issues with an optional team filter.
- Search Gmail and return message identifiers and headers.

The endpoint uses the official MCP TypeScript SDK on Supabase Edge Functions.
Production imports include explicit package versions because the deployment
bundle has no import map. The function checks its own bearer credential, so
gateway JWT verification is disabled. This personal credential is not the
Supabase service key or account access token.

## Local checks

Install Deno 2. Run these commands from the repository root:

```sh
deno task test
deno task check
```

For local requests, supply the following environment variables:

| Variable                    | Purpose                                                         |
| --------------------------- | --------------------------------------------------------------- |
| `SWARM_MCP_ACCESS_TOKEN`    | Random endpoint credential with at least 32 characters          |
| `SWARM_GITHUB_TOKEN`        | GitHub credential with access to pull requests                  |
| `SWARM_GITHUB_REPOSITORIES` | Comma-separated repository allowlist, such as `example/project` |
| `SWARM_SLACK_TOKEN`         | Slack user token with `search:read` permission                  |
| `SWARM_LINEAR_TOKEN`        | Linear personal API key with Read permission                    |
| `SWARM_GMAIL_ACCESS_TOKEN`  | Temporary Gmail access token for a short test                   |
| `SWARM_GMAIL_CLIENT_ID`     | Google OAuth client identifier                                  |
| `SWARM_GMAIL_CLIENT_SECRET` | Google OAuth client secret                                      |
| `SWARM_GMAIL_REFRESH_TOKEN` | Gmail refresh token with `gmail.readonly` permission            |

Run `deno task serve` after you supply these values through your environment.
Never commit credentials or add them to command arguments.

## Deployment and agent connection

Set the variables as Supabase Edge Function secrets. Deploy the `mcp` function
with the Supabase CLI or Management API. Use an account personal access token
for deployment.

The endpoint address has this format:

```text
https://<project-ref>.supabase.co/functions/v1/mcp
```

Configure an MCP client with that address and this HTTP header:

```text
Authorization: Bearer <SWARM_MCP_ACCESS_TOKEN>
```

Choose a client that supports custom authorization headers. Browser origins are
rejected. Agent access does not provide an OAuth consent screen. Clients must support
the private bearer credential described above.

The `hub_status` tool reports connection availability without returning
credentials. The `github_list_pull_requests` tool accepts `owner`, `repo`,
`state`, and `limit`. `limit` defaults to 20 and cannot exceed 100.

`slack_search` accepts `query` and `limit`, with a maximum of 20 results.
`linear_list_issues` accepts optional `team` and `limit`, with a maximum of 20
results. `gmail_search` accepts `query` and `limit`, with a maximum of 10
results.

Gmail requires either a temporary access token or all three refresh credentials.
Complete refresh credentials take priority over a temporary access token.
Temporary access tokens expire. Refresh credentials obtain a new access token
for each tool call. The Google account must authorize the
`https://www.googleapis.com/auth/gmail.readonly` scope. Enable the Gmail API in
the Google Cloud project that owns the OAuth client. Google may require renewed
consent when a test authorization expires.

Missing service credentials produce explicit tool errors. Connection status
means credentials are configured. It does not prove that a provider still
accepts them.

The endpoint exposes only read operations. Provider credentials can have broader
permissions. Use the narrowest available provider permissions. Restrict access
to the endpoint credential.

## Live verification

1. Register each provider application.
2. Approve each account connection through the hosted page.
3. Verify each connection through the hosted endpoint.

Keep this version small. Public signup, write operations, organization sharing,
and paid upgrades remain outside this proof of concept.

## References

- [Supabase MCP hosting](https://supabase.com/docs/guides/ai-tools/byo-mcp)
- [Supabase function deployment API](https://supabase.com/docs/reference/api/v1-deploy-a-function)
- [GitHub pull request API](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests)

## Hosted account connections

The `web/` directory contains the owner connection page. Publish its contents
through GitHub Pages or another static host. Set `SWARM_UI_URL` to its exact URL.
Set the Supabase Auth site URL and redirect allowlist to the same URL.

Apply `supabase/migrations/202610150001_oauth_connections.sql` before deployment.
The server encrypts provider credentials with AES-GCM. Set
`SWARM_ENCRYPTION_KEY` to a random 32-byte key encoded as 64 hexadecimal characters.
Keep this key in Supabase secrets. Losing this key requires account reconnection.
The database grants connection access only to the service role.

Set `SWARM_OWNER_EMAIL` to the owner's confirmed email address. The page uses
Supabase email sign-in. It keeps the browser access token in memory and clears
it from the address bar. Reloading the page requires another sign-in.
Provider credentials never reach the browser or the calling agent.

Register one OAuth application per provider. Set each callback to
`https://<project-ref>.supabase.co/functions/v1/mcp/callback/<provider>`.
Use `github`, `slack`, `linear`, or `gmail` for `<provider>`.
Set `SWARM_<PROVIDER>_CLIENT_ID` and `SWARM_<PROVIDER>_CLIENT_SECRET` as server
secrets. Use uppercase provider names in variable names.

| Provider | Requested access | Developer setup |
| --- | --- | --- |
| GitHub | Public account and public repositories | Register an OAuth application. Keep the repository allowlist. |
| Slack | User `search:read` | Register a Slack application and its redirect URL. |
| Linear | `read` | Register an OAuth application. |
| Gmail | `gmail.readonly` | Enable Gmail API, configure consent, and register a web OAuth client. |

The owner signs in, selects **Connect**, and approves access at the provider.
The server stores credentials and refreshes expiring access tokens.
**Disconnect** removes saved credentials and cancels pending connection attempts.
It does not revoke the application at the provider.

The account connection page uses OAuth. Agent access still uses the separate
Swarm bearer credential. Agents must support an MCP endpoint with custom headers.
This preview does not provide OAuth authorization between an agent and Swarm.

The tests cover owner access, origin restrictions, encrypted storage, single-use
callbacks, Slack refresh responses, and disconnect or reconnect races.
Provider application registration and real account approval require separate
live verification. Automated tests use synthetic accounts and provider responses.
