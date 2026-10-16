# Gmail public access preparation

Date: 2026-10-15, America/Chicago. Status: local implementation and submission
material are prepared for review. Public Gmail access remains blocked.

## Google configuration

The correct project is `swarm-mcp`, number `441732284617`. Its client ID prefix
matches the configured Gmail client. The sole Data Access scope is the saved
`gmail.readonly` permission. Audience remains External and Testing. The console
shows one test user and no other users.

A fresh authenticated console tab confirms the saved homepage
`https://dbc00per1812.github.io/swarm/`. Authorized domains include
`dbc00per1812.github.io` and `xatpcwatmcpjznhwgpit.supabase.co`. Privacy and
terms links are empty. The app name remains `Swarm MCP personal preview`.

Publish app is disabled. The console requires completed branding configuration.
Verification Center offers no submission in the current Testing state. This
continuation changed no Google settings or audience access.

Search Console previously displayed Ownership verified for the GitHub Pages URL
prefix. The exact 53-byte verification asset remains public and unchanged. This
result does not establish OAuth acceptance of either hosted domain.

The verification file is `web/googledfccf295f08c8741.html`. Its SHA-256 is
`ccf1d7244c93cffcbabcb43e6c218c1761f5a0c317f378d8b60633eb5b67d71b`. Both local
and public copies still match this hash and each other. The earlier Pages
deployment used `gh-pages` commit `2777c372eac7d315465e0680808efe9b90626e2d`.
Every future website deployment must preserve these bytes.

## Local implementation

Implementation commit: `8464df2`. The branch retains the four earlier
preparation commits.

The homepage now describes Swarm before sign-in. A separate Gmail disclosure
dialog precedes Google authorization. Cancel and Escape stop the flow and
restore focus. The technical data-use page describes the local release
candidate.

Each Gmail search now requires approval on the signed-in Swarm website. The
review shows the mailbox, query, result limit, and requesting key fingerprint. A
fingerprint identifies the key without disclosing it. The user must confirm
permitted agent data use before approval. Denial requires no checkbox.

Approval binds the requesting user, connection revision, query, limit, and agent
key. It permits one attempt within ten minutes. The database consumes it
atomically. An agent key cannot approve a request. The gateway contacts no Gmail
search or token-refresh endpoint before approval.

Disabled tools, revoked keys, changed connections, expired or used approvals,
and withdrawn team access fail closed. Current permissions are checked again
before each Gmail message request. Existing keys retain their identities. After
deployment, their Gmail searches will require this additional approval.

Pending query data uses the existing AES-GCM protection with a separate approval
context. Use or denial clears its ciphertext. During later approval activity,
cleanup clears expired records that are available. Locked records can require
later activity. Inactivity can leave expired ciphertext in storage. Approval
identifiers, hashes, and decision times have no automatic expiry. Connection
removal deletes its approval records.

The additive migration is `20261016020000_gmail_approvals.sql`. It enables row
security and restricts access to the server role. It includes indexes for
connection and key deletion. The migration remains absent from production.

## Policy and submission material

The policy candidate is `docs/integrations/gmail-privacy-draft.md`. It covers
account data, browser storage, native and custom tools, Gmail approval, sharing,
retention, deletion limits, and proposed Limited Use commitments. It is not
published or effective. The public operator identity remains unconfirmed. The
approved support and privacy contact is recorded in the candidate.

The concrete Google fields, scope justification, demonstration requirements, and
deployment order are in `docs/integrations/gmail-google-submission.md`. Service
terms remain optional. This preparation creates no legal agreement.

The integration audit is `docs/integrations/google-gmail-oauth.md`. Its research
notebook now contains eighteen official sources. Client research showed that
confirmation capabilities depend on client configuration. Swarm's new server
check therefore does not rely on a client claiming approval. Recipient data-use
controls still require evidence before public release.

## Verification

- Browser module suite: 38 passing tests; both bundles build.
- Deno gateway and service suites: 69 passing tests; TypeScript checking passes.
- Database suite: all migrations and behavioral SQL checks pass in isolated
  PostgreSQL.
- Test target guard: a database host override is rejected before connection.
- Native PostgreSQL 18.4: independent sessions verify one-use consumption,
  connection-removal contention, deferred cleanup, and the pending-request cap.
- The contention tests observe an actual lock wait before releasing the first
  transaction.
- A temporary cleanup-order mutation reproduced deadlock error `40P01`.
- The corrected migration rejects concurrent removal with `23503` and no
  deadlock.
- Browser walkthrough: synthetic sign-in, exact search review, unchecked
  approval refusal, affirmative approval, denial, and reconnect disclosure pass.
- Browser accessibility checks: Cancel, Escape, focus restoration, keyboard
  operation, and 320-pixel pending, approved, denied, and dialog layouts pass.
- Independent reviews corrected navigation, foreign-key indexes, lock ordering,
  test target validation, and the human-access policy exception.

The browser walkthrough used the actual built interface with a temporary
synthetic backend. It made no Google calls. It does not prove production OAuth,
final Gmail result retrieval, or Google policy acceptance. The native database
is a disposable local PostgreSQL instance. It does not change production.

## Production audit

Read-only checks found five connections, two active keys, two pending OAuth
states, and four retained legacy credential rows. Organizations, memberships,
and shares remain empty. This continuation made no production database writes.
It did not remove unexplained records or rotate working credentials.

The project remains `ACTIVE_HEALTHY` in `us-east-1`. The organization plan is
Free. Supabase's published plan lists one day for API/database logs and one hour
for Auth audit logs. These published limits do not prove deletion of every
operational copy or historical export.

Database statement logging is `ddl`; error-statement logging is `error`. Audit
parameter logging is off. No `pg_cron` extension is installed. These settings do
not describe every platform log.

The backup API lists no available backups. Point-in-time recovery is disabled,
and physical-backup metadata is empty. Historical backup retention remains
unestablished. The earlier credential-output incident remains open; rotation has
not been verified.

## Remaining release conditions

- Confirm the public operator identity and Limited Use operating commitments.
- Establish supported recipient practices and historical-data deletion
  procedures.
- Resolve the open credential incident without losing existing service access.
- Approve and publish the reviewed implementation and final privacy policy.
- Confirm Google's acceptance of hosted-domain ownership evidence.
- Configure separate test and production environments for final verification.
- Capture the real OAuth and Gmail demonstration with synthetic mail.
- Complete Google's restricted-scope review and required security assessment.
- Verify a new public Google account through the final production flow.

No purchase, paid assessment, or assessor contract is authorized. The source
branch remains local. No merge, website publication, gateway deployment,
verification submission, or public-access expansion occurred in this
continuation.
