import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stable JSON stringification: keys sorted so structurally identical payloads
 * always serialise to the same bytes and therefore hash identically.
 *
 * Evidence integrity depends on this. An evidence record whose hash changed
 * because a key order changed would be indistinguishable from one that was
 * tampered with.
 */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Content hash for evidence and scenario records. */
export function hashPayload(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Constant-time comparison. Never use `===` on a signature: string equality
 * short-circuits on the first differing byte and leaks timing.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Fingerprint identifying exactly what was certified.
 *
 * A certification result is only meaningful alongside the versions that
 * produced it. This binds agent version, adapter version, suite version, judge
 * configuration and seed into one value, so a later run against a changed agent
 * produces a different fingerprint and the earlier certification is visibly
 * stale rather than silently carried forward.
 */
export function certificationFingerprint(input: {
  agentId: string;
  agentVersion: string;
  adapterVersion: string;
  suiteId: string;
  suiteVersion: string;
  judgeMode: string;
  judgeModel: string;
  engineVersion: string;
  seed: number;
}): string {
  return hashPayload(input);
}
