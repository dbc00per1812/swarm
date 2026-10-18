import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("vault storage isolates owners, rejects stale writes, and audits only metadata", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(
      `create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls;`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/20261017180000_personal_vault.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query("insert into auth.users values($1),($2)", [owner, other]);
    const envelope = {
      format: 1,
      iterations: 600000,
      salt: Buffer.alloc(16, 1).toString("base64"),
      iv: Buffer.alloc(12, 2).toString("base64"),
      ciphertext: Buffer.alloc(32, 3).toString("base64"),
      revision: 0,
    };
    const save = async (user, value) =>
      (await db.query("select public.swarm_vault_save($1,$2) result", [
        user,
        value,
      ])).rows[0].result;
    assert.equal((await save(owner, envelope)).revision, 1);
    assert.equal((await save(owner, envelope)).status, 409);
    assert.equal((await save(owner, { ...envelope, revision: 1 })).revision, 2);
    assert.equal(
      (await db.query(
        "select count(*)::int total from public.swarm_vaults where user_id=$1",
        [other],
      )).rows[0].total,
      0,
    );
    assert.equal(
      (await db.query(
        "select count(*)::int total from public.swarm_vault_audit",
      )).rows[0].total,
      2,
    );
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select * from public.swarm_vaults"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.swarm_vault_save($1,$2)", [other, envelope]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
