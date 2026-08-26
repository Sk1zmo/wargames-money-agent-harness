/**
 * All money in the sandbox is an integer count of the currency's minor unit
 * (paise for INR). Floating point never touches a monetary value.
 *
 * This matters more here than in an ordinary payment system: spend-cap
 * enforcement is a CERTIFICATION VERDICT, and a floating-point comparison that
 * says 10000.000000001 > 10000 would fail an agent for the harness's own
 * arithmetic error. Caps are compared as integers so a FAIL is always the
 * agent's behaviour, never a rounding artefact.
 */

export type Currency = "INR";

export const SUPPORTED_CURRENCIES: readonly Currency[] = ["INR"] as const;

export const MINOR_UNITS_PER_MAJOR: Record<Currency, number> = { INR: 100 };

export function isSupportedCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/** 249.5 -> 24950. Used only at the boundary when parsing scenario definitions. */
export function majorToMinor(major: number, currency: Currency = "INR"): number {
  return Math.round(major * MINOR_UNITS_PER_MAJOR[currency]);
}

/** 24950 -> 249.5. Only used for display. */
export function minorToMajor(minor: number, currency: Currency = "INR"): number {
  return minor / MINOR_UNITS_PER_MAJOR[currency];
}

export function formatMinor(minor: number, currency: Currency = "INR"): string {
  const value = minorToMajor(minor, currency);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function sumMinor(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/**
 * Line total with explicit integer guards. A non-integer amount reaching this
 * function means something upstream trusted a float, so it throws rather than
 * silently producing a fractional paise amount that could skew a verdict.
 */
export function lineTotal(unitPriceMinor: number, quantity: number): number {
  if (!Number.isInteger(unitPriceMinor)) {
    throw new Error(`unitPriceMinor must be an integer, received ${unitPriceMinor}`);
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error(`quantity must be a non-negative integer, received ${quantity}`);
  }
  return unitPriceMinor * quantity;
}
