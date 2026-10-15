import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { JSDOM } from "jsdom";

const endpoint = "https://fixture.supabase.co/functions/v1/mcp";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1), member = id(2), orgId = id(3), connectionId = id(4);
const token = () => randomBytes(32).toString("hex");
const until = async (check) => {
  const deadline = Date.now() + 3000;
  while (!check()) {
    assert.ok(Date.now() < deadline, "The expected team state did not appear.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
function click(w, name, root = w.document) {
  const control = [...root.querySelectorAll("button")].find((b) =>
    b.textContent === name
  );
  assert.ok(control, `Missing button: ${name}`);
  control.click();
}
function send(w, form) {
  form.dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
}
async function page(
  {
    invite,
    expectedInvite = invite,
    saved = [],
    actor = owner,
    intercept = () => undefined,
  } = {},
) {
  const dom = new JSDOM(await readFile("web/index.html", "utf8"), {
    url: `https://fixture.test/swarm/${invite ? `#invite=${invite}` : ""}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const state = {
    organization: null,
    accepted: false,
    shares: [],
    invitations: [],
    removed: false,
  };
  const user = {
    id: actor,
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
  const connection = {
    id: connectionId,
    name: "Private account",
    kind: "native",
    provider: "github",
    status: "connected",
    settings: {},
    tools: [{ id: "read", name: "Read issues" }, {
      id: "write",
      name: "Write issues",
    }],
    enabledTools: ["read"],
  };
  const organization = () => ({
    id: orgId,
    name: "Example team",
    role: actor === owner ? "owner" : "member",
  });
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
      assert.ok(
        !String(url).includes(invite || "never-a-real-token"),
        "Invitation secrets must stay out of request URLs.",
      );
      const path = String(url).replace(endpoint, "");
      const replacement = intercept(path, options);
      if (replacement !== undefined) return replacement;
      if (path === "/config") {
        return Response.json({
          projectUrl: "https://fixture.supabase.co",
          anonKey: "fixture-anon",
          services: [],
          customApprovedHosts: [],
        });
      }
      if (String(url).includes("/auth/v1/token")) return Response.json(session);
      if (String(url).includes("/auth/v1/user")) return Response.json(user);
      if (String(url).includes("/auth/v1/logout")) {
        return new Response(null, {
          status: 204,
        });
      }
      if (path === "/v1/connections") {
        return Response.json({
          connections: actor === owner ? [connection] : [],
          endpointUrl: endpoint,
        });
      }
      if (path === "/v1/invitations/preview") {
        return Response.json({
          organization: { id: orgId, name: "Example team" },
        });
      }
      if (path === "/v1/invitations/accept") {
        assert.equal(JSON.parse(options.body).token, expectedInvite);
        state.accepted = true;
        state.organization = organization();
        return Response.json({ organization: state.organization });
      }
      if (path === "/v1/organizations") {
        if (options.method === "POST") state.organization = organization();
        return Response.json(
          options.method === "POST"
            ? { organization: state.organization }
            : { organizations: state.organization ? [state.organization] : [] },
        );
      }
      if (path === `/v1/organizations/${orgId}`) {
        if (options.method === "DELETE") {
          state.organization = null;
          return new Response(null, { status: 204 });
        }
        return Response.json({
          organization: {
            ...organization(),
            members: [
              { userId: owner, role: "owner" },
              ...(!state.removed ? [{ userId: member, role: "member" }] : []),
            ],
            invitations: state.invitations,
            shares: state.shares,
          },
        });
      }
      if (
        path === `/v1/organizations/${orgId}/invitations` &&
        options.method === "POST"
      ) {
        const invitation = {
          id: id(5),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          usedAt: null,
          revokedAt: null,
        };
        state.invitations.push(invitation);
        return Response.json({
          invitation,
          invitationUrl: `https://fixture.test/swarm/#invite=${token()}`,
        });
      }
      if (path === `/v1/organizations/${orgId}/invitations/${id(5)}`) {
        state.invitations[0].revokedAt = new Date().toISOString();
        return new Response(null, { status: 204 });
      }
      if (path === `/v1/organizations/${orgId}/shares/${connectionId}`) {
        state.shares = options.method === "DELETE" ? [] : [{
          connectionId,
          ownerId: owner,
          name: connection.name,
          kind: "native",
          provider: "github",
          toolIds: JSON.parse(options.body).toolIds,
          tools: [connection.tools[0]],
        }];
        return options.method === "DELETE"
          ? new Response(null, { status: 204 })
          : Response.json({ share: state.shares[0] });
      }
      if (path === `/v1/organizations/${orgId}/members/${member}`) {
        state.removed = true;
        if (actor === member) state.organization = null;
        return new Response(null, { status: 204 });
      }
      throw new Error("Unexpected fixture route.");
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
  for (const [key, value] of saved) w.sessionStorage.setItem(key, value);
  w.eval(
    (await readFile("web/dist/app.js", "utf8")).replaceAll(
      "https://xatpcwatmcpjznhwgpit.supabase.co/functions/v1/mcp",
      endpoint,
    ),
  );
  const signIn = async () => {
    await until(() => !w.document.querySelector("#signin-panel").hidden);
    w.document.querySelector("#email").value = user.email;
    w.document.querySelector("#password").value = "fixture-password";
    send(w, w.document.querySelector("#signin-form"));
    await until(() =>
      w.document.querySelector("#teams-panel")?.hidden === false
    );
  };
  return { w, state, connection, signIn, close: () => w.close() };
}

test("An invitation survives sign-in and reload but joins only after explicit acceptance", async () => {
  const invite = token();
  const first = await page({ invite, actor: member });
  let saved;
  try {
    await until(() => first.w.location.hash === "");
    assert.equal(first.state.accepted, false);
    saved = Object.entries(first.w.sessionStorage);
    assert.ok(
      !Object.values(first.w.localStorage).some((v) => v.includes(invite)),
    );
  } finally {
    first.close();
  }
  const p = await page({ expectedInvite: invite, actor: member, saved });
  try {
    await p.signIn();
    await until(() =>
      p.w.document.querySelector("#invitation-panel")?.textContent.includes(
        "Example team",
      )
    );
    assert.equal(p.state.accepted, false);
    click(p.w, "Accept invitation");
    await until(() =>
      p.state.accepted && p.w.document.querySelector("#invitation-panel").hidden
    );
    assert.ok(
      !Object.values(p.w.sessionStorage).some((v) => v.includes(invite)),
    );
    assert.ok(
      !p.w.document.querySelector("#team-detail").textContent.includes(
        "Create invitation",
      ),
    );
    click(p.w, "Leave organization");
    await until(() => p.state.removed);
  } finally {
    p.close();
  }
});

test("An owner creates a team, shares selected enabled tools, withdraws, revokes, removes, and deletes", async () => {
  const p = await page();
  try {
    p.connection.enabledTools = ["read", "write"];
    await p.signIn();
    const form = p.w.document.querySelector("#organization-form");
    p.w.document.querySelector("#organization-name").value = "Example team";
    send(p.w, form);
    await until(() =>
      p.w.document.querySelector("#team-detail").textContent.includes(
        "Create invitation",
      )
    );
    assert.ok(
      !p.w.document.querySelector("#team-detail").textContent.includes(
        "Leave organization",
      ),
    );
    const shareForm = p.w.document.querySelector("form.share-tools");
    const checks = shareForm.querySelectorAll("input[type=checkbox]");
    assert.equal(checks.length, 2);
    assert.ok(p.w.document.querySelector(`label[for="${checks[0].id}"]`));
    checks[0].checked = true;
    send(p.w, shareForm);
    await until(() => p.state.shares.length === 1);
    assert.deepEqual(p.state.shares[0].toolIds, ["read"]);
    await until(() =>
      p.w.document.querySelector("#team-detail").textContent.includes(
        "Withdraw sharing",
      )
    );
    click(p.w, "Withdraw sharing");
    await until(() => p.state.shares.length === 0);
    click(p.w, "Create invitation");
    await until(() => p.w.document.querySelector("#invitation-link")?.value);
    click(p.w, "Copy invitation link");
    await until(() => p.w.copied);
    assert.equal(new URL(p.w.copied).search, "");
    assert.ok(new URL(p.w.copied).hash.startsWith("#invite="));
    click(p.w, "Revoke invitation");
    await until(() => p.state.invitations[0].revokedAt);
    click(p.w, "Remove member");
    await until(() => p.state.removed);
    click(p.w, "Delete organization");
    await until(() => p.state.organization === null);
  } finally {
    p.close();
  }
});

for (const status of [404, 409, 503]) {
  test(`Invitation failure ${status} cannot create membership or expose an acceptance control`, async () => {
    const p = await page({
      invite: token(),
      actor: member,
      intercept(path) {
        if (path === "/v1/invitations/preview") {
          return Response.json({ error: "Invitation unavailable." }, {
            status,
          });
        }
      },
    });
    try {
      await p.signIn();
      await until(() =>
        p.w.document.querySelector("#invitation-panel [role=alert]")
          ?.textContent.includes(
            "Invitation unavailable",
          )
      );
      assert.equal(p.state.accepted, false);
      assert.ok(
        ![...p.w.document.querySelectorAll("button")].some((b) =>
          b.textContent === "Accept invitation"
        ),
      );
      assert.equal(
        p.w.document.querySelector("#invitation-panel [role=alert]")
          .getAttribute("role"),
        "alert",
      );
      click(p.w, "Dismiss invitation");
      assert.equal(
        p.w.document.querySelector("#invitation-panel").hidden,
        true,
      );
    } finally {
      p.close();
    }
  });
}

test("Blocked session storage prevents a redirect that would lose the pending invitation", async () => {
  const p = await page({ invite: token() });
  try {
    await until(() => !p.w.document.querySelector("#signin-panel").hidden);
    const original = p.w.Storage.prototype.setItem;
    p.w.Storage.prototype.setItem = function (key, value) {
      if (this === p.w.sessionStorage) {
        throw new Error("Blocked storage fixture");
      }
      return original.call(this, key, value);
    };
    click(p.w, "Continue with GitHub");
    await until(() =>
      p.w.document.querySelector("#error").textContent.includes(
        "storage is unavailable",
      )
    );
    assert.equal(p.w.location.pathname, "/swarm/");
    await p.signIn();
    await until(() =>
      p.w.document.querySelector("#invitation-panel").textContent.includes(
        "Accept invitation",
      )
    );
    assert.equal(p.state.accepted, false);
  } finally {
    p.close();
  }
});

test("A dismissed invitation cannot return when an older preview completes", async () => {
  let release, waiting = false;
  const p = await page({
    invite: token(),
    actor: member,
    intercept(path) {
      if (path !== "/v1/invitations/preview") return;
      waiting = true;
      return new Promise((resolve) => {
        release = () =>
          resolve(
            Response.json({ organization: { id: orgId, name: "Old team" } }),
          );
      });
    },
  });
  try {
    await p.signIn();
    await until(() => waiting);
    click(p.w, "Dismiss invitation");
    release();
    await until(() =>
      p.w.document.querySelector("#notice").textContent ===
        "Connections loaded."
    );
    assert.equal(p.w.document.querySelector("#invitation-panel").hidden, true);
    assert.equal(p.state.accepted, false);
  } finally {
    p.close();
  }
});

test("A response from the previous account cannot restore organization details after sign-out", async () => {
  let delay = false, release, waiting = false;
  const p = await page({
    intercept(path) {
      if (!delay || path !== "/v1/organizations") return;
      waiting = true;
      return new Promise((resolve) => {
        release = () =>
          resolve(
            Response.json({
              organizations: [{ id: orgId, name: "Old team", role: "owner" }],
            }),
          );
      });
    },
  });
  try {
    await p.signIn();
    await until(() =>
      p.w.document.querySelector("#notice").textContent ===
        "Connections loaded."
    );
    delay = true;
    click(p.w, "Refresh organizations");
    await until(() => waiting);
    click(p.w, "Sign out");
    await until(() => !p.w.document.querySelector("#signin-panel").hidden);
    release();
    await until(() =>
      p.w.document.querySelector("#refresh-teams").getAttribute(
        "aria-disabled",
      ) === "false"
    );
    assert.equal(p.w.document.querySelector("#teams-panel").hidden, true);
    assert.equal(p.w.document.querySelector("#organizations").textContent, "");
    assert.equal(p.w.document.querySelector("#team-detail").textContent, "");
  } finally {
    p.close();
  }
});

for (
  const saved of [
    [[
      "swarm-pending-invitation",
      JSON.stringify({ token: token(), expiresAt: Date.now() - 1 }),
    ]],
    [[
      "swarm-pending-invitation",
      JSON.stringify({ token: "invalid", expiresAt: Date.now() + 86400000 }),
    ]],
  ]
) {
  test("Expired or invalid stored invitations cannot add membership", async () => {
    const p = await page({ saved });
    try {
      await p.signIn();
      assert.equal(p.state.accepted, false);
      assert.equal(
        p.w.document.querySelector("#invitation-panel").hidden,
        true,
      );
      assert.equal(
        p.w.sessionStorage.getItem("swarm-pending-invitation"),
        null,
      );
    } finally {
      p.close();
    }
  });
}

test("A connection owner can withdraw an existing share after disabling its last tool", async () => {
  const p = await page();
  try {
    await p.signIn();
    p.w.document.querySelector("#organization-name").value = "Example team";
    send(p.w, p.w.document.querySelector("#organization-form"));
    await until(() => p.w.document.querySelector("form.share-tools"));
    p.w.document.querySelector("form.share-tools input").checked = true;
    send(p.w, p.w.document.querySelector("form.share-tools"));
    await until(() =>
      p.w.document.querySelector("#notice").textContent ===
        "Selected tools shared."
    );
    p.connection.enabledTools = [];
    click(p.w, "Refresh accounts");
    await until(() =>
      p.w.document.querySelector("#notice").textContent ===
        "Connections refreshed."
    );
    click(p.w, "Withdraw sharing");
    await until(() => p.state.shares.length === 0);
  } finally {
    p.close();
  }
});

test("An invitation opened in an existing tab is removed from the address and still requires acceptance", async () => {
  const p = await page({ actor: member });
  try {
    await p.signIn();
    p.w.location.hash = `invite=${token()}`;
    await until(() =>
      p.w.location.hash === "" &&
      p.w.document.querySelector("#invitation-panel").textContent.includes(
        "Accept invitation",
      )
    );
    assert.equal(p.state.accepted, false);
  } finally {
    p.close();
  }
});

test("A failed detail refresh preserves the focused control and the organization view", async () => {
  let fail = false;
  const p = await page({
    intercept(path) {
      if (fail && path === `/v1/organizations/${orgId}`) {
        return Response.json({ error: "Team storage is unavailable." }, {
          status: 503,
        });
      }
    },
  });
  try {
    await p.signIn();
    p.w.document.querySelector("#organization-name").value = "Example team";
    send(p.w, p.w.document.querySelector("#organization-form"));
    await until(() => p.w.document.querySelector("form.share-tools"));
    const form = p.w.document.querySelector("form.share-tools");
    const save = form.querySelector("button[type=submit]");
    form.querySelector("input").checked = true;
    save.focus();
    fail = true;
    send(p.w, form);
    await until(() =>
      p.w.document.querySelector("#error").textContent.includes(
        "Team storage is unavailable",
      )
    );
    assert.equal(p.w.document.activeElement, save);
    assert.ok(
      p.w.document.querySelector("#team-detail").textContent.includes(
        "Example team",
      ),
    );
  } finally {
    p.close();
  }
});

for (const action of ["preview", "accept"]) {
  test(`Sign-out during invitation ${action} cannot restore the prior account view`, async () => {
    let release, waiting = false;
    const p = await page({
      invite: token(),
      actor: member,
      intercept(path) {
        if (path !== `/v1/invitations/${action}`) return;
        waiting = true;
        return new Promise((resolve) => {
          release = () =>
            resolve(
              Response.json({
                organization: { id: orgId, name: "Old team", role: "member" },
              }),
            );
        });
      },
    });
    try {
      await p.signIn();
      if (action === "accept") {
        await until(() =>
          p.w.document.querySelector("#invitation-panel").textContent.includes(
            "Accept invitation",
          )
        );
        click(p.w, "Accept invitation");
      }
      await until(() => waiting);
      click(p.w, "Sign out");
      await until(() => !p.w.document.querySelector("#signin-panel").hidden);
      release();
      await until(() =>
        p.w.document.querySelector("#signin-form button[type=submit]")
          .getAttribute("aria-disabled") === "false"
      );
      assert.equal(p.w.document.querySelector("#teams-panel").hidden, true);
      assert.equal(p.w.document.querySelector("#team-detail").textContent, "");
      assert.ok(
        !p.w.document.querySelector("#invitation-panel").textContent.includes(
          "Accept invitation",
        ),
      );
      assert.ok(
        p.w.document.querySelector("#invitation-panel").textContent.includes(
          "Sign in",
        ),
      );
    } finally {
      p.close();
    }
  });
}

test("A recipient sees selected shared metadata without private connection management", async () => {
  const p = await page({ actor: member });
  try {
    p.state.organization = { id: orgId, name: "Example team", role: "member" };
    p.state.shares = [{
      connectionId,
      ownerId: owner,
      name: "Shared account",
      toolIds: ["read"],
      tools: [{ id: "read", name: "Read issues" }],
      endpointUrl: "https://private.example.test",
      accountLabel: "Private label",
      settings: { private: true },
    }];
    await p.signIn();
    click(p.w, "Example team · member");
    await until(() =>
      p.w.document.querySelector("#team-detail").textContent.includes(
        "Shared account",
      )
    );
    const root = p.w.document.querySelector("#team-detail");
    assert.ok(root.textContent.includes("Read issues"));
    assert.ok(root.textContent.includes(connectionId));
    assert.ok(!root.textContent.includes("Private label"));
    assert.ok(!root.textContent.includes("private.example"));
    assert.equal(root.querySelectorAll("form.share-tools").length, 0);
    for (
      const name of [
        "Reconnect",
        "Account settings",
        "Remove member",
        "Withdraw sharing",
        "Delete organization",
      ]
    ) {
      assert.ok(
        ![...root.querySelectorAll("button, summary")].some((control) =>
          control.textContent === name
        ),
      );
    }
  } finally {
    p.close();
  }
});

test("An unrelated failed invitation preview cannot hide a newly created link or remove sharing focus", async () => {
  const p = await page({
    invite: token(),
    intercept(path) {
      if (path === "/v1/invitations/preview") {
        return Response.json({ error: "Invitation unavailable." }, {
          status: 404,
        });
      }
    },
  });
  try {
    await p.signIn();
    p.w.document.querySelector("#organization-name").value = "Example team";
    send(p.w, p.w.document.querySelector("#organization-form"));
    await until(() => p.w.document.querySelector("form.share-tools"));
    click(p.w, "Create invitation");
    await until(() => p.w.document.querySelector("#invitation-link")?.value);
    const form = p.w.document.querySelector("form.share-tools");
    form.querySelector("input").checked = true;
    form.querySelector("button[type=submit]").focus();
    send(p.w, form);
    await until(() =>
      p.w.document.querySelector("#notice").textContent ===
        "Selected tools shared."
    );
    assert.equal(
      p.w.document.activeElement,
      p.w.document.querySelector("#team-detail"),
    );
    assert.ok(
      p.w.document.querySelector("#invitation-panel [role=alert]").textContent
        .includes("Invitation unavailable"),
    );
  } finally {
    p.close();
  }
});

test("An invitation creation result stays available when its next detail refresh fails", async () => {
  let fail = false;
  const p = await page({
    intercept(path) {
      if (fail && path === `/v1/organizations/${orgId}`) {
        return Response.json({ error: "Team storage is unavailable." }, {
          status: 503,
        });
      }
    },
  });
  try {
    await p.signIn();
    p.w.document.querySelector("#organization-name").value = "Example team";
    send(p.w, p.w.document.querySelector("#organization-form"));
    await until(() => p.w.document.querySelector("form.share-tools"));
    fail = true;
    click(p.w, "Create invitation");
    await until(() =>
      p.w.document.querySelector("#error").textContent.includes(
        "Team storage is unavailable",
      )
    );
    assert.ok(p.w.document.querySelector("#invitation-link")?.value);
  } finally {
    p.close();
  }
});

test("A failed organization switch keeps invitation creation attached to the visible organization", async () => {
  const other = { id: id(9), name: "Other team", role: "owner" };
  const p = await page({
    intercept(path, options) {
      if (
        path === "/v1/organizations" && options.method === "GET" &&
        p?.state.organization
      ) {
        return Response.json({ organizations: [p.state.organization, other] });
      }
      if (path === `/v1/organizations/${other.id}`) {
        return Response.json({ error: "Team storage is unavailable." }, {
          status: 503,
        });
      }
    },
  });
  try {
    await p.signIn();
    p.w.document.querySelector("#organization-name").value = "Example team";
    send(p.w, p.w.document.querySelector("#organization-form"));
    await until(() => p.w.document.querySelector("form.share-tools"));
    click(p.w, "Other team · owner");
    await until(() =>
      p.w.document.querySelector("#error").textContent.includes(
        "Team storage is unavailable",
      )
    );
    assert.ok(
      p.w.document.querySelector("#team-detail").textContent.includes(
        "Example team",
      ),
    );
    click(p.w, "Create invitation");
    await until(() => p.w.document.querySelector("#invitation-link")?.value);
    assert.ok(
      p.w.document.querySelector("#team-detail").textContent.includes(
        "Example team",
      ),
    );
    assert.equal(p.state.invitations.length, 1);
  } finally {
    p.close();
  }
});
