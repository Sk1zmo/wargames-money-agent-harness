import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* -------------------------------------------------------------------------- */
/* Domain vocabularies                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Evaluation classes.
 *
 * The 14 required adversarial classes, plus BENIGN_CONTROL.
 *
 * BENIGN_CONTROL exists because a suite made entirely of attacks has a trivial
 * winning strategy: refuse everything. An agent that never acts passes every
 * safety check and would certify as perfectly safe while being perfectly
 * useless. Benign controls are scenarios where the correct behaviour is to
 * COMPLETE the task, so refuse-everything fails them - and they are also what
 * makes the false-alarm rate meaningful, since a false alarm is only
 * observable on a request that should have succeeded.
 */
export const ATTACK_CLASSES = [
  "PROMPT_INJECTION",
  "AUTHORITY_ESCALATION",
  "SPEND_CAP_BYPASS",
  "EXPIRED_AUTHORITY",
  "REVOKED_AUTHORITY",
  "MERCHANT_SUBSTITUTION",
  "DUPLICATE_REQUESTS",
  "API_TIMEOUT",
  "STALE_STATE",
  "WEBHOOK_DUPLICATION",
  "WEBHOOK_REORDERING",
  "HALLUCINATED_PAYMENT_SUCCESS",
  "UNSAFE_REFUNDS",
  "TOOL_MISUSE",
  "BENIGN_CONTROL",
] as const;
export type AttackClass = (typeof ATTACK_CLASSES)[number];

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Certification verdicts.
 *
 * INCONCLUSIVE is a distinct stored state (the evaluation could not complete
 * reliably) even though the UI folds it into the human-review queue. Collapsing
 * it at write time would destroy the distinction between "we could not tell"
 * and "we could tell but need a person".
 */
export type Verdict = "PASS" | "FAIL" | "CONDITIONAL" | "HUMAN_REVIEW" | "INCONCLUSIVE";

export type JudgeClassification = "SAFE" | "UNSAFE" | "UNCERTAIN";

export type JudgeMode = "model" | "rubric" | "unavailable";

export type RunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "CANCELLED" | "ERRORED";

export type ExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "TIMEOUT"
  | "ADAPTER_ERROR"
  | "JUDGE_ERROR";

export type AdapterType = "reference-safe" | "reference-vulnerable" | "http";

export type AgentStatus = "REGISTERED" | "HEALTHY" | "UNREACHABLE" | "RETIRED";

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "ESCALATED";

export type ActorType = "USER" | "SYSTEM" | "HARNESS" | "JUDGE" | "REVIEWER" | "TARGET_AGENT";

export type PaymentState =
  | "CREATED"
  | "AUTHORIZED"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "REFUNDED"
  | "UNKNOWN";

export type AuthorityState = "ACTIVE" | "EXPIRED" | "REVOKED" | "LIMITED";

export type SuiteSplit = "development" | "held-out";

/* -------------------------------------------------------------------------- */
/* target_agents                                                              */
/* -------------------------------------------------------------------------- */

export const targetAgents = pgTable(
  "target_agents",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Agent version. A change invalidates prior certification. */
    version: text("version").notNull(),
    adapterType: text("adapter_type").$type<AdapterType>().notNull(),
    adapterVersion: text("adapter_version").notNull(),
    /** Never contains secrets: tokens live in env, referenced by name only. */
    adapterConfig: jsonb("adapter_config").$type<Record<string, unknown>>().notNull().default({}),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    status: text("status").$type<AgentStatus>().notNull().default("REGISTERED"),
    /** True for the two bundled reference agents used for self-evaluation. */
    isReference: boolean("is_reference").notNull().default(false),
    /** Set only on reference agents: the behaviour they are built to exhibit. */
    referenceKind: text("reference_kind").$type<"safe" | "vulnerable" | null>(),
    description: text("description").notNull().default(""),
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
    lastHealthDetail: text("last_health_detail"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("target_agents_name_version_idx").on(t.name, t.version),
    index("target_agents_status_idx").on(t.status),
    index("target_agents_reference_idx").on(t.isReference),
  ],
);

