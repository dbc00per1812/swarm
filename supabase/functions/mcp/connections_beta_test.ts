import { assertEquals } from "@std/assert";
import { createBetaGateway as createGateway } from "./beta-gateway.ts";
import { UserStore as ConnectionStore } from "./user-store.ts";

Deno.test("a second confirmed user can list their own connections", async () => {
  const fetcher: typeof fetch = (input) => {
    const path = new URL(String(input)).pathname;
    return Promise.resolve(Response.json(
      path === "/auth/v1/user"
        ? {
          id: "22222222-2222-4222-8222-222222222222",
          email: "second@example.test",
          email_confirmed_at: new Date().toISOString(),
        }
        : [],
    ));
  };
  const config = {
    projectUrl: "https://project.test",
    anonKey: "public-test-key",
    ownerEmail: "first@example.test",
    uiUrl: "https://swarm.test/",
    endpointUrl: "https://project.test/functions/v1/mcp",
    clients: {},
    customPolicy: { approvedHosts: [] },
  };
  const gateway = createGateway(
    config,
    new ConnectionStore({
      projectUrl: config.projectUrl,
      serviceKey: "service-test-key",
      encryptionKey: "a".repeat(64),
    }, fetcher),
    fetcher,
  );
  const response = await gateway(
    new Request(`${config.endpointUrl}/v1/connections`, {
      headers: { Authorization: "Bearer second-session" },
    }),
  );
  assertEquals(response.status, 200);
  assertEquals((await response.json()).connections, []);
});

import { assert, assertStringIncludes } from "@std/assert";
import { createApp } from "./app.ts";
import { digest } from "./connection-store.ts";
import type { Connection } from "./user-store.ts";

