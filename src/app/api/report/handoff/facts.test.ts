import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFacts, ruleHandoff, type HandoffAlertRow } from "./facts";

const NURSES = [
  { id: "n-1", name: "Ben", role: "CNA" },
  { id: "n-2", name: "Chloe", role: "RN" },
  { id: "n-9", name: "Grace", role: "Charge" },
];
const T = 1_000_000;
const row = (o: Partial<HandoffAlertRow>): HandoffAlertRow => ({
  residentId: "r-14", room: "14", name: "Henri", fallRisk: "High", nurseId: "n-1",
  type: "fall", priority: 1, status: "resolved", createdAt: T, acknowledgedAt: T + 30_000,
  resolvedAt: T + 60_000, escalatedTo: null, summary: "Fall detected", ...o,
});

test("aggregates per resident and per nurse", () => {
  const f = buildFacts(
    [
      row({}),
      row({ createdAt: T + 1e6, acknowledgedAt: T + 1e6 + 90_000, escalatedTo: "n-9", summary: "Fall · Resident says OK" }),
      row({ residentId: "r-03", room: "3", name: "Ada", nurseId: "n-2", type: "need_water", priority: 3, status: "open", acknowledgedAt: null, resolvedAt: null }),
    ],
    NURSES,
  );
  assert.equal(f.totals.alerts, 3);
  assert.equal(f.totals.p1, 2);
  assert.equal(f.totals.open, 1);
  assert.equal(f.totals.escalations, 1);
  const henri = f.residents.find((r) => r.room === "14")!;
  assert.equal(henri.falls, 2);
  assert.equal(henri.residentSaysOk, 1);
  const ben = f.nurses.find((n) => n.nurseId === "n-1")!;
  assert.equal(ben.handled, 2);
  assert.equal(ben.avgResponseMs, 60_000);
  const chloe = f.nurses.find((n) => n.nurseId === "n-2")!;
  assert.equal(chloe.open.length, 1);
  assert.equal(chloe.avgResponseMs, null);
  assert.equal(f.nurses.find((n) => n.nurseId === "n-9")!.alerts, 1); // charge: escalations only
});

test("rule-based handoff: falls first, 3 recommendations, plain text", () => {
  const h = ruleHandoff(
    buildFacts(
      [
        row({}),
        row({ createdAt: T + 1e6 }),
        row({ residentId: "r-02", room: "2", name: "Marie", type: "up_at_night", priority: 2 }),
        row({ residentId: "r-03", room: "3", name: "Ada", type: "need_water", priority: 3, status: "open", acknowledgedAt: null }),
      ],
      NURSES,
    ),
    T,
  );
  assert.equal(h.source, "rules");
  assert.equal(h.needsAttention[0].room, "14");
  assert.match(h.needsAttention[0].reason, /2 falls/);
  assert.equal(h.recommendations.length, 3);
  assert.match(h.recommendations[0], /Room 14 .* 2 falls .* fall-risk plan/);
  assert.ok(!h.nurses.some((n) => n.role === "Charge")); // nothing escalated → no charge row
  assert.match(h.text, /NEEDS ATTENTION THIS MORNING/);
});

test("quiet night", () => {
  const h = ruleHandoff(buildFacts([], NURSES), T);
  assert.deepEqual(h.needsAttention, []);
  assert.equal(h.recommendations.length, 1);
  assert.match(h.recommendations[0], /Quiet night/);
});