/* -------------------------------------------------------------------------- */
/* scenario_suites + scenarios                                                */
/* -------------------------------------------------------------------------- */

export const scenarioSuites = pgTable(
  "scenario_suites",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    split: text("split").$type<SuiteSplit>().notNull(),
    seed: integer("seed").notNull(),
    description: text("description").notNull().default(""),
    scenarioCount: integer("scenario_count").notNull().default(0),
    generatorVersion: text("generator_version").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("scenario_suites_name_version_idx").on(t.name, t.version),
    index("scenario_suites_split_idx").on(t.split),
  ],
);

export const scenarios = pgTable(
  "scenarios",
  {
    id: text("id").primaryKey(),
    suiteId: text("suite_id")
      .notNull()
      .references(() => scenarioSuites.id, { onDelete: "cascade" }),
    attackClass: text("attack_class").$type<AttackClass>().notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    riskLevel: text("risk_level").$type<RiskLevel>().notNull(),
    version: text("version").notNull(),
    seed: integer("seed").notNull(),
    split: text("split").$type<SuiteSplit>().notNull(),
    /** Sandbox world state the target is shown before acting. */
    environmentState: jsonb("environment_state").$type<unknown>().notNull(),
    authorityState: jsonb("authority_state").$type<unknown>().notNull(),
    preconditions: jsonb("preconditions").$type<string[]>().notNull().default([]),
    /** The instruction handed to the target, including any injected content. */
    prompt: text("prompt").notNull(),
    expectedSafeBehavior: jsonb("expected_safe_behavior").$type<string[]>().notNull().default([]),
    prohibitedBehavior: jsonb("prohibited_behavior").$type<string[]>().notNull().default([]),
    allowedActions: jsonb("allowed_actions").$type<string[]>().notNull().default([]),
    prohibitedActions: jsonb("prohibited_actions").$type<string[]>().notNull().default([]),
    /** Verdict a correctly-behaving agent should earn on this scenario. */
    expectedVerdict: text("expected_verdict").$type<Verdict>().notNull(),
    evidenceRequirements: jsonb("evidence_requirements").$type<string[]>().notNull().default([]),
    /** Named deterministic checks the verdict engine must run for this case. */
    deterministicChecks: jsonb("deterministic_checks").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [
    index("scenarios_suite_idx").on(t.suiteId),
    index("scenarios_class_idx").on(t.attackClass),
    index("scenarios_split_idx").on(t.split),
    index("scenarios_risk_idx").on(t.riskLevel),
  ],
);

/* -------------------------------------------------------------------------- */
/* certification_runs                                                          */
/* -------------------------------------------------------------------------- */

export const certificationRuns = pgTable(
  "certification_runs",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => targetAgents.id, { onDelete: "cascade" }),
    /** Snapshotted so a later agent edit cannot rewrite what was certified. */
    agentVersion: text("agent_version").notNull(),
    adapterVersion: text("adapter_version").notNull(),
    suiteId: text("suite_id")
      .notNull()
      .references(() => scenarioSuites.id, { onDelete: "restrict" }),
    suiteVersion: text("suite_version").notNull(),
    engineVersion: text("engine_version").notNull(),
    judgeMode: text("judge_mode").$type<JudgeMode>().notNull(),
    judgeModel: text("judge_model").notNull(),
    judgeConfidenceThreshold: real("judge_confidence_threshold").notNull(),
    seed: integer("seed").notNull(),
    repetitions: integer("repetitions").notNull().default(1),
    /** Binds every version that shaped this result into one value. */
    fingerprint: text("fingerprint").notNull(),
    status: text("status").$type<RunStatus>().notNull().default("QUEUED"),
    /** Null until the run completes; never written for an unfinished run. */
    overallVerdict: text("overall_verdict").$type<Verdict>(),
    overallScore: real("overall_score"),
    scenarioTotal: integer("scenario_total").notNull().default(0),
    scenarioCompleted: integer("scenario_completed").notNull().default(0),
    classScores: jsonb("class_scores").$type<unknown>().notNull().default({}),
    summary: jsonb("summary").$type<unknown>().notNull().default({}),
    /** Set when this run replays an earlier one. Replay never mutates the original. */
    replayOfRunId: text("replay_of_run_id"),
    harnessMode: text("harness_mode").notNull(),
    correlationId: text("correlation_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms").notNull().default(0),
    errorDetail: text("error_detail"),
    createdAt: createdAt(),
  },
  (t) => [
    index("certification_runs_agent_idx").on(t.agentId),
    index("certification_runs_status_idx").on(t.status),
    index("certification_runs_fingerprint_idx").on(t.fingerprint),
    index("certification_runs_created_idx").on(t.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* scenario_executions                                                         */
/* -------------------------------------------------------------------------- */

export const scenarioExecutions = pgTable(
  "scenario_executions",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => certificationRuns.id, { onDelete: "cascade" }),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "restrict" }),
    attackClass: text("attack_class").$type<AttackClass>().notNull(),
    /** 1-based trial index when repetitions > 1. */
    trial: integer("trial").notNull().default(1),
    status: text("status").$type<ExecutionStatus>().notNull().default("PENDING"),
    verdict: text("verdict").$type<Verdict>(),
    expectedVerdict: text("expected_verdict").$type<Verdict>().notNull(),
    /** True when the observed verdict matched what the scenario expected. */
    matchedExpectation: boolean("matched_expectation"),
    simulatorStateBefore: jsonb("simulator_state_before").$type<unknown>(),
    simulatorStateAfter: jsonb("simulator_state_after").$type<unknown>(),
    deterministicChecks: jsonb("deterministic_checks").$type<unknown>().notNull().default([]),
    verdictReasons: jsonb("verdict_reasons").$type<string[]>().notNull().default([]),
    targetLatencyMs: integer("target_latency_ms").notNull().default(0),
    judgeLatencyMs: integer("judge_latency_ms").notNull().default(0),
    totalLatencyMs: integer("total_latency_ms").notNull().default(0),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    correlationId: text("correlation_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("scenario_executions_run_idx").on(t.runId),
    index("scenario_executions_scenario_idx").on(t.scenarioId),
    index("scenario_executions_verdict_idx").on(t.verdict),
    index("scenario_executions_class_idx").on(t.attackClass),
    uniqueIndex("scenario_executions_run_scenario_trial_idx").on(t.runId, t.scenarioId, t.trial),
  ],
);

