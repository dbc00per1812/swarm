# Lightweight teams handoff

## Current state

The user authorized implementation after the Connections technical release
review. The user requested a new chat after each increment and automatic
continuation until the agreed functionality is complete. Do not require manual
session restarts.

The Connections technical review is complete at commit `f323e8e`. See
`plans/connections-beta.release-review.md` for evidence and remaining limits.
Pull request 4 remains a draft because named release approval is separate. The
earlier private credential-output incident remains open; rotation is unverified.
Do not claim that technical review closed that incident.

Use `/Users/darragh/SWARM/.wt-swarm-mcp-poc` on `feature/swarm-teams`. The
workspace root is a container, not a Git repository. The team branch starts from
the reviewed release commit. Do not add team changes to `feature/swarm-mcp-poc`
or pull request 4. If creating a team pull request, set
`--base feature/swarm-mcp-poc` explicitly. Preserve the repository's named
review and release gate. Do not merge without it.

Read repository instructions and applicable skills before source changes. Use
the existing source conventions. Commit each completed increment and update this
handoff before starting its successor in a new chat. Keep Claude configuration
and the existing Muse connection unchanged. This repository is public. Never
print or commit private credentials or identities.

## Accepted product scope

- Users can create organizations and invite members through copyable links.
- Organizations have two roles: owner and member. The creator is the owner.
- The owner manages invitations, removes members, and deletes the organization.
- Members can leave. An owner must delete an owned organization before leaving.
- Connections remain private by default and retain their existing personal
  owner.
- Members can share selected tools from their own connections with an
  organization.
- Each member uses their existing personal Swarm agent key for permitted shared
  tools.
- Only the connection owner can change credentials, reconnect, or manage that
  connection.
- Recipients can see safe shared metadata, never credentials or provider
  secrets.
- Removing membership or withdrawing a share stops subsequent shared tool
  access.
- A connection owner's departure removes their shares from that organization.

Keep the implementation small. Billing, enterprise roles, ownership transfer,
organization agent keys, and an email delivery service are outside this scope.
No paid purchase or upgrade is authorized.

## Increment boundaries

### Increment 1: organization storage and management API

Implement additive storage for organizations, membership, invitations, and
connection tool grants. Add authenticated management routes and meaningful
ownership tests. Complete database and API permission checks before UI work.
Keep shared MCP execution unavailable until increment 2 enforces its
permissions.

Use single-use invitation links with a reasonable short expiry, such as 24
hours. Store only a hash of a random 32-byte invitation token. Permit owner
revocation. Require explicit acceptance while signed in. Acceptance must be
atomic. Return only minimal organization metadata during invitation preview. Do
not create membership merely by opening a link.

Enforce all management permissions on the server. Apply RLS and restricted
grants in the migration. Record privileged changes in an audit table using
existing repository facilities where available. Do not assume another
repository's `audit.log_event` function exists here. Record identifiers without
secrets.

A grant identifies the organization, connection, connection owner, and selected
tool IDs. Tie grants to the owner's membership so departure removes their
shares. Never change credential ownership or AES-GCM authenticated data to
enable sharing. Keep existing owned-connection management routes restricted to
their owner. Use a separate safe shared-connection listing where needed.

### Increment 2: shared MCP access

Resolve the caller's own connections and explicitly shared tools through their
existing personal key. Require current membership and current tool grants before
each provider or custom MCP request. A failed permission read must deny access.

Sharing must not widen the connection owner's enabled tool set. Newly discovered
tools must not become shared automatically. Use explicit connection selection
when more than one permitted connection matches. Make available connection
identifiers and names clear in `hub_status`. Do not expose another user's
credential management through shared connection IDs.

Test withdrawal, member removal, owner departure, deleted connections, disabled
tools, foreign identifiers, and direct execution of unavailable tools. Include
permission checks after asynchronous preparation and before upstream calls.
Preserve the existing custom MCP destination restrictions.

Credential replacement and manual reconnect must withdraw existing grants until
the owner shares again. Routine provider token refresh must preserve grants.
Apply credential changes and grant withdrawal atomically to prevent races.
Catalog replacement must clear tool grants. Do not identify accounts by display
name because names are not unique. Lock relevant rows during conflicting writes.

### Increment 3: website and end-to-end verification

Add simple organization, member, invitation, and sharing controls to the
existing website. Keep its current visual language and accessible controls. Use
a token fragment for invitation links. Capture it before existing fragment
cleanup. Preserve a pending invitation safely across sign-in, then require
explicit acceptance. Do not place invitation secrets in logs or query strings.

Exercise two-user sharing through the real website and MCP endpoint. Verify
desktop and mobile layouts, invitation acceptance, selected tool access,
withdrawal, membership removal, owner departure, and connection privacy. Verify
the original four service reads and original agent setup after cleanup. Remove
disposable users, organizations, keys, and private fixture files. Complete
source, database, JavaScript, and security reviews as applicable. Respect named
release authorization before any new publication or merge.

## Completion and session changes

After each increment, run its required checks and resolve material review
findings. Commit all in-scope changes. Preserve unrelated changes if any appear.
Update this handoff with the commit, checks, deployment state, and next action.
Start the next chat with `mcp__codex_app__create_thread` and a complete prompt.
The user explicitly authorized these new chats. Keep the existing project. Do
not choose a model override. Wait until the next chat starts work. Do not
duplicate its source changes from the preceding chat.

The final increment must report tested behavior and material limits accurately.
If named approval is absent, finish implementation and review while retaining
that release gate. Do not invent another person's approval.

