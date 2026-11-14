import { loginSchema } from "@/lib/contracts/backend";
import { json, readBody } from "@/lib/server/http";
import { createSupabaseForRequest } from "@/lib/server/supabase";
export async function POST(request: Request) {
  const body = await readBody(request, loginSchema);
  if ("error" in body) return body.error;
  const client = await createSupabaseForRequest();
  if (!client) return json({ error: "Backend is not configured." }, 503);
  try {
    const { error } = await client.auth.signInWithPassword(body.data);
    if (error)
      return json({ error: "Unable to sign in with those credentials." }, 401);
    return json({ ok: true });
  } catch {
    return json({ error: "Authentication service unavailable." }, 503);
  }
}
