import { z } from "npm:zod@4.6.5";
import { ApiError, type UserStore } from "./user-store.ts";

const canonicalBase64 = (value: string) => {
  try {
    return value.length % 4 === 0 && btoa(atob(value)) === value;
  } catch {
    return false;
  }
};
const envelope = z.object({
  format: z.literal(1),
  iterations: z.literal(600000),
  salt: z.string().regex(/^[A-Za-z0-9+/]{22}==$/).refine(canonicalBase64),
  iv: z.string().regex(/^[A-Za-z0-9+/]{16}$/).refine(canonicalBase64),
  ciphertext: z.string().min(24).max(1048576).regex(/^[A-Za-z0-9+/]+={0,2}$/)
    .refine(canonicalBase64),
  revision: z.number().int().min(0).max(999999999),
}).strict();

export function createVaultRoutes(store: UserStore) {
  return async (
    path: string,
    request: Request,
    user: string,
    input: (request: Request) => Promise<unknown>,
  ): Promise<{ body: unknown; status: number } | null> => {
    if (path !== "/v1/vault") return null;
    const identity = z.uuid().safeParse(user);
    if (!identity.success) throw new ApiError("Sign in to Swarm.", 401);
    if (request.method === "GET") {
      const result = z.array(
        envelope.omit({ revision: true }).extend({
          revision: z.number().int().positive(),
        }),
      ).max(1).safeParse(
        await store.request(
          `swarm_vaults?user_id=eq.${identity.data}&select=format,iterations,salt,iv,ciphertext,revision`,
        ),
      );
      if (!result.success) {
        throw new ApiError("Vault storage is unavailable.", 503);
      }
      return { body: { vault: result.data[0] || null }, status: 200 };
    }
    if (request.method !== "POST" && request.method !== "PUT") {
      throw new ApiError("Vault operation not found.", 405);
    }
    const parsed = envelope.safeParse(await input(request));
    if (!parsed.success) throw new ApiError("Invalid encrypted vault.", 400);
    const value = await store.request("rpc/swarm_vault_save", {
      method: "POST",
      body: JSON.stringify({ p_user_id: identity.data, p_input: parsed.data }),
    });
    const failure = z.object({
      status: z.union([z.literal(400), z.literal(401), z.literal(409)]),
      error: z.string().max(160),
    }).safeParse(value);
    if (failure.success) {
      throw new ApiError(failure.data.error, failure.data.status);
    }
    const saved = z.object({ revision: z.number().int().positive() }).safeParse(
      value,
    );
    if (!saved.success || saved.data.revision !== parsed.data.revision + 1) {
      throw new ApiError("Vault storage is unavailable.", 503);
    }
    return {
      body: { vault: { ...parsed.data, revision: saved.data.revision } },
      status: 200,
    };
  };
}
