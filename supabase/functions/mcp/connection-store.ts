import { z } from "npm:zod@4.6.5";

export const providerSchema = z.enum(["github", "slack", "linear", "gmail"]);
export type Provider = z.infer<typeof providerSchema>;
export const credentialSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
  scope: z.string().optional(),
});
export type Credential = z.infer<typeof credentialSchema>;
const rowSchema = z.object({
  provider: providerSchema,
  ciphertext: z.string().nullable(),
  account_label: z.string().nullable(),
  revision: z.number().int(),
});
const stateSchema = z.object({
  state_hash: z.string(),
  provider: providerSchema,
  verifier: z.string(),
  expires_at: z.string(),
  revision: z.number().int(),
});

function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
function unbase64(text: string) {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

export class ConnectionStore {
  constructor(
    private options: {
      projectUrl: string;
      serviceKey: string;
      encryptionKey: string;
    },
    private fetcher: typeof fetch = fetch,
  ) {}

  private async key() {
    if (!/^[a-f0-9]{64}$/i.test(this.options.encryptionKey)) {
      throw new Error("Credential encryption is not configured.");
    }
    const bytes = Uint8Array.from(
      this.options.encryptionKey.match(/../g)!,
      (pair) => parseInt(pair, 16),
    );
    return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  }

  private async request(path: string, init: RequestInit = {}) {
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
      throw new Error("Connection storage is unavailable.");
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) as unknown : null;
  }

  async connections() {
    const rows = z.array(rowSchema).parse(
      await this.request(
        "swarm_connections?select=provider,ciphertext,account_label,revision",
      ),
    );
    return await Promise.all(rows.map(async (row) => {
      let credential: Credential | null = null;
      if (row.ciphertext) {
        const [iv, ciphertext] = row.ciphertext.split(".");
        const decoded = await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: unbase64(iv),
            additionalData: new TextEncoder().encode(row.provider),
          },
          await this.key(),
          unbase64(ciphertext),
        );
        credential = credentialSchema.parse(
          JSON.parse(new TextDecoder().decode(decoded)),
        );
      }
      return {
        provider: row.provider,
        accountLabel: row.account_label,
        revision: row.revision,
        ciphertext: row.ciphertext,
        credential,
      };
    }));
  }

  async save(
    provider: Provider,
    credential: Credential | null,
    accountLabel: string | null = null,
    revision?: number,
    previousCiphertext?: string | null,
  ) {
    if (!credential) {
      await this.request("rpc/swarm_disconnect", {
        method: "POST",
        body: JSON.stringify({ p_provider: provider }),
      });
      return;
    }
    if (revision === undefined) {
      throw new Error("A connection revision is required.");
    }
    let ciphertext: string | null = null;
    if (credential) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
          additionalData: new TextEncoder().encode(provider),
        },
        await this.key(),
        new TextEncoder().encode(JSON.stringify(credential)),
      );
      ciphertext = `${base64(iv)}.${base64(new Uint8Array(encoded))}`;
    }
    const saved = await this.request(
      `swarm_connections?provider=eq.${provider}&revision=eq.${revision}` +
        (previousCiphertext
          ? `&ciphertext=eq.${encodeURIComponent(previousCiphertext)}`
          : ""),
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          provider,
          ciphertext,
          account_label: accountLabel,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (!Array.isArray(saved) || saved.length !== 1) {
      throw new Error("The connection changed. Start again from Swarm.");
    }
  }

  async begin(state: string, provider: Provider, verifier: string) {
    await this.request("rpc/swarm_begin_oauth", {
      method: "POST",
      body: JSON.stringify({
        p_state_hash: await digest(state),
        p_provider: provider,
        p_verifier: verifier,
        p_expires_at: new Date(Date.now() + 600_000).toISOString(),
      }),
    });
  }

  async consume(state: string, provider: Provider) {
    const rows = z.array(stateSchema).parse(
      await this.request(
        `swarm_oauth_states?state_hash=eq.${await digest(
          state,
        )}&provider=eq.${provider}`,
        { method: "DELETE", headers: { Prefer: "return=representation" } },
      ),
    );
    if (rows.length !== 1 || Date.parse(rows[0].expires_at) <= Date.now()) {
      throw new Error("Authorization expired. Start the connection again.");
    }
    return { verifier: rows[0].verifier, revision: rows[0].revision };
  }
}

export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
