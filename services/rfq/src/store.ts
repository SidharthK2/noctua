import type { Quote } from "@noctua/shared"
import type { Address, Hex } from "viem"

export type RfqStatus = "open" | "filled" | "withdrawn"

export type LoanStatus = "active" | "repaid" | "liquidated" | "defaulted"

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
  filledBy: Hex | null
  fillTxHash: Hex | null
  /** Mirrors the on-chain loan lifecycle once filled; null until the watcher observes a Filled log. */
  loanStatus: LoanStatus | null
  /** Tx hash of the last event that changed loanStatus (Filled/Repaid/Liquidated/Defaulted). */
  loanTxHash: Hex | null
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
  createRfq(
    input: Omit<
      Rfq,
      "id" | "status" | "createdAt" | "filledBy" | "fillTxHash" | "loanStatus" | "loanTxHash"
    >,
  ): Rfq
  getRfq(id: string): Rfq | undefined
  listRfqs(status?: RfqStatus): Rfq[]
  /** Withdraws an RFQ (borrower-initiated). Only valid from "open". */
  withdrawRfq(id: string): Rfq | undefined
  hasQuote(digest: Hex): boolean
  addQuote(stored: StoredQuote): void
  /** Quotes for an RFQ, sorted by repayment ascending (best price for the borrower first). */
  listQuotesForRfq(rfqId: string): StoredQuote[]

  /** Last fully processed block observed by the chain watcher. */
  getCursor(): bigint | undefined
  setCursor(block: bigint): void
  /** Marks the RFQ backing `quoteDigest` as filled, if it exists and is open. Idempotent. */
  markRfqFilled(quoteDigest: Hex, txHash: Hex): void
  /**
   * Updates the loan lifecycle status of the RFQ backing `quoteDigest`. No-op if no RFQ was
   * filled by that digest (unknown digest or the RFQ was never filled).
   */
  setLoanStatus(quoteDigest: Hex, status: "repaid" | "liquidated" | "defaulted", txHash: Hex): void
  /** Removes a stored quote by digest (e.g. on-chain cancellation). */
  removeQuoteByDigest(digest: Hex): void
  /** Removes stored quotes from `maker` signed at a nonce below `currentNonce`. */
  removeQuotesByMakerBelowNonce(maker: Address, currentNonce: bigint): void
}

/** In-memory storage. Plain Maps — useful for tests and embedding. */
export class MemoryRfqStore implements RfqStore {
  private readonly rfqs = new Map<string, Rfq>()
  private readonly quotesByDigest = new Map<Hex, StoredQuote>()
  private cursor: bigint | undefined

  createRfq(
    input: Omit<
      Rfq,
      "id" | "status" | "createdAt" | "filledBy" | "fillTxHash" | "loanStatus" | "loanTxHash"
    >,
  ): Rfq {
    const rfq: Rfq = {
      ...input,
      id: crypto.randomUUID(),
      status: "open",
      createdAt: Date.now(),
      filledBy: null,
      fillTxHash: null,
      loanStatus: null,
      loanTxHash: null,
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

  withdrawRfq(id: string): Rfq | undefined {
    const rfq = this.rfqs.get(id)
    if (!rfq) return undefined
    if (rfq.status !== "open") return rfq
    rfq.status = "withdrawn"
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

  getCursor(): bigint | undefined {
    return this.cursor
  }

  setCursor(block: bigint): void {
    this.cursor = block
  }

  markRfqFilled(quoteDigest: Hex, txHash: Hex): void {
    const stored = this.quotesByDigest.get(quoteDigest)
    if (!stored) return
    const rfq = this.rfqs.get(stored.rfqId)
    if (rfq?.status !== "open") return
    rfq.status = "filled"
    rfq.filledBy = quoteDigest
    rfq.fillTxHash = txHash
    rfq.loanStatus = "active"
    rfq.loanTxHash = txHash
  }

  setLoanStatus(quoteDigest: Hex, status: "repaid" | "liquidated" | "defaulted", txHash: Hex): void {
    const rfq = [...this.rfqs.values()].find((r) => r.filledBy === quoteDigest)
    if (rfq?.status !== "filled") return
    rfq.loanStatus = status
    rfq.loanTxHash = txHash
  }

  removeQuoteByDigest(digest: Hex): void {
    this.quotesByDigest.delete(digest)
  }

  removeQuotesByMakerBelowNonce(maker: Address, currentNonce: bigint): void {
    const makerLower = maker.toLowerCase()
    for (const [digest, stored] of this.quotesByDigest.entries()) {
      if (stored.quote.maker.toLowerCase() === makerLower && stored.quote.nonce < currentNonce) {
        this.quotesByDigest.delete(digest)
      }
    }
  }
}
