// Capture invitation fragments before Auth or URL cleanup can remove them.
const storageKey = "swarm-pending-invitation";
const lifetime = 24 * 60 * 60 * 1000;
let pending;
function forgetInvitation() {
  pending = undefined;
  try {
    sessionStorage.removeItem(storageKey);
  } catch { /* Memory is already clear. */ }
}
function saveInvitation() {
  if (pending) sessionStorage.setItem(storageKey, JSON.stringify(pending));
}
try {
  const stored = JSON.parse(sessionStorage.getItem(storageKey) || "null");
  if (
    stored && /^[a-f0-9]{64}$/.test(stored.token) &&
    stored.expiresAt > Date.now() && stored.expiresAt <= Date.now() + lifetime
  ) pending = stored;
  else sessionStorage.removeItem(storageKey);
} catch {
  forgetInvitation();
}
function captureInvitation() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (!fragment.has("invite")) return false;
  forgetInvitation();
  const token = fragment.get("invite");
  if (/^[a-f0-9]{64}$/.test(token || "")) {
    pending = { token, expiresAt: Date.now() + lifetime };
    try {
      saveInvitation();
    } catch { /* Email sign-in can use memory. */ }
  }
  history.replaceState(null, "", location.pathname + location.search);
  return true;
}
captureInvitation();