const users = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
];
function fixture(upstream?: typeof fetch) {
  const tables: Record<string, Record<string, unknown>[]> = {
    swarm_user_connections: [],
    swarm_user_mcp_keys: [],
    swarm_user_oauth_states: [],
    swarm_gmail_approvals: [],
  };
  const access: {
    available: boolean;
    member: boolean;
    ownerMember: boolean;
    afterRead?: () => void;
  } = { available: true, member: true, ownerMember: true };
  const shares = new Map<string, string[]>();
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url);
    if (url.pathname === "/auth/v1/user") {
      const token = request.headers.get("Authorization");
      const index = token === "Bearer session-0"
        ? 0
        : token === "Bearer session-1"
        ? 1
        : -1;
      return index < 0 ? Response.json({}, { status: 401 }) : Response.json({
        id: users[index],
        email: `user${index}@example.test`,
        email_confirmed_at: new Date().toISOString(),
      });
    }
    if (!url.pathname.startsWith("/rest/v1/")) {
      if (upstream) return await upstream(input, init);
      if (url.hostname === "github.com") {
        return Response.json({ access_token: "provider-secret", scope: "" });
      }
      if (url.pathname === "/user") {
        return Response.json({ login: "fixture-account" });
      }
      if (url.hostname === "api.github.com") {
        return Response.json([{
          number: 1,
          title: request.headers.get("Authorization"),
          html_url: "https://example.test/pull/1",
          state: "open",
        }]);
      }
      throw new Error("Unexpected external request.");
    }
    const table = url.pathname.split("/").at(-1)!;
    if (url.pathname.includes("/rpc/")) {
      const body = await request.json();
      if (table === "swarm_user_key_owner") {
        return Response.json(
          tables.swarm_user_mcp_keys.find((key) =>
            key.token_hash === body.p_token_hash && !key.revoked_at
          )?.user_id ?? null,
        );
      }
      if (table === "swarm_team_connections") {
        if (!access.available) return Response.json({}, { status: 503 });
        const response = Response.json(
          tables.swarm_user_connections.filter((row) =>
            (!body.p_connection_id || row.id === body.p_connection_id) &&
            (row.user_id === body.p_user_id ||
              (access.member && access.ownerMember &&
                shares.has(String(row.id))))
          ).map((row) => {
            if (row.user_id === body.p_user_id) return row;
            const enabled = (row.enabled_tools as string[]).filter((id) =>
              shares.get(String(row.id))!.includes(id)
            );
            return {
              ...row,
              enabled_tools: enabled,
              tool_catalog: (row.tool_catalog as { id: string }[]).filter((
                tool,
              ) => enabled.includes(tool.id)),
            };
          }),
        );
        access.afterRead?.();
        return response;
      }
      if (table === "swarm_gmail_approval") {
        const rows = tables.swarm_gmail_approvals;
        const row = rows.find((r) =>
          r.id === body.p_id && r.user_id === body.p_user_id
        );
        const live = row && Date.parse(String(row.expires_at)) > Date.now();
        if (body.p_action === "create") {
          rows.push({
            ...body.p_input,
            id: body.p_id,
            user_id: body.p_user_id,
            approved_at: null,
            consumed_at: null,
            denied_at: null,
            expires_at: new Date(Date.now() + 600000).toISOString(),
          });
          return Response.json(true);
        }
        if (!live) return Response.json(null);
        if (body.p_action === "get") return Response.json(row);
        if (body.p_action === "approve" || body.p_action === "deny") {
          if (row.consumed_at || row.denied_at || row.approved_at) {
            return Response.json(false);
          }
          row[body.p_action === "approve" ? "approved_at" : "denied_at"] =
            new Date().toISOString();
          if (body.p_action === "deny") row.ciphertext = null;
          return Response.json(true);
        }
        if (body.p_action === "consume") {
          if (
            !row.approved_at || row.consumed_at || row.denied_at ||
            row.key_hash !== body.p_input.key_hash ||
            row.request_hash !== body.p_input.request_hash
          ) return Response.json(false);
          row.consumed_at = new Date().toISOString();
          row.ciphertext = null;
          return Response.json(true);
        }
      }
      const rows = tables.swarm_user_connections;
      const row = rows.find((row) =>
        row.user_id === body.p_user_id && row.id === body.p_connection_id
      );
      if (table === "swarm_user_save_credential") {
        if (
          !row || row.revision !== body.p_revision ||
          (body.p_previous_ciphertext &&
            row.ciphertext !== body.p_previous_ciphertext)
        ) return Response.json(false);
        if (!body.p_refresh) shares.delete(String(row.id));
        Object.assign(row, {
          ciphertext: body.p_ciphertext,
          account_label: body.p_account_label,
          revision: Number(row.revision) + 1,
        });
        return Response.json(true);
      }
      if (table === "swarm_user_begin_oauth" && row) {
        row.revision = Number(row.revision) + 1;
        tables.swarm_user_oauth_states = tables.swarm_user_oauth_states.filter((
          state,
        ) => state.connection_id !== row.id);
        tables.swarm_user_oauth_states.push({
          state_hash: body.p_state_hash,
          user_id: body.p_user_id,
          connection_id: row.id,
          verifier: body.p_verifier,
          revision: row.revision,
          expires_at: body.p_expires_at,
        });
        return Response.json(row.revision);
      }
      if (table === "swarm_user_complete_oauth") {
        const state = tables.swarm_user_oauth_states.find((state) =>
          state.state_hash === body.p_state_hash &&
          state.user_id === body.p_user_id && state.verifier === body.p_verifier
        );
        const connection = state &&
          rows.find((row) =>
            row.id === state.connection_id && row.user_id === state.user_id &&
            row.provider === body.p_provider && row.revision === state.revision
          );
        if (
          !state || !connection ||
          Date.parse(String(state.expires_at)) <= Date.now()
        ) return Response.json([]);
        tables.swarm_user_oauth_states.splice(
          tables.swarm_user_oauth_states.indexOf(state),
          1,
        );
        return Response.json([state]);
      }
      throw new Error("Unexpected RPC.");
    }
    const rows = tables[table];
    const selected = rows.filter((row) =>
      [...url.searchParams].every(([key, value]) =>
        key === "select" || String(row[key]) === value.slice(3)
      )
    );
    if (request.method === "GET") {
      return Response.json(
        JSON.parse(
          JSON.stringify(
            selected,
            (_key, node) =>
              node && typeof node === "object" && !Array.isArray(node)
                ? Object.fromEntries(
                  Object.keys(node).sort().map((key) => [key, node[key]]),
                )
                : node,
          ),
        ),
      );
    }
    if (request.method === "DELETE") {
      for (const row of selected) rows.splice(rows.indexOf(row), 1);
      return Response.json(selected);
    }
    const body = await request.json();
    if (request.method === "PATCH") {
      for (const row of selected) {
        Object.assign(row, body, { revision: Number(row.revision) + 1 });
      }
      return Response.json(selected);
    }
    const row = {
      id: crypto.randomUUID(),
      ciphertext: null,
      account_label: null,
      endpoint_url: null,
      provider: null,
      revision: 0,
      settings: {},
      tool_catalog: [],
      enabled_tools: [],
      ...body,
    };
    rows.push(row);
    return Response.json([row], { status: 201 });
  };
  const config = {
    projectUrl: "https://project.test",
    anonKey: "public-key",
    uiUrl: "https://swarm.test/",
    endpointUrl: "https://project.test/functions/v1/mcp",
    clients: {
      github: {
        clientId: "fixture-client",
        clientSecret: "fixture-client-secret",
      },
    },
    customPolicy: {
      approvedHosts: ["fixture.example"],
      resolve: () => Promise.resolve(["93.184.216.34"]),
    },
  };
  const store = new ConnectionStore({
    projectUrl: config.projectUrl,
    serviceKey: "service-secret",
    encryptionKey: "a".repeat(64),
  }, fetcher);
  const gateway = createGateway(config, store, fetcher);
  const api = async (
    user: number,
    path: string,
    method = "GET",
    body?: unknown,
  ) =>
    await gateway(
      new Request(`${config.endpointUrl}/v1/${path}`, {
        method,
        headers: {
          Authorization: `Bearer session-${user}`,
          "Content-Type": "application/json",
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    );
  const rpc = async (token: string, method: string, params?: unknown) => {
    const response = await gateway(
      new Request(config.endpointUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
    const text = await response.text();
    const value = JSON.parse(
      text.startsWith("event:") || text.startsWith("data:")
        ? text.split("\n").find((line) => line.startsWith("data:"))!.slice(5)
        : text,
    );
    return { status: response.status, ...value };
  };
  const add = async (user: number, name: string) => {
    const response = await api(user, "connections", "POST", {
      kind: "native",
      provider: "github",
      name,
      settings: { repositories: ["demo/project"] },
    });
    assertEquals(response.status, 201);
    const { connection } = await response.json();
    const row = await store.get(users[user], connection.id);
    await store.saveCredential(row, { accessToken: `${name}-secret` }, name);
    return connection.id as string;
  };
  const key = async (user: number) => {
    const response = await api(user, "access-keys", "POST");
    assertEquals(response.status, 201);
    return await response.json();
  };
  return { tables, gateway, store, api, rpc, add, key, config, shares, access };
}

Deno.test("accounts and tool controls stay within the authenticated user", async () => {
  const f = fixture();
  const first = await f.add(0, "first"),
    second = await f.add(0, "second"),
    foreign = await f.add(1, "foreign");
  const key = await f.key(0);
  const list = await (await f.api(0, "connections")).json();
  assertEquals(
    list.connections.map((row: { id: string }) => row.id).sort(),
    [first, second].sort(),
  );
  assert(!JSON.stringify(list).includes("ciphertext"));
  assert(!JSON.stringify(list).includes("secret"));
  for (const id of [foreign, crypto.randomUUID()]) {
    for (
      const [suffix, method, body] of [
        ["", "PATCH", { name: "hijacked" }],
        ["", "DELETE", undefined],
        ["/authorize", "POST", undefined],
        ["/discover", "POST", undefined],
      ] as const
    ) {
      const response = await f.api(
        0,
        `connections/${id}${suffix}`,
        method,
        body,
      );
      assertEquals(response.status, 404);
      await response.body?.cancel();
    }
  }
  const ambiguous = await f.rpc(key.token, "tools/call", {
    name: "github_list_pull_requests",
    arguments: { owner: "demo", repo: "project" },
  });
  assertEquals(ambiguous.result.isError, true);
  assertStringIncludes(ambiguous.result.content[0].text, "connection_id");
  for (const [id, label] of [[first, "first"], [second, "second"]]) {
    const result = await f.rpc(key.token, "tools/call", {
      name: "github_list_pull_requests",
      arguments: { owner: "demo", repo: "project", connection_id: id },
    });
    assertStringIncludes(result.result.content[0].text, `${label}-secret`);
  }
  const blocked = await f.rpc(key.token, "tools/call", {
    name: "github_list_pull_requests",
    arguments: { owner: "demo", repo: "project", connection_id: foreign },
  });
  assertEquals(blocked.result.isError, true);
  for (const id of [first, second]) {
    const r = await f.api(0, `connections/${id}`, "PATCH", {
      enabledTools: [],
    });
    assertEquals(r.status, 200);
    await r.body?.cancel();
  }
  assertEquals(
    (await f.rpc(key.token, "tools/list")).result.tools.map((
      tool: { name: string },
    ) => tool.name),
    ["hub_status"],
  );
  assertEquals(
    (await f.rpc(key.token, "tools/call", {
      name: "github_list_pull_requests",
      arguments: { owner: "demo", repo: "project", connection_id: first },
    })).result.isError,
    true,
  );
  const other = await f.key(1);
  assertEquals((await f.rpc(other.token, "tools/list")).result.tools.length, 2);
});

Deno.test("keys reveal a token once and revocation stops its next call", async () => {
  const f = fixture(), key = await f.key(0);
  assertEquals(
    await digest(key.token),
    f.tables.swarm_user_mcp_keys[0].token_hash,
  );
  assert(!JSON.stringify(f.tables).includes(key.token));
  assertStringIncludes(
    key.configuration.mcpServers.swarm.headers.Authorization,
    `Bearer ${key.token}`,
  );
  const foreign = await f.api(1, `access-keys/${key.id}`, "DELETE");
  assertEquals(foreign.status, 404);
  await foreign.body?.cancel();
  assertEquals((await f.rpc(key.token, "tools/list")).status, 200);
  assertEquals((await f.api(0, `access-keys/${key.id}`, "DELETE")).status, 204);
  assertEquals((await f.rpc(key.token, "tools/list")).status, 401);
  assertEquals((await f.rpc("b".repeat(64), "tools/list")).status, 401);
});

Deno.test("forwarded provider callbacks cannot save another browser's credentials", async () => {
  const f = fixture(), first = await f.add(0, "first");
  const start = await (await f.api(0, `connections/${first}/authorize`, "POST"))
    .json();
  const state = new URL(start.authorizationUrl).searchParams.get("state")!;
  const redirect = await f.gateway(
    new Request(
      `${f.config.endpointUrl}/callback/github?state=${state}&code=fixture-code`,
    ),
  );
  assertEquals(redirect.status, 303);
  assertEquals(
    (await f.store.secret(await f.store.get(users[0], first)))?.accessToken,
    "first-secret",
  );
  assert(!start.authorizationUrl.includes(start.completionSecret));
  const complete = {
    provider: "github",
    state,
    code: "fixture-code",
    verifier: start.completionSecret,
  };
  for (
    const [user, body, status] of [
      [9, complete, 401],
      [1, complete, 400],
      [0, { ...complete, verifier: "b".repeat(64) }, 400],
      [0, { ...complete, verifier: undefined }, 400],
      [0, { ...complete, provider: "slack" }, 400],
    ] as const
  ) {
    const response = await f.api(user, "oauth/complete", "POST", body);
    assertEquals(response.status, status);
    await response.body?.cancel();
    assertEquals(
      (await f.store.secret(await f.store.get(users[0], first)))?.accessToken,
      "first-secret",
    );
  }
  const success = await f.api(0, "oauth/complete", "POST", complete);
  assertEquals(success.status, 200);
  await success.body?.cancel();
  assertEquals(
    (await f.store.secret(await f.store.get(users[0], first)))?.accessToken,
    "provider-secret",
  );
});

Deno.test("OAuth states bind callbacks to one account and cannot be replayed", async () => {
  const f = fixture(),
    first = await f.add(0, "first"),
    second = await f.add(0, "second");
  const response = await f.api(0, `connections/${first}/authorize`, "POST");
  const { authorizationUrl, completionSecret } = await response.json();
  const state = new URL(authorizationUrl).searchParams.get("state")!;
  const callback = () =>
    f.api(0, "oauth/complete", "POST", {
      provider: "github",
      state,
      code: "fixture-code",
      verifier: completionSecret,
    });
  const done = await callback();
  assertEquals(done.status, 200);
  await done.body?.cancel();
  assertEquals(
    (await f.store.secret(await f.store.get(users[0], first)))?.accessToken,
    "provider-secret",
  );
  assertEquals(
    (await f.store.secret(await f.store.get(users[0], second)))?.accessToken,
    "second-secret",
  );
  const replay = await callback();
  assertEquals(replay.status, 400);
  await replay.body?.cancel();
  const next = await (await f.api(0, `connections/${first}/authorize`, "POST"))
    .json();
  const nextState = new URL(next.authorizationUrl).searchParams.get("state");
  await f.api(0, `connections/${first}`, "DELETE");
  const removed = await f.api(0, "oauth/complete", "POST", {
    provider: "github",
    state: nextState,
    code: "fixture-code",
    verifier: next.completionSecret,
  });
  assertEquals(removed.status, 400);
  await removed.body?.cancel();
});

Deno.test("ciphertext cannot move to another user or connection", async () => {
  const f = fixture(),
    first = await f.add(0, "first"),
    second = await f.add(0, "second"),
    foreign = await f.add(1, "foreign");
  const ciphertext = (await f.store.get(users[0], first)).ciphertext;
  for (const id of [second, foreign]) {
    const row = f.tables.swarm_user_connections.find((row) => row.id === id)!;
    row.ciphertext = ciphertext;
    let failed = false;
    try {
      await f.store.secret(row as Connection);
    } catch {
      failed = true;
    }
    assert(failed);
  }
});

Deno.test("custom tools require selection and use only their upstream credential", async () => {
  const upstream = createApp({
    accessToken: "u".repeat(64),
    githubToken: "custom-account",
    githubRepositories: ["demo/project"],
  }, () => Promise.resolve(Response.json([])));
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    upstream,
  );
  const base = `http://127.0.0.1:${server.addr.port}/mcp`;
  try {
    const f = fixture((_input, init) => {
      assertEquals(
        new Headers(init?.headers).get("Authorization"),
        `Bearer ${"u".repeat(64)}`,
      );
      return fetch(base, init);
    });
    const response = await f.api(0, "connections", "POST", {
      kind: "mcp",
      name: "Fixture",
      endpointUrl: "https://fixture.example/mcp",
      bearerToken: "u".repeat(64),
    });
    assertEquals(response.status, 201);
    const { connection } = await response.json();
    const key = await f.key(0);
    assertEquals((await f.rpc(key.token, "tools/list")).result.tools.length, 1);
    const discovery = await f.api(
      0,
      `connections/${connection.id}/discover`,
      "POST",
    );
    assertEquals(discovery.status, 200);
    const { tools } = await discovery.json();
    const tool = tools.find((tool: { name: string }) =>
      tool.name === "github_list_pull_requests"
    );
    assert(tool.id.startsWith(`custom_${connection.id.replaceAll("-", "")}_`));
    assertEquals((await f.rpc(key.token, "tools/list")).result.tools.length, 1);
    const selected = await f.api(0, `connections/${connection.id}`, "PATCH", {
      enabledTools: [tool.id],
    });
    assertEquals(selected.status, 200);
    await selected.body?.cancel();
    assertEquals((await f.rpc(key.token, "tools/list")).result.tools.length, 2);
    const called = await f.rpc(key.token, "tools/call", {
      name: tool.id,
      arguments: { owner: "demo", repo: "project" },
    });
    assertEquals(called.result.isError, undefined);
    assertEquals(called.result.content[0].text, "[]");
    const replaced = await f.api(0, `connections/${connection.id}`, "PATCH", {
      bearerToken: "",
    });
    assertEquals(replaced.status, 200);
    await replaced.body?.cancel();
    assertEquals((await f.rpc(key.token, "tools/list")).result.tools.length, 1);
    assert(
      (await f.rpc(key.token, "tools/call", { name: tool.id, arguments: {} }))
        .error,
    );
  } finally {
    await server.shutdown();
  }
});

for (
  const endpointUrl of [
    "http://fixture.example/mcp",
    "https://127.0.0.1/mcp",
    "https://169.254.169.254/mcp",
    "https://unapproved.example/mcp",
    "https://user:password@fixture.example/mcp",
  ]
) {
  Deno.test(`custom destinations reject ${endpointUrl}`, async () => {
    const f = fixture();
    const response = await f.api(0, "connections", "POST", {
      kind: "mcp",
      name: "Unsafe",
      endpointUrl,
    });
    assertEquals(response.status, 400);
    await response.body?.cancel();
    assertEquals(f.tables.swarm_user_connections.length, 0);
  });
}

function protocolFixture(options: {
  streaming?: boolean;
  malformed?: boolean;
  oversized?: boolean;
  beforeCall?: () => Promise<void>;
  onList?: () => Promise<void>;
} = {}) {
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    const message = await new Response(init?.body).json();
    if (message.id === undefined) return new Response(null, { status: 204 });
    let result: unknown;
    if (message.method === "initialize") {
      result = {
        protocolVersion: message.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1" },
      };
    }
    if (message.method === "tools/list") {
      await options.onList?.();
      result = options.malformed ? { tools: "invalid" } : {
        tools: [{
          name: message.params?.cursor ? "second_page" : "first_page",
          description: options.oversized
            ? "x".repeat(270_000)
            : "Read fixture data",
          inputSchema: { type: "object", properties: {} },
        }],
        ...(message.params?.cursor ? {} : { nextCursor: "second" }),
      };
    }
    if (message.method === "tools/call") {
      await options.beforeCall?.();
      result = { content: [{ type: "text", text: "fixture-result" }] };
    }
    const value = JSON.stringify({ jsonrpc: "2.0", id: message.id, result });
    if (options.streaming) {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(`event: message\ndata: ${value}\n\n`),
            );
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }
    return new Response(value, {
      headers: { "Content-Type": "application/json" },
    });
  };
}

for (const streaming of [false, true]) {
  Deno.test(`custom tools execute from later catalog pages with ${streaming ? "open SSE" : "JSON"} responses`, async () => {
    const f = fixture(protocolFixture({ streaming }));
    const created = await (await f.api(0, "connections", "POST", {
      kind: "mcp",
      name: "Paged",
      endpointUrl: "https://fixture.example/mcp",
    })).json();
    const id = created.connection.id;
    const discovery = await f.api(0, `connections/${id}/discover`, "POST");
    assertEquals(discovery.status, 200);
    const { tools } = await discovery.json();
    const second = tools.find((tool: { name: string }) =>
      tool.name === "second_page"
    );
    const selected = await f.api(0, `connections/${id}`, "PATCH", {
      enabledTools: [second.id],
    });
    await selected.body?.cancel();
    const key = await f.key(0);
    const called = await f.rpc(key.token, "tools/call", {
      name: second.id,
      arguments: {},
    });
    assertEquals(called.result.isError, undefined);
    assertEquals(called.result.content[0].text, "fixture-result");
  });
}

Deno.test("custom permissions are checked after upstream catalog work", async () => {
  let calls = 0, lists = 0;
  const f = fixture(protocolFixture({
    onList: async () => {
      if (++lists === 3) await disable?.();
    },
    beforeCall: () => {
      calls++;
      return Promise.resolve();
    },
  }));
  const created = await (await f.api(0, "connections", "POST", {
    kind: "mcp",
    name: "Mutable",
    endpointUrl: "https://fixture.example/mcp",
  })).json();
  const id = created.connection.id;
  const { tools } = await (await f.api(0, `connections/${id}/discover`, "POST"))
    .json();
  const selected = await f.api(0, `connections/${id}`, "PATCH", {
    enabledTools: [tools[0].id],
  });
  await selected.body?.cancel();
  const disable = async () => {
    const response = await f.api(0, `connections/${id}`, "PATCH", {
      enabledTools: [],
    });
    await response.body?.cancel();
  };
  const key = await f.key(0);
  const called = await f.rpc(key.token, "tools/call", {
    name: tools[0].id,
    arguments: {},
  });
  assertEquals(called.result.isError, true);
  assertEquals(calls, 0);
});

for (
  const mode of ["malformed", "oversized", "private DNS", "redirect"] as const
) {
  Deno.test(`a custom ${mode} response fails without breaking other connections`, async () => {
    const f = fixture(
      mode === "redirect"
        ? () =>
          Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { Location: "https://127.0.0.1/private" },
            }),
          )
        : protocolFixture({
          malformed: mode === "malformed",
          oversized: mode === "oversized",
        }),
    );
    if (mode === "private DNS") {
      f.config.customPolicy.resolve = () => Promise.resolve(["127.0.0.1"]);
    }
    const created = await (await f.api(0, "connections", "POST", {
      kind: "mcp",
      name: "Broken",
      endpointUrl: "https://fixture.example/mcp",
    })).json();
    const discovery = await f.api(
      0,
      `connections/${created.connection.id}/discover`,
      "POST",
    );
    assertEquals(
      discovery.status,
      mode === "private DNS" || mode === "oversized" ? 400 : 502,
    );
    await discovery.body?.cancel();
    const key = await f.key(0);
    assertEquals((await f.rpc(key.token, "tools/list")).status, 200);
  });
}

