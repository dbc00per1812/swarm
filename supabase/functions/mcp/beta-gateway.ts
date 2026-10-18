import {
  Client,
  StreamableHTTPClientTransport,
} from "npm:@modelcontextprotocol/client@2.0.0";
import { z } from "npm:zod@4.6.5";
import { type AppConfig, createApp, limitedBody } from "./app.ts";
import { type Provider, providerSchema } from "./connection-store.ts";
import {
  customOperation,
  type CustomPolicy,
  discoverCustom,
  readCustomCatalog,
  validateEndpoint,
} from "./custom-mcp.ts";
import {
  type OAuthConfig,
  providerOAuth,
  providers,
  random,
} from "./provider-oauth.ts";
import {
  ApiError,
  type Connection,
  notFound,
  type Tool,
  UserStore,
} from "./user-store.ts";

import { createTeamRoutes } from "./teams.ts";
import { GmailApprovals } from "./gmail-approvals.ts";
import { createVaultRoutes } from "./vault.ts";
import { Activity } from "./activity.ts";
import {
  grantResources,
  grantsTool,
  type KeyOptions,
  keyOptionsSchema,
  resourcesSchema,
  restrictedResources,
  scopedConnections,
} from "./access-policy.ts";

export interface BetaConfig extends OAuthConfig {
  projectUrl: string;
  anonKey: string;
  uiUrl: string;
  customPolicy: CustomPolicy;
}
const nativeIds: Record<Provider, string> = {
  github: "github_list_pull_requests",
  slack: "slack_search",
  linear: "linear_list_issues",
  gmail: "gmail_search",
};
const settingsSchema = resourcesSchema;
function validateSettings(
  provider: Provider | null,
  settings: z.infer<typeof settingsSchema>,
) {
  const allowed = provider === "github"
    ? "repositories"
    : provider === "slack"
    ? "channels"
    : provider === "linear"
    ? "teams"
    : undefined;
  if (Object.keys(settings).some((key) => key !== allowed)) {
    throw new ApiError("Use resource settings for this provider.");
  }
}
const bearerSchema = z.string().max(16_384).regex(/^[\x21-\x7e]*$/);
let catalogPromise: Promise<Tool[]> | undefined;
export function nativeCatalog() {
  return catalogPromise ??= (async () => {
    const token = random();
    const app = createApp({ accessToken: token });
    const client = new Client({ name: "swarm-catalog", version: "0.2.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL("https://catalog.invalid/mcp"),
          {
            requestInit: { headers: { Authorization: `Bearer ${token}` } },
            fetch: (input, init) => app(new Request(input, init)),
          },
        ),
      );
      return (await client.listTools()).tools.filter((tool) =>
        tool.name !== "hub_status"
      ).map((tool) => ({
        id: tool.name,
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      }));
    } finally {
      await client.close();
    }
  })();
}
const safe = (row: Connection) => ({
  id: row.id,
  kind: row.kind,
  provider: row.provider,
  name: row.name,
  status: row.kind === "mcp" || row.ciphertext ? "connected" : "disconnected",
  accountLabel: row.account_label,
  tools: row.tool_catalog,
  enabledTools: row.enabled_tools,
  settings: row.settings,
  endpointUrl: row.endpoint_url,
});
const safeAccess = (row: Connection) => ({
  id: row.id,
  kind: row.kind,
  provider: row.provider,
  name: row.name,
  status: row.kind === "mcp" || row.ciphertext ? "connected" : "disconnected",
  tools: row.tool_catalog,
  enabledTools: row.enabled_tools,
});
// Postgres jsonb can reorder schema properties between discovery and execution.
function canonical(value: unknown) {
  return JSON.stringify(
    value,
    (_key, node) =>
      node && typeof node === "object" && !Array.isArray(node)
        ? Object.fromEntries(
          Object.keys(node).sort().map((key) => [key, node[key]]),
        )
        : node,
  );
}
const toolError = (id: unknown, message: string | Record<string, unknown>) =>
  Response.json({
    jsonrpc: "2.0",
    id: id ?? null,
    result: {
      isError: true,
      content: [{
        type: "text",
        text: JSON.stringify(
          typeof message === "string" ? { error: message } : message,
        ),
      }],
    },
  }, { headers: { "Cache-Control": "no-store" } });

