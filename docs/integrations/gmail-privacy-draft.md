# Swarm privacy policy draft

Status: incomplete operator review draft. Do not publish or enter this file as
the Google consent privacy URL. This draft describes the inspected application
code. It does not certify operational or legal compliance. Replace each
bracketed field only with confirmed facts.

## Operator and contact

Swarm is operated by [public operator name]. For support, contact [public
support address]. For privacy and deletion requests, contact [privacy-request
address]. Effective date: [publication date].

## Account and connection data

Swarm uses Supabase to manage account authentication. GitHub sign-in supplies
the account information used by the authentication service. Swarm stores service
connection names, account labels, tool selections, and account ownership
information. The browser saves your session and some account-control metadata.

## Gmail access and use

Google grants Swarm permission to view Gmail messages and settings. Swarm uses
Gmail access to identify your connected account and run searches requested
through its Gmail tool. The current tool returns message IDs, thread IDs, and
the Subject, From, and Date headers. It does not fetch message bodies or
attachments. Swarm sends search queries to Google.

Swarm stores your Gmail address as the connection label. It encrypts saved
access and refresh tokens on its server. The application processes search
results for each request without writing those results to its database. The
production database is in the `us-east-1` region. [Describe actual hosting,
infrastructure logs, access controls, and backup practices.]

## Sharing with agents and organizations

Agents with your key can use your enabled Gmail tool and receive its results. If
you share the tool with an organization, members' agents can search the
connected mailbox. Sharing grants tool access across the mailbox. It does not
select individual messages for sharing. Recipients do not receive the stored
Google credentials through Swarm's connection-management API. [Name supported
recipients and explain their retention, confirmation, and data-use
restrictions.]

## Limited Use commitments requiring operator confirmation

[Confirm and implement the complete Limited Use restrictions before publishing
this section.] [Insert Google's required affirmative Limited Use statement after
the operator approves the commitment.] [Confirm no advertising use, sale,
prohibited model training, or unauthorized human reading.] [Explain how these
controls apply to all permitted agent recipients and organization members.]

## Retention and deletion

Removing a connection deletes its active connection row, credentials, pending
authorization, and team shares. This action does not revoke the Google
authorization or erase copies already received by an agent. You can remove
Google's grant in your Google Account connections. You can disable a tool,
withdraw a share, or revoke a remembered agent key in Swarm.

Team audit records retain identifiers after deletion. The current schema has no
automatic expiry for these records. Earlier imported credential copies remain
separate from active connection rows. [Specify approved retention periods,
backup expiry, legacy-copy deletion, and account-deletion handling.] [State the
actual response process for privacy requests without inventing a deadline.]

## Remaining policy facts

[Confirm applicable operator disclosures, user rights, international transfers,
and age restrictions.] [Confirm analytics, cookies, incident handling,
subprocessors, and policy-change notices.] [Review all service integrations
before treating this Gmail-focused draft as the complete Swarm policy.]

## Terms drafting fields

Prepare terms only after the operator confirms these fields:

- The contracting operator and public contact details.
- Permitted account and agent use, including Google data-use restrictions.
- Account removal and service suspension procedures.
- Any service, payment, warranty, liability, governing-law, or dispute
  commitments.

This preparation does not select those terms or create a user agreement.
