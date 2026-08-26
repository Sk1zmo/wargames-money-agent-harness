import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { ensureBootstrapped } from "@/db/bootstrap";
import { healthCheckAgent } from "@/agents/registry";
import { newCorrelationId } from "@/shared/ids";
import { jsonError } from "@/api/handler";

export const dynamic = "force-dynamic";

/** Runs the adapter's real health check and records whatever it returns. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId = newCorrelationId();
  try {
    const { id } = await context.params;
    await ensureBootstrapped();
    const db = await getDb();
    const health = await healthCheckAgent(db, id, correlationId);
    return NextResponse.json({ agentId: id, ...health });
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
