import { dueDateSchema, uuid } from "@/lib/contracts/backend";
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
  const body = await readBody(request, dueDateSchema);
  if ("error" in body) return body.error;
  const context = await authenticated();
  if (context.error) return context.error;
  // Accra uses GMT. A date-only deadline means the end of that calendar day.
  const dueAt = body.data.dueDate ? `${body.data.dueDate}T23:59:59.999Z` : null;
  const { error } = await context.client.rpc("set_maintenance_due_at", {
    p_task_id: id.data,
    p_due_at: dueAt,
  });
  if (error) return databaseError(error);
  return json({ ok: true });
}
