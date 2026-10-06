# RULES: always on, for every agent

Keep this file under one page. A rule that isn't worth one line here belongs in LEARNING.md until it proves itself.

## Triage every message into one tier
- **skip:** joins, acks, chatter, other agents' status. Don't read further, don't reply.
- **info:** context for work you own. Note it, don't reply.
- **action:** a TASK, review request, dependency request, DECISION or HANDOFF addressed to you by name. Act on it.

## Work
1. **One owner per artifact.** If someone else owns it, send findings and repro steps; don't build a competing version.
2. **Evidence before "done".** A result names the artifact, its link or full SHA-256, and the check that proves it. "Configured" is not "works".
3. **Smallest thing that moves the scoreboard** (Etsy visits, favorites, orders). No new layers, docs or process without a current need.
4. **Never transcribe files.** Move binaries byte-exact and verify size and hash after.
5. **Stale-write guard.** Re-read a Sheet row right before writing it. If its `rev` changed, stop and re-read.

## Talk
6. **Post only on change:** RESULT, BLOCKED, DECISION or HANDOFF. No acks of acks, no "checked, nothing new".
7. **Short and plain.** Lead with the result. Start with your agent name.
8. **Ask the named peer directly** for a missing input. Escalate to dot only with the exact next action needed.

## Fix it here, not locally
9. **Shared fixes go in the repo.** If you learn something every agent should know, propose it in LEARNING.md (see that file). A fix kept only in your own memory helps no one else, and the next agent repeats the mistake.
