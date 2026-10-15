import { z } from "npm:zod@4.6.5";
import { type AppConfig, createApp, limitedBody, validBearer } from "./app.ts";
import {
  ConnectionStore,
  type Credential,
  type Provider,
  providerSchema,
} from "./connection-store.ts";

type ClientConfig = { clientId: string; clientSecret: string };
export interface GatewayConfig extends AppConfig {
  projectUrl: string;
  anonKey: string;
  ownerEmail: string;
  uiUrl: string;
  endpointUrl: string;
  clients: Partial<Record<Provider, ClientConfig>>;
}

const providers: Provider[] = ["github", "slack", "linear", "gmail"];
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

function random() {
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

export function createGateway(
  config: GatewayConfig,
  store: ConnectionStore,
  fetcher: typeof fetch = fetch,
) {
  const uiOrigin = new URL(config.uiUrl).origin;
  const basePath = new URL(config.endpointUrl).pathname.replace(/\/$/, "");
  const reply = (body: unknown, status = 200, cors = false) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...(cors
          ? { "Access-Control-Allow-Origin": uiOrigin, Vary: "Origin" }
          : {}),
      },
    });

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

  async function isOwner(request: Request) {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return false;
    try {
      const user = z.object({
        email: z.string(),
        email_confirmed_at: z.string(),
      }).parse(
        await json(`${config.projectUrl}/auth/v1/user`, {
          headers: { Authorization: authorization, apikey: config.anonKey },
        }),
      );
      return Boolean(config.ownerEmail) &&
        user.email.toLowerCase() === config.ownerEmail.toLowerCase();
    } catch {
      return false;
    }
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

  async function runtime(toolName?: string): Promise<AppConfig> {
    const effective: AppConfig = { ...config };
    for (const connection of await store.connections()) {
      const { provider } = connection;
      let credential = connection.credential;
      const client = config.clients[provider];
      if (
        credential && provider !== "gmail" &&
        toolName?.startsWith(provider + "_") && credential.expiresAt &&
        credential.expiresAt < Date.now() + 60_000
      ) {
        if (!credential.refreshToken || !client) {
          throw new Error("Reconnect the expired service.");
        }
        const refreshed = await exchange(provider, {
          grant_type: "refresh_token",
          refresh_token: credential.refreshToken,
        });
        credential = {
          ...refreshed,
          refreshToken: refreshed.refreshToken ?? credential.refreshToken,
        };
        await store.save(
          provider,
          credential,
          connection.accountLabel,
          connection.revision,
          connection.ciphertext,
        );
      }
      if (provider === "github") {
        effective.githubToken = credential?.accessToken;
      }
      if (provider === "slack") effective.slackToken = credential?.accessToken;
      if (provider === "linear") {
        effective.linearToken = credential
          ? `Bearer ${credential.accessToken}`
          : undefined;
      }
      if (provider === "gmail") {
        effective.gmailAccessToken = credential?.refreshToken
          ? undefined
          : credential?.accessToken;
        effective.gmailRefreshToken = credential?.refreshToken;
        effective.gmailClientId = credential?.refreshToken
          ? client?.clientId
          : undefined;
        effective.gmailClientSecret = credential?.refreshToken
          ? client?.clientSecret
          : undefined;
      }
    }
    return effective;
  }

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const routeBase = [basePath, basePath.replace(/^\/functions\/v1/, "")]
      .find((base) =>
        url.pathname === base || url.pathname.startsWith(base + "/")
      );
    if (!routeBase) {
      return reply({ error: "Not found." }, 404);
    }
    const path = url.pathname.slice(routeBase.length).replace(/\/$/, "");
    if (!path) {
      if (!validBearer(request, config.accessToken)) {
        return createApp(config, fetcher)(request);
      }
      if (request.headers.has("Origin")) {
        return reply(
          { error: "Use the connection page for browser access." },
          403,
        );
      }
      try {
        const body = await limitedBody(request.body, 32_768);
        let toolName: string | undefined;
        try {
          const parsed = JSON.parse(new TextDecoder().decode(body));
          if (
            parsed.method === "tools/call" &&
            typeof parsed.params?.name === "string"
          ) toolName = parsed.params.name;
        } catch { /* The MCP transport returns the protocol error. */ }
        const rebuilt = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          ...(request.method === "POST"
            ? { body: new Uint8Array(body).buffer }
            : {}),
        });
        return await createApp(await runtime(toolName), fetcher)(rebuilt);
      } catch {
        return reply({
          error:
            "A saved connection is unavailable. Open Swarm and reconnect the service.",
        }, 503);
      }
    }

    const origin = request.headers.get("Origin");
    if (origin && origin !== uiOrigin) {
      return reply({ error: "This browser origin is not allowed." }, 403);
    }
    const cors = origin === uiOrigin;
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": uiOrigin,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          Vary: "Origin",
        },
      });
    }
    if (path === "/config" && request.method === "GET") {
      return reply(
        {
          projectUrl: config.projectUrl,
          anonKey: config.anonKey,
          services: providers.map((provider) => ({
            provider,
            configured: Boolean(config.clients[provider]),
          })),
        },
        200,
        cors,
      );
    }

    if (path === "/signin" && request.method === "POST") {
      try {
        const input = z.object({ email: z.email().max(254) }).parse(
          JSON.parse(
            new TextDecoder().decode(await limitedBody(request.body, 1024)),
          ),
        );
        if (input.email.toLowerCase() === config.ownerEmail.toLowerCase()) {
          await json(
            `${config.projectUrl}/auth/v1/otp?redirect_to=${
              encodeURIComponent(config.uiUrl)
            }`,
            {
              method: "POST",
              headers: {
                apikey: config.anonKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email: config.ownerEmail,
                create_user: true,
              }),
            },
          );
        }
        return reply(
          {
            message:
              "If this account has access, a sign-in link is on its way.",
          },
          202,
          cors,
        );
      } catch {
        return reply(
          {
            error:
              "The sign-in link could not be sent. Check the email address and try later.",
          },
          400,
          cors,
        );
      }
    }

    const callback = path.match(/^\/callback\/(github|slack|linear|gmail)$/);
    if (callback && request.method === "GET") {
      const provider = providerSchema.parse(callback[1]);
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (!state || !code || state.length > 256 || code.length > 4096) {
        return reply({
          error:
            "Authorization was declined or expired. Start the connection again.",
        }, 400);
      }
      try {
        const { verifier, revision } = await store.consume(state, provider);
        const credential = await exchange(provider, {
          grant_type: "authorization_code",
          code,
          redirect_uri: `${config.endpointUrl}/callback/${provider}`,
          ...(provider === "slack" ? {} : { code_verifier: verifier }),
        });
        if (
          provider !== "github" &&
          !credential.scope?.split(/[ ,]+/).includes(scopes[provider])
        ) throw new Error("The required read permission was not granted.");
        if (provider === "gmail" && !credential.refreshToken) {
          throw new Error(
            "Offline access was not granted. Start the connection again.",
          );
        }
        await store.save(
          provider,
          credential,
          await label(provider, credential),
          revision,
        );
        const redirect = new URL("callback.html", config.uiUrl);
        redirect.searchParams.set("connected", provider);
        return new Response(null, {
          status: 303,
          headers: {
            Location: redirect.toString(),
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      } catch {
        return reply({
          error:
            "The connection could not be completed. Start again from Swarm.",
        }, 400);
      }
    }

    if (!await isOwner(request)) {
      return reply(
        { error: "Sign in with the Swarm owner's confirmed email account." },
        403,
        cors,
      );
    }
    try {
      if (path === "/connections" && request.method === "GET") {
        const connections = await store.connections();
        return reply(
          {
            services: providers.map((provider) => {
              const saved = connections.find((item) =>
                item.provider === provider
              );
              return {
                provider,
                configured: Boolean(config.clients[provider]),
                connected: Boolean(saved?.credential),
                accountLabel: saved?.accountLabel ?? null,
              };
            }),
            endpointUrl: config.endpointUrl,
          },
          200,
          cors,
        );
      }
      const start = path.match(/^\/connect\/(github|slack|linear|gmail)$/);
      if (start && request.method === "POST") {
        const provider = providerSchema.parse(start[1]);
        const client = config.clients[provider];
        if (!client) {
          return reply(
            {
              error:
                "The developer must register this service's OAuth application first.",
            },
            503,
            cors,
          );
        }
        const state = random();
        const verifier = random();
        await store.begin(state, provider, verifier);
        const authorizationUrl = new URL(authorizeEndpoints[provider]);
        const params = {
          client_id: client.clientId,
          redirect_uri: `${config.endpointUrl}/callback/${provider}`,
          state,
          response_type: "code",
          [provider === "slack" ? "user_scope" : "scope"]: scopes[provider],
        };
        for (const [key, value] of Object.entries(params)) {
          authorizationUrl.searchParams.set(key, value);
        }
        if (provider !== "slack") {
          authorizationUrl.searchParams.set(
            "code_challenge",
            await challenge(verifier),
          );
          authorizationUrl.searchParams.set("code_challenge_method", "S256");
        }
        if (provider === "gmail") {
          authorizationUrl.searchParams.set("access_type", "offline");
          authorizationUrl.searchParams.set("prompt", "consent");
        }
        return reply(
          { authorizationUrl: authorizationUrl.toString() },
          200,
          cors,
        );
      }
      const disconnect = path.match(
        /^\/disconnect\/(github|slack|linear|gmail)$/,
      );
      if (disconnect && request.method === "POST") {
        await store.save(providerSchema.parse(disconnect[1]), null);
        return reply({ disconnected: true }, 200, cors);
      }
      return reply({ error: "Not found." }, 404, cors);
    } catch {
      return reply(
        { error: "Connection storage is unavailable. Try again later." },
        503,
        cors,
      );
    }
  };
}
