import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const endpoint = "https://fixture.supabase.co/functions/v1/mcp";
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "fixture@example.test",
  aud: "authenticated",
};
const session = {
  access_token: "fixture-access",
  refresh_token: "fixture-refresh",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user,
};
const initial = ["Work", "Personal"].map((name, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i + 2}`,
  kind: "native",
  provider: "github",
  name,
  status: "connected",
  settings: { repositories: ["example/project"] },
  tools: [{
    id: "github_list_pull_requests",
    name: "Read pull requests",
    description: "Read allowed repositories.",
  }],
  enabledTools: ["github_list_pull_requests"],
}));

async function page(saved, intercept = () => undefined) {
  const dom = new JSDOM(await readFile("web/index.html", "utf8"), {
    url: "https://fixture.test/swarm/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const connections = structuredClone(initial);
  let revoked = false;
  Object.assign(w, {
    TextEncoder,
    TextDecoder,
    Headers,
    Request,
    Response,
    AbortController,
    AbortSignal,
    // deno-lint-ignore require-await
    fetch: async (url, options = {}) => {
      const path = String(url).replace(endpoint, "");
      const replacement = intercept(path, options);
      if (replacement !== undefined) return replacement;
      if (path === "/config") {
        return Response.json({
          projectUrl: "https://fixture.supabase.co",
          anonKey: "fixture-anon",
          services: [{ provider: "github", configured: true }],
          customApprovedHosts: ["mcp.deepwiki.com"],
        });
      }
      if (String(url).includes("/auth/v1/token")) return Response.json(session);
      if (String(url).includes("/auth/v1/user")) return Response.json(user);
      if (String(url).includes("/auth/v1/logout")) {
        return new Response(null, {
          status: 204,
        });
      }
      if (path === "/v1/organizations") {
        return Response.json({ organizations: [] });
      }
      if (path === "/v1/connections") {
        return Response.json({ connections, endpointUrl: endpoint });
      }
      const item = connections.find((c) => path === `/v1/connections/${c.id}`);
      if (item && options.method === "PATCH") {
        Object.assign(item, JSON.parse(options.body));
        return Response.json({ connection: item });
      }
      if (path === "/v1/access-keys" && options.method === "POST") {
        return Response.json({
          id: "new-key",
          token: "fixture-private-key",
          endpointUrl: endpoint,
          configuration: {
            mcpServers: {
              swarm: {
                url: endpoint,
                headers: { Authorization: "Bearer fixture-private-key" },
              },
            },
          },
        }, { status: 201 });
      }
      if (path === "/v1/access-keys/new-key" && options.method === "DELETE") {
        revoked = true;
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fixture route: ${path}`);
    },
  });
  w.confirm = () => true;
  w.navigator.locks = undefined;
  Object.defineProperty(w.navigator, "clipboard", {
    value: {
      writeText: (text) => {
        w.copied = text;
        return Promise.resolve();
      },
    },
  });
  if (saved) { for (const [k, v] of saved) w.localStorage.setItem(k, v); }
  w.eval(
    (await readFile("web/dist/app.js", "utf8")).replace(
      /https:\/\/xatpcwatmcpjznhwgpit.supabase.co\/functions\/v1\/mcp/g,
      endpoint,
    ),
  );
  return {
    w,
    connections,
    revoked: () => revoked,
    close: () => dom.window.close(),
  };
}
async function until(check) {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline) {
      assert.fail("The expected page state did not appear.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
function click(w, text) {
  const b = [...w.document.querySelectorAll("button")].find((b) =>
    b.textContent === text
  );
  assert.ok(b, `Missing button: ${text}`);
  b.click();
}
async function signIn(w) {
  await until(() =>
    !w.document.querySelector("#signin-panel").hidden &&
    w.document.querySelector("#notice").textContent !== "Loading Swarm…"
  );
  w.document.querySelector("#email").value = user.email;
  w.document.querySelector("#password").value = "fixture-password";
  w.document.querySelector("#signin-form").dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await until(() => !w.document.querySelector("#connections-panel").hidden);
  await until(() =>
    w.document.querySelectorAll("article.service").length === 2
  );
}

test("A user signs in, manages two accounts, saves agent setup, and signs out", async () => {
  const p = await page();
  try {
    await signIn(p.w);
    const cards = p.w.document.querySelectorAll("article.service");
    assert.deepEqual([...cards].map((c) => c.querySelector("h4").textContent), [
      "Work",
      "Personal",
    ]);
    const checkbox = cards[0].querySelector("input[type=checkbox]");
    assert.ok(p.w.document.querySelector(`label[for="${checkbox.id}"]`));
    checkbox.checked = false;
    cards[0].querySelector("form.tools").dispatchEvent(
      new p.w.Event("submit", { cancelable: true, bubbles: true }),
    );
    await until(() => p.connections[0].enabledTools.length === 0);
    assert.equal(p.connections[1].enabledTools.length, 1);
    click(p.w, "Create agent key");
    await until(() => !p.w.document.querySelector("#new-key").hidden);
    click(p.w, "Copy configuration");
    await until(() => p.w.copied);
    assert.equal(
      JSON.parse(p.w.copied).mcpServers.swarm.headers.Authorization,
      "Bearer fixture-private-key",
    );
    assert.ok(
      !Object.entries(p.w.localStorage).some(([, v]) =>
        v.includes("fixture-private-key")
      ),
    );
    click(p.w, "Revoke key");
    await until(p.revoked);
    click(p.w, "Sign out");
    await until(() => p.w.document.querySelector("#connections-panel").hidden);
    assert.equal(p.w.document.querySelectorAll("article.service").length, 0);
  } finally {
    p.close();
  }
});

test("Reload restores the user session and key controls without restoring the raw key", async () => {
  const p = await page();
  let saved;
  try {
    await signIn(p.w);
    click(p.w, "Create agent key");
    await until(() => !p.w.document.querySelector("#new-key").hidden);
    saved = Object.entries(p.w.localStorage);
  } finally {
    p.close();
  }
  const next = await page(saved);
  try {
    await until(() =>
      next.w.document.querySelectorAll("article.service").length === 2
    );
    assert.ok(next.w.document.querySelector("#new-key").hidden);
    click(next.w, "Revoke key");
    await until(next.revoked);
  } finally {
    next.close();
  }
});

test("A key response from an earlier session cannot reveal or save the key after sign-in", async () => {
  let release, pending = false;
  const p = await page(undefined, (path) => {
    if (path !== "/v1/access-keys") return;
    return {
      ok: true,
      status: 201,
      json: () => {
        pending = true;
        return new Promise((resolve) => {
          release = () =>
            resolve({
              id: "old-key",
              token: "old-private-key",
              configuration: {},
            });
        });
      },
    };
  });
  try {
    await signIn(p.w);
    click(p.w, "Create agent key");
    await until(() => pending);
    click(p.w, "Sign out");
    await until(() => !p.w.document.querySelector("#signin-panel").hidden);
    await signIn(p.w);
    release();
    await until(() =>
      p.w.document.querySelector("#create-key").getAttribute(
        "aria-disabled",
      ) === "false"
    );
    assert.ok(p.w.document.querySelector("#new-key").hidden);
    assert.equal(p.w.document.querySelector("#raw-key").value, "");
    assert.ok(
      !Object.entries(p.w.localStorage).some(([, value]) =>
        value.includes("old-key")
      ),
    );
  } finally {
    p.close();
  }
});

test("A restored session can sign out after the initial connections request fails", async () => {
  const first = await page();
  let saved;
  try {
    await signIn(first.w);
    saved = Object.entries(first.w.localStorage);
  } finally {
    first.close();
  }
  const p = await page(saved, (path) => {
    if (path === "/v1/connections") throw new Error("Offline fixture");
  });
  try {
    await until(() =>
      p.w.document.querySelector("#error").textContent.includes(
        "could not complete",
      )
    );
    click(p.w, "Sign out");
    await until(() => p.w.document.querySelector("#connections-panel").hidden);
  } finally {
    p.close();
  }
});

test("An older refresh cannot restore a tool after the user disables it", async () => {
  let delay = false, release, pending = false;
  const p = await page(undefined, (path) => {
    if (!delay || path !== "/v1/connections") return;
    delay = false;
    return {
      ok: true,
      status: 200,
      json: () => {
        pending = true;
        return new Promise((resolve) => {
          release = () =>
            resolve({
              connections: structuredClone(initial),
              endpointUrl: endpoint,
            });
        });
      },
    };
  });
  try {
    await signIn(p.w);
    delay = true;
    click(p.w, "Refresh accounts");
    await until(() => pending);
    const card = p.w.document.querySelector("article.service");
    card.querySelector("input[type=checkbox]").checked = false;
    card.querySelector("form.tools").dispatchEvent(
      new p.w.Event("submit", { cancelable: true, bubbles: true }),
    );
    await until(() =>
      p.w.document.querySelector("#notice").textContent ===
        "Tool permissions saved."
    );
    release();
    await until(() =>
      p.w.document.querySelector("#refresh-accounts").getAttribute(
        "aria-disabled",
      ) === "false"
    );
    assert.equal(
      p.w.document.querySelector("article.service input[type=checkbox]")
        .checked,
      false,
    );
  } finally {
    p.close();
  }
});

test("A browser storage failure keeps the new token and revocation control available", async () => {
  const p = await page();
  try {
    await signIn(p.w);
    const original = p.w.Storage.prototype.setItem;
    p.w.Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("swarm-key-ids:")) {
        throw new Error("Storage fixture full");
      }
      return original.call(this, key, value);
    };
    click(p.w, "Create agent key");
    await until(() =>
      p.w.document.querySelector("#create-key").getAttribute(
        "aria-disabled",
      ) === "false"
    );
    assert.equal(
      p.w.document.querySelector("#raw-key").value,
      "fixture-private-key",
    );
    assert.equal(p.w.document.querySelector("#new-key").hidden, false);
    click(p.w, "Revoke key");
    await until(p.revoked);
    await until(() => p.w.document.querySelector("#new-key").hidden);
  } finally {
    p.close();
  }
});

