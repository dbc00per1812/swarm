import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createActivity } from "../activity.js";

test("activity shows real decisions, filters outcomes, and clears a pending response at signout", async () => {
  const dom = new JSDOM('<section id="activity-panel"></section>');
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  const node = (tag, text = "", className = "") => {
    const el = dom.window.document.createElement(tag);
    el.textContent = text;
    el.className = className;
    return el;
  };
  const button = (text, fn) => {
    const el = node("button", text);
    el.type = "button";
    el.addEventListener("click", fn);
    return el;
  };
  let owner = "owner", release;
  const events = [{
    id: "event-1",
    createdAt: "2026-10-17T18:00:00Z",
    keyId: "key-1",
    connectionId: "account-1",
    toolId: "github_list_pull_requests",
    outcome: "denied",
    reason: "resource_denied",
  }, {
    id: "event-2",
    createdAt: "2026-10-17T18:01:00Z",
    keyId: "key-1",
    connectionId: "account-1",
    toolId: "github_list_pull_requests",
    outcome: "allowed",
    reason: "completed",
  }];
  let pending = false;
  const activity = createActivity({
    node,
    button,
    getUserId: () => owner,
    getConnections: () => [{ id: "account-1", name: "Work GitHub" }],
    api: async (path) => {
      if (path === "/access-keys") {
        return { keys: [{ id: "key-1", name: "Research agent" }] };
      }
      if (pending) {
        return await new Promise((resolve) => {
          release = resolve;
        });
      }
      return { events };
    },
  });
  try {
    await activity.mount();
    const panel = dom.window.document.getElementById("activity-panel");
    assert.match(panel.textContent, /Research agent/);
    assert.match(panel.textContent, /Work GitHub/);
    assert.match(panel.textContent, /Denied/);
    assert.match(panel.textContent, /outside the allowed scope/);
    const filter = panel.querySelector("select");
    assert.ok(panel.querySelector(`label[for="${filter.id}"]`));
    filter.value = "denied";
    filter.dispatchEvent(new dom.window.Event("change"));
    assert.equal(panel.querySelectorAll("tbody tr").length, 1);
    pending = true;
    const loading = activity.mount();
    owner = null;
    activity.clear();
    release({ events });
    await loading;
    assert.equal(panel.textContent, "");
  } finally {
    dom.window.close();
    globalThis.document = previous;
  }
});
