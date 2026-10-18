import { z } from "npm:zod@4.6.5";
import { ApiError, type UserStore } from "./user-store.ts";

export const outcomeSchema = z.enum([
  "allowed",
  "denied",
  "failed",
  "approval_required",
]);
export const reasonSchema = z.enum([
  "execution_started",
  "completed",
  "tool_unavailable",
  "connection_required",
  "resource_denied",
  "permission_changed",
  "provider_failed",
  "approval_required",
]);
type Outcome = z.infer<typeof outcomeSchema>;
type Reason = z.infer<typeof reasonSchema>;
const eventSchema = z.object({
  id: z.uuid(),
  created_at: z.string(),
  connection_id: z.uuid().nullable(),
  key_id: z.uuid(),
  tool_id: z.string().max(100).nullable(),
  outcome: outcomeSchema,
  reason: reasonSchema,
});

export class Activity {
  constructor(private store: UserStore) {}
  async record(
    user: string,
    keyId: string,
    connectionId: string | null,
    toolId: string | null,
    outcome: Outcome,
    reason: Reason,
  ) {
    const result = z.array(z.object({ id: z.uuid() })).length(1).safeParse(
      await this.store.request("swarm_activity", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: z.uuid().parse(user),
          key_id: z.uuid().parse(keyId),
          connection_id: connectionId,
          tool_id: toolId,
          outcome,
          reason,
        }),
      }),
    );
    if (!result.success) {
      throw new ApiError("Activity storage is unavailable.", 503);
    }
    return result.data[0].id;
  }
  async finish(user: string, id: string, outcome: Outcome, reason: Reason) {
    const result = z.array(z.object({ id: z.uuid() })).length(1).safeParse(
      await this.store.request(
        `swarm_activity?user_id=eq.${z.uuid().parse(user)}&id=eq.${
          z.uuid().parse(id)
        }`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ outcome, reason }),
        },
      ),
    );
    if (!result.success) {
      throw new ApiError("Activity storage is unavailable.", 503);
    }
  }
  async list(user: string) {
    const cutoff = encodeURIComponent(
      new Date(Date.now() - 30 * 86400000).toISOString(),
    );
    const rows = z.array(eventSchema).max(100).safeParse(
      await this.store.request(
        `swarm_activity?user_id=eq.${
          z.uuid().parse(user)
        }&created_at=gte.${cutoff}&select=id,created_at,connection_id,key_id,tool_id,outcome,reason&order=created_at.desc,id.desc&limit=100`,
      ),
    );
    if (!rows.success) {
      throw new ApiError("Activity storage is unavailable.", 503);
    }
    return rows.data.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      connectionId: row.connection_id,
      keyId: row.key_id,
      toolId: row.tool_id,
      outcome: row.outcome,
      reason: row.reason,
    }));
  }
}
