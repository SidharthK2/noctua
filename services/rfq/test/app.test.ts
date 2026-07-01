import { type Quote, signQuote } from "@noctua/shared"
import { privateKeyToAccount } from "viem/accounts"
import { beforeEach, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import type { Config } from "../src/config.js"
import { SqliteRfqStore } from "../src/sqlite-store.js"
import type { RfqStore } from "../src/store.js"
import { MemoryRfqStore } from "../src/store.js"

const CONFIG: Config = {
  port: 3000,
  chainId: 31337,
  noctuaAddress: "0x00000000000000000000000000000000000000C7",
}

const MAKER = privateKeyToAccount(
  "0x28fc53cb0f824ffafe26d6528d38ce2dacacb12de487157f90406e2db9012636",
)
const BORROWER = "0x2222222222222222222222222222222222222222"
const LOAN_ASSET = "0x3333333333333333333333333333333333333333"
const COLLATERAL_ASSET = "0x4444444444444444444444444444444444444444"

const NOW = Math.floor(Date.now() / 1000)
const MATURITY = BigInt(NOW + 30 * 24 * 3600)

function rfqBody() {
  return {
    borrower: BORROWER,
    loanAsset: LOAN_ASSET,
    collateralAsset: COLLATERAL_ASSET,
    principal: "10000",
    collateral: "5000000000000000000",
    maturity: MATURITY.toString(),
  }
}

async function buildQuote(overrides: Partial<Quote> = {}): Promise<Quote> {
  return {
    maker: MAKER.address,
    taker: BORROWER,
    loanAsset: LOAN_ASSET,
    collateralAsset: COLLATERAL_ASSET,
    oracle: "0x0000000000000000000000000000000000000000",
    principal: 10_000n,
    repayment: 10_400n,
    collateral: 5_000_000_000_000_000_000n,
    lltv: 800_000_000_000_000_000n,
    maturity: MATURITY,
    expiry: BigInt(NOW + 3600),
    nonce: 0n,
    ...overrides,
  }
}

function quoteToBody(quote: Quote, signature: `0x${string}`) {
  return {
    maker: quote.maker,
    taker: quote.taker,
    loanAsset: quote.loanAsset,
    collateralAsset: quote.collateralAsset,
    oracle: quote.oracle,
    principal: quote.principal.toString(),
    repayment: quote.repayment.toString(),
    collateral: quote.collateral.toString(),
    lltv: quote.lltv.toString(),
    maturity: quote.maturity.toString(),
    expiry: quote.expiry.toString(),
    nonce: quote.nonce.toString(),
    signature,
  }
}

const storeFactories: Array<[string, () => RfqStore]> = [
  ["MemoryRfqStore", () => new MemoryRfqStore()],
  ["SqliteRfqStore", () => new SqliteRfqStore(":memory:")],
]

describe.each(storeFactories)("RFQ service (%s)", (_name, makeStore) => {
  let app: ReturnType<typeof createApp>

  beforeEach(() => {
    app = createApp(CONFIG, makeStore())
  })

  it("happy path: post RFQ -> maker signs -> submit -> list sorted -> close", async () => {
    const createRes = await app.request("/rfqs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rfqBody()),
    })
    expect(createRes.status).toBe(201)
    const rfq = await createRes.json()
    expect(rfq.status).toBe("open")

    const cheapQuote = await buildQuote({ repayment: 10_200n })
    const cheapSig = await signQuote(MAKER, cheapQuote, CONFIG.chainId, CONFIG.noctuaAddress)

    const pricierQuote = await buildQuote({ repayment: 10_400n, nonce: 1n })
    const pricierSig = await signQuote(MAKER, pricierQuote, CONFIG.chainId, CONFIG.noctuaAddress)

    // Submit pricier first, cheap second — response should still sort ascending.
    const submitPricier = await app.request(`/rfqs/${rfq.id}/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quoteToBody(pricierQuote, pricierSig)),
    })
    expect(submitPricier.status).toBe(201)

    const submitCheap = await app.request(`/rfqs/${rfq.id}/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quoteToBody(cheapQuote, cheapSig)),
    })
    expect(submitCheap.status).toBe(201)

    const listRes = await app.request(`/rfqs/${rfq.id}/quotes`)
    expect(listRes.status).toBe(200)
    const quotes = await listRes.json()
    expect(quotes).toHaveLength(2)
    expect(quotes[0].quote.repayment).toBe("10200")
    expect(quotes[1].quote.repayment).toBe("10400")

    const getRfqRes = await app.request(`/rfqs/${rfq.id}`)
    const rfqWithQuotes = await getRfqRes.json()
    expect(rfqWithQuotes.quotes).toHaveLength(2)

    const listOpenRes = await app.request("/rfqs?status=open")
    expect(await listOpenRes.json()).toHaveLength(1)

    const closeRes = await app.request(`/rfqs/${rfq.id}/close`, { method: "POST" })
    expect(closeRes.status).toBe(200)
    expect((await closeRes.json()).status).toBe("closed")

    const listOpenAfterClose = await app.request("/rfqs?status=open")
    expect(await listOpenAfterClose.json()).toHaveLength(0)
  })

  it("rejects a quote with an invalid signature", async () => {
    const createRes = await app.request("/rfqs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rfqBody()),
    })
    const rfq = await createRes.json()

    const quote = await buildQuote()
    const otherAccount = privateKeyToAccount(
      "0x6c1b5dd5ae56837da2dabe49fcf9d6c08f82d2750a99559042e4f2c2d1d15911",
    )
    const badSig = await signQuote(otherAccount, quote, CONFIG.chainId, CONFIG.noctuaAddress)

    const res = await app.request(`/rfqs/${rfq.id}/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quoteToBody(quote, badSig)),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("invalid_signature")
  })

  it("rejects a quote with mismatched fields", async () => {
    const createRes = await app.request("/rfqs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rfqBody()),
    })
    const rfq = await createRes.json()

    const quote = await buildQuote({ principal: 9_999n })
    const sig = await signQuote(MAKER, quote, CONFIG.chainId, CONFIG.noctuaAddress)

    const res = await app.request(`/rfqs/${rfq.id}/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quoteToBody(quote, sig)),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("principal_mismatch")
  })

  it("rejects an expired quote", async () => {
    const createRes = await app.request("/rfqs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rfqBody()),
    })
    const rfq = await createRes.json()

    const quote = await buildQuote({ expiry: BigInt(NOW - 3600) })
    const sig = await signQuote(MAKER, quote, CONFIG.chainId, CONFIG.noctuaAddress)

    const res = await app.request(`/rfqs/${rfq.id}/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quoteToBody(quote, sig)),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("quote_expired")
  })

  it("rejects a duplicate quote", async () => {
    const createRes = await app.request("/rfqs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rfqBody()),
    })
    const rfq = await createRes.json()

    const quote = await buildQuote()
    const sig = await signQuote(MAKER, quote, CONFIG.chainId, CONFIG.noctuaAddress)
    const body = JSON.stringify(quoteToBody(quote, sig))

    const first = await app.request(`/rfqs/${rfq.id}/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    })
    expect(first.status).toBe(201)

    const second = await app.request(`/rfqs/${rfq.id}/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    })
    expect(second.status).toBe(409)
    expect((await second.json()).error).toBe("duplicate_quote")
  })

  it("404s for an unknown RFQ", async () => {
    const quote = await buildQuote()
    const sig = await signQuote(MAKER, quote, CONFIG.chainId, CONFIG.noctuaAddress)

    const res = await app.request("/rfqs/does-not-exist/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(quoteToBody(quote, sig)),
    })
    expect(res.status).toBe(404)

    const getRes = await app.request("/rfqs/does-not-exist")
    expect(getRes.status).toBe(404)
  })
})
