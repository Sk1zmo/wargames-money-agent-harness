CREATE TABLE "agent_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"response_text" text DEFAULT '' NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"refused" boolean DEFAULT false NOT NULL,
	"escalated_to_human" boolean DEFAULT false NOT NULL,
	"claimed_payment_state" text,
	"response_hash" text NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"adapter_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence" bigserial NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text NOT NULL,
	"run_id" text,
	"correlation_id" text NOT NULL,
	"previous_state" jsonb,
	"new_state" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" text NOT NULL,
	"severity" text NOT NULL,
	"corrects_event_id" text
);
--> statement-breakpoint
CREATE TABLE "certification_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"agent_version" text NOT NULL,
	"adapter_version" text NOT NULL,
	"suite_id" text NOT NULL,
	"suite_version" text NOT NULL,
	"engine_version" text NOT NULL,
	"judge_mode" text NOT NULL,
	"judge_model" text NOT NULL,
	"judge_confidence_threshold" real NOT NULL,
	"seed" integer NOT NULL,
	"repetitions" integer DEFAULT 1 NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"overall_verdict" text,
	"overall_score" real,
	"scenario_total" integer DEFAULT 0 NOT NULL,
	"scenario_completed" integer DEFAULT 0 NOT NULL,
	"class_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"replay_of_run_id" text,
	"harness_mode" text NOT NULL,
	"correlation_id" text NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"error_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"evaluation_run_id" text NOT NULL,
	"scenario_id" text NOT NULL,
	"attack_class" text NOT NULL,
	"reference_kind" text NOT NULL,
	"expected_verdict" text NOT NULL,
	"observed_verdict" text NOT NULL,
	"detected" boolean,
	"false_alarm" boolean,
	"judge_classification" text,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"split" text NOT NULL,
	"suite_id" text NOT NULL,
	"suite_version" text NOT NULL,
	"engine_version" text NOT NULL,
	"judge_mode" text NOT NULL,
	"judge_model" text NOT NULL,
	"seed" integer NOT NULL,
	"repetitions" integer DEFAULT 1 NOT NULL,
	"vulnerable_run_id" text,
	"safe_run_id" text,
	"metrics" jsonb NOT NULL,
	"statistics" jsonb,
	"statistics_source" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"run_id" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"run_id" text NOT NULL,
	"scenario_id" text NOT NULL,
	"machine_verdict" text NOT NULL,
	"machine_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason_code" text NOT NULL,
	"reason_detail" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reviewer_verdict" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"reviewer_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judgments" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"mode" text NOT NULL,
	"provider" text DEFAULT 'deterministic' NOT NULL,
	"model" text DEFAULT 'none' NOT NULL,
	"prompt_version" text DEFAULT 'n/a' NOT NULL,
	"classification" text,
	"confidence" real,
	"violations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasoning_summary" text DEFAULT '' NOT NULL,
	"recommended_verdict" text,
	"raw_output" text,
	"parse_attempts" integer DEFAULT 0 NOT NULL,
	"schema_valid" boolean DEFAULT false NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"scenario_id" text NOT NULL,
	"attack_class" text NOT NULL,
	"trial" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"verdict" text,
	"expected_verdict" text NOT NULL,
	"matched_expectation" boolean,
	"simulator_state_before" jsonb,
	"simulator_state_after" jsonb,
	"deterministic_checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verdict_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_latency_ms" integer DEFAULT 0 NOT NULL,
	"judge_latency_ms" integer DEFAULT 0 NOT NULL,
	"total_latency_ms" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_detail" text,
	"correlation_id" text NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_suites" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"split" text NOT NULL,
	"seed" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"scenario_count" integer DEFAULT 0 NOT NULL,
	"generator_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"suite_id" text NOT NULL,
	"attack_class" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"risk_level" text NOT NULL,
	"version" text NOT NULL,
	"seed" integer NOT NULL,
	"split" text NOT NULL,
	"environment_state" jsonb NOT NULL,
	"authority_state" jsonb NOT NULL,
	"preconditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prompt" text NOT NULL,
	"expected_safe_behavior" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prohibited_behavior" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prohibited_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expected_verdict" text NOT NULL,
	"evidence_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deterministic_checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulated_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"run_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"state" text NOT NULL,
	"idempotency_key" text,
	"simulated" boolean DEFAULT true NOT NULL,
	"harness_mode" text NOT NULL,
	"transitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulated_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payment_id" text,
	"delivery_sequence" integer NOT NULL,
	"logical_sequence" integer NOT NULL,
	"signature_valid" boolean NOT NULL,
	"duplicate_of" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "target_agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"adapter_type" text NOT NULL,
	"adapter_version" text NOT NULL,
	"adapter_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'REGISTERED' NOT NULL,
	"is_reference" boolean DEFAULT false NOT NULL,
	"reference_kind" text,
	"description" text DEFAULT '' NOT NULL,
	"last_health_check_at" timestamp with time zone,
	"last_health_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_responses" ADD CONSTRAINT "agent_responses_execution_id_scenario_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."scenario_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_runs" ADD CONSTRAINT "certification_runs_agent_id_target_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."target_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certification_runs" ADD CONSTRAINT "certification_runs_suite_id_scenario_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."scenario_suites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_cases" ADD CONSTRAINT "evaluation_cases_evaluation_run_id_evaluation_runs_id_fk" FOREIGN KEY ("evaluation_run_id") REFERENCES "public"."evaluation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_execution_id_scenario_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."scenario_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_reviews" ADD CONSTRAINT "human_reviews_execution_id_scenario_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."scenario_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judgments" ADD CONSTRAINT "judgments_execution_id_scenario_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."scenario_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_executions" ADD CONSTRAINT "scenario_executions_run_id_certification_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."certification_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_executions" ADD CONSTRAINT "scenario_executions_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_suite_id_scenario_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."scenario_suites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_responses_execution_idx" ON "agent_responses" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "audit_events_object_idx" ON "audit_events" USING btree ("object_type","object_id");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_events_run_idx" ON "audit_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "audit_events_time_idx" ON "audit_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_events_severity_idx" ON "audit_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "certification_runs_agent_idx" ON "certification_runs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "certification_runs_status_idx" ON "certification_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "certification_runs_fingerprint_idx" ON "certification_runs" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "certification_runs_created_idx" ON "certification_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "evaluation_cases_run_idx" ON "evaluation_cases" USING btree ("evaluation_run_id");--> statement-breakpoint
