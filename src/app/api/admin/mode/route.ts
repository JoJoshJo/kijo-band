import { adminOpen } from "@/lib/adminAuth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rateLimit";

// GET /api/admin/mode → { open: boolean }. Tells the Charge view whether to ask for the admin secret
// (ADMIN_OPEN=1 → no prompt). Read at request time, so the flag never ends up in the client bundle.
export async function GET(req: Request) {
  const wait = rateLimit(`admin-mode:${clientIp(req)}`, 60, 60_000);
  if (wait) return tooManyRequests(wait);
  return Response.json({ open: adminOpen() }, { headers: { "Cache-Control": "no-store" } });
}
