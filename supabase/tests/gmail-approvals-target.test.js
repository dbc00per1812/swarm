import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("The concurrency command rejects database target overrides before connection", () => {
  const result = spawnSync(process.execPath, [
    "--test",
    fileURLToPath(
      new URL("gmail-approvals-concurrency.test.js", import.meta.url),
    ),
  ], {
    env: {
      SWARM_TEST_DATABASE_URL:
        "postgresql://127.0.0.1/swarm_gmail_test?host=remote.example.test",
    },
    timeout: 5000,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(
    result.stdout + result.stderr,
    /Concurrency tests require the disposable local swarm_gmail_test database/,
  );
});
