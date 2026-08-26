import { route } from "@/api/handler";
import { listReviews, reviewCounts } from "@/reviews/service";
import type { ReviewStatus } from "@/db/schema";

export const dynamic = "force-dynamic";

export const GET = route(async ({ db, url }) => {
  const status = url.searchParams.get("status") as ReviewStatus | null;
  const runId = url.searchParams.get("runId");
  const reviews = await listReviews(db, {
    ...(status ? { status } : {}),
    ...(runId ? { runId } : {}),
  });
  return { reviews, counts: await reviewCounts(db) };
});