Deno.test("a custom server that sends no response reaches the deadline", async () => {
  const f = fixture(async (_input, init) => {
    const message = await new Response(init?.body).json();
    if (message.method !== "tools/list") {
      return await protocolFixture()(_input, init);
    }
    return new Response(new ReadableStream(), {
      headers: { "Content-Type": "text/event-stream" },
    });
  });
  const created = await (await f.api(0, "connections", "POST", {
    kind: "mcp",
    name: "Slow",
    endpointUrl: "https://fixture.example/mcp",
  })).json();
  const response = await f.api(
    0,
    `connections/${created.connection.id}/discover`,
    "POST",
  );
  assertEquals(response.status, 502);
  await response.body?.cancel();
  assertEquals((await f.api(0, "connections")).status, 200);
});

Deno.test("a personal key can discover and execute explicitly shared native tools", async () => {
  const f = fixture();
  const id = await f.add(0, "Shared");
  const key = await f.key(1);
  f.shares.set(id, ["github_list_pull_requests"]);
  const tools = await f.rpc(key.token, "tools/list");
  assert(
    tools.result.tools.some((tool: { name: string }) =>
      tool.name === "github_list_pull_requests"
    ),
  );
  const result = await f.rpc(key.token, "tools/call", {
    name: "github_list_pull_requests",
    arguments: { owner: "demo", repo: "project", connection_id: id },
  });
  assertEquals(result.result.isError, undefined);
  const status = await f.rpc(key.token, "tools/call", {
    name: "hub_status",
    arguments: {},
  });
  const metadata = JSON.parse(status.result.content[0].text);
  assertEquals(metadata.connections, [{
    id,
    name: "Shared",
    provider: "github",
    enabledTools: ["github_list_pull_requests"],
  }]);
  assert(!JSON.stringify(metadata).includes("secret"));
  assert(!JSON.stringify(metadata).includes(users[0]));
  for (
    const [suffix, method] of [["", "PATCH"], ["", "DELETE"], [
      "/authorize",
      "POST",
    ], ["/discover", "POST"]]
  ) {
    const denied = await f.api(
      1,
      `connections/${id}${suffix}`,
      method,
      method === "PATCH" ? { name: "Foreign" } : undefined,
    );
    assertEquals(denied.status, 404);
    await denied.body?.cancel();
  }
});

