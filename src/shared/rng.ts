/**
 * Deterministic pseudo-random number generator (mulberry32).
 *
 * Scenario generation, seeded variants, held-out selection and every demo draw
 * from this. A certification result is only meaningful if it can be replayed,
 * so no part of scenario construction may depend on wall-clock randomness: the
 * same seed must produce the same scenario set, byte for byte, on every run.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(minInclusive: number, maxInclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1));
  }

  bool(probabilityTrue = 0.5): boolean {
    return this.next() < probabilityTrue;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("SeededRandom.pick: empty array");
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Draws `count` distinct items without replacement. */
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    const n = Math.min(count, pool.length);
    for (let i = 0; i < n; i += 1) {
      const idx = Math.floor(this.next() * pool.length);
      out.push(pool.splice(idx, 1)[0] as T);
    }
    return out;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      const a = arr[i] as T;
      const b = arr[j] as T;
      arr[i] = b;
      arr[j] = a;
    }
    return arr;
  }
}

/** Stable 32-bit string hash (FNV-1a), used to derive sub-seeds from names. */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
