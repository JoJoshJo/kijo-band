import {
  ALERT_SOURCES,
  BAND_ALERT_TYPES,
  priorityFor,
  summaryFor,
  type AlertSource,
  type BandAlertType,
} from "@/lib/detection/alertRules";
import { createAlert, rateLimitedResponse } from "./createAlert";
import { INVALID_JSON, isHeartRate, isObject, isResidentId, readJson } from "./validate";

type ParsedBody = { residentId: string; type: BandAlertType; source?: AlertSource; heartRate?: number };

function parseBody(b: unknown): ParsedBody | string {
  if (!isObject(b)) return "Body must be a JSON object";
  if (!isResidentId(b.residentId)) return "Invalid residentId";
  if (typeof b.type !== "string" || !(BAND_ALERT_TYPES as readonly string[]).includes(b.type)) {
    return "Invalid type";
  }
  if (b.source !== undefined && (typeof b.source !== "string" || !(ALERT_SOURCES as readonly string[]).includes(b.source))) {
    return "Invalid source";
  }
  if (b.heartRate !== undefined && !isHeartRate(b.heartRate)) return "Invalid heartRate (integer 20–250)";
  return {
    residentId: b.residentId,
    type: b.type as BandAlertType,
    source: b.source as AlertSource | undefined,
    heartRate: b.heartRate as number | undefined,
  };
}

// POST /api/alert  { residentId, type, source?, heartRate? } → 201 { alert }
// Voice alerts don't come here: they go through /api/triage.
export async function POST(request: Request) {
  const raw = await readJson(request);
  if (raw === INVALID_JSON) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = parseBody(raw);
  if (typeof parsed === "string") return Response.json({ error: parsed }, { status: 400 });
  const { residentId, type, source, heartRate } = parsed;

  try {
    const result = await createAlert({
      residentId,
      type,
      priority: priorityFor(type, source),
      summary: summaryFor(type, source, heartRate),
      heartRate,
    });
    if (result.kind === "not_found") return Response.json({ error: "Resident not found" }, { status: 404 });
    if (result.kind === "rate_limited") return rateLimitedResponse(result.retryAfterMs);
    return Response.json({ alert: result.alert }, { status: 201 });
  } catch (err) {
    console.error("/api/alert failed:", err);
    return Response.json({ error: "Failed to create alert" }, { status: 500 });
  }
}
