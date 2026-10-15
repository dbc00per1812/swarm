# Connections beta release review

## Result

The technical release review is complete. Code, JavaScript, database, and
security reviews found no remaining material source blocker after the OAuth
correction. The named release approval remains separate. Pull request 4 remains
a draft and must not merge without that approval.

The review started from `cb0ed29a6919a135c7a6a09842cdf84f75c4fa80`. The gateway
and website reports describe earlier verification. This report records the final
correction and current verification.

## OAuth account-linking correction

A public provider callback could previously exchange and save credentials
without the initiating browser session. A forwarded authorization link could
therefore connect another person's provider account to the initiator's account.
A failing regression test reproduced this behavior before the correction.

The public callback now redirects to the website without exchanging credentials.
The website removes callback parameters from its address immediately. Completion
requires an authenticated request, the initiating user, and an independent
browser proof. The browser stores that proof before provider navigation.

The database consumes state atomically only when the user, provider, proof,
expiry, and connection revision match. Invalid attempts preserve pending state.
Replay, expired state, and stale connection revisions fail. Credentials remain
bound to their existing user and connection identifiers.

The popup uses its own captured window reference for each authorization attempt.
Blocked browser storage fails closed. A blocked popup uses full-page navigation
with the same browser proof requirement.

## Verification

- All 40 gateway tests and 13 page tests pass.
- Deno type checks, lint, formatting, and Git whitespace checks pass.
- Both browser bundles build successfully with the pinned dependencies.
- Twelve new hosted database assertions pass in a rolled-back transaction.
- Earlier hosted checks passed 26 storage assertions and 12 import assertions.
- Hosted API checks reject a foreign user, a wrong proof, and an absent proof.
- A real GitHub popup completes authorization through the authenticated route.
- A disposable agent key reads through the newly authorized connection.
- The supported Refresh accounts control updates the parent page after
  completion.
- Both disposable users and their private fixture file were removed.
- All four original personal service reads pass after cleanup.
- Production retains four connections, one active key, and no pending
  authorizations.

The additive migration `20261015210000_bound_oauth_completion.sql` is installed
and registered. The production gateway is active at version 14. GitHub Pages
serves deployment commit `5fe41b88ee9607b3186f6208304a2d83c9ed63d8`.

## Remaining release limits

- Gmail permits approved test users only. Test authorization can expire.
- Slack and Linear installation in another workspace remains untested.
- Custom MCP hosts remain restricted to `mcp.deepwiki.com`.
- The runtime checks DNS but cannot pin those results to the TLS request.
- Rate counters apply within each gateway instance.
- Agent keys have account-wide scope and no automatic expiry.
- Key identifiers remain browser-local; retain identifiers for cross-browser
  revocation.
- All content on the website origin must remain trusted because sessions use
  browser storage.
- The parent page can require Refresh accounts after provider authorization.

The earlier private credential-output incident remains open. Credential rotation
has not been verified. Technical review completion does not close that incident.
The named release approver must consider this operational item before approval.
No private credentials or account identities are included in this report.
