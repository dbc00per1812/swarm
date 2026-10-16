# Swarm privacy technical check

Checked: 2026-10-16, America/Chicago. Scope: read-only production inspection,
deployed-source comparison, isolated deletion checks, and policy preparation. No
production data was deleted. No credentials were rotated or printed.

## Publication result

`web/privacy.html` describes the current preview, including its limits. It was
published on 2026-10-16 and its URL was saved in Google Branding. It does not
claim that the prepared Gmail search approval update is deployed. See
`gmail-privacy-publication.md` for the deployed commit and verification record.

`gmail-privacy-draft.md` remains the candidate for the later approval release.
Do not substitute it for the current-preview policy. Before deploying the
approval release, update the public policy to describe its approval records and
retention behavior.

The current-preview policy discloses retained historical records, unknown backup
history, agent-provider uncertainty, and separate provider revocation. These
limits do not need invented retention deadlines. Publication of this notice does
not establish Google verification or authorize public Gmail access.

## Verified production facts

The following table records the initial technical inspection before publication.
The later publication changed the privacy URL results and saved Google field.
The gateway, database, and audience remained unchanged.

| Check                                | Result                                         |
| ------------------------------------ | ---------------------------------------------- |
| Gateway                              | `mcp`, version 15, `ACTIVE`                    |
| Project                              | `ACTIVE_HEALTHY`, `us-east-1`                  |
| Organization plan                    | Free, confirmed through the Management API     |
| Gmail approval migration             | Absent; `swarm_gmail_approvals` does not exist |
| Active connection rows               | 5                                              |
| Active agent keys                    | 2                                              |
| Pending user OAuth rows              | 2; both expired                                |
| Legacy credentials                   | 4 ciphertext rows                              |
| Legacy OAuth rows                    | 0                                              |
| Legacy import markers                | 1                                              |
| Organizations, memberships, shares   | 0 each                                         |
| Team audit rows                      | 17; no automatic expiry                        |
| Database Auth audit rows             | 0 at inspection                                |
| Listed database backups              | 0                                              |
| Point-in-time recovery               | Disabled; physical-backup metadata empty       |
| Public privacy and Gmail notice URLs | Both returned HTTP 404                         |
| Google audience                      | External, Testing; 1 test user, 0 other users  |
| Google privacy policy field          | Empty in the saved Branding configuration      |
| Google account sign-in               | Disabled in Supabase Auth                      |
| GitHub account sign-in               | Enabled in Supabase Auth                       |

The SQL audit requested read-only execution and returned aggregate counts,
configuration, and constraint definitions. It did not select mailbox content,
credential values, account labels, user identities, or audit payloads.

## Deployed source and data flow

The Management API supplied the version 15 function body. Its SHA-256 is
`5a720851db8cbe2c5c31a72319290de1b46faeb9d39f3bcdabfd5b6beee8996e`. The bundle's
source maps contained ten application source files. Each matched the
corresponding file in commit `83556e3` exactly.

The deployed gateway checks the key owner and current connection permissions. It
sends enabled tool results to the requesting agent. It does not verify the agent
provider's identity, training settings, retention period, or human-access rules.
A key identifies authorized access, not a verified recipient provider.

The Gmail tool requests message metadata and returns IDs and selected headers.
It has no database write for search results or headers. The database schema has
no Swarm message-body, result, header, or query-content columns. This finding
does not describe provider logs, support messages, or agent-side storage.

The inspected application files contain no console logging calls. Dependency
code, runtime failures, hosting infrastructure, and database error logging
remain separate sources of logs. Do not infer that requests can never reach
logs.

## Retention findings

Supabase's published Free plan lists one day for API/database logs and one hour
for Auth audit logs. These are published plan limits, not proof that every copy
is erased. See [plan details](https://supabase.com/pricing).

Supabase distinguishes external Auth log storage from optional database storage
in `auth.audit_log_entries`. The database table was empty at inspection. This
does not establish a future retention limit. See
[Auth audit storage](https://supabase.com/docs/guides/auth/audit-logs).

Database settings were `log_statement=ddl`, `log_min_error_statement=error`,
`pgaudit.log=none`, and `pgaudit.log_parameter=off`. No `pg_cron` or `pg_net`
extension was installed. No automatic purge of historical credentials or team
audit rows was found.

The backup endpoint listed no available backups. Supabase's Free plan does not
include automatic backups. Historical exports and provider-internal copies
remain unestablished. See
[backup documentation](https://supabase.com/docs/guides/platform/backups).

GitHub documents security logging of Pages visitors' IP addresses. Swarm cannot
claim that a static website collects no technical data. See
[Pages data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection).

Operator credential files also exist outside the repository. They include
deployment credentials, provider application credentials, and an agent
configuration. Website connection removal does not remove these files. The audit
did not search unrelated personal folders or claim a complete export inventory.
Private file contents remain outside public project records.

## Isolated deletion verification

Synthetic checks ran in fresh PGlite PostgreSQL databases. One used the
installed migration set. The other also used the prepared approval migration. No
test connected to production.

Both checks confirmed these outcomes:

- Connection removal deletes active credentials, pending user OAuth states, and
  organization grants.
- Removing one connection preserves an unrelated account's connection.
- Legacy credentials, legacy account labels, legacy OAuth states, the import
  marker, and team audit records survive active connection removal.
- Account deletion removes remaining owned connections, pending user OAuth
  states, agent keys, owned organizations, memberships, and invitations.
- Account deletion preserves legacy records and team audit identifiers.
- In the prepared schema, connection removal also deletes Gmail approvals.

The synthetic Auth table does not model Supabase sessions, identities, MFA, or
Auth audit storage. Their production constraints were inspected separately. No
claim of complete authentication-data deletion follows from the fixture.

The initial fixture used an invalid short authorization verifier and failed its
database constraint. The corrected fixture used a valid synthetic verifier and
passed both schema versions. This was a fixture correction, not an application
change.

## Remaining limits

The operator deletion procedure is in `gmail-privacy-operations.md`. It records
how to handle historical copies and preserve the legacy import guard. No live
deletion request or credential rotation was performed.

Agent-provider compliance cannot be established for arbitrary key holders. A
public Gmail release still needs supported recipient controls, deployed search
approval, Google review, and the required security assessment. Google's rules
also apply during Testing. See the
[Workspace data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).

The earlier credential-output incident remains open. This inspection does not
resolve that incident or establish historical deletion. The policy makes no
security-certification, complete-erasure, or universal recipient-compliance
claim.

## Publication verification

The policy rendered in Chrome with the local stylesheet and the production
stylesheet from the publication package. Section links resolved. Keyboard
navigation reached the main content through the skip link. At 320 pixels, the
page had no horizontal overflow and the text remained readable.

The page contains no scripts or remote assets. Its content security policy
blocks scripts, network connections, objects, frames, and form submissions. The
public prose passed a sentence-length check. This check does not establish full
ASD-STE100 vocabulary compliance.

`npm test` built both browser bundles and passed all 38 module tests.
Independent source and document reviews found no unresolved issues after the
retained legacy authorization wording was corrected.

The publication package preserves all original Pages files. Its only changes are
the privacy page and the homepage privacy link. The Google verification file
matches its required hash. See `gmail-privacy-publication.md` for the final
publication procedure and its effective-date step.

The later public check returned HTTP 200 for all eight released website files.
Each response matched the deployment commit. Google confirmed the Branding save,
and the exact privacy URL remained present after reloading the page.
