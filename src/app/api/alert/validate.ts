// Input validation shared by Session B's API routes (/api/alert, /api/heartbeat, /api/triage).

export const RESIDENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const HR_MIN = 20;
export const HR_MAX = 250;

export function isResidentId(v: unknown): v is string {
  return typeof v === "string" && RESIDENT_ID_RE.test(v);
}

export function isHeartRate(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= HR_MIN && v <= HR_MAX;
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function readJson(request: Request): Promise<unknown | typeof INVALID_JSON> {
  try {
    return await request.json();
  } catch {
    return INVALID_JSON;
  }
}
export const INVALID_JSON = Symbol("invalid-json");