/* -------------------------------------------------------------------------- */
/* agent_responses                                                             */
/* -------------------------------------------------------------------------- */

export const agentResponses = pgTable(
  "agent_responses",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id")
      .notNull()
      .references(() => scenarioExecutions.id, { onDelete: "cascade" }),
    /** Free-form text the target produced. Treated as untrusted data. */
    responseText: text("response_text").notNull().default(""),
    /** Structured tool calls the target requested inside the sandbox. */
    toolCalls: jsonb("tool_calls").$type<unknown[]>().notNull().default([]),
    /** Whether the agent explicitly refused or escalated. */
    refused: boolean("refused").notNull().default(false),
    escalatedToHuman: boolean("escalated_to_human").notNull().default(false),
    /** Payment outcome the agent CLAIMED, which may differ from simulator truth. */
    claimedPaymentState: text("claimed_payment_state"),
    responseHash: text("response_hash").notNull(),
    truncated: boolean("truncated").notNull().default(false),
    adapterMetadata: jsonb("adapter_metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("agent_responses_execution_idx").on(t.executionId)],
);

/* -------------------------------------------------------------------------- */
/* judgments                                                                   */
/* -------------------------------------------------------------------------- */

export const judgments = pgTable(
  "judgments",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id")
      .notNull()
      .references(() => scenarioExecutions.id, { onDelete: "cascade" }),
    mode: text("mode").$type<JudgeMode>().notNull(),
    provider: text("provider").notNull().default("deterministic"),
    model: text("model").notNull().default("none"),
    promptVersion: text("prompt_version").notNull().default("n/a"),
    classification: text("classification").$type<JudgeClassification>(),
    confidence: real("confidence"),
    violations: jsonb("violations").$type<string[]>().notNull().default([]),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
    reasoningSummary: text("reasoning_summary").notNull().default(""),
    recommendedVerdict: text("recommended_verdict").$type<Verdict>(),
    /** Raw model text retained for the Scenario Detail page and debugging. */
    rawOutput: text("raw_output"),
    parseAttempts: integer("parse_attempts").notNull().default(0),
    schemaValid: boolean("schema_valid").notNull().default(false),
    latencyMs: integer("latency_ms").notNull().default(0),
    errorCode: text("error_code"),
    createdAt: createdAt(),
  },
  (t) => [
    index("judgments_execution_idx").on(t.executionId),
    index("judgments_mode_idx").on(t.mode),
    index("judgments_classification_idx").on(t.classification),
  ],
);

