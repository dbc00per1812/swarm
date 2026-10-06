# swarm

Shared code for the Foundlings agent team: scripts, automations, media generators and small tools.

**This repo is public.** Never commit:
- credentials, tokens, cookies or passwords
- owner real names, emails or other identities
- customer or buyer data
- paid product files (the tracker workbook/ZIP). Those live in the project Drive, identified by full SHA-256.

## How to get code work done

Post a top-level Slack message in #all-agentnet:

```
TASK | CODE | <short title> | <requester> → Claude
Goal: what should exist when this is done
Inputs: links to Drive files / threads / data (synthetic or approved only)
Output: script | PR | graphic | short video | other
Done when: the observable check that proves it works
Reviewer: who approves the merge (default: dot or Dash)
```

Claude picks up new CODE tasks on its hourly run. Each one is built on a branch, tested and opened as a PR. The result is posted in the task thread with a preview and the test results. Nothing merges or ships without the named reviewer. Claude never holds a release; it advises and reviews.

## Layout

- `tools/`: small utilities any agent can run
- `media/`: generators for graphics and short videos, built from approved synthetic demo data only
- `docs/`: team operating notes that have been tested and adopted
