import { z } from "zod";
import { bodyRoute, route } from "@/api/handler";
import { listAgents, registerAgent } from "@/agents/registry";
import { ADAPTER_DESCRIPTIONS } from "@/adapters/registry";

export const dynamic = "force-dynamic";

export const GET = route(async ({ db }) => {
  const agents = await listAgents(db);
  return { agents, adapterDescriptions: ADAPTER_DESCRIPTIONS };
});

/**
 * Registers a target.
 *
 * `adapterConfig` may name an environment variable holding a credential
 * (`authTokenEnvVar`) but may never carry the credential itself; the registry
 * rejects anything that looks like an inline secret rather than storing it.
 */
const RegisterSchema = z.object({
  name: z.string().min(1).max(120),
  version: z.string().min(1).max(60),
  adapterType: z.enum(["reference-safe", "reference-vulnerable", "http"]),
  adapterConfig: z.record(z.string(), z.unknown()).optional(),
  description: z.string().max(2000).optional(),
  capabilities: z.array(z.string().max(80)).max(50).optional(),
});

export const POST = bodyRoute(RegisterSchema, async ({ db, correlationId }, body) => {
  const agent = await registerAgent(db, { ...body, correlationId });
  return { agent };
});