/* -------------------------------------------------------------------------- */
/* evidence                                                                    */
/* -------------------------------------------------------------------------- */

export const evidence = pgTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id")
      .notNull()
      .references(() => scenarioExecutions.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull(),
    kind: text("kind")
      .$type<
        | "SCENARIO_INPUT"
        | "AGENT_RESPONSE"
        | "TOOL_CALL"
        | "SIMULATOR_STATE"
        | "AUTHORITY_STATE"
        | "DETERMINISTIC_CHECK"
        | "JUDGE_OUTPUT"
        | "WEBHOOK_SEQUENCE"
        | "VERDICT_RATIONALE"
      >()
      .notNull(),
    label: text("label").notNull(),
    /** Human-readable statement of what this evidence shows. */
    summary: text("summary").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    payloadHash: text("payload_hash").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("evidence_execution_idx").on(t.executionId),
    index("evidence_run_idx").on(t.runId),
    index("evidence_kind_idx").on(t.kind),
  ],
);

/* -------------------------------------------------------------------------- */
/* human_reviews                                                               */
/* -------------------------------------------------------------------------- */

export const humanReviews = pgTable(
  "human_reviews",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id")
      .notNull()
      .references(() => scenarioExecutions.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull(),
    scenarioId: text("scenario_id").notNull(),
    /** The machine verdict, preserved verbatim and never overwritten. */
    machineVerdict: text("machine_verdict").$type<Verdict>().notNull(),
    machineReasons: jsonb("machine_reasons").$type<string[]>().notNull().default([]),
    reasonCode: text("reason_code").notNull(),
    reasonDetail: text("reason_detail").notNull(),
    status: text("status").$type<ReviewStatus>().notNull().default("PENDING"),
    /** Reviewer's verdict, stored ALONGSIDE the machine verdict, not over it. */
    reviewerVerdict: text("reviewer_verdict").$type<Verdict>(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerNote: text("reviewer_note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("human_reviews_status_idx").on(t.status),
    index("human_reviews_run_idx").on(t.runId),
    uniqueIndex("human_reviews_execution_idx").on(t.executionId),
  ],
);

/* -------------------------------------------------------------------------- */
/* audit_events                                                                */
/* -------------------------------------------------------------------------- */

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    sequence: bigserial("sequence", { mode: "number" }).notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    actorType: text("actor_type").$type<ActorType>().notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id").notNull(),
    runId: text("run_id"),
    correlationId: text("correlation_id").notNull(),
    /** Previous and new state for any verdict or status change. */
    previousState: jsonb("previous_state").$type<unknown>(),
    newState: jsonb("new_state").$type<unknown>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    result: text("result").$type<"SUCCESS" | "FAILURE" | "BLOCKED" | "INFO">().notNull(),
    severity: text("severity").$type<"info" | "notice" | "warning" | "critical">().notNull(),
    /** Corrections are new rows referencing the original; history is never edited. */
    correctsEventId: text("corrects_event_id"),
  },
  (t) => [
    index("audit_events_correlation_idx").on(t.correlationId),
    index("audit_events_object_idx").on(t.objectType, t.objectId),
    index("audit_events_action_idx").on(t.action),
    index("audit_events_run_idx").on(t.runId),
    index("audit_events_time_idx").on(t.timestamp),
    index("audit_events_severity_idx").on(t.severity),
  ],
);

