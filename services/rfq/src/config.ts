import type { Address } from "viem"

/** Placeholder Noctua settlement contract address until a real deployment address exists. */
const DEFAULT_NOCTUA_ADDRESS: Address = "0x00000000000000000000000000000000000000C7"

export type Config = {
  port: number
  chainId: number
  noctuaAddress: Address
  dbPath: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: env.PORT ? Number(env.PORT) : 3000,
    chainId: env.CHAIN_ID ? Number(env.CHAIN_ID) : 31337,
    noctuaAddress: (env.NOCTUA_ADDRESS as Address | undefined) ?? DEFAULT_NOCTUA_ADDRESS,
    dbPath: env.DB_PATH ?? "noctua-rfq.db",
  }
}
