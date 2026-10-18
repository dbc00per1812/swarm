// f01-uiux · structure: navigation rail with account list and details · differs from last on: density, emphasis
export function createWorkspace(document, { onShow = () => {} } = {}) {
  const views = {
    connectors: {
      title: "Connectors",
      description: "Your accounts and the access they provide.",
    },
    vault: {
      title: "Vault",
      description: "An encrypted home for your keys and credentials.",
    },
    agents: {
      title: "Agent access",
      description:
        "Choose the accounts, resources, and tools each agent can use.",
    },
    activity: {
      title: "Activity",
      description: "Review agent requests and their access decisions.",
    },
    organizations: {
      title: "Organizations",
      description: "Share selected tools with people you choose.",
    },
  };
  let current;
  function show(name) {
    if (!Object.hasOwn(views, name)) return;
    for (const key of Object.keys(views)) {
      document.getElementById(`${key}-view`).hidden = key !== name;
    }
    for (const control of document.querySelectorAll("[data-view]")) {
      if (control.dataset.view === name) {
        control.setAttribute("aria-current", "page");
      } else control.removeAttribute("aria-current");
    }
    document.getElementById("workspace-title").textContent = views[name].title;
    document.getElementById("connections-title").textContent =
      views[name].description;
    document.getElementById("refresh-slot").hidden = name !== "connectors";
    document.getElementById("add-connector").hidden = name !== "connectors";
    document.title = `Swarm — ${views[name].title}`;
    const previous = current;
    current = name;
    onShow(name, previous);
  }
  for (const control of document.querySelectorAll("[data-view]")) {
    control.addEventListener("click", () => show(control.dataset.view));
  }
  show("connectors");
  return { show, current: () => current };
}
