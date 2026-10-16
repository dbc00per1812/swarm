# Swarm privacy operating procedure

Prepared: 2026-10-16, America/Chicago. The public operator is responsible for
this procedure. The selected rules apply to the proposed release. This document
does not claim a completed live deletion or security incident response.

## Handle a privacy request

1. Receive the request at `darragh.buckley1812@gmail.com`.
2. Ask the requester to use the address associated with the Swarm account.
3. Verify account control through the existing account and authenticated session
   before changes that affect access.
4. If control remains uncertain, stop the deletion and resolve the identity
   check.
5. Record the request date, scope, verified account identifier, and requested
   outcome in a private case record.
6. Do not request passwords, tokens, or mailbox content.

The public repository must not contain request messages, user identifiers,
credential values, or private case records. Support messages are separate
records in the support mailbox. Include them when the verified request covers
support correspondence.

## Inventory before deletion

1. Identify owned connections and active or revoked agent key hashes.
2. Record relevant organization, connection, invitation, and grant identifiers
   before their rows are removed.
3. Identify pending user OAuth records and any prepared-release Gmail approvals.
4. Check legacy credential ciphertext, account labels, and provider OAuth
   states.
5. Check the legacy import marker and the importer configuration.
6. Identify relevant team audit and authentication records without exporting
   their payloads.
7. Check known operator exports, local credential configurations, and listed
   backups.
8. Record any unknown copy location or retention period.

Do not make a new production data export as a routine deletion safeguard. Use
synthetic fixtures to test the procedure. Keep the private case record limited
to identifiers, decisions, counts, and evidence needed for the request.

## Remove access and active records

1. For a connection request, remove only the verified owner's selected
   connection.
2. Verify that its active credential row, pending user OAuth states, and grants
   are absent.
3. If Gmail approvals are installed, verify that the connection's approvals are
   absent.
4. If requested, revoke the affected agent keys and verify that they cannot
   authenticate.
5. Explain that provider authorization must also be revoked at the provider.
6. For account deletion, identify owned organizations and explain their removal
   before deleting the account.
7. Use the supported Supabase Auth administration path for account deletion.
8. Verify the relevant account, active connections, keys, memberships, owned
   organizations, and invitations after deletion.

The isolated checks establish the Swarm table cascades. They do not replace a
live post-deletion check. Supabase authentication tables and storage objects
need separate verification when applicable. Do not delete unrelated accounts or
existing operational connections during a test.

## Handle retained records

The legacy tables do not bind all records to a user identifier. Do not infer
ownership from a provider name alone. Verify the import history before changing
legacy ciphertext, account labels, or OAuth state.

Keep the legacy import marker until importer removal and legacy-secret handling
have been reviewed and deployed. Removing the marker can recreate a legacy agent
key, even when no legacy credential rows remain. It can also prevent startup
after deletion of the expected owner account.

The gateway role cannot delete team audit rows. Retain necessary security
evidence and record its reason in the private case. If deletion or anonymization
is required, use a separately reviewed privileged procedure. Do not bypass the
audit controls through the website or erase incident evidence.

Check historical credential copies and operator configurations separately.
Changing a provider application secret can affect other connections. Preserve
working access until a reviewed replacement and verification sequence exists. Do
not count a copied or revoked key as erased merely because it stopped working.

For known backups or exports, record the handling method and remaining retention
period. If restoration occurs, reapply recorded deletions before restoring user
access. An empty backup list does not prove that all historical copies are gone.

Results already received by an agent are outside Swarm's connection deletion
path. Explain that the requester must also contact the relevant agent provider.
Do not claim that Swarm erased recipient copies without evidence.

## Close the request

1. Report the records removed and the verification result.
2. Identify known retained records, their reason, and any established retention
   period.
3. Identify unresolved copies or provider actions without a fixed deletion
   promise.
4. Keep only the private case evidence needed for the request and security
   duties.

No fixed response or complete-deletion deadline has been established. Applicable
requirements and the actual request determine the required handling. Do not
replace a required response with an indefinite waiting state.

## Human access and security incidents

Restrict production administration to authorized operators. Do not inspect
Google message data for routine debugging or policy review. For permitted human
access, record its purpose, authority, data scope, and outcome privately.

Use documented specific-user consent, a permitted security purpose, a legal
requirement, or permitted aggregated and anonymized internal use. Staff,
contractors, agents, and successors must follow the same restrictions.

For an incident, identify affected credentials and access paths without printing
their values. Preserve necessary evidence. Prepare replacement credentials and
verify existing service access during rotation. Record each verified result. The
earlier credential-output incident remains open until this work is complete.

Follow Google's incident notification requirements when Google data is affected.
The audit does not establish that an external report was made. No external
message or credential change is authorized merely by this procedure. See the
[Workspace data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).

## Review after changes

Review the policy when storage, recipients, hosting plans, scopes, sharing, or
approval behavior changes. Check Google policy notices and verification dates.
No recurring automation was created for these duties.
