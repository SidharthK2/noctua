import {
  COLLATERAL_DECIMALS,
  COLLATERAL_SYMBOL,
  LOAN_DECIMALS,
  LOAN_DISPLAY_DECIMALS,
  LOAN_SYMBOL,
} from "../lib/addresses.js"
import { formatAmount, shortAddr } from "../lib/format.js"
import type { Balances } from "../lib/queries.js"
import { useBalances } from "../lib/queries.js"
import type { StatusEvent } from "../lib/status.js"

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.6rem] uppercase tracking-wider text-neutral-400">{label}</span>
      <span className="font-mono text-xs tabular-nums text-neutral-700">{value}</span>
    </div>
  )
}

function StatGroup({
  label,
  loan,
  coll,
}: {
  label: string
  loan: bigint | undefined
  coll: bigint | undefined
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-[0.6rem] font-medium uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      <Stat
        label={LOAN_SYMBOL}
        value={loan === undefined ? "—" : formatAmount(loan, LOAN_DECIMALS, LOAN_DISPLAY_DECIMALS)}
      />
      <Stat
        label={COLLATERAL_SYMBOL}
        value={coll === undefined ? "—" : formatAmount(coll, COLLATERAL_DECIMALS)}
      />
    </div>
  )
}

const EVENT_DOT: Record<StatusEvent["kind"], string> = {
  tx: "bg-success",
  info: "bg-neutral-400",
  error: "bg-red-500",
}

export function StatusStrip({ lastEvent }: { lastEvent: StatusEvent | null }) {
  const { data: balances } = useBalances()
  const b: Partial<Balances> = balances ?? {}

  return (
    <footer className="fixed inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-x-8 gap-y-2 border-t border-neutral-200 bg-white/80 px-6 py-2.5 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <StatGroup label="Wallet" loan={b.walletLoan} coll={b.walletColl} />
        <div className="hidden h-7 w-px bg-neutral-200 sm:block" />
        <StatGroup label="Escrow" loan={b.escrowLoan} coll={b.escrowColl} />
      </div>
      <div className="flex items-center gap-2 font-mono text-xs">
        {lastEvent === null ? (
          <span className="text-neutral-400">no activity yet</span>
        ) : (
          <>
            <span className={`size-1.5 rounded-full ${EVENT_DOT[lastEvent.kind]}`} />
            {lastEvent.kind === "tx" && (
              <span className="text-neutral-700">
                {lastEvent.label}{" "}
                <span className="text-neutral-500">{shortAddr(lastEvent.hash)}</span>
              </span>
            )}
            {lastEvent.kind === "info" && (
              <span className="text-neutral-700">{lastEvent.label}</span>
            )}
            {lastEvent.kind === "error" && (
              <span className="max-w-96 truncate text-red-600" title={lastEvent.message}>
                {lastEvent.label}: {lastEvent.message}
              </span>
            )}
          </>
        )}
      </div>
    </footer>
  )
}
