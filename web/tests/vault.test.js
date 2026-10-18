import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const until = async (check) => {
  const deadline = Date.now() + 8000;
  while (!check()) {
    assert.ok(Date.now() < deadline, "Vault state did not appear.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
async function page(saved = null, options = {}) {
  const bundle = await build({
    entryPoints: ["web/vault.js"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "Vault",
  });
  const dom = new JSDOM('<section id="vault-panel"></section>', {
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  Object.defineProperty(w, "crypto", { value: webcrypto });
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  let record = saved;
  const errors = [];
  const node = (tag, text = "", className = "") => {
    const element = w.document.createElement(tag);
    element.textContent = text;
    element.className = className;
    return element;
  };
  w.eval(bundle.outputFiles[0].text);
  const vault = w.Vault.createVault({
    node,
    api: async (_path, method = "GET", body) => {
      if (method === "GET") await options.beforeRead?.();
      if (method !== "GET") {
        await options.beforeSave?.();
        record = { ...body, revision: (record?.revision || 0) + 1 };
      }
      return { vault: record };
    },
    message: (text, error) => {
      if (error) errors.push(text);
    },
    getUserId: () => "owner",
  });
  await vault.mount();
  const input = (label, value) => {
    const element = [...w.document.querySelectorAll("label")].find((l) =>
      l.textContent === label
    );
    assert.ok(element, `Missing label: ${label}`);
    w.document.getElementById(element.htmlFor).value = value;
  };
  const click = async (name) => {
    const button = [...w.document.querySelectorAll("button")].find((b) =>
      b.textContent === name || b.getAttribute("aria-label") === name
    );
    assert.ok(button, `Missing button: ${name}`);
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return {
    w,
    vault,
    input,
    click,
    errors,
    stored: () => record,
    close: () => {
      vault.clear();
      w.close();
    },
  };
}

test("vault encrypts every field, rejects wrong passwords, and clears secrets when locked", async () => {
  const p = await page();
  try {
    p.input("Vault passphrase", "four unrelated words 2026");
    p.input("Confirm passphrase", "four unrelated words 2026");
    await p.click("Create vault");
    await until(() => p.w.document.body.textContent.includes("Add item"));
    await p.click("Add item");
    p.input("Title", "Production service");
    p.input("Provider", "Example provider");
    p.input("Environment", "Production");
    p.input("API key", "private-test-token-123");
    p.input("Notes", "Private operational note");
    await p.click("Save item");
    await until(() =>
      p.w.document.body.textContent.includes("Production service") &&
      !p.w.document.querySelector('form[aria-label="Vault item"]')
    );
    const serialized = JSON.stringify(p.stored());
    assert.equal(serialized.includes("private-test-token"), false);
    assert.equal(serialized.includes("Production service"), false);
    assert.equal(serialized.includes("Private operational note"), false);
    assert.equal(p.stored().iterations >= 600000, true);
    assert.equal(
      p.w.document.body.textContent.includes("private-test-token"),
      false,
    );
    await p.click("Reveal key");
    assert.ok(p.w.document.body.textContent.includes("private-test-token-123"));
    await p.click("Lock vault");
    assert.equal(
      p.w.document.body.textContent.includes("private-test-token"),
      false,
    );
    assert.equal(
      p.w.document.querySelector('input[type="password"]').value,
      "",
    );
    p.input("Vault passphrase", "incorrect password phrase");
    await p.click("Unlock vault");
    await until(() => p.errors.length === 1);
    assert.ok(p.stored().ciphertext);
    p.input("Vault passphrase", "four unrelated words 2026");
    await p.click("Unlock vault");
    await until(() =>
      p.w.document.body.textContent.includes("Production service")
    );
    await p.click("Edit item");
    p.input("Title", "Updated service");
    p.input("API key", "replacement-private-key");
    await p.click("Save item");
    await until(() =>
      p.w.document.body.textContent.includes("Updated service") &&
      !p.w.document.querySelector('form[aria-label="Vault item"]')
    );
    await p.click("Delete item");
    await p.click("Confirm deletion");
    await until(() =>
      p.w.document.body.textContent.includes("Your vault is empty.")
    );
    await p.click("Lock vault");
    p.input("Vault passphrase", "four unrelated words 2026");
    await p.click("Unlock vault");
    await until(() =>
      p.w.document.body.textContent.includes("Your vault is empty.")
    );
    p.vault.clear();
    assert.equal(p.w.document.getElementById("vault-panel").textContent, "");
  } finally {
    p.close();
  }
});

test("vault keeps saved entries after a failed write and clears the editor on hidden tabs", async () => {
  let fail = false;
  const p = await page(null, {
    beforeSave: () => {
      if (fail) throw new Error("Storage unavailable.");
    },
  });
  try {
    p.input("Vault passphrase", "four unrelated words 2026");
    p.input("Confirm passphrase", "four unrelated words 2026");
    await p.click("Create vault");
    await until(() => p.w.document.body.textContent.includes("Add item"));
    await p.click("Add item");
    p.input("Title", "Unsaved service");
    p.input("API key", "private-unsaved-key");
    fail = true;
    await p.click("Save item");
    await until(() => p.errors.length === 1);
    assert.equal(p.stored().revision, 1);
    assert.equal(
      p.w.document.getElementById("vault-secret").value,
      "private-unsaved-key",
    );
    Object.defineProperty(p.w.document, "hidden", {
      value: true,
      configurable: true,
    });
    p.w.document.dispatchEvent(new p.w.Event("visibilitychange"));
    assert.equal(p.w.document.querySelector("#vault-secret"), null);
    assert.equal(
      p.w.document.body.textContent.includes("Unsaved service"),
      false,
    );
    assert.equal(p.w.document.getElementById("vault-passphrase").value, "");
  } finally {
    p.close();
  }
});

test("signout during an unlock cannot restore vault content", async () => {
  let release;
  let hold = false;
  const p = await page(null, {
    beforeRead: () =>
      hold
        ? new Promise((resolve) => {
          release = resolve;
        })
        : undefined,
  });
  try {
    p.input("Vault passphrase", "four unrelated words 2026");
    p.input("Confirm passphrase", "four unrelated words 2026");
    hold = true;
    await p.click("Create vault");
    assert.equal(typeof release, "function");
    p.vault.clear();
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(p.w.document.getElementById("vault-panel").hidden, true);
    assert.equal(p.w.document.getElementById("vault-panel").textContent, "");
    assert.equal(p.stored(), null);
  } finally {
    p.close();
  }
});

test("locking during a pending save prevents the response from unlocking the vault", async () => {
  let hold = false;
  let release;
  const p = await page(null, {
    beforeSave: () =>
      hold
        ? new Promise((resolve) => {
          release = resolve;
        })
        : undefined,
  });
  try {
    p.input("Vault passphrase", "four unrelated words 2026");
    p.input("Confirm passphrase", "four unrelated words 2026");
    await p.click("Create vault");
    await until(() => p.w.document.body.textContent.includes("Add item"));
    await p.click("Add item");
    p.input("Title", "Pending service");
    p.input("API key", "private-pending-key");
    hold = true;
    await p.click("Save item");
    await until(() => typeof release === "function");
    await p.click("Lock vault");
    assert.equal(p.w.document.querySelector("#vault-secret"), null);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(p.w.document.getElementById("vault-passphrase"));
    assert.equal(
      p.w.document.body.textContent.includes("Pending service"),
      false,
    );
  } finally {
    p.close();
  }
});

test("passphrase changes keep items, replace the salt, and reject the old passphrase", async () => {
  const p = await page();
  try {
    p.input("Vault passphrase", "four unrelated words 2026");
    p.input("Confirm passphrase", "four unrelated words 2026");
    await p.click("Create vault");
    await until(() => p.w.document.body.textContent.includes("Add item"));
    await p.click("Add item");
    p.input("Title", "Rotation service");
    p.input("API key", "retained-private-key");
    await p.click("Save item");
    await until(() =>
      p.w.document.body.textContent.includes("Rotation service") &&
      !p.w.document.querySelector('form[aria-label="Vault item"]')
    );
    const original = p.stored();
    await p.click("Change passphrase");
    p.input("Current passphrase", "four unrelated words 2026");
    p.input("New passphrase", "another unrelated phrase 2026");
    p.input("Confirm new passphrase", "another unrelated phrase 2026");
    await p.click("Save passphrase");
    await until(() => p.stored().revision === original.revision + 1);
    assert.notEqual(p.stored().salt, original.salt);
    await p.click("Lock vault");
    p.input("Vault passphrase", "four unrelated words 2026");
    await p.click("Unlock vault");
    await until(() => p.errors.length === 1);
    p.input("Vault passphrase", "another unrelated phrase 2026");
    await p.click("Unlock vault");
    await until(() =>
      p.w.document.body.textContent.includes("Rotation service")
    );
    await p.click("Reveal key");
    assert.ok(p.w.document.body.textContent.includes("retained-private-key"));
  } finally {
    p.close();
  }
});

test("a failed passphrase change preserves the current encrypted vault and old passphrase", async () => {
  let fail = false;
  const p = await page(null, {
    beforeSave: () => {
      if (fail) throw new Error("Storage unavailable.");
    },
  });
  try {
    p.input("Vault passphrase", "four unrelated words 2026");
    p.input("Confirm passphrase", "four unrelated words 2026");
    await p.click("Create vault");
    await until(() => p.w.document.body.textContent.includes("Add item"));
    const original = p.stored();
    await p.click("Change passphrase");
    p.input("Current passphrase", "four unrelated words 2026");
    p.input("New passphrase", "another unrelated phrase 2026");
    p.input("Confirm new passphrase", "another unrelated phrase 2026");
    fail = true;
    await p.click("Save passphrase");
    await until(() => p.errors.length === 1);
    assert.equal(p.stored().ciphertext, original.ciphertext);
    assert.equal(p.stored().salt, original.salt);
    await p.click("Cancel");
    await p.click("Lock vault");
    p.input("Vault passphrase", "four unrelated words 2026");
    await p.click("Unlock vault");
    await until(() => p.w.document.body.textContent.includes("Add item"));
  } finally {
    p.close();
  }
});

test("item selection masks the previous key and reveal preserves keyboard focus", async () => {
  const p = await page();
  try {
    p.input("Vault passphrase", "four unrelated words 2026");
    p.input("Confirm passphrase", "four unrelated words 2026");
    await p.click("Create vault");
    await until(() => p.w.document.body.textContent.includes("Add item"));
    await p.click("Add item");
    p.input("Title", "First service");
    p.input("API key", "first-private-key");
    await p.click("Save item");
    await until(() =>
      !p.w.document.querySelector('form[aria-label="Vault item"]')
    );
    await p.click("Add item");
    p.input("Title", "Second service");
    p.input("API key", "second-private-key");
    await p.click("Save item");
    await until(() =>
      !p.w.document.querySelector('form[aria-label="Vault item"]')
    );
    const reveal = [...p.w.document.querySelectorAll("button")].find((
      control,
    ) => control.textContent === "Reveal key");
    reveal.focus();
    await p.click("Reveal key");
    assert.equal(p.w.document.activeElement, reveal);
    assert.ok(p.w.document.body.textContent.includes("second-private-key"));
    await p.click("First service");
    assert.equal(
      p.w.document.body.textContent.includes("second-private-key"),
      false,
    );
    assert.equal(
      p.w.document.body.textContent.includes("first-private-key"),
      false,
    );
    const search = p.w.document.getElementById("vault-search");
    search.focus();
    search.value = "Second";
    search.dispatchEvent(new p.w.Event("input", { bubbles: true }));
    assert.equal(p.w.document.activeElement, search);
    assert.equal(p.w.document.querySelectorAll(".vault-item-row").length, 1);
    assert.equal(
      p.w.document.querySelector(".vault-item-row").getAttribute("aria-label"),
      "Second service",
    );
  } finally {
    p.close();
  }
});

test("expired vault keys lock before a new activity can extend the session", async () => {
  const p = await page();
  try {
    p.input("Vault passphrase", "four unrelated words 2026");
    p.input("Confirm passphrase", "four unrelated words 2026");
    await p.click("Create vault");
    await until(() => p.w.document.body.textContent.includes("Add item"));
    p.w.Date.now = () => Date.now() + 300001;
    p.w.document.dispatchEvent(new p.w.Event("pointerdown", { bubbles: true }));
    assert.ok(p.w.document.getElementById("vault-passphrase"));
    assert.equal(p.w.document.body.textContent.includes("Add item"), false);
  } finally {
    p.close();
  }
});
