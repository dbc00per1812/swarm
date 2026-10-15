import { endpoint } from "./config.js";

const byId = (id) => document.getElementById(id);
const fragment = new URLSearchParams(location.hash.slice(1));
let session = fragment.get("access_token");
const loginError = fragment.get("error_description");
if (location.hash) history.replaceState(null, "", location.pathname);
const names = {
  github: "GitHub",
  slack: "Slack",
  linear: "Linear",
  gmail: "Gmail",
};
const descriptions = {
  github: "Read pull requests from allowed public repositories.",
  slack: "Search messages available to your Slack account.",
  linear: "Read issues available to your Linear account.",
  gmail: "Search your mail and read message headers.",
};
let popup = null;

function message(text = "", error = false) {
  byId("error").textContent = error ? text : "";
  byId("notice").textContent = error ? "" : text;
}
async function api(path, method = "GET", body) {
  const response = await fetch(endpoint + path, {
    method,
    headers: {
      ...(session ? { Authorization: `Bearer ${session}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "The request failed. Try again.");
  }
  return result;
}
function button(text, action, quiet = false) {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = text;
  if (quiet) node.className = "quiet";
  node.addEventListener("click", async () => {
    if (node.getAttribute("aria-disabled") === "true") return;
    node.setAttribute("aria-disabled", "true");
    message();
    try {
      await action();
    } catch (error) {
      message(error.message, true);
    } finally {
      node.setAttribute("aria-disabled", "false");
    }
  });
  return node;
}
async function refresh() {
  if (!session) return;
  const result = await api("/connections");
  byId("signin-panel").hidden = true;
  byId("connections-panel").hidden = false;
  byId("endpoint").textContent = result.endpointUrl;
  byId("services").replaceChildren();
  for (const service of result.services) {
    const card = document.createElement("article");
    card.className = "service";
    const top = document.createElement("div");
    top.className = "service-top";
    const icon = document.createElement("span");
    icon.className = "service-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = names[service.provider].slice(0, 1);
    const heading = document.createElement("h3");
    heading.textContent = names[service.provider];
    top.append(icon, heading);
    const status = document.createElement("p");
    status.className = "status";
    status.textContent = service.connected
      ? "Connected"
      : service.configured
      ? "Ready to connect"
      : "Application setup needed";
    const account = document.createElement("p");
    account.className = "muted account";
    account.textContent = service.accountLabel ||
      descriptions[service.provider];
    const actions = document.createElement("div");
    actions.className = "actions";
    const connect = button(
      service.connected ? "Reconnect" : "Connect",
      async () => {
        popup = globalThis.open(
          "about:blank",
          "swarm-authorization",
          "width=640,height=760",
        );
        if (!popup) throw new Error("Allow popups for Swarm, then try again.");
        try {
          const start = await api("/connect/" + service.provider, "POST");
          popup.location = start.authorizationUrl;
          message("Complete the approval in the new window. Then return here.");
        } catch (error) {
          popup.close();
          throw error;
        }
      },
    );
    connect.setAttribute(
      "aria-label",
      (service.connected ? "Reconnect " : "Connect ") + names[service.provider],
    );
    if (!service.configured) connect.setAttribute("aria-disabled", "true");
    actions.append(connect);
    if (service.connected) {
      actions.append(button("Disconnect", async () => {
        await api("/disconnect/" + service.provider, "POST");
        await refresh();
        message(names[service.provider] + " was disconnected from Swarm.");
      }, true));
    }
    card.append(top, status, account, actions);
    byId("services").append(card);
  }
}

byId("signin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector("button");
  if (submit.getAttribute("aria-disabled") === "true") return;
  submit.setAttribute("aria-disabled", "true");
  message();
  try {
    const response = await api("/signin", "POST", {
      email: byId("email").value.trim(),
    });
    message(response.message);
  } catch (error) {
    message(error.message, true);
  } finally {
    submit.setAttribute("aria-disabled", "false");
  }
});
byId("signout").addEventListener("click", () => {
  session = null;
  byId("connections-panel").hidden = true;
  byId("services").replaceChildren();
  byId("signin-panel").hidden = false;
  byId("email").focus();
  message("Signed out of this page.");
});
byId("copy-endpoint").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(endpoint);
    message("MCP address copied.");
  } catch {
    message("Select and copy the MCP address above.");
  }
});
globalThis.addEventListener("message", async (event) => {
  if (
    event.origin !== location.origin || event.source !== popup ||
    event.data?.type !== "swarm-connected"
  ) return;
  try {
    await refresh();
    message("The connection was saved. Your agents can now use it.");
  } catch (error) {
    message(error.message, true);
  }
});
if (loginError) message("Sign-in failed. Request a new sign-in link.", true);
if (session) {
  refresh().catch(() => {
    session = null;
    message("Sign in with the Swarm owner's email account.", true);
  });
}
