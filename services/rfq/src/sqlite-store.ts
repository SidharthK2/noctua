import { DatabaseSync, type StatementSync } from "node:sqlite"
import type { Quote } from "@noctua/shared"
import type { Address, Hex } from "viem"
import type { Rfq, RfqStatus, RfqStore, StoredQuote } from "./store.js"

type RfqRow = {
  id: string
  borrower: string
  loan_asset: string
  collateral_asset: string
  principal: string
  collateral: string
  maturity: string
  status: string
  created_at: number
}

type QuoteRow = {
  digest: string
  rfq_id: string
  maker: string
  taker: string
  loan_asset: string
  collateral_asset: string
  oracle: string
  principal: string
  repayment: string
  collateral: string
  lltv: string
  maturity: string
  expiry: string
  nonce: string
  signature: string
  created_at: number
}

function rowToRfq(row: RfqRow): Rfq {
  return {
    id: row.id,
    borrower: row.borrower as Address,
    loanAsset: row.loan_asset as Address,
    collateralAsset: row.collateral_asset as Address,
    principal: BigInt(row.principal),
    collateral: BigInt(row.collateral),
    maturity: BigInt(row.maturity),
    status: row.status as RfqStatus,
    createdAt: row.created_at,
  }
}

function rowToStoredQuote(row: QuoteRow): StoredQuote {
  const quote: Quote = {
    maker: row.maker as Address,
    taker: row.taker as Address,
    loanAsset: row.loan_asset as Address,
    collateralAsset: row.collateral_asset as Address,
    oracle: row.oracle as Address,
    principal: BigInt(row.principal),
    repayment: BigInt(row.repayment),
    collateral: BigInt(row.collateral),
    lltv: BigInt(row.lltv),
    maturity: BigInt(row.maturity),
    expiry: BigInt(row.expiry),
    nonce: BigInt(row.nonce),
  }
  return {
    digest: row.digest as Hex,
    rfqId: row.rfq_id,
    quote,
    signature: row.signature as Hex,
    createdAt: row.created_at,
  }
}

/** SQLite-backed storage using the built-in node:sqlite module. Zero external dependencies. */
export class SqliteRfqStore implements RfqStore {
  private readonly db: DatabaseSync
  private readonly insertRfqStmt: StatementSync
  private readonly getRfqStmt: StatementSync
  private readonly listRfqsStmt: StatementSync
  private readonly listRfqsByStatusStmt: StatementSync
  private readonly closeRfqStmt: StatementSync
  private readonly hasQuoteStmt: StatementSync
  private readonly insertQuoteStmt: StatementSync
  private readonly listQuotesForRfqStmt: StatementSync

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rfqs (
        id TEXT PRIMARY KEY,
        borrower TEXT NOT NULL,
        loan_asset TEXT NOT NULL,
        collateral_asset TEXT NOT NULL,
        principal TEXT NOT NULL,
        collateral TEXT NOT NULL,
        maturity TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS quotes (
        digest TEXT PRIMARY KEY,
        rfq_id TEXT NOT NULL REFERENCES rfqs(id),
        maker TEXT NOT NULL,
        taker TEXT NOT NULL,
        loan_asset TEXT NOT NULL,
        collateral_asset TEXT NOT NULL,
        oracle TEXT NOT NULL,
        principal TEXT NOT NULL,
        repayment TEXT NOT NULL,
        collateral TEXT NOT NULL,
        lltv TEXT NOT NULL,
        maturity TEXT NOT NULL,
        expiry TEXT NOT NULL,
        nonce TEXT NOT NULL,
        signature TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `)

    this.insertRfqStmt = this.db.prepare(`
      INSERT INTO rfqs (id, borrower, loan_asset, collateral_asset, principal, collateral, maturity, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    this.getRfqStmt = this.db.prepare(`SELECT * FROM rfqs WHERE id = ?`)
    this.listRfqsStmt = this.db.prepare(`SELECT * FROM rfqs`)
    this.listRfqsByStatusStmt = this.db.prepare(`SELECT * FROM rfqs WHERE status = ?`)
    this.closeRfqStmt = this.db.prepare(`UPDATE rfqs SET status = 'closed' WHERE id = ?`)
    this.hasQuoteStmt = this.db.prepare(`SELECT 1 FROM quotes WHERE digest = ?`)
    this.insertQuoteStmt = this.db.prepare(`
      INSERT INTO quotes (
        digest, rfq_id, maker, taker, loan_asset, collateral_asset, oracle,
        principal, repayment, collateral, lltv, maturity, expiry, nonce,
        signature, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    this.listQuotesForRfqStmt = this.db.prepare(`SELECT * FROM quotes WHERE rfq_id = ?`)
  }

  createRfq(input: Omit<Rfq, "id" | "status" | "createdAt">): Rfq {
    const rfq: Rfq = {
      ...input,
      id: crypto.randomUUID(),
      status: "open",
      createdAt: Date.now(),
    }
    this.insertRfqStmt.run(
      rfq.id,
      rfq.borrower,
      rfq.loanAsset,
      rfq.collateralAsset,
      rfq.principal.toString(),
      rfq.collateral.toString(),
      rfq.maturity.toString(),
      rfq.status,
      rfq.createdAt,
    )
    return rfq
  }

  getRfq(id: string): Rfq | undefined {
    const row = this.getRfqStmt.get(id) as RfqRow | undefined
    return row ? rowToRfq(row) : undefined
  }

  listRfqs(status?: RfqStatus): Rfq[] {
    const rows = (
      status ? this.listRfqsByStatusStmt.all(status) : this.listRfqsStmt.all()
    ) as RfqRow[]
    return rows.map(rowToRfq)
  }

  closeRfq(id: string): Rfq | undefined {
    const existing = this.getRfq(id)
    if (!existing) return undefined
    this.closeRfqStmt.run(id)
    return { ...existing, status: "closed" }
  }

  hasQuote(digest: Hex): boolean {
    return this.hasQuoteStmt.get(digest) !== undefined
  }

  addQuote(stored: StoredQuote): void {
    const { quote } = stored
    this.insertQuoteStmt.run(
      stored.digest,
      stored.rfqId,
      quote.maker,
      quote.taker,
      quote.loanAsset,
      quote.collateralAsset,
      quote.oracle,
      quote.principal.toString(),
      quote.repayment.toString(),
      quote.collateral.toString(),
      quote.lltv.toString(),
      quote.maturity.toString(),
      quote.expiry.toString(),
      quote.nonce.toString(),
      stored.signature,
      stored.createdAt,
    )
  }

  listQuotesForRfq(rfqId: string): StoredQuote[] {
    const rows = this.listQuotesForRfqStmt.all(rfqId) as QuoteRow[]
    return rows
      .map(rowToStoredQuote)
      .sort((a, b) =>
        a.quote.repayment < b.quote.repayment ? -1 : a.quote.repayment > b.quote.repayment ? 1 : 0,
      )
  }
}
