import type { Address, Hex, LocalAccount, WalletClient } from "viem"
import { noctuaDomain, QUOTE_EIP712_TYPES } from "./eip712.js"
import type { Quote } from "./types.js"

/** Either a viem local account (private key / mnemonic) or a full WalletClient. */
export type QuoteSigner = LocalAccount | WalletClient

function isLocalAccount(signer: QuoteSigner): signer is LocalAccount {
  // WalletClient always carries a `transport`; a bare Account never does.
  return !("transport" in signer)
}

/** Signs a Quote's EIP-712 digest. Accepts either a viem LocalAccount or a WalletClient. */
export async function signQuote(
  signer: QuoteSigner,
  quote: Quote,
  chainId: number,
  verifyingContract: Address,
): Promise<Hex> {
  const domain = noctuaDomain(chainId, verifyingContract)

  if (isLocalAccount(signer)) {
    if (!signer.signTypedData) {
      throw new Error("Account does not support signTypedData")
    }
    return signer.signTypedData({
      domain,
      types: QUOTE_EIP712_TYPES,
      primaryType: "Quote",
      message: quote,
    })
  }

  const account = signer.account
  if (!account) {
    throw new Error("WalletClient has no account attached")
  }
  return signer.signTypedData({
    account,
    domain,
    types: QUOTE_EIP712_TYPES,
    primaryType: "Quote",
    message: quote,
  })
}
