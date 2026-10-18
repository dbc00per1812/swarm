// Synthetic external services for the browser test. Never use this entry point in deployment.
import { createBetaGateway } from "../../supabase/functions/mcp/beta-gateway.ts";
import { UserStore } from "../../supabase/functions/mcp/user-store.ts";

const origin = "http://127.0.0.1:4377";
const fetcher: typeof fetch = (input, init) => {
  const url = new URL(String(input));
  if (url.hostname === "api.github.com") {
    return fetch(`${origin}/fixture/github${url.pathname}`, init);
  }
  if (url.origin !== origin) {
    throw new Error("The browser test cannot contact an external service.");
  }
  return fetch(input, init);
};
const store = new UserStore({
  projectUrl: origin,
  serviceKey: "synthetic-service-role",
  encryptionKey: "a".repeat(64),
}, fetcher);
Deno.serve(
  { hostname: "127.0.0.1", port: 4378 },
  createBetaGateway(
    {
      projectUrl: origin,
      anonKey: "synthetic-anon",
      uiUrl: `${origin}/`,
      endpointUrl: `${origin}/functions/v1/mcp`,
      clients: {},
      customPolicy: { approvedHosts: [] },
    },
    store,
    fetcher,
  ),
);
