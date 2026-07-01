const WAD = 1_000_000_000_000_000_000n

/** Renders an 18-decimal token amount to a human string with 2 decimal places. */
export function formatUnits18(value: bigint): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const whole = abs / WAD
  const frac = (abs % WAD) / 10_000_000_000_000_000n // 2 decimal places
  const fracStr = frac.toString().padStart(2, "0")
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

/** Parses a human decimal string (e.g. "10000.5") into an 18-decimal bigint. */
export function parseUnits18(input: string): bigint {
  const trimmed = input.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`invalid amount: ${input}`)
  const [whole, frac = ""] = trimmed.split(".")
  const paddedFrac = frac.padEnd(18, "0").slice(0, 18)
  return BigInt(whole) * WAD + BigInt(paddedFrac || "0")
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
