# Gmail public OAuth verification package

Research date: 2026-10-15, America/Chicago. Status: preparation only. Public
Gmail access is not enabled or verified.

Notebook: `f01-int/Google-Gmail/public-oauth`. The notebook contains eighteen
official sources. The original eleven additions succeeded. Seven client and
hosting references were added successfully during the continuation. Queries
returned citations. The API reference corrected an initial scope recommendation.

Source descriptions below include the local approval implementation. Production
still uses gateway version 15. The approval migration and interface are not
published.

## Current Google configuration

The authenticated Cloud console showed these settings at the initial inspection:

| Field                              | Observed value                                              |
| ---------------------------------- | ----------------------------------------------------------- |
| Project                            | `swarm-mcp`, display name `Swarm MCP`                       |
| Project number                     | `441732284617`, matching the private Gmail client ID prefix |
| Audience                           | External                                                    |
| Publishing status                  | Testing                                                     |
| Users                              | One approved test user; no other users                      |
| App name                           | `Swarm MCP personal preview`                                |
| Support and developer contacts     | Configured; private values omitted                          |
| Homepage, privacy, terms URLs      | Empty                                                       |
| Authorized domain                  | `xatpcwatmcpjznhwgpit.supabase.co`                          |
| Declared scopes before preparation | Empty                                                       |
| Verification Center                | Verification not required because the app is in Testing     |

The production code requests `https://www.googleapis.com/auth/gmail.readonly`.
That existing scope is now the only saved Data Access entry. The console
displayed “Data access changes saved!” after Save. This declaration does not
change requested permissions or approve the scope. The application remains in
Testing.

A fresh authenticated console tab now confirms the saved branding values. The
homepage is `https://dbc00per1812.github.io/swarm/`. Authorized domains include
`dbc00per1812.github.io` and `xatpcwatmcpjznhwgpit.supabase.co`. Privacy and
terms links remain empty. The app name remains `Swarm MCP personal preview`.

Audience still shows External and Testing, with one test user and no other
users. Publish app is disabled. The console requires completed branding
configuration. Verification Center offers no submission while this state
remains. This continuation changed no Google settings.

## Integration contract

This is data exchange through the Gmail REST API, with delegated OAuth
authorization. Each Swarm connection has separate user credentials. Requests are
synchronous and read only. Gmail failure returns a tool error. It does not
authorize access to another account. Google account sign-in and Gmail
authorization are separate features.

OAuth uses authorization code exchange, PKCE S256, one-use state, and a separate
browser proof. The callback is
`https://xatpcwatmcpjznhwgpit.supabase.co/functions/v1/mcp/callback/gmail`.
Completion requires the initiating Swarm session. Credentials remain on the
server. Refresh uses the Google token endpoint.

