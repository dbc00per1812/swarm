import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.SWARM_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "Set SWARM_TEST_DATABASE_URL to an empty local swarm_gmail_test database.",
  );
}
const target = new URL(connectionString);
if (
  target.search || target.hash ||
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  target.pathname !== "/swarm_gmail_test"
) {
  throw new Error(
    "Concurrency tests require the disposable local swarm_gmail_test database.",
  );
}

test("Independent PostgreSQL sessions consume once and avoid removal or cleanup deadlocks", async () => {
  const clients = Array.from(
    { length: 3 },
    () => new pg.Client({ connectionString }),
  );
  const [admin, first, second] = clients;
  try {
    await Promise.all(clients.map((client) => client.connect()));
    const empty = await admin.query(
      "select not exists(select 1 from information_schema.tables where table_schema in ('public','auth')) as empty",
    );
    assert.equal(
      empty.rows[0].empty,
      true,
      "Use an empty database. Existing data must not be changed.",
    );
    await admin.query(
      "create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create role anon; create role authenticated; create role service_role bypassrls;",
    );
    const migrations = new URL("../migrations/", import.meta.url);
    for (
      const file of (await readdir(migrations)).filter((name) =>
        name.endsWith(".sql")
      ).sort()
    ) {
      await admin.query(await readFile(new URL(file, migrations), "utf8"));
    }
    const user = "10000000-0000-4000-8000-000000000001";
    await admin.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'synthetic@example.test',now());",
      [user],
    );
    await admin.query(
      "insert into public.swarm_user_mcp_keys(user_id,token_hash) values($1,repeat('a',64));",
      [user],
    );
    for (const client of [first, second]) {
      await client.query(
        "set role service_role; set statement_timeout='5s'; set lock_timeout='4s';",
      );
    }
    const firstPid =
      (await first.query("select pg_backend_pid() as id")).rows[0].id;
    const secondPid =
      (await second.query("select pg_backend_pid() as id")).rows[0].id;
    assert.notEqual(firstPid, secondPid);
    const connection = async () =>
      (await admin.query(
        "insert into public.swarm_user_connections(user_id,kind,provider,name,ciphertext,tool_catalog,enabled_tools) values($1,'native','gmail','Synthetic','synthetic-credential','[{\"id\":\"gmail_search\"}]','{gmail_search}') returning id",
        [user],
      )).rows[0].id;
    const binding = { key_hash: "a".repeat(64), request_hash: "d".repeat(64) };
    const payload = (id) => ({
      ...binding,
      connection_id: id,
      revision: 0,
      ciphertext: "encrypted-query",
    });
    const operation = async (client, id, action, input = {}) =>
      (await client.query(
        "select public.swarm_gmail_approval($1,$2,$3,$4::jsonb) as result",
        [user, id, action, JSON.stringify(input)],
      )).rows[0].result;
    const expired = async (connectionId) => {
      const id = crypto.randomUUID();
      await admin.query(
        "insert into public.swarm_gmail_approvals(id,user_id,connection_id,key_hash,request_hash,revision,ciphertext,created_at,expires_at) values($1,$2,$3,$4,$5,0,'old-query',now()-interval '20 minutes',now()-interval '10 minutes')",
        [id, user, connectionId, binding.key_hash, binding.request_hash],
      );
      return id;
    };
    const waitForBlock = async (
      waitingPid = firstPid,
      blockingPid = secondPid,
    ) => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        if (
          (await admin.query(
            "select $2::int=any(pg_blocking_pids($1::int)) as blocked",
            [waitingPid, blockingPid],
          )).rows[0].blocked
        ) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.fail("The expected parent lock wait did not appear.");
    };

    const id = await connection(), approval = crypto.randomUUID();
    assert.equal(await operation(first, approval, "create", payload(id)), true);
    assert.equal(await operation(first, approval, "approve"), true);
    await first.query("begin");
    assert.equal(await operation(first, approval, "consume", binding), true);
    const secondConsumption = operation(second, approval, "consume", binding);
    await waitForBlock(secondPid, firstPid);
    await first.query("commit");
    assert.equal(await secondConsumption, false);

    const removedConnection = await connection();
    await expired(removedConnection);
    await second.query("begin");
    await second.query(
      "select id from public.swarm_user_connections where id=$1 for update",
      [removedConnection],
    );
    const waitingCreate = operation(
      first,
      crypto.randomUUID(),
      "create",
      payload(removedConnection),
    ).then(
      (result) => ({ result }),
      (error) => ({ code: error.code }),
    );
    await waitForBlock();
    await second.query(
      "delete from public.swarm_user_connections where id=$1",
      [removedConnection],
    );
    await second.query("commit");
    const created = await waitingCreate;
    assert.equal(
      created.code,
      "23503",
      "Concurrent removal must reject creation without a deadlock.",
    );

    const lockedExpired = await expired(id), next = crypto.randomUUID();
    await second.query("begin");
    await second.query(
      "select id from public.swarm_gmail_approvals where id=$1 for update",
      [lockedExpired],
    );
    assert.equal(await operation(first, next, "create", payload(id)), true);
    assert.equal(
      (await admin.query(
        "select ciphertext from public.swarm_gmail_approvals where id=$1",
        [lockedExpired],
      )).rows[0].ciphertext,
      "old-query",
    );
    await second.query("commit");
    await operation(first, next, "get");
    assert.equal(
      (await admin.query(
        "select ciphertext from public.swarm_gmail_approvals where id=$1",
        [lockedExpired],
      )).rows[0].ciphertext,
      null,
    );

    await admin.query("delete from public.swarm_gmail_approvals");
    for (let i = 0; i < 19; i++) {
      assert.equal(
        await operation(first, crypto.randomUUID(), "create", payload(id)),
        true,
      );
    }
    await first.query("begin");
    assert.equal(
      await operation(first, crypto.randomUUID(), "create", payload(id)),
      true,
    );
    const lastRequest = operation(
      second,
      crypto.randomUUID(),
      "create",
      payload(id),
    );
    await waitForBlock(secondPid, firstPid);
    await first.query("commit");
    assert.equal(await lastRequest, false);
    assert.equal(
      Number(
        (await admin.query("select count(*) from public.swarm_gmail_approvals"))
          .rows[0].count,
      ),
      20,
    );
  } finally {
    await Promise.allSettled(clients.map(async (client) => {
      try {
        await client.query("rollback");
      } catch { /* The client can already be disconnected. */ }
      await client.end();
    }));
  }
});
