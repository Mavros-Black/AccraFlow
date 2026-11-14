import { submitIncidentSchema, uuid } from "@/lib/contracts/backend";
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
  const { data, error } = await context.client.rpc("list_incidents", {
    p_organization_id: org.data,
  });
  if (error) return databaseError(error);
  return json({ incidents: data });
}
export async function POST(request: Request) {
  const body = await readBody(request, submitIncidentSchema);
  if ("error" in body) return body.error;
  const context = await authenticated();
  if (context.error) return context.error;
  const d = body.data;
  const { data, error } = await context.client.rpc("submit_incident", {
    p_organization_id: d.organizationId,
    p_title: d.title,
    p_description: d.description,
    p_category: d.category,
    p_longitude: d.longitude,
    p_latitude: d.latitude,
  });
  if (error) return databaseError(error);
  return json({ id: data }, 201);
}
