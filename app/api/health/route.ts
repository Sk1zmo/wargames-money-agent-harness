import { route } from "@/api/handler";
import { currentDriver } from "@/db/client";
import { environmentStatus } from "@/shared/env";
import { ENGINE_VERSION } from "@/evaluation/certification";
import { ADAPTER_CONTRACT_VERSION } from "@/adapters/contract";
import { GENERATOR_VERSION } from "@/scenarios/generator";

export const dynamic = "force-dynamic";

/**
 * Liveness plus the facts an operator needs before trusting anything else the
 * service says: which mode it is in, whether live money is reachable (it is
 * not, structurally), and which component versions produced any verdict.
 */
export const GET = route(async () => {
  const status = environmentStatus();
  return {
    ok: true,
    ...status,
    dbDriver: await currentDriver(),
    versions: {
      engine: ENGINE_VERSION,
      adapterContract: ADAPTER_CONTRACT_VERSION,
      scenarioGenerator: GENERATOR_VERSION,
    },
  };
});
