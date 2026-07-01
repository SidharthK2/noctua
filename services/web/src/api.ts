import type { Address, Hex } from "viem"

/** RFQ shape as returned by the service — bigint fields are decimal strings on the wire. */
export type RfqWire = {
  id: string
  borrower: Address
  loanAsset: Address
  collateralAsset: Address
  principal: string
  collateral: string
  maturity: string
  status: "open" | "closed"
  createdAt: number
}

/** Quote shape as returned by the service — bigint fields are decimal strings on the wire. */
export type QuoteWire = {
  digest: Hex
  rfqId: string
  quote: {
    maker: Address
    taker: Address
    loanAsset: Address
    collateralAsset: Address
    oracle: Address
    principal: string
    repayment: string
    collateral: string
    lltv: string
    maturity: string
    expiry: string
    nonce: string
  }
  signature: Hex
  createdAt: number
}

const BASE = "/api"

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`)
  }
  return json as T
}

export function createRfq(input: {
  borrower: Address
  loanAsset: Address
  collateralAsset: Address
  principal: bigint
  collateral: bigint
  maturity: bigint
}): Promise<RfqWire> {
  return request("POST", "/rfqs", {
    borrower: input.borrower,
    loanAsset: input.loanAsset,
    collateralAsset: input.collateralAsset,
    principal: input.principal.toString(),
    collateral: input.collateral.toString(),
    maturity: input.maturity.toString(),
  })
}

export function listRfqs(status?: "open" | "closed"): Promise<RfqWire[]> {
  const qs = status ? `?status=${status}` : ""
  return request("GET", `/rfqs${qs}`)
}

export function getRfq(id: string): Promise<RfqWire & { quotes: QuoteWire[] }> {
  return request("GET", `/rfqs/${id}`)
}

export function listQuotesForRfq(id: string): Promise<QuoteWire[]> {
  return request("GET", `/rfqs/${id}/quotes`)
}

export function submitQuote(
  rfqId: string,
  input: {
    maker: Address
    taker: Address
    loanAsset: Address
    collateralAsset: Address
    oracle: Address
    principal: bigint
    repayment: bigint
    collateral: bigint
    lltv: bigint
    maturity: bigint
    expiry: bigint
    nonce: bigint
    signature: Hex
  },
): Promise<QuoteWire> {
  return request("POST", `/rfqs/${rfqId}/quotes`, {
    maker: input.maker,
    taker: input.taker,
    loanAsset: input.loanAsset,
    collateralAsset: input.collateralAsset,
    oracle: input.oracle,
    principal: input.principal.toString(),
    repayment: input.repayment.toString(),
    collateral: input.collateral.toString(),
    lltv: input.lltv.toString(),
    maturity: input.maturity.toString(),
    expiry: input.expiry.toString(),
    nonce: input.nonce.toString(),
    signature: input.signature,
  })
}

export function closeRfq(id: string): Promise<RfqWire> {
  return request("POST", `/rfqs/${id}/close`)
}
