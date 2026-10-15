import { type AppConfig, createApp } from "./app.ts";
import { ConnectionStore, type Provider } from "./connection-store.ts";
import { createGateway, type GatewayConfig } from "./gateway.ts";

function configuration(): AppConfig {
  return {
    accessToken: Deno.env.get("SWARM_MCP_ACCESS_TOKEN"),
    githubToken: Deno.env.get("SWARM_GITHUB_TOKEN"),
    slackToken: Deno.env.get("SWARM_SLACK_TOKEN"),
    linearToken: Deno.env.get("SWARM_LINEAR_TOKEN"),
    gmailAccessToken: Deno.env.get("SWARM_GMAIL_ACCESS_TOKEN"),
    gmailClientId: Deno.env.get("SWARM_GMAIL_CLIENT_ID"),
    gmailClientSecret: Deno.env.get("SWARM_GMAIL_CLIENT_SECRET"),
    gmailRefreshToken: Deno.env.get("SWARM_GMAIL_REFRESH_TOKEN"),
    githubRepositories: Deno.env.get("SWARM_GITHUB_REPOSITORIES")?.split(",")
      .map((name) => name.trim()).filter(Boolean),
  };
}

if (import.meta.main) {
  const base = configuration();
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const ownerEmail = Deno.env.get("SWARM_OWNER_EMAIL");
  const uiUrl = Deno.env.get("SWARM_UI_URL");
  const encryptionKey = Deno.env.get("SWARM_ENCRYPTION_KEY");
  if (
    projectUrl && serviceKey && anonKey && ownerEmail && uiUrl && encryptionKey
  ) {
    const clients: GatewayConfig["clients"] = {};
    for (
      const provider of ["github", "slack", "linear", "gmail"] as Provider[]
    ) {
      const prefix = `SWARM_${provider.toUpperCase()}`;
      const clientId = Deno.env.get(`${prefix}_CLIENT_ID`);
      const clientSecret = Deno.env.get(`${prefix}_CLIENT_SECRET`);
      if (clientId && clientSecret) {
        clients[provider] = { clientId, clientSecret };
      }
    }
    const store = new ConnectionStore({
      projectUrl,
      serviceKey,
      encryptionKey,
    });
    Deno.serve(
      createGateway({
        ...base,
        projectUrl,
        anonKey,
        ownerEmail,
        uiUrl,
        endpointUrl: `${projectUrl}/functions/v1/mcp`,
        clients,
      }, store),
    );
  } else {
    // Local tool development remains available without the hosted connection page.
    Deno.serve(createApp(base));
  }
}
