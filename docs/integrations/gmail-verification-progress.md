# Swarm Google verification progress

Checked: 16 October 2026, America/Chicago. Status: prepared; not submitted.
The deployed Gmail approval check passed. Google audience access remains Testing.

## Console work completed

The Google project is `swarm-mcp`, number `441732284617`. The public app name is
now `Swarm`. The name persisted after a fresh console reload. The existing
OAuth client's internal label still says `Swarm MCP personal preview`.
That internal label does not determine the public consent-screen name.

The signed-in support account has the project Owner role. This matches the
account used for the Swarm Search Console property. A scoped mailbox search
found the Search Console welcome message. It found no matching OAuth review or
assessment invitation. This search does not prove that no other notice exists.

The following saved values were inspected:

| Setting | Verified value |
| --- | --- |
| Public app name | `Swarm` |
| Support and developer contact | `darragh.buckley1812@gmail.com` |
| Homepage | `https://dbc00per1812.github.io/swarm/` |
| Privacy policy | `https://dbc00per1812.github.io/swarm/privacy.html` |
| Terms | Empty; no service agreement was created |
| Declared scope | `https://www.googleapis.com/auth/gmail.readonly` only |
| OAuth client | One existing Web application client |
| Callback | `https://xatpcwatmcpjznhwgpit.supabase.co/functions/v1/mcp/callback/gmail` |
| Audience | External, Testing |
| Verification Center | No submission form while the app remains in Testing |

The homepage, privacy policy, Gmail notice, and Google verification file returned
HTTP 200. Each response matched the published release hash. Credentials, callback
settings, grants, and billing settings were not changed.

## Domain ownership requirement

Search Console contains the Swarm GitHub Pages URL-prefix property. The existing
HTML verification asset remains valid evidence of control over that URL.
No Swarm DNS domain property was found in the inspected property list.

Google's current domain-verification guide specifies a DNS Domain property.
It states that a URL-prefix property is insufficient for that method. Therefore,
the earlier HTML verification does not complete the stated OAuth domain requirement.
This is a documentation requirement, not a received rejection of this application.
See [Google's domain guide](https://support.google.com/cloud/answer/13804266?hl=en).

The next required input is a personal domain that Swarm may use. Its DNS owner
must permit the verification record and website configuration. The current hosted
GitHub Pages address does not provide a user-managed DNS zone. A separate
existing project domain must not be reused without its owner's authorization.

No domain purchase is planned or authorized. If a suitable domain already exists,
use its authorized DNS account. Otherwise, present the domain and price before
any purchase. Resolve Google's callback-domain requirement before moving the
working callback. Do not assume that a paid custom callback domain is necessary.

## Submission materials ready

The exact scope justification and use-case description remain in
[gmail-google-submission.md](gmail-google-submission.md). The current scope supports
Gmail's search query parameter. The narrower metadata scope does not support that
parameter. See the [message-list reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list).

The public policy and Gmail disclosure describe agent transfers, approval,
credential storage, and removal limits. The live search check returned zero
matches. Approval reuse was blocked, and its encrypted query was cleared.
See the [deployment record](../../plans/gmail-approval.production.md).

The following demonstration sequence is prepared for recording with final branding
and domain settings. No demonstration video has been produced or submitted.
Google requires the real authorization flow and the requested feature in its
[video guidance](https://support.google.com/cloud/answer/13804565?hl=en).

| Part | Screen action | Suggested narration |
| --- | --- | --- |
| Introduction | Show the public homepage and privacy link. | Swarm connects selected account tools to agents. Each Gmail search needs separate approval. |
| Disclosure | Select Add Gmail account. Select Connect to show the data-use dialog. | Swarm searches Gmail and returns selected message headers to the requesting agent. |
| Authorization | Show Google's consent screen in English with the final name, client ID, and read-only permission. | This permission supports Gmail search. Swarm does not request permission to change mail. |
| Connection | Show the completed Gmail connection. | Swarm stores encrypted credentials on its server. The agent does not receive these credentials. |
| Request | Request one uniquely identified synthetic message through an enabled agent tool. | The agent receives a review link before Swarm searches Gmail. |
| Approval | Show the mailbox, exact query, result limit, and key fingerprint. Approve the request. | This approval permits one attempt for this exact search. |
| Results | Retry the exact request and show only the synthetic result. | Swarm returns message identifiers and the Subject, From, and Date headers. |
| Withdrawal | Disable the demonstration tool and show a rejected request. Demonstrate grant removal with a disposable connection. | The user can stop tool access and remove Google's authorization. |

Use a mailbox containing only synthetic demonstration content. Keep unrelated
accounts and private mail outside the recording. Exclude passwords, tokens,
OAuth callback codes, and browser proof values. Do not send demonstration email
without explicit authorization. Do not revoke an existing operational grant for
recording purposes. No test email or new Google account was created here.

## Security evidence prepared

This table identifies existing evidence. It is not a CASA certification or a
completed assessor questionnaire.

| Area | Existing evidence | Remaining limit |
| --- | --- | --- |
| Credentials | Encrypted storage and bound OAuth completion checks | Earlier credential incident and rotation remain unresolved |
| Account isolation | Gateway ownership checks and hosted foreign-account rejection | Assessor review remains external |
| Approval | Exact-request binding, one-use consumption, denial, expiry, and revoked-key checks | Generic keys do not identify the recipient provider |
| Database | Row security, restricted RPC access, and independent-session contention tests | No complete infrastructure certification is claimed |
| Removal | Hosted synthetic connection cascade and isolated account-deletion checks | Historical copies and recipient copies require separate handling |
| Disclosure | Published homepage, policy, Gmail notice, and approval page | DNS domain verification and real consent video remain incomplete |
| Operation | Published contact and documented privacy procedure | Human-access and recipient practices require supporting evidence |

Google assigns the assessment assurance level. Its current security-assessment
page places assessment after other verification requirements. Google contacts the
project when that step is due. No assessor was contacted or paid. No price or
free-assessment eligibility is claimed. See
[Google's assessment guidance](https://support.google.com/cloud/answer/13465431?hl=en).
The older CASA self-scanning procedure is deprecated. Local scan results do not
replace an assessor's validation. See the
[CASA process notice](https://appdefensealliance.dev/casa/tier-2/tier2-overview).

## Remaining actions

1. Obtain the personal domain and authorized DNS access for Swarm.
2. Configure and verify the final website domain and resolve callback-domain evidence.
3. Separate any Google development deployment from the public production deployment.
4. Record the actual OAuth and synthetic-message demonstration with the final settings.
5. Resolve the open credential incident and substantiate the selected operating commitments.
6. Confirm the audience change at action time before selecting Publish app.
7. Complete Google's available brand and scope submission forms with the prepared evidence.
8. Follow Google's assessment instructions and obtain a price before paid work.
9. Verify a new public account after Google accepts the release.

Google requires the audience status change before verification submission. This
change enables non-test accounts to request authorization, subject to Google's
unverified-app restrictions. It does not itself establish verification. The
browser confirmation policy requires action-time confirmation for this expansion
of access. No audience expansion occurred in this continuation. See
[Google's submission sequence](https://support.google.com/cloud/answer/13461325?hl=en).
