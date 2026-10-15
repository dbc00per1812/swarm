# Team release verification

The Connections and lightweight team changes are merged and deployed. The
release used the user's direct authorization. No separate named release approval
is claimed.

## Published state

- Pull request 4 merged into `main` as
  `660e98f221089b4248b7a7e4d72720dac746bcc3`.
- Pull request 5 merged into `main` as
  `34406f6cd094ace6b448cf6994fc6c0522ab84e5`.
- The team PR was retargeted to `main` after its Connections dependency merged.
- Migration `20261015220000_lightweight_teams.sql` is installed and registered.
- Migration `20261015230000_shared_tool_access.sql` is installed and registered.
- The production MCP gateway is active at version 15.
- GitHub Pages serves commit `d0c0179fce986c9cb28c80b477161c0d5612cc6c`.
- All five published website files match the release build by SHA-256.

The website is available at [Swarm](https://dbc00per1812.github.io/swarm/). The
original MCP address and agent configuration remain usable.

## Live verification

Two disposable confirmed accounts used the published website in Chromium. The
checks used the actual hosted API, database, MCP endpoint, and DeepWiki
upstream. API responses were not mocked.

The following checks passed:

- Invitation fragments survive page reload and sign-in.
- Preview does not add membership. Explicit acceptance adds membership.
- A member's personal agent key discovers and executes a selected shared tool.
- Another enabled but unshared tool remains unavailable to that member.
- Recipients cannot list or manage the connection owner's private connection.
- Foreign updates, deletion, authorization, and discovery return HTTP 404.
- Withdrawal stops subsequent shared MCP discovery and execution.
- Member removal stops subsequent shared MCP access.
- A connection owner's departure removes their shares and stops access.
- An organization owner cannot leave before deleting the organization.
- Revoked invitations cannot create membership.
- Agent key revocation stops subsequent MCP access.
- Both organizations can be deleted through the website.
- Desktop and mobile layouts fit at 1280, 390, and 320 pixels.

An initial browser check selected an old invitation control before refresh
completed. Waiting for the creation status resolved the check. No application
change was needed.

All 115 database assertions pass against the installed migrations in rollback
transactions. The total includes 41 team, 24 shared access, 26 storage, 12
import, and 12 OAuth assertions.

The merged source matches the reviewed implementation. Its pre-merge checks
passed 67 gateway tests and 32 page tests. Type checks, lint, formatting,
browser builds, dependency audit, and whitespace checks passed. Independent
source, JavaScript, accessibility, security, and earlier database reviews are
recorded in the increment reports. No application source changed during release.

## Cleanup and original services

Both disposable accounts were removed. Their connections, organizations,
memberships, invitations, shares, and agent keys were removed. The browser
contexts and temporary private verification files were removed.

The final database state contains four personal connections, two active agent
keys, and no pending authorizations. Team tables are installed. They contain no
organizations, memberships, invitations, or grants. Identifier-only audit events
remain under the documented audit retention policy. Both active keys belong to
the existing personal account. No test-account key remains.

The original saved agent configuration reads GitHub, Slack, Linear, and Gmail
after cleanup. The existing Muse connection and Claude configuration remain
unchanged. No database reset, purchase, or upgrade occurred.

## Remaining limits

The earlier credential-output incident remains open because rotation is
unverified. Release authorization does not close that incident.

The live checks used confirmed email accounts. They did not repeat GitHub social
sign-in or provider installation in another workspace. Gmail remains a testing
application for approved users. Custom MCP hosts remain restricted.

Database assertions do not exercise simultaneous sessions. Lock order retains
its previous source review. Local accessibility scans reported zero WCAG A/AA
violations in the tested states. Screen reader testing remains unperformed.
These checks do not establish complete accessibility compliance.
