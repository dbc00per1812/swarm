import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Activity storage restricts access and preserves completed metadata", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create role anon; create role authenticated; create role service_role bypassrls;
    `);
    const migrations = new URL("../migrations/", import.meta.url);
    for (
      const file of (await readdir(migrations)).filter((name) =>
        name.endsWith(".sql")
      ).sort()
    ) {
      await db.exec(await readFile(new URL(file, migrations), "utf8"));
    }
    await db.exec(`
      insert into auth.users(id) values('11111111-1111-4111-8111-111111111111');
      set role service_role;
      insert into public.swarm_activity(id,user_id,key_id,connection_id,tool_id,outcome,reason)
      values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',
        'github_list_pull_requests','allowed','execution_started');
    `);
    await assert.rejects(
      db.query("update public.swarm_activity set tool_id='replacement'"),
    );
    await assert.rejects(
      db.query(
        "update public.swarm_activity set outcome='denied',reason='completed'",
      ),
    );
    await db.exec(
      "update public.swarm_activity set outcome='allowed',reason='completed'",
    );
    const row = (await db.query("select * from public.swarm_activity")).rows[0];
    assert.equal(row.reason, "completed");
    assert.equal(row.outcome, "allowed");
    assert.equal(row.tool_id, "github_list_pull_requests");
    assert.deepEqual(Object.keys(row).sort(), [
      "connection_id",
      "created_at",
      "id",
      "key_id",
      "outcome",
      "reason",
      "tool_id",
      "user_id",
    ]);
    await assert.rejects(
      db.query(
        "update public.swarm_activity set outcome='failed',reason='provider_failed'",
      ),
    );
    await assert.rejects(db.query("delete from public.swarm_activity"));
    await db.exec(`
      reset role;
      insert into auth.users(id) values('77777777-7777-4777-8777-777777777777');
      set role service_role;
      insert into public.swarm_activity(id,user_id,key_id,outcome,reason,created_at)
      values('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333','denied','tool_unavailable',now()-interval '31 days');
      insert into public.swarm_activity(id,user_id,key_id,outcome,reason,created_at)
      values('66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777',
        '33333333-3333-4333-8333-333333333333','denied','tool_unavailable',now()-interval '31 days');
      insert into public.swarm_activity(user_id,key_id,outcome,reason)
      values('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','denied','tool_unavailable');
    `);
    assert.equal(
      (await db.query(
        "select count(*)::int as total from public.swarm_activity where id='55555555-5555-4555-8555-555555555555'",
      )).rows[0].total,
      0,
    );
    assert.equal(
      (await db.query(
        "select count(*)::int as total from public.swarm_activity where id='66666666-6666-4666-8666-666666666666'",
      )).rows[0].total,
      1,
    );
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from public.swarm_activity"));
    await assert.rejects(
      db.query(
        "update public.swarm_activity set outcome='failed',reason='provider_failed'",
      ),
    );
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from public.swarm_activity"));
  } finally {
    await db.close();
  }
});
