import "server-only";
import type { Alert, Resident } from "./types";

export interface NtfyAlertPush {
  alert: Alert;
  /** Optional: if omitted, the Checkpoint 4 implementation looks the resident up by alert.residentId. */
  resident?: Pick<Resident, "name" | "room">;
  /** Per-alert ack token for the "I'm on it" action. If omitted it is read server-side from the DB. */
  ackToken?: string;
  /** true for the second push after the 90s timeout (title tagged ⚠️ ESCALATED, sent to the charge nurse). */
  escalated?: boolean;
}

/**
 * STUB — ntfy push to nurse phones (spec section 6, Checkpoint 4). Owned by Session B.
 * Callers: /api/alert, /api/triage (Session B) and /api/escalate (Session A, after merge).
 * Not implemented yet: does nothing and never throws, so callers never depend on it succeeding.
 * Checkpoint 4 will POST to https://ntfy.sh/${NTFY_TOPIC} with title/priority headers and an
 * "I'm on it" action pointing at /api/ack?alert=<id>&nurse=<id>&token=<ackToken>.
 */
export async function sendNtfy(push: NtfyAlertPush): Promise<void> {
  void push; // Intentionally empty until Checkpoint 4.
}
