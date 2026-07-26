import { connectorsForWallets } from "@rainbow-me/rainbowkit"
import { coinbaseWallet, injectedWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets"
import { base, baseSepolia, foundry } from "viem/chains"
import { createConfig, http } from "wagmi"
import { CHAIN_ID, RPC_URL } from "./chain.js"

/**
 * RainbowKit-managed connectors on top of wagmi — connection lifecycle, reconnect persistence,
 * and wrong-network handling come from the library instead of hand-rolled state. Injected
 * (MetaMask & friends) and Coinbase work out of the box; WalletConnect (mobile/QR wallets) only
 * joins the list when VITE_WALLETCONNECT_PROJECT_ID is set (free at cloud.reown.com).
 */
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

const connectors = connectorsForWallets(
  [
    {
      groupName: "Wallets",
      wallets: [injectedWallet, coinbaseWallet, ...(projectId ? [walletConnectWallet] : [])],
    },
  ],
  { appName: "Noctua", projectId: projectId ?? "00000000000000000000000000000000" },
)

/** All supported chains are registered so switching works; only the active chain's transport
 * uses `VITE_RPC_URL`, the others fall back to their public default RPCs. */
export const wagmiConfig = createConfig({
  connectors,
  chains: [base, baseSepolia, foundry],
  transports: {
    [base.id]: http(CHAIN_ID === base.id ? RPC_URL : undefined),
    [baseSepolia.id]: http(CHAIN_ID === baseSepolia.id ? RPC_URL : undefined),
    [foundry.id]: http(CHAIN_ID === foundry.id ? RPC_URL : undefined),
  },
})