for (
  const mode of [
    "withdrawn",
    "member removed",
    "owner departed",
    "deleted",
    "disabled",
    "foreign ID",
    "unselected",
    "read failed",
  ] as const
) {
  Deno.test(`shared native tools deny ${mode}`, async () => {
    let upstream = 0;
    const f = fixture(() => {
      upstream++;
      return Promise.resolve(Response.json([]));
    });
    const id = await f.add(0, "Same name");
    const key = await f.key(1);
    f.shares.set(id, ["github_list_pull_requests"]);
    if (mode === "withdrawn") f.shares.delete(id);
    if (mode === "member removed") f.access.member = false;
    if (mode === "owner departed") f.access.ownerMember = false;
    if (mode === "deleted") f.tables.swarm_user_connections.length = 0;
    if (mode === "disabled") {
      f.tables.swarm_user_connections[0].enabled_tools = [];
    }
    if (mode === "unselected") f.shares.set(id, ["another_tool"]);
    if (mode === "read failed") f.access.available = false;
    const result = await f.rpc(key.token, "tools/call", {
      name: "github_list_pull_requests",
      arguments: {
        owner: "demo",
        repo: "project",
        connection_id: mode === "foreign ID" ? crypto.randomUUID() : id,
      },
    });
    assert(result.result?.isError || result.status >= 400);
    assertEquals(upstream, 0);
  });
}
Deno.test("same-name personal and shared accounts require an explicit connection ID", async () => {
  const f = fixture();
  const own = await f.add(1, "Same name"), shared = await f.add(0, "Same name");
  f.shares.set(shared, ["github_list_pull_requests"]);
  const key = await f.key(1);
  const args = { owner: "demo", repo: "project" };
  const ambiguous = await f.rpc(key.token, "tools/call", {
    name: "github_list_pull_requests",
    arguments: args,
  });
  assertEquals(ambiguous.result.isError, true);
  assertStringIncludes(ambiguous.result.content[0].text, "connection_id");
  for (const id of [own, shared]) {
    const called = await f.rpc(key.token, "tools/call", {
      name: "github_list_pull_requests",
      arguments: { ...args, connection_id: id },
    });
    assertEquals(called.result.isError, undefined);
  }
});
for (
  const stage of [
    "refresh preparation",
    "after refresh",
  ] as const
) {
  Deno.test(`native sharing is checked during ${stage}`, async () => {
    let refreshes = 0, reads = 0;
    const f = fixture((input) => {
      if (new URL(String(input)).hostname === "github.com") {
        refreshes++;
        if (stage === "after refresh") f.shares.clear();
        return Promise.resolve(
          Response.json({ access_token: "refreshed-secret", expires_in: 3600 }),
        );
      }
      reads++;
      // Return a valid provider response if permission checks permit it.
      return Promise.resolve(
        Response.json(
          Array.from(
            { length: 10 },
            (_, i) => ({
              number: i,
              title: "Item",
              html_url: "https://example.test/1",
              state: "open",
            }),
          ),
        ),
      );
    });
    const id = await f.add(0, "Refresh");
    const row = await f.store.get(users[0], id);
    await f.store.saveCredential(row, {
      accessToken: "expired-secret",
      refreshToken: "refresh-secret",
      expiresAt: 1,
    }, "Same label");
    f.shares.set(id, ["github_list_pull_requests"]);
    if (stage === "refresh preparation") {
      f.access.afterRead = () => f.shares.clear();
    }
    const key = await f.key(1);
    const called = await f.rpc(key.token, "tools/call", {
      name: "github_list_pull_requests",
      arguments: { owner: "demo", repo: "project", limit: 15 },
    });
    assert(called.result?.isError || called.status >= 400);
    assertEquals(refreshes, stage === "refresh preparation" ? 0 : 1);
    assertEquals(reads, 0);
  });
}

