import { route, intParam } from "@/api/handler";
import { queryAudit } from "@/audit/service";
import type { ActorType } from "@/db/schema";

export const dynamic = "force-dynamic";

export const GET = route(async ({ db, url }) => {
  const severityParam = url.searchParams.get("severity");
  const severity = severityParam
    ? (severityParam.split(",").filter((s) =>
        ["info", "notice", "warning", "critical"].includes(s),
      ) as Array<"info" | "notice" | "warning" | "critical">)
    : undefined;

  const events = await queryAudit(db, {
    ...(url.searchParams.get("runId") ? { runId: url.searchParams.get("runId")! } : {}),
    ...(url.searchParams.get("correlationId")
      ? { correlationId: url.searchParams.get("correlationId")! }
      : {}),
    ...(url.searchParams.get("action") ? { action: url.searchParams.get("action")! } : {}),
    ...(url.searchParams.get("actorType")
      ? { actorType: url.searchParams.get("actorType") as ActorType }
      : {}),
    ...(severity && severity.length > 0 ? { severity } : {}),
    limit: intParam(url, "limit", 100, 500),
    offset: intParam(url, "offset", 0, 100_000),
  });

  return {
    events,
    note: "Append-only at the application layer: rows are only ever inserted, and a correction is a new row referencing the original. This is not cryptographic tamper-evidence and does not defend against direct database access.",
  };
});
