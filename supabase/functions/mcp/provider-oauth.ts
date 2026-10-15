import { z } from "npm:zod@4.6.5";
import { limitedBody } from "./app.ts";
import type { Credential, Provider } from "./connection-store.ts";
export interface OAuthConfig {
  endpointUrl: string;
  clients: Partial<
    Record<Provider, { clientId: string; clientSecret: string }>
  >;
}
export const providers: Provider[] = ["github", "slack", "linear", "gmail"];
const authorizeEndpoints: Record<Provider, string> = {
  github: "https://github.com/login/oauth/authorize",
  slack: "https://slack.com/oauth/v2/authorize",
  linear: "https://linear.app/oauth/authorize",
  gmail: "https://accounts.google.com/o/oauth2/v2/auth",
};
const tokenEndpoints: Record<Provider, string> = {
  github: "https://github.com/login/oauth/access_token",
  slack: "https://slack.com/api/oauth.v2.access",
  linear: "https://api.linear.app/oauth/token",
  gmail: "https://oauth2.googleapis.com/token",
};
const scopes: Record<Provider, string> = {
  github: "",
  slack: "search:read",
  linear: "read",
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
};
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.number().positive().optional(),
  scope: z.union([z.string(), z.array(z.string())]).optional(),
});

export function random() {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function challenge(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll(
    "/",
    "_",
  ).replaceAll("=", "");
}

export function providerOAuth(
  config: OAuthConfig,
  fetcher: typeof fetch = fetch,
) {
  async function json(url: string, init: RequestInit = {}) {
    const response = await fetcher(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("The service rejected the request.");
    }
    return JSON.parse(
      new TextDecoder().decode(await limitedBody(response.body, 256_000)),
    ) as unknown;
  }

  async function exchange(
    provider: Provider,
    parameters: Record<string, string>,
  ) {
    const client = config.clients[provider];
    if (!client) throw new Error("This service is not configured.");
    const data = await json(tokenEndpoints[provider], {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: client.clientId,
        client_secret: client.clientSecret,
        ...parameters,
      }).toString(),
    });
    const effective =
      provider === "slack" && parameters.grant_type !== "refresh_token"
        ? z.object({ ok: z.literal(true), authed_user: tokenSchema }).parse(
          data,
        )
          .authed_user
        : tokenSchema.parse(data);
    const scope = Array.isArray(effective.scope)
      ? effective.scope.join(" ")
      : effective.scope;
    return {
      accessToken: effective.access_token,
      refreshToken: effective.refresh_token,
      scope,
      expiresAt: effective.expires_in
        ? Date.now() + effective.expires_in * 1000
        : undefined,
    } satisfies Credential;
  }

  async function label(provider: Provider, credential: Credential) {
    const headers = {
      Authorization: `Bearer ${credential.accessToken}`,
      "User-Agent": "swarm-mcp",
    };
    if (provider === "github") {
      return z.object({ login: z.string() }).parse(
        await json("https://api.github.com/user", { headers }),
      ).login;
    }
    if (provider === "gmail") {
      return z.object({ emailAddress: z.string() }).parse(
        await json("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers,
        }),
      ).emailAddress;
    }
    if (provider === "linear") {
      const data = z.object({
        data: z.object({ viewer: z.object({ name: z.string() }) }),
      }).parse(
        await json("https://api.linear.app/graphql", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            query: "query SwarmViewer { viewer { name } }",
          }),
        }),
      );
      return data.data.viewer.name;
    }
    const data = z.object({ ok: z.literal(true), team: z.string() }).parse(
      await json("https://slack.com/api/auth.test", {
        method: "POST",
        headers,
      }),
    );
    return data.team;
  }

  async function authorization(
    provider: Provider,
    state: string,
    verifier: string,
  ) {
    const client = config.clients[provider];
    if (!client) throw new Error("This service is not configured.");
    const url = new URL(authorizeEndpoints[provider]);
    const params = {
      client_id: client.clientId,
      redirect_uri: `${config.endpointUrl}/callback/${provider}`,
      state,
      response_type: "code",
      [provider === "slack" ? "user_scope" : "scope"]: scopes[provider],
    };
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    if (provider !== "slack") {
      url.searchParams.set("code_challenge", await challenge(verifier));
      url.searchParams.set("code_challenge_method", "S256");
    }
    if (provider === "gmail") {
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
    }
    return url.toString();
  }
  return { exchange, label, authorization, scopes };
}