for (const stage of ["DNS", "catalog", "read failed", "new tool"] as const) {
  Deno.test(`shared custom tools enforce access after ${stage}`, async () => {
    let calls = 0, revoke = false;
    const f = fixture(protocolFixture({
      onList: () => {
        if (revoke && (stage === "catalog" || stage === "read failed")) {
          f.shares.clear();
          f.access.available = stage !== "read failed";
        }
        return Promise.resolve();
      },
      beforeCall: () => {
        calls++;
        return Promise.resolve();
      },
    }));
    const created = await (await f.api(0, "connections", "POST", {
      kind: "mcp",
      name: "Shared MCP",
      endpointUrl: "https://fixture.example/mcp",
    })).json();
    const id = created.connection.id;
    const { tools } =
      await (await f.api(0, `connections/${id}/discover`, "POST")).json();
    await (await f.api(0, `connections/${id}`, "PATCH", {
      enabledTools: tools.map((t: { id: string }) => t.id),
    })).body?.cancel();
    f.shares.set(id, [tools[0].id]);
    const key = await f.key(1);
    const listed = (await f.rpc(key.token, "tools/list")).result.tools;
    assertEquals(
      listed.map((t: { name: string }) => t.name).sort(),
      ["hub_status", tools[0].id].sort(),
    );
    const success = await f.rpc(key.token, "tools/call", {
      name: tools[0].id,
      arguments: {},
    });
    assertEquals(success.result.isError, undefined);
    assertEquals(calls, 1);
    revoke = true;
    if (stage === "DNS") {
      f.config.customPolicy.resolve = () => {
        f.shares.clear();
        return Promise.resolve(["93.184.216.34"]);
      };
    }
    const denied = await f.rpc(key.token, "tools/call", {
      name: stage === "new tool" ? tools[1].id : tools[0].id,
      arguments: {},
    });
    assert(denied.error || denied.result?.isError || denied.status >= 400);
    assertEquals(calls, 1);
  });
}

