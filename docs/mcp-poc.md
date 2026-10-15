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
rejected. This version does not provide an OAuth consent screen. It does not
support clients that require an interactive OAuth connection.

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

## Next increments

1. Authorize the remaining service connections.
2. Verify each connection through the hosted endpoint.
3. Add interactive OAuth only if the chosen agent requires it.

Keep this version small. Public signup, write operations, organization sharing,
and paid upgrades remain outside this proof of concept.

## References

- [Supabase MCP hosting](https://supabase.com/docs/guides/ai-tools/byo-mcp)
- [Supabase function deployment API](https://supabase.com/docs/reference/api/v1-deploy-a-function)
- [GitHub pull request API](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests)
