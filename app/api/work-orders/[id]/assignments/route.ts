import { assignmentSchema, uuid } from "@/lib/contracts/backend";
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
  if (!id.success) return json({ error: "Invalid work order id." }, 400);
  const body = await readBody(request, assignmentSchema);
  if ("error" in body) return body.error;
  const context = await authenticated();
  if (context.error) return context.error;
  const { error } = await context.client.rpc("assign_maintenance_task", {
    p_task_id: id.data,
    p_user_id: body.data.userId,
  });
  if (error) return databaseError(error);
  return json({ ok: true });
}
