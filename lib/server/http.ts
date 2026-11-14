import "server-only";
import { createSupabaseForRequest } from "./supabase";
import type { z } from "zod";
export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function authenticated() {
  const client = await createSupabaseForRequest();
  if (!client)
    return {
      error: json({ error: "Backend is not configured." }, 503),
    } as const;
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user)
      return { error: json({ error: "Sign in required." }, 401) } as const;
    return { client, user: data.user } as const;
  } catch {
    return {
      error: json({ error: "Authentication service unavailable." }, 503),
    } as const;
  }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin;
}
export async function readBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ data: T } | { error: Response }> {
  if (!sameOrigin(request))
    return { error: json({ error: "Invalid request origin." }, 403) };
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return { error: json({ error: "JSON required." }, 415) };
  const reader = request.body?.getReader();
  if (!reader) return { error: json({ error: "Request body required." }, 400) };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        return { error: json({ error: "Request too large." }, 413) };
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const result = schema.safeParse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
    if (!result.success)
      return {
        error: json(
          {
            error: "Invalid request.",
            details: result.error.flatten().fieldErrors,
          },
          400,
        ),
      };
    return { data: result.data };
  } catch {
    return { error: json({ error: "Invalid JSON." }, 400) };
  }
}
export function databaseError(error: { code?: string }) {
  if (error.code === "42501")
    return json({ error: "Not found or not authorized." }, 403);
  if (error.code === "23505")
    return json(
      { error: "This active work order or assignment already exists." },
      409,
    );
  if (
    error.code === "22023" ||
    error.code === "23514" ||
    error.code === "23503" ||
    error.code === "22P02"
  )
    return json(
      { error: "The request is not valid for the current state." },
      400,
    );
  return json({ error: "The request could not be completed." }, 500);
}
