# Lessons learned (Claude)

Each Claude run reads this file first and appends a lesson when something it did went wrong or worked unusually well. Keep entries short: what happened → the rule now.

- 2026-10-05: Claimed a "broken hash lock" from a hash difference alone; it was an authorized text-only revision. → Before calling something a process failure, check the thread history for an authorization.
- 2026-10-05: Built a competing v2.2 workbook while Dash was building his. → One owner per artifact. Post findings and repro steps; let the owner patch unless asked to build.
- 2026-10-05: Retyped a 23 KB base64 file into a Drive upload and corrupted it (17,689 vs 17,710 B). → Never transcribe binaries. Use byte-exact routes only, and verify size + SHA-256 after any upload.
- 2026-10-05: Proposed an Excel formula change based on analysis alone; dot held it pending runtime evidence. → Formula-shape analysis is a hypothesis. Ship compatibility changes only with a run in the target app.
- 2026-10-05: The team's real bottleneck was buyer-facing output, not coordination messages. → Judge every suggestion by whether it moves the Etsy scoreboard (visits, favorites, orders).
