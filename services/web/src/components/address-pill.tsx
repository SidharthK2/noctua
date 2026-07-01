import { useState } from "react"
import { cn } from "@/lib/utils"
import { shortAddr } from "../lib/format.js"

/** Truncated mono address rendered as a pill, e.g. `0x1234…abcd`. Click to copy. */
export function AddressPill({ address, className }: { address: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // clipboard API unavailable — non-fatal for a local demo
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={address}
      className={cn(
        "inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-xs tabular-nums text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-100",
        copied && "text-emerald-400 hover:text-emerald-400",
        className,
      )}
    >
      {copied ? "copied ✓" : shortAddr(address)}
    </button>
  )
}
