import { createClient } from "@supabase/supabase-js";
import { createTeams } from "./teams.js";
import { createGmailApprovals } from "./gmail-approvals.js";
import { createWorkspace } from "./workspace.js";
import { logo, renderCatalog } from "./catalog.js";
import { createVault } from "./vault.js";
import { createAccessKeys } from "./access-keys.js";
import { createActivity } from "./activity.js";
import { endpoint } from "./config.js";

const byId = (id) => document.getElementById(id);
const names = {
  github: "GitHub",
  slack: "Slack",
  linear: "Linear",
  gmail: "Gmail",
};
let auth, config, userId, popup, newKey;
let currentConnections = [], accessConnections = [];
let selectedConnectionId, selectedCatalogId, connectorMode = "connected";
const workspace = createWorkspace(document, {
  onShow(name, previous) {
    if (previous === "vault" && name !== "vault") vault.lock?.();
    if (name === "activity" && userId) activity.mount();
  },
});
const activity = createActivity({
  api,
  node,
  button,
  getUserId: () => userId,
  getConnections: () => accessConnections,
});
const vault = createVault({
  api,
  node,
  button,
  message,
  getUserId: () => userId,
});
const accessKeys = createAccessKeys({
  api,
  node,
  button,
  message,
  getUserId: () => userId,
  onIssued(value) {
    newKey = value;
    byId("raw-key").value = value.token;
    byId("new-key").hidden = false;
  },
  onRevoked(id) {
    if (newKey?.id !== id) return;
    newKey = null;
    byId("raw-key").value = "";
    byId("new-key").hidden = true;
  },
});
function browseConnectors() {
  renderCatalog({
    target: byId("connector-catalog"),
    detailTarget: byId("catalog-detail"),
    node,
    selectedId: selectedCatalogId,
    onInspect: (id) => {
      selectedCatalogId = id;
    },
    approvedHosts: config?.customApprovedHosts || [],
    query: byId("connector-search").value,
    category: byId("connector-category").value,
    configured: (config?.services || []).filter((service) => service.configured)
      .map((service) => service.provider),
    onSelect: async (item) => {
      try {
        if (item.native) {
          if (
            !config.services.some((service) =>
              service.provider === item.id && service.configured
            )
          ) {
            message(
              `${item.name} requires application setup before you can connect an account.`,
              true,
            );
            return;
          }
          const result = await api("/connections", "POST", {
            kind: "native",
            provider: item.id,
            name: `${item.name} account`,
          });
          await refresh(result.connection.id);
          message("Account added. Select Connect to approve access.");
        } else {
          byId("custom-setup").open = true;
          byId("custom-name").value = item.name;
          byId("custom-url").value = item.endpoint;
          byId("custom-bearer").value = "";
          byId("custom-name").focus();
          const allowed = config.customApprovedHosts.includes(
            new URL(item.endpoint).hostname,
          );
          message(
            allowed
              ? `${item.name} selected. Add its authentication, then save the connection.`
              : `${item.name} requires host approval. Ask the server operator to approve ${
                new URL(item.endpoint).hostname
              }.`,
            !allowed,
          );
        }
      } catch (error) {
        message(error.message, true);
      }
    },
  });
  renderConnectionList();
}
function setConnectorMode(mode) {
  connectorMode = mode;
  byId("connected-accounts").hidden = mode !== "connected";
  byId("browse-connectors").hidden = mode !== "catalog";
  byId("show-connected").setAttribute(
    "aria-pressed",
    String(mode === "connected"),
  );
  byId("show-catalog").setAttribute("aria-pressed", String(mode === "catalog"));
}
function selectConnection(id, { focusDetail = false } = {}) {
  selectedConnectionId = id;
  for (const row of byId("connection-list").querySelectorAll("button")) {
    row.setAttribute("aria-pressed", String(row.dataset.connectionId === id));
  }
  for (const card of byId("services").querySelectorAll("article.service")) {
    card.hidden = card.id !== `account-${id}`;
  }
  byId("no-account").hidden = Boolean(id);
  if (focusDetail) document.getElementById(`account-${id}`)?.focus();
}
function renderConnectionList() {
  const list = byId("connection-list");
  const activeId = document.activeElement?.dataset.connectionId;
  list.replaceChildren();
  const query = byId("connector-search").value.trim().toLowerCase();
  const matches = currentConnections.filter((connection) =>
    `${connection.name} ${names[connection.provider] || "MCP"} ${
      connection.accountLabel || ""
    }`.toLowerCase().includes(query)
  );
  byId("account-count").textContent = String(matches.length);
  if (!matches.some((connection) => connection.id === selectedConnectionId)) {
    selectedConnectionId = matches[0]?.id;
  }
  for (const connection of matches) {
    const row = button("", () => selectConnection(connection.id), true);
    row.className = "account-option";
    row.dataset.connectionId = connection.id;
    row.setAttribute("aria-controls", `account-${connection.id}`);
    row.setAttribute(
      "aria-label",
      `${names[connection.provider] || "MCP"} · ${connection.name}`,
    );
    const copy = node("span", "", "account-option-copy");
    copy.append(
      node("strong", connection.name),
      node("small", names[connection.provider] || "Custom MCP server", "muted"),
    );
    row.append(
      logo(node, connection.provider || "mcp"),
      copy,
      node(
        "span",
        connection.status === "connected" ? "Connected" : "Set up",
        "account-option-status",
      ),
    );
    list.append(row);
  }
  if (!matches.length) {
    list.append(node(
      "p",
      currentConnections.length
        ? "No accounts match your search."
        : "Add your first connector to give an agent access.",
      "empty-state",
    ));
  }
  selectConnection(selectedConnectionId);
  if (activeId) {
    [...list.querySelectorAll("button")].find((row) =>
      row.dataset.connectionId === activeId
    )?.focus();
  }
}

