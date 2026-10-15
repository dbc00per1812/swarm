import { z } from "npm:zod@4.6.5";
import { ConnectionStore, digest } from "./connection-store.ts";
import { type Tool, UserStore } from "./user-store.ts";

export async function importLegacy(
  options: {
    projectUrl: string;
    serviceKey: string;
    encryptionKey: string;
    ownerEmail: string;
    accessToken: string;
    githubRepositories: string[];
  },
  store: UserStore,
  catalog: Tool[],
  fetcher: typeof fetch = fetch,
) {
  const status = z.object({ user_id: z.uuid(), imported: z.boolean() }).parse(
    await store.request("rpc/swarm_user_legacy_status", {
      method: "POST",
      body: JSON.stringify({ p_owner_email: options.ownerEmail }),
    }),
  );
  if (status.imported) return;
  if (options.accessToken.length < 32) {
    throw new Error("The legacy access token is required for import.");
  }
  const legacy = await new ConnectionStore(options, fetcher).connections();
  const connections = await Promise.all(
    legacy.filter((row) => row.credential).map(async (row) => {
      const id = crypto.randomUUID();
      const tools = catalog.filter((tool) =>
        tool.id.startsWith(`${row.provider}_`)
      );
      return {
        id,
        provider: row.provider,
        name: row.provider,
        ciphertext: await store.encrypt(status.user_id, id, row.credential),
        previous_ciphertext: row.ciphertext,
        previous_revision: row.revision,
        settings: row.provider === "github"
          ? { repositories: options.githubRepositories }
          : {},
        tool_catalog: tools,
        enabled_tools: tools.map((tool) => tool.id),
      };
    }),
  );
  await store.request("rpc/swarm_user_import_legacy", {
    method: "POST",
    body: JSON.stringify({
      p_owner_email: options.ownerEmail,
      p_token_hash: await digest(options.accessToken),
      p_connections: connections,
    }),
  });
}
