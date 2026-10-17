# Gmail Google submission candidate

Prepared: 2026-10-15, America/Chicago. Status: not submitted. This file contains
reviewable field values and evidence requirements. It does not authorize
publication, a purchase, or an assessment contract.

Update, 2026-10-16: approval controls and `web/privacy.html` are deployed.
Gateway version 16 is active. The privacy URL remains saved in Google Branding.
See `../../plans/gmail-approval.production.md` for the deployment and check record.
Gmail audience access remains External and Testing. This package is not submitted.

Update, 2026-10-17: `useswarm.app` is registered, DNS-verified, and serving the
website over HTTPS. Google Branding stores the new homepage and privacy URLs.

See [the current verification record](gmail-verification-progress.md) for the
saved public name, DNS requirement, demonstration sequence, and assessment timing.

## Console fields

| Field                | Exact value or current condition                                           |
| -------------------- | -------------------------------------------------------------------------- |
| Project              | `swarm-mcp`, number `441732284617`                                         |
| Current app name     | `Swarm`                                               |
| Name save verified   | Swarm name persisted after console reload on 16 October 2026       |
| Public operator      | Darragh Buckley 1812                                                       |
| User support email   | `darragh.buckley1812@gmail.com`                                            |
| Homepage             | `https://useswarm.app/`                                                    |
| Homepage state       | Saved and visible in a fresh authenticated console tab                     |
| Privacy policy URL   | Saved: `https://useswarm.app/privacy.html`                                 |
| Privacy policy state | Published, HTTP 200; saved Google field verified after reload              |
| Terms URL            | Leave empty unless separately approved; terms are optional                 |
| Authorized domains   | Saved: `useswarm.app`, `xatpcwatmcpjznhwgpit.supabase.co`                    |
| Callback             | `https://xatpcwatmcpjznhwgpit.supabase.co/functions/v1/mcp/callback/gmail` |
| Scope                | `https://www.googleapis.com/auth/gmail.readonly`                           |
| Data Access state    | This sole scope was saved in the earlier session                           |
| Audience             | External, Testing; two listed test accounts                               |
| Publish control      | Enabled after the privacy URL save; audience remains Testing               |
| Verification Center  | No submission offered while the present Testing state remains              |
| Developer contacts   | Existing monitored contacts; no change in this continuation                |
| Demonstration URL    | Pending real final-flow capture; no URL is invented                        |

Search Console verified the `useswarm.app` Domain property through DNS on
17 October 2026. GitHub also verified ownership. These checks do not establish
OAuth application acceptance. Hosted callback-domain evidence remains unresolved.
See the current verification record.

## Scope justification to enter

Swarm provides a user-directed Gmail search tool for agents. The tool sends the
approved search through `users.messages.list` with the `q` parameter. It
requests at most ten matching messages. It then requests metadata containing
message IDs, thread IDs, and the Subject, From, and Date headers. It does not
request message bodies or attachments. The `gmail.metadata` scope cannot use
`q`, so it cannot support this search. The read-only scope supports the feature
without permission to modify mail.

Swarm also reads the connected account's Gmail address through
`users.getProfile`. It stores that address as the account label. Access and
refresh tokens remain encrypted on the Swarm server. Tool recipients do not
receive these credentials.

The deployed gateway requires a separate website confirmation for each search.
That confirmation binds the exact mailbox, query, limit, and requesting agent
key. It permits one attempt within ten minutes. Hosted synthetic checks passed.
The real OAuth demonstration remains required for submission.

References:
[message-list API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
and
[Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

## Application use case

Candidate category: an application that enhances email productivity. The
specific feature is user-directed mailbox search through an enabled agent tool.
This category is a submission proposal. Google determines whether the actual
product meets an approved use case. Swarm does not offer mailbox export, message
sending, or mailbox modification through this tool.

## Privacy and Limited Use material

The published policy is `web/privacy.html`. It identifies active and
legacy storage, browser state, agent transfers, team access, approval records,
and known deletion limits. The confirmed public operator name is Darragh Buckley
1812. The support and privacy address is approved.

The policy records selected Limited Use rules and operator duties. Approval
behavior and active-record deletion checks passed. Recipient controls and
historical-copy handling remain unresolved public release conditions. Encryption
alone does not establish compliance. Connection removal does not revoke Google's
grant or prove deletion of every copy.

## Demonstration record

Use synthetic messages in a separate test mailbox. Use a test Google project
separate from the final production project. Existing personal connections must
remain usable. No Google account or project was created during this
continuation.

The local browser check demonstrated website sign-in, the exact search review,
unchecked approval refusal, affirmative approval, denial, and reconnect
disclosure. It also checked Cancel, Escape, focus restoration, and 320-pixel
layout. This evidence uses a disposable backend. It is not a Google submission
video.

The final demonstration must show the actual released application, English
Google consent, the exact scope, and matching branding. It must also show one
approved synthetic search, its returned headers, and access withdrawal. Keep
credentials and private mailbox content out of the recording.

Google requires an end-to-end demonstration. See its
[verification requirements](https://support.google.com/cloud/answer/13464321?hl=en).

## Review and deployment order

Deployment steps 3–8 are complete for the existing Testing audience. The real
approved Gmail search returned zero matches, and approval reuse was blocked.
Steps 1–2 retain unresolved operating conditions. Steps 9–13 remain submission
and public release work. Do not reapply the installed migration.

1. Verify that operations support the selected policy commitments.
2. Resolve recipient controls, retention procedures, and the open credential
   incident.
3. Approve the reviewed source and deployment target.
4. Apply only `20261016020000_gmail_approvals.sql` to the existing production
   schema.
5. Deploy the complete gateway file set, including `teams.ts` and
   `gmail-approvals.ts`.
6. Publish the matching website and approved privacy policy.
7. Preserve the exact Google verification asset during the website deployment.
8. Verify existing service reads and a synthetic Gmail approval flow.
9. Confirm final Google branding, policy links, domains, and scope.
10. Capture the real demonstration and prepare the verification submission.
11. Obtain action-time approval before expanding public sensitive-data access.
12. Complete Google's review and required security assessment.
13. Verify a new public account through the final production flow.

Steps involving policy commitments, publication, or access changes retain their
existing release gates. The listed order does not supply missing authorization.
Never reapply installed migrations or reset production for these checks.

The verification asset is `web/googledfccf295f08c8741.html`. Its SHA-256 must
remain `ccf1d7244c93cffcbabcb43e6c218c1761f5a0c317f378d8b60633eb5b67d71b`.

After deployment, a Gmail request without approval must return a review URL. It
must make no Gmail search or token-refresh request. A matching approved request
must execute once. A changed request, used approval, revoked key, or withdrawn
share must fail. Test those states with synthetic data.

If the gateway fails after migration, retain the additive table. Keep Gmail
blocked until a reviewed replacement works. Do not restore an approval bypass as
a rollback. Other service tools retain their existing routes.

## External conditions

The public server processes restricted Gmail data. Google's restricted-scope
review and security assessment remain external release conditions. This work
authorizes no assessor purchase, paid assessment, or contract. See Google's
[restricted-scope guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

Public Gmail access remains unverified until the last production check passes.
