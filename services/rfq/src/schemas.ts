import { z } from "zod"

/** Non-negative integer encoded as a decimal string (bigints don't survive JSON). */
export const bigintString = z
  .string()
  .regex(/^\d+$/, "must be a non-negative integer string")
  .transform((value) => BigInt(value))

export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "must be a 20-byte hex address")
  .transform((value) => value as `0x${string}`)

export const hexSignatureSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]+$/, "must be hex-encoded")
  .transform((value) => value as `0x${string}`)

export const rfqCreateSchema = z.object({
  borrower: addressSchema,
  loanAsset: addressSchema,
  collateralAsset: addressSchema,
  principal: bigintString,
  collateral: bigintString,
  maturity: bigintString,
})
export type RfqCreateInput = z.infer<typeof rfqCreateSchema>

export const quoteSubmitSchema = z.object({
  maker: addressSchema,
  taker: addressSchema,
  loanAsset: addressSchema,
  collateralAsset: addressSchema,
  principal: bigintString,
  repayment: bigintString,
  collateral: bigintString,
  maturity: bigintString,
  expiry: bigintString,
  nonce: bigintString,
  signature: hexSignatureSchema,
})
export type QuoteSubmitInput = z.infer<typeof quoteSubmitSchema>