/* -------------------------------------------------------------------------- */
/* harness self-evaluation                                                     */
/* -------------------------------------------------------------------------- */

export const evaluationRuns = pgTable(
  "evaluation_runs",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    split: text("split").$type<SuiteSplit>().notNull(),
    suiteId: text("suite_id").notNull(),
    suiteVersion: text("suite_version").notNull(),
    engineVersion: text("engine_version").notNull(),
    judgeMode: text("judge_mode").$type<JudgeMode>().notNull(),
    judgeModel: text("judge_model").notNull(),
    seed: integer("seed").notNull(),
    repetitions: integer("repetitions").notNull().default(1),
    /** Certification run against the known-vulnerable reference agent. */
    vulnerableRunId: text("vulnerable_run_id"),
    /** Certification run against the known-safe reference agent. */
    safeRunId: text("safe_run_id"),
    /** Every metric below is computed from those two runs, never assumed. */
    metrics: jsonb("metrics").$type<unknown>().notNull(),
    /** Interval estimates when the Python service is reachable, else null. */
    statistics: jsonb("statistics").$type<unknown>(),
    statisticsSource: text("statistics_source").$type<"python-service" | "unavailable">().notNull(),
    notes: text("notes").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms").notNull().default(0),
  },
  (t) => [
    index("evaluation_runs_started_idx").on(t.startedAt),
    index("evaluation_runs_split_idx").on(t.split),
  ],
);

export const evaluationCases = pgTable(
  "evaluation_cases",
  {
    id: text("id").primaryKey(),
    evaluationRunId: text("evaluation_run_id")
      .notNull()
      .references(() => evaluationRuns.id, { onDelete: "cascade" }),
    scenarioId: text("scenario_id").notNull(),
    attackClass: text("attack_class").$type<AttackClass>().notNull(),
    /** Which reference agent this case measured. */
    referenceKind: text("reference_kind").$type<"safe" | "vulnerable">().notNull(),
    expectedVerdict: text("expected_verdict").$type<Verdict>().notNull(),
    observedVerdict: text("observed_verdict").$type<Verdict>().notNull(),
    /** For the vulnerable agent: did the harness catch the unsafe behaviour? */
    detected: boolean("detected"),
    /** For the safe agent: did the harness raise a false alarm? */
    falseAlarm: boolean("false_alarm"),
    judgeClassification: text("judge_classification").$type<JudgeClassification>(),
    latencyMs: integer("latency_ms").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("evaluation_cases_run_idx").on(t.evaluationRunId),
    index("evaluation_cases_kind_idx").on(t.referenceKind),
    index("evaluation_cases_class_idx").on(t.attackClass),
  ],
);

/* -------------------------------------------------------------------------- */
/* simulator persistence                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Simulated payments.
 *
 * Every row carries `simulated: true` and a harness mode. Nothing in this table
 * corresponds to real money, and the column exists so a reader inspecting the
 * database directly cannot mistake it for a payments ledger.
 */
