import { membershipSchema, uuid } from "@/lib/contracts/backend";
import {
  authenticated,
  databaseError,
  json,
  readBody,
} from "@/lib/server/http";
export async function GET(request: Request) {
  const org = uuid.safeParse(
    new URL(request.url).searchParams.get("organizationId"),
  );
  if (!org.success)
    return json({ error: "Valid organizationId required." }, 400);
  const context = await authenticated();
  if (context.error) return context.error;
  const { data, error } = await context.client.rpc(
    "list_organization_members",
    { p_organization_id: org.data },
  );
  if (error) return databaseError(error);
  return json({ members: data });
}
export async function POST(request: Request) {
  const body = await readBody(request, membershipSchema);
  if ("error" in body) return body.error;
  const context = await authenticated();
  if (context.error) return context.error;
  const { error } = await context.client.rpc("set_organization_member", {
    p_organization_id: body.data.organizationId,
    p_user_id: body.data.userId,
    p_role: body.data.role,
  });
  if (error) return databaseError(error);
  return json({ ok: true });
}
