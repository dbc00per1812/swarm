# Connections gateway verification

Increment 2 implements the user gateway and preserves the existing agent
connection. The production entry point imports `beta-gateway.ts`. The old
gateway module remains available for its baseline regression tests.

## Review results

Independent code, TypeScript, and security reviewers inspected the gateway,
credential store, OAuth handling, custom transport, and import transaction. All
final reviews found no remaining blockers.

The reviews identified three defects. Each defect now has a boundary test:

- Execution inspected only the first upstream catalog page. Discovery and
  execution now share the bounded catalog reader.
- Response buffering delayed open SSE messages. A bounded transform now streams
  these messages to the official MCP SDK.
- Permissions could change during upstream initialization. Every upstream
  request now checks the connection revision and ciphertext after DNS lookup.

Hosted testing identified two additional defects:

- The service role could not read the initial owner from `auth.users`. A
  restricted `SECURITY DEFINER` function now returns the confirmed owner ID. The
  import function retains invoker security. Browser roles cannot call either
  function.
- Postgres `jsonb` reordered schema keys. Canonical comparison now ignores
  object key order and preserves array order.

## Automated evidence

- All 39 Deno tests pass, including the existing 20 tests.
- Type checking, Deno lint, formatting, and Git whitespace checks pass.
- Actual hosted Postgres passes 26 storage checks and 12 import checks.
- Database test transactions roll back their fixtures and changes.
- Removing the owner filter makes the account separation test fail.
- Removing canonical schema comparison makes the custom execution test fail.

The custom tests cover pagination, open SSE, changed permissions, malformed
responses, response limits, private destinations, redirects, and the request
deadline.

## Hosted evidence

The replacement passed verification at a separate preview endpoint before
deployment. The preview function was removed after production verification.

Production checks used the existing agent token and two disposable confirmed
users. All checks passed:

- GitHub, Slack, Linear, and Gmail reads through the original endpoint.
- Empty connection lists for new users.
- Two saved GitHub accounts for one user.
- Foreign update, delete, authorize, discover, and key revocation requests.
- Independent OAuth states for the two saved accounts.
- Access key creation, discovery, and immediate rejection after revocation.
- Live DNS lookup, custom discovery, explicit tool selection, and a DeepWiki
  read.
- Disabled custom tools disappear and cannot execute directly.

The disposable users and their related records were removed after each run.
Production retains four imported native connections and the existing agent key.

## Remaining release work

Increment 3 must update the website to use the versioned API and persistent
Supabase Auth sessions. The old browser routes are no longer supported. Provider
distribution and public signup still require release checks.

Custom destinations currently require an approved host. The deployed list
contains `mcp.deepwiki.com`. The runtime checks DNS before each request, but
cannot pin DNS results to TLS connections. Keep the approved host restriction.
