import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

for (
  const scenario of [
    "owner",
    "no-proof",
    "changed-user",
    "signed-out",
    "rejected",
  ]
) {
  test(`Provider completion ${scenario} requires the starting browser and owner session`, async () => {
    const state = "1".repeat(64), verifier = "a".repeat(64);
    const owner = "11111111-1111-4111-8111-111111111111";
    const dom = new JSDOM(await readFile("web/callback.html", "utf8"), {
      url:
        `https://fixture.test/swarm/callback.html#provider=github&state=${state}&code=fixture-code`,
      runScripts: "outside-only",
      pretendToBeVisual: true,
    });
    const w = dom.window;
    let completions = 0, posted = false;
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
        if (String(url).endsWith("/config")) {
          return Response.json({
            projectUrl: "https://project.supabase.co",
            anonKey: "fixture-anon",
          });
        }
        assert.ok(String(url).endsWith("/v1/oauth/complete"));
        completions++;
        assert.deepEqual(JSON.parse(options.body), {
          provider: "github",
          state,
          code: "fixture-code",
          verifier,
        });
        assert.equal(options.headers.Authorization, "Bearer fixture-access");
        return Response.json(
          scenario === "rejected"
            ? { error: "Denied" }
            : { provider: "github" },
          { status: scenario === "rejected" ? 400 : 200 },
        );
      },
    });
    if (scenario !== "signed-out") {
      w.localStorage.setItem(
        "sb-project-auth-token",
        JSON.stringify({
          access_token: "fixture-access",
          refresh_token: "fixture-refresh",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: scenario === "changed-user"
              ? "22222222-2222-4222-8222-222222222222"
              : owner,
            aud: "authenticated",
          },
        }),
      );
    }
    if (scenario !== "no-proof") {
      w.sessionStorage.setItem(
        `swarm-oauth:${state}`,
        JSON.stringify({ userId: owner, verifier }),
      );
    }
    Object.defineProperty(w, "opener", {
      value: {
        postMessage: (data, origin) => {
          posted = data.type === "swarm-connected" &&
            origin === "https://fixture.test";
        },
      },
    });
    const destroy = w.close.bind(w);
    w.close = () => {};
    try {
      w.eval(await readFile("web/dist/callback.js", "utf8"));
      const deadline = Date.now() + 3000;
      while (
        !/Connection saved\.|Connection not saved\./.test(
          w.document.querySelector("h1").textContent,
        )
      ) {
        if (Date.now() > deadline) assert.fail("The callback did not finish.");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(w.location.hash, "");
      assert.equal(w.sessionStorage.getItem(`swarm-oauth:${state}`), null);
      assert.equal(posted, scenario === "owner");
      assert.equal(
        completions,
        ["owner", "rejected"].includes(scenario) ? 1 : 0,
      );
      assert.equal(
        w.document.querySelector("h1").textContent,
        scenario === "owner" ? "Connection saved." : "Connection not saved.",
      );
    } finally {
      destroy();
    }
  });
}
