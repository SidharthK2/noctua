const WAD = 1_000_000_000_000_000_000n

const DISPLAY_DECIMALS = 2

/** Renders a token amount with `decimals` on-chain decimals to a human string with 2 display
 * decimal places. Assumes `decimals >= 2`, true of every asset this app handles (USDT and WETH
 * both use 18). */
export function formatUnits(value: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals)
  const negative = value < 0n
  const abs = negative ? -value : value
  const whole = abs / unit
  const scale = 10n ** BigInt(decimals - DISPLAY_DECIMALS)
  const frac = (abs % unit) / scale
  const fracStr = frac.toString().padStart(DISPLAY_DECIMALS, "0")
  return `${negative ? "-" : ""}${whole.toString()}.${fracStr}`
}

/** Renders a WAD-scaled rate (1e18 = 100%) as a percentage with 2 decimal places. */
export function formatAprPct(aprWad: bigint): string {
  const pct = (aprWad * 10_000n) / WAD // basis points
  const negative = pct < 0n
  const abs = negative ? -pct : pct
  const whole = abs / 100n
  const frac = (abs % 100n).toString().padStart(2, "0")
  return `${negative ? "-" : ""}${whole.toString()}.${frac}%`
}

/** Like formatUnits, but with thousands separators for display (e.g. "10,000.00"). */
export function formatAmount(value: bigint, decimals: number): string {
  const [whole, frac] = formatUnits(value, decimals).split(".")
  return `${BigInt(whole).toLocaleString("en-US")}.${frac}`
}

/** Parses a human decimal string (e.g. "10000.5" or "10,000.5") into a `decimals`-scaled bigint. */
export function parseUnits(input: string, decimals: number): bigint {
  const trimmed = input.trim().replace(/,/g, "")
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`invalid amount: ${input}`)
  const [whole, frac = ""] = trimmed.split(".")
  const paddedFrac = frac.padEnd(decimals, "0").slice(0, decimals)
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(paddedFrac || "0")
}

/** Formats seconds remaining until `targetSeconds` as a short countdown string. */
export function formatCountdown(targetSeconds: bigint, nowSeconds: bigint): string {
  const remaining = targetSeconds - nowSeconds
  if (remaining <= 0n) return "expired"
  const days = remaining / 86_400n
  const hours = (remaining % 86_400n) / 3_600n
  const minutes = (remaining % 3_600n) / 60n
  const seconds = remaining % 60n
  if (days > 0n) return `${days}d ${hours}h`
  if (hours > 0n) return `${hours}h ${minutes}m`
  if (minutes > 0n) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
