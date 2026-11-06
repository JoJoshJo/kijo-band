import "server-only";
import { getSql } from "./db";
import type { Alert, AlertPriority, Resident } from "./types";

export interface NtfyAlertPush {
  alert: Alert;
  /** Optional: if omitted, it is looked up by alert.residentId. */
  resident?: Pick<Resident, "name" | "room">;
  /** Per-alert ack token for the "I'm on it" action. If omitted it is read server-side from the DB. */
  ackToken?: string;
  /** true for the second push after the 90s timeout (title tagged ⚠️ ESCALATED, for the charge nurse). */
  escalated?: boolean;
}

const NTFY_BASE = "https://ntfy.sh";
const NTFY_TIMEOUT_MS = 3000;

// ntfy priority: 5 = urgent, 4 = high, 3 = default.
const NTFY_PRIORITY: Record<AlertPriority, number> = { 1: 5, 2: 4, 3: 3 };
const DOT: Record<AlertPriority, string> = { 1: "🔴", 2: "🟡", 3: "🔵" };
const TAGS: Record<AlertPriority, string[]> = {
  1: ["rotating_light", "p1"],
  2: ["warning", "p2"],
  3: ["information_source", "p3"],
};

let warnedNoTopic = false;

/** Pure: builds the ntfy JSON message (exported for tests). Never includes anything but the topic as a secret. */
export function buildNtfyMessage(
  topic: string,
  appUrl: string | undefined,
  push: Required<Pick<NtfyAlertPush, "alert" | "resident">> & { ackToken?: string; escalated?: boolean },
) {
  const { alert, resident, ackToken, escalated } = push;
  const p = alert.priority;
  const title = `${escalated ? "⚠️ ESCALATED · " : ""}${DOT[p]} P${p} · Room ${resident.room} · ${resident.name}`;
  const lines = [alert.summary];
  if (alert.transcript) lines.push(`“${alert.transcript}”`);
  if (alert.heartRate != null && !/HR \d+/.test(alert.summary)) lines.push(`HR ${alert.heartRate}`);

  const base = appUrl?.replace(/\/+$/, "");
  const actions =
    base && ackToken
      ? [
          {
            action: "http",
            label: "I'm on it",
            url: `${base}/api/ack?alert=${encodeURIComponent(alert.id)}&token=${encodeURIComponent(ackToken)}`,
            method: "POST",
            clear: true,
          },
        ]
      : [];

  return {
    topic,
    title,
    message: lines.join("\n"),
    priority: escalated ? 5 : NTFY_PRIORITY[p],
    tags: escalated ? ["warning", "escalated", ...TAGS[p]] : TAGS[p],
    ...(base ? { click: `${base}/dashboard` } : {}),
    ...(actions.length ? { actions } : {}),
  };
}

/**
 * Push an alert to nurse phones via ntfy (spec section 6). Owned by Session B; also called by Session A's
 * /api/escalate (escalated: true). Never throws and never logs the topic: a failed push must not fail
 * the alert. Uses ntfy's JSON publish (topic in the body) so emoji titles are sent as UTF-8.
 */
export async function sendNtfy(push: NtfyAlertPush): Promise<void> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    if (!warnedNoTopic) console.warn("sendNtfy: NTFY_TOPIC is not set; skipping nurse push");
    warnedNoTopic = true;
    return;
  }
  try {
    const sql = getSql();
    let resident = push.resident;
    if (!resident) {
      const [r] = await sql`SELECT name, room FROM residents WHERE id = ${push.alert.residentId}`;
      if (!r) return;
      resident = { name: r.name as string, room: r.room as string };
    }
    let ackToken = push.ackToken;
    if (!ackToken) {
      const [a] = await sql`SELECT ack_token FROM alerts WHERE id = ${push.alert.id}`;
      ackToken = (a?.ack_token as string | undefined) ?? undefined;
    }

    const body = buildNtfyMessage(topic, process.env.NEXT_PUBLIC_APP_URL, {
      alert: push.alert,
      resident,
      ackToken,
      escalated: push.escalated,
    });
    await postNtfy(body, push.alert.id);
  } catch {
    console.warn(`sendNtfy: lookup failed for alert ${push.alert.id}`);
  }
}

/** POST a JSON message to ntfy. Never throws; logs only the alert id and the failure kind (never the topic). */
async function postNtfy(body: object, alertId: string): Promise<void> {
  try {
    const res = await fetch(NTFY_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(NTFY_TIMEOUT_MS),
    });
    if (!res.ok) console.warn(`sendNtfy: ntfy responded ${res.status} for alert ${alertId}`);
  } catch (err) {
    const kind = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "request failed";
    console.warn(`sendNtfy: ${kind} for alert ${alertId}`);
  }
}

/** Pure: the "resident says they're OK" follow-up for a P1 (exported for tests). Keeps the "I'm on it" action. */
export function buildResidentOkMessage(
  topic: string,
  appUrl: string | undefined,
  push: Required<Pick<NtfyAlertPush, "alert" | "resident">> & { ackToken?: string },
) {
  const base = buildNtfyMessage(topic, appUrl, push);
  return {
    ...base,
    title: `🟢 Room ${push.resident.room}: resident says they're OK`,
    message: `${push.resident.name} — please still check.\n${push.alert.summary}`,
    priority: 4,
    tags: ["white_check_mark", "p1"],
    ...(push.alert.status === "open" ? {} : { actions: undefined }),
  };
}

/** Push "Room X: resident says they're OK — please still check" for a P1 the resident tried to cancel. */
export async function sendResidentOkPush(push: Required<Pick<NtfyAlertPush, "alert" | "resident">> & { ackToken?: string }) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  await postNtfy(buildResidentOkMessage(topic, process.env.NEXT_PUBLIC_APP_URL, push), push.alert.id);
}
