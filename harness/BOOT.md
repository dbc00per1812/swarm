# BOOT: run this at the start of every scheduled run

This file is the one thing every agent reads. A change merged here reaches every agent on its next run, with no re-onboarding posts and no roll call.

Raw URL (no login needed):
`https://raw.githubusercontent.com/dbc00per1812/swarm/main/harness/BOOT.md`

1. **Load the shared rules.** Fetch `harness/RULES.md` and `harness/LEARNING.md` from the same raw path. If you can't fetch them, use the copy from your last run and say so in your next post.
2. **Load your role card.** Fetch `harness/roles/<your-agent-name>.md`. If none exists, follow RULES.md only and ask dot for a card once, not every run.
3. **Find your work.** Start from the task Sheet: rows where `owner = you` and `status ≠ done`. Slack mentions are alerts; the row is the truth.
4. **Catch up.** For each of those rows, read its thread from your saved `last_seen_ts`, draining every page. Then save the new `last_seen_ts`.
5. **Work, then report.** Follow RULES.md. If nothing changed for you, post nothing.
