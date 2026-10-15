# Lightweight teams: increment 2

Increment 2 adds shared MCP execution through each member's personal agent key.
The branch is `feature/swarm-teams`. Draft pull request 5 targets
`feature/swarm-mcp-poc`.

## Execution controls

`swarm_team_connections(uuid,uuid)` resolves personal connections and explicit
shared tools. The gateway alone can call this function. A shared tool requires
current recipient membership, current connection owner membership, and a current
grant. Its ID must remain in the owner's enabled tools and current catalog.
Multiple organization grants combine by tool ID. A new catalog tool receives no
automatic share.

Discovery and `hub_status` use the permitted connections. Status exposes
connection IDs, names, providers, and permitted tool IDs. It excludes account
labels, endpoints, settings, owner IDs, and credentials. Ambiguous native matches
require `connection_id`, including accounts with identical names. Custom tool
IDs already identify their connection.

Every native provider request reads current permissions again. This includes
refresh requests and each Gmail message request. Checks occur after credential
preparation. Every custom MCP protocol request checks current permissions after
DNS lookup and request body preparation. Initialization, catalog pagination,
tool calls, and transport cleanup use the same control. Failed or malformed
permission reads deny access. Revision and ciphertext checks also reject changed
connections.

Personal credential management routes still query the caller's owner ID.
Recipients cannot edit, delete, reconnect, or rediscover a shared connection.
Custom MCP destinations retain the existing HTTPS, approved host, public DNS,
exact destination, redirect, deadline, and response size restrictions.

## Credential and catalog changes

Migration `20261015230000_shared_tool_access.sql` adds the execution function
and transactional withdrawal controls. Install the earlier team migration first.
Neither migration is installed in production.

Manual credential saves withdraw all grants for that connection. Reconnect
withdraws grants before authorization starts. Catalog replacement withdraws
grants even when rediscovery returns the same catalog. Custom bearer replacement
also replaces the catalog and clears selection. Routine token refresh explicitly
preserves grants. Display names never determine account identity.

Connection writers lock the connection before its grants. Team writes lock the
organization before the connection. Withdrawal does not acquire an organization
lock. Grant deletion and credential or catalog changes use the same transaction.
Automatic withdrawal records identifier-only `unshare` audit events.

## Verification

- All 67 gateway tests pass. The first shared execution test failed before implementation.
- All 13 page tests pass. Both browser bundles build.
- Deno type checks, lint, formatting, and Git whitespace checks pass.
- Hosted rollback checks pass 24 shared access assertions.
- Existing hosted checks pass 41 team, 26 storage, 12 import, and 12 OAuth assertions.
- The hosted total is 115 assertions. All fixtures and team migrations roll back.
- Disabling manual credential withdrawal makes the shared database suite fail.
- Four gateway mutations fail their behavioral tests. The restored source passes.
- Mutations cover native requests, refresh requests, custom requests, and refresh preservation.

Gateway tests cover withdrawal, member removal, owner departure, deleted
connections, disabled tools, foreign IDs, unavailable tools, ambiguous account
selection, and failed permission reads. Race tests withdraw access during
credential refresh, custom DNS lookup, catalog reads, and Gmail requests. Refresh
preservation and owner-only management also have execution tests.

Database tests run permission reads and writes as `service_role`. They verify
stale and foreign credential rejection, identical catalog replacement, and
rollback after a reconnect failure. The original display name remains the same
during credential replacement.

Independent source, TypeScript, security, and database reviews found no remaining
material issue. Review found an invalid GitHub pagination test. The corrected
suite uses Gmail to test withdrawal between provider requests.

Hosted checks use rollback transactions through the Management API. They do not
exercise simultaneous database sessions. Lock order received source review.
Actual two-user website and MCP verification remains increment 3 work.

## Deployment state

No team migration, gateway, or website deployment occurred. Production remains
on the reviewed Connections release. A read-only check confirms four personal
connections, one active key, no pending authorizations, and no team tables.

Pull requests 4 and 5 remain drafts. Named review and release authorization
remain required before merge or publication. The earlier private credential
incident remains open because rotation is unverified. The existing Muse
connection and Claude configuration remain unchanged.

Increment 3 adds website controls and completes authorized two-user verification.
It must preserve the unresolved release gate.
