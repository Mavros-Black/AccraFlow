import { workOrderSchema, uuid } from "@/lib/contracts/backend";
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
  const { data, error } = await context.client
    .from("maintenance_tasks")
    .select(
      "id,incident_id,asset_id,title,priority,status,due_at,completion_notes,created_at,completed_at,maintenance_assignments(assigned_user_id)",
    )
    .eq("organization_id", org.data)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return databaseError(error);
  return json({ workOrders: data });
}
export async function POST(request: Request) {
  const body = await readBody(request, workOrderSchema);
  if ("error" in body) return body.error;
  const context = await authenticated();
  if (context.error) return context.error;
  const d = body.data;
  const { data, error } = await context.client.rpc("create_maintenance_task", {
    p_incident_id: d.incidentId,
    p_title: d.title,
    p_priority: d.priority,
    p_due_at: d.dueAt ?? null,
  });
  if (error) return databaseError(error);
  return json({ id: data }, 201);
}
