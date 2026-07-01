import type { Quote } from "@noctua/shared"
import type { QuoteWire } from "../api.js"

/** Converts a wire quote (decimal-string bigints) into the on-chain `Quote` struct shape. */
export function wireQuoteToOnchain(q: QuoteWire["quote"]): Quote {
  return {
    maker: q.maker,
    taker: q.taker,
    loanAsset: q.loanAsset,
    collateralAsset: q.collateralAsset,
    oracle: q.oracle,
    principal: BigInt(q.principal),
    repayment: BigInt(q.repayment),
    collateral: BigInt(q.collateral),
    lltv: BigInt(q.lltv),
    maturity: BigInt(q.maturity),
    expiry: BigInt(q.expiry),
    nonce: BigInt(q.nonce),
  }
}
