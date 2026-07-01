import type { Address } from "viem"

/** Deterministic first-4-deploys from anvil's default key0, in the demo's deploy order. */
const DEFAULTS = {
  NOCTUA: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  LOAN: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  COLL: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  ORACLE: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
} as const

function readEnv(key: string, fallback: string): Address {
  const value = (import.meta.env[key] as string | undefined) ?? fallback
  return value as Address
}

export const NOCTUA_ADDRESS = readEnv("VITE_NOCTUA_ADDRESS", DEFAULTS.NOCTUA)
export const LOAN_ASSET_ADDRESS = readEnv("VITE_LOAN_ADDRESS", DEFAULTS.LOAN)
export const COLLATERAL_ASSET_ADDRESS = readEnv("VITE_COLLATERAL_ADDRESS", DEFAULTS.COLL)
export const ORACLE_ADDRESS = readEnv("VITE_ORACLE_ADDRESS", DEFAULTS.ORACLE)

export const CHAIN_ID = 31337

/** Anvil's deterministic default accounts #0 (maker/lender) and #1 (borrower). Local demo only. */
export const MAKER_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const
export const BORROWER_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const
