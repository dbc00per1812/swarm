import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createWorkspace } from "../workspace.js";
import { renderCatalog } from "../catalog.js";

test("navigation opens one workspace and search finds a connector by its job", async () => {
  const dom = new JSDOM(await readFile("web/index.html", "utf8"));
  const document = dom.window.document;
  const workspace = createWorkspace(document);
  workspace.show("vault");
  assert.equal(document.getElementById("vault-view").hidden, false);
  assert.equal(document.getElementById("connectors-view").hidden, true);
  assert.equal(
    document.querySelector('[data-view="vault"]').getAttribute("aria-current"),
    "page",
  );
  workspace.show("connectors");
  const target = document.getElementById("connector-catalog");
  const node = (tag, text = "", className = "") => {
    const element = document.createElement(tag);
    element.textContent = text;
    element.className = className;
    return element;
  };
  renderCatalog({ target, node, query: "payments", onSelect() {} });
  assert.match(target.textContent, /Stripe/);
  assert.doesNotMatch(target.textContent, /Notion/);
  assert.ok(
    target.querySelector("img").getAttribute("src").endsWith("stripe.svg"),
  );
  renderCatalog({ target, node, query: "no-such-connector", onSelect() {} });
  assert.match(target.textContent, /No connectors/);
  dom.window.close();
});

test("activity navigation loads its own view and account list selects one detail panel", async () => {
  const dom = new JSDOM(await readFile("web/index.html", "utf8"));
  const document = dom.window.document;
  const shown = [];
  const workspace = createWorkspace(document, {
    onShow: (name) => shown.push(name),
  });
  document.querySelector('[data-view="activity"]').click();
  assert.equal(document.getElementById("activity-view").hidden, false);
  assert.equal(document.getElementById("connectors-view").hidden, true);
  assert.equal(
    document.querySelector('[data-view="activity"]').getAttribute(
      "aria-current",
    ),
    "page",
  );
  assert.equal(shown.at(-1), "activity");
  assert.match(
    document.getElementById("connections-title").textContent,
    /access|request/i,
  );
  workspace.show("connectors");
  assert.equal(
    document.getElementById("connection-list").getAttribute("aria-label"),
    "Connected accounts",
  );
  dom.window.close();
});
