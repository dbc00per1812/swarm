# Gmail public access preparation

Date: 2026-10-15, America/Chicago. Status: prepared for review; public Gmail
access remains blocked.

## Completed work

The Google Cloud console identifies the correct project as `swarm-mcp`. Its
project number matches the Gmail client configured for Swarm. The existing
`gmail.readonly` scope is now declared and saved in Data Access. The application
remains External and Testing. No public verification was submitted. The website,
callback, credentials, active connections, and keys retain their existing
production configuration.

The source adds a Gmail data-use page and links it from the homepage. A notice
explains Gmail access before the connection cards. It describes server access,
agent transfers, team sharing, and separate Google revocation. The page states
that it is a technical notice. It makes no complete privacy-policy or compliance
claim.

The verification package is in `docs/integrations/google-gmail-oauth.md`. The
incomplete policy draft is in `docs/integrations/gmail-privacy-draft.md`. Both
documents mark missing facts and public release conditions. The source remains
separate from the deployed website until release authorization.

Search Console issued an HTML challenge for the existing GitHub Pages URL. The
unchanged downloaded file is prepared at `web/googledfccf295f08c8741.html`. It
has not been published. Website ownership has not been verified. This free
URL-prefix method does not establish OAuth acceptance of hosted domains.

The verification file's SHA-256 is
`ccf1d7244c93cffcbabcb43e6c218c1761f5a0c317f378d8b60633eb5b67d71b`.

## Verification

- `npm test`: 32 passing browser module tests; both bundles build.
- Source review: no findings in the technical-notice change.
- Document review: no findings in the verification package or policy draft.
- Browser review: homepage link, public notice, return link, skip link, keyboard
  focus, and Enter navigation pass.
- The notice has no horizontal overflow at 1280 and 320 pixels.
- The local homepage cannot reach the production configuration through its
  restricted browser origin.
- Authenticated notice rendering remains unverified in a browser. The existing
  module tests still pass.
- The console confirmed “Data access changes saved!” with one restricted Gmail
  scope.
- Private screenshots remain outside the public repository.
- Existing GitHub, Slack, Linear, and Gmail reads all pass after the declaration
  change.

Read-only production checks found five connections, two active keys, and two
pending authorizations. The team tables contain no organizations, memberships,
invitations, or grants. These counts differ from the earlier release baseline.
This preparation made no Supabase database writes. It did not remove the
additional records.

## Remaining public release conditions

- Confirm the public operator, contacts, and an accepted site-ownership
  verification method.
- Confirm logs, backup retention, deletion, and legacy credential handling.
- Complete the privacy policy and applicable operator terms.
- Demonstrate permitted agent data use and granular confirmation of Gmail agent
  actions.
- Verify the homepage and callback-domain requirements with Google.
- Produce a demonstration with final branding and synthetic mail.
- Complete restricted-scope verification and the required security assessment.
- Verify a new public Google account through the final production flow.

No purchase, assessor engagement, or paid assessment is authorized. The existing
credential-output incident remains open; rotation is unverified. Existing
personal service access, Muse, and Claude remain unchanged.
