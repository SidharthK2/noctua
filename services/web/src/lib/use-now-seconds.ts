import { useEffect, useState } from "react"

/** 1-second "now" ticker used for countdown timers / implied APR display. */
export function useNowSeconds(): bigint {
  const [nowSec, setNowSec] = useState(() => BigInt(Math.floor(Date.now() / 1000)))

  useEffect(() => {
    const id = setInterval(() => setNowSec(BigInt(Math.floor(Date.now() / 1000))), 1000)
    return () => clearInterval(id)
  }, [])

  return nowSec
}
