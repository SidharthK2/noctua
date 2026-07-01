import {
  type Address,
  encodeAbiParameters,
  type Hex,
  hashTypedData,
  keccak256,
  toHex,
  verifyTypedData,
} from "viem"
import type { Quote } from "./types.js"

/** Literal EIP-712 type string for `Quote`, byte-identical to QuoteLib.sol's QUOTE_TYPEHASH input. */
export const QUOTE_TYPE_STRING =
  "Quote(address maker,address taker,address loanAsset,address collateralAsset,address oracle,uint256 principal,uint256 repayment,uint256 collateral,uint256 lltv,uint256 maturity,uint256 expiry,uint256 nonce)"

/** keccak256(QUOTE_TYPE_STRING) — must byte-match QuoteLib.QUOTE_TYPEHASH on-chain. */
export const QUOTE_TYPEHASH: Hex = keccak256(toHex(QUOTE_TYPE_STRING))

/** viem-style typed-data `types` object for `Quote`. Field order matches the Solidity struct. */
export const QUOTE_EIP712_TYPES = {
  Quote: [
    { name: "maker", type: "address" },
    { name: "taker", type: "address" },
    { name: "loanAsset", type: "address" },
    { name: "collateralAsset", type: "address" },
    { name: "oracle", type: "address" },
    { name: "principal", type: "uint256" },
    { name: "repayment", type: "uint256" },
    { name: "collateral", type: "uint256" },
    { name: "lltv", type: "uint256" },
    { name: "maturity", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const

export const NOCTUA_DOMAIN_NAME = "Noctua"
export const NOCTUA_DOMAIN_VERSION = "1"

export function noctuaDomain(chainId: number, verifyingContract: Address) {
  return {
    name: NOCTUA_DOMAIN_NAME,
    version: NOCTUA_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  } as const
}

/**
 * Bare EIP-712 struct hash: keccak256(abi.encode(QUOTE_TYPEHASH, ...fields)).
 * Every Quote member is a static type, so this is equivalent to Solidity's
 * `keccak256(abi.encode(QUOTE_TYPEHASH, quote))` in QuoteLib.structHash.
 */
export function quoteStructHash(quote: Quote): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
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
        { type: "uint256" },
      ],
      [
        QUOTE_TYPEHASH,
        quote.maker,
        quote.taker,
        quote.loanAsset,
        quote.collateralAsset,
        quote.oracle,
        quote.principal,
        quote.repayment,
        quote.collateral,
        quote.lltv,
        quote.maturity,
        quote.expiry,
        quote.nonce,
      ],
    ),
  )
}

/** Full EIP-712 digest (domain separator + struct hash) that makers sign. */
export function hashQuote(quote: Quote, chainId: number, verifyingContract: Address): Hex {
  return hashTypedData({
    domain: noctuaDomain(chainId, verifyingContract),
    types: QUOTE_EIP712_TYPES,
    primaryType: "Quote",
    message: quote,
  })
}

/** Recovers the signer of `signature` and checks it matches `quote.maker` (EOA path only). */
export async function verifyQuoteSignature(
  quote: Quote,
  signature: Hex,
  chainId: number,
  verifyingContract: Address,
): Promise<boolean> {
  return verifyTypedData({
    address: quote.maker,
    domain: noctuaDomain(chainId, verifyingContract),
    types: QUOTE_EIP712_TYPES,
    primaryType: "Quote",
    message: quote,
    signature,
  })
}
