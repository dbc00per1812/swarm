const iterations = 600000;
const idleLimit = 5 * 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const encode = (bytes) =>
  btoa(Array.from(bytes, (value) => String.fromCharCode(value)).join(""));
const decode = (value) =>
  Uint8Array.from(atob(value), (letter) => letter.charCodeAt(0));

function validEnvelope(value) {
  if (
    !value || value.format !== 1 || value.iterations !== iterations ||
    !Number.isInteger(value.revision) || value.revision < 1 ||
    value.revision > 1000000000 ||
    typeof value.salt !== "string" || typeof value.iv !== "string" ||
    typeof value.ciphertext !== "string" ||
    !/^[A-Za-z0-9+/]{22}==$/.test(value.salt) ||
    !/^[A-Za-z0-9+/]{16}$/.test(value.iv) ||
    value.ciphertext.length < 24 || value.ciphertext.length > 1048576 ||
    value.ciphertext.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value.ciphertext)
  ) return false;
  try {
    return encode(decode(value.salt)) === value.salt &&
      encode(decode(value.iv)) === value.iv &&
      encode(decode(value.ciphertext)) === value.ciphertext;
  } catch {
    return false;
  }
}
function readItems(value) {
  if (
    !value || value.format !== 1 || !Array.isArray(value.items) ||
    value.items.length > 500
  ) {
    throw new Error("Invalid vault content.");
  }
  const ids = new Set();
  return value.items.map((item) => {
    if (
      !item || typeof item.id !== "string" || !item.id ||
      item.id.length > 100 ||
      ids.has(item.id)
    ) {
      throw new Error("Invalid vault item.");
    }
    ids.add(item.id);
    const result = { id: item.id };
    for (
      const [name, limit] of [
        ["title", 120],
        ["provider", 120],
        ["environment", 120],
        ["secret", 12000],
        ["notes", 4000],
      ]
    ) {
      if (typeof item[name] !== "string" || item[name].length > limit) {
        throw new Error("Invalid vault item.");
      }
      if (
        (name === "title" && !item[name].trim()) ||
        (name === "secret" && !item[name])
      ) throw new Error("Invalid vault item.");
      result[name] = item[name];
    }
    return result;
  });
}

