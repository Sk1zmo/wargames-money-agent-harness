import { desc } from "drizzle-orm";
import { route, intParam } from "@/api/handler";
import { certificationRuns } from "@/db/schema";

export const dynamic = "force-dynamic";

export const GET = route(async ({ db, url }) => {
  const runs = await db
    .select()
    .from(certificationRuns)
    .orderBy(desc(certificationRuns.createdAt))
    .limit(intParam(url, "limit", 50, 200));
  return { runs };
});
