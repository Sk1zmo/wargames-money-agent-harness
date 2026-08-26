import { getDb } from "@/db/client";
import { ensureBootstrapped } from "@/db/bootstrap";
import { queryAudit } from "@/audit/service";
import { Empty, Panel } from "@/ui/primitives";

export const dynamic = "force-dynamic";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--color-verdict-fail)",
  warning: "var(--color-verdict-conditional)",
  notice: "var(--color-signal)",
  info: "var(--color-phosphor-faint)",
};

export default async function AuditPage() {
  await ensureBootstrapped();
  const db = await getDb();
  const events = await queryAudit(db, { limit: 200 });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit trail</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--color-phosphor-dim)]">
          Rows are only ever inserted; a correction is a new row referencing the original, and
          nothing is updated or deleted.
        </p>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[var(--color-verdict-conditional)]">
          On the guarantee actually provided: this is append-only <em>by construction in the
          application layer</em>. It is not hash-chained, not cryptographically tamper-evident, and
          offers no defence against someone with direct database access. Saying otherwise would
          claim a property the storage does not have.
        </p>
      </div>

      <Panel title="Events" subtitle={`${events.length} most recent`}>
        {events.length === 0 ? (
          <Empty
            title="No audit events"
            detail="Events are written when agents are registered, certifications run, verdicts are computed and reviews are decided."
            command="npm run db:seed"
          />
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[54rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-deck-line)] text-left">
                  <th className="deck-label px-4 pb-2 font-normal">Seq</th>
                  <th className="deck-label px-4 pb-2 font-normal">Time</th>
                  <th className="deck-label px-4 pb-2 font-normal">Actor</th>
                  <th className="deck-label px-4 pb-2 font-normal">Action</th>
                  <th className="deck-label px-4 pb-2 font-normal">Object</th>
                  <th className="deck-label px-4 pb-2 font-normal">Result</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-[var(--color-deck-line)] last:border-0 align-top hover:bg-[var(--color-deck-raised)]"
                  >
                    <td className="deck-readout px-4 py-2 text-xs text-[var(--color-phosphor-faint)]">
                      {String(e.sequence)}
                    </td>
                    <td className="deck-readout px-4 py-2 text-xs text-[var(--color-phosphor-faint)]">
                      {new Date(e.timestamp).toISOString().slice(11, 19)}
                    </td>
                    <td className="deck-readout px-4 py-2 text-xs text-[var(--color-phosphor-dim)]">
                      {e.actorType}
                      <span className="block text-[0.65rem] text-[var(--color-phosphor-faint)]">
                        {e.actorId}
                      </span>
                    </td>
                    <td
                      className="deck-readout px-4 py-2 text-xs"
                      style={{ color: SEVERITY_COLOR[e.severity] }}
                    >
                      {e.action}
                    </td>
                    <td
                      className="deck-readout px-4 py-2 text-xs text-[var(--color-phosphor-faint)]"
                      title={e.objectId}
                    >
                      {e.objectType}
                      <span className="block text-[0.65rem]">{e.objectId.slice(0, 22)}</span>
                    </td>
                    <td className="deck-readout px-4 py-2 text-xs text-[var(--color-phosphor-dim)]">
                      {e.result}
                      {e.correctsEventId && (
                        <span className="block text-[0.65rem] text-[var(--color-verdict-conditional)]">
                          corrects {e.correctsEventId.slice(0, 12)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
