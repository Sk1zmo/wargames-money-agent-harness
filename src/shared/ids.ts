import { randomBytes, randomUUID } from "node:crypto";

/** Prefixed identifiers, readable in logs, evidence tables and the console. */
export type IdPrefix =
  | "agt" // target agent
  | "adp" // adapter registration
  | "scn" // scenario
  | "ste" // scenario suite
  | "run" // certification run
  | "exe" // scenario execution
  | "rsp" // agent response
  | "jdg" // judgment
  | "vrd" // verdict
  | "evd" // evidence
  | "rev" // human review
  | "aud" // audit event
  | "evr" // evaluation run
  | "evc" // evaluation case
  | "sim" // simulator entity
  | "pay" // simulated payment
  | "ref" // simulated refund
  | "whk" // simulated webhook event
  | "ath" // authority grant
  | "cor" // correlation
  | "req"; // request

// Crockford-style alphabet: no i, l, o, u - unambiguous when read aloud.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

function randomSuffix(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[(bytes[i] as number) % ALPHABET.length];
  }
  return out;
}

/**
 * Time-prefixed id. The leading base36 timestamp makes ids roughly sortable by
 * creation order, which matters when scanning an execution log by eye.
 */
export function newId(prefix: IdPrefix): string {
  const time = Date.now().toString(36).padStart(9, "0");
  return `${prefix}_${time}${randomSuffix(10)}`;
}

export function newCorrelationId(): string {
  return newId("cor");
}

export function newRequestId(): string {
  return newId("req");
}

export function newUuid(): string {
  return randomUUID();
}

/**
 * Deterministic id derived from a key.
 *
 * Scenario ids, suite ids and reference-agent ids use this so a given seed
 * always produces the same identifiers. Certification results therefore
 * reference stable scenario ids across regenerations, which is what makes a
 * historical run comparable to a new one.
 */
export function deterministicId(prefix: IdPrefix, key: string | number): string {
  const slug = String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  return `${prefix}_${slug}`;
}
