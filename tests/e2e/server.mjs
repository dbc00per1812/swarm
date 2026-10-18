// Local browser fixture: real gateway and SQL, synthetic identity and provider services.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const origin = "http://127.0.0.1:4377";
const userId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";
const user = {
  id: userId,
  email: "browser@example.test",
  aud: "authenticated",
  email_confirmed_at: "2026-01-01T00:00:00Z",
};
const session = {
  access_token: "synthetic-session",
  refresh_token: "synthetic-refresh",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user,
};
const db = new PGlite();
await db.exec(
  "create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create role anon; create role authenticated; create role service_role bypassrls;",
);
for (
  const file of (await readdir("supabase/migrations")).filter((name) =>
    name.endsWith(".sql")
  ).sort()
) await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
await db.query(
  "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
  [userId, user.email],
);
const cipherKey = await crypto.subtle.importKey(
  "raw",
  Buffer.from("a".repeat(64), "hex"),
  "AES-GCM",
  false,
  ["encrypt"],
);
const iv = crypto.getRandomValues(new Uint8Array(12));
const encrypted = await crypto.subtle.encrypt(
  {
    name: "AES-GCM",
    iv,
    additionalData: new TextEncoder().encode(`${userId}:${connectionId}`),
  },
  cipherKey,
  new TextEncoder().encode(
    JSON.stringify({ accessToken: "synthetic-provider-key" }),
  ),
);
const ciphertext = `${Buffer.from(iv).toString("base64")}.${
  Buffer.from(encrypted).toString("base64")
}`;
const tool = {
  id: "github_list_pull_requests",
  name: "Read pull requests",
  description: "Read selected repositories.",
  inputSchema: {
    type: "object",
    properties: { owner: { type: "string" }, repo: { type: "string" } },
    required: ["owner", "repo"],
  },
};
await db.query(
  "insert into public.swarm_user_connections(id,user_id,kind,provider,name,ciphertext,settings,tool_catalog,enabled_tools) values($1,$2,'native','github','Engineering',$3,$4,$5,$6)",
  [
    connectionId,
    userId,
    ciphertext,
    JSON.stringify({ repositories: ["example/app", "example/docs"] }),
    JSON.stringify([tool]),
    [tool.id],
  ],
);
await db.exec("set role service_role");
const tables = new Set([
  "swarm_user_connections",
  "swarm_user_mcp_keys",
  "swarm_vaults",
  "swarm_vault_audit",
  "swarm_activity",
]);
const functions = new Set([
  "swarm_team_connections",
  "swarm_team_manage",
  "swarm_vault_save",
  "swarm_user_save_credential",
]);
const jsonFields = new Set(["settings", "tool_catalog", "grants", "metadata"]);
function identifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error("Unsupported identifier");
  }
  return `"${value}"`;
}
function encodeValue(key, value) {
  return jsonFields.has(key) ? JSON.stringify(value) : value;
}
async function payload(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 1_100_000) throw new Error("Large fixture input");
  }
  return text ? JSON.parse(text) : null;
}
function send(response, value, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}
let queue = Promise.resolve();
function serial(action) {
  const result = queue.then(action);
  queue = result.catch(() => {});
  return result;
}
async function rest(request, response, url) {
  if (request.headers.apikey !== "synthetic-service-role") {
    return send(response, {}, 403);
  }
  const body = await payload(request);
  const rpc = url.pathname.startsWith("/rest/v1/rpc/");
  const name = url.pathname.split("/").at(-1);
  if (rpc) {
    if (!functions.has(name)) throw new Error("Unsupported fixture function");
    const args = Object.entries(body || {});
    const named = args.map(([key], index) =>
      `${identifier(key)} => $${index + 1}`
    ).join(",");
    const values = args.map(([key, value]) =>
      key === "p_input" ? JSON.stringify(value) : value
    );
    const query = name === "swarm_team_connections"
      ? `select to_jsonb(t) as value from public.${
        identifier(name)
      }(${named}) t`
      : `select public.${identifier(name)}(${named}) as value`;
    const rows = (await serial(() => db.query(query, values))).rows;
    return send(
      response,
      name === "swarm_team_connections"
        ? rows.map((row) => row.value)
        : rows[0].value,
    );
  }
  if (!tables.has(name)) throw new Error("Unsupported fixture table");
  const values = [], conditions = [];
  for (const [column, filter] of url.searchParams) {
    if (["select", "order", "limit"].includes(column)) continue;
    const dot = filter.indexOf("."),
      operator = filter.slice(0, dot),
      value = filter.slice(dot + 1);
    if (operator === "is" && value === "null") {
      conditions.push(`${identifier(column)} is null`);
    } else if (["eq", "gte", "gt", "lt", "lte"].includes(operator)) {
      values.push(value);
      conditions.push(
        `${identifier(column)} ${
          { eq: "=", gte: ">=", gt: ">", lt: "<", lte: "<=" }[operator]
        } $${values.length}`,
      );
    } else throw new Error("Unsupported fixture filter");
  }
  const where = conditions.length ? ` where ${conditions.join(" and ")}` : "";
  const table = `public.${identifier(name)}`;
  let result;
  if (request.method === "POST") {
    const entries = Object.entries(body);
    result = await serial(() =>
      db.query(
        `insert into ${table} (${
          entries.map(([key]) => identifier(key)).join(",")
        }) values (${
          entries.map((_, index) => `$${index + 1}`).join(",")
        }) returning *`,
        entries.map(([key, value]) => encodeValue(key, value)),
      )
    );
  } else if (request.method === "PATCH") {
    const entries = Object.entries(body);
    const changes = entries.map(([key, value]) => {
      values.push(encodeValue(key, value));
      return `${identifier(key)}=$${values.length}`;
    });
    result = await serial(() =>
      db.query(
        `update ${table} set ${changes.join(",")}${where} returning *`,
        values,
      )
    );
  } else if (request.method === "DELETE") {
    result = await serial(() =>
      db.query(`delete from ${table}${where} returning *`, values)
    );
  } else {
    const selected = url.searchParams.get("select") || "*";
    const columns = selected === "*"
      ? "*"
      : selected.split(",").map(identifier).join(",");
    const order = url.searchParams.get("order");
    const ordering = order
      ? " order by " + order.split(",").map((part) => {
        const [key, direction] = part.split(".");
        return `${identifier(key)} ${direction === "desc" ? "desc" : "asc"}`;
      }).join(",")
      : "";
    const limit = Number(url.searchParams.get("limit") || 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Unsupported fixture limit");
    }
    result = await serial(() =>
      db.query(
        `select ${columns} from ${table}${where}${ordering} limit ${limit}`,
        values,
      )
    );
  }
  send(response, result.rows);
}
const web = resolve("web");
const server = createServer(async (request, response) => {
  const url = new URL(request.url, origin);
  try {
    if (url.pathname === "/health") return send(response, { ready: true });
    if (url.pathname === "/favicon.ico") {
      response.writeHead(204);
      return response.end();
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      return await rest(request, response, url);
    }
    if (url.pathname.startsWith("/fixture/github/")) {
      return send(response, [{
        number: 1,
        title: "Synthetic pull request",
        html_url: "https://example.test/pull/1",
        state: "open",
      }]);
    }
    if (url.pathname === "/auth/v1/user") {
      return send(
        response,
        request.headers.authorization === "Bearer synthetic-session"
          ? user
          : {},
        request.headers.authorization === "Bearer synthetic-session"
          ? 200
          : 401,
      );
    }
    if (url.pathname === "/auth/v1/token") {
      await payload(request);
      return send(response, session);
    }
    if (url.pathname === "/auth/v1/logout") {
      response.writeHead(204);
      return response.end();
    }
    if (url.pathname.startsWith("/functions/v1/mcp")) {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const upstream = await fetch(
        `http://127.0.0.1:4378${url.pathname}${url.search}`,
        {
          method: request.method,
          headers: request.headers,
          ...(["GET", "HEAD"].includes(request.method)
            ? {}
            : { body: Buffer.concat(chunks) }),
        },
      );
      response.writeHead(upstream.status, Object.fromEntries(upstream.headers));
      return response.end(Buffer.from(await upstream.arrayBuffer()));
    }
    const path = resolve(
      web,
      `.${
        decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)
      }`,
    );
    if (!path.startsWith(web + sep)) return send(response, {}, 404);
    let bytes = await readFile(path);
    const extension = extname(path);
    if (extension === ".html") {
      bytes = Buffer.from(
        bytes.toString().replace(
          "connect-src https://*.supabase.co;",
          "connect-src 'self' https://*.supabase.co;",
        ),
      );
    }
    if (path.endsWith("dist/app.js")) {
      bytes = Buffer.from(
        bytes.toString().replaceAll(
          "https://xatpcwatmcpjznhwgpit.supabase.co/functions/v1/mcp",
          `${origin}/functions/v1/mcp`,
        ),
      );
    }
    response.writeHead(200, {
      "Content-Type": {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
      }[extension] || "application/octet-stream",
    });
    response.end(bytes);
  } catch (error) {
    process.stderr.write(`Browser fixture failed: ${error.message}\n`);
    send(response, { error: "Fixture request failed." }, 500);
  }
});
await new Promise((resolve) => server.listen(4377, "127.0.0.1", resolve));
const gateway = spawn("deno", [
  "run",
  "--allow-net=127.0.0.1",
  "--allow-env",
  "--allow-read",
  "tests/e2e/gateway.ts",
], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { PATH: process.env.PATH, HOME: process.env.HOME },
});
gateway.stdout.pipe(process.stdout);
gateway.stderr.pipe(process.stderr);
process.stdout.write("Browser fixture is ready at http://127.0.0.1:4377\n");
async function close() {
  gateway.kill("SIGTERM");
  server.close();
  await db.close();
  process.exit(0);
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
gateway.on("exit", (code) => {
  if (code) process.exit(code);
});
