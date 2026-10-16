# Swarm privacy publication package

Prepared: 2026-10-16, America/Chicago. Status: ready for publication review.
Nothing in this package has been published. It does not deploy the prepared
Gmail approval gateway or expand Google audience access.

## Files and target

The current-preview policy source is `web/privacy.html`. The public target is
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

The package still displays its prepared status. Set its actual publication date
during the authorized publication step. A dated local candidate is not an
effective public policy.

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

No source push, website publication, Google configuration change, credential
rotation, production deletion, or public Gmail access change occurred during
this preparation.
