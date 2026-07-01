import type { Hex } from "viem"

/** Last notable event surfaced in the bottom status strip. */
export type StatusEvent =
  | { kind: "tx"; label: string; hash: Hex }
  | { kind: "error"; label: string; message: string }
  | { kind: "info"; label: string }
