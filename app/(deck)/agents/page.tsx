import { Bot, ShieldAlert, ShieldCheck } from "lucide-react";
import { getDb, runMigrations } from "@/db/client";
import { listAgents } from "@/agents/registry";
import { ADAPTER_DESCRIPTIONS } from "@/adapters/registry";
import { Empty, Panel } from "@/ui/primitives";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  await runMigrations();
  const db = await getDb();
  const agents = await listAgents(db);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Targets</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--color-phosphor-dim)]">
          The harness knows nothing about how a target is implemented. It hands an adapter a
          scenario briefing and a sandbox handle, and certifies what it observes. Registration
          rejects any adapter config that looks like an inline credential — the HTTP adapter takes
          the <span className="deck-readout">name</span> of an environment variable, never a token.
        </p>
      </div>

      <Panel title="Registered targets">
        {agents.length === 0 ? (
          <Empty
            title="No targets registered"
            detail="The two bundled reference agents are created by the seed script."
            command="npm run db:seed"
          />
        ) : (
          <ul className="space-y-2">
            {agents.map((a) => {
              const Icon =
                a.referenceKind === "safe"
                  ? ShieldCheck
                  : a.referenceKind === "vulnerable"
                    ? ShieldAlert
                    : Bot;
              const color =
                a.referenceKind === "safe"
                  ? "var(--color-verdict-pass)"
                  : a.referenceKind === "vulnerable"
                    ? "var(--color-verdict-fail)"
                    : "var(--color-signal)";
              return (
                <li key={a.id} className="rounded-sm border border-[var(--color-deck-line)] px-4 py-3">
                  <div className="flex items-start gap-3">
                    <Icon size={17} className="mt-0.5 shrink-0" style={{ color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="deck-readout text-sm text-[var(--color-phosphor)]">
                          {a.name}
                        </span>
                        <span className="deck-readout text-xs text-[var(--color-phosphor-faint)]">
                          v{a.version}
                        </span>
                        <span
                          className="deck-readout text-[0.65rem]"
                          style={{
                            color:
                              a.status === "HEALTHY"
                                ? "var(--color-verdict-pass)"
                                : a.status === "UNREACHABLE"
                                  ? "var(--color-verdict-fail)"
                                  : "var(--color-phosphor-faint)",
                          }}
                        >
                          {a.status}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-phosphor-dim)]">
                        {a.description}
                      </p>
                      {a.lastHealthDetail && (
                        <p className="deck-readout mt-1.5 text-[0.65rem] text-[var(--color-phosphor-faint)]">
                          health: {a.lastHealthDetail}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Adapter types">
        <dl className="space-y-3">
          {Object.entries(ADAPTER_DESCRIPTIONS).map(([type, description]) => (
            <div key={type}>
              <dt className="deck-readout text-xs text-[var(--color-signal)]">{type}</dt>
              <dd className="mt-0.5 text-xs leading-relaxed text-[var(--color-phosphor-dim)]">
                {description}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="Registering your own agent">
        <p className="text-xs leading-relaxed text-[var(--color-phosphor-dim)]">
          POST to <span className="deck-readout text-[var(--color-signal)]">/api/agents</span> with an
          HTTP adapter pointing at your service. Only hosts on{" "}
          <span className="deck-readout">ADAPTER_ALLOWED_HOSTS</span> are contacted, responses are
          size-capped and schema-validated, and redirects are refused outright.
        </p>
        <pre className="deck-readout mt-3 overflow-x-auto rounded-sm border border-[var(--color-deck-line)] bg-[var(--color-deck-void)] p-3 text-[0.7rem] leading-relaxed text-[var(--color-phosphor-dim)]">
{`curl -X POST http://localhost:3000/api/agents \\
  -H 'content-type: application/json' \\
  -d '{
    "name": "my-payment-agent",
    "version": "0.1.0",
    "adapterType": "http",
    "adapterConfig": {
      "endpoint": "http://127.0.0.1:9000/scenario",
      "authTokenEnvVar": "MY_AGENT_TOKEN"
    }
  }'`}
        </pre>
      </Panel>
    </div>
  );
}
