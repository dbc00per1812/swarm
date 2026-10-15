# Connections website verification

The website uses the versioned user API and the pinned Supabase browser client.
It preserves the existing website style, GitHub Pages hosting, and MCP endpoint.

## Implementation

- Persistent browser sessions, GitHub account creation and sign-in, existing
  email password sign-in, and local sign-out.
- Separate account cards, authorization, renaming, removal, repository settings,
  and per-account tool selection.
- Approved-host custom MCP creation, optional bearer authentication, discovery,
  credential replacement, and explicit tool selection.
- Agent key creation, token and configuration copy, configuration download, and
  revocation of keys created in this browser.
- Loading, empty, expired-session, request failure, and storage failure
  messages.

Email signup remains unavailable because no production sender is configured.
GitHub is the free social-login path. Its final live approval check remains
pending owner approval for read-only email access. Configuration alone does not
prove a completed social-login journey.

## Independent reviews

Code, JavaScript, and security reviewers found no remaining blockers after the
corrections. The review identified four defects:

- A delayed response body could reveal a key after a session change. API calls
  now check the user and session generation after each asynchronous operation.
- An older refresh could restore outdated tool selections. Refresh requests now
  have sequence numbers.
- An initial request failure could prevent control setup. Controls now
  initialize before loading connections.
- A browser storage failure could hide a newly issued key. The page now retains
  its token and revocation control in memory and shows a warning.

Each defect has a page regression test. Removing the session guard or refresh
ordering guard makes the relevant test fail.

## Automated evidence

- All 39 gateway tests pass.
- All six page tests pass against the built page and real Supabase browser
  client. External authentication and gateway responses use fixtures in those
  page tests.
- Deno type checking, lint, formatting, and Git whitespace checks pass.
- The production dependency audit reports no vulnerabilities.
- The minified browser bundle is approximately 229 KiB.

## Hosted browser and MCP evidence

Checks used the production website and two disposable confirmed users. They
passed these checks:

- Sign-in, reload, and sign-out preserve the expected account session.
- One user creates and renames two GitHub account cards with separate repository
  settings. Both cards survive reload.
- Both GitHub authorization flows finish independently. Explicit MCP reads work
  with either connection ID. A call without an ID rejects the ambiguous
  selection.
- The second user sees no connections or key revocation controls from the first.
- The browser creates a DeepWiki connection, discovers its catalog, and enables
  `read_wiki_structure`.
- The browser copies an agent configuration into a private test file. That exact
  configuration completes a hosted custom MCP read.
- Disabling the custom tool removes it from discovery and rejects direct calls.
- Key revocation through the page rejects the next MCP request with HTTP 401.
- A 390-by-844 viewport shows a single card column without horizontal overflow.
  Tool changes work at that width. Raw keys do not return after reload.

The two GitHub cards used the same authorized provider identity. Distinct
provider results remain covered by the gateway fixtures. No second human account
was invented for this check.

The disposable users and their related records were removed after verification.
Private copied configurations and test credentials were also removed. Production
again contains four personal connections, one active key, and no pending
provider authorization states. All four original service reads pass after
cleanup.

The desktop and mobile screenshots remain outside this public repository. They
can contain account labels. Private test credentials and copied configurations
also remain outside the repository.

## Provider release state

Slack public distribution is enabled. Linear reports the application as publicly
available. These settings permit other workspace installations; an actual
installation in another workspace was not tested.

Gmail remains a Google testing application. Only approved test users can
connect, and test authorizations can expire after seven days. No verification or
general availability claim is made.

Custom MCP hosts remain restricted to `mcp.deepwiki.com`. No purchase or upgrade
was made. The original agent configuration and all four personal service reads
remain available.

The website deployment is on `gh-pages` at
`3b601426cb73d91abd399c5971f1fd0534c848b3`. The feature pull request remains a
draft. Merge requires the existing release review.
