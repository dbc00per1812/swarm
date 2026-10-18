# Swarm application

Swarm connects agents to selected accounts and tools. The application includes a personal vault, agent keys, organizations, and request history.

The interface uses black, white, and gray. It follows the browser's light or dark appearance.

## Application sections

- **Connectors:** Add accounts, inspect access, select tools, and restrict resources.
- **Vault:** Store encrypted API keys, provider names, environments, and notes.
- **Agent access:** Create named keys with selected connections, tools, resource limits, and expiry dates.
- **Activity:** Review permitted, denied, failed, and approval-required requests.
- **Organizations:** Share selected tools with members. Connection credentials remain private.

GitHub, Slack, Linear, and Gmail have native connections. Other catalog entries provide MCP setup or an explicit authorization-support status.

MCP means Model Context Protocol. It connects agents to tools.

## Permission enforcement

New agent keys start with no access. Each key grants specific connection IDs and tool IDs.

An optional resource list narrows GitHub repositories, Slack channels, or Linear teams. The server intersects this list with the connection's allowed resources.

An empty resource list denies all resources. A missing GitHub repository list also denies all repositories.

Existing Slack and Linear connections without resource lists retain their previous provider access. Save explicit lists to restrict those connections.

The gateway checks key expiry, revocation, tool grants, resource limits, and current organization access. It repeats permission checks before provider requests.

Gmail searches require browser approval for each exact request. Agent keys cannot approve their own searches.

Stored legacy keys retain their earlier access. The key inventory identifies these keys. Revoke them and create restricted keys when narrower access is required.

Environments are separate service accounts or connections. This version does not infer a provider's production or development environment from a credential.

## Personal vault protection

The browser encrypts every item field before storage. Names, provider labels, environments, keys, and notes remain inside the encrypted document.

The browser derives an AES-256-GCM key from the vault passphrase. Derivation uses PBKDF2-SHA256 with 600,000 iterations and a random 128-bit salt.

Each save uses a new 96-bit initialization vector. Authenticated data binds the document to the account and vault format.

The server stores ciphertext, format information, and a revision. Concurrent updates use a revision check. A stale update cannot overwrite a newer document.

The vault locks after five idle minutes, when the tab becomes hidden, when navigation leaves Vault, and when the account signs out.

Passphrase changes require the current passphrase. A successful change encrypts the document with a fresh salt and key.

If a network failure leaves a passphrase change uncertain, retain both passphrases. Lock and unlock the vault to confirm the saved version.

Swarm cannot recover a lost vault passphrase. There is no account recovery key or independent vault backup feature in this version.

A compromised browser can read an unlocked vault. This implementation has not received an independent security audit.

Personal vault items do not automatically connect services. Connecting a service separately stores its credential using the gateway's existing encryption.

## Request history

Activity records contain account, connection, key, tool, time, outcome, and fixed reason identifiers. They exclude raw credentials, arguments, queries, and provider results.

An audit record must be stored before a tool request begins. If audit storage fails, the gateway refuses execution.

The Activity view returns the latest 100 records from the previous 30 days. New records remove that account's stored records older than 30 days.

Inactive accounts can retain older records until their next request. No scheduled global deletion job is configured by these migrations.

## Development and validation

Install the dependencies:

```sh
npm ci
```

Build the browser files:

```sh
npm run build
```

Run the automated checks:

```sh
npm test
npm run test:db
deno task test
deno task check
npm run test:e2e
```

The browser test requires Deno and Google Chrome. It uses the real application, gateway, encryption, and migrations with an isolated PostgreSQL-compatible database.

The test provides synthetic identity and GitHub responses. It does not use real credentials, contact provider APIs, or write production data.

The test proves vault persistence, passphrase changes, scoped execution, request history, revocation, sign-out, and responsive layouts.

## Deployment

Builds and tests do not deploy this application. Apply the database migrations before publishing the new gateway or browser files.

Required gateway configuration remains unchanged:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
SWARM_UI_URL
SWARM_ENCRYPTION_KEY
```

Configure the native OAuth clients through the existing `SWARM_<PROVIDER>_CLIENT_ID` and `SWARM_<PROVIDER>_CLIENT_SECRET` variables.

`SWARM_ENCRYPTION_KEY` protects connected-service credentials. It does not decrypt personal vault documents.

Configure approved custom MCP hosts with `SWARM_CUSTOM_MCP_HOSTS`. A catalog entry does not authorize a new server destination.

Keep `web/config.js`, the gateway endpoint, and `SWARM_UI_URL` consistent with the deployment. The gateway permits browser requests from the configured UI origin.

Publish `web/`, including `web/dist/`, icons, logos, policy pages, and the OAuth callback page. Preserve HTTPS and the Content Security Policy.

This change adds three migrations:

```text
20261017170000_agent_scopes.sql
20261017180000_personal_vault.sql
20261017200000_activity.sql
```

After deployment, test sign-in, a non-production connection, vault unlock, key revocation, and Gmail approval with authorized test accounts.
