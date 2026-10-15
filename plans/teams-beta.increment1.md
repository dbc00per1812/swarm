# Team increment 1 verification

Organization storage and authenticated management routes are implemented on
`feature/swarm-teams`. Shared MCP execution remains unavailable. Personal
connections and agent keys retain their existing ownership.

## Management contract

Every route requires a confirmed Supabase session. The gateway verifies the
session before it calls the database function. The gateway supplies the user ID.
Browser database roles cannot call the function or access team tables.

| Method | Route | Result |
| --- | --- | --- |
| GET | `/v1/organizations` | List the caller's organizations. |
| POST | `/v1/organizations` | Create an organization with `{ name }`. |
| GET | `/v1/organizations/:id` | Return organization details for a current member. |
| DELETE | `/v1/organizations/:id` | Delete the organization as its owner. |
| POST | `/v1/organizations/:id/invitations` | Create an invitation as the owner. |
| DELETE | `/v1/organizations/:id/invitations/:invitationId` | Revoke an unused invitation as the owner. |
| POST | `/v1/invitations/preview` | Preview the organization with `{ token }`. |
| POST | `/v1/invitations/accept` | Accept the invitation with `{ token }`. |
| DELETE | `/v1/organizations/:id/members/:userId` | Remove a member as the owner, or leave as that member. |
| PATCH | `/v1/organizations/:id/shares/:connectionId` | Replace the caller's selected share with `{ toolIds }`. |
| DELETE | `/v1/organizations/:id/shares/:connectionId` | Withdraw the caller's share. |

Organization creation returns `{ organization }` with HTTP 201. List requests
return `{ organizations }`. Detail, preview, and acceptance return
`{ organization }`. Share replacement returns `{ share }`. Delete requests return
HTTP 204. Invitation creation returns `{ invitation, invitationUrl }` with HTTP
201. The invitation metadata contains its ID and expiry.

The creator has the owner role. Other members have the member role. The owner
must delete the organization before leaving. An organization owner cannot change
another member's connection or share.

Invitations use random 32-byte tokens with a 24-hour expiry. Storage contains
only SHA-256 hashes. Links put tokens in `#invite=...`. Preview requires sign-in
and returns only the organization ID and name. Preview does not add membership.
Acceptance locks the organization and invitation. It checks expiry, revocation,
and prior use after locking. Membership creation and invitation consumption use
one transaction. Existing members cannot consume an invitation.

Grants contain the organization, connection, owner, and selected tool IDs. The
function accepts only enabled tools in the connection's current catalog. Foreign
keys bind each grant to connection ownership and membership. Member departure,
connection deletion, and organization deletion remove the related grants.

Organization details expose selected metadata and shared tool descriptions.
They exclude credentials, account labels, endpoints, settings, and invitation
hashes. Members receive no invitation management metadata. Existing personal
connection routes retain their owner filters.

Audit rows record actor, organization, action, target, and time. Audit rows retain
identifiers after organization or account deletion. The table has no automatic
expiry. This adds identifier retention for team changes. Browser roles have no
access. The gateway role can insert and read audit rows. It cannot change,
delete, or truncate them.

## Verification

- Nine new HTTP tests pass. All 49 gateway tests pass.
- All 13 existing page tests pass. Both browser bundles build.
- Deno type checks, lint, formatting, and Git whitespace checks pass.
- All 41 team database assertions pass on hosted Postgres.
- All 26 storage, 12 import, and 12 OAuth assertions pass with the migration present.
- Removing the service-role permission restriction makes the team suite fail.
- Database checks include real gateway-role reads, denials, creation, and audit insertion.
- Database checks verify member departure and deferred constraints during account deletion.
- HTTP checks verify safe metadata and unavailable shared MCP execution.

Hosted tests apply the migration and synthetic fixtures within rollback
transactions. They do not install the migration or change production data.
Concurrent invitation requests received source review. The hosted tests verify
single use sequentially; they do not run simultaneous database sessions.

Independent source, TypeScript, security, and database reviews found no remaining
material issue. The database review found excess default gateway-role audit
permissions. The migration now removes those defaults before granting access.
The regression check verifies the corrected permissions.

## Deployment and next increment

The team migration, gateway, and website have not been deployed. Pull request 4
remains a draft. Named review and release authorization remain required before
merge or publication. The private credential incident remains open because
rotation is unverified.

Increment 2 must enforce current membership and explicit grants before each
shared upstream request. It must also withdraw grants atomically during manual
credential replacement, reconnect, and catalog replacement. Routine token
refresh must preserve grants. Increment 3 will add website controls and verify
real two-user flows. Do not interpret this increment as completed team execution.
