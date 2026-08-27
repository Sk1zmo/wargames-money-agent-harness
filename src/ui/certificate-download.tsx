"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

/**
 * Downloads the certification report.
 *
 * `latest` rather than an identifier, because the thing a reader wants is
 * almost always the most recent run and making them find an id first is
 * friction with no purpose.
 */
export function CertificateDownload({ runId = "latest" }: { runId?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/runs/${runId}/certificate`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body?.message ?? `Report unavailable (${response.status}).`);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `certification-${runId}.md`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(`Saved · ${(blob.size / 1024).toFixed(1)} KB`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="inline-flex items-center gap-2 border border-[var(--color-signal)] bg-[color-mix(in_oklab,var(--color-signal)_10%,transparent)] px-3.5 py-2 text-[0.6875rem] uppercase tracking-[0.12em] text-[var(--color-signal)] transition hover:bg-[color-mix(in_oklab,var(--color-signal)_20%,transparent)] disabled:opacity-40"
      >
        {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Download size={12} aria-hidden />}
        Certification report
      </button>
      {message && <p className="font-[family-name:var(--font-readout)] text-[0.625rem] text-[var(--color-verdict-pass)]">{message}</p>}
      {error && <p className="font-[family-name:var(--font-readout)] max-w-xs text-[0.625rem] leading-relaxed text-[var(--color-verdict-fail)]">{error}</p>}
    </div>
  );
}
