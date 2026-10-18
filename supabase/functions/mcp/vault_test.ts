import { assertEquals, assertRejects } from "@std/assert";
import { createVaultRoutes } from "./vault.ts";
import { ApiError, UserStore } from "./user-store.ts";
const owner = "11111111-1111-4111-8111-111111111111";
const envelope = {
  format: 1,
  iterations: 600000,
  salt: btoa("a".repeat(16)),
  iv: btoa("b".repeat(12)),
  ciphertext: btoa("c".repeat(32)),
  revision: 0,
};
function fixture(result: unknown = { revision: 1 }) {
  const bodies: unknown[] = [];
  const paths: string[] = [];
  const store = new UserStore({
    projectUrl: "https://db.test",
    serviceKey: "test-key",
    encryptionKey: "a".repeat(64),
  }, async (url, init) => {
    paths.push(String(url));
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    return Response.json(result);
  });
  const route = createVaultRoutes(store);
  const call = (method: string, value: unknown = envelope, user = owner) =>
    route(
      "/v1/vault",
      new Request("https://app.test/v1/vault", { method }),
      user,
      () => Promise.resolve(value),
    );
  return { call, bodies, paths };
}
Deno.test("vault API refuses identities and plaintext fields before storage access", async () => {
  const f = fixture();
  await assertRejects(() => f.call("GET", undefined, ""), ApiError, "Sign in");
  await assertRejects(
    () => f.call("POST", { ...envelope, secret: "private value" }),
    ApiError,
    "Invalid encrypted vault",
  );
  await assertRejects(
    () => f.call("POST", { ...envelope, userId: owner }),
    ApiError,
    "Invalid encrypted vault",
  );
  await assertRejects(
    () => f.call("POST", { ...envelope, iterations: 1000 }),
    ApiError,
    "Invalid encrypted vault",
  );
  assertEquals(f.bodies.length, 0);
  assertEquals(f.paths.length, 0);
});
Deno.test("vault API binds reads and atomic saves to the verified owner", async () => {
  const read = fixture([{ ...envelope, revision: 1 }]);
  assertEquals((await read.call("GET"))?.status, 200);
  assertEquals(
    new URL(read.paths[0]).searchParams.get("user_id"),
    `eq.${owner}`,
  );
  const write = fixture();
  assertEquals((await write.call("POST"))?.body, {
    vault: { ...envelope, revision: 1 },
  });
  assertEquals(write.bodies[0], { p_user_id: owner, p_input: envelope });
  const conflict = fixture({
    status: 409,
    error: "The vault changed in another session.",
  });
  const error = await assertRejects(() => conflict.call("POST"), ApiError);
  assertEquals(error.status, 409);
});
