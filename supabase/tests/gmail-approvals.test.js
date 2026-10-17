import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Gmail approvals enforce the SQL contract in an isolated PostgreSQL database", async () => {
  const db = new PGlite();
  try {
    // Supabase supplies this identity schema and these roles in production.
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
    const results = await db.exec(
      await readFile(
        new URL("gmail_approvals.test.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.ok(
      results.some((statement) =>
        statement.rows.some((row) => String(row.result).startsWith("PASS:"))
      ),
    );
  } finally {
    await db.close();
  }
});