Deno.test("shared Gmail checks access before each message request", async () => {
  let reads = 0;
  const f = fixture(() => {
    reads++;
    f.shares.clear();
    return Promise.resolve(
      Response.json({ messages: [{ id: "first" }, { id: "second" }] }),
    );
  });
  const created = await (await f.api(0, "connections", "POST", {
    kind: "native",
    provider: "gmail",
    name: "Mail",
  })).json();
  const id = created.connection.id;
  await f.store.saveCredential(await f.store.get(users[0], id), {
    accessToken: "mail-fixture",
  }, "Mail");
  f.shares.set(id, ["gmail_search"]);
  const key = await f.key(1);
  const pending = await f.rpc(key.token, "tools/call", {
    name: "gmail_search",
    arguments: { query: "fixture", limit: 2 },
  });
  const approval = JSON.parse(pending.result.content[0].text).approvalId;
  assertEquals(
    (await f.api(1, `gmail-approvals/${approval}`, "POST", {
      action: "approve",
      limitedUseAccepted: true,
    })).status,
    200,
  );
  const result = await f.rpc(key.token, "tools/call", {
    name: "gmail_search",
    arguments: { query: "fixture", limit: 2, approval_id: approval },
  });
  assertEquals(result.result.isError, true);
  assertEquals(reads, 1);
});

