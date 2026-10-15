# Lightweight teams: increment 3

Increment 3 adds organization and selected sharing controls to the existing
website. Implementation commit: `64bbf88f2c58469760342969f4b22486b9192d0e`. The
branch is `feature/swarm-teams`. Draft pull request 5 targets
`feature/swarm-mcp-poc`.

## Website behavior

Users can create organizations, inspect members, and share selected enabled
tools from their own connections. Owners can create and revoke invitations,
remove members, and delete organizations. Members can leave. Owners must delete
an owned organization before leaving.

Shared tool cards show connection names, connection IDs, and selected tool
names. Recipients receive no credential controls. Connection IDs also
distinguish sharing forms with identical connection names. Existing server
routes enforce all permissions. This increment changes no gateway or database
source.

An owner can withdraw an existing grant after disabling all connection tools.
The website explains automatic withdrawal during reconnect, credential
replacement, and catalog discovery. Personal agent setup explains shared access
through the existing personal key.

Invitation capture runs before Auth setup and existing URL cleanup. It also
handles fragment navigation in an existing tab. Tokens use `#invite=...` and
POST bodies. Pending invitations remain in session storage for at most 24 hours.
They never enter local storage or request URLs. Tests generate synthetic tokens
at runtime.

Preview does not add membership. Acceptance requires an explicit button action.
Dismissal removes the pending token. OAuth sign-in stops with a useful error if
session storage cannot preserve the invitation. Email sign-in can retain the
pending invitation in memory when session storage fails.

Invitation errors remain in a separate alert within the invitation panel. They
cannot interrupt completed team actions or hide new invitation links. A new link
appears before the next detail request. It remains available if that request
fails. The website changes its selected organization only after its detail
request succeeds.

Controls use native elements, connected labels, visible focus, and existing
status regions. Failed detail requests preserve the current view and focus. Long
organization names wrap on narrow screens.

## Verification

- All 32 page tests pass, including the original 13 tests.
- All 67 gateway tests pass.
- Deno gateway type checks, JavaScript lint, formatting, browser builds, and
  whitespace checks pass.
- The dependency audit reports zero vulnerabilities.
- All 115 hosted database assertions pass within rollback transactions.
- Database assertions cover 41 team, 24 shared access, 26 storage, 12 import,
  and 12 OAuth checks.
- Three new behavioral mutations fail: automatic acceptance, excess tool
  selection, and foreign withdrawal controls.
- Mutation checks use temporary source copies. The copies are removed afterward.

Page tests cover invitation restoration without another fragment, explicit
acceptance, expiry, invalid storage, unavailable storage, same-tab invitations,
and stale responses after dismissal or sign-out. They also cover selected
sharing, withdrawal, member removal, organization deletion, recipient privacy,
failed detail requests, and a failed switch between two organizations.

Chromium exercised two isolated browser accounts through the actual website
bundle with synthetic API responses. The flows covered invitation reload and
acceptance, selected sharing, withdrawal, member removal, connection privacy,
and organization deletion. Desktop width was 1280 pixels. Mobile widths were 390
and 320 pixels. A 100-character organization name caused no horizontal overflow.
The inspected screenshots retained the existing visual conventions. The tested
flows produced no page errors.

Axe-core 4.14.0 reported zero WCAG A/AA violations in the owner desktop and
recipient mobile states. This check does not establish complete accessibility
compliance. Screen reader testing was not performed.

Independent source, JavaScript, accessibility, and security reviews completed.
All material findings were fixed and received regression tests. The final
JavaScript review also verified the two-organization selection correction.
Previous database reviews remain applicable because database source is
unchanged.

The saved original agent configuration completed all four original service
reads: GitHub, Slack, Linear, and Gmail. A final read-only count check confirms
four personal connections, one active key, no pending authorizations, and no
team tables. The existing Muse connection and Claude configuration remain
unchanged.

## Verification limits and cleanup

The browser checks use synthetic API responses. They do not prove an integrated
hosted website and shared MCP flow. The gateway tests exercise the actual MCP
handler with synthetic database and provider boundaries. They cover withdrawal,
member removal, connection-owner departure, disabled tools, and connection
privacy.

Actual hosted two-user team execution requires persistent team migrations and
the changed gateway. Neither is authorized for deployment. No team migration,
gateway, or website deployment occurred. Production remains on the reviewed
Connections release. Actual GitHub sign-in redirect completion was not exercised
in the browser checks. Pending invitation restoration and email sign-in were
exercised.

Hosted database checks use rollback transactions. They do not exercise
simultaneous database sessions. Lock order retains its previous source review.

No persistent test users, organizations, keys, or shares were created. Browser
fixtures existed only in isolated contexts and process memory. The browser
contexts, local server, temporary scripts, screenshots, and accessibility
package were removed after verification. Existing private operational files
remain.

## Release gate

All three accepted increments are implemented. Pull requests 4 and 5 remain
drafts. Named review and release authorization remain required before merge,
migration installation, deployment, or publication. No person's approval is
inferred from the technical reviews.

When release authorization exists, install both team migrations in order before
deploying the changed gateway. Complete the hosted two-user website and MCP
checks, remove disposable records, and repeat the original service baseline. The
earlier private credential incident remains open because rotation is unverified.
This implementation does not close that incident.
