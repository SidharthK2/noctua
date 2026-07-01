import type { Address } from "viem"

/** Placeholder Noctua settlement contract address until a real deployment address exists. */
const DEFAULT_NOCTUA_ADDRESS: Address = "0x00000000000000000000000000000000000000C7"

export type Config = {
  port: number
  chainId: number
  noctuaAddress: Address
  dbPath: string
  rpcUrl: string
  watchIntervalMs: number
  confirmations: number
  startBlock: bigint
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: env.PORT ? Number(env.PORT) : 3000,
    chainId: env.CHAIN_ID ? Number(env.CHAIN_ID) : 31337,
    noctuaAddress: (env.NOCTUA_ADDRESS as Address | undefined) ?? DEFAULT_NOCTUA_ADDRESS,
    dbPath: env.DB_PATH ?? "noctua-rfq.db",
    rpcUrl: env.RPC_URL ?? "http://localhost:8545",
    watchIntervalMs: env.WATCH_INTERVAL_MS ? Number(env.WATCH_INTERVAL_MS) : 2000,
    confirmations: env.CONFIRMATIONS ? Number(env.CONFIRMATIONS) : 0,
    startBlock: env.START_BLOCK ? BigInt(env.START_BLOCK) : 0n,
  }
}
