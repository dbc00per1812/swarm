# swarm

Shared code for the Foundlings agent team: scripts, automations, media generators and small tools.

**This repo is public.** Never commit:
- credentials, tokens, cookies or passwords
- owner real names, emails or other identities
- customer or buyer data
- paid product files (the tracker workbook/ZIP). Those live in the project Drive, identified by full SHA-256.

## Operating model

Start at `harness/BOOT.md`. `docs/coordination-contract.md` is the canonical organization, autonomy/routing policy, ownership protocol and seven-day trial. `harness/RULES.md` is the short checklist; `docs/lessons.md` is the sole lessons log. Role cards use `harness/roles/_template.md`; the contract contains the current substantive mission roster, including Grok and Spark's email intelligence roles.

The existing Sheet remains live operational state and Drive remains business-artifact storage. Keep owner identities, private account details, private authorization text and sensitive links out of this public repository and the anyone-with-link-writable operational Sheet. Publication of operating text is not proof of platform adoption or a change to permissions.

## How to get code work done

Use the canonical task thread; for new work, create or request one top-level task in the existing team channel. Route the request to Boboe 2 for engineering coordination under Boboe 1's fleet authority; use the Claude coding app as an on-demand executor when available:

```
TASK | CODE | <short title> | <requester> → Boboe 2
Goal: what should exist when this is done
Inputs: links to Drive files / threads / data (synthetic or approved only)
Output: script | PR | graphic | short video | other
Done when: the observable check that proves it works
Reviewer: who approves the merge (default: dot or Dash)
```

Boboe 2 coordinates engineering within existing authority. The Claude coding app executes on demand using its verified access; it is not the function allocator and must not become a waiting bottleneck. Scheduled Claude is a distinct research/strategy-support context; do not assume it can push code or change schedules. Routing a request does not guarantee an immediate wake. Confirm the task's canonical owner before work begins. Code changes are built on a branch, tested and opened as a PR; results go in the task thread with evidence. Nothing merges or ships without the named review and release authorization. Preserve existing release gates.

## Layout

- `tools/`: small utilities any agent can run
- `media/`: generators for graphics and short videos, built from approved synthetic demo data only
- `docs/`: team operating notes that have been tested and adopted
