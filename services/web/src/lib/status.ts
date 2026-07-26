import { toast } from "sonner"
import type { Hex } from "viem"
import { ACTIVE_CHAIN } from "./chain.js"
import { shortAddr } from "./format.js"

/** Notable action event — surfaced to the user as a toast. */
export type StatusEvent =
  | { kind: "tx"; label: string; hash: Hex }
  | { kind: "error"; label: string; message: string }
  | { kind: "info"; label: string }

const EXPLORER_URL = ACTIVE_CHAIN.blockExplorers?.default.url

/** Renders a status event as a toast: confirmed txs link to the block explorer, errors show
 * their message. Passed to mutations as the `onStatus` callback. */
export function notifyStatus(event: StatusEvent): void {
  switch (event.kind) {
    case "tx":
      toast.success(event.label, {
        description: shortAddr(event.hash),
        action: EXPLORER_URL
          ? {
              label: "View ↗",
              onClick: () => window.open(`${EXPLORER_URL}/tx/${event.hash}`, "_blank", "noopener"),
            }
          : undefined,
      })
      break
    case "error":
      toast.error(event.label, { description: event.message })
      break
    case "info":
      toast(event.label)
      break
  }
}
