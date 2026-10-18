export function createAccessKeys(
  { api, node, button, message, getUserId, onIssued, onRevoked = () => {} },
) {
  let sequence = 0;
  const byId = (id) => document.getElementById(id);
  function clear() {
    sequence++;
    byId("agent-scope-editor").replaceChildren();
    byId("keys").replaceChildren();
  }
  function labelInput(parent, text, id, type = "text") {
    const label = node("label", text);
    label.htmlFor = id;
    const input = node("input");
    input.id = id;
    input.type = type;
    parent.append(label, input);
    return input;
  }
  function live(user, current) {
    return getUserId() === user && current === sequence;
  }
  async function loadKeys(user, current) {
    const { keys } = await api("/access-keys");
    if (!live(user, current)) return;
    const list = byId("keys");
    list.replaceChildren();
    if (!keys.length) {
      list.append(node("p", "No agent keys yet.", "muted empty-state"));
      return;
    }
    for (const key of keys) {
      const row = node("article", "", "key-row");
      const detail = node("div", "", "key-detail");
      detail.append(node("h3", key.name));
      const expired = key.expiresAt && Date.parse(key.expiresAt) <= Date.now();
      const state = key.revokedAt ? "Revoked" : expired ? "Expired" : "Active";
      const tools = key.grants?.reduce((count, grant) =>
        count + grant.toolIds.length, 0) ?? 0;
      detail.append(node(
        "p",
        `${state} · ${
          key.legacy
            ? "Legacy access: all available tools"
            : `${tools} selected tools`
        }`,
        "muted",
      ));
      const limits = (key.grants || []).flatMap((grant) =>
        Object.entries(grant.resources || {}).map(([resource, values]) =>
          `${values.length} ${resource}`
        )
      );
      if (limits.length) {
        detail.append(
          node("p", `Resource limits: ${limits.join("; ")}`, "muted"),
        );
      }
      detail.append(node(
        "p",
        key.expiresAt
          ? `Expires ${new Date(key.expiresAt).toLocaleString()}`
          : "No expiry",
        "muted",
      ));
      row.append(detail);
      if (!key.revokedAt) {
        row.append(button(`Revoke ${key.name}`, async () => {
          await api(`/access-keys/${key.id}`, "DELETE");
          if (!live(user, current)) {
            return;
          }
          onRevoked(key.id);
          message("Agent key revoked.");
          await loadKeys(user, current);
        }, true));
      }
      list.append(row);
    }
  }
  function mount(connections) {
    const user = getUserId(), current = ++sequence;
    const editor = byId("agent-scope-editor");
    editor.replaceChildren();
    if (!user) return;
    const form = node("form", "", "agent-key-form");
    const name = labelInput(form, "Agent key name", "agent-key-name");
    name.required = true;
    name.maxLength = 100;
    name.placeholder = "Research assistant";
    const expiryLabel = node("label", "Key expiry");
    expiryLabel.htmlFor = "agent-key-expiry";
    const expiry = node("select");
    expiry.id = "agent-key-expiry";
    for (
      const [value, text] of [["30", "30 days"], ["7", "7 days"], [
        "90",
        "90 days",
      ], ["", "No expiry"]]
    ) {
      const option = node("option", text);
      option.value = value;
      expiry.append(option);
    }
    form.append(expiryLabel, expiry);
    const scope = node("fieldset", "", "agent-scope-list");
    scope.append(node("legend", "Allowed connections and tools"));
    scope.append(
      node(
        "p",
        "Select the tools this agent can use. New keys start with no access.",
        "muted",
      ),
    );
    const selections = [];
    const resourceLimits = new Map();
    for (
      const connection of connections.filter((row) =>
        row.status === "connected"
      )
    ) {
      const tools = connection.tools.filter((tool) =>
        connection.enabledTools.includes(tool.id)
      );
      if (!tools.length) continue;
      const group = node("fieldset", "", "agent-connection-scope");
      group.append(node("legend", connection.name));
      for (const tool of tools) {
        const label = node("label", "", "agent-tool-option");
        const checkbox = node("input");
        checkbox.type = "checkbox";
        checkbox.id = `agent-tool-${connection.id}-${tool.id}`;
        label.htmlFor = checkbox.id;
        const copy = node("span");
        copy.append(node("strong", tool.name));
        if (tool.description) copy.append(node("small", tool.description));
        label.append(checkbox, copy);
        group.append(label);
        selections.push({
          connectionId: connection.id,
          toolId: tool.id,
          checkbox,
        });
      }
      const resource = {
        github: {
          kind: "repositories",
          title: "Repository access",
          example: "owner/repository",
        },
        slack: {
          kind: "channels",
          title: "Channel access",
          example: "general, engineering",
        },
        linear: { kind: "teams", title: "Team access", example: "ENG, DESIGN" },
      }[connection.provider];
      if (resource && connection.kind === "native") {
        const modeLabel = node("label", resource.title);
        const mode = node("select");
        mode.id = `agent-resource-mode-${connection.id}`;
        modeLabel.htmlFor = mode.id;
        for (
          const [value, text] of [[
            "inherit",
            "Use the connection's allowed resources",
          ], ["restrict", "Restrict this key further"]]
        ) {
          const option = node("option", text);
          option.value = value;
          mode.append(option);
        }
        const restriction = node("div", "", "agent-resource-fields");
        restriction.hidden = true;
        const input = labelInput(
          restriction,
          `Allowed ${resource.kind}`,
          `agent-resource-${connection.id}`,
        );
        input.placeholder = resource.example;
        restriction.append(
          node(
            "p",
            "Separate values with commas. Leave the field empty to deny all resources.",
            "muted",
          ),
        );
        mode.addEventListener("change", () => {
          restriction.hidden = mode.value !== "restrict";
        });
        group.append(modeLabel, mode, restriction);
        resourceLimits.set(connection.id, {
          resource: resource.kind,
          mode,
          input,
        });
      }
      scope.append(group);
    }
    if (!selections.length) {
      scope.append(
        node(
          "p",
          "Connect an account and enable tools to grant access.",
          "muted",
        ),
      );
    }
    const count = node("p", "0 tools selected", "muted");
    count.setAttribute("aria-live", "polite");
    scope.addEventListener("change", () => {
      const selected = selections.filter((item) =>
        item.checkbox.checked
      ).length;
      count.textContent = `${selected} ${
        selected === 1 ? "tool" : "tools"
      } selected`;
    });
    const issue = node("button", "Create agent key");
    issue.id = "create-key";
    issue.setAttribute("aria-disabled", "false");
    issue.type = "submit";
    form.append(scope, count, issue);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (
        !form.reportValidity() || issue.getAttribute("aria-disabled") === "true"
      ) return;
      issue.setAttribute("aria-disabled", "true");
      issue.setAttribute("aria-busy", "true");
      try {
        const grants = [];
        for (
          const selection of selections.filter((item) => item.checkbox.checked)
        ) {
          let grant = grants.find((item) =>
            item.connectionId === selection.connectionId
          );
          if (!grant) {
            grant = { connectionId: selection.connectionId, toolIds: [] };
            const limit = resourceLimits.get(selection.connectionId);
            if (limit?.mode.value === "restrict") {
              grant.resources = {
                [limit.resource]: [
                  ...new Set(
                    limit.input.value.split(",").map((value) => value.trim())
                      .filter(Boolean),
                  ),
                ],
              };
            }
            grants.push(grant);
          }
          grant.toolIds.push(selection.toolId);
        }
        const result = await api("/access-keys", "POST", {
          name: name.value.trim(),
          grants,
          ...(expiry.value
            ? {
              expiresAt: new Date(Date.now() + Number(expiry.value) * 86400000)
                .toISOString(),
            }
            : {}),
        });
        if (!live(user, current)) return;
        onIssued(result);
        message("Agent key created. Copy it from Agent access before closing this page.");
        await loadKeys(user, current);
      } catch (error) {
        if (live(user, current)) message(error.message, true);
      } finally {
        issue.setAttribute("aria-disabled", "false");
        issue.removeAttribute("aria-busy");
      }
    });
    editor.append(form);
    loadKeys(user, current).catch((error) => {
      if (live(user, current)) message(error.message, true);
    });
  }
  return { mount, clear };
}
