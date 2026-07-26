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
        "inline-flex items-center rounded-full border border-neutral-200 bg-white px-2 py-0.5 font-mono text-xs tabular-nums text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900",
        copied && "text-success hover:text-success",
        className,
      )}
    >
      {copied ? "copied ✓" : shortAddr(address)}
    </button>
  )
}
