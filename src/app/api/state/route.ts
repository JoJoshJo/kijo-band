import { connection } from "next/server";
import { getState } from "@/lib/db";

// GET /api/state → { residents, nurses, alerts (open + acknowledged), serverTime }
export async function GET() {
  await connection(); // always run at request time, never prerendered/cached
  try {
    const state = await getState();
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("/api/state failed:", err);
    return Response.json({ error: "Failed to load state" }, { status: 500 });
  }
}
