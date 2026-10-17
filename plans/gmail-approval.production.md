# Gmail approval deployment

Released: 2026-10-16, America/Chicago. The existing Google Testing audience remains
in effect. This deployment does not establish public Gmail verification.

## Deployed components

| Component | Released value |
| --- | --- |
| Gateway | Supabase function `mcp`, version 16, `ACTIVE` |
| Gateway source | Existing reviewed implementation, including `gmail-approvals.ts` and `teams.ts` |
| Website source | `4b67b4dae95a75d025c5719a2bf1eb4351f6707c` |
| Pages commit | `59c42a752a78194fbfd11690f68b8d1000a75e85` |
| Migration source | `supabase/migrations/20261016020000_gmail_approvals.sql` |
| Installed migration | `20261016234731`, name `gmail_approvals` |
| Migration SHA-256 | `a626e2d0049c58231cc040d0bdfdbf610c432fc152deb4a17d47b10f3cf54c11` |
| Privacy policy | Effective 16 October 2026; published and linked in Google Branding |
| Google audience | External, Testing; public access remains pending |

The live [Swarm website](https://dbc00per1812.github.io/swarm/) includes the
approval interface and Gmail disclosure. The
[privacy policy](https://dbc00per1812.github.io/swarm/privacy.html) describes
approval storage, one-use attempts, expiry, and deletion limits.

The homepage script URL includes `?v=gmail-approval-20261016`. This change forces
a fresh browser cache entry for the approval bundle. A production browser check
confirmed the review panel after deployment.

The deployment preserved the existing callback files and Google verification
asset. The verification asset remains 53 bytes with SHA-256:
`ccf1d7244c93cffcbabcb43e6c218c1761f5a0c317f378d8b60633eb5b67d71b`.

Only the new additive migration was applied. No previous migration was reapplied.
Existing connection credentials, agent keys, and encryption settings were preserved.

## Verification

- All 38 browser module tests passed. Both website bundles built.
- All 69 Deno gateway and service tests passed. TypeScript checking passed.
- The isolated database suite and database target guard passed.
- Native PostgreSQL 18.4 contention checks passed with independent sessions.
- Those checks covered one-use consumption, connection removal, cleanup, and the pending-request cap.
- The installed table enables row security. Anonymous reads and browser-role RPC execution are denied.
- All 11 application source files extracted from the deployed bundle matched the repository.
- All nine public website files returned HTTP 200 and matched the release hashes.
- The Pages build completed without an error.
- Existing GitHub, Slack, and Linear read checks passed. Returned payloads were discarded.
- An existing Gmail agent key received an approval URL before search execution.
- The agent key could neither read nor approve the website approval endpoint.
- An exact retry before approval was blocked.

Hosted synthetic checks used disposable accounts and an invalid credential fixture.
They did not authorize Google access or read mailbox data. These checks passed:

- A foreign account could neither read nor deny another account's request.
- Approval without permitted-use confirmation was rejected.
- Denial cleared encrypted query data and blocked execution.
- A changed query could not consume the approved permission.
- One approved attempt consumed permission before the expected credential failure.
- Reuse and expired approval attempts were blocked.
- A revoked key invalidated pending approval.
- Removing the synthetic connection deleted its approval records.

The disposable accounts were removed. Existing production records remained at
five connections, two active agent keys, and four retained legacy credential rows.
No unexplained existing records were removed.

## Real Gmail check

The check uses a unique synthetic subject query, a one-day window, and a limit
of one result. The local harness discards returned headers and reports only the
result count. No message is sent or modified.

The live check passed at 19:03 Chicago time. After the user authorized browser
operation, the assistant selected the checkbox and approval button on the user's
behalf.
Swarm displayed an approved status. The exact search then returned an empty
result list from Gmail. The harness reported zero matches and discarded the
payload. A second attempt with the same approval was blocked.

A database check confirmed approval, consumption, and cleared query ciphertext.
The initial request had expired without a recorded decision. The fresh request
completed successfully. No application change was required for this check.

This result verifies the deployed approval and real Gmail message-list path.
With zero matches, it does not exercise message-header retrieval. The complete
OAuth demonstration with synthetic messages remains required for submission.

The source branch is published in [draft pull request 7](https://github.com/dbc00per1812/swarm/pull/7).
No merge to `main` is claimed.

## Demonstration-account follow-up, 17 October 2026

The user supplied a second test account and approved its Gmail read-only grant.
The assistant completed Google's consent screen. The existing unconnected Gmail
card became connected to that account. No requested scope changed.

Initial searches returned zero matches. Gmail's own search also found no matching
subject, including Spam and Trash. After separate explicit approval, the assistant
sent one synthetic email from that account to itself. Gmail displayed Message sent.

A new approved search returned one message with the exact subject
`Swarm verification demo`. It used the demonstration recipient, a seven-day window,
and a maximum of one result. The local check discarded returned headers.
It requested no bodies or attachments. Approval reuse was blocked.
Database checks confirmed approval, consumption, and cleared encrypted query data.

The demonstration tool was then disabled. A subsequent request for that connection
was rejected before approval creation. The account remains connected, and the
original Gmail account keeps its enabled tool. This preserves ordinary account selection.

Google and GitHub now verify `useswarm.app` through DNS. The approved domain
registration cost $8.75 USD for one year, with auto-renew disabled. The website
uses HTTPS, and Google Branding stores its new homepage and privacy URLs.
See the current [verification record](../docs/integrations/gmail-verification-progress.md).

This follow-up verifies fresh OAuth completion and message-header retrieval.
A completed Google demonstration video remains outstanding. No assessment or
Google public audience change occurred.

## Remaining public release conditions

- Keep future Google development separate from production and record only synthetic demonstration content.
- Record the real OAuth consent, approved search, returned headers, and access withdrawal.
- Establish supported agent recipient practices for training, retention, and human access.
- Resolve the earlier credential incident through a coordinated owner rotation process.
- Establish historical-copy handling and retain deletion evidence through the documented support procedure.
- Confirm Google's acceptance of the hosted-domain ownership evidence.
- Complete restricted-scope verification and the required security assessment.
- Confirm the public access change at action time and test a new public account.

Generic agent keys do not identify an agent provider. The permitted-use checkbox
does not certify the recipient's practices. The published policy discloses that
limit and the remaining historical-retention uncertainty.

No assessment was purchased. The initial 16 October approval release made no
contract, domain purchase, or billing change. The approved domain purchase and
new branding links are recorded in the later follow-up above. Google audience
access remains Testing. No Google verification acceptance is claimed.

If a gateway correction becomes necessary, retain the additive migration. Keep
Gmail blocked until a reviewed replacement works. Do not restore an approval
bypass. Existing service tools retain their current routes.
