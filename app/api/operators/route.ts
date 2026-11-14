import { uuid } from "@/lib/contracts/backend";
import { authenticated, databaseError, json } from "@/lib/server/http";
export async function GET(request: Request) {
  const org = uuid.safeParse(
    new URL(request.url).searchParams.get("organizationId"),
  );
  if (!org.success)
    return json({ error: "Valid organizationId required." }, 400);
  const context = await authenticated();
  if (context.error) return context.error;
  const { data, error } = await context.client.rpc(
    "list_assignable_operators",
    { p_organization_id: org.data },
  );
  if (error) return databaseError(error);
  return json({ operators: data });
}
