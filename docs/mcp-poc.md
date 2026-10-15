# Personal MCP proof of concept

Swarm exposes personal service tools through one authenticated HTTP endpoint.
This proof of concept supports one owner. It uses the Supabase Free plan.

## First increment

- Authenticate each request with a separate random bearer credential.
- Discover tools through the standard MCP transport.
- List GitHub pull requests from explicitly allowed repositories.
- Reject unauthorized requests before service access.
- Return service errors without credentials or response bodies.

The endpoint uses the official MCP TypeScript SDK on Supabase Edge Functions.
The function checks its own bearer credential, so gateway JWT verification is
disabled. This personal credential is not the Supabase service key or account
access token.

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

## Next increments

1. Add Slack search, Linear issue listing, and Gmail search.
2. Verify live service access through the hosted endpoint.
3. Document the observed result and any required account approval.

Keep this version small. Public signup, write operations, organization sharing,
and paid upgrades remain outside this proof of concept.

## References

- [Supabase MCP hosting](https://supabase.com/docs/guides/ai-tools/byo-mcp)
- [Supabase function deployment API](https://supabase.com/docs/reference/api/v1-deploy-a-function)
- [GitHub pull request API](https://docs.github.com/en/rest/pulls/pulls#list-pull-requests)
