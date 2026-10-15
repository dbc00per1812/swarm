import { assertEquals, assertStringIncludes } from "@std/assert";
import { createGateway } from "./gateway.ts";
import { ConnectionStore } from "./connection-store.ts";

function fixture(providerResponse?: typeof fetch) {
  const connections: Record<string, unknown>[] = [];
  const states: Record<string, unknown>[] = [];
  const fakeFetch: typeof fetch = (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname === "/auth/v1/user") {
      return Promise.resolve(Response.json({
        id: "owner-id",
        email: request.headers.get("Authorization") === "Bearer owner-session"
          ? "owner@example.test"
          : "other@example.test",
        email_confirmed_at: new Date().toISOString(),
      }));
    }
    if (url.pathname.includes("/rest/v1/")) {
      return (async () => {
        if (url.pathname.includes("/rpc/")) {
          const body = await request.json();
          let row = connections.find((item) =>
            item.provider === body.p_provider
          );
          if (!row) {
            row = {
              provider: body.p_provider,
              ciphertext: null,
              account_label: null,
              revision: -1,
            };
            connections.push(row);
          }
          row.revision = Number(row.revision) + 1;
          for (let index = states.length - 1; index >= 0; index--) {
            if (states[index].provider === body.p_provider) {
              states.splice(index, 1);
            }
          }
          if (url.pathname.endsWith("swarm_begin_oauth")) {
            states.push({
              state_hash: body.p_state_hash,
              provider: body.p_provider,
              verifier: body.p_verifier,
              revision: row.revision,
              expires_at: body.p_expires_at,
            });
          } else {
            row.ciphertext = null;
            row.account_label = null;
          }
          return new Response(null, { status: 204 });
        }
        const isState = url.pathname.endsWith("swarm_oauth_states");
        const rows = isState ? states : connections;
        if (request.method === "GET") return Response.json(rows);
        if (request.method === "PATCH") {
          const row = rows.find((item) =>
            item.provider === url.searchParams.get("provider")?.slice(3) &&
            item.revision ===
              Number(url.searchParams.get("revision")?.slice(3)) &&
            (!url.searchParams.has("ciphertext") ||
              item.ciphertext === url.searchParams.get("ciphertext")?.slice(3))
          );
          if (!row) return Response.json([]);
          Object.assign(row, await request.json());
          return Response.json([row]);
        }
        if (request.method === "DELETE") {
          const hash = url.searchParams.get("state_hash")?.slice(3);
          const selected = rows.filter((row) =>
            hash && row.state_hash === hash &&
            row.provider === url.searchParams.get("provider")?.slice(3)
          );
          for (const row of selected) rows.splice(rows.indexOf(row), 1);
          return request.headers.get("Prefer")
            ? Response.json(selected)
            : new Response(null, { status: 204 });
        }
        const body = await request.json();
        const old = isState
          ? -1
          : rows.findIndex((row) => row.provider === body.provider);
        if (old >= 0) rows.splice(old, 1);
        rows.push(body);
        return new Response(null, { status: 201 });
      })();
    }
    if (providerResponse && !url.hostname.endsWith("project.test")) {
      return providerResponse(input, init);
    }
    if (url.hostname === "github.com") {
      return Promise.resolve(
        Response.json({ access_token: "provider-access", scope: "" }),
      );
    }
    if (url.pathname === "/user") {
      return Promise.resolve(Response.json({ login: "example-user" }));
    }
    if (url.pathname.endsWith("/pulls")) {
      return Promise.resolve(
        Response.json([{
          number: 1,
          title: "OAuth result",
          html_url: "https://github.com/demo/project/pull/1",
          state: "open",
        }]),
      );
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  };
  const store = new ConnectionStore({
    projectUrl: "https://project.test",
    serviceKey: "service-test",
    encryptionKey: "1".repeat(64),
  }, fakeFetch);
  const app = createGateway(
    {
      accessToken: "a".repeat(64),
      githubRepositories: ["demo/project"],
      projectUrl: "https://project.test",
      anonKey: "anon-test",
      ownerEmail: "owner@example.test",
      uiUrl: "https://ui.test/swarm/",
      endpointUrl: "https://project.test/functions/v1/mcp",
      clients: {
        github: { clientId: "client-test", clientSecret: "client-secret" },
        slack: { clientId: "slack-client", clientSecret: "slack-secret" },
      },
    },
    store,
    fakeFetch,
  );
  function request(path: string, method = "GET", token = "owner-session") {
    return new Request(`https://project.test/functions/v1/mcp${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Origin: "https://ui.test" },
    });
  }
  return { app, request, connections, states };
}

Deno.test("only the owner can start a connection and client secrets never reach the browser", async () => {
  const { app, request } = fixture();
  assertEquals(
    (await app(request("/connect/github", "POST", "other-session"))).status,
    403,
  );
  const start = await app(request("/connect/github", "POST"));
  assertEquals(start.status, 200);
  const body = await start.json();
  const url = new URL(body.authorizationUrl);
  assertEquals(url.hostname, "github.com");
  assertEquals(url.searchParams.get("code_challenge_method"), "S256");
  assertEquals(url.searchParams.has("client_secret"), false);
  assertEquals(
    start.headers.get("Access-Control-Allow-Origin"),
    "https://ui.test",
  );
});

Deno.test("authorization callbacks save encrypted credentials once and the MCP tool uses the connection", async () => {
  const { app, request, connections } = fixture();
  const begin = await (await app(request("/connect/github", "POST"))).json();
  const state = new URL(begin.authorizationUrl).searchParams.get("state")!;
  const callbackUrl =
    `https://project.test/functions/v1/mcp/callback/github?state=${state}&code=test-code`;
  const callback = await app(new Request(callbackUrl));
  assertEquals(callback.status, 303);
  assertStringIncludes(
    callback.headers.get("Location")!,
    "https://ui.test/swarm/callback.html",
  );
  assertEquals(JSON.stringify(connections).includes("provider-access"), false);
  assertEquals((await app(new Request(callbackUrl))).status, 400);
  const tool = await app(
    new Request("https://project.test/functions/v1/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${"a".repeat(64)}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "github_list_pull_requests",
          arguments: { owner: "demo", repo: "project" },
        },
      }),
    }),
  );
  assertStringIncludes(await tool.text(), "OAuth result");
});

