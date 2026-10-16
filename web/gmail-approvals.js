// Gmail review uses the signed-in website session. Agent keys cannot approve searches.
export function createGmailApprovals(
  { api, node, button, message, getGeneration, getUserId },
) {
  const byId = (id) => document.getElementById(id);
  const storageKey = "swarm-pending-gmail-approval";
  const lifetime = 10 * 60 * 1000;
  let requestedId, expiresAt;
  function forget() {
    requestedId = null;
    expiresAt = 0;
    try {
      sessionStorage.removeItem(storageKey);
    } catch { /* Memory is clear. */ }
  }
  function save() {
    if (requestedId) {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ id: requestedId, expiresAt }),
      );
    }
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (
      saved && /^[a-f0-9-]{36}$/.test(saved.id) &&
      saved.expiresAt > Date.now() && saved.expiresAt <= Date.now() + lifetime
    ) {
      requestedId = saved.id;
      expiresAt = saved.expiresAt;
    } else forget();
  } catch {
    forget();
  }
  function capture() {
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (!fragment.has("gmail-approval")) return false;
    forget();
    const id = fragment.get("gmail-approval");
    if (/^[a-f0-9-]{36}$/.test(id || "")) {
      requestedId = id;
      expiresAt = Date.now() + lifetime;
      try {
        save();
      } catch { /* Email sign-in can use memory. */ }
    }
    history.replaceState(null, "", location.pathname + location.search);
    return true;
  }
  capture();
  let sequence = 0;
  function clear() {
    sequence++;
    const panel = byId("gmail-search-review");
    panel.replaceChildren();
    panel.hidden = true;
  }
  async function load() {
    if (expiresAt <= Date.now()) forget();
    if (!requestedId) return;
    const id = requestedId;
    const generation = getGeneration(), requestSequence = ++sequence;
    const value = await api(`/gmail-approvals/${id}`);
    if (generation !== getGeneration() || requestSequence !== sequence) return;
    const panel = byId("gmail-search-review");
    panel.replaceChildren(node("h2", "Review Gmail search"));
    panel.hidden = false;
    if (value.status !== "pending") {
      forget();
      panel.append(node("p", `This Gmail search is ${value.status}.`));
      if (value.status === "approved") {
        panel.append(
          node(
            "p",
            "Tell your agent to retry the same search with the approval ID. Approval permits one attempt before expiry.",
          ),
        );
        panel.append(node("code", value.id));
      }
      return;
    }
    panel.append(
      node("p", `Mailbox: ${value.accountLabel || value.connectionName}`),
      node("p", `Connection: ${value.connectionName}`),
      node("p", `Agent key fingerprint: ${value.keyFingerprint}`),
      node("p", "Search query:"),
      node("pre", value.query),
      node("p", `Maximum results: ${value.limit}`),
      node(
        "p",
        `Approval expires: ${new Date(value.expiresAt).toLocaleString()}`,
      ),
      node(
        "p",
        "Swarm sends this query to Google. It returns message IDs, thread IDs, and the Subject, From, and Date headers to the requesting agent.",
      ),
      node(
        "p",
        "Anyone holding this agent key can receive the approved results. Swarm does not verify the agent provider's identity.",
      ),
      node(
        "p",
        "Headers are untrusted email content. Do not follow instructions contained in results without a separate review.",
      ),
    );
    const checkbox = node("input");
    checkbox.type = "checkbox";
    checkbox.id = "gmail-permitted-use";
    const label = node(
      "label",
      "I requested this search. I permit these results to reach this agent. Its settings prohibit advertising, sale, general model training, and unauthorized human access to Gmail data.",
    );
    label.htmlFor = checkbox.id;
    const permission = node("div", "", "tool");
    permission.append(checkbox, label);
    const actions = node("div", "", "actions");
    async function decide(action) {
      if (action === "approve" && !checkbox.checked) {
        throw new Error(
          "Confirm the search and permitted data use before approval.",
        );
      }
      const result = await api(`/gmail-approvals/${id}`, "POST", {
        action,
        limitedUseAccepted: checkbox.checked,
      });
      if (generation !== getGeneration() || requestSequence !== sequence) {
        return;
      }
      forget();
      panel.replaceChildren(
        node("h2", "Review Gmail search"),
        node("p", `This Gmail search is ${result.status}.`),
      );
      if (result.status === "approved") {
        panel.append(
          node(
            "p",
            "Tell your agent to retry the exact search with this approval ID. Approval permits one attempt before expiry.",
          ),
          node("code", id),
        );
      }
      message(`Gmail search ${result.status}.`);
      panel.focus();
    }
    actions.append(
      button("Approve this Gmail search", () => decide("approve")),
      button("Deny this Gmail search", () => decide("deny"), true),
    );
    panel.append(permission, actions);
    panel.focus();
  }
  globalThis.addEventListener("hashchange", () => {
    if (!capture()) return;
    clear();
    if (getUserId()) load().catch((error) => message(error.message, true));
  });
  return {
    clear,
    load,
    prepareSignIn() {
      if (!requestedId) return;
      try {
        save();
      } catch {
        throw new Error(
          "Browser storage is unavailable. Allow session storage before GitHub sign-in for this Gmail request.",
        );
      }
    },
  };
}