export function createVault({ api, node, message, getUserId }) {
  const panel = document.getElementById("vault-panel");
  let key,
    saved,
    items = [],
    sequence = 0,
    busy = false,
    timer,
    owner,
    selectedId,
    query = "",
    expiresAt = Infinity;
  const current = (ticket, identity) => {
    if (key && Date.now() >= expiresAt) {
      lock("The vault locked after five minutes without activity.");
      return false;
    }
    return ticket === sequence && owner === identity &&
      getUserId() === identity;
  };
  const aad = (identity) =>
    encoder.encode(`Swarm vault|1|${iterations}|${identity}`);
  function resetTimer() {
    if (key && Date.now() >= expiresAt) {
      lock("The vault locked after five minutes without activity.");
      return;
    }
    clearTimeout(timer);
    if (key) {
      expiresAt = Date.now() + idleLimit;
      timer = setTimeout(
        () => lock("The vault locked after five minutes without activity."),
        idleLimit,
      );
    }
  }
  function clearInputs() {
    for (const input of panel.querySelectorAll("input,textarea")) {
      input.value = "";
    }
    panel.replaceChildren();
  }
  function lock(text = "Vault locked.") {
    const wasUnlocked = Boolean(key);
    sequence++;
    key = undefined;
    items = [];
    selectedId = undefined;
    query = "";
    expiresAt = Infinity;
    busy = false;
    clearTimeout(timer);
    clearInputs();
    if (owner && owner === getUserId()) {
      renderLocked();
      if (!document.hidden) panel.querySelector("input")?.focus();
      if (wasUnlocked) message(text);
    }
  }
  function clear() {
    sequence++;
    key = undefined;
    items = [];
    selectedId = undefined;
    query = "";
    expiresAt = Infinity;
    busy = false;
    clearTimeout(timer);
    owner = undefined;
    saved = undefined;
    clearInputs();
    panel.hidden = true;
  }
  async function perform(action) {
    if (busy) return;
    const ticket = sequence, identity = owner;
    busy = true;
    for (const control of panel.querySelectorAll("button")) {
      if (!control.hasAttribute("data-vault-lock")) {
        control.setAttribute("aria-disabled", "true");
      }
    }
    try {
      await action(ticket, identity);
    } catch (error) {
      if (current(ticket, identity)) {
        message(error.message || "The vault operation failed.", true);
      }
    } finally {
      if (current(ticket, identity)) {
        busy = false;
        for (const control of panel.querySelectorAll("button")) {
          control.setAttribute("aria-disabled", "false");
        }
      }
    }
  }
  function button(label, action, secondary = true) {
    const control = node("button", label, secondary ? "secondary" : "");
    control.type = "button";
    if (label === "Lock vault") {
      control.setAttribute("data-vault-lock", "");
      control.addEventListener("click", () => lock());
    } else control.addEventListener("click", () => perform(action));
    return control;
  }
  function field(
    form,
    label,
    name,
    value = "",
    type = "text",
    maxLength = 120,
  ) {
    const text = node("label", label);
    const input = node(type === "textarea" ? "textarea" : "input");
    if (type !== "textarea") input.type = type;
    input.id = `vault-${name}`;
    input.name = name;
    input.value = value;
    input.maxLength = maxLength;
    input.autocomplete = "off";
    input.spellcheck = false;
    text.htmlFor = input.id;
    form.append(text, input);
    return input;
  }
  function formAction(form, label, action) {
    const control = node("button", label);
    control.type = "submit";
    form.append(control);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      perform(action);
    });
  }
  function introduction() {
    const heading = node("div", "", "vault-heading");
    heading.append(
      node("h2", "Personal vault"),
      node(
        "p",
        "Keep API keys in an encrypted personal vault. Item names and notes are encrypted too.",
        "muted",
      ),
    );
    panel.append(heading);
  }
  function limits() {
    panel.append(
      node(
        "p",
        "Swarm stores encrypted vault data. Your passphrase stays in this browser. There is no recovery if you lose it.",
        "muted",
      ),
    );
    panel.append(
      node(
        "p",
        "An attacker who controls this browser can read an unlocked vault. The vault locks when you leave this tab or after five idle minutes.",
        "muted",
      ),
    );
    panel.append(
      node(
        "p",
        "Vault items do not connect services or grant agent access. Add a connection separately when you want agents to use a service.",
        "muted",
      ),
    );
  }
  async function derive(passphrase, salt) {
    const bytes = encoder.encode(passphrase);
    try {
      const material = await crypto.subtle.importKey(
        "raw",
        bytes,
        "PBKDF2",
        false,
        ["deriveKey"],
      );
      return await crypto.subtle.deriveKey(
        { name: "PBKDF2", hash: "SHA-256", salt, iterations },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    } finally {
      bytes.fill(0);
    }
  }
  async function encrypt(next, vaultKey, salt, revision, identity) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = encoder.encode(JSON.stringify({ format: 1, items: next }));
    try {
      const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: aad(identity) },
          vaultKey,
          bytes,
        ),
      );
      const result = {
        format: 1,
        iterations,
        salt,
        iv: encode(iv),
        ciphertext: encode(ciphertext),
        revision,
      };
      if (result.ciphertext.length > 1048576) {
        throw new Error("The vault is full. Remove an item before you save.");
      }
      return result;
    } finally {
      bytes.fill(0);
    }
  }
  function renderLocked() {
    clearInputs();
    introduction();
    limits();
    const form = node("form", "", "vault-unlock vault-locked");
    form.setAttribute(
      "aria-label",
      saved ? "Unlock personal vault" : "Create personal vault",
    );
    const passphrase = field(
      form,
      "Vault passphrase",
      "passphrase",
      "",
      "password",
      1024,
    );
    passphrase.required = true;
    passphrase.minLength = 14;
    passphrase.autocomplete = saved ? "current-password" : "new-password";
    let confirm;
    if (!saved) {
      form.append(
        node(
          "p",
          "Use at least 14 characters. Choose a unique passphrase with several unrelated words.",
          "muted",
        ),
      );
      confirm = field(
        form,
        "Confirm passphrase",
        "confirm",
        "",
        "password",
        1024,
      );
      confirm.required = true;
      confirm.autocomplete = "new-password";
    }
    formAction(
      form,
      saved ? "Unlock vault" : "Create vault",
      async (ticket, identity) => {
        let phrase = passphrase.value;
        let confirmation = confirm?.value;
        passphrase.value = "";
        if (confirm) confirm.value = "";
        if (phrase.length < 14 || phrase.length > 1024) {
          throw new Error(
            "Use a passphrase with 14 to 1024 characters.",
          );
        }
        if (confirm && phrase !== confirmation) {
          throw new Error(
            "The passphrases do not match.",
          );
        }
        confirmation = "";
        const latest = (await api("/vault")).vault;
        if (!current(ticket, identity)) return;
        if (!saved && latest) {
          phrase = "";
          saved = latest;
          renderLocked();
          throw new Error("A vault already exists. Unlock the existing vault.");
        }
        if (saved && !validEnvelope(latest)) {
          throw new Error(
            "Vault storage is unavailable. Refresh the page.",
          );
        }
        const salt = latest
          ? decode(latest.salt)
          : crypto.getRandomValues(new Uint8Array(16));
        const nextKey = await derive(phrase, salt);
        phrase = "";
        if (!current(ticket, identity)) return;
        let next = [];
        let nextSaved = latest;
        if (latest) {
          let plaintext;
          try {
            plaintext = new Uint8Array(
              await crypto.subtle.decrypt(
                {
                  name: "AES-GCM",
                  iv: decode(latest.iv),
                  additionalData: aad(identity),
                },
                nextKey,
                decode(latest.ciphertext),
              ),
            );
            next = readItems(JSON.parse(decoder.decode(plaintext)));
          } catch {
            throw new Error(
              "The passphrase is incorrect, or the vault data is damaged.",
            );
          } finally {
            plaintext?.fill(0);
          }
        } else {
          const encrypted = await encrypt(
            [],
            nextKey,
            encode(salt),
            0,
            identity,
          );
          if (!current(ticket, identity)) return;
          nextSaved = (await api("/vault", "POST", encrypted)).vault;
          if (!confirmedSave(nextSaved, encrypted)) {
            throw new Error(
              "The server did not confirm vault creation. Reload the page before you continue.",
            );
          }
        }
        if (!current(ticket, identity)) return;
        if (!validEnvelope(nextSaved)) {
          throw new Error(
            "Vault storage is unavailable.",
          );
        }
        key = nextKey;
        expiresAt = Date.now() + idleLimit;
        items = next;
        saved = nextSaved;
        renderItems();
        focusItem();
        resetTimer();
        message("Vault unlocked.");
      },
    );
    panel.append(form);
  }
  function confirmedSave(result, encrypted) {
    return validEnvelope(result) &&
      result.revision === encrypted.revision + 1 &&
      ["salt", "iv", "ciphertext", "format", "iterations"].every((name) =>
        result[name] === encrypted[name]
      );
  }
  async function decrypt(envelope, vaultKey, identity) {
    let plaintext;
    try {
      plaintext = new Uint8Array(
        await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: decode(envelope.iv),
            additionalData: aad(identity),
          },
          vaultKey,
          decode(envelope.ciphertext),
        ),
      );
      return readItems(JSON.parse(decoder.decode(plaintext)));
    } catch {
      throw new Error(
        "The passphrase is incorrect, or the vault data is damaged.",
      );
    } finally {
      plaintext?.fill(0);
    }
  }
  async function save(next, ticket, identity, selection) {
    if (!current(ticket, identity)) return false;
    const encrypted = await encrypt(
      next,
      key,
      saved.salt,
      saved.revision,
      identity,
    );
    if (!current(ticket, identity)) return false;
    const result = (await api("/vault", "POST", encrypted)).vault;
    if (!current(ticket, identity)) return false;
    if (!confirmedSave(result, encrypted)) {
      throw new Error(
        "The server did not confirm the vault save. Lock and unlock the vault before you continue.",
      );
    }
    saved = result;
    items = next;
    selectedId = selection;
    renderItems();
    focusItem();
    resetTimer();
    return true;
  }
  function focusItem() {
    const target = [...panel.querySelectorAll(".vault-item-row")].find((
      control,
    ) => control.getAttribute("aria-pressed") === "true");
    (target || panel.querySelector("#vault-search"))?.focus();
  }
  function edit(item) {
    const detail = renderItems(false);
    detail.replaceChildren();
    const heading = node("div", "", "vault-detail-header");
    heading.append(node("h3", item ? "Edit item" : "New item"));
    detail.append(heading);
    const form = node("form", "", "vault-item-form");
    form.setAttribute("aria-label", "Vault item");
    const title = field(form, "Title", "title", item?.title);
    title.required = true;
    const provider = field(form, "Provider", "provider", item?.provider);
    const environment = field(
      form,
      "Environment",
      "environment",
      item?.environment,
    );
    const secret = field(
      form,
      "API key",
      "secret",
      item?.secret,
      "password",
      12000,
    );
    secret.required = true;
    secret.autocomplete = "new-password";
    const reveal = button("Reveal key", () => {
      const revealValue = secret.type === "password";
      secret.type = revealValue ? "text" : "password";
      reveal.textContent = revealValue ? "Hide key" : "Reveal key";
      reveal.setAttribute("aria-pressed", String(revealValue));
    });
    reveal.setAttribute("aria-pressed", "false");
    form.append(reveal);
    const notes = field(form, "Notes", "notes", item?.notes, "textarea", 4000);
    formAction(form, "Save item", async (ticket, identity) => {
      const value = {
        id: item?.id || crypto.randomUUID(),
        title: title.value.trim(),
        provider: provider.value.trim(),
        environment: environment.value.trim(),
        secret: secret.value,
        notes: notes.value,
      };
      if (!value.title || !value.secret) {
        throw new Error("Enter a title and an API key.");
      }
      if (!item && items.length >= 500) {
        throw new Error("The vault holds at most 500 items.");
      }
      const next = readItems({
        format: 1,
        items: item
          ? items.map((entry) => entry.id === item.id ? value : entry)
          : [...items, value],
      });
      secret.type = "password";
      reveal.textContent = "Reveal key";
      reveal.setAttribute("aria-pressed", "false");
      if (await save(next, ticket, identity, value.id)) {
        message("Vault item saved.");
      }
    });
    form.append(button("Cancel", () => {
      renderItems();
      focusItem();
    }));
    detail.append(form);
    title.focus();
  }
  function changePassphrase() {
    const detail = renderItems(false);
    detail.replaceChildren();
    detail.append(
      node("h3", "Change passphrase"),
      node(
        "p",
        "Your items stay encrypted. Save the new passphrase in a safe place. Swarm cannot recover it.",
        "vault-security-note",
      ),
    );
    const form = node("form", "", "vault-passphrase-form");
    form.setAttribute("aria-label", "Change vault passphrase");
    const previous = field(
      form,
      "Current passphrase",
      "current-passphrase",
      "",
      "password",
      1024,
    );
    previous.autocomplete = "current-password";
    const next = field(
      form,
      "New passphrase",
      "new-passphrase",
      "",
      "password",
      1024,
    );
    const confirmation = field(
      form,
      "Confirm new passphrase",
      "confirm-new-passphrase",
      "",
      "password",
      1024,
    );
    for (const input of [previous, next, confirmation]) {
      input.required = true;
      input.minLength = 14;
    }
    next.autocomplete = confirmation.autocomplete = "new-password";
    formAction(form, "Save passphrase", async (ticket, identity) => {
      let oldPhrase = previous.value,
        phrase = next.value,
        repeated = confirmation.value;
      previous.value = next.value = confirmation.value = "";
      if (phrase.length < 14 || phrase.length > 1024) {
        throw new Error("Use a passphrase with 14 to 1024 characters.");
      }
      if (phrase !== repeated) {
        throw new Error("The new passphrases do not match.");
      }
      if (phrase === oldPhrase) {
        throw new Error("Choose a different passphrase.");
      }
      repeated = "";
      const original = saved;
      const verifyKey = await derive(oldPhrase, decode(original.salt));
      oldPhrase = "";
      if (!current(ticket, identity)) return;
      await decrypt(original, verifyKey, identity);
      if (!current(ticket, identity)) return;
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const replacement = await derive(phrase, salt);
      phrase = "";
      if (!current(ticket, identity)) return;
      const encrypted = await encrypt(
        items,
        replacement,
        encode(salt),
        original.revision,
        identity,
      );
      if (!current(ticket, identity)) return;
      let result;
      try {
        result = (await api("/vault", "POST", encrypted)).vault;
      } catch {
        throw new Error(
          "The passphrase change was not confirmed. Keep both passphrases. Lock and unlock the vault to check which one works.",
        );
      }
      if (!current(ticket, identity)) return;
      if (!confirmedSave(result, encrypted)) {
        throw new Error(
          "The server did not confirm the passphrase change. Lock and unlock the vault before you continue.",
        );
      }
      key = replacement;
      saved = result;
      renderItems();
      focusItem();
      resetTimer();
      message(
        "Vault passphrase changed. Use the new passphrase when you unlock the vault.",
      );
    });
    form.append(button("Cancel", () => {
      renderItems();
      focusItem();
    }));
    detail.append(form);
    previous.focus();
  }
  function renderItems(showSelection = true) {
    clearInputs();
    introduction();
    const actions = node("div", "", "vault-toolbar");
    actions.append(
      button("Lock vault", () => lock()),
      button("Change passphrase", changePassphrase),
      button("Add item", () => edit(), false),
    );
    panel.append(actions);
    const workspace = node("div", "", "vault-workspace");
    const sidebar = node("aside", "", "vault-sidebar");
    sidebar.setAttribute("aria-label", "Vault items");
    const search = field(sidebar, "Search vault", "search", query);
    const list = node("ul", "", "vault-item-list");
    const count = node("p", "", "vault-item-count muted");
    sidebar.append(count, list);
    const detail = node("section", "", "vault-detail");
    detail.setAttribute("aria-label", "Selected vault item");
    workspace.append(sidebar, detail);
    panel.append(workspace);
    const showDetail = (item) => {
      for (const input of detail.querySelectorAll("input,textarea")) {
        input.value = "";
      }
      detail.replaceChildren();
      if (!item) {
        const empty = node("div", "", "vault-empty");
        empty.append(
          node("h3", items.length ? "Select an item" : "Your vault is empty."),
          node(
            "p",
            items.length
              ? "Select a saved item to view its details."
              : "Add your first API key.",
            "muted",
          ),
        );
        detail.append(empty);
        return;
      }
      const header = node("div", "", "vault-detail-header");
      header.append(
        node("h3", item.title),
        button("Edit item", () => edit(item)),
      );
      detail.append(header);
      const fields = node("dl", "", "vault-fields");
      for (
        const [label, value] of [["Provider", item.provider || "Not set"], [
          "Environment",
          item.environment || "Not set",
        ]]
      ) fields.append(node("dt", label), node("dd", value));
      fields.append(node("dt", "API key"));
      const keyRow = node("dd", "", "vault-key-row");
      const value = node("code", "••••••••••••", "vault-key-value");
      const reveal = button("Reveal key", () => {
        const revealValue = reveal.getAttribute("aria-pressed") !== "true";
        value.textContent = revealValue ? item.secret : "••••••••••••";
        reveal.textContent = revealValue ? "Hide key" : "Reveal key";
        reveal.setAttribute("aria-pressed", String(revealValue));
      });
      reveal.setAttribute("aria-pressed", "false");
      keyRow.append(value, reveal);
      fields.append(
        keyRow,
        node("dt", "Notes"),
        node("dd", item.notes || "No notes", "vault-notes"),
      );
      detail.append(fields);
      const remove = button("Delete item", () => {
        const confirm = node("div", "", "vault-delete-confirm");
        const yes = button("Confirm deletion", async (ticket, identity) => {
          if (
            await save(
              items.filter((entry) => entry.id !== item.id),
              ticket,
              identity,
            )
          ) message("Vault item deleted.");
        });
        confirm.append(
          node("p", "Delete this item from the vault?"),
          yes,
          button("Keep item", () => {
            showDetail(item);
            detail.querySelector("button")?.focus();
          }),
        );
        remove.replaceWith(confirm);
        yes.focus();
      });
      detail.append(remove);
    };
    const populate = () => {
      list.replaceChildren();
      const visible = items.filter((item) =>
        `${item.title} ${item.provider} ${item.environment}`.toLowerCase()
          .includes(query.toLowerCase())
      );
      count.textContent = `${visible.length} ${
        visible.length === 1 ? "item" : "items"
      }`;
      if (!visible.some((item) => item.id === selectedId)) {
        selectedId = visible[0]?.id;
      }
      if (!visible.length) {
        list.append(
          node(
            "li",
            items.length ? "No matching items." : "No saved items.",
            "vault-list-empty muted",
          ),
        );
      }
      for (const item of visible) {
        const row = node("li");
        const select = button("", () => {
          selectedId = item.id;
          for (const control of list.querySelectorAll("button")) {
            control.setAttribute("aria-pressed", String(control === select));
          }
          showDetail(item);
        });
        select.className = "vault-item-row";
        select.setAttribute("aria-label", item.title);
        select.setAttribute("aria-pressed", String(item.id === selectedId));
        const mark = node(
          "span",
          item.provider ? item.provider.slice(0, 1).toUpperCase() : "K",
          "vault-item-icon",
        );
        mark.setAttribute("aria-hidden", "true");
        const copy = node("span", "", "vault-item-copy");
        copy.append(
          node("span", item.title, "vault-item-title"),
          node(
            "span",
            [item.provider, item.environment].filter(Boolean).join(" · ") ||
              "API key",
            "vault-item-meta",
          ),
        );
        select.append(mark, copy);
        row.append(select);
        list.append(row);
      }
      showDetail(
        showSelection
          ? items.find((item) => item.id === selectedId)
          : undefined,
      );
    };
    search.addEventListener("input", () => {
      query = search.value;
      populate();
    });
    populate();
    return detail;
  }
  async function mount() {
    clear();
    owner = getUserId();
    if (!owner) return;
    const ticket = sequence, identity = owner;
    panel.hidden = false;
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
      panel.append(
        node("h2", "Personal vault"),
        node(
          "p",
          "The vault requires a secure browser connection. Open Swarm with HTTPS or localhost.",
          "vault-security-note",
        ),
      );
      return;
    }
    panel.append(node("p", "Loading your vault…", "muted"));
    try {
      const result = await api("/vault");
      if (!current(ticket, identity)) return;
      if (result.vault !== null && !validEnvelope(result.vault)) {
        throw new Error(
          "This vault format is unsupported or damaged. Update Swarm before you continue.",
        );
      }
      saved = result.vault;
      renderLocked();
    } catch (error) {
      if (!current(ticket, identity)) return;
      clearInputs();
      introduction();
      panel.append(
        node(
          "p",
          "The vault service is unavailable. Try again. If the problem continues, ask the administrator to deploy the latest vault migration and gateway.",
          "vault-security-note",
        ),
        button("Retry vault", () => mount()),
      );
      message(error.message || "Vault storage is unavailable.", true);
    }
  }
  for (const event of ["pointerdown", "keydown", "input"]) {
    document.addEventListener(event, resetTimer, { passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && owner) {
      lock("The vault locked when this tab became hidden.");
    }
  });
  return { mount, clear, lock };
}
