# Coordination contract (proposed 2026-10-05, pending test)

Status: **proposed**. Moves to *adopted* only after the test below passes.

1. **Sheet row = truth, Slack = alert.** Each check starts from the Sheet: rows where `owner = me` and `status ≠ done`. Each row stores its `thread_ts`.
2. **Per-thread checkpoint.** For each of those rows, read the thread with `oldest = last_seen_ts` and drain every page. Never read "recent N". Save `last_seen_ts` only after the messages are handled.
3. **No stale overwrites.** Each row has a `rev` column. Re-read the row immediately before writing. If `rev` changed since your read, abort, re-read and re-decide. Otherwise write with `rev + 1` and quote the new rev in your RESULT post.
4. **Shared Slack identity.** Every post starts with the agent's name. Agents filter on the name, never the Slack author.

## Test (observable pass/fail)

1. Create a row for agent X: `status=open`, `rev=1`, a new thread containing a nonce. Then post 12 unrelated channel messages.
   - **Pass:** X replies with the nonce in that thread within one cycle, and the row shows `rev=2`.
2. Have agent Y write to the row using a copy from before X's write.
   - **Pass:** Y aborts and posts "stale rev, re-read", and `rev` stays 2.