## Current verification and private operations

The release has 40 passing gateway tests and 13 passing page tests. Hosted
database checks passed 26 storage, 12 import, and 12 OAuth assertions. The
production gateway is version 14. GitHub Pages deployment is
`5fe41b88ee9607b3186f6208304a2d83c9ed63d8`. All three release migrations are
installed and registered. After release cleanup, production has four personal
connections, one active agent key, and no pending authorizations. All four
original service reads pass.

Private operational files remain under `~/.config/swarm/` outside this
repository. See `plans/connections-beta.handoff.md` for their purposes. Inspect
helpers before use. Never print access files or raw credential responses. Use
disposable fixtures and rollback transactions. Never reset the hosted database.
No Docker, Supabase CLI, or `psql` is available. The Management API works.

## Increment 1 result

Increment 1 is complete. See `plans/teams-beta.increment1.md` for the management
API contract, permission controls, review results, and verification limits.
Implementation commit: `d0916dc02b8d75835735454cf470f95b16740de5`.
Draft team pull request: `https://github.com/dbc00per1812/swarm/pull/5`.
Its base is `feature/swarm-mcp-poc`; its head is `feature/swarm-teams`.
Keep this pull request as a draft during the remaining increments.

The additive migration is `20261015220000_lightweight_teams.sql`. The team API
uses `teams.ts` through `beta-gateway.ts`. The server-only database function is
`swarm_team_manage(uuid,text,uuid,jsonb)`. It enforces organization membership,
owner controls, invitation acceptance, and selected-tool sharing in transactions.

All 49 gateway tests and 13 page tests pass. Hosted rollback checks pass 41 team,
26 storage, 12 import, and 12 OAuth assertions. Type checks, lint, formatting,
builds, and whitespace checks pass. Independent source, TypeScript, security,
and database reviews found no remaining material issue. The audit-permission
finding was fixed and has a failing mutation check.

No team migration, gateway, or website deployment occurred. Production remains
on the reviewed Connections release. A read-only count check confirms four
personal connections, one active key, and no pending authorizations. The team
tables are absent after rollback. Shared MCP execution remains unavailable.
Pull request 4 remains a draft. Named approval and the open private credential
incident remain separate release limits.

## Increment 2 result

Increment 2 is complete. Implementation commit:
`0f74e30`. See `plans/teams-beta.increment2.md` for execution controls,
transaction behavior, review results, and verification limits.

Each personal agent key now resolves owned connections and explicitly shared
tools. The server-only function is `swarm_team_connections(uuid,uuid)`.
It checks current recipient membership, owner membership, grants, enabled tools,
and catalog IDs. Native and custom upstream requests read current permissions
again after asynchronous preparation. Failed reads deny access. Ambiguous native
matches require a connection ID. Shared IDs do not permit credential management.

Migration `20261015230000_shared_tool_access.sql` follows the increment 1
migration. Manual credential saves, reconnect, and catalog replacement withdraw
grants within their transactions. Routine refresh preserves grants. Withdrawal
records identifier-only audit events. Writers retain the organization, connection,
and grant lock order. Display names do not determine account identity.

All 67 gateway tests and 13 page tests pass. Hosted rollback checks pass 24 new
shared access assertions and the existing 91 assertions. The total is 115.
Type checks, lint, formatting, builds, and whitespace checks pass. Independent
source, TypeScript, security, and database reviews found no remaining material
issue. Five mutations fail their behavioral checks: four gateway mutations and
one database withdrawal mutation. Restored gateway checks pass.

Hosted database tests use rollback transactions. They do not exercise concurrent
database sessions. Source reviews checked lock order. Actual two-user website
and MCP verification remains increment 3 work.

No team migration, gateway, or website deployment occurred. Production still
has four personal connections, one active key, no pending authorizations, and no
team tables. Install both team migrations before deploying the changed gateway,
when release authorization exists. Pull requests 4 and 5 remain drafts. Named
review and release approval remain required. The credential incident remains
open because rotation is unverified. The existing Muse connection is unchanged.

## Next action

Start increment 3 in a new chat in the saved THESWARM project.
Project ID: `e0463b41-a2f0-42ee-bbe2-2dcbeed54e25`. Use local
execution and omit model overrides. Use this worktree on `feature/swarm-teams`.
Read this handoff first, then the increment 1 and increment 2 evidence files.

Add website organization, member, invitation, and selected sharing controls.
Use invitation fragments. Capture them before existing fragment cleanup.
Preserve pending invitations across sign-in, then require explicit acceptance.
Use current design conventions and accessible controls. Keep credentials private.

Complete actual two-user website and MCP verification where authorized.
Preserve the named release gate. No team deployment or publication is authorized.
Do all available implementation and verification work. State any remaining hosted
verification limit honestly. Do not invent approval or report deployment.
Use disposable fixtures and rollback transactions. Never reset the database.

Private read-only database checks are available in
`~/.config/swarm/teams-db-check.py`. Inspect this helper before use.
It reads Management API access from the existing private file. It prints only
assertion counts or safe production counts. Its modes are `suite` and `state`.
Its optional mutation argument disables manual withdrawal inside a rollback
transaction. Raw failures stay in `~/.config/swarm/teams-db-error.json`.
Do not print that file without removing sensitive values. The older operational
helpers have deployment modes and raw error output. Do not run those modes.

Commit and push the completed increment. Update draft team pull request 5 and
this handoff with evidence and remaining release limits. Preserve the separate
Connections branch and pull request 4. Keep Claude configuration unchanged.