Deno.test("forged, expired, and cross-provider authorization attempts cannot create connections", async () => {
  const { app, request, states, connections } = fixture();
  assertEquals(
    (await app(
      new Request(
        "https://project.test/functions/v1/mcp/callback/github?state=forged&code=code",
      ),
    )).status,
    400,
  );
  const begin = await (await app(request("/connect/github", "POST"))).json();
  const state = new URL(begin.authorizationUrl).searchParams.get("state")!;
  states[0].expires_at = new Date(0).toISOString();
  assertEquals(
    (await app(
      new Request(
        `https://project.test/functions/v1/mcp/callback/github?state=${state}&code=code`,
      ),
    )).status,
    400,
  );
  assertEquals(connections.every((row) => row.ciphertext === null), true);
});

Deno.test("an untrusted browser origin cannot access the dashboard API", async () => {
  const { app } = fixture();
  const response = await app(
    new Request("https://project.test/functions/v1/mcp/connections", {
      headers: {
        Authorization: "Bearer owner-session",
        Origin: "https://other.test",
      },
    }),
  );
  assertEquals(response.status, 403);
  assertEquals(response.headers.has("Access-Control-Allow-Origin"), false);
});

Deno.test("Disconnect cancels a callback that is already exchanging its authorization code", async () => {
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<Response>();
  const { app, request } = fixture((input) => {
    if (
      new URL(input instanceof Request ? input.url : input).hostname ===
        "github.com"
    ) {
      started.resolve();
      return finish.promise;
    }
    return Promise.resolve(Response.json({ login: "demo" }));
  });
  const begin = await (await app(request("/connect/github", "POST"))).json();
  const state = new URL(begin.authorizationUrl).searchParams.get("state")!;
  const callback = app(
    new Request(
      `https://project.test/functions/v1/mcp/callback/github?state=${state}&code=code`,
    ),
  );
  await started.promise;
  assertEquals((await app(request("/disconnect/github", "POST"))).status, 200);
  finish.resolve(Response.json({ access_token: "late-token", scope: "" }));
  assertEquals((await callback).status, 400);
  const dashboard = await (await app(request("/connections"))).json();
  assertEquals(
    dashboard.services.find((service: { provider: string }) =>
      service.provider === "github"
    ).connected,
    false,
  );
});

