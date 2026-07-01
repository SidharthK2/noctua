import type { Address } from "viem"
import { zeroAddress } from "viem"
import { CHAIN_ID } from "./chain.js"

/** Deterministic first-4-deploys from anvil's default key0, in the demo's deploy order. Only
 * used as a fallback on chain 31337 — any other chain requires the env vars to be set. */
const ANVIL_DEFAULTS = {
  VITE_NOCTUA_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  VITE_LOAN_ADDRESS: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  VITE_COLLATERAL_ADDRESS: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  VITE_ORACLE_ADDRESS: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
} as const satisfies Record<string, Address>

const ANVIL_CHAIN_ID = 31337

export type ResolvedAddresses = {
  noctua: Address
  loanAsset: Address
  collateralAsset: Address
  oracle: Address
}

export type AddressConfigResult =
  | { ok: true; addresses: ResolvedAddresses }
  | { ok: false; missing: string[] }

function readAddressEnv(key: keyof typeof ANVIL_DEFAULTS): Address | undefined {
  const value = import.meta.env[key] as string | undefined
  return value ? (value as Address) : undefined
}

function resolveAddresses(chainId: number): AddressConfigResult {
  const keys = Object.keys(ANVIL_DEFAULTS) as Array<keyof typeof ANVIL_DEFAULTS>
  const values = Object.fromEntries(keys.map((key) => [key, readAddressEnv(key)])) as Record<
    keyof typeof ANVIL_DEFAULTS,
    Address | undefined
  >

  if (chainId === ANVIL_CHAIN_ID) {
    return {
      ok: true,
      addresses: {
        noctua: values.VITE_NOCTUA_ADDRESS ?? ANVIL_DEFAULTS.VITE_NOCTUA_ADDRESS,
        loanAsset: values.VITE_LOAN_ADDRESS ?? ANVIL_DEFAULTS.VITE_LOAN_ADDRESS,
        collateralAsset: values.VITE_COLLATERAL_ADDRESS ?? ANVIL_DEFAULTS.VITE_COLLATERAL_ADDRESS,
        oracle: values.VITE_ORACLE_ADDRESS ?? ANVIL_DEFAULTS.VITE_ORACLE_ADDRESS,
      },
    }
  }

  const missing = keys.filter((key) => !values[key])
  if (missing.length > 0) return { ok: false, missing }

  return {
    ok: true,
    addresses: {
      noctua: values.VITE_NOCTUA_ADDRESS as Address,
      loanAsset: values.VITE_LOAN_ADDRESS as Address,
      collateralAsset: values.VITE_COLLATERAL_ADDRESS as Address,
      oracle: values.VITE_ORACLE_ADDRESS as Address,
    },
  }
}

/** Resolution result for the active chain — check `.ok` before rendering the app; when false,
 * `App` renders a full-page config error listing the missing `VITE_*` vars instead. */
export const addressConfigResult: AddressConfigResult = resolveAddresses(CHAIN_ID)

const resolved: ResolvedAddresses = addressConfigResult.ok
  ? addressConfigResult.addresses
  : { noctua: zeroAddress, loanAsset: zeroAddress, collateralAsset: zeroAddress, oracle: zeroAddress }

export const NOCTUA_ADDRESS = resolved.noctua
export const LOAN_ASSET_ADDRESS = resolved.loanAsset
export const COLLATERAL_ASSET_ADDRESS = resolved.collateralAsset
export const ORACLE_ADDRESS = resolved.oracle
