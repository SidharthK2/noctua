import type { Chain } from "viem"
import { baseSepolia, foundry } from "viem/chains"

/** Default RPC URL per supported chain id, used when `VITE_RPC_URL` is unset. */
const DEFAULT_RPC_BY_CHAIN_ID: Record<number, string> = {
  [baseSepolia.id]: "https://sepolia.base.org",
  [foundry.id]: "http://localhost:8545",
}

function readChainId(): number {
  const raw = import.meta.env.VITE_CHAIN_ID as string | undefined
  return raw ? Number(raw) : baseSepolia.id
}

/** The two chains this demo can run against. Order matters for wagmi's non-empty tuple type. */
export const SUPPORTED_CHAINS = [baseSepolia, foundry] as const

/** Active chain id — `VITE_CHAIN_ID`, defaulting to Base Sepolia (84532). */
export const CHAIN_ID = readChainId()

/** Active chain object; falls back to Base Sepolia if `VITE_CHAIN_ID` names an unsupported chain. */
export const ACTIVE_CHAIN: Chain =
  SUPPORTED_CHAINS.find((chain) => chain.id === CHAIN_ID) ?? baseSepolia

/** RPC URL for the active chain — `VITE_RPC_URL`, defaulting per chain id. */
export const RPC_URL: string =
  (import.meta.env.VITE_RPC_URL as string | undefined) ??
  DEFAULT_RPC_BY_CHAIN_ID[CHAIN_ID] ??
  "http://localhost:8545"
