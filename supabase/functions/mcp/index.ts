import type { Provider } from "./connection-store.ts";
import {
  type BetaConfig,
  createBetaGateway,
  nativeCatalog,
} from "./beta-gateway.ts";
import { importLegacy } from "./legacy-import.ts";
import { UserStore } from "./user-store.ts";

if (import.meta.main) {
  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const uiUrl = Deno.env.get("SWARM_UI_URL");
  const encryptionKey = Deno.env.get("SWARM_ENCRYPTION_KEY");
  if (!projectUrl || !serviceKey || !anonKey || !uiUrl || !encryptionKey) {
    throw new Error("The gateway configuration is incomplete.");
  }
  const clients: BetaConfig["clients"] = {};
  for (const provider of ["github", "slack", "linear", "gmail"] as Provider[]) {
    const prefix = `SWARM_${provider.toUpperCase()}`;
    const clientId = Deno.env.get(`${prefix}_CLIENT_ID`);
    const clientSecret = Deno.env.get(`${prefix}_CLIENT_SECRET`);
    if (clientId && clientSecret) {
      clients[provider] = { clientId, clientSecret };
    }
  }
  const store = new UserStore({ projectUrl, serviceKey, encryptionKey });
  await importLegacy(
    {
      projectUrl,
      serviceKey,
      encryptionKey,
      ownerEmail: Deno.env.get("SWARM_OWNER_EMAIL") ?? "",
      accessToken: Deno.env.get("SWARM_MCP_ACCESS_TOKEN") ?? "",
      githubRepositories: (Deno.env.get("SWARM_GITHUB_REPOSITORIES") ?? "")
        .split(",").map((s) => s.trim()).filter(Boolean),
    },
    store,
    await nativeCatalog(),
  );
  Deno.serve(createBetaGateway({
    projectUrl,
    anonKey,
    uiUrl,
    clients,
    endpointUrl: Deno.env.get("SWARM_ENDPOINT_URL") ??
      `${projectUrl}/functions/v1/mcp`,
    customPolicy: {
      approvedHosts: (Deno.env.get("SWARM_CUSTOM_MCP_HOSTS") ?? "").split(",")
        .map((s) => s.trim()).filter(Boolean),
    },
  }, store));
}
