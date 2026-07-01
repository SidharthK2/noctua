import type { Quote } from "@noctua/shared"
import type { Address, Hex } from "viem"

export type RfqStatus = "open" | "closed"

export type Rfq = {
  id: string
  borrower: Address
  loanAsset: Address
  collateralAsset: Address
  principal: bigint
  collateral: bigint
  maturity: bigint
  status: RfqStatus
  createdAt: number
}

export type StoredQuote = {
  digest: Hex
  rfqId: string
  quote: Quote
  signature: Hex
  createdAt: number
}

/** Storage contract for RFQs and their quotes. */
export interface RfqStore {
  createRfq(input: Omit<Rfq, "id" | "status" | "createdAt">): Rfq
  getRfq(id: string): Rfq | undefined
  listRfqs(status?: RfqStatus): Rfq[]
  closeRfq(id: string): Rfq | undefined
  hasQuote(digest: Hex): boolean
  addQuote(stored: StoredQuote): void
  /** Quotes for an RFQ, sorted by repayment ascending (best price for the borrower first). */
  listQuotesForRfq(rfqId: string): StoredQuote[]
}

/** In-memory storage. Plain Maps — useful for tests and embedding. */
export class MemoryRfqStore implements RfqStore {
  private readonly rfqs = new Map<string, Rfq>()
  private readonly quotesByDigest = new Map<Hex, StoredQuote>()

  createRfq(input: Omit<Rfq, "id" | "status" | "createdAt">): Rfq {
    const rfq: Rfq = {
      ...input,
      id: crypto.randomUUID(),
      status: "open",
      createdAt: Date.now(),
    }
    this.rfqs.set(rfq.id, rfq)
    return rfq
  }

  getRfq(id: string): Rfq | undefined {
    return this.rfqs.get(id)
  }

  listRfqs(status?: RfqStatus): Rfq[] {
    const all = [...this.rfqs.values()]
    return status ? all.filter((rfq) => rfq.status === status) : all
  }

  closeRfq(id: string): Rfq | undefined {
    const rfq = this.rfqs.get(id)
    if (!rfq) return undefined
    rfq.status = "closed"
    return rfq
  }

  hasQuote(digest: Hex): boolean {
    return this.quotesByDigest.has(digest)
  }

  addQuote(stored: StoredQuote): void {
    this.quotesByDigest.set(stored.digest, stored)
  }

  listQuotesForRfq(rfqId: string): StoredQuote[] {
    return [...this.quotesByDigest.values()]
      .filter((q) => q.rfqId === rfqId)
      .sort((a, b) =>
        a.quote.repayment < b.quote.repayment ? -1 : a.quote.repayment > b.quote.repayment ? 1 : 0,
      )
  }
}