CREATE INDEX "evaluation_cases_kind_idx" ON "evaluation_cases" USING btree ("reference_kind");--> statement-breakpoint
CREATE INDEX "evaluation_cases_class_idx" ON "evaluation_cases" USING btree ("attack_class");--> statement-breakpoint
CREATE INDEX "evaluation_runs_started_idx" ON "evaluation_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "evaluation_runs_split_idx" ON "evaluation_runs" USING btree ("split");--> statement-breakpoint
CREATE INDEX "evidence_execution_idx" ON "evidence" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "evidence_run_idx" ON "evidence" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "evidence_kind_idx" ON "evidence" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "human_reviews_status_idx" ON "human_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "human_reviews_run_idx" ON "human_reviews" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "human_reviews_execution_idx" ON "human_reviews" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "judgments_execution_idx" ON "judgments" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "judgments_mode_idx" ON "judgments" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "judgments_classification_idx" ON "judgments" USING btree ("classification");--> statement-breakpoint
CREATE INDEX "scenario_executions_run_idx" ON "scenario_executions" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "scenario_executions_scenario_idx" ON "scenario_executions" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "scenario_executions_verdict_idx" ON "scenario_executions" USING btree ("verdict");--> statement-breakpoint
CREATE INDEX "scenario_executions_class_idx" ON "scenario_executions" USING btree ("attack_class");--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_executions_run_scenario_trial_idx" ON "scenario_executions" USING btree ("run_id","scenario_id","trial");--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_suites_name_version_idx" ON "scenario_suites" USING btree ("name","version");--> statement-breakpoint
CREATE INDEX "scenario_suites_split_idx" ON "scenario_suites" USING btree ("split");--> statement-breakpoint
CREATE INDEX "scenarios_suite_idx" ON "scenarios" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "scenarios_class_idx" ON "scenarios" USING btree ("attack_class");--> statement-breakpoint
CREATE INDEX "scenarios_split_idx" ON "scenarios" USING btree ("split");--> statement-breakpoint
CREATE INDEX "scenarios_risk_idx" ON "scenarios" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "simulated_payments_execution_idx" ON "simulated_payments" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "simulated_payments_state_idx" ON "simulated_payments" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "simulated_payments_exec_idem_idx" ON "simulated_payments" USING btree ("execution_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "simulated_webhooks_execution_idx" ON "simulated_webhook_events" USING btree ("execution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "simulated_webhooks_exec_event_seq_idx" ON "simulated_webhook_events" USING btree ("execution_id","provider_event_id","delivery_sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "target_agents_name_version_idx" ON "target_agents" USING btree ("name","version");--> statement-breakpoint
CREATE INDEX "target_agents_status_idx" ON "target_agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "target_agents_reference_idx" ON "target_agents" USING btree ("is_reference");