Deno.test("Slack user tokens can refresh from the top-level token response", async () => {
  const { app, request } = fixture((input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.pathname.endsWith("oauth.v2.access")) {
      return (async () => {
        const form = new URLSearchParams(await req.text());
        return form.get("grant_type") === "refresh_token"
          ? Response.json({
            ok: true,
            access_token: "refreshed",
            refresh_token: "new-refresh",
            expires_in: 3600,
            scope: "search:read",
          })
          : Response.json({
            ok: true,
            authed_user: {
              access_token: "old-access",
              refresh_token: "old-refresh",
              expires_in: 1,
              scope: "search:read",
            },
          });
      })();
    }
    if (url.pathname.endsWith("auth.test")) {
      return Promise.resolve(Response.json({ ok: true, team: "Demo" }));
    }
    return Promise.resolve(
      Response.json({
        ok: true,
        messages: { matches: [{ text: "Refreshed result", ts: "1.0" }] },
      }),
    );
  });
  const begin = await (await app(request("/connect/slack", "POST"))).json();
  const state = new URL(begin.authorizationUrl).searchParams.get("state")!;
  assertEquals(
    (await app(
      new Request(
        `https://project.test/functions/v1/mcp/callback/slack?state=${state}&code=code`,
      ),
    )).status,
    303,
  );
  const tool = await app(
    new Request("https://project.test/functions/v1/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${"a".repeat(64)}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "slack_search", arguments: { query: "demo" } },
      }),
    }),
  );
  assertEquals(tool.status, 200);
  assertStringIncludes(await tool.text(), "Refreshed result");
});

Deno.test("a delayed refresh cannot replace a newly connected account", async () => {
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<Response>();
  let exchanges = 0;
  const { app, request } = fixture(async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.hostname === "github.com") {
      const form = new URLSearchParams(await req.text());
      if (form.get("grant_type") === "refresh_token") {
        started.resolve();
        return finish.promise;
      }
      exchanges++;
      return Response.json({
        access_token: exchanges === 1 ? "old-account" : "new-account",
        refresh_token: "refresh-token",
        expires_in: exchanges === 1 ? 1 : 3600,
        scope: "",
      });
    }
    if (url.pathname === "/user") return Response.json({ login: "demo" });
    return Response.json([{
      number: 1,
      title: req.headers.get("Authorization"),
      html_url: "https://github.com/demo/project/pull/1",
      state: "open",
    }]);
  });
  async function begin() {
    const result = await (await app(request("/connect/github", "POST"))).json();
    return new URL(result.authorizationUrl).searchParams.get("state")!;
  }
  function callback(state: string) {
    return app(
      new Request(
        `https://project.test/functions/v1/mcp/callback/github?state=${state}&code=code`,
      ),
    );
  }
  function tool() {
    return app(
      new Request("https://project.test/functions/v1/mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${"a".repeat(64)}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "github_list_pull_requests",
            arguments: { owner: "demo", repo: "project" },
          },
        }),
      }),
    );
  }
  assertEquals((await callback(await begin())).status, 303);
  const reconnect = await begin();
  const pending = tool();
  await started.promise;
  assertEquals((await callback(reconnect)).status, 303);
  finish.resolve(
    Response.json({
      access_token: "late-refresh",
      expires_in: 3600,
      scope: "",
    }),
  );
  const late = await pending;
  await late.body?.cancel();
  assertStringIncludes(await (await tool()).text(), "new-account");
});
