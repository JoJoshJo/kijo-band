import { keywordTriage, MAX_TRANSCRIPT_CHARS, type TriageResult } from "@/lib/detection/voice";
import type { Language } from "@/lib/types";
import { LANGUAGES } from "@/app/band/_lib/i18n";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { createAlert, rateLimitedResponse } from "../alert/createAlert";
import { INVALID_JSON, isHeartRate, isObject, isResidentId, readJson } from "../alert/validate";
import { triageWithClaude } from "./claude";

// POST /api/triage { residentId, transcript, language, heartRate? } → 201 { alert, triage: "claude" | "keywords" }
// Only the single sentence that contained a trigger word is ever sent here — never audio.
// Two limits: per IP (checked first, before any Claude call — caps API spend from one client) and
// per resident (in createAlert). Per IP is generous because a venue's devices may share one NAT IP.
const TRIAGE_PER_IP = 20;
const TRIAGE_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const wait = rateLimit(`triage:${clientIp(request)}`, TRIAGE_PER_IP, TRIAGE_WINDOW_MS);
  if (wait !== null) return tooManyRequests(wait);
  const b = await readJson(request);
  if (b === INVALID_JSON) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  if (!isObject(b)) return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
  if (!isResidentId(b.residentId)) return Response.json({ error: "Invalid residentId" }, { status: 400 });
  if (typeof b.language !== "string" || !(LANGUAGES as string[]).includes(b.language)) {
    return Response.json({ error: "Invalid language" }, { status: 400 });
  }
  if (typeof b.transcript !== "string") return Response.json({ error: "Invalid transcript" }, { status: 400 });
  const transcript = b.transcript.replace(/\s+/g, " ").trim();
  if (transcript.length === 0) return Response.json({ error: "Empty transcript" }, { status: 400 });
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    return Response.json({ error: `Transcript too long (max ${MAX_TRANSCRIPT_CHARS} chars)` }, { status: 400 });
  }
  if (b.heartRate !== undefined && !isHeartRate(b.heartRate)) {
    return Response.json({ error: "Invalid heartRate (integer 20–250)" }, { status: 400 });
  }
  const language = b.language as Language;

  let triage: TriageResult | null = null;
  let source: "claude" | "keywords" = "keywords";
  try {
    triage = await triageWithClaude(transcript, language);
    if (triage) source = "claude";
  } catch (err) {
    console.warn("/api/triage: Claude failed, using keyword fallback:", err instanceof Error ? err.message : err);
  }
  triage ??= keywordTriage(transcript, language);

  try {
    const result = await createAlert({
      residentId: b.residentId,
      type: "voice",
      priority: triage.priority,
      summary: triage.summary,
      transcript,
      heartRate: b.heartRate as number | undefined,
      patientMessage: triage.patientMessage,
    });
    if (result.kind === "not_found") return Response.json({ error: "Resident not found" }, { status: 404 });
    if (result.kind === "rate_limited") return rateLimitedResponse(result.retryAfterMs);
    return Response.json({ alert: result.alert, triage: source }, { status: 201 });
  } catch (err) {
    console.error("/api/triage failed:", err);
    return Response.json({ error: "Failed to create alert" }, { status: 500 });
  }
}
