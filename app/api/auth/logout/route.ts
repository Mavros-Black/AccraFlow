import { authenticated, json, sameOrigin } from "@/lib/server/http";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return json({ error: "Invalid request origin." }, 403);
  const context = await authenticated();
  if (context.error) return context.error;
  const { error } = await context.client.auth.signOut();
  if (error) return json({ error: "Unable to sign out." }, 500);
  return json({ ok: true });
}