export function createBetaGateway(
  config: BetaConfig,
  store: UserStore,
  fetcher: typeof fetch = fetch,
) {
  const oauth = providerOAuth(config, fetcher);
  const teams = createTeamRoutes(store, config.uiUrl);
  const vaultRoutes = createVaultRoutes(store);
  const gmailApprovals = new GmailApprovals(store, config.uiUrl);
  const activity = new Activity(store);
  const origin = new URL(config.uiUrl).origin;
  const base = new URL(config.endpointUrl).pathname.replace(/\/$/, "");
  const counts = new Map<string, { until: number; count: number }>();
  function rate(key: string, max: number) {
    const now = Date.now();
    if (counts.size > 5000) {
      for (const [id, value] of counts) {
        if (value.until < now) counts.delete(id);
      }
    }
    const value = counts.get(key);
    if (!value || value.until < now) {
      counts.set(key, { until: now + 60_000, count: 1 });
      return;
    }
    if (++value.count > max) {
      throw new ApiError("Too many requests. Try again later.", 429);
    }
  }
  const reply = (value: unknown, status = 200, cors = false) =>
    new Response(
      status === 204 ? null : JSON.stringify(value),
      {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          ...(cors
            ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
            : {}),
        },
      },
    );
  async function identity(request: Request) {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new ApiError("Sign in to Swarm.", 401);
    }
    const response = await fetcher(`${config.projectUrl}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: config.anonKey },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiError("Sign in to Swarm.", 401);
    }
    const user = z.object({
      id: z.uuid(),
      email_confirmed_at: z.string().min(1),
    }).safeParse(
      JSON.parse(
        new TextDecoder().decode(await limitedBody(response.body, 32_768)),
      ),
    );
    if (!user.success) {
      throw new ApiError("Confirm your account and sign in.", 401);
    }
    return user.data.id;
  }
  async function input(request: Request) {
    const maximum = new URL(request.url).pathname.endsWith("/v1/vault")
      ? 1_050_000
      : 32_768;
    if (
      !request.headers.get("Content-Type")?.toLowerCase().startsWith(
        "application/json",
      )
    ) throw new ApiError("Use application/json.", 415);
    try {
      return JSON.parse(
        new TextDecoder().decode(await limitedBody(request.body, maximum)),
      );
    } catch {
      throw new ApiError("Use a JSON request within the request size limit.");
    }
  }
  async function nativeRuntime(
    row: Connection,
    authorize: () => Promise<unknown>,
    settings = settingsSchema.parse(row.settings),
  ): Promise<AppConfig> {
    const effective: AppConfig = {};
    let credential = await store.secret(row);
    const provider = row.provider!;
    if (!credential) throw new ApiError("Reconnect this account.");
    if (credential.expiresAt && credential.expiresAt < Date.now() + 60_000) {
      if (!credential.refreshToken) {
        throw new ApiError("Reconnect the expired account.");
      }
      const refreshOAuth = providerOAuth(config, async (url, init) => {
        await authorize();
        return await fetcher(url, init);
      });
      const refreshed = await refreshOAuth.exchange(provider, {
        grant_type: "refresh_token",
        refresh_token: credential.refreshToken,
      });
      credential = {
        ...refreshed,
        refreshToken: refreshed.refreshToken ?? credential.refreshToken,
      };
      row.ciphertext = await store.saveCredential(
        row,
        credential,
        row.account_label,
        true,
      );
      row.revision++;
    }
    if (provider === "github") {
      effective.githubToken = credential.accessToken;
      effective.githubRepositories = settings.repositories ?? [];
    }
    if (provider === "slack") {
      effective.slackToken = credential.accessToken;
      effective.slackChannels = settings.channels;
    }
    if (provider === "linear") {
      effective.linearToken = `Bearer ${credential.accessToken}`;
      effective.linearTeams = settings.teams;
    }
    if (provider === "gmail") {
      effective.gmailAccessToken = credential.accessToken;
    }
    return effective;
  }
  async function mcp(request: Request) {
    if (request.headers.has("Origin")) {
      return reply(
        { error: "Use the Connections page for browser access." },
        403,
      );
    }
    const token = request.headers.get("Authorization")?.match(
      /^Bearer ([A-Za-z0-9_-]+)$/,
    )?.[1];
    const authenticated = token ? await store.accessKey(token) : null;
    if (!authenticated) {
      return reply({ error: "Authentication required." }, 401);
    }
    const key = authenticated;
    const user = key.user_id;
    rate(`mcp:${user}`, 120);
    if (request.method !== "POST") return reply({ error: "Use POST." }, 405);
    const body = await input(request);
    const allRows = await store.accessible(user);
    const rows = scopedConnections(key, allRows);
    let permissionChanged = false;
    async function authorize(row: Connection, toolId: string) {
      const currentKey = await store.accessKey(token!);
      if (
        !currentKey || currentKey.user_id !== user ||
        !grantsTool(currentKey, row.id, toolId) ||
        canonical(grantResources(currentKey, row.id)) !==
          canonical(grantResources(key, row.id))
      ) {
        permissionChanged = true;
        throw new ApiError("This agent key no longer permits this tool.", 403);
      }
      try {
        return await store.permitted(user, row, toolId);
      } catch (error) {
        permissionChanged = true;
        throw error;
      }
    }
    let selected: Connection | undefined;
    let effective: AppConfig = {};
    const name = body?.method === "tools/call" ? body.params?.name : undefined;
    let attempt: string | undefined;
    const knownTool =
      typeof name === "string" && Object.values(nativeIds).includes(name)
        ? name
        : allRows.flatMap((row) => row.tool_catalog).find((tool) =>
          tool.id === name
        )?.id ?? null;
    const denied = async (
      reason: "connection_required" | "tool_unavailable" | "resource_denied",
      row?: Connection,
    ) => {
      await activity.record(
        user,
        key.id,
        row?.id ?? null,
        knownTool,
        "denied",
        reason,
      );
    };
    if (
      typeof name === "string" && name !== "hub_status" &&
      name.startsWith("custom_")
    ) {
      selected = rows.find((row) =>
        row.kind === "mcp" && row.enabled_tools.includes(name)
      );
      if (!selected) {
        const attempted = allRows.find((row) =>
          row.kind === "mcp" &&
          row.tool_catalog.some((tool) => tool.id === name)
        );
        await denied("tool_unavailable", attempted);
        return reply({
          jsonrpc: "2.0",
          id: body.id ?? null,
          error: { code: -32602, message: "Tool not found." },
        });
      }
      attempt = await activity.record(
        user,
        key.id,
        selected.id,
        knownTool,
        "allowed",
        "execution_started",
      );
    }
    if (
      typeof name === "string" && name !== "hub_status" &&
      !name.startsWith("custom_")
    ) {
      const matches = rows.filter((row) =>
        row.kind === "native" && row.ciphertext && row.provider &&
        nativeIds[row.provider] === name && row.enabled_tools.includes(name) &&
        row.tool_catalog.some((tool) => tool.id === name)
      );
      const id = body.params?.arguments?.connection_id;
      selected = id
        ? matches.find((row) => row.id === id)
        : matches.length === 1
        ? matches[0]
        : undefined;
      if (!selected) {
        const attempted = id
          ? allRows.find((row) =>
            row.id === id && row.tool_catalog.some((tool) => tool.id === name)
          )
          : undefined;
        await denied(
          matches.length > 1 && !id
            ? "connection_required"
            : "tool_unavailable",
          attempted,
        );
        return toolError(
          body.id,
          matches.length > 1 && !id
            ? "Select an account with connection_id."
            : "This tool or connection is unavailable.",
        );
      }
      const row = selected;
      const resources = restrictedResources(key, row);
      const args = body.params?.arguments;
      const resourceDenied = name === "github_list_pull_requests"
        ? !resources.repositories?.some((repository) =>
          repository.toLowerCase() ===
            `${args?.owner}/${args?.repo}`.toLowerCase()
        )
        : name === "slack_search"
        ? resources.channels?.length === 0
        : name === "linear_list_issues"
        ? resources.teams?.length === 0 ||
          (resources.teams !== undefined && args?.team !== undefined &&
            !resources.teams.includes(args.team))
        : false;
      if (resourceDenied) {
        await denied("resource_denied", row);
        return toolError(
          body.id,
          "This resource is outside the agent's allowed scope.",
        );
      }
      attempt = await activity.record(
        user,
        key.id,
        row.id,
        knownTool,
        "allowed",
        "execution_started",
      );
      if (name === "gmail_search") {
        try {
          const pending = await gmailApprovals.require(
            user,
            token!,
            row,
            body.params?.arguments,
          );
          if (pending) {
            await activity.finish(
              user,
              attempt,
              "approval_required",
              "approval_required",
            );
            return toolError(body.id, pending);
          }
        } catch (error) {
          await activity.finish(user, attempt, "failed", "provider_failed");
          return toolError(
            body.id,
            error instanceof ApiError
              ? error.message
              : "This Gmail approval request failed.",
          );
        }
      }
      try {
        effective = await nativeRuntime(
          row,
          () => authorize(row, name),
          resources,
        );
      } catch (error) {
        await activity.finish(
          user,
          attempt,
          error instanceof ApiError && error.status === 403
            ? "denied"
            : "failed",
          error instanceof ApiError && error.status === 403
            ? "permission_changed"
            : "provider_failed",
        );
        throw error;
      }
    }
    const enabled = rows.filter((row) =>
      row.kind === "native" && row.ciphertext
    ).flatMap((row) => row.enabled_tools);
    const status: Record<string, unknown> = Object.fromEntries(
      providers.map((provider) => [
        provider,
        rows.some((row) => row.provider === provider && row.ciphertext),
      ]),
    );
    status.connections = rows.map((row) => ({
      id: row.id,
      name: row.name,
      provider: row.provider,
      enabledTools: row.enabled_tools,
    }));
    const app = createApp({
      ...effective,
      accessToken: token,
      enabledTools: enabled,
      hubStatus: status,
      configureServer(server) {
        for (const row of rows.filter((row) => row.kind === "mcp")) {
          for (
            const tool of row.tool_catalog.filter((tool) =>
              row.enabled_tools.includes(tool.id)
            )
          ) {
            server.registerTool(tool.id, {
              description: `${row.name}: ${tool.name}. ${tool.description}`,
              inputSchema: z.fromJSONSchema(tool.inputSchema),
              annotations: tool.annotations,
            }, async (args) => {
              try {
                const current = await authorize(row, tool.id);
                if (
                  !current.enabled_tools.includes(tool.id) ||
                  current.revision !== row.revision
                ) {
                  throw new ApiError(
                    "The connection changed. Discover tools again.",
                  );
                }
                // Compare the upstream catalog before execution. A changed tool needs explicit selection again.
                return await customOperation(
                  current,
                  store,
                  config.customPolicy,
                  async (client) => {
                    const catalog = await readCustomCatalog(client, current);
                    const upstream = catalog.find((item) =>
                      item.id === tool.id
                    );
                    if (
                      !upstream ||
                      canonical(upstream.inputSchema) !==
                        canonical(tool.inputSchema) ||
                      canonical(upstream.annotations ?? {}) !==
                        canonical(tool.annotations ?? {})
                    ) {
                      await store.update(current, { enabled_tools: [] });
                      throw new ApiError(
                        "The MCP tool changed. Discover and select its tools again.",
                      );
                    }
                    return await client.callTool({
                      name: tool.upstreamName!,
                      arguments: args as Record<string, unknown>,
                    }, { timeout: 10_000 });
                  },
                  fetcher,
                  () => authorize(current, tool.id),
                );
              } catch {
                return {
                  isError: true,
                  content: [{
                    type: "text" as const,
                    text:
                      "This MCP connection failed. Discover its tools or reconnect it.",
                  }],
                };
              }
            });
          }
        }
      },
    }, async (url, init) => {
      if (selected) {
        await authorize(selected, name);
      }
      return await fetcher(url, init);
    });
    let response: Response;
    try {
      response = await app(
        new Request(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify(body),
        }),
      );
      if (attempt) {
        const text = new TextDecoder().decode(
          await limitedBody(response.clone().body, 4_000_000),
        );
        const data = text.startsWith("event:") || text.startsWith("data:")
          ? text.split("\n").find((line) => line.startsWith("data:"))?.slice(5)
          : text;
        const payload = data ? JSON.parse(data) : null;
        const failed = !response.ok || !payload || payload.error ||
          payload.result?.isError;
        await activity.finish(
          user,
          attempt,
          permissionChanged ? "denied" : failed ? "failed" : "allowed",
          permissionChanged
            ? "permission_changed"
            : failed
            ? "provider_failed"
            : "completed",
        );
      }
    } catch (error) {
      if (attempt) {
        await activity.finish(user, attempt, "failed", "provider_failed");
      }
      throw error;
    }
    return response;
  }
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const routeBase = [base, base.replace(/^\/functions\/v1/, "")].find((
      item,
    ) => url.pathname === item || url.pathname.startsWith(`${item}/`));
    if (!routeBase) return reply({ error: "Not found." }, 404);
    const path = url.pathname.slice(routeBase.length).replace(/\/$/, "");
    const requestOrigin = request.headers.get("Origin");
    const cors = requestOrigin === origin;
    try {
      if (!path) return await mcp(request);
      if (requestOrigin && !cors) {
        return reply({ error: "This browser origin is not allowed." }, 403);
      }
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
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
            customApprovedHosts: config.customPolicy.approvedHosts,
          },
          200,
          cors,
        );
      }
      const callback = path.match(/^\/callback\/(github|slack|linear|gmail)$/);
      if (callback && request.method === "GET") {
        const provider = providerSchema.parse(callback[1]);
        const state = z.string().regex(/^[a-f0-9]{64}$/).parse(
          url.searchParams.get("state"),
        );
        const target = new URL("callback.html", config.uiUrl);
        const fragment = new URLSearchParams({ provider, state });
        if (url.searchParams.has("error")) fragment.set("error", "denied");
        else {fragment.set(
            "code",
            z.string().min(1).max(4096).parse(url.searchParams.get("code")),
          );}
        target.hash = fragment.toString();
        return new Response(null, {
          status: 303,
          headers: {
            Location: target.toString(),
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      }
      if (!path.startsWith("/v1/")) {
        return reply({ error: "Not found." }, 404, cors);
      }
      const user = await identity(request);
      rate(`api:${user}`, 60);
      if (path === "/v1/activity" && request.method === "GET") {
        return reply({ events: await activity.list(user) }, 200, cors);
      }
      const gmailApproval = path.match(
        /^\/v1\/gmail-approvals\/([a-f0-9-]{36})$/,
      );
      if (gmailApproval) {
        if (request.method === "GET") {
          return reply(
            await gmailApprovals.review(user, gmailApproval[1]),
            200,
            cors,
          );
        }
        if (request.method === "POST") {
          return reply(
            await gmailApprovals.decide(
              user,
              gmailApproval[1],
              await input(request),
            ),
            200,
            cors,
          );
        }
        return reply({ error: "Use GET or POST." }, 405, cors);
      }
      const vaultResponse = await vaultRoutes(path, request, user, input);
      if (vaultResponse) {
        return reply(vaultResponse.body, vaultResponse.status, cors);
      }
      const teamResponse = await teams(path, request, user, input);
      if (teamResponse) {
        return reply(teamResponse.body, teamResponse.status, cors);
      }
      if (path === "/v1/oauth/complete" && request.method === "POST") {
        const value = z.object({
          provider: providerSchema,
          state: z.string().regex(/^[a-f0-9]{64}$/),
          verifier: z.string().regex(/^[a-f0-9]{64}$/),
          code: z.string().min(1).max(4096),
        }).strict().parse(await input(request));
        const consumed = await store.consume(
          user,
          value.state,
          value.provider,
          value.verifier,
        );
        if (consumed.user_id !== user) throw notFound();
        const row = await store.get(user, consumed.connection_id);
        if (row.revision !== consumed.revision) {
          throw new ApiError("The connection changed. Start again.");
        }
        const provider = value.provider;
        const credential = await oauth.exchange(provider, {
          grant_type: "authorization_code",
          code: value.code,
          redirect_uri: `${config.endpointUrl}/callback/${provider}`,
          ...(provider === "slack" ? {} : { code_verifier: consumed.verifier }),
        });
        if (
          provider !== "github" &&
          !credential.scope?.split(/[ ,]+/).includes(oauth.scopes[provider])
        ) {
          throw new ApiError("Grant the required read permission.");
        }
        if (provider === "gmail" && !credential.refreshToken) {
          throw new ApiError("Grant offline access and try again.");
        }
        await store.saveCredential(
          row,
          credential,
          await oauth.label(provider, credential),
        );
        return reply({ provider, connectionId: row.id }, 200, cors);
      }
      if (path === "/v1/connections") {
        if (request.method === "GET") {
          return reply(
            {
              connections: (await store.list(user)).map(safe),
              accessConnections: (await store.accessible(user)).map(safeAccess),
              endpointUrl: config.endpointUrl,
            },
            200,
            cors,
          );
        }
        if (request.method === "POST") {
          const value = z.discriminatedUnion("kind", [
            z.object({
              kind: z.literal("native"),
              provider: providerSchema,
              name: z.string().trim().min(1).max(100),
              settings: settingsSchema.optional(),
            }).strict(),
            z.object({
              kind: z.literal("mcp"),
              name: z.string().trim().min(1).max(100),
              endpointUrl: z.string().max(2048),
              bearerToken: bearerSchema.optional(),
            }).strict(),
          ]).parse(await input(request));
          const id = crypto.randomUUID();
          const native = value.kind === "native";
          if (native && value.settings) {
            validateSettings(value.provider, value.settings);
          }
          if (!native) validateEndpoint(value.endpointUrl, config.customPolicy);
          const tools = native
            ? (await nativeCatalog()).filter((tool) =>
              tool.id === nativeIds[value.provider]
            )
            : [];
          const row = await store.create(user, {
            id,
            kind: value.kind,
            name: value.name,
            provider: native ? value.provider : null,
            endpoint_url: native ? null : new URL(value.endpointUrl).toString(),
            ciphertext: !native && value.bearerToken
              ? await store.encrypt(user, id, {
                accessToken: value.bearerToken,
              })
              : null,
            settings: native ? value.settings ?? {} : {},
            tool_catalog: tools,
            enabled_tools: native ? tools.map((tool) => tool.id) : [],
          });
          return reply({ connection: safe(row) }, 201, cors);
        }
      }
      if (path === "/v1/access-keys" && request.method === "GET") {
        return reply({ keys: await store.listKeys(user) }, 200, cors);
      }
      if (path === "/v1/access-keys" && request.method === "POST") {
        const options: KeyOptions = request.body === null
          ? { name: "Agent key", grants: [] }
          : keyOptionsSchema.parse(await input(request));
        if (options.expiresAt && Date.parse(options.expiresAt) <= Date.now()) {
          throw new ApiError("Select a future expiry time.");
        }
        if (options.grants !== null) {
          const available = await store.accessible(user);
          const connectionIds = new Set<string>();
          for (const grant of options.grants) {
            const connection = available.find((row) =>
              row.id === grant.connectionId
            );
            if (
              connectionIds.has(grant.connectionId) || !connection ||
              grant.toolIds.some((id) =>
                !connection.enabled_tools.includes(id) ||
                !connection.tool_catalog.some((tool) => tool.id === id)
              )
            ) {
              throw new ApiError(
                "Select available connections and enabled tools.",
              );
            }
            connectionIds.add(grant.connectionId);
            grant.toolIds = [...new Set(grant.toolIds)];
            if (grant.resources) {
              validateSettings(connection.provider, grant.resources);
              const limits = settingsSchema.parse(connection.settings);
              if (connection.provider === "github") limits.repositories ??= [];
              for (
                const resource of ["repositories", "channels", "teams"] as const
              ) {
                const requested = grant.resources[resource],
                  allowed = limits[resource];
                if (
                  requested && allowed &&
                  requested.some((item) =>
                    !allowed.some((value) =>
                      resource === "repositories"
                        ? value.toLowerCase() === item.toLowerCase()
                        : value === item
                    )
                  )
                ) {
                  throw new ApiError(
                    "Agent resources must remain within the connection's allowed scope.",
                  );
                }
              }
            }
          }
        }
        const token = random();
        const id = await store.issue(user, token, options);
        return reply(
          {
            id,
            token,
            endpointUrl: config.endpointUrl,
            configuration: {
              mcpServers: {
                swarm: {
                  type: "http",
                  url: config.endpointUrl,
                  headers: { Authorization: `Bearer ${token}` },
                },
              },
            },
          },
          201,
          cors,
        );
      }
      const key = path.match(/^\/v1\/access-keys\/([a-f0-9-]+)$/i);
      if (key && request.method === "DELETE") {
        await store.revoke(user, key[1]);
        return reply(null, 204, cors);
      }
      const match = path.match(
        /^\/v1\/connections\/([a-f0-9-]+)(?:\/(authorize|discover))?$/i,
      );
      if (match) {
        const row = await store.get(user, z.uuid().parse(match[1]));
        if (!match[2] && request.method === "DELETE") {
          await store.remove(user, row.id);
          return reply(null, 204, cors);
        }
        if (!match[2] && request.method === "PATCH") {
          const value = z.object({
            name: z.string().trim().min(1).max(100).optional(),
            settings: settingsSchema.optional(),
            enabledTools: z.array(z.string()).max(100).optional(),
            bearerToken: bearerSchema.optional(),
          }).strict().parse(await input(request));
          if (
            value.enabledTools?.some((id) =>
              !row.tool_catalog.some((tool) => tool.id === id)
            )
          ) throw new ApiError("Select tools from this connection's catalog.");
          if (value.bearerToken !== undefined && row.kind !== "mcp") {
            throw new ApiError("Use authorization for this account.");
          }
          if (value.settings) validateSettings(row.provider, value.settings);
          const update: Partial<Connection> = {
            ...(value.name !== undefined ? { name: value.name } : {}),
            ...(value.settings ? { settings: value.settings } : {}),
            ...(value.enabledTools
              ? { enabled_tools: [...new Set(value.enabledTools)] }
              : {}),
          };
          if (value.bearerToken !== undefined) {
            Object.assign(update, {
              ciphertext: value.bearerToken
                ? await store.encrypt(user, row.id, {
                  accessToken: value.bearerToken,
                })
                : null,
              tool_catalog: [],
              enabled_tools: [],
            });
          }
          return reply(
            { connection: safe(await store.update(row, update)) },
            200,
            cors,
          );
        }
        if (match[2] === "authorize" && request.method === "POST") {
          if (!row.provider || !config.clients[row.provider]) {
            throw new ApiError("This service is not configured.", 503);
          }
          const state = random(), verifier = random();
          await store.begin(row, state, verifier);
          return reply(
            {
              authorizationUrl: await oauth.authorization(
                row.provider,
                state,
                verifier,
              ),
              completionSecret: verifier,
            },
            200,
            cors,
          );
        }
        if (match[2] === "discover" && request.method === "POST") {
          if (row.kind !== "mcp") {
            return reply({ tools: row.tool_catalog }, 200, cors);
          }
          rate(`discover:${user}`, 10);
          return reply(
            {
              tools: await discoverCustom(
                row,
                store,
                config.customPolicy,
                fetcher,
              ),
            },
            200,
            cors,
          );
        }
      }
      throw notFound();
    } catch (error) {
      return reply(
        {
          error: error instanceof ApiError
            ? error.message
            : error instanceof z.ZodError
            ? "Check the request fields."
            : "The connection request failed. Try again or reconnect the account.",
        },
        error instanceof ApiError
          ? error.status
          : error instanceof z.ZodError
          ? 400
          : 502,
        cors,
      );
    }
  };
}
