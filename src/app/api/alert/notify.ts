import "server-only";
import type { Alert, Resident } from "@/lib/types";

/**
 * STUB — ntfy push to nurse phones (spec section 6, Checkpoint 4).
 * Checkpoint 4 moves this to src/lib/notify.ts (exported as sendNtfy) so Session A's /api/escalate can reuse it.
 * Not implemented yet: does nothing and never throws, so alert creation never depends on it.
 * Checkpoint 4 will POST to https://ntfy.sh/${NTFY_TOPIC} with title/priority headers and an
 * "I'm on it" action pointing at /api/ack?alert=<id>&nurse=<id>&token=<ackToken>.
 */
export async function sendNtfy(
  _alert: Alert,
  _resident: Pick<Resident, "name" | "room">,
  _ackToken: string,
): Promise<void> {
  // Intentionally empty until Checkpoint 4.
}
