# Swarm privacy policy candidate

Review date: 2026-10-15, America/Chicago. Status: prepared for operator review.
This candidate is not published or effective. It describes the proposed release,
including the local Gmail approval changes. Production still uses gateway
version 15 without those changes.

## Publication conditions

The confirmed public operator name is Darragh Buckley 1812. The approved public
support and privacy address is `darragh.buckley1812@gmail.com`. These
confirmations do not establish a registered business or legal entity.

Confirm the operational commitments in the Limited Use section. Confirm hosting
log retention, historical backup handling, access procedures, and legacy-copy
deletion. A source audit cannot establish those operational facts. Review the
policy against the operator's actual legal obligations before publication.

The text below avoids claims of complete deletion, certified security,
third-party agent compliance, or a fixed support response time.

## Candidate policy text

### Operator and contact

Swarm is operated by Darragh Buckley 1812. Swarm connects selected account tools
to agents. For support, privacy questions, or deletion requests, contact
`darragh.buckley1812@gmail.com`. The final policy must include its effective
date.

### Account data and browser storage

Swarm uses Supabase for authentication. GitHub sign-in provides account
information to the authentication service. The service stores an account
identifier, email address, and authentication records. Existing email accounts
can also sign in.

Swarm stores connection names, account labels, account ownership, tool
permissions, and connection settings. Custom server connections also store a
server address, discovered tool descriptions, schemas, and selected tools. Swarm
encrypts saved service credentials.

Your browser stores the Swarm session and remembered agent key identifiers.
Session storage also holds pending invitations, temporary authorization proof,
and pending Gmail approval identifiers. It does not store Gmail search queries
or results. Raw agent keys appear when created. Swarm does not save raw agent
keys in browser storage.

### Gmail access and use

Google grants Swarm read access to Gmail messages and settings. The current tool
uses that access to search your mailbox. It sends the search query to Google. It
returns message IDs, thread IDs, and the Subject, From, and Date headers. It
does not request message bodies or attachments.

Swarm reads your Gmail address to identify the connected account. It stores that
address as an account label. Saved access and refresh tokens use AES-GCM
encryption. A refresh token lets Swarm obtain another access token after expiry.

Before authorization, Swarm displays a Gmail disclosure dialog. Google then
presents its authorization screen. You can cancel either step. Gmail connections
currently use Google's Testing status. Only approved Google test users can
connect. Test authorization can expire after seven days.

### Gmail search approval

Each Gmail search requires approval on the Swarm website. The review shows the
mailbox, search query, result limit, and requesting key fingerprint. A
fingerprint is a short identifier for the key. It does not identify the agent
provider.

Approval permits one attempt for that mailbox, query, result limit, and key. It
expires ten minutes after the request starts. A changed request needs another
approval. A failed attempt also needs another approval. You can deny a request
instead.

The approval request stores an encrypted query and result limit. The database
also stores account and connection identifiers, key and request hashes, and
request times. Approval and use add decision times. Agent keys cannot approve
these requests. Approval requires a signed-in Swarm website session.

### Other service tools

GitHub tools read pull request numbers, titles, links, and states from selected
public repositories. Slack search returns message text, times, links, and
channel names available to the connected account. Linear tools return issue
identifiers, titles, links, and states.

A custom MCP server receives selected tool arguments through Swarm. Swarm
returns the server's tool results to the requesting agent. Its data handling
depends on the server you connect. Native service tools described here do not
modify mail, messages, issues, or pull requests.

### Recipients and organization sharing

Swarm runs its gateway and database on Supabase. The inspected production
database region is `us-east-1`, in the United States. GitHub Pages hosts the
website. Google processes Gmail authorization and Gmail API requests. GitHub,
Slack, Linear, and selected custom servers process their respective connection
requests.

Swarm sends tool results to the requesting agent. Anyone holding your agent key
can request your enabled tools. If you share a tool, organization members'
agents can request it through their own keys. Gmail requests still require
website approval by the requesting Swarm account.

