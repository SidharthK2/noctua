import { hashQuote, type Quote, verifyQuoteSignature } from "@noctua/shared"
import { Hono } from "hono"
import { zeroAddress } from "viem"
import type { Config } from "./config.js"
import { quoteSubmitSchema, rfqCreateSchema } from "./schemas.js"
import { toJsonSafe } from "./serialize.js"
import type { RfqStatus, RfqStore } from "./store.js"
import { MemoryRfqStore } from "./store.js"

export function createApp(config: Config, store: RfqStore = new MemoryRfqStore()) {
  const app = new Hono()

  app.post("/rfqs", async (c) => {
    const body = await c.req.json().catch(() => undefined)
    const parsed = rfqCreateSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400)
    }

    const rfq = store.createRfq(parsed.data)
    return c.json(toJsonSafe(rfq), 201)
  })

  app.get("/rfqs", (c) => {
    const status = c.req.query("status")
    if (status && status !== "open" && status !== "closed") {
      return c.json({ error: "invalid_status" }, 400)
    }
    const rfqs = store.listRfqs(status as RfqStatus | undefined)
    return c.json(toJsonSafe(rfqs))
  })

  app.get("/rfqs/:id", (c) => {
    const rfq = store.getRfq(c.req.param("id"))
    if (!rfq) return c.json({ error: "not_found" }, 404)

    const quotes = store.listQuotesForRfq(rfq.id)
    return c.json(toJsonSafe({ ...rfq, quotes }))
  })

  app.get("/rfqs/:id/quotes", (c) => {
    const rfq = store.getRfq(c.req.param("id"))
    if (!rfq) return c.json({ error: "not_found" }, 404)

    return c.json(toJsonSafe(store.listQuotesForRfq(rfq.id)))
  })

  app.post("/rfqs/:id/quotes", async (c) => {
    const rfq = store.getRfq(c.req.param("id"))
    if (!rfq) return c.json({ error: "not_found" }, 404)
    if (rfq.status !== "open") {
      return c.json({ error: "rfq_not_open" }, 409)
    }

    const body = await c.req.json().catch(() => undefined)
    const parsed = quoteSubmitSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400)
    }
    const input = parsed.data

    const quote: Quote = {
      maker: input.maker,
      taker: input.taker,
      loanAsset: input.loanAsset,
      collateralAsset: input.collateralAsset,
      oracle: input.oracle,
      principal: input.principal,
      repayment: input.repayment,
      collateral: input.collateral,
      lltv: input.lltv,
      maturity: input.maturity,
      expiry: input.expiry,
      nonce: input.nonce,
    }

    if (quote.loanAsset.toLowerCase() !== rfq.loanAsset.toLowerCase()) {
      return c.json({ error: "loan_asset_mismatch" }, 400)
    }
    if (quote.collateralAsset.toLowerCase() !== rfq.collateralAsset.toLowerCase()) {
      return c.json({ error: "collateral_asset_mismatch" }, 400)
    }
    if (quote.principal !== rfq.principal) {
      return c.json({ error: "principal_mismatch" }, 400)
    }
    if (quote.collateral !== rfq.collateral) {
      return c.json({ error: "collateral_mismatch" }, 400)
    }
    if (quote.maturity !== rfq.maturity) {
      return c.json({ error: "maturity_mismatch" }, 400)
    }
    if (
      quote.taker.toLowerCase() !== rfq.borrower.toLowerCase() &&
      quote.taker.toLowerCase() !== zeroAddress.toLowerCase()
    ) {
      return c.json({ error: "taker_mismatch" }, 400)
    }
    if (quote.repayment <= quote.principal) {
      return c.json({ error: "repayment_not_greater_than_principal" }, 400)
    }
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
    if (quote.expiry <= nowSeconds) {
      return c.json({ error: "quote_expired" }, 400)
    }

    const valid = await verifyQuoteSignature(
      quote,
      input.signature,
      config.chainId,
      config.noctuaAddress,
    )
    if (!valid) {
      return c.json({ error: "invalid_signature" }, 400)
    }

    const digest = hashQuote(quote, config.chainId, config.noctuaAddress)
    if (store.hasQuote(digest)) {
      return c.json({ error: "duplicate_quote" }, 409)
    }

    const stored = {
      digest,
      rfqId: rfq.id,
      quote,
      signature: input.signature,
      createdAt: Date.now(),
    }
    store.addQuote(stored)

    return c.json(toJsonSafe(stored), 201)
  })

  app.post("/rfqs/:id/close", (c) => {
    const rfq = store.closeRfq(c.req.param("id"))
    if (!rfq) return c.json({ error: "not_found" }, 404)
    return c.json(toJsonSafe(rfq))
  })

  return app
}
