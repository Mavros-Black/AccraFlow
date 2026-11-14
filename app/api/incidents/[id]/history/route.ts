import { uuid } from "@/lib/contracts/backend";
import { authenticated, databaseError, json } from "@/lib/server/http";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = uuid.safeParse((await params).id);
  if (!id.success) return json({ error: "Invalid incident id." }, 400);
  const context = await authenticated();
  if (context.error) return context.error;
  const { data, error } = await context.client
    .from("incident_status_history")
    .select("id,previous_status,new_status,reason,created_at")
    .eq("incident_id", id.data)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) return databaseError(error);
  return json({ history: data });
}
