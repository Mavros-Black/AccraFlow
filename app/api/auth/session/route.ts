import { authenticated, databaseError, json } from "@/lib/server/http";
export async function GET() {
  const context = await authenticated();
  if (context.error) return context.error;
  const { data, error } = await context.client
    .from("memberships")
    .select("organization_id,role,organizations(id,name)");
  if (error) return databaseError(error);
  return json({
    user: { id: context.user.id, email: context.user.email },
    memberships: data,
  });
}