let generation = 0;
let refreshSequence = 0;
let authSequence = 0;

const gmailApprovals = createGmailApprovals({
  api,
  node,
  button,
  message,
  getGeneration: () => generation,
  getUserId: () => userId,
});
let cancelGmailConsent;
function gmailConsent() {
  const dialog = byId("gmail-consent");
  const previous = document.activeElement;
  return new Promise((resolve) => {
    function finish(value) {
      byId("gmail-consent-cancel").removeEventListener("click", cancel);
      byId("gmail-consent-continue").removeEventListener("click", accept);
      dialog.removeEventListener("cancel", cancel);
      cancelGmailConsent = null;
      dialog.close();
      previous?.focus();
      resolve(value);
    }
    function cancel(event) {
      event?.preventDefault();
      finish(null);
    }
    function accept() {
      const authorizationPopup = globalThis.open(
        "about:blank",
        "_blank",
        "width=640,height=760",
      );
      finish({ authorizationPopup });
    }
    cancelGmailConsent = cancel;
    byId("gmail-consent-cancel").addEventListener("click", cancel);
    byId("gmail-consent-continue").addEventListener("click", accept);
    dialog.addEventListener("cancel", cancel);
    dialog.showModal();
  });
}
const teams = createTeams({
  api,
  node,
  button,
  field,
  submit,
  message,
  getUserId: () => userId,
  copy,
});

