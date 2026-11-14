import { transitionSchema, uuid } from "@/lib/contracts/backend";
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
  if (!id.success) return json({ error: "Invalid incident id." }, 400);
  const body = await readBody(request, transitionSchema);
  if ("error" in body) return body.error;
  const context = await authenticated();
  if (context.error) return context.error;
  const { error } = await context.client.rpc("transition_incident", {
    p_incident_id: id.data,
    p_new_status: body.data.status,
    p_reason: body.data.reason ?? null,
  });
  if (error) return databaseError(error);
  return json({ ok: true });
}
