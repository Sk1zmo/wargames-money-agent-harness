import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import type { Database } from "../db/client";
import { auditEvents } from "../db/schema";
import type { ActorType, AuditEventRow } from "../db/schema";
import { newId } from "../shared/ids";
import { logger } from "../shared/logger";

/**
 * Audit trail.
 *
 * Rows are only ever INSERTed by this module. A correction is a new row
 * carrying `correctsEventId`; nothing is ever updated or deleted.
 *
 * On the guarantee actually provided: this is append-only BY CONSTRUCTION IN
 * THE APPLICATION LAYER. It is not cryptographic immutability, not hash-chained
 * and not tamper-evident against direct database access. The Audit page states
 * this in the UI rather than implying a stronger property than the storage has.
 */

export type AuditAction =
  | "AGENT_REGISTERED"
  | "AGENT_HEALTH_CHECKED"
  | "AGENT_RETIRED"
  | "SUITE_GENERATED"
  | "CERTIFICATION_STARTED"
  | "CERTIFICATION_COMPLETED"
  | "CERTIFICATION_CANCELLED"
  | "CERTIFICATION_ERRORED"
  | "SCENARIO_EXECUTED"
  | "JUDGE_INVOKED"
  | "JUDGE_FAILED"
  | "VERDICT_COMPUTED"
  | "REVIEW_OPENED"
  | "REVIEW_DECIDED"
  | "SELF_EVALUATION_STARTED"
  | "SELF_EVALUATION_COMPLETED"
  | "CONFIGURATION_CHANGED"
  | "CORRECTION";

export interface RecordEventInput {
  actorType: ActorType;
  actorId: string;
  action: AuditAction;
  objectType: string;
  objectId: string;
  runId?: string;
  correlationId: string;
  previousState?: unknown;
  newState?: unknown;
  metadata?: Record<string, unknown>;
  result: "SUCCESS" | "FAILURE" | "BLOCKED" | "INFO";
  severity: "info" | "notice" | "warning" | "critical";
  correctsEventId?: string;
}

export async function recordAudit(
  db: Database,
  input: RecordEventInput,
): Promise<AuditEventRow> {
  const [row] = await db
    .insert(auditEvents)
    .values({
      id: newId("aud"),
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      objectType: input.objectType,
      objectId: input.objectId,
      runId: input.runId ?? null,
      correlationId: input.correlationId,
      previousState: input.previousState ?? null,
      newState: input.newState ?? null,
      metadata: input.metadata ?? {},
      result: input.result,
      severity: input.severity,
      correctsEventId: input.correctsEventId ?? null,
    })
    .returning();

  logger.debug("audit_event", {
    action: input.action,
    objectId: input.objectId,
    correlationId: input.correlationId,
  });
  return row as AuditEventRow;
}

/** Writes a correction as a NEW event referencing the original. */
export async function recordCorrection(
  db: Database,
  originalEventId: string,
  input: Omit<RecordEventInput, "action" | "correctsEventId">,
): Promise<AuditEventRow> {
  return recordAudit(db, { ...input, action: "CORRECTION", correctsEventId: originalEventId });
}

export interface AuditQuery {
  correlationId?: string;
  runId?: string;
  actorType?: ActorType;
  action?: string;
  objectType?: string;
  objectId?: string;
  severity?: Array<"info" | "notice" | "warning" | "critical">;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export async function queryAudit(db: Database, q: AuditQuery): Promise<AuditEventRow[]> {
  const conditions: SQL[] = [];
  if (q.correlationId) conditions.push(eq(auditEvents.correlationId, q.correlationId));
  if (q.runId) conditions.push(eq(auditEvents.runId, q.runId));
  if (q.actorType) conditions.push(eq(auditEvents.actorType, q.actorType));
  if (q.action) conditions.push(eq(auditEvents.action, q.action));
  if (q.objectType) conditions.push(eq(auditEvents.objectType, q.objectType));
  if (q.objectId) conditions.push(eq(auditEvents.objectId, q.objectId));
  if (q.severity && q.severity.length > 0) {
    conditions.push(inArray(auditEvents.severity, q.severity));
  }
  if (q.from) conditions.push(gte(auditEvents.timestamp, q.from));
  if (q.to) conditions.push(lte(auditEvents.timestamp, q.to));

  const base = db.select().from(auditEvents);
  const filtered = conditions.length > 0 ? base.where(and(...conditions)) : base;

  return filtered
    .orderBy(desc(auditEvents.sequence))
    .limit(Math.min(q.limit ?? 100, 500))
    .offset(q.offset ?? 0);
}
