import { describe, expect, it } from "vitest"
import { impliedAprWad, WAD } from "../src/apr.js"
import type { Quote } from "../src/types.js"

const BASE: Quote = {
  maker: "0x1111111111111111111111111111111111111111",
  taker: "0x0000000000000000000000000000000000000000",
  loanAsset: "0x3333333333333333333333333333333333333333",
  collateralAsset: "0x4444444444444444444444444444444444444444",
  principal: 10_000n,
  repayment: 10_400n,
  collateral: 1n,
  maturity: 0n,
  expiry: 0n,
  nonce: 0n,
}

describe("impliedAprWad", () => {
  it("annualizes 10_000 -> 10_400 over 90 days to ~16.2% APR", () => {
    const now = 0n
    const ninetyDays = 90n * 24n * 3600n
    const quote: Quote = { ...BASE, maturity: ninetyDays }

    const apr = impliedAprWad(quote, now)
    const aprPercent = Number(apr) / Number(WAD)

    expect(aprPercent).toBeGreaterThan(0.16)
    expect(aprPercent).toBeLessThan(0.163)
  })

  it("throws when there is no remaining term", () => {
    const quote: Quote = { ...BASE, maturity: 100n }
    expect(() => impliedAprWad(quote, 100n)).toThrow()
    expect(() => impliedAprWad(quote, 200n)).toThrow()
  })

  it("throws for non-positive principal", () => {
    const quote: Quote = { ...BASE, principal: 0n, maturity: 100n }
    expect(() => impliedAprWad(quote, 0n)).toThrow()
  })
})
