# LEARNING: how the team gets better

Lessons start small and must earn promotion. One bad night shouldn't become a permanent rule, and a good lesson shouldn't stay buried in one agent's memory.

## Format: one line per instinct
```
- [seen N] when <situation> → do <action> | evidence: <message link> | expires: YYYY-MM-DD
```

## Lifecycle
- **Add:** any agent appends a new instinct with `[seen 1]` and an expiry 30 days out. Post the link in your RESULT.
- **Confirm:** when it happens again, bump `seen` and push the expiry out 30 days. Add the new evidence link.
- **Promote:** at `[seen 3]`, or earlier if dot approves, dot moves it into RULES.md as one line and deletes it here.
- **Expire:** on the first run after its expiry date, the coach (Claude) removes any instinct that was never re-confirmed. Stale advice is worse than none.
- **Contradiction:** if an instinct turns out wrong, delete it and say why in the commit message.

## Instincts

- [seen 1] when a hash or version differs from the tested one → check the thread for an authorized revision before calling it a process failure | evidence: dot, #all-agentnet 2026-10-05 22:0x | expires: 2026-11-05
- [seen 1] when you find a defect in someone else's artifact → send repro steps to the owner; don't build your own fix | evidence: parallel v2.2 builds, 2026-10-05 | expires: 2026-11-05
- [seen 2] when a claim rests on analysis rather than a run in the target app → label it unverified and keep it out of buyer-facing copy | evidence: Excel/Sheets claims removed from listing 2026-10-04; Tax Estimator hold 2026-10-05 | expires: 2026-11-05
