import { z } from "npm:zod@4.6.5";
import { digest } from "./connection-store.ts";
import { gmailSearchInput } from "./services.ts";
import { ApiError, type Connection, UserStore } from "./user-store.ts";

const payloadSchema = gmailSearchInput.pick({ query: true, limit: true });
const approvalSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  connection_id: z.uuid(),
  revision: z.number().int(),
  key_hash: z.string().regex(/^[a-f0-9]{64}$/),
  request_hash: z.string().regex(/^[a-f0-9]{64}$/),
  ciphertext: z.string().nullable(),
  expires_at: z.string(),
  approved_at: z.string().nullable(),
  consumed_at: z.string().nullable(),
  denied_at: z.string().nullable(),
});
const unavailable = () =>
  new ApiError("This Gmail request is unavailable or expired.", 404);

// Only the authenticated website can approve requests. An agent key cannot approve them.
export class GmailApprovals {
  constructor(private store: UserStore, private uiUrl: string) {}

  private async operation(
    user: string,
    id: string,
    action: string,
    input = {},
  ) {
    return await this.store.request("rpc/swarm_gmail_approval", {
      method: "POST",
      body: JSON.stringify({
        p_user_id: z.uuid().parse(user),
        p_id: z.uuid().parse(id),
        p_action: action,
        p_input: input,
      }),
    });
  }
  private async fingerprint(
    row: Connection,
    value: z.infer<typeof payloadSchema>,
  ) {
    return await digest(JSON.stringify({
      connection: row.id,
      revision: row.revision,
      query: value.query,
      limit: value.limit,
    }));
  }
  async require(
    user: string,
    token: string,
    row: Connection,
    arguments_: unknown,
  ) {
    const args = gmailSearchInput.parse(arguments_);
    const payload = payloadSchema.parse({
      query: args.query,
      limit: args.limit,
    });
    const binding = {
      key_hash: await digest(token),
      request_hash: await this.fingerprint(row, payload),
    };
    if (args.approval_id) {
      const consumed = await this.operation(
        user,
        args.approval_id,
        "consume",
        binding,
      );
      if (consumed === true) return null;
      throw new ApiError(
        "Gmail approval is missing, expired, used, or does not match this request.",
        403,
      );
    }
    await this.store.permitted(user, row, "gmail_search");
    const id = crypto.randomUUID();
    const created = await this.operation(user, id, "create", {
      ...binding,
      connection_id: row.id,
      revision: row.revision,
      ciphertext: await this.store.encrypt(
        user,
        `gmail-approval:${id}`,
        payload,
      ),
    });
    if (created !== true) {
      throw new ApiError(
        "Gmail approval could not start. Refresh Swarm and try again.",
        409,
      );
    }
    const target = new URL(this.uiUrl);
    target.hash = `gmail-approval=${id}`;
    return {
      error:
        "Open the approval page and review this Gmail search. After approval, retry the same arguments with approval_id. Approval permits one attempt within ten minutes. Do not approve through an agent tool.",
      approvalId: id,
      approvalUrl: target.href,
    };
  }
  private async read(user: string, id: string) {
    const parsed = approvalSchema.safeParse(
      await this.operation(user, id, "get"),
    );
    if (!parsed.success) throw unavailable();
    const request = parsed.data;
    if (
      request.user_id !== user || Date.parse(request.expires_at) <= Date.now()
    ) throw unavailable();
    const [row] = await this.store.accessible(user, request.connection_id);
    if (!row || row.provider !== "gmail" || row.revision !== request.revision) {
      throw unavailable();
    }
    await this.store.permitted(user, row, "gmail_search");
    return { request, row };
  }
  async review(user: string, id: string) {
    const { request, row } = await this.read(user, id);
    const status = request.denied_at
      ? "denied"
      : request.consumed_at
      ? "used"
      : request.approved_at
      ? "approved"
      : "pending";
    const payload = request.ciphertext
      ? payloadSchema.parse(
        await this.store.decrypt(
          user,
          `gmail-approval:${id}`,
          request.ciphertext,
        ),
      )
      : null;
    if (
      payload && await this.fingerprint(row, payload) !== request.request_hash
    ) throw unavailable();
    return {
      id,
      status,
      connectionName: row.name,
      accountLabel: row.account_label,
      keyFingerprint: request.key_hash.slice(0, 12),
      expiresAt: request.expires_at,
      query: payload?.query ?? null,
      limit: payload?.limit ?? null,
    };
  }
  async decide(user: string, id: string, input: unknown) {
    const value = z.object({
      action: z.enum(["approve", "deny"]),
      limitedUseAccepted: z.boolean().optional(),
    }).strict().parse(input);
    if (value.action === "approve" && value.limitedUseAccepted !== true) {
      throw new ApiError("Confirm permitted Gmail data use before approval.");
    }
    await this.read(user, id);
    if (await this.operation(user, id, value.action) !== true) {
      throw unavailable();
    }
    return { status: value.action === "approve" ? "approved" : "denied" };
  }
}
