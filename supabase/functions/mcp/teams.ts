import { z } from "npm:zod@4.6.5";
import { digest, providerSchema } from "./connection-store.ts";
import { random } from "./provider-oauth.ts";
import { ApiError, toolSchema, type UserStore } from "./user-store.ts";

const organization = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  role: z.enum(["owner", "member"]),
});
const invitation = z.object({
  id: z.uuid(),
  expiresAt: z.iso.datetime({ offset: true }),
});
const toolIds = z.array(z.string().min(1).max(100)).min(1).max(100);
const detail = organization.extend({
  members: z.array(
    z.object({ userId: z.uuid(), role: z.enum(["owner", "member"]) }),
  ),
  invitations: z.array(invitation.extend({
    usedAt: z.iso.datetime({ offset: true }).nullable(),
    revokedAt: z.iso.datetime({ offset: true }).nullable(),
  })),
  shares: z.array(z.object({
    connectionId: z.uuid(),
    ownerId: z.uuid(),
    name: z.string(),
    kind: z.enum(["native", "mcp"]),
    provider: providerSchema.nullable(),
    toolIds,
    tools: z.array(toolSchema),
  })),
});
const denial = z.object({
  status: z.union([
    z.literal(400),
    z.literal(401),
    z.literal(403),
    z.literal(404),
    z.literal(409),
  ]),
  error: z.enum([
    "Sign in to Swarm.",
    "Use an organization name with 1 to 100 characters.",
    "Invitation not found or expired.",
    "You already belong to this organization.",
    "Organization not found.",
    "The organization owner must do this.",
    "Invitation not found.",
    "Delete your organization before you leave.",
    "Member not found.",
    "Connection not found.",
    "Select enabled tools from this connection.",
    "Select enabled tools from a connected account.",
    "Team operation not found.",
  ]),
});

export function createTeamRoutes(store: UserStore, uiUrl: string) {
  async function manage<T>(
    user: string,
    action: string,
    schema: z.ZodType<T>,
    organizationId: string | null = null,
    input: Record<string, unknown> = {},
  ): Promise<T> {
    const value = await store.request("rpc/swarm_team_manage", {
      method: "POST",
      body: JSON.stringify({
        p_user_id: z.uuid().parse(user),
        p_action: action,
        p_organization_id: organizationId,
        p_input: input,
      }),
    });
    const error = denial.safeParse(value);
    if (error.success) throw new ApiError(error.data.error, error.data.status);
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new ApiError("Team storage is unavailable.", 503);
    }
    return result.data;
  }
  return async (
    path: string,
    request: Request,
    user: string,
    input: (request: Request) => Promise<unknown>,
  ): Promise<{ body: unknown; status: number } | null> => {
    const method = request.method;
    if (path === "/v1/organizations") {
      if (method === "GET") {
        return {
          body: {
            organizations: await manage(user, "list", z.array(organization)),
          },
          status: 200,
        };
      }
      if (method === "POST") {
        const value = z.object({ name: z.string().trim().min(1).max(100) })
          .strict().parse(await input(request));
        return {
          body: {
            organization: await manage(
              user,
              "create",
              organization,
              null,
              value,
            ),
          },
          status: 201,
        };
      }
    }
    const invitationAction = path.match(
      /^\/v1\/invitations\/(preview|accept)$/,
    );
    if (invitationAction && method === "POST") {
      if (new URL(request.url).search) {
        throw new ApiError("Put the invitation token in the request body.");
      }
      const value = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
        .strict().parse(await input(request));
      const schema = invitationAction[1] === "preview"
        ? organization.omit({ role: true })
        : organization;
      return {
        body: {
          organization: await manage(user, invitationAction[1], schema, null, {
            tokenHash: await digest(value.token),
          }),
        },
        status: 200,
      };
    }
    const match = path.match(
      /^\/v1\/organizations\/([a-f0-9-]+)(?:\/(members|invitations|shares)(?:\/([a-f0-9-]+))?)?$/i,
    );
    if (!match) return null;
    const id = z.uuid().parse(match[1]);
    const target = match[3] ? z.uuid().parse(match[3]) : null;
    if (!match[2] && method === "GET") {
      return {
        body: { organization: await manage(user, "detail", detail, id) },
        status: 200,
      };
    }
    if (!match[2] && method === "DELETE") {
      await manage(user, "delete", z.object({}).strict(), id);
      return { body: null, status: 204 };
    }
    if (match[2] === "invitations" && !target && method === "POST") {
      const token = random();
      const result = await manage(user, "invite", invitation, id, {
        tokenHash: await digest(token),
      });
      const link = new URL(uiUrl);
      link.search = "";
      link.hash = new URLSearchParams({ invite: token }).toString();
      return {
        body: { invitation: result, invitationUrl: link.toString() },
        status: 201,
      };
    }
    if (target && match[2] === "shares" && method === "PATCH") {
      const value = z.object({ toolIds }).strict().parse(await input(request));
      return {
        body: {
          share: await manage(
            user,
            "share",
            z.object({ connectionId: z.uuid(), toolIds }),
            id,
            {
              connectionId: target,
              toolIds: [...new Set(value.toolIds)],
            },
          ),
        },
        status: 200,
      };
    }
    if (target && method === "DELETE") {
      const actions = {
        members: ["remove_member", "userId"],
        invitations: ["revoke_invite", "invitationId"],
        shares: ["unshare", "connectionId"],
      } as const;
      const [action, field] = actions[match[2] as keyof typeof actions];
      await manage(user, action, z.object({}).strict(), id, {
        [field]: target,
      });
      return { body: null, status: 204 };
    }
    return null;
  };
}