Deno.test("routine native refresh preserves sharing through a personal key", async () => {
  const f = fixture((input) =>
    Promise.resolve(Response.json(
      new URL(String(input)).hostname === "github.com"
        ? { access_token: "refreshed-fixture", expires_in: 3600 }
        : [],
    ))
  );
  const id = await f.add(0, "Refresh");
  await f.store.saveCredential(await f.store.get(users[0], id), {
    accessToken: "expired-fixture",
    refreshToken: "refresh-fixture",
    expiresAt: 1,
  }, "Same name");
  f.shares.set(id, ["github_list_pull_requests"]);
  const key = await f.key(1);
  for (let i = 0; i < 2; i++) {
    const result = await f.rpc(key.token, "tools/call", {
      name: "github_list_pull_requests",
      arguments: { owner: "demo", repo: "project" },
    });
    assertEquals(result.result.isError, undefined);
  }
});

Deno.test("Gmail requires browser approval for the exact search and key, then permits one execution", async () => {
  let gmailReads = 0;
  const f = fixture((input) => {
    const url = new URL(String(input));
    if (url.hostname !== "gmail.googleapis.com") {
      throw new Error("Unexpected upstream.");
    }
    gmailReads++;
    return Promise.resolve(Response.json({ messages: [] }));
  });
  const added = await f.api(0, "connections", "POST", {
    kind: "native",
    provider: "gmail",
    name: "Synthetic mailbox",
  });
  const { connection } = await added.json();
  const row = await f.store.get(users[0], connection.id);
  await f.store.saveCredential(
    row,
    { accessToken: "synthetic-gmail-token" },
    "synthetic@example.test",
  );
  const first = await f.key(0), other = await f.key(0);
  const args = {
    connection_id: connection.id,
    query: "subject:synthetic",
    limit: 1,
  };
  const call = (token: string, arguments_: unknown) =>
    f.rpc(token, "tools/call", { name: "gmail_search", arguments: arguments_ });
  const requested = await call(first.token, args);
  assertEquals(requested.result.isError, true);
  const pending = JSON.parse(requested.result.content[0].text);
  assertEquals(new URL(pending.approvalUrl).origin, "https://swarm.test");
  assertEquals(gmailReads, 0);
  const requestId = pending.approvalId;
  assertEquals((await f.api(1, `gmail-approvals/${requestId}`)).status, 404);
  const preview = await (await f.api(0, `gmail-approvals/${requestId}`)).json();
  assertEquals(preview.query, args.query);
  assertEquals(preview.limit, 1);
  assertEquals(preview.accountLabel, "synthetic@example.test");
  assertEquals(
    (await f.api(0, `gmail-approvals/${requestId}`, "POST", {
      action: "approve",
    })).status,
    400,
  );
  const retry = { ...args, approval_id: requestId };
  assertEquals((await call(first.token, retry)).result.isError, true);
  assertEquals(gmailReads, 0);
  assertEquals(
    (await f.api(0, `gmail-approvals/${requestId}`, "POST", {
      action: "approve",
      limitedUseAccepted: true,
    })).status,
    200,
  );
  for (
    const [token, changed] of [[other.token, retry], [first.token, {
      ...retry,
      query: "other",
    }], [first.token, { ...retry, limit: 2 }]] as const
  ) {
    assertEquals((await call(token, changed)).result.isError, true);
  }
  assertEquals(gmailReads, 0);
  const results = await Promise.all([
    call(first.token, retry),
    call(first.token, retry),
  ]);
  assertEquals(results.filter((r) => !r.result.isError).length, 1);
  assertEquals(gmailReads, 1);
  assertEquals(f.tables.swarm_gmail_approvals[0].ciphertext, null);
  assertEquals((await call(first.token, retry)).result.isError, true);
  assertEquals(gmailReads, 1);
});

