const provider = new URLSearchParams(location.search).get("connected");
history.replaceState(null, "", location.pathname);
if (
  ["github", "slack", "linear", "gmail"].includes(provider) && globalThis.opener
) {
  globalThis.opener.postMessage(
    { type: "swarm-connected", provider },
    location.origin,
  );
  globalThis.close();
}