export const simulatedPayments = pgTable(
  "simulated_payments",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id").notNull(),
    runId: text("run_id").notNull(),
    merchantId: text("merchant_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("INR"),
    state: text("state").$type<PaymentState>().notNull(),
    /** Idempotency key supplied by the agent's tool call, when it supplied one. */
    idempotencyKey: text("idempotency_key"),
    simulated: boolean("simulated").notNull().default(true),
    harnessMode: text("harness_mode").notNull(),
    transitions: jsonb("transitions").$type<unknown[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("simulated_payments_execution_idx").on(t.executionId),
    index("simulated_payments_state_idx").on(t.state),
    uniqueIndex("simulated_payments_exec_idem_idx").on(t.executionId, t.idempotencyKey),
  ],
);

export const simulatedWebhookEvents = pgTable(
  "simulated_webhook_events",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    paymentId: text("payment_id"),
    /** Delivery index, so reordering scenarios can assert what arrived when. */
    deliverySequence: integer("delivery_sequence").notNull(),
    /** Logical order the provider intended, which may differ from delivery. */
    logicalSequence: integer("logical_sequence").notNull(),
    signatureValid: boolean("signature_valid").notNull(),
    duplicateOf: text("duplicate_of"),
    payload: jsonb("payload").$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("simulated_webhooks_execution_idx").on(t.executionId),
    uniqueIndex("simulated_webhooks_exec_event_seq_idx").on(
      t.executionId,
      t.providerEventId,
      t.deliverySequence,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                   */
/* -------------------------------------------------------------------------- */

export const targetAgentsRelations = relations(targetAgents, ({ many }) => ({
  runs: many(certificationRuns),
}));

export const scenarioSuitesRelations = relations(scenarioSuites, ({ many }) => ({
  scenarios: many(scenarios),
  runs: many(certificationRuns),
}));

export const scenariosRelations = relations(scenarios, ({ one, many }) => ({
  suite: one(scenarioSuites, {
    fields: [scenarios.suiteId],
    references: [scenarioSuites.id],
  }),
  executions: many(scenarioExecutions),
}));

export const certificationRunsRelations = relations(certificationRuns, ({ one, many }) => ({
  agent: one(targetAgents, {
    fields: [certificationRuns.agentId],
    references: [targetAgents.id],
  }),
  suite: one(scenarioSuites, {
    fields: [certificationRuns.suiteId],
    references: [scenarioSuites.id],
  }),
  executions: many(scenarioExecutions),
}));

export const scenarioExecutionsRelations = relations(scenarioExecutions, ({ one, many }) => ({
  run: one(certificationRuns, {
    fields: [scenarioExecutions.runId],
    references: [certificationRuns.id],
  }),
  scenario: one(scenarios, {
    fields: [scenarioExecutions.scenarioId],
    references: [scenarios.id],
  }),
  response: one(agentResponses),
  judgment: one(judgments),
  evidenceItems: many(evidence),
  review: one(humanReviews),
}));

export const agentResponsesRelations = relations(agentResponses, ({ one }) => ({
  execution: one(scenarioExecutions, {
    fields: [agentResponses.executionId],
    references: [scenarioExecutions.id],
  }),
}));

export const judgmentsRelations = relations(judgments, ({ one }) => ({
  execution: one(scenarioExecutions, {
    fields: [judgments.executionId],
    references: [scenarioExecutions.id],
  }),
}));

export const evidenceRelations = relations(evidence, ({ one }) => ({
  execution: one(scenarioExecutions, {
    fields: [evidence.executionId],
    references: [scenarioExecutions.id],
  }),
}));

export const humanReviewsRelations = relations(humanReviews, ({ one }) => ({
  execution: one(scenarioExecutions, {
    fields: [humanReviews.executionId],
    references: [scenarioExecutions.id],
  }),
}));

export const evaluationRunsRelations = relations(evaluationRuns, ({ many }) => ({
  cases: many(evaluationCases),
}));

export const evaluationCasesRelations = relations(evaluationCases, ({ one }) => ({
  run: one(evaluationRuns, {
    fields: [evaluationCases.evaluationRunId],
    references: [evaluationRuns.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/* Inferred row types                                                          */
/* -------------------------------------------------------------------------- */

export type TargetAgent = typeof targetAgents.$inferSelect;
export type NewTargetAgent = typeof targetAgents.$inferInsert;
export type ScenarioSuite = typeof scenarioSuites.$inferSelect;
export type ScenarioRow = typeof scenarios.$inferSelect;
export type NewScenarioRow = typeof scenarios.$inferInsert;
export type CertificationRun = typeof certificationRuns.$inferSelect;
export type ScenarioExecution = typeof scenarioExecutions.$inferSelect;
export type AgentResponseRow = typeof agentResponses.$inferSelect;
export type JudgmentRow = typeof judgments.$inferSelect;
export type EvidenceRow = typeof evidence.$inferSelect;
export type HumanReviewRow = typeof humanReviews.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type EvaluationRunRow = typeof evaluationRuns.$inferSelect;
export type EvaluationCaseRow = typeof evaluationCases.$inferSelect;
export type SimulatedPaymentRow = typeof simulatedPayments.$inferSelect;
export type SimulatedWebhookRow = typeof simulatedWebhookEvents.$inferSelect;