export function createTeams(
  { api, node, button, field, submit, message, getUserId, copy },
) {
  const byId = (id) => document.getElementById(id);
  let selected, connections = [], sequence = 0, previewSequence = 0;
  function clear() {
    sequence++;
    previewSequence++;
    selected = undefined;
    connections = [];
    byId("teams-panel").hidden = true;
    byId("organizations").replaceChildren();
    byId("team-detail").replaceChildren();
    byId("organization-form").reset();
    showInvitation();
  }
  function showInvitation(organization, error) {
    const panel = byId("invitation-panel");
    panel.replaceChildren();
    if (pending?.expiresAt <= Date.now()) forgetInvitation();
    panel.hidden = !pending;
    if (!pending) return;
    panel.append(node("h2", "Organization invitation"));
    panel.append(
      node(
        "p",
        organization
          ? `Join ${organization.name} with your signed-in Swarm account?`
          : getUserId()
          ? "Refresh organizations to preview this invitation. Acceptance requires your approval."
          : "Sign in to preview this invitation. Opening the link does not add you to an organization.",
      ),
    );
    if (error) {
      const alert = node("p", error);
      alert.setAttribute("role", "alert");
      panel.append(alert);
    }
    if (organization) {
      panel.append(button("Accept invitation", async () => {
        const invitation = pending;
        if (!invitation || invitation.expiresAt <= Date.now()) {
          forgetInvitation();
          showInvitation();
          throw new Error(
            "The invitation expired. Ask the owner for a new link.",
          );
        }
        const result = await api("/invitations/accept", "POST", {
          token: invitation.token,
        });
        if (pending !== invitation) return;
        forgetInvitation();
        showInvitation();
        await refresh(connections, result.organization.id);
        message("Invitation accepted.");
        byId("team-detail").focus();
      }));
    }
    panel.append(button("Dismiss invitation", () => {
      previewSequence++;
      forgetInvitation();
      showInvitation();
      message("Invitation dismissed.");
      byId(getUserId() ? "organization-name" : "github-signin").focus();
    }, true));
  }
  async function preview() {
    if (!pending || !getUserId()) return;
    const invitation = pending, revision = ++previewSequence;
    try {
      const result = await api("/invitations/preview", "POST", {
        token: invitation.token,
      });
      if (revision === previewSequence && pending === invitation) {
        showInvitation(result.organization);
      }
    } catch (error) {
      if (revision !== previewSequence || pending !== invitation) return;
      showInvitation(undefined, error.message);
    }
  }
  async function refresh(
    ownedConnections = connections,
    requestedId = selected,
  ) {
    connections = ownedConnections;
    const revision = ++sequence;
    const result = await api("/organizations");
    if (revision !== sequence) return;
    const next = result.organizations.some((o) => o.id === requestedId)
      ? requestedId
      : undefined;
    let detail;
    if (next) {
      detail = await api(`/organizations/${next}`);
      if (revision !== sequence) return;
    }
    selected = next;
    byId("teams-panel").hidden = false;
    const list = byId("organizations");
    list.replaceChildren();
    for (const organization of result.organizations) {
      list.append(
        button(`${organization.name} · ${organization.role}`, async () => {
          await refresh(connections, organization.id);
          byId("team-detail").focus();
        }, true),
      );
    }
    if (!result.organizations.length) {
      list.append(
        node("p", "You do not belong to an organization yet.", "muted"),
      );
    }
    if (detail) render(detail.organization);
    else byId("team-detail").replaceChildren();
    await preview();
  }
  function render(organization) {
    const root = byId("team-detail"),
      base = `/organizations/${organization.id}`;
    root.replaceChildren();
    root.append(
      node("h3", organization.name),
      node("p", `Your role: ${organization.role}`, "muted"),
    );
    const owner = organization.role === "owner";
    root.append(node("h4", "Members"));
    const members = node("ul");
    for (const member of organization.members) {
      const row = node("li");
      row.append(
        node(
          "p",
          `${
            member.userId === getUserId() ? "You" : member.userId
          } · ${member.role}`,
        ),
      );
      if (owner && member.role !== "owner") {
        row.append(button("Remove member", async () => {
          if (
            !confirm(
              "Remove this member? Their shares and access to this organization will stop.",
            )
          ) return;
          await api(`${base}/members/${member.userId}`, "DELETE");
          await refresh();
          message("Member removed.");
          root.focus();
        }, true));
      }
      members.append(row);
    }
    root.append(members);
    if (owner) {
      root.append(
        node("h4", "Invitations"),
        node(
          "p",
          "Each link works once and expires after 24 hours. Send it only to the intended member.",
          "muted",
        ),
      );
      const linkArea = node("div");
      root.append(button("Create invitation", async () => {
        const result = await api(`${base}/invitations`, "POST");
        // Show the one-time link before a later refresh can fail.
        const showLink = () => {
          const target = byId("invitation-result");
          if (!target || selected !== organization.id) return;
          target.replaceChildren();
          const input = field(
            target,
            "Invitation link",
            "invitation-link",
            result.invitationUrl,
          );
          input.readOnly = true;
          target.append(
            button(
              "Copy invitation link",
              () => copy(input.value, "Invitation link copied."),
            ),
          );
          input.focus();
        };
        showLink();
        await refresh();
        showLink();
        message("Invitation created. Copy the link now.");
      }));
      linkArea.id = "invitation-result";
      root.append(linkArea);
      for (const invitation of organization.invitations) {
        const row = node("div", "", "key-row");
        const status = invitation.revokedAt
          ? "Revoked"
          : invitation.usedAt
          ? "Accepted"
          : Date.parse(invitation.expiresAt) <= Date.now()
          ? "Expired"
          : "Pending";
        row.append(
          node(
            "p",
            `${status} · Expires ${
              new Date(invitation.expiresAt).toLocaleString()
            }`,
            "muted",
          ),
        );
        if (status === "Pending") {
          row.append(button("Revoke invitation", async () => {
            await api(`${base}/invitations/${invitation.id}`, "DELETE");
            await refresh();
            message("Invitation revoked.");
            root.focus();
          }, true));
        }
        root.append(row);
      }
    }
    root.append(
      node("h4", "Shared tools"),
      node(
        "p",
        "Use your personal agent key for these tools. Only each connection owner can change its credentials.",
        "muted",
      ),
    );
    if (!organization.shares.length) {
      root.append(
        node("p", "No tools are shared with this organization.", "muted"),
      );
    }
    for (const share of organization.shares) {
      const item = node("section", "", "service");
      item.append(
        node("h4", share.name),
        node("p", `Connection ID: ${share.connectionId}`, "muted"),
      );
      const list = node("ul");
      for (
        const tool of share.tools.filter((t) => share.toolIds.includes(t.id))
      ) list.append(node("li", tool.name));
      item.append(list);
      if (share.ownerId === getUserId()) {
        item.append(button("Withdraw sharing", async () => {
          await api(`${base}/shares/${share.connectionId}`, "DELETE");
          await refresh();
          message("Sharing withdrawn.");
          root.focus();
        }, true));
      }
      root.append(item);
    }
    root.append(
      node("h4", "Share your tools"),
      node(
        "p",
        "Connections stay private until you share selected tools. Reconnect, credential replacement, or tool discovery withdraws sharing.",
        "muted",
      ),
    );
    for (
      const connection of connections.filter((c) =>
        c.status === "connected" && c.enabledTools.length
      )
    ) {
      const form = node("form", "", "share-tools service");
      const legend = node("h4", connection.name);
      form.append(
        legend,
        node("p", `Connection ID: ${connection.id}`, "muted"),
      );
      form.setAttribute(
        "aria-label",
        `Share tools from ${connection.name} (${connection.id})`,
      );
      const share = organization.shares.find((s) =>
        s.connectionId === connection.id && s.ownerId === getUserId()
      );
      for (
        const tool of connection.tools.filter((t) =>
          connection.enabledTools.includes(t.id)
        )
      ) {
        const row = node("div", "", "tool");
        const input = node("input");
        input.type = "checkbox";
        input.value = tool.id;
        input.id = `share-${organization.id}-${connection.id}-${tool.id}`;
        input.checked = share?.toolIds.includes(tool.id) || false;
        const label = node("label", tool.name);
        label.htmlFor = input.id;
        row.append(input, label);
        form.append(row);
      }
      const save = node("button", "Save sharing");
      save.type = "submit";
      form.append(save);
      submit(form, async () => {
        const toolIds = [...form.querySelectorAll("input:checked")].map((i) =>
          i.value
        );
        if (toolIds.length) {
          await api(`${base}/shares/${connection.id}`, "PATCH", { toolIds });
        } else await api(`${base}/shares/${connection.id}`, "DELETE");
        await refresh();
        message(
          toolIds.length ? "Selected tools shared." : "Sharing withdrawn.",
        );
        root.focus();
      });
      root.append(form);
    }
    if (owner) {
      root.append(
        node(
          "p",
          "Delete this organization before you leave. Deletion stops all organization shares.",
          "muted",
        ),
      );
    }
    root.append(
      button(owner ? "Delete organization" : "Leave organization", async () => {
        if (
          !confirm(
            owner
              ? "Delete this organization, its invitations, memberships, and shares?"
              : "Leave this organization? Your shares and access to its tools will stop.",
          )
        ) return;
        await api(owner ? base : `${base}/members/${getUserId()}`, "DELETE");
        selected = undefined;
        await refresh();
        message(owner ? "Organization deleted." : "You left the organization.");
        byId("organization-name").focus();
      }, true),
    );
  }
  submit(byId("organization-form"), async () => {
    const result = await api("/organizations", "POST", {
      name: byId("organization-name").value.trim(),
    });
    byId("organization-form").reset();
    await refresh(connections, result.organization.id);
    message("Organization created.");
    byId("team-detail").focus();
  });
  byId("refresh-teams").addEventListener("click", (event) => {
    const control = event.currentTarget;
    if (control.getAttribute("aria-disabled") === "true") return;
    control.setAttribute("aria-disabled", "true");
    refresh().then(() => message("Organizations refreshed.")).catch((error) =>
      message(error.message, true)
    )
      .finally(() => control.setAttribute("aria-disabled", "false"));
  });
  globalThis.addEventListener("hashchange", () => {
    if (!captureInvitation()) return;
    previewSequence++;
    showInvitation();
    preview().catch((error) => message(error.message, true));
  });
  showInvitation();
  return {
    clear,
    refresh,
    prepareSignIn() {
      if (!pending) return;
      try {
        saveInvitation();
      } catch {
        throw new Error(
          "Browser storage is unavailable. Allow session storage or use email sign-in to keep this invitation.",
        );
      }
    },
  };
}
