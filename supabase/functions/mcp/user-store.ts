import { z } from "npm:zod@4.6.5";
import {
  credentialSchema,
  digest,
  providerSchema,
} from "./connection-store.ts";
import { limitedBody } from "./app.ts";

export const toolSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(128),
  upstreamName: z.string().max(128).optional(),
  description: z.string().max(4096),
  inputSchema: z.record(z.string(), z.unknown()),
  annotations: z.object({
    title: z.string().max(128).optional(),
    readOnlyHint: z.boolean().optional(),
    destructiveHint: z.boolean().optional(),
    idempotentHint: z.boolean().optional(),
    openWorldHint: z.boolean().optional(),
  }).optional(),
});
export type Tool = z.infer<typeof toolSchema>;
export const connectionSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  kind: z.enum(["native", "mcp"]),
  provider: providerSchema.nullable(),
  name: z.string(),
  endpoint_url: z.string().nullable(),
  ciphertext: z.string().nullable(),
  account_label: z.string().nullable(),
  settings: z.record(z.string(), z.unknown()),
  tool_catalog: z.array(toolSchema),
  enabled_tools: z.array(z.string()),
  revision: z.number().int(),
});
export type Connection = z.infer<typeof connectionSchema>;
export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
export const notFound = () => new ApiError("Connection not found.", 404);

export class UserStore {
  constructor(
    private options: {
      projectUrl: string;
      serviceKey: string;
      encryptionKey: string;
    },
    private fetcher: typeof fetch = fetch,
  ) {}

  async request(path: string, init: RequestInit = {}) {
    const response = await this.fetcher(
      `${this.options.projectUrl}/rest/v1/${path}`,
      {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          apikey: this.options.serviceKey,
          Authorization: `Bearer ${this.options.serviceKey}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiError("Connection storage is unavailable.", 503);
    }
    const bytes = await limitedBody(response.body, 4_000_000);
    return bytes.length
      ? JSON.parse(new TextDecoder().decode(bytes)) as unknown
      : null;
  }
  private path(user: string, id?: string) {
    z.uuid().parse(user);
    if (id) z.uuid().parse(id);
    return `swarm_user_connections?user_id=eq.${user}` +
      (id ? `&id=eq.${id}` : "");
  }
  async list(user: string) {
    return z.array(connectionSchema).parse(await this.request(this.path(user)));
  }
  async get(user: string, id: string) {
    const rows = z.array(connectionSchema).parse(
      await this.request(this.path(user, id)),
    );
    if (rows.length !== 1) throw notFound();
    return rows[0];
  }
  async create(user: string, values: Partial<Connection>) {
    z.uuid().parse(user);
    const rows = z.array(connectionSchema).parse(
      await this.request("swarm_user_connections", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ ...values, user_id: user }),
      }),
    );
    return rows[0];
  }
  async update(row: Connection, values: Partial<Connection>) {
    const rows = z.array(connectionSchema).parse(
      await this.request(
        this.path(row.user_id, row.id) + `&revision=eq.${row.revision}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(values),
        },
      ),
    );
    if (rows.length !== 1) {
      throw new ApiError("The connection changed. Load it again.", 409);
    }
    return rows[0];
  }
  async remove(user: string, id: string) {
    const rows = await this.request(this.path(user, id), {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    });
    if (!Array.isArray(rows) || rows.length !== 1) throw notFound();
  }
  private async key() {
    if (!/^[a-f0-9]{64}$/i.test(this.options.encryptionKey)) {
      throw new ApiError("Credential encryption is unavailable.", 503);
    }
    return await crypto.subtle.importKey(
      "raw",
      Uint8Array.from(
        this.options.encryptionKey.match(/../g)!,
        (pair) => parseInt(pair, 16),
      ),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    );
  }
  async encrypt(user: string, id: string, value: unknown) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(`${user}:${id}`),
      },
      await this.key(),
      new TextEncoder().encode(JSON.stringify(value)),
    );
    return [iv, new Uint8Array(encrypted)].map((bytes) =>
      btoa(String.fromCharCode(...bytes))
    ).join(".");
  }
  async secret(row: Connection) {
    if (!row.ciphertext) return null;
    const [iv, data] = row.ciphertext.split(".").map((value) =>
      Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
    );
    const decoded = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(`${row.user_id}:${row.id}`),
      },
      await this.key(),
      data,
    );
    return credentialSchema.parse(
      JSON.parse(new TextDecoder().decode(decoded)),
    );
  }
  async saveCredential(
    row: Connection,
    value: z.infer<typeof credentialSchema>,
    label: string | null,
  ) {
    const ciphertext = await this.encrypt(row.user_id, row.id, value);
    const saved = await this.request("rpc/swarm_user_save_credential", {
      method: "POST",
      body: JSON.stringify({
        p_user_id: row.user_id,
        p_connection_id: row.id,
        p_revision: row.revision,
        p_ciphertext: ciphertext,
        p_account_label: label,
        p_previous_ciphertext: row.ciphertext,
      }),
    });
    if (saved !== true) {
      throw new ApiError("The connection changed. Start again.", 409);
    }
    return ciphertext;
  }
  async begin(row: Connection, state: string, verifier: string) {
    await this.request("rpc/swarm_user_begin_oauth", {
      method: "POST",
      body: JSON.stringify({
        p_user_id: row.user_id,
        p_connection_id: row.id,
        p_state_hash: await digest(state),
        p_verifier: verifier,
        p_expires_at: new Date(Date.now() + 600_000).toISOString(),
      }),
    });
  }
  async consume(
    user: string,
    state: string,
    provider: string,
    verifier: string,
  ) {
    const rows = z.array(z.object({
      user_id: z.uuid(),
      connection_id: z.uuid(),
      verifier: z.string(),
      revision: z.number(),
    })).parse(
      await this.request("rpc/swarm_user_complete_oauth", {
        method: "POST",
        body: JSON.stringify({
          p_user_id: z.uuid().parse(user),
          p_state_hash: await digest(state),
          p_provider: provider,
          p_verifier: verifier,
        }),
      }),
    );
    if (rows.length !== 1) {
      throw new ApiError("Authorization expired. Start again.");
    }
    return rows[0];
  }
  async owner(token: string) {
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) return null;
    return z.uuid().nullable().parse(
      await this.request("rpc/swarm_user_key_owner", {
        method: "POST",
        body: JSON.stringify({ p_token_hash: await digest(token) }),
      }),
    );
  }
  async issue(user: string, token: string) {
    const rows = z.array(z.object({ id: z.uuid() })).parse(
      await this.request("swarm_user_mcp_keys", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: z.uuid().parse(user),
          token_hash: await digest(token),
        }),
      }),
    );
    return rows[0].id;
  }
  async revoke(user: string, id: string) {
    const rows = await this.request(
      `swarm_user_mcp_keys?user_id=eq.${z.uuid().parse(user)}&id=eq.${
        z.uuid().parse(id)
      }`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ revoked_at: new Date().toISOString() }),
      },
    );
    if (!Array.isArray(rows) || rows.length !== 1) throw notFound();
  }
}
