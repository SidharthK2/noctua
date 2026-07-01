/** Recursively converts bigint values to decimal strings so responses are JSON.stringify-safe. */
export function toJsonSafe<T>(value: T): unknown {
  if (typeof value === "bigint") {
    return value.toString()
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafe(item))
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, toJsonSafe(val)]),
    )
  }
  return value
}
