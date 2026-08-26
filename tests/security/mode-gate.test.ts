import { describe, expect, it } from "vitest";
import { HARNESS_MODES, parseEnv } from "@/shared/env";

/**
 * The single most important property in the codebase: there is no live-money
 * mode to enable.
 *
 * These tests assert the ABSENCE of a capability, which is unusual and worth
 * stating. They would still pass if someone deleted the whole simulator. What
 * they defend is the specific regression of a well-meaning contributor adding
 * a "LIVE" mode behind a flag, which is exactly the change that would look
 * reasonable in isolation and is catastrophic here.
 */

const BASE = {
  DATABASE_URL: "pglite://./.data/test",
  LLM_PROVIDER: "none",
  SEED: "1",
};

describe("HARNESS_MODE", () => {
  it("accepts only SIMULATED and TEST_MODE", () => {
    expect([...HARNESS_MODES]).toEqual(["SIMULATED", "TEST_MODE"]);
  });

  for (const mode of HARNESS_MODES) {
    it(`accepts ${mode}`, () => {
      const env = parseEnv({ ...BASE, HARNESS_MODE: mode });
      expect(env.HARNESS_MODE).toBe(mode);
    });
  }

  // Each of these is a value somebody would plausibly try.
  for (const forbidden of ["LIVE", "PRODUCTION", "PROD", "REAL", "MAINNET"]) {
    it(`refuses ${forbidden} by name, with an explanation rather than a type error`, () => {
      let message = "";
      try {
        parseEnv({ ...BASE, HARNESS_MODE: forbidden });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).not.toBe("");
      expect(message).toContain(forbidden);
      // The error must explain the design, not read like a typo.
      expect(message.toLowerCase()).toContain("no live-money mode");
    });

    it(`refuses ${forbidden.toLowerCase()} in lower case too`, () => {
      expect(() => parseEnv({ ...BASE, HARNESS_MODE: forbidden.toLowerCase() })).toThrow();
    });
  }

  it("refuses an unrecognised value rather than defaulting to something safe-looking", () => {
    // Silently coercing an unknown mode to SIMULATED would mean a typo in
    // deployment config produces a running service whose mode nobody verified.
    expect(() => parseEnv({ ...BASE, HARNESS_MODE: "banana" })).toThrow();
  });

  it("defaults to SIMULATED when unset", () => {
    const env = parseEnv({ ...BASE });
    expect(env.HARNESS_MODE).toBe("SIMULATED");
  });
});

describe("environment status", () => {
  it("reports live money as structurally impossible, not merely disabled", async () => {
    const { environmentStatus } = await import("@/shared/env");
    const status = environmentStatus();
    expect(status.liveMoneyPossible).toBe(false);
    // Typed as `false`, so a future edit cannot make it conditional without a
    // type error somewhere.
    const check: false = status.liveMoneyPossible;
    expect(check).toBe(false);
  });
});
