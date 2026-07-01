import { createPublicClient, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { foundry } from "viem/chains"
import { BORROWER_PRIVATE_KEY, MAKER_PRIVATE_KEY } from "./addresses.js"

export const makerAccount = privateKeyToAccount(MAKER_PRIVATE_KEY)
export const borrowerAccount = privateKeyToAccount(BORROWER_PRIVATE_KEY)

export const publicClient = createPublicClient({ chain: foundry, transport: http() })

export const makerWallet = createWalletClient({
  account: makerAccount,
  chain: foundry,
  transport: http(),
})

export const borrowerWallet = createWalletClient({
  account: borrowerAccount,
  chain: foundry,
  transport: http(),
})
