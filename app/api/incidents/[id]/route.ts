import { editIncidentSchema, uuid } from "@/lib/contracts/backend";
import {
  authenticated,
  databaseError,
  json,
  readBody,
} from "@/lib/server/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = uuid.safeParse((await params).id);
  if (!id.success) return json({ error: "Invalid incident id." }, 400);
  const body = await readBody(request, editIncidentSchema);
  if ("error" in body) return body.error;
  const context = await authenticated();
  if (context.error) return context.error;
  const d = body.data;
  const { error } = await context.client.rpc("edit_submitted_incident", {
    p_incident_id: id.data,
    p_title: d.title,
    p_description: d.description,
    p_category: d.category,
    p_longitude: d.longitude,
    p_latitude: d.latitude,
  });
  if (error) return databaseError(error);
  return json({ ok: true });
}
