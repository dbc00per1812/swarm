const outcomes = {
  allowed: "Allowed",
  denied: "Denied",
  failed: "Failed",
  approval_required: "Approval required",
};
const reasons = {
  execution_started: "The request started. No completion was recorded.",
  completed: "The tool completed.",
  tool_unavailable: "The tool or connection is not available to this key.",
  connection_required: "Select an account with its connection ID.",
  resource_denied: "The resource is outside the allowed scope.",
  permission_changed:
    "Access changed or the key was revoked during the request.",
  provider_failed: "The service request failed.",
  approval_required: "This request needs approval in Swarm.",
};

export function createActivity(
  { api, node, button, getUserId, getConnections = () => [] },
) {
  const panel = document.getElementById("activity-panel");
  let sequence = 0;
  function clear() {
    sequence++;
    panel.replaceChildren();
  }
  async function mount() {
    const current = ++sequence, owner = getUserId();
    if (!owner) return clear();
    const live = () => current === sequence && getUserId() === owner;
    panel.setAttribute("aria-busy", "true");
    panel.replaceChildren(node("p", "Loading request history…", "muted"));
    try {
      const [result, inventory] = await Promise.all([
        api("/activity"),
        api("/access-keys"),
      ]);
      if (!live()) return;
      if (
        !Array.isArray(result.events) || result.events.length > 100 ||
        !Array.isArray(inventory.keys)
      ) {
        throw new Error(
          "Request history could not be read. Refresh the history.",
        );
      }
      const events = result.events.filter((event) =>
        event && Object.hasOwn(outcomes, event.outcome)
      );
      panel.replaceChildren();
      const toolbar = node("div", "", "activity-toolbar");
      const field = node("div");
      const label = node("label", "Decision");
      label.htmlFor = "activity-outcome";
      const filter = node("select");
      filter.id = "activity-outcome";
      for (
        const [value, text] of [
          ["", "All decisions"],
          ...Object.entries(outcomes),
        ]
      ) {
        const option = node("option", text);
        option.value = value;
        filter.append(option);
      }
      field.append(label, filter);
      toolbar.append(field, button("Refresh history", mount, true));
      const count = node("p", "", "muted");
      count.setAttribute("aria-live", "polite");
      const wrapper = node("div", "", "activity-table-wrapper");
      const table = node("table", "", "activity-table");
      const caption = node("caption", "Recent agent requests");
      const head = node("thead");
      const heading = node("tr");
      for (const text of ["Agent and tool", "Connection", "Decision", "Time"]) {
        const th = node("th", text);
        th.scope = "col";
        heading.append(th);
      }
      head.append(heading);
      const rows = node("tbody");
      table.append(caption, head, rows);
      wrapper.append(table);
      const empty = node("p", "", "empty-state");
      panel.append(
        toolbar,
        count,
        wrapper,
        empty,
        node(
          "p",
          "History records request metadata. It excludes raw keys, search queries, and service results.",
          "muted",
        ),
      );
      function render() {
        rows.replaceChildren();
        const shown = events.filter((event) =>
          !filter.value || event.outcome === filter.value
        );
        count.textContent = `${shown.length} ${
          shown.length === 1 ? "request" : "requests"
        } · Latest 100 records`;
        empty.hidden = shown.length > 0;
        empty.textContent = events.length
          ? "No requests match this decision."
          : "No agent requests yet. History appears when an agent uses your Swarm key.";
        wrapper.hidden = !shown.length;
        for (const event of shown) {
          const row = node("tr");
          const key = inventory.keys.find((key) => key.id === event.keyId);
          const connection = getConnections().find((connection) =>
            connection.id === event.connectionId
          );
          const identity = node("td");
          identity.append(
            node("strong", key?.name || "Agent key"),
            node(
              "small",
              typeof event.toolId === "string"
                ? event.toolId.replaceAll("_", " ")
                : "Unavailable tool",
              "muted",
            ),
          );
          const decision = node("td");
          decision.append(
            node(
              "strong",
              outcomes[event.outcome],
              `decision decision-${event.outcome}`,
            ),
            node(
              "small",
              reasons[event.reason] ||
                "See the agent response for request details.",
              "muted",
            ),
          );
          const date = new Date(event.createdAt);
          const time = node(
            "td",
            Number.isNaN(date.getTime())
              ? "Unknown time"
              : date.toLocaleString(),
          );
          row.append(
            identity,
            node("td", connection?.name || "Unavailable connection"),
            decision,
            time,
          );
          rows.append(row);
        }
      }
      filter.addEventListener("change", render);
      render();
    } catch (error) {
      if (!live()) return;
      const alert = node(
        "p",
        error.message || "Request history is unavailable. Try again.",
      );
      alert.setAttribute("role", "alert");
      panel.replaceChildren(alert, button("Retry history", mount, true));
    } finally {
      if (live()) panel.removeAttribute("aria-busy");
    }
  }
  return { mount, clear };
}
