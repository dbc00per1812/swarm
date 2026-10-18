import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Agent key storage validates grants, limits access, and audits credential changes", async () => {
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
      insert into public.swarm_user_mcp_keys(id,user_id,token_hash,name,grants)
      values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',repeat('a',64),'Research agent',
        '[{"connectionId":"33333333-3333-4333-8333-333333333333","toolIds":["github_list_pull_requests"],"resources":{"repositories":["demo/project"]}}]');
    `);
    assert.equal(
      (await db.query("select action from public.swarm_agent_key_audit"))
        .rows[0].action,
      "issued",
    );
    assert.equal(
      (await db.query(
        "select public.swarm_user_key_owner(repeat('a',64)) as owner",
      )).rows[0].owner,
      "11111111-1111-4111-8111-111111111111",
    );
    await assert.rejects(
      db.query("update public.swarm_user_mcp_keys set grants = '{}'"),
    );
    await assert.rejects(
      db.query(
        `update public.swarm_user_mcp_keys set grants = '[{"connectionId":"invalid","toolIds":["read"]}]'`,
      ),
    );
    await assert.rejects(
      db.query(
        `update public.swarm_user_mcp_keys set grants = '[{"connectionId":"33333333-3333-4333-8333-333333333333","toolIds":[null]}]'`,
      ),
    );
    await db.exec("update public.swarm_user_mcp_keys set revoked_at = now()");
    assert.equal(
      (await db.query(
        "select public.swarm_user_key_owner(repeat('a',64)) as owner",
      )).rows[0].owner,
      null,
    );
    const audit = (await db.query(
      "select action, metadata from public.swarm_agent_key_audit order by created_at",
    )).rows;
    assert.deepEqual(audit.map((row) => row.action), ["issued", "revoked"]);
    assert.deepEqual(audit[0].metadata, {
      legacy: false,
      connection_count: 1,
      expires_at: null,
    });
    await assert.rejects(db.query("delete from public.swarm_agent_key_audit"));
    await db.exec(
      `insert into public.swarm_user_mcp_keys(user_id,token_hash,created_at,expires_at)
      values('11111111-1111-4111-8111-111111111111',repeat('b',64),now()-interval '2 days',now()-interval '1 day')`,
    );
    assert.equal(
      (await db.query(
        "select public.swarm_user_key_owner(repeat('b',64)) as owner",
      )).rows[0].owner,
      null,
    );
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from public.swarm_user_mcp_keys"));
    await assert.rejects(
      db.query("select * from public.swarm_agent_key_audit"),
    );
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from public.swarm_user_mcp_keys"));
  } finally {
    await db.close();
  }
});
