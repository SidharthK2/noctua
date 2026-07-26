import type { Address } from "viem"
import { zeroAddress } from "viem"
import { CHAIN_ID } from "./chain.js"

/** Deterministic first-3-deploys from anvil's default key0, in the demo's deploy order. Only
 * used as a fallback on chain 31337 — any other chain requires the env vars to be set. */
const ANVIL_DEFAULTS = {
  VITE_NOCTUA_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  VITE_LOAN_ADDRESS: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  VITE_COLLATERAL_ADDRESS: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
} as const satisfies Record<string, Address>

const ANVIL_CHAIN_ID = 31337
const BASE_MAINNET_CHAIN_ID = 8453

/** Canonical token addresses on Base mainnet: the real KRWQ (krwq.cash) and canonical WETH.
 * Used as loan/collateral defaults on chain 8453 — env vars still override, and the Noctua
 * contract address always comes from the env. */
const BASE_MAINNET_TOKEN_DEFAULTS: Partial<Record<keyof typeof ANVIL_DEFAULTS, Address>> = {
  VITE_LOAN_ADDRESS: "0x370923D39f139C64813f173a1bf0b4f9Ba36a24f", // KRWQ
  VITE_COLLATERAL_ADDRESS: "0x4200000000000000000000000000000000000006", // WETH
}

/** Loan asset is KRWQ — the Korean won stablecoin issued by Frax × IQ (krwq.cash), 18 on-chain
 * decimals. On Base mainnet (8453) the real token is used; testnets and local anvil use a
 * mintable mock instead. Collateral is WETH (canonical on mainnet, mock elsewhere). Swapping
 * either asset in the future should only require touching this file.
 *
 * KRWQ displays won-style — whole units, no fractional digits. */
export const LOAN_DECIMALS = 18
export const COLLATERAL_DECIMALS = 18
export const LOAN_SYMBOL = "KRWQ"
export const COLLATERAL_SYMBOL = "WETH"
export const LOAN_DISPLAY_DECIMALS = 0
export const COLLATERAL_DISPLAY_DECIMALS = 2

export type ResolvedAddresses = {
  noctua: Address
  loanAsset: Address
  collateralAsset: Address
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
      },
    }
  }

  // On Base mainnet the token addresses are known constants; only the Noctua deployment
  // address must be configured explicitly.
  const defaults = chainId === BASE_MAINNET_CHAIN_ID ? BASE_MAINNET_TOKEN_DEFAULTS : ({} as const)
  const resolvedValues = {
    VITE_NOCTUA_ADDRESS: values.VITE_NOCTUA_ADDRESS,
    VITE_LOAN_ADDRESS: values.VITE_LOAN_ADDRESS ?? defaults.VITE_LOAN_ADDRESS,
    VITE_COLLATERAL_ADDRESS: values.VITE_COLLATERAL_ADDRESS ?? defaults.VITE_COLLATERAL_ADDRESS,
  }

  const missing = keys.filter((key) => !resolvedValues[key])
  if (missing.length > 0) return { ok: false, missing }

  return {
    ok: true,
    addresses: {
      noctua: resolvedValues.VITE_NOCTUA_ADDRESS as Address,
      loanAsset: resolvedValues.VITE_LOAN_ADDRESS as Address,
      collateralAsset: resolvedValues.VITE_COLLATERAL_ADDRESS as Address,
    },
  }
}

/** Resolution result for the active chain — check `.ok` before rendering the app; when false,
 * `App` renders a full-page config error listing the missing `VITE_*` vars instead. */
export const addressConfigResult: AddressConfigResult = resolveAddresses(CHAIN_ID)

const resolved: ResolvedAddresses = addressConfigResult.ok
  ? addressConfigResult.addresses
  : { noctua: zeroAddress, loanAsset: zeroAddress, collateralAsset: zeroAddress }

export const NOCTUA_ADDRESS = resolved.noctua
export const LOAN_ASSET_ADDRESS = resolved.loanAsset
export const COLLATERAL_ASSET_ADDRESS = resolved.collateralAsset
