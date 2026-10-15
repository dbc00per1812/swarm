import { assertEquals, assertStringIncludes } from "@std/assert";
import { type AppConfig, createApp } from "./app.ts";

const accessToken = "b".repeat(64);

async function call(
  config: AppConfig,
  name: string,
  args: unknown,
  provider: (url: string | URL, init?: RequestInit) => Promise<Response>,
) {
  const response = await createApp({ accessToken, ...config }, provider)(
    new Request("https://example.test/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  const body = await response.text();
  const event = body.split("\n").find((line) => line.startsWith("data: "));
  return JSON.parse(event ? event.slice(6) : body).result;
}

Deno.test("Slack search returns message text and detects API-level permission errors", async () => {
  for (
    const [ok, data] of [
      [true, {
        ok: true,
        messages: {
          matches: [{
            text: "Test message",
            ts: "1.0",
            permalink: "https://example.slack.com/archives/test",
            channel: { name: "demo" },
          }],
        },
      }],
      [false, {
        ok: false,
        error: "missing_scope",
        credential: "private-value",
      }],
    ] as const
  ) {
    const result = await call({ slackToken: "test-slack" }, "slack_search", {
      query: "demo",
    }, () => Promise.resolve(Response.json(data)));
    assertEquals(result.isError === true, !ok);
    assertStringIncludes(
      JSON.stringify(result),
      ok ? "Test message" : "Slack rejected",
    );
    assertEquals(JSON.stringify(result).includes("private-value"), false);
  }
});

Deno.test("Linear listing returns issue links and rejects GraphQL errors", async () => {
  const good = await call(
    { linearToken: "test-linear" },
    "linear_list_issues",
    {},
    () =>
      Promise.resolve(
        Response.json({
          data: {
            issues: {
              nodes: [{
                identifier: "DEMO-1",
                title: "Test issue",
                url: "https://linear.app/demo/issue/DEMO-1",
                state: { name: "Todo" },
              }],
            },
          },
        }),
      ),
  );
  assertStringIncludes(JSON.stringify(good), "DEMO-1");
  const bad = await call(
    { linearToken: "test-linear" },
    "linear_list_issues",
    {},
    () =>
      Promise.resolve(
        Response.json({ errors: [{ message: "private-error" }] }),
      ),
  );
  assertEquals(bad.isError, true);
  assertEquals(JSON.stringify(bad).includes("private-error"), false);
});

Deno.test("Gmail search refreshes authorization and returns message headers", async () => {
  const result = await call(
    {
      gmailClientId: "test-client",
      gmailClientSecret: "test-client-secret",
      gmailRefreshToken: "test-refresh",
    },
    "gmail_search",
    { query: "subject:demo", limit: 1 },
    (input) => {
      const url = new URL(input);
      if (url.hostname === "oauth2.googleapis.com") {
        return Promise.resolve(
          Response.json({ access_token: "test-access" }),
        );
      }
      if (url.pathname.endsWith("/messages")) {
        return Promise.resolve(
          Response.json({ messages: [{ id: "message-1" }] }),
        );
      }
      return Promise.resolve(
        Response.json({
          id: "message-1",
          threadId: "thread-1",
          payload: { headers: [{ name: "Subject", value: "Demo subject" }] },
        }),
      );
    },
  );
  assertEquals(result.isError, undefined);
  assertStringIncludes(JSON.stringify(result), "Demo subject");
  assertEquals(JSON.stringify(result).includes("test-access"), false);
});

Deno.test("missing connections and expired Gmail credentials fail clearly", async () => {
  for (
    const [name, args] of [["slack_search", { query: "demo" }], [
      "linear_list_issues",
      {},
    ], ["gmail_search", { query: "demo" }]] as const
  ) {
    const missing = await call(
      {},
      name,
      args,
      () => Promise.reject(new Error("Provider must not be called")),
    );
    assertEquals(missing.isError, true);
    assertStringIncludes(JSON.stringify(missing), "not configured");
  }
  const expired = await call(
    {
      gmailClientId: "test-client",
      gmailClientSecret: "test-secret",
      gmailRefreshToken: "expired",
    },
    "gmail_search",
    { query: "demo" },
    () => Promise.resolve(new Response("private-error", { status: 400 })),
  );
  assertEquals(expired.isError, true);
  assertStringIncludes(JSON.stringify(expired), "HTTP 400");
  assertEquals(JSON.stringify(expired).includes("private-error"), false);
});

Deno.test("valid Gmail refresh credentials recover access when a manual token expires", async () => {
  const result = await call(
    {
      gmailAccessToken: "expired-access",
      gmailClientId: "test-client",
      gmailClientSecret: "test-secret",
      gmailRefreshToken: "test-refresh",
    },
    "gmail_search",
    { query: "demo" },
    (input, init) => {
      const url = new URL(input);
      if (url.hostname === "oauth2.googleapis.com") {
        return Promise.resolve(
          Response.json({ access_token: "current-access" }),
        );
      }
      if (
        new Headers(init?.headers).get("Authorization") !==
          "Bearer current-access"
      ) {
        return Promise.resolve(new Response("Expired token", { status: 401 }));
      }
      return Promise.resolve(Response.json({ messages: [] }));
    },
  );
  assertEquals(result.isError, undefined);
});
