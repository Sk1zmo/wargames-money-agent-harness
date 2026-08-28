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

/*
  Deterministic id mode, for the cold-start seeding path only.

  The deployment runs with DATABASE_URL=pglite://:memory:, so the database lives
  inside the process rather than behind a socket. On a serverless host that means
  every function instance holds its OWN database and seeds it itself on first
  request. The Next.js page renderer and the API route handlers are separate
  functions: they cold-start independently and each ran its own bootstrap.

  With the time-and-random ids below, those two bootstraps produced DIFFERENT
  identifiers for the same logical rows. A run id read from GET /api/runs came
  from the API instance's database; /runs/<that id> was rendered by the page
  instance, which had never heard of it, and answered 404. Every deep link into
  a run rotted the moment it crossed tiers, and the ids in the UI disagreed with
  the ids in the JSON for no reason a reader could see.

  So while `withDeterministicIds` is active, `newId` mints from a counter instead
  of the clock. The bootstrap runs a fixed sequence of inserts, so instance A and
  instance B walk the same counter and mint the same ids, and a run id is the
  same string on both tiers. Ids minted outside bootstrap -- a certification the
  user triggers, an audit event from a live request -- still take the time-and-
  random path, which is what they need: those are genuinely new objects and must
  never collide with a seeded one.
*/
let deterministicCounter: number | null = null;

export async function withDeterministicIds<T>(fn: () => Promise<T>): Promise<T> {
  deterministicCounter = 0;
  try {
    return await fn();
  } finally {
    deterministicCounter = null;
  }
}

/**
 * Time-prefixed id. The leading base36 timestamp makes ids roughly sortable by
 * creation order, which matters when scanning an execution log by eye.
 */
export function newId(prefix: IdPrefix): string {
  if (deterministicCounter !== null) {
    const n = deterministicCounter;
    deterministicCounter += 1;
    return `${prefix}_${n.toString(36).padStart(12, "0")}`;
  }
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