Testing grants and refresh tokens expire after seven days. See
[audience rules](https://support.google.com/cloud/answer/15549945?hl=en).

The current search feature requires the `q` parameter on `users.messages.list`.
Google does not permit `q` with `gmail.metadata`. Thus, `gmail.readonly` is the
narrowest listed read-only scope that supports this feature. See the
[message-list reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list).
Both scopes remain restricted. See the
[scope table](https://developers.google.com/workspace/gmail/api/auth/scopes).

Scope justification for the submission:

> Swarm lets users search their Gmail mailbox through an enabled agent tool. The
> tool sends the user's search query through Gmail's messages.list q parameter.
> It returns message IDs, thread IDs, and the Subject, From, and Date headers.
> It requests message metadata and does not fetch message bodies or attachments.
> Gmail's metadata scope does not support q queries. The read-only scope
> supports search without permission to modify mail.

## Actual data flow

```text
User → Swarm website → Google consent
                         │ authorization code
                         v
Swarm callback → initiating browser → authenticated completion
                                              │
                                              v
                                  encrypted credential database

Agent key → pending request → signed-in website review
                                     │ approve or deny
                                     v
Same key + exact request + approval ID → atomic one-use check
                                                  │
                                                  v
                         Swarm permission check → Google search
                                                  │
                                                  v
                               IDs and Subject/From/Date headers
                                                  │
                                                  v
                                   requesting agent or team agent
```

| Data                            | Handling in the current source                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Gmail access and refresh tokens | AES-GCM ciphertext in the user connection; user and connection IDs bind encryption                           |
| Gmail address                   | Unencrypted account label in the connection row; returned to its owner                                       |
| Search query                    | Encrypted in a pending approval; sent to Google only after approval in the message-list request URL          |
| Search result                   | Processed in server memory and returned to the requesting MCP client                                         |
| Message bodies and attachments  | Not requested by the current Gmail tool                                                                      |
| Connection metadata             | Name, owner ID, provider, settings, tool catalog, enabled tools, revision                                    |
| Team audit                      | Actor, organization, target IDs, action, and time; no automatic expiry                                       |
| Browser state                   | Supabase session, key IDs, invitation state, OAuth proof, and pending approval ID; no Gmail query or results |
| Approval records                | User, connection, key/request hashes, encrypted query/limit, revision, expiry, and decision times            |

Evidence: `services.ts`, `provider-oauth.ts`, `user-store.ts`,
`beta-gateway.ts`, `web/app.js`, and the installed migrations. These files are
under `supabase/functions/mcp/`, except where specified. The Gmail tool has no
database write for headers or results. This does not establish
infrastructure-log, backup, or recipient retention behavior.

Removal deletes the active connection and cascades to pending OAuth states,
Gmail approval records, and team shares. It does not revoke Google's grant. The
website now explains separate Google revocation. Legacy import retains earlier
credential ciphertext. It has a separate import marker. Do not delete legacy
credentials or existing keys during this preparation.

Do not promise complete erasure until the operator defines backup and legacy
handling.

The Management API reports database region `us-east-1` and project status
`ACTIVE_HEALTHY`. Log and backup retention remain unverified.

A follow-up backup query returned zero listed backups and `pitr_enabled: false`.
The physical-backup metadata object was empty. This snapshot does not establish
historical backup retention or infrastructure-log retention.

The read-only continuation found four retained legacy credential rows. Database
statement logging is `ddl`; error-statement logging is `error`. Audit parameter
logging is off. These fields do not describe all platform logs or retention.
Supabase documents that retention depends on the plan. See its
[log documentation](https://supabase.com/docs/guides/observability/logs). The
Management API confirms the project's organization plan is Free. Its
[published plan](https://supabase.com/pricing) lists one day for API/database
logs and one hour for Auth audit logs. These limits do not prove deletion of
every operational copy or historical export. No `pg_cron` extension is
installed. The approval table is absent in production.

The local approval function clears encrypted query data after use or denial.
Expired requests cannot execute. During approval activity, Swarm clears expired
query data that is available for cleanup. Locked records can require later
activity. Without activity, ciphertext can remain. Decision identifiers and
hashes have no automatic expiry. Connection removal deletes its approval
records. The policy candidate discloses these limits.

## Public release requirements

The public server processes restricted Gmail data. Encryption does not create an
assessment exception. Restricted-scope verification and an annual security
assessment apply to server access. See Google's
[restricted-scope guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).
Personal, testing, and internal exceptions do not establish eligibility for this
public service. See the
[exception rules](https://support.google.com/cloud/answer/13464323?hl=en).

Testing exceptions concern verification. Google's data-use and consent rules
also apply to test use.

No assessor purchase, contract, or paid assessment is authorized.

Google requires a useful homepage, a matching privacy-policy link, verified
domains, and an end-to-end demonstration. The policy must explain access, use,
storage, and sharing. See the
[verification requirements](https://support.google.com/cloud/answer/13464321?hl=en).
The technical notice in `web/gmail-data.html` does not satisfy the complete
privacy-policy requirement. The current GitHub Pages and Supabase addresses do
not establish verified domain ownership. UNKNOWN-BLOCKING: prove website and
callback-domain control through a method Google accepts for OAuth verification.

Do not move the working callback until the replacement is configured and tested.

Search Console offers URL-prefix verification for
`https://dbc00per1812.github.io/swarm/`. It issued the official file
`googledfccf295f08c8741.html` for that URL. The unchanged downloaded file is
published from `gh-pages` commit `2777c372eac7d315465e0680808efe9b90626e2d`. The
public file matches the download exactly. Search Console displayed “Ownership
verified” with the HTML file method. Its SHA-256 is recorded in
`plans/gmail-public-readiness.md`.

HTML file verification proved control of this URL without a custom domain. See
Google's
[site-verification methods](https://support.google.com/webmasters/answer/9008080?hl=en).
That result alone would not prove OAuth acceptance of the GitHub Pages or
Supabase domains. See Google's
[homepage requirements](https://support.google.com/cloud/answer/13807376?hl=en).
No domain purchase is needed to attempt this limited site-control check.

Google's current Workspace policy addresses MCP and agent behavior explicitly.
It requires prominent disclosure, affirmative consent, and granular confirmation
of agentic invocation. It also limits transfers and prohibits general model
training with Workspace data. See the
[Workspace data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).
Production version 15 has no Swarm confirmation for each call. The local source
now requires signed-in website approval before every Gmail search. Approval
binds the user, mailbox, connection revision, exact query, result limit, and
agent key. It permits one attempt within ten minutes. The database consumes
approval atomically. Disabled tools, changed connections, revoked keys, expired
requests, and withdrawn sharing deny access.

A separate disclosure dialog precedes Google authorization. Cancel and Escape
stop that flow. The website also explains Swarm publicly before sign-in.

The control does not depend on a client claiming that the user approved. Browser
tests, gateway tests, isolated PostgreSQL tests, and a synthetic browser walk
passed. These results do not prove Google's acceptance or final production
behavior. The implementation remains subject to review and release approval.
Recipient data-use controls remain a public release condition.

## Client confirmation investigation

| Surface              | Documented capability                                                                            | Evidence limit                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| OpenAI Responses MCP | `require_approval` can require approval; configuration can also bypass it                        | No existing Swarm client deployment was certified                     |
| Claude Code          | `_meta["anthropic/requiresUserInteraction"]: true` requires a human prompt in supported versions | Vendor-specific metadata does not establish behavior in other clients |
| MCP URL elicitation  | Optional client support can direct a user to a separate secure page                              | Support cannot be assumed for an arbitrary client                     |
| Local Swarm change   | Server requires website approval regardless of client approval settings                          | Synthetic verification passed; production deployment remains pending  |

Sources:
[OpenAI MCP documentation](https://developers.openai.com/api/docs/guides/tools-connectors-mcp),
[Claude Code MCP documentation](https://code.claude.com/docs/en/mcp), and
[MCP elicitation specification](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation).

This investigation avoids treating a client's generic read-only tool setting as
evidence of fresh human confirmation. No Claude configuration was changed.
Swarm's check solves the invocation-control gap in the local implementation. It
does not establish a recipient's retention, human-access, or training rules.

## Reviewable consent configuration

| Field               | Prepared value or required decision                                                     |
| ------------------- | --------------------------------------------------------------------------------------- |
| App name            | Keep `Swarm MCP personal preview` until an operator approves final branding             |
| Homepage            | Saved: `https://dbc00per1812.github.io/swarm/`; OAuth domain acceptance remains pending |
| Privacy URL         | `https://dbc00per1812.github.io/swarm/privacy.html`; proposed only, not published       |
| Terms URL           | Optional; leave empty unless separately approved                                        |
| Data Access         | Only `https://www.googleapis.com/auth/gmail.readonly`                                   |
| Support contact     | Approved: `darragh.buckley1812@gmail.com`                                               |
| Developer contacts  | Monitored project-owner contacts; keep private                                          |
| Scope justification | Prepared text above                                                                     |
| Demonstration URL   | Pending final branding, policy, consent behavior, and synthetic mailbox                 |

The privacy candidate records selected Limited Use operating rules. Wording
approval is complete; supporting procedures and recipient controls require
verification. Google requires an affirmative statement. See the
[user-data policy](https://developers.google.com/terms/api-services-user-data-policy).
Do not publish claims about advertising, training, human access, or retention
without confirming actual operations and recipient controls.

## Demonstration evidence to produce after the blockers are resolved

Use a separate Google testing project and a mailbox with synthetic messages.
Google requires separation of test and production projects. See
[OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies).
The current project is the existing test integration, not a disposable public
verification environment. No separate test project or mailbox was provisioned
during this preparation.

Capture these states with the final app name and consent language:

1. Show the public homepage, privacy link, and Gmail disclosure.
2. Show GitHub account sign-in and a new Gmail account card.
3. Show the Google consent screen in English with the requested scope.
4. Show a completed connection without exposing tokens or browser proof.
5. Show Swarm website approval and one exact-request retry from the agent.
6. Show returned IDs and headers, with synthetic addresses and subjects.
7. Show tool disabling, a rejected subsequent call, and Google grant revocation.
8. Show team consent and withdrawal if Gmail sharing remains in public scope.

Existing offline fixtures cover Gmail metadata responses and service failures in
`services_test.ts`. Bound OAuth completion and ownership fixtures remain in
`connections_beta_test.ts`. These fixtures do not prove public Google
authorization or policy acceptance.

## Reliability and operation

The tool bounds results to ten messages. Each upstream request has a ten-second
timeout and a response-size limit. The current tool reads one result page. It
does not promise exhaustive mailbox export.

The gateway limits requests per user. Upstream failures return safe errors
without raw response payloads. There is no Gmail-specific circuit breaker, retry
backoff, or Retry-After handling.

Gmail reads do not modify mail. Swarm approval is single use, including failed
attempts. A retry after consumption requires another approval. Webhooks and
provider write deduplication do not apply. The API path uses Gmail v1. No
separate deprecation-header monitor is configured. The callback uses HTTP 303.
Browser messaging uses exact origins.

The public operator is responsible for Google notices, policy changes,
incidents, and credential rotation. UNKNOWN-BLOCKING: verify the procedures for
these duties. Before public release, establish policy review and
verification-expiry procedures. No recurring automation was created. This task
did not authorize a schedule.

Monitor Gmail error rates, request latency, and quota usage separately without
recording queries or returned headers. Rotation remains an operator procedure;
the earlier credential-output incident remains open.

There is no substitute provider for access to a user's existing Gmail mailbox.
IMAP would change the contract and can require broader access. It does not
establish a verification exemption. Keeping Gmail in Testing is the current
zero-cost fallback. It does not meet public connection acceptance.

## Required operator facts

The confirmed public operator name is Darragh Buckley 1812. The approved support
and privacy address is `darragh.buckley1812@gmail.com`. The following facts
still require confirmation.

- Accepted ownership-verification method for the existing hosted addresses, or
  an owned domain if Google requires one.
- Infrastructure logs, backup retention, and complete deletion process.
- Permitted recipient data handling. Swarm confirmation no longer depends on
  choosing a particular client.
- Evidence that human access and recipient controls follow the selected Limited
  Use operating rules.
- Whether Gmail tool sharing with organizations remains part of the public
  product.

The policy candidate is in `gmail-privacy-draft.md`. Concrete submission fields
and deployment checks are in `gmail-google-submission.md`. Terms remain an
optional operator drafting decision. No public policy, OAuth verification
submission, domain purchase, assessment, or OAuth production-status change is
claimed.
