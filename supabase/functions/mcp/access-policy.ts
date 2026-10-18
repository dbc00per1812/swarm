import { z } from "npm:zod@4.6.5";
import type { Connection } from "./user-store.ts";

export const resourcesSchema = z.object({
  repositories: z.array(
    z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/),
  ).max(100).optional(),
  channels: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)).max(100)
    .optional(),
  teams: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)).max(100).optional(),
}).strict();
export type Resources = z.infer<typeof resourcesSchema>;

export const grantSchema = z.object({
  connectionId: z.uuid(),
  toolIds: z.array(z.string().min(1).max(100)).max(100),
  resources: resourcesSchema.optional(),
}).strict();
export const keyOptionsSchema = z.object({
  name: z.string().trim().min(1).max(100).default("Agent key"),
  grants: z.array(grantSchema).max(100).default([]),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
}).strict();
export type Grant = z.infer<typeof grantSchema>;
export interface KeyOptions {
  name: string;
  grants: Grant[] | null;
  expiresAt?: string;
}
export const accessKeySchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  name: z.string().default("Legacy key"),
  grants: z.array(grantSchema).nullable().default(null),
  expires_at: z.string().nullable().default(null),
  created_at: z.string().nullable().default(null),
  revoked_at: z.string().nullable().default(null),
});
export type AccessKey = z.infer<typeof accessKeySchema>;

export function grantResources(key: AccessKey, connectionId: string) {
  return key.grants?.find((grant) => grant.connectionId === connectionId)
    ?.resources;
}

export function restrictedResources(
  key: AccessKey,
  row: Connection,
): Resources {
  const connection = resourcesSchema.parse(row.settings);
  if (row.provider === "github") connection.repositories ??= [];
  const grant = grantResources(key, row.id);
  const restrict = (name: keyof Resources) => {
    const allowed = connection[name], requested = grant?.[name];
    if (requested === undefined) return allowed;
    return allowed === undefined
      ? requested
      : requested.filter((item) =>
        allowed.some((value) =>
          name === "repositories"
            ? value.toLowerCase() === item.toLowerCase()
            : value === item
        )
      );
  };
  return {
    repositories: restrict("repositories"),
    channels: restrict("channels"),
    teams: restrict("teams"),
  };
}

export function grantsTool(
  key: AccessKey,
  connectionId: string,
  toolId: string,
) {
  return key.grants === null ||
    key.grants.some((grant) =>
      grant.connectionId === connectionId && grant.toolIds.includes(toolId)
    );
}

export function scopedConnections(key: AccessKey, rows: Connection[]) {
  return rows.map((row) => {
    const enabled = row.enabled_tools.filter((tool) =>
      grantsTool(key, row.id, tool)
    );
    return {
      ...row,
      enabled_tools: enabled,
      tool_catalog: row.tool_catalog.filter((tool) =>
        enabled.includes(tool.id)
      ),
    };
  }).filter((row) => row.enabled_tools.length > 0);
}

export function publicKey(key: AccessKey) {
  return {
    id: key.id,
    name: key.name,
    grants: key.grants,
    legacy: key.grants === null,
    expiresAt: key.expires_at,
    createdAt: key.created_at,
    revokedAt: key.revoked_at,
  };
}
