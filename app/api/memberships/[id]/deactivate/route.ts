import { deactivateMembershipSchema, uuid } from "@/lib/contracts/backend";
import {
  authenticated,
  databaseError,
  json,
  readBody,
} from "@/lib/server/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = uuid.safeParse((await params).id);
  if (!id.success) return json({ error: "Invalid user id." }, 400);
  const body = await readBody(request, deactivateMembershipSchema);
  if ("error" in body) return body.error;
  const context = await authenticated();
  if (context.error) return context.error;
  const { error } = await context.client.rpc("deactivate_organization_member", {
    p_organization_id: body.data.organizationId,
    p_user_id: id.data,
  });
  if (error) return databaseError(error);
  return json({ ok: true });
}
