import { assert, assertEquals } from "@std/assert";
import { createBetaGateway } from "./beta-gateway.ts";
import { UserStore } from "./user-store.ts";
import { digest } from "./connection-store.ts";

const user = "11111111-1111-4111-8111-111111111111";
const org = "22222222-2222-4222-8222-222222222222";
const item = "33333333-3333-4333-8333-333333333333";
const config = {
  projectUrl: "https://project.test",
  anonKey: "public-test-key",
  uiUrl: "https://swarm.test/",
  endpointUrl: "https://project.test/functions/v1/mcp",
  clients: {},
  customPolicy: { approvedHosts: [] },
};
function fixture(result: unknown = {}, databaseStatus = 200) {
  const writes: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname === "/auth/v1/user") {
      return request.headers.get("Authorization") === "Bearer confirmed-session"
        ? Response.json({ id: user, email_confirmed_at: "2026-10-15" })
        : Response.json({}, { status: 401 });
    }
    if (new URL(request.url).pathname === "/rest/v1/rpc/swarm_team_manage") {
      writes.push(await request.json());
      return Response.json(result, { status: databaseStatus });
    }
    throw new Error("Unexpected remote request.");
  };
  const gateway = createBetaGateway(
    config,
    new UserStore({
      projectUrl: config.projectUrl,
      serviceKey: "service-test-key",
      encryptionKey: "a".repeat(64),
    }, fetcher),
    fetcher,
  );
  const call = (
    path: string,
    method = "GET",
    body?: unknown,
    authenticated = true,
  ) =>
    gateway(
      new Request(`${config.endpointUrl}/v1/${path}`, {
        method,
        headers: {
          ...(authenticated
            ? { Authorization: "Bearer confirmed-session" }
            : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          Origin: "https://swarm.test",
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    );
  return { writes, call };
}

Deno.test("team routes require a confirmed session before storage access", async () => {
  const f = fixture();
  for (
    const [path, method, body] of [
      ["organizations", "GET", undefined],
      ["organizations", "POST", { name: "Team" }],
      ["invitations/preview", "POST", { token: "a".repeat(64) }],
      ["invitations/accept", "POST", { token: "a".repeat(64) }],
      [`organizations/${org}`, "DELETE", undefined],
      [`organizations/${org}/shares/${item}`, "PATCH", { toolIds: ["read"] }],
    ] as const
  ) {
    assertEquals((await f.call(path, method, body, false)).status, 401);
  }
  assertEquals(f.writes.length, 0);
});
Deno.test("team routes reject spoofed identity and malformed selections", async () => {
  const f = fixture();
  for (
    const [path, body] of [
      ["organizations", { name: "Team", userId: item }],
      ["organizations", { name: " " }],
      ["organizations", { name: "x".repeat(101) }],
      ["invitations/accept", { token: "short" }],
      ["invitations/preview", { token: "a".repeat(64), userId: item }],
    ] as const
  ) assertEquals((await f.call(path, "POST", body)).status, 400);
  for (
    const toolIds of [[], [""], ["x".repeat(101)], Array(101).fill("read")]
  ) {
    assertEquals(
      (await f.call(`organizations/${org}/shares/${item}`, "PATCH", {
        toolIds,
      })).status,
      400,
    );
  }
  assertEquals(f.writes.length, 0);
});
Deno.test("organization creation uses the verified session and bounded name", async () => {
  const f = fixture({ id: org, name: "Team", role: "owner" });
  const response = await f.call("organizations", "POST", { name: " Team " });
  assertEquals(response.status, 201);
  assertEquals(await response.json(), {
    organization: { id: org, name: "Team", role: "owner" },
  });
  assertEquals(f.writes[0].p_user_id, user);
  assertEquals(response.headers.get("Cache-Control"), "no-store");
  assertEquals(
    response.headers.get("Access-Control-Allow-Origin"),
    "https://swarm.test",
  );
});
Deno.test("invitation links disclose a random token once and store only its hash", async () => {
  const f = fixture({ id: item, expiresAt: "2026-10-16T00:00:00Z" });
  const response = await f.call(`organizations/${org}/invitations`, "POST");
  assertEquals(response.status, 201);
  const value = await response.json();
  const link = new URL(value.invitationUrl);
  assertEquals(link.origin, "https://swarm.test");
  assertEquals(link.search, "");
  const token = new URLSearchParams(link.hash.slice(1)).get("invite")!;
  assert(/^[a-f0-9]{64}$/.test(token));
  assertEquals(
    (f.writes[0].p_input as Record<string, unknown>).tokenHash,
    await digest(token),
  );
  assert(!JSON.stringify(f.writes).includes(token));
});
Deno.test("invitation preview and acceptance use POST bodies and separate actions", async () => {
  for (const action of ["preview", "accept"]) {
    const f = fixture({
      id: org,
      name: "Team",
      ...(action === "accept" ? { role: "member" } : {}),
    });
    const response = await f.call(`invitations/${action}`, "POST", {
      token: "a".repeat(64),
    });
    assertEquals(response.status, 200);
    assertEquals(f.writes[0].p_action, action);
    assertEquals(f.writes[0].p_user_id, user);
    assertEquals(
      (f.writes[0].p_input as Record<string, unknown>).tokenHash,
      await digest("a".repeat(64)),
    );
    assertEquals(
      (await f.call(`invitations/${action}?token=${"a".repeat(64)}`)).status,
      404,
    );
  }
});
Deno.test("management denials pass through without exposing remote errors", async () => {
  for (
    const [status, message] of [[403, "The organization owner must do this."], [
      404,
      "Organization not found.",
    ], [409, "Delete your organization before you leave."]] as const
  ) {
    const f = fixture({ status, error: message });
    const response = await f.call(`organizations/${org}`, "DELETE");
    assertEquals(response.status, status);
    assertEquals(await response.json(), { error: message });
  }
  for (const result of [{ ciphertext: "private-fixture" }, null]) {
    const f = fixture(result);
    const response = await f.call("organizations");
    assertEquals(response.status >= 500, true);
    assert(!(await response.text()).includes("private-fixture"));
  }
  const f = fixture({ error: "private-fixture" }, 500);
  const response = await f.call("organizations");
  assertEquals(response.status, 503);
  assert(!(await response.text()).includes("private-fixture"));
});
Deno.test("member removal, invite revocation, and sharing keep verified ownership", async () => {
  for (
    const [path, method, body, action] of [
      [
        `organizations/${org}/members/${item}`,
        "DELETE",
        undefined,
        "remove_member",
      ],
      [
        `organizations/${org}/invitations/${item}`,
        "DELETE",
        undefined,
        "revoke_invite",
      ],
      [`organizations/${org}/shares/${item}`, "DELETE", undefined, "unshare"],
      [
        `organizations/${org}/shares/${item}`,
        "PATCH",
        { toolIds: ["read"] },
        "share",
      ],
    ] as const
  ) {
    const f = fixture(
      action === "share" ? { connectionId: item, toolIds: ["read"] } : {},
    );
    assertEquals(
      (await f.call(path, method, body)).status,
      action === "share" ? 200 : 204,
    );
    assertEquals(f.writes[0].p_user_id, user);
    assertEquals(f.writes[0].p_organization_id, org);
    assertEquals(f.writes[0].p_action, action);
  }
});

Deno.test("organization reads return selected metadata only", async () => {
  const summary = { id: org, name: "Team", role: "member" };
  const f = fixture([{
    ...summary,
    ciphertext: "private-fixture",
    token_hash: "private-fixture",
  }]);
  const list = await f.call("organizations");
  assertEquals(await list.json(), { organizations: [summary] });
  const d = fixture({
    ...summary,
    members: [{
      userId: user,
      role: "member",
      email: "synthetic@example.test",
    }],
    invitations: [],
    shares: [{
      connectionId: item,
      ownerId: user,
      name: "Shared account",
      kind: "native",
      provider: "github",
      toolIds: ["read"],
      tools: [{
        id: "read",
        name: "read",
        description: "Read items.",
        inputSchema: {},
        ciphertext: "private-fixture",
      }],
      ciphertext: "private-fixture",
      endpoint_url: "https://private-fixture.test",
      account_label: "private-fixture",
    }],
    token_hash: "private-fixture",
  });
  const response = await d.call(`organizations/${org}`);
  assertEquals(response.status, 200);
  const value = await response.text();
  assert(!value.includes("private-fixture"));
  assert(!value.includes("synthetic@example.test"));
  assertEquals(JSON.parse(value).organization.shares[0].toolIds, ["read"]);
});

Deno.test("team storage does not enable shared MCP execution in increment one", async () => {
  let upstream = 0;
  const fetcher: typeof fetch = (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/rest/v1/rpc/swarm_user_key_owner") {
      return Promise.resolve(Response.json(user));
    }
    if (url.pathname === "/rest/v1/swarm_user_connections") {
      return Promise.resolve(Response.json([]));
    }
    if (url.pathname === "/rest/v1/swarm_team_grants") {
      return Promise.resolve(
        Response.json([{
          organization_id: org,
          connection_id: item,
          tool_ids: ["github_list_pull_requests"],
        }]),
      );
    }
    upstream++;
    throw new Error("An unowned connection must not execute.");
  };
  const gateway = createBetaGateway(
    config,
    new UserStore({
      projectUrl: config.projectUrl,
      serviceKey: "service-test-key",
      encryptionKey: "a".repeat(64),
    }, fetcher),
    fetcher,
  );
  const response = await gateway(
    new Request(config.endpointUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${"k".repeat(64)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "github_list_pull_requests",
          arguments: { connection_id: item, owner: "example", repo: "test" },
        },
      }),
    }),
  );
  assertEquals(response.status, 200);
  assertEquals((await response.json()).result.isError, true);
  assertEquals(upstream, 0);
});
