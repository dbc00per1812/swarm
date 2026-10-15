import { createClient } from "@supabase/supabase-js";
import { endpoint } from "./config.js";

const fragment = new URLSearchParams(location.hash.slice(1));
history.replaceState(null, "", location.pathname);
async function complete() {
  const provider = fragment.get("provider"),
    state = fragment.get("state"),
    code = fragment.get("code");
  if (!/^[a-f0-9]{64}$/.test(state || "")) throw new Error();
  const stored = sessionStorage.getItem(`swarm-oauth:${state}`);
  sessionStorage.removeItem(`swarm-oauth:${state}`);
  const proof = stored ? JSON.parse(stored) : null;
  if (
    fragment.has("error") ||
    !["github", "slack", "linear", "gmail"].includes(provider) || !code ||
    !/^[a-f0-9]{64}$/.test(proof?.verifier || "")
  ) throw new Error();
  const response = await fetch(endpoint + "/config", {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error();
  const config = await response.json();
  const auth = createClient(config.projectUrl, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await auth.auth.getSession();
  if (error || !data.session || data.session.user.id !== proof.userId) {
    throw new Error();
  }
  const saved = await fetch(endpoint + "/v1/oauth/complete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ provider, state, code, verifier: proof.verifier }),
    signal: AbortSignal.timeout(30000),
  });
  if (!saved.ok) {
    await saved.body?.cancel();
    throw new Error();
  }
  await saved.body?.cancel();
  document.querySelector("h1").textContent = "Connection saved.";
  document.getElementById("callback-message").textContent =
    "You can close this window and return to Swarm.";
  if (globalThis.opener && !globalThis.opener.closed) {
    try {
      globalThis.opener.postMessage(
        { type: "swarm-connected", provider },
        location.origin,
      );
      globalThis.close();
    } catch {
      document.getElementById("callback-message").textContent =
        "Connection saved. Open Swarm to refresh your accounts.";
    }
  }
}
complete().catch(() => {
  document.querySelector("h1").textContent = "Connection not saved.";
  const message = document.getElementById("callback-message");
  message.setAttribute("role", "alert");
  message.textContent =
    "Return to Swarm, sign in with the account that started this connection, and select Connect or Reconnect again.";
});