for (const unavailable of [false, true]) {
  test(`Provider authorization keeps browser proof separate from the URL (storage unavailable: ${unavailable})`, async () => {
    const state = "1".repeat(64), verifier = "a".repeat(64);
    const p = await page(undefined, (path) => {
      if (path.endsWith("/authorize")) {
        return Response.json({
          authorizationUrl:
            `https://github.com/login/oauth/authorize?state=${state}`,
          completionSecret: verifier,
        });
      }
    });
    const proof = new Map();
    const popup = {
      location: "about:blank",
      closed: false,
      close() {
        this.closed = true;
      },
      sessionStorage: {
        setItem(key, value) {
          if (unavailable) throw new Error("Storage fixture blocked");
          proof.set(key, value);
        },
      },
    };
    p.w.open = () => popup;
    try {
      await signIn(p.w);
      p.w.document.querySelector("article.service .actions button").click();
      await until(() =>
        p.w.document.querySelector("article.service .actions button")
          .getAttribute("aria-disabled") === "false"
      );
      if (unavailable) {
        assert.equal(popup.closed, true);
        assert.equal(popup.location, "about:blank");
        assert.match(
          p.w.document.querySelector("#error").textContent,
          /storage is unavailable/,
        );
      } else {
        assert.deepEqual(JSON.parse(proof.get(`swarm-oauth:${state}`)), {
          userId: user.id,
          verifier,
        });
        assert.ok(!popup.location.includes(verifier));
        assert.ok(popup.location.startsWith("https://github.com/"));
      }
    } finally {
      p.close();
    }
  });
}
