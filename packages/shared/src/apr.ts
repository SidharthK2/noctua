import type { Quote } from "./types.js"

export const WAD = 1_000_000_000_000_000_000n
const SECONDS_PER_YEAR = 31_536_000n // 365 * 24 * 3600

/**
 * Display-only implied APR, WAD-scaled (1e18 = 100%).
 *
 * Computed as `(repayment / principal - 1)` annualized linearly over the
 * remaining term (`maturity - now`). This is a simple (non-compounding)
 * annualization matching the zero-coupon framing in QuoteLib.sol's docs —
 * it is NOT compounded, and is for UI display only; the contract never
 * performs this math on-chain.
 *
 * Rounding: both the rate and the annualization use integer (floor) division,
 * so the result is truncated toward zero and may understate the true APR by
 * a small amount (fractions of a WAD unit at typical loan sizes/terms).
 *
 * Throws if `maturity <= nowSeconds` (no remaining term to annualize over)
 * or `principal <= 0`.
 */
export function impliedAprWad(quote: Quote, nowSeconds: bigint): bigint {
  if (quote.principal <= 0n) {
    throw new Error("principal must be > 0")
  }
  if (quote.maturity <= nowSeconds) {
    throw new Error("maturity must be in the future")
  }

  const rateWad = (quote.repayment * WAD) / quote.principal - WAD
  const termSeconds = quote.maturity - nowSeconds

  return (rateWad * SECONDS_PER_YEAR) / termSeconds
}