function message(text = "", error = false) {
  byId("error").textContent = error ? text : "";
  byId("notice").textContent = error ? "" : text;
}
function node(tag, text, className) {
  const result = document.createElement(tag);
  if (text) result.textContent = text;
  if (className) result.className = className;
  return result;
}
async function busy(control, action) {
  if (control.getAttribute("aria-disabled") === "true") return;
  control.setAttribute("aria-disabled", "true");
  control.setAttribute("aria-busy", "true");
  message();
  try {
    await action();
  } catch (error) {
    message(error.message, true);
  } finally {
    control.setAttribute("aria-disabled", "false");
    control.removeAttribute("aria-busy");
  }
}
function button(text, action, quiet = false) {
  const result = node("button", text, quiet ? "quiet" : "");
  result.type = "button";
  result.addEventListener("click", () => busy(result, action));
  return result;
}
function submit(form, action) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    busy(form.querySelector('button[type="submit"]'), action);
  });
}
function field(form, label, id, value = "", type = "text") {
  const caption = node("label", label);
  caption.htmlFor = id;
  const input = node(type === "textarea" ? "textarea" : "input");
  if (type !== "textarea") input.type = type;
  input.id = id;
  input.value = value;
  form.append(caption, input);
  return input;
}
function clearPrivateView() {
  generation++;
  vault.clear();
  accessKeys.clear();
  activity.clear();
  workspace.show("connectors");
  currentConnections = [];
  accessConnections = [];
  selectedConnectionId = null;
  byId("connection-list").replaceChildren();
  document.body.classList.remove("signed-in");
  userId = null;
  teams.clear();
  gmailApprovals.clear();
  cancelGmailConsent?.();
  newKey = null;
  if (popup && !popup.closed) popup.close();
  popup = null;
  byId("raw-key").value = "";
  byId("new-key").hidden = true;
  byId("keys").replaceChildren();
  byId("services").replaceChildren();
  byId("connections-panel").hidden = true;
  byId("signin-panel").hidden = false;
  byId("password").value = "";
  byId("custom-form").reset();
}
async function api(path, method = "GET", body) {
  const owner = userId;
  const revision = generation;
  const checkSession = () => {
    if (owner !== userId || revision !== generation) {
      throw new Error("The signed-in account changed. Try again.");
    }
  };
  const { data, error } = await auth.auth.getSession();
  checkSession();
  if (error || !data.session || data.session.user.id !== owner) {
    clearPrivateView();
    throw new Error("Your session expired. Sign in again.");
  }
  let response;
  try {
    response = await fetch(endpoint + "/v1" + path, {
      method,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error(
      "Swarm could not complete the request. Check your connection and try again.",
    );
  }
  checkSession();
  if (response.status === 401) {
    await auth.auth.signOut({ scope: "local" });
    clearPrivateView();
    throw new Error("Your session expired. Sign in again.");
  }
  if (response.status === 204) return null;
  const result = await response.json();
  checkSession();
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "Too many requests. Wait one minute and try again."
        : result.error || "The request failed. Try again.",
    );
  }
  return result;
}
async function refresh(focusId) {
  const revision = generation;
  const sequence = ++refreshSequence;
  const result = await api("/connections");
  if (revision !== generation || sequence !== refreshSequence) return;
  currentConnections = result.connections;
  accessConnections = result.accessConnections || result.connections;
  byId("endpoint").value = result.endpointUrl;
  byId("services").replaceChildren(...result.connections.map(accountCard));
  byId("empty").hidden = result.connections.length > 0;
  if (focusId) {
    selectedConnectionId = focusId;
    setConnectorMode("connected");
  }
  browseConnectors();
  await teams.refresh(result.connections);
  await accessKeys.mount(accessConnections);
  if (revision !== generation || sequence !== refreshSequence) return;
  if (focusId) selectConnection(focusId, { focusDetail: true });
}

