# Connections beta facts

1. `web/` contains a static HTML, CSS, and JavaScript connection page.
2. `supabase/functions/mcp/` contains a Deno MCP gateway and provider adapters.
3. `supabase/migrations/` contains the connection schema and OAuth state
   functions.
4. `swarm_connections` currently uses `provider` as its primary key.
5. `GatewayConfig.ownerEmail` currently restricts management to one owner.
6. `AppConfig.accessToken` currently supplies one agent bearer credential.
7. `ConnectionStore` encrypts provider credentials with AES-GCM.
8. The gateway implements OAuth callbacks for GitHub, Slack, Linear, and Gmail.
9. The MCP server exposes four service read tools and `hub_status`.
10. `web/app.js` currently renders one card per provider.
11. Deno tasks are `test`, `check`, and `serve`; `deno lint` is available.
12. The runtime uses the official MCP SDK and Zod.
13. The current deployment uses Supabase and GitHub Pages.
14. The current branch is `feature/swarm-mcp-poc`; the default branch is
    `origin/main`.
15. No existing plan or repository instruction file was found in this worktree.
