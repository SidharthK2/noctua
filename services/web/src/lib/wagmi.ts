import { base, baseSepolia, foundry } from "viem/chains"
import { createConfig, http } from "wagmi"
import { injected } from "wagmi/connectors"
import { CHAIN_ID, RPC_URL } from "./chain.js"

/**
 * Injected-only wagmi config (MetaMask / Coinbase-extension style) — no WalletConnect (needs a
 * project id) and no RainbowKit. All supported chains are registered so `useSwitchChain` works;
 * only the active chain's transport uses `VITE_RPC_URL`, the others fall back to their public
 * default RPCs.
 */
export const wagmiConfig = createConfig({
  chains: [base, baseSepolia, foundry],
  connectors: [injected()],
  transports: {
    [base.id]: http(CHAIN_ID === base.id ? RPC_URL : undefined),
    [baseSepolia.id]: http(CHAIN_ID === baseSepolia.id ? RPC_URL : undefined),
    [foundry.id]: http(CHAIN_ID === foundry.id ? RPC_URL : undefined),
  },
})
