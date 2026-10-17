# Swarm privacy publication package

Historical record: this file describes the initial policy-only publication and
version 15 audit. The later approval release supersedes its current-state claims.
See [the approval deployment record](../../plans/gmail-approval.production.md)
for gateway version 16, the installed migration, and the updated public policy.

Published: 2026-10-16, America/Chicago. The current-preview policy and homepage
link are public. Google Branding stores the public privacy URL. This publication
did not deploy the prepared Gmail approval gateway or expand Google audience
access.

## Verified release

- Pages commit: `9ac3a7cc74d68a38b0580b4d8eed3f3a4c339a77`.
- Pages build: `built`, with no reported error.
- Effective date: 16 October 2026.
- Public policy: HTTP 200, matching the reviewed source exactly.
- Policy SHA-256:
  `d83cdb5c73801fa95a1a885d6b2a300344bf6a60c5e9661035487afb8c833242`.
- Homepage: HTTP 200, with the privacy link.
- Existing application, callback, stylesheet, and verification files: unchanged.
- Google Branding: exact privacy URL saved and verified after a page reload.
- Google audience: External, Testing; one test user and no other users.
- Google Publish app control: now enabled; no audience change was made.

The saved privacy URL is `https://dbc00per1812.github.io/swarm/privacy.html`.
The Google app name remains `Swarm MCP personal preview`. Terms remain empty.
The production gateway remains version 15.

## Files and target

The current-preview policy source is `web/privacy.html`. The public address is
`https://dbc00per1812.github.io/swarm/privacy.html`. The technical evidence is
in `gmail-privacy-technical-check.md`. The operator procedure is in
`gmail-privacy-operations.md`.

A local website package contains the current production assets, a new privacy
page, and one added homepage privacy link. Every original asset was fetched from
the live website and compared with Pages commit
`2777c372eac7d315465e0680808efe9b90626e2d`. All original assets matched.

The archive is `swarm-privacy-preview-2026-10-16.zip` in the workspace's
`artifacts` directory. A separate manifest records every packaged file hash. The
archive contains eight files. Only `index.html` and `privacy.html` differ from
the live website. The existing application and callback bundles are unchanged.

That earlier archive retains its prepared status as historical evidence. The
published snapshot is `swarm-privacy-live-2026-10-16.zip` in the same directory.
Its separate manifest records the deployed commit and file hashes. The live
snapshot contains the effective publication date.

## Publication procedure

1. Confirm that production still uses gateway version 15 and the inspected
   storage behavior.
2. Compare the live Pages files with the package manifest before any
   replacement.
3. If production changed, update the policy and rebuild the package first.
4. Replace the prepared status with the actual effective date in the policy
   copy.
5. Check the final page and update its file hash in the publication record.
6. Publish only the new privacy page and the existing homepage's added privacy
   link.
7. Preserve the current application files, callback files, and verification
   asset.
8. Verify the public privacy page without signing in.
9. Verify the homepage privacy link and the Google verification file.
10. Save the verified public privacy URL in the existing Google Branding field.
11. Read the saved field again to confirm the exact URL.

The verification file is `googledfccf295f08c8741.html`. Its SHA-256 must remain
`ccf1d7244c93cffcbabcb43e6c218c1761f5a0c317f378d8b60633eb5b67d71b`.

Do not deploy the whole local `web` directory for a policy-only update. That
directory also contains the future approval interface and its technical notice.
Their release must match the corresponding gateway and migration.

## Separate Gmail release conditions

The current-preview policy accurately describes the absence of separate website
search approval. Before deploying that approval feature, replace the relevant
policy sections with the reviewed approval-release text. Include approval query
storage, expiry, deferred cleanup, and retained decision identifiers.

Recipient controls, the open credential incident, final verification evidence,
and Google's review remain separate Gmail release work. Publishing this notice
does not resolve those conditions. Google's data-use requirements also apply
during Testing.

This publication changed Pages and the Google privacy URL. It did not rotate
credentials, delete production data, deploy gateway code, or expand public Gmail
access.
