import {
  Client,
  StreamableHTTPClientTransport,
} from "npm:@modelcontextprotocol/client@2.0.0";
import { z } from "npm:zod@4.6.5";
import { digest } from "./connection-store.ts";
import {
  ApiError,
  type Connection,
  type Tool,
  toolSchema,
  UserStore,
} from "./user-store.ts";

export interface CustomPolicy {
  approvedHosts: string[];
  resolve?: (host: string) => Promise<string[]>;
}
// Restrict destinations to hosts controlled or reviewed by the deployment operator.
// The host list remains necessary until the runtime can pin DNS results to TLS requests.
function publicAddress(address: string) {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) return false;
  const [a, b] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)));
}
export function validateEndpoint(value: string, policy: CustomPolicy) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" || url.username || url.password || url.hash ||
    (url.port && url.port !== "443") ||
    !policy.approvedHosts.includes(url.hostname) ||
    !/^[a-z0-9.-]+$/.test(url.hostname) || /^\d/.test(url.hostname)
  ) {
    throw new ApiError("Use an HTTPS MCP URL on an approved host.");
  }
  return url;
}
export async function customOperation<T>(
  row: Connection,
  store: UserStore,
  policy: CustomPolicy,
  action: (client: Client) => Promise<T>,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const endpoint = validateEndpoint(row.endpoint_url!, policy);
  const credential = await store.secret(row);
  const deadline = AbortSignal.timeout(10_000);
  const guardedFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const target = new URL(request.url);
    if (
      target.origin !== endpoint.origin ||
      target.pathname !== endpoint.pathname || target.search !== endpoint.search
    ) {
      throw new ApiError("The MCP server changed its destination.");
    }
    const addresses = await (policy.resolve ??
      (async (host: string) => await Deno.resolveDns(host, "A")))(
        target.hostname,
      );
    if (!addresses.length || addresses.some((ip) => !publicAddress(ip))) {
      throw new ApiError("The MCP destination is not public.");
    }
    const headers = new Headers(request.headers);
    headers.delete("Authorization");
    if (credential?.accessToken) {
      headers.set("Authorization", `Bearer ${credential.accessToken}`);
    }
    const current = await store.get(row.user_id, row.id);
    if (
      current.revision !== row.revision || current.ciphertext !== row.ciphertext
    ) {
      throw new ApiError("The connection changed. Load it again.", 409);
    }
    const response = await fetcher(request.url, {
      method: request.method,
      headers,
      ...(request.method !== "GET" && request.method !== "HEAD"
        ? { body: await request.arrayBuffer() }
        : {}),
      signal: AbortSignal.any([deadline, request.signal]),
      redirect: "error",
    });
    let size = 0;
    const body = response.body?.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          size += chunk.byteLength;
          if (size > 262_144) {
            throw new ApiError("The MCP response is too large.");
          }
          controller.enqueue(chunk);
        },
      }),
      { signal: deadline },
    );
    return new Response(body ?? null, {
      status: response.status,
      headers: response.headers,
    });
  };
  const client = new Client({ name: "swarm-upstream", version: "0.2.0" });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    fetch: guardedFetch,
  });
  try {
    await client.connect(transport, { signal: deadline });
    return await action(client);
  } finally {
    await client.close();
  }
}
export async function readCustomCatalog(
  client: Client,
  row: Connection,
): Promise<Tool[]> {
  const catalog: Tool[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  do {
    const page = await client.listTools(cursor ? { cursor } : {}, {
      timeout: 10_000,
    });
    for (const tool of page.tools) {
      if (seen.has(tool.name) || catalog.length >= 100) {
        throw new ApiError("The MCP tool catalog is invalid or too large.");
      }
      seen.add(tool.name);
      if (tool.inputSchema.type !== "object") {
        throw new ApiError("The MCP input schema must describe an object.");
      }
      // Reject unsupported schemas during discovery instead of breaking agent discovery later.
      z.fromJSONSchema(
        tool.inputSchema as Parameters<typeof z.fromJSONSchema>[0],
      );
      const id = `custom_${row.id.replaceAll("-", "")}_${
        (await digest(tool.name)).slice(0, 16)
      }`;
      catalog.push(toolSchema.parse({
        id,
        name: tool.name,
        upstreamName: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      }));
    }
    if (page.nextCursor && page.tools.length === 0) {
      throw new ApiError("The MCP tool catalog has invalid pagination.");
    }
    cursor = page.nextCursor;
  } while (cursor);
  if (new TextEncoder().encode(JSON.stringify(catalog)).length > 250_000) {
    throw new ApiError("The MCP tool catalog is too large.");
  }
  return catalog;
}

export async function discoverCustom(
  row: Connection,
  store: UserStore,
  policy: CustomPolicy,
  fetcher: typeof fetch,
) {
  const tools = await customOperation(
    row,
    store,
    policy,
    (client) => readCustomCatalog(client, row),
    fetcher,
  );
  // Rediscovery always requires a fresh selection, including changed schemas and capabilities.
  await store.update(row, { tool_catalog: tools, enabled_tools: [] });
  return tools;
}