function accountCard(connection) {
  const card = node("article", "", "service");
  card.id = `account-${connection.id}`;
  card.tabIndex = -1;
  const detail = node("div", "", "account-details");
  const headline = node("div", "", "account-summary");
  headline.append(logo(node, connection.provider || "mcp"));
  const identity = node("div", "", "account-identity");
  const title = node("h4", connection.name);
  title.id = `title-${connection.id}`;
  card.setAttribute("aria-labelledby", title.id);
  identity.append(
    title,
    node(
      "p",
      connection.accountLabel || connection.endpointUrl ||
        (connection.status === "connected"
          ? `${names[connection.provider] || "MCP"} account`
          : "Approve access to this account."),
      "muted account",
    ),
  );
  headline.append(
    identity,
    node(
      "span",
      connection.status === "connected"
        ? "Connected"
        : "Authorization required",
      "status",
    ),
    node(
      "span",
      `${connection.enabledTools.length} ${
        connection.enabledTools.length === 1 ? "tool" : "tools"
      }`,
      "tool-count",
    ),
  );
  detail.append(headline);
  const actions = node("div", "", "actions");
  if (connection.kind === "native") {
    actions.append(
      button(
        connection.status === "connected" ? "Reconnect" : "Connect",
        async () => {
          const revision = generation;
          const consent = connection.provider === "gmail"
            ? await gmailConsent()
            : undefined;
          if (consent === null || revision !== generation) return;
          const authorizationPopup = consent
            ? consent.authorizationPopup
            : globalThis.open(
              "about:blank",
              "_blank",
              "width=640,height=760",
            );
          popup = authorizationPopup;
          try {
            const value = await api(
              `/connections/${connection.id}/authorize`,
              "POST",
            );
            const target = new URL(value.authorizationUrl);
            if (target.protocol !== "https:") {
              throw new Error("The authorization address is invalid.");
            }
            const state = target.searchParams.get("state");
            if (
              !/^[a-f0-9]{64}$/.test(state || "") ||
              !/^[a-f0-9]{64}$/.test(value.completionSecret || "")
            ) {
              throw new Error(
                "The authorization response is invalid. Try again.",
              );
            }
            try {
              (authorizationPopup
                ? authorizationPopup.sessionStorage
                : sessionStorage).setItem(
                  `swarm-oauth:${state}`,
                  JSON.stringify({ userId, verifier: value.completionSecret }),
                );
            } catch {
              throw new Error(
                "Browser storage is unavailable. Allow session storage and try again.",
              );
            }
            if (authorizationPopup) authorizationPopup.location = target.href;
            else location.assign(target.href);
            message(
              "Complete the approval. Then return to Swarm and select Refresh accounts.",
            );
          } catch (error) {
            authorizationPopup?.close();
            throw error;
          }
        },
      ),
    );
  } else {actions.append(button("Discover tools", async () => {
      if (
        connection.enabledTools.length &&
        !confirm(
          "Discover tools again? This clears the current tool selections.",
        )
      ) return;
      await api(`/connections/${connection.id}/discover`, "POST");
      await refresh(connection.id);
      message(
        "Tools found. Open Tools and select the tools your agents can use.",
      );
    }));}
  actions.append(button("Remove", async () => {
    if (
      !confirm(
        `Remove ${connection.name}? Its saved credentials and tool permissions will be deleted.`,
      )
    ) return;
    await api(`/connections/${connection.id}`, "DELETE");
    await refresh();
    message("Connection removed.");
    byId("refresh-accounts").focus();
  }, true));
  actions.append(button("Manage agent access", () => {
    workspace.show("agents");
    byId("agent-key-name")?.focus();
  }, true));
  detail.append(actions);
  const scopeSummary = node("dl", "", "detail-facts");
  scopeSummary.append(
    node("dt", "Access"),
    node("dd", "Selected tools and resources"),
  );
  const scopeValues = connection.settings.repositories ||
    connection.settings.channels || connection.settings.teams;
  if (scopeValues) {
    scopeSummary.append(
      node("dt", "Resources"),
      node(
        "dd",
        scopeValues.length ? scopeValues.join(", ") : "No resources allowed",
      ),
    );
  }
  detail.append(scopeSummary);
  const edit = node("details");
  edit.append(node("summary", "Account settings"));
  const form = node("form");
  const name = field(
    form,
    "Account name",
    `name-${connection.id}`,
    connection.name,
  );
  name.required = true;
  name.maxLength = 100;
  let repositories, bearer, channels, linearTeams;
  if (connection.provider === "github") {
    repositories = field(
      form,
      "Public repositories (one owner/repo per line)",
      `repos-${connection.id}`,
      (connection.settings.repositories || []).join("\n"),
      "textarea",
    );
    repositories.rows = 3;
  }
  if (connection.provider === "slack") {
    channels = field(
      form,
      "Allowed Slack channels (one name per line)",
      `channels-${connection.id}`,
      (connection.settings.channels || []).join("\n"),
      "textarea",
    );
    channels.placeholder = "engineering\nproduct";
    form.append(
      node(
        "p",
        "Only listed channels are allowed after saving. An empty list blocks all Slack searches.",
        "muted",
      ),
    );
  }
  if (connection.provider === "linear") {
    linearTeams = field(
      form,
      "Allowed Linear teams (one key per line)",
      `teams-${connection.id}`,
      (connection.settings.teams || []).join("\n"),
      "textarea",
    );
    linearTeams.placeholder = "ENG\nPRODUCT";
    form.append(
      node(
        "p",
        "Only listed team keys are allowed after saving. An empty list blocks all Linear requests.",
        "muted",
      ),
    );
  }
  if (connection.kind === "mcp") {
    bearer = field(
      form,
      "Replacement bearer token (optional)",
      `bearer-${connection.id}`,
      "",
      "password",
    );
    bearer.autocomplete = "off";
    bearer.maxLength = 8192;
    form.append(
      node(
        "p",
        "Save authentication replaces the credential and clears all tools. Leave the field empty to remove authentication.",
        "muted",
      ),
    );
    form.append(button("Save authentication", async () => {
      if (
        !confirm(
          "Replace authentication and clear all tool selections? An empty field removes authentication.",
        )
      ) return;
      await api(`/connections/${connection.id}`, "PATCH", {
        bearerToken: bearer.value,
      });
      bearer.value = "";
      await refresh(connection.id);
      message("Authentication saved. Discover tools and select them again.");
    }, true));
  }
  const save = node("button", "Save account");
  save.type = "submit";
  form.append(save);
  submit(form, async () => {
    const changes = { name: name.value.trim() };
    if (repositories) {
      changes.settings = {
        repositories: repositories.value.split(/[\n,]/).map((s) => s.trim())
          .filter(Boolean),
      };
    }
    if (channels || linearTeams) {
      const input = channels || linearTeams;
      changes.settings = {
        [channels ? "channels" : "teams"]: input.value.split(/[\n,]/).map((
          value,
        ) => value.trim()).filter(Boolean),
      };
    }
    await api(`/connections/${connection.id}`, "PATCH", changes);
    await refresh(connection.id);
    message("Account settings saved.");
  });
  edit.append(form);
  detail.append(edit);
  const tools = node("details");
  tools.append(
    node("summary", `Tools · ${connection.enabledTools.length} enabled`),
  );
  const toolForm = node("form", "", "tools");
  for (const tool of connection.tools) {
    const row = node("div", "", "tool");
    const checkbox = node("input");
    checkbox.type = "checkbox";
    checkbox.id = `${connection.id}-${tool.id}`;
    checkbox.value = tool.id;
    checkbox.checked = connection.enabledTools.includes(tool.id);
    const label = node("label", tool.name);
    label.htmlFor = checkbox.id;
    row.append(
      checkbox,
      label,
      node(
        "p",
        tool.description || "No description supplied by this server.",
        "muted",
      ),
    );
    if (connection.kind === "mcp") {
      row.append(node(
        "p",
        tool.annotations?.readOnlyHint === true
          ? "Server label: read only. Review this tool before enabling it."
          : "This tool can change data. Review it before enabling it.",
        "muted",
      ));
    }
    toolForm.append(row);
  }
  if (connection.tools.length) {
    const selection = node("div", "", "actions");
    for (
      const [label, checked] of [["Enable all", true], [
        "Clear selection",
        false,
      ]]
    ) {
      selection.append(button(label, () => {
        for (const input of toolForm.querySelectorAll("input[type=checkbox]")) {
          input.checked = checked;
        }
        message("Selection changed. Select Save tools to apply it.");
      }, true));
    }
    toolForm.prepend(
      node(
        "p",
        "Enable all selects every listed tool, including tools that change data. New tools require a new selection.",
        "muted",
      ),
      selection,
    );
    const saveTools = node("button", "Save tools");
    saveTools.type = "submit";
    toolForm.append(saveTools);
    submit(toolForm, async () => {
      const enabledTools = [...toolForm.querySelectorAll("input:checked")].map(
        (input) => input.value,
      );
      await api(`/connections/${connection.id}`, "PATCH", { enabledTools });
      await refresh(connection.id);
      message("Tool permissions saved.");
    });
  } else {toolForm.append(
      node("p", "Discover tools before you select them.", "muted"),
    );}
  tools.append(toolForm);
  detail.append(tools);
  card.append(detail);
  return card;
}
async function copy(value, success) {
  try {
    await navigator.clipboard.writeText(value);
    message(success);
  } catch {
    throw new Error(
      "Clipboard access failed. Select the MCP address or save the configuration file.",
    );
  }
}
async function showSession(session) {
  if (!session) {
    clearPrivateView();
    return;
  }
  if (userId === session.user.id) return;
  clearPrivateView();
  userId = session.user.id;
  byId("signin-panel").hidden = true;
  byId("connections-panel").hidden = false;
  document.body.classList.add("signed-in");
  const revision = generation;
  await refresh();
  if (revision !== generation) return;
  await gmailApprovals.load();
  if (!byId("gmail-search-review").hidden) workspace.show("connectors");
  await vault.mount();
  if (revision === generation) message("Connections loaded.");
}
async function start() {
  if (globalThis.top !== globalThis.self) {
    throw new Error(
      "Open Swarm directly to manage connections and approve Gmail searches.",
    );
  }
  const response = await fetch(endpoint + "/config", {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error("Swarm is unavailable. Reload this page to try again.");
  }
  config = await response.json();
  byId("approved-hosts").textContent = `Supported hosts in this beta: ${
    config.customApprovedHosts.join(", ") || "none"
  }. Other hosts are unavailable.`;
  auth = createClient(config.projectUrl, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  auth.auth.onAuthStateChange((_event, session) => {
    const sequence = ++authSequence;
    // Run API requests after the Auth callback releases its session lock.
    setTimeout(
      () => {
        if (sequence === authSequence) {
          showSession(session).catch((error) => message(error.message, true));
        }
      },
      0,
    );
  });
  byId("github-signin").addEventListener(
    "click",
    (event) =>
      busy(event.currentTarget, async () => {
        teams.prepareSignIn();
        gmailApprovals.prepareSignIn();
        const { error } = await auth.auth.signInWithOAuth({
          provider: "github",
          options: { redirectTo: new URL("./", location.href).href },
        });
        if (error) {
          throw new Error("GitHub sign-in could not start. Try again.");
        }
      }),
  );
  submit(byId("signin-form"), async () => {
    const { data, error } = await auth.auth.signInWithPassword({
      email: byId("email").value.trim(),
      password: byId("password").value,
    });
    byId("password").value = "";
    if (error) {
      throw new Error(
        "Sign-in failed. Check your email and password, or use GitHub.",
      );
    }
    await showSession(data.session);
  });
  byId("signout").addEventListener(
    "click",
    (event) =>
      busy(event.currentTarget, async () => {
        const { error } = await auth.auth.signOut({ scope: "local" });
        if (error) {
          throw new Error(
            "Sign-out failed. Check your connection and try again.",
          );
        }
        clearPrivateView();
        message("Signed out of this browser.");
        byId("github-signin").focus();
      }),
  );
  byId("copy-endpoint").addEventListener(
    "click",
    (event) =>
      busy(
        event.currentTarget,
        () => copy(byId("endpoint").value, "MCP address copied."),
      ),
  );
  byId("copy-key").addEventListener(
    "click",
    (event) =>
      busy(
        event.currentTarget,
        () => copy(newKey.token, "Agent token copied."),
      ),
  );
  byId("copy-config").addEventListener(
    "click",
    (event) =>
      busy(event.currentTarget, () =>
        copy(
          JSON.stringify(newKey.configuration, null, 2),
          "Agent configuration copied.",
        )),
  );
  byId("download-config").addEventListener(
    "click",
    (event) =>
      busy(event.currentTarget, () => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(newKey.configuration, null, 2)], {
            type: "application/json",
          }),
        );
        const link = node("a");
        link.href = url;
        link.download = "swarm-mcp.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        message("Configuration saved. Keep this file private.");
      }),
  );
  submit(byId("custom-form"), async () => {
    const url = new URL(byId("custom-url").value);
    if (
      url.protocol !== "https:" ||
      !config.customApprovedHosts.includes(url.hostname)
    ) {
      throw new Error(
        "Use an HTTPS URL on one of the supported hosts shown above.",
      );
    }
    const value = await api("/connections", "POST", {
      kind: "mcp",
      name: byId("custom-name").value.trim(),
      endpointUrl: url.href,
      ...(byId("custom-bearer").value
        ? { bearerToken: byId("custom-bearer").value }
        : {}),
    });
    byId("custom-form").reset();
    await refresh(value.connection.id);
    message(
      "MCP server added. Discover tools and select the tools your agents can use.",
    );
  });
  const refreshButton = button("Refresh accounts", async () => {
    await refresh();
    message("Connections refreshed.");
  }, true);
  refreshButton.id = "refresh-accounts";
  byId("refresh-slot").append(refreshButton);
  byId("connector-search").addEventListener("input", browseConnectors);
  byId("connector-category").addEventListener("change", browseConnectors);
  byId("show-connected").addEventListener(
    "click",
    () => setConnectorMode("connected"),
  );
  byId("show-catalog").addEventListener(
    "click",
    () => setConnectorMode("catalog"),
  );
  byId("add-connector").addEventListener("click", () => {
    setConnectorMode("catalog");
    byId("connector-search").value = "";
    browseConnectors();
    byId("connector-search").focus();
  });
  browseConnectors();
  const { data, error } = await auth.auth.getSession();
  if (location.search.includes("code=") || location.hash) {
    history.replaceState(null, "", location.pathname);
  }
  if (error) message("Sign-in failed. Try signing in again.", true);
  else {
    await showSession(data.session);
    if (!data.session) message();
  }
}
globalThis.addEventListener("message", (event) => {
  if (
    event.origin === location.origin && event.source === popup &&
    event.data?.type === "swarm-connected" && userId
  ) {
    refresh().then(() => message("Connection saved.")).catch((error) =>
      message(error.message, true)
    );
  }
});
start().catch((error) =>
  message(
    error.message || "Swarm could not load. Reload this page to try again.",
    true,
  )
);
