import { encodeAbiParameters, keccak256, toHex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { describe, expect, it } from "vitest"
import {
  hashQuote,
  QUOTE_TYPE_STRING,
  QUOTE_TYPEHASH,
  type Quote,
  quoteStructHash,
  signQuote,
  verifyQuoteSignature,
} from "../src/index.js"

const CHAIN_ID = 31337
const VERIFYING_CONTRACT = "0x00000000000000000000000000000000000000AB" as const

const CANONICAL_QUOTE: Quote = {
  maker: "0x1111111111111111111111111111111111111111",
  taker: "0x2222222222222222222222222222222222222222",
  loanAsset: "0x3333333333333333333333333333333333333333",
  collateralAsset: "0x4444444444444444444444444444444444444444",
  principal: 10_000n * 10n ** 6n,
  repayment: 10_400n * 10n ** 6n,
  collateral: 5n * 10n ** 18n,
  maturity: 1_893_456_000n,
  expiry: 1_800_000_000n,
  nonce: 0n,
}

describe("QUOTE_TYPEHASH", () => {
  it("matches keccak256 of the literal type string", () => {
    expect(QUOTE_TYPEHASH).toBe(keccak256(toHex(QUOTE_TYPE_STRING)))
  })
})

describe("sign / verify round trip", () => {
  it("verifies a signature produced by signQuote", async () => {
    const account = privateKeyToAccount(
      "0x28fc53cb0f824ffafe26d6528d38ce2dacacb12de487157f90406e2db9012636",
    )
    const quote: Quote = { ...CANONICAL_QUOTE, maker: account.address }

    const signature = await signQuote(account, quote, CHAIN_ID, VERIFYING_CONTRACT)
    const valid = await verifyQuoteSignature(quote, signature, CHAIN_ID, VERIFYING_CONTRACT)

    expect(valid).toBe(true)
  })

  it("rejects a signature over different quote fields", async () => {
    const account = privateKeyToAccount(
      "0x28fc53cb0f824ffafe26d6528d38ce2dacacb12de487157f90406e2db9012636",
    )
    const quote: Quote = { ...CANONICAL_QUOTE, maker: account.address }
    const tampered: Quote = { ...quote, principal: quote.principal + 1n }

    const signature = await signQuote(account, quote, CHAIN_ID, VERIFYING_CONTRACT)
    const valid = await verifyQuoteSignature(tampered, signature, CHAIN_ID, VERIFYING_CONTRACT)

    expect(valid).toBe(false)
  })
})

describe("quoteStructHash", () => {
  it("is deterministic and matches an independently-computed encoding", () => {
    const viaHelper = quoteStructHash(CANONICAL_QUOTE)

    // Independent path: manually abi.encode each field alongside the typehash,
    // mirroring Solidity's `abi.encode(QUOTE_TYPEHASH, quote)`.
    const independent = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "address" },
          { type: "address" },
          { type: "address" },
          { type: "address" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint256" },
        ],
        [
          QUOTE_TYPEHASH,
          CANONICAL_QUOTE.maker,
          CANONICAL_QUOTE.taker,
          CANONICAL_QUOTE.loanAsset,
          CANONICAL_QUOTE.collateralAsset,
          CANONICAL_QUOTE.principal,
          CANONICAL_QUOTE.repayment,
          CANONICAL_QUOTE.collateral,
          CANONICAL_QUOTE.maturity,
          CANONICAL_QUOTE.expiry,
          CANONICAL_QUOTE.nonce,
        ],
      ),
    )

    expect(viaHelper).toBe(independent)
    expect(quoteStructHash(CANONICAL_QUOTE)).toBe(viaHelper)
  })
})

describe("hashQuote", () => {
  it("produces a stable 32-byte digest", () => {
    const digest = hashQuote(CANONICAL_QUOTE, CHAIN_ID, VERIFYING_CONTRACT)
    expect(digest).toMatch(/^0x[0-9a-f]{64}$/)
    expect(hashQuote(CANONICAL_QUOTE, CHAIN_ID, VERIFYING_CONTRACT)).toBe(digest)
  })
})
