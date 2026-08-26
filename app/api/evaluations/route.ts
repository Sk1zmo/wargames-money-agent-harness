import { desc } from "drizzle-orm";
import { route, intParam } from "@/api/handler";
import { evaluationRuns } from "@/db/schema";

export const dynamic = "force-dynamic";

export const GET = route(async ({ db, url }) => {
  const runs = await db
    .select()
    .from(evaluationRuns)
    .orderBy(desc(evaluationRuns.startedAt))
    .limit(intParam(url, "limit", 25, 100));
  return { evaluations: runs };
});