Sharing Gmail tool access permits mailbox searches. It does not restrict access
to individually selected messages. Recipients do not receive stored Google
credentials through Swarm's connection-management API. Agent providers can
retain results under their own settings and terms.

The approval page requires confirmation of permitted agent data use. This
confirmation does not independently verify the agent provider or its practices.
Public release requires supported recipient controls that meet Google's rules.

### Retention and deletion

Swarm keeps active connection data until removal or replacement. The native
Gmail tool processes results for each request. Its application code does not
write message headers or results to the database.

After an approval is used or denied, Swarm clears its encrypted query data.
Expired approvals cannot execute. During approval activity, Swarm clears expired
query data that is available for cleanup. Locked records can require later
activity. Without later activity, expired encrypted query data can remain.
Approval identifiers, hashes, and decision times have no automatic expiry.
Removing the connection deletes its approval records.

Removing a connection deletes its active saved credentials, pending OAuth
states, and organization shares. It does not revoke the service provider's
grant. For Google revocation, remove Swarm from your
[Google Account connections](https://myaccount.google.com/connections).

Connection removal does not erase results already received by agents. Earlier
imported credential copies remain separate from active connections. Team audit
records also retain identifiers after deletion. Those records have no automatic
expiry. Historical credentials and external copies need separate handling.

A current backup inspection listed no available database backups. Point-in-time
recovery was disabled. This inspection does not establish historical backup
retention or every hosting-log retention rule. The Management API identifies the
project's organization plan as Free. Supabase's current published plan lists one
day for API and database logs and one hour for Auth audit logs. These published
limits do not establish deletion of every operational copy. The operator must
confirm historical copies and its own deletion procedures. See
[Supabase's plan details](https://supabase.com/pricing).

For account or historical-data deletion, contact the privacy address above. Do
not send passwords, tokens, or mailbox content with the request. The operator
must verify account control before a deletion that affects access.

### Access controls and security limits

Swarm checks connection ownership and shared tool permissions on its server. It
checks Gmail tool access again before each Gmail message request. Saved
credentials use encryption. Public connections use HTTPS. These controls do not
establish a security certification or eliminate every security risk.

The inspected application source contains no advertising or analytics SDK. This
source finding does not describe hosting logs, operator access, or agent
provider practices. The operator must confirm those practices before
publication.

### Limited Use statement proposed for approval

The following text is an operational commitment for the proposed public release.
It must not be published as a statement of current compliance without approval
and supporting controls.

Swarm's use and transfer of information received from Google APIs will adhere to
the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including its Limited Use requirements. Swarm will also follow the
[Google Workspace data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).

Swarm will use Google data only for the user-facing mailbox search feature. It
will not sell Google data or use it for advertising, credit decisions, or
general model training. Transfers will be limited to permitted user-facing
features with consent, security needs, legal requirements, or an eligible
business transfer with prior consent.

Human access will require documented consent for specific data, a permitted
security purpose, a legal requirement, or permitted aggregated and anonymized
internal use. Employees, agents, contractors, and successors must follow these
restrictions. Supported recipient controls must enforce the same permitted uses.

## Terms and changes

Google describes service terms as optional for OAuth verification. This work
does not create a contract, choose governing law, or invent liability terms. If
the operator wants terms, prepare them separately with confirmed operator facts.
Publish the final privacy date and identify material policy changes.

## Audit basis

The source audit covered native tools, authorization, connection storage, legacy
import, team access, browser storage, and the local approval changes. The
production audit used aggregate counts and selected configuration fields. It did
not inspect private mail or print credentials.

The production snapshot showed four retained legacy credential rows. Database
statement logging was `ddl`; error-statement logging was `error`. Audit
parameter logging was off. These settings do not establish all platform log
contents or their retention. The new approval table was absent in production.
