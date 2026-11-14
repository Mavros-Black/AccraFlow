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
  const { data, error } = await context.client
    .from("audit_logs")
    .select("id,actor_id,action,entity_type,entity_id,created_at")
    .eq("organization_id", org.data)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return databaseError(error);
  return json({ entries: data });
}
