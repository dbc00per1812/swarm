# Swarm Google verification progress

Checked: 17 October 2026, America/Chicago. Status: prepared; not submitted.
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
| Homepage | `https://useswarm.app/` |
| Privacy policy | `https://useswarm.app/privacy.html` |
| Authorized domains | `useswarm.app`, `xatpcwatmcpjznhwgpit.supabase.co` |
| Terms | Empty; no service agreement was created |
| Declared scope | `https://www.googleapis.com/auth/gmail.readonly` only |
| OAuth client | One existing Web application client |
| Callback | `https://xatpcwatmcpjznhwgpit.supabase.co/functions/v1/mcp/callback/gmail` |
| Audience | External, Testing |
| Verification Center | No submission form while the app remains in Testing |

The homepage, privacy policy, Gmail notice, and Google verification file returned
HTTP 200 at the new domain. Each response matched the published release hash.
The Google client credentials, OAuth callback, and existing grants were not changed.

## Domain ownership requirement

Search Console verified the `useswarm.app` Domain property through a DNS TXT
record on 17 October 2026. The signed-in account matches the project Owner.
The existing GitHub Pages URL-prefix property and HTML asset remain recorded.

Google's current domain-verification guide specifies a DNS Domain property.
The new property completes this website ownership step. It does not establish
Google's acceptance of the full OAuth application or the hosted callback domain.
See [Google's domain guide](https://support.google.com/cloud/answer/13804266?hl=en).

The user approved one year of `useswarm.app` through Porkbun for $8.75 USD.
The signed-in registrar already showed successful registration when work resumed.
Order history confirmed that amount. The domain expires on 17 October 2027.
Domain auto-renew was disabled and the off state was verified. No paid hosting
or other extras were added during this continuation.

GitHub also verified the domain through DNS. The root ALIAS and `www` CNAME
point to `dbc00per1812.github.io`. GitHub Pages enforces HTTPS. The old project
and privacy URLs redirect to the matching new URLs. All eight inspected public
assets matched the source hashes, including the unchanged HTML verification file.
Pages commit `fb136b0` adds only the generated `CNAME` file to the existing release.
The source copy is `web/CNAME`; preserve this file during later deployments.

Supabase Auth now uses `https://useswarm.app/` for its site URL and exact
redirect allowlist. `SWARM_UI_URL` uses the same URL. The gateway accepts the
new website origin and rejects an unrelated origin. Existing GitHub sign-in
completed on the new domain, and the saved connections loaded. The saved agent
still lists five tools and returns its connection status.

The new homepage, privacy URL, and authorized domain were saved in Google Branding.
Resolve Google's callback-domain requirement before moving the working callback.
Do not assume that a paid custom callback domain is necessary.

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
| Disclosure | Published homepage, policy, Gmail notice, approval page, and verified DNS domain | Real consent video remains incomplete |
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

1. Resolve the hosted callback-domain evidence for Google's review.
2. Separate any Google development deployment from the public production deployment.
3. Record the actual OAuth and synthetic-message demonstration with the final settings.
4. Resolve the open credential incident and substantiate the selected operating commitments.
5. Confirm the audience change at action time before selecting Publish app.
6. Complete Google's available brand and scope submission forms with the prepared evidence.
7. Follow Google's assessment instructions and obtain a price before paid work.
8. Verify a new public account after Google accepts the release.

Google requires the audience status change before verification submission. This
change enables non-test accounts to request authorization, subject to Google's
unverified-app restrictions. It does not itself establish verification. The
browser confirmation policy requires action-time confirmation for this expansion
of access. No audience expansion occurred in this continuation. See
[Google's submission sequence](https://support.google.com/cloud/answer/13461325?hl=en).
