export const connectors = [
  {
    id: "github",
    name: "GitHub",
    category: "Development",
    description: "Pull requests from selected repositories.",
    native: true,
  },
  {
    id: "slack",
    name: "Slack",
    category: "Communication",
    description: "Message search in allowed channels.",
    native: true,
  },
  {
    id: "linear",
    name: "Linear",
    category: "Projects",
    description: "Issues from selected teams.",
    native: true,
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "Communication",
    description: "Approved searches of message headers.",
    native: true,
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "Payments",
    description: "Payments and customers with a scoped agent API key.",
    endpoint: "https://mcp.stripe.com",
    docs: "https://docs.stripe.com/mcp",
    auth: "Agent API key",
  },
  {
    id: "supabase",
    name: "Supabase",
    category: "Development",
    description: "Project tools with a personal access token.",
    endpoint: "https://mcp.supabase.com/mcp",
    docs: "https://supabase.com/docs/guides/ai-tools/mcp",
    auth: "Personal access token",
  },
  {
    id: "github",
    key: "github-mcp",
    name: "GitHub MCP",
    category: "Development",
    description: "Additional GitHub tools with a scoped access token.",
    endpoint: "https://api.githubcopilot.com/mcp/",
    docs: "https://github.com/github/github-mcp-server",
    auth: "Personal access token",
  },
  {
    id: "upstash",
    key: "context7",
    name: "Context7",
    category: "Development",
    description: "Current library documentation for your agents.",
    endpoint: "https://mcp.context7.com/mcp",
    docs: "https://github.com/upstash/context7",
    auth: "Public access",
  },
  {
    id: "notion",
    name: "Notion",
    category: "Knowledge",
    description: "Pages and workspace knowledge.",
    endpoint: "https://mcp.notion.com/mcp",
    docs: "https://developers.notion.com/guides/mcp/overview",
    auth: "OAuth required",
    oauth: true,
  },
  {
    id: "figma",
    name: "Figma",
    category: "Design",
    description: "Design context and components.",
    endpoint: "https://mcp.figma.com/mcp",
    docs: "https://developers.figma.com/docs/figma-mcp-server/",
    auth: "OAuth required",
    oauth: true,
  },
  {
    id: "sentry",
    name: "Sentry",
    category: "Development",
    description: "Errors, issues, and debugging context.",
    endpoint: "https://mcp.sentry.dev/mcp",
    docs: "https://docs.sentry.io/product/sentry-mcp/",
    auth: "OAuth required",
    oauth: true,
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "Development",
    description: "Deployments, projects, and logs.",
    endpoint: "https://mcp.vercel.com",
    docs: "https://vercel.com/docs/agent-resources/vercel-mcp",
    auth: "OAuth required",
    oauth: true,
  },
];
export function logo(node, id) {
  const image = node("img");
  image.src = `logos/${id}.svg`;
  image.alt = "";
  image.width = 24;
  image.height = 24;
  image.className = "connector-logo";
  return image;
}
export function renderCatalog(
  {
    target,
    detailTarget,
    node,
    query = "",
    category = "",
    configured = [],
    approvedHosts = [],
    onSelect,
    selectedId,
    onInspect = () => {},
  },
) {
  const key = (item) => item.key || item.id;
  const matches = connectors.filter((item) =>
    `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(
      query.toLowerCase(),
    ) && (!category || item.category === category)
  );
  const selected = matches.find((item) => key(item) === selectedId) ||
    matches[0];
  const focused = target.ownerDocument.activeElement?.dataset.catalogKey;
  target.replaceChildren();
  for (const item of matches) {
    const row = node("button", "", "catalog-option");
    row.type = "button";
    row.dataset.catalogKey = key(item);
    row.setAttribute("aria-pressed", String(selected === item));
    row.setAttribute("aria-label", item.name);
    const copy = node("span", "", "connector-description");
    copy.append(
      node("strong", item.name),
      node("small", item.category, "muted"),
    );
    row.append(logo(node, item.id), copy);
    row.addEventListener("click", () => {
      onInspect(key(item));
      renderCatalog({
        target,
        detailTarget,
        node,
        query,
        category,
        configured,
        approvedHosts,
        onSelect,
        selectedId: key(item),
        onInspect,
      });
    });
    target.append(row);
  }
  if (focused) {
    [...target.querySelectorAll("button")].find((item) =>
      item.dataset.catalogKey === focused
    )?.focus();
  }
  if (!selected) {
    target.append(
      node(
        "p",
        "No connectors match this search. Try another name or category.",
        "empty-state",
      ),
    );
  }
  if (!detailTarget) return;
  detailTarget.replaceChildren();
  if (!selected) {
    detailTarget.append(
      node("p", "Select a connector to inspect its setup.", "empty-state"),
    );
    return;
  }
  const item = selected;
  const heading = node("div", "", "connector-detail-heading");
  const identity = node("div");
  identity.append(node("h2", item.name), node("p", item.category, "muted"));
  heading.append(logo(node, item.id), identity);
  const configuredNative = item.native && configured.includes(item.id);
  const approved = item.endpoint &&
    approvedHosts.includes(new URL(item.endpoint).hostname);
  detailTarget.append(heading, node("p", item.description, "muted"));
  const details = node("dl", "", "detail-facts");
  function fact(label, value) {
    details.append(node("dt", label), node("dd", value));
  }
  fact(
    "Status",
    item.native
      ? configuredNative ? "Ready to connect" : "Application setup required"
      : item.oauth
      ? "OAuth support pending"
      : approved
      ? "Ready for setup"
      : "Host approval required",
  );
  fact("Sign-in", item.native ? `${item.name} authorization` : item.auth);
  fact(
    "Access",
    item.native
      ? "Selected tools and resources"
      : "Discover and select tools after connecting",
  );
  detailTarget.append(details);
  if (item.oauth) {
    detailTarget.append(
      node(
        "p",
        "This service requires an OAuth flow that Swarm does not support yet.",
        "muted",
      ),
    );
    const link = node("a", `${item.name} setup guide ↗`, "guide-link");
    link.href = item.docs;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    detailTarget.append(link);
  } else {
    const action = node("button", "Add connection");
    action.type = "button";
    action.setAttribute("aria-label", `Add ${item.name} connection`);
    if (item.native && !configuredNative) {
      action.setAttribute("aria-disabled", "true");
    }
    action.addEventListener("click", async () => {
      if (action.getAttribute("aria-disabled") === "true") return;
      action.setAttribute("aria-disabled", "true");
      action.setAttribute("aria-busy", "true");
      try {
        await onSelect(item);
      } finally {
        action.setAttribute("aria-disabled", "false");
        action.removeAttribute("aria-busy");
      }
    });
    detailTarget.append(action);
    if (!item.native && !approved) {
      detailTarget.append(
        node(
          "p",
          "The server operator must approve this host before you can save the connection.",
          "muted",
        ),
      );
    }
  }
}
