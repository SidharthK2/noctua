import type { Address } from "viem"

/**
 * Mirrors the Solidity `Quote` struct in `contracts/src/libraries/QuoteLib.sol`.
 * Field order matches the struct EXACTLY — this order feeds both the EIP-712
 * type definition and the abi-encoded struct hash, so it must never drift.
 */
export type Quote = {
  maker: Address
  taker: Address
  loanAsset: Address
  collateralAsset: Address
  principal: bigint
  repayment: bigint
  collateral: bigint
  maturity: bigint
  expiry: bigint
  nonce: bigint
}
