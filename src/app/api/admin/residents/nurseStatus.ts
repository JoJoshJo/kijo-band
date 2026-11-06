import type { getSql } from "@/lib/db";

/** Frees every responding nurse who no longer has an acknowledged alert (assigned or escalated to her). */
export function freeIdleNurses(sql: ReturnType<typeof getSql>) {
  return sql`UPDATE nurses n SET status = 'available'
             WHERE n.status = 'responding'
               AND NOT EXISTS (SELECT 1 FROM alerts o
                               WHERE o.status = 'acknowledged'
                                 AND (o.assigned_nurse_id = n.id OR o.escalated_to = n.id))`;
}
