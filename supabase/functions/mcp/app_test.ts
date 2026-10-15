import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createApp } from "./app.ts";

const accessToken = "a".repeat(64);

function request(body: unknown, credential = accessToken, origin?: string) {
  return new Request("https://example.test/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

Deno.test("only authenticated agents can discover tools", async () => {
  const app = createApp({ accessToken });
  for (const credential of ["", "wrong", "a".repeat(63)]) {
    const response = await app(
      request({ jsonrpc: "2.0", id: 1, method: "tools/list" }, credential),
    );
    assertEquals(response.status, 401);
    assertEquals(response.headers.get("Cache-Control"), "no-store");
    await response.body?.cancel();
  }
  const unavailable = await createApp({})(request({}));
  assertEquals(unavailable.status, 503);
  await unavailable.body?.cancel();
});

Deno.test("browser origins and oversized requests cannot reach the tools", async () => {
  const app = createApp({ accessToken });
  const origin = await app(request({}, accessToken, "https://untrusted.test"));
  assertEquals(origin.status, 403);
  await origin.body?.cancel();
  const large = await app(request({ text: "x".repeat(33_000) }));
  assertEquals(large.status, 413);
  await large.body?.cancel();
});

Deno.test("an MCP client can discover tools and read allowed GitHub pull requests", async () => {
  const app = createApp(
    {
      accessToken,
      githubToken: "test-provider-credential",
      githubRepositories: ["demo/project"],
    },
    () =>
      Promise.resolve(Response.json([{
        number: 12,
        title: "Fix issue",
        html_url: "https://github.com/demo/project/pull/12",
        state: "open",
      }])),
  );
  const client = new Client({ name: "swarm-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL("https://example.test/mcp"),
    {
      requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
      fetch: (input, init) => app(new Request(input, init)),
    },
  );
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    assertEquals(names.includes("github_list_pull_requests"), true);
    assertEquals(names.includes("hub_status"), true);
    const result = await client.callTool({
      name: "github_list_pull_requests",
      arguments: { owner: "demo", repo: "project" },
    });
    assertEquals(result.isError, undefined);
    assertStringIncludes(JSON.stringify(result.content), "Fix issue");
    const denied = await client.callTool({
      name: "github_list_pull_requests",
      arguments: { owner: "other", repo: "private" },
    });
    assertEquals(denied.isError, true);
    assertStringIncludes(JSON.stringify(denied.content), "not allowed");
    const invalid = await client.callTool({
      name: "github_list_pull_requests",
      arguments: { owner: "demo", repo: "project", limit: 101 },
    });
    assertEquals(invalid.isError, true);
  } finally {
    await client.close();
  }
});

Deno.test("provider failures produce an error without exposing credentials or response bodies", async () => {
  const app = createApp({
    accessToken,
    githubToken: "test-provider-credential",
    githubRepositories: ["demo/project"],
  }, () => Promise.resolve(new Response("provider-secret", { status: 401 })));
  const response = await app(
    request({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "github_list_pull_requests",
        arguments: { owner: "demo", repo: "project" },
      },
    }),
  );
  const body = await response.text();
  assertStringIncludes(body, "HTTP 401");
  assertEquals(body.includes("test-provider-credential"), false);
  assertEquals(body.includes("provider-secret"), false);
});
