import { uuid } from "@/lib/contracts/backend";
import { authenticated, databaseError, json } from "@/lib/server/http";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = uuid.safeParse((await params).id);
  if (!id.success) return json({ error: "Invalid photo id." }, 400);
  const context = await authenticated();
  if (context.error) return context.error;
  const { data: photo, error } = await context.client
    .from("incident_photos")
    .select("object_path,mime_type")
    .eq("id", id.data)
    .maybeSingle();
  if (error) return databaseError(error);
  if (!photo) return json({ error: "Photo not found." }, 404);
  const { data, error: storageError } = await context.client.storage
    .from("accraflow-incident-photos")
    .download(photo.object_path);
  if (storageError || !data) return json({ error: "Photo not found." }, 404);
  return new Response(data, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