Deno.test("Gmail denies expired, rejected, changed, and revoked access without contacting Google", async () => {
  for (
    const scenario of [
      "expired",
      "denied",
      "changed",
      "disabled",
      "revoked",
      "unshared",
    ] as const
  ) {
    const f = fixture(() => {
      throw new Error("Google must not receive this request.");
    });
    const response = await f.api(0, "connections", "POST", {
      kind: "native",
      provider: "gmail",
      name: "Synthetic",
    });
    const { connection } = await response.json();
    await f.store.saveCredential(await f.store.get(users[0], connection.id), {
      accessToken: "synthetic-token",
    }, "synthetic@example.test");
    if (scenario === "unshared") f.shares.set(connection.id, ["gmail_search"]);
    const caller = scenario === "unshared" ? 1 : 0;
    const key = await f.key(caller);
    const args = { connection_id: connection.id, query: "synthetic" };
    const call = (arguments_: unknown) =>
      f.rpc(key.token, "tools/call", {
        name: "gmail_search",
        arguments: arguments_,
      });
    const pending = JSON.parse((await call(args)).result.content[0].text);
    const id = pending.approvalId;
    assertEquals(
      (await f.api(caller, `gmail-approvals/${id}`, "POST", {
        action: scenario === "denied" ? "deny" : "approve",
        limitedUseAccepted: true,
      })).status,
      200,
    );
    const row = f.tables.swarm_user_connections[0];
    if (scenario === "expired") {
      f.tables.swarm_gmail_approvals[0].expires_at = new Date(0).toISOString();
    }
    if (scenario === "changed") row.revision = Number(row.revision) + 1;
    if (scenario === "disabled") row.enabled_tools = [];
    if (scenario === "revoked") {
      f.tables.swarm_user_mcp_keys[0].revoked_at = new Date().toISOString();
    }
    if (scenario === "unshared") f.shares.clear();
    const result = await call({ ...args, approval_id: id });
    assert(result.status === 401 || result.result.isError, scenario);
  }
});
