import { randomUUID } from "node:crypto";
import {
  MAX_PHOTO_BYTES,
  normalizeIncidentPhoto,
  PhotoValidationError,
} from "@/lib/server/photo.mjs";
import { uuid } from "@/lib/contracts/backend";
import {
  authenticated,
  databaseError,
  json,
  sameOrigin,
} from "@/lib/server/http";
const bucket = "accraflow-incident-photos";
const maxBytes = MAX_PHOTO_BYTES;
const accepted = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = uuid.safeParse((await params).id);
  if (!id.success) return json({ error: "Invalid incident id." }, 400);
  const context = await authenticated();
  if (context.error) return context.error;
  const { data, error } = await context.client
    .from("incident_photos")
    .select("id,mime_type,size_bytes,created_at")
    .eq("incident_id", id.data)
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) return databaseError(error);
  return json({ photos: data });
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request))
    return json({ error: "Invalid request origin." }, 403);
  const id = uuid.safeParse((await params).id);
  if (!id.success) return json({ error: "Invalid incident id." }, 400);
  const mime = request.headers.get("content-type")?.toLowerCase().split(";")[0];
  if (!mime || !accepted.has(mime))
    return json({ error: "Choose a JPEG, PNG, or WebP image." }, 415);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes)
    return json({ error: "Image exceeds 5 MiB." }, 413);
  const context = await authenticated();
  if (context.error) return context.error;
  const { data: incident, error: lookupError } = await context.client
    .from("incidents")
    .select("id,organization_id")
    .eq("id", id.data)
    .maybeSingle();
  if (lookupError) return databaseError(lookupError);
  if (!incident) return json({ error: "Not found or not authorized." }, 404);
  if (!request.body) return json({ error: "Image body required." }, 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let image: Buffer;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return json({ error: "Image exceeds 5 MiB." }, 413);
      }
      chunks.push(part.value);
    }
    image = await normalizeIncidentPhoto(Buffer.concat(chunks, size), mime);
  } catch (error) {
    if (error instanceof PhotoValidationError)
      return json({ error: error.message }, error.status);
    return json({ error: "Unable to read image." }, 400);
  }
  const photoId = randomUUID();
  const path = `${incident.organization_id}/${id.data}/${photoId}.jpg`;
  try {
    const { error: uploadError } = await context.client.storage
      .from(bucket)
      .upload(path, image, { contentType: "image/jpeg", upsert: false });
    if (uploadError)
      return json(
        {
          error:
            "Photo could not be uploaded. Check access and storage configuration.",
        },
        uploadError.statusCode === "403" ? 403 : 500,
      );
    try {
      const { error: registerError } = await context.client.rpc(
        "register_incident_photo",
        {
          p_incident_id: id.data,
          p_photo_id: photoId,
          p_size_bytes: image.length,
        },
      );
      if (!registerError) return json({ id: photoId }, 201);
      const { data: removed, error: cleanupError } =
        await context.client.storage.from(bucket).remove([path]);
      if (cleanupError || !removed?.length)
        return json(
          {
            error:
              "Photo registration failed and the pending upload could not be removed. Contact an administrator.",
          },
          500,
        );
      return databaseError(registerError);
    } catch {
      // A timed-out registration may have committed. Storage RLS prevents deleting registered photos.
      const { error: cleanupError } = await context.client.storage
        .from(bucket)
        .remove([path]);
      void cleanupError;
      return json(
        {
          error:
            "Photo registration could not be confirmed. Check the incident before retrying.",
        },
        503,
      );
    }
  } catch {
    return json({ error: "Photo storage service unavailable." }, 503);
  }
}
