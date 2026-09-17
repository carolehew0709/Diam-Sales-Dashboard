import { api, currentUser, publicUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => ({ ok: true, user: publicUser(await currentUser()) }));
}
