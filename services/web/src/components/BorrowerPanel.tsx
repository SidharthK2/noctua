import { impliedAprWad } from "@noctua/shared"
import { ChevronDown, ChevronRight, Loader2, MoonStar } from "lucide-react"
import { useState } from "react"
import { useAccount } from "wagmi"
import type { QuoteWire } from "../api.js"
import { formatAmount, formatAprPct, formatCountdown } from "../lib/format.js"
import type { RfqDetail } from "../lib/queries.js"
import {
  useAcceptQuoteMutation,
  useMyRfqs,
  usePostRfqMutation,
  useRepayLoanMutation,
} from "../lib/queries.js"
import { wireQuoteToOnchain } from "../lib/quote.js"
import type { StatusEvent } from "../lib/status.js"
import { useNowSeconds } from "../lib/use-now-seconds.js"
import { AddressPill } from "./address-pill.js"
import type { BadgeStatus } from "./status-badge.js"
import { StatusBadge } from "./status-badge.js"
import { Button } from "./ui/button.js"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js"
import { Input } from "./ui/input.js"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table.js"

function AmountLine({
  principal,
  collateral,
  maturity,
  nowSec,
}: {
  principal: bigint
  collateral: bigint
  maturity: bigint
  nowSec: bigint
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="font-mono text-base tabular-nums text-zinc-100">
        {formatAmount(principal)}
      </span>
      <span className="text-xs text-zinc-500">DAI</span>
      <span className="text-zinc-700">·</span>
      <span className="font-mono text-sm tabular-nums text-zinc-400">
        {formatAmount(collateral)}
      </span>
      <span className="text-xs text-zinc-500">WETH collateral</span>
      <span className="text-zinc-700">·</span>
      <span className="text-xs tabular-nums text-zinc-500">
        matures in {formatCountdown(maturity, nowSec)}
      </span>
    </div>
  )
}

const LOAN_STATUS_TEXT = {
  repaid: "Loan repaid — collateral returned.",
  liquidated: "Position was liquidated.",
  defaulted: "Loan defaulted — collateral forfeited.",
} as const

/** An RFQ is inactive once nothing further can happen to it from the borrower's side. */
function isInactive(detail: RfqDetail): boolean {
  if (detail.status === "withdrawn") return true
  return detail.loanStatus !== null && detail.loanStatus !== "active"
}

export function BorrowerPanel({ onStatus }: { onStatus: (event: StatusEvent) => void }) {
  const [principalInput, setPrincipalInput] = useState("10000")
  const [collateralInput, setCollateralInput] = useState("10")
  const [daysInput, setDaysInput] = useState("90")
  const [acceptedByRfqId, setAcceptedByRfqId] = useState<Record<string, QuoteWire>>({})
  const [confirmingRepay, setConfirmingRepay] = useState<Record<string, boolean>>({})
  const [showCompleted, setShowCompleted] = useState(false)
  const nowSec = useNowSeconds()
  const { address, isConnected } = useAccount()

  const { data: myRfqs = [], isLoading } = useMyRfqs()
  const postRfq = usePostRfqMutation(onStatus)
  const acceptQuote = useAcceptQuoteMutation(onStatus)
  const repayLoan = useRepayLoanMutation(onStatus)

  if (!isConnected || !address) {
    return (
      <Card className="border-zinc-800/80 shadow-lg shadow-black/20">
        <CardHeader className="border-b border-zinc-800/60 pb-4">
          <CardTitle className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Borrower
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <MoonStar className="size-5 text-zinc-700" />
            <p className="text-sm text-zinc-600">
              Connect a wallet to post requests and manage loans.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // The quote a loan was opened with: taken from in-memory state right after Accept (before the
  // watcher marks the RFQ filled), then from the persisted filledBy digest so it survives reloads.
  function acceptedQuoteFor(detail: RfqDetail): QuoteWire | undefined {
    const inMemory = acceptedByRfqId[detail.id]
    if (inMemory) return inMemory
    if (detail.status === "filled" && detail.filledBy) {
      return detail.quotes.find((q) => q.digest === detail.filledBy)
    }
    return undefined
  }

  function onPostRfq(e: React.FormEvent) {
    e.preventDefault()
    postRfq.mutate({ principalInput, collateralInput, daysInput })
  }

  function onAccept(rfqId: string, quoteWire: QuoteWire) {
    setAcceptedByRfqId((prev) => ({ ...prev, [rfqId]: quoteWire }))
    acceptQuote.mutate(
      { rfqId, quoteWire },
      {
        // If the fill fails, drop the in-memory bridge so the card doesn't sit on
        // "awaiting confirmation" forever — the quote table comes back instead.
        onError: () => {
          setAcceptedByRfqId((prev) => {
            const { [rfqId]: _dropped, ...rest } = prev
            return rest
          })
        },
      },
    )
  }

  function onRepay(rfqId: string, quoteWire: QuoteWire) {
    repayLoan.mutate(
      { rfqId, quoteWire },
      {
        // The tx confirms near-instantly on a local chain but the watcher takes a poll or two
        // to flip loanStatus — hold a "confirming" state so the UI never snaps back to Repay.
        onSuccess: () => {
          setConfirmingRepay((prev) => ({ ...prev, [quoteWire.digest]: true }))
        },
      },
    )
  }

  const activeRfqs = myRfqs.filter((d) => !isInactive(d))
  const completedRfqs = myRfqs.filter(isInactive)

  const renderRfqCard = (detail: RfqDetail) => {
    const accepted = acceptedQuoteFor(detail)
    const repaying =
      repayLoan.isPending && repayLoan.variables?.quoteWire.digest === accepted?.digest
    const confirming =
      accepted !== undefined &&
      confirmingRepay[accepted.digest] === true &&
      detail.loanStatus === "active"
    return (
      <div
        key={detail.id}
        className="flex flex-col gap-3 rounded-lg border border-zinc-800/70 p-4 transition-colors hover:border-zinc-800"
      >
        <div className="flex items-center justify-between gap-2">
          <AmountLine
            principal={BigInt(detail.principal)}
            collateral={BigInt(detail.collateral)}
            maturity={BigInt(detail.maturity)}
            nowSec={nowSec}
          />
          <StatusBadge status={detail.status as BadgeStatus} />
        </div>

        {accepted && (
          <div className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950/60 p-3 text-sm">
            {detail.loanStatus === null ? (
              <>
                <StatusBadge status="pending" />
                <span className="text-zinc-500">Awaiting chain confirmation…</span>
              </>
            ) : confirming ? (
              <>
                <StatusBadge status="pending" />
                <span className="flex items-center gap-2 text-zinc-500">
                  <Loader2 className="size-3.5 animate-spin" /> Confirming repayment…
                </span>
              </>
            ) : detail.loanStatus === "active" ? (
              <>
                <StatusBadge status="active" />
                <span className="flex-1 text-zinc-500">
                  Owes{" "}
                  <span className="font-mono tabular-nums text-zinc-300">
                    {formatAmount(BigInt(accepted.quote.repayment))} DAI
                  </span>{" "}
                  by maturity
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={repayLoan.isPending}
                  onClick={() => onRepay(detail.id, accepted)}
                >
                  {repaying ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Repaying
                    </>
                  ) : (
                    "Repay"
                  )}
                </Button>
              </>
            ) : (
              <>
                <StatusBadge status={detail.loanStatus} />
                <span className="text-zinc-500">{LOAN_STATUS_TEXT[detail.loanStatus]}</span>
              </>
            )}
          </div>
        )}

        {!accepted && detail.status === "open" && (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800/50 hover:bg-transparent">
                <TableHead className="h-8 text-right text-[0.65rem] uppercase tracking-wider">
                  Repayment
                </TableHead>
                <TableHead className="h-8 text-right text-[0.65rem] uppercase tracking-wider">
                  APR
                </TableHead>
                <TableHead className="h-8 text-right text-[0.65rem] uppercase tracking-wider">
                  Expires
                </TableHead>
                <TableHead className="h-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.quotes.map((qw) => {
                const onchain = wireQuoteToOnchain(qw.quote)
                let apr = "—"
                try {
                  apr = formatAprPct(impliedAprWad(onchain, nowSec))
                } catch {
                  apr = "—"
                }
                const busy =
                  acceptQuote.isPending && acceptQuote.variables?.quoteWire.digest === qw.digest
                return (
                  <TableRow
                    key={qw.digest}
                    className="border-zinc-800/50 transition-colors hover:bg-zinc-800/20"
                  >
                    <TableCell className="text-right font-mono tabular-nums text-zinc-200">
                      {formatAmount(onchain.repayment)} <span className="text-zinc-500">DAI</span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium tabular-nums text-emerald-400">
                      {apr}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-zinc-400">
                      {formatCountdown(onchain.expiry, nowSec)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        disabled={acceptQuote.isPending || detail.status !== "open"}
                        onClick={() => onAccept(detail.id, qw)}
                      >
                        {busy ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin" /> Accepting
                          </>
                        ) : (
                          "Accept"
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {detail.quotes.length === 0 && (
                <TableRow className="border-zinc-800/50 hover:bg-transparent">
                  <TableCell colSpan={4} className="py-6 text-center">
                    <span className="inline-flex items-center gap-2 text-sm text-zinc-600">
                      <span className="size-1.5 animate-pulse rounded-full bg-zinc-600" />
                      Waiting for quotes
                    </span>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    )
  }

  return (
    <Card className="border-zinc-800/80 shadow-lg shadow-black/20">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-zinc-800/60 pb-4">
        <CardTitle className="text-xs font-medium uppercase tracking-widest text-zinc-400">
          Borrower
        </CardTitle>
        <AddressPill address={address} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800/70 bg-zinc-950/60 p-4"
          onSubmit={onPostRfq}
        >
          <label
            className="flex flex-col gap-1.5 text-[0.65rem] uppercase tracking-wider text-zinc-500"
            htmlFor="rfq-principal"
          >
            Principal · DAI
            <Input
              id="rfq-principal"
              className="w-32 text-right font-mono tabular-nums"
              value={principalInput}
              onChange={(e) => setPrincipalInput(e.target.value)}
            />
          </label>
          <label
            className="flex flex-col gap-1.5 text-[0.65rem] uppercase tracking-wider text-zinc-500"
            htmlFor="rfq-collateral"
          >
            Collateral · WETH
            <Input
              id="rfq-collateral"
              className="w-32 text-right font-mono tabular-nums"
              value={collateralInput}
              onChange={(e) => setCollateralInput(e.target.value)}
            />
          </label>
          <label
            className="flex flex-col gap-1.5 text-[0.65rem] uppercase tracking-wider text-zinc-500"
            htmlFor="rfq-days"
          >
            Term · days
            <Input
              id="rfq-days"
              className="w-24 text-right font-mono tabular-nums"
              value={daysInput}
              onChange={(e) => setDaysInput(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={postRfq.isPending} className="min-w-28">
            {postRfq.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Posting
              </>
            ) : (
              "Post RFQ"
            )}
          </Button>
        </form>

        <div className="flex flex-col gap-3">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-600">
              <Loader2 className="size-4 animate-spin" /> Loading requests…
            </div>
          )}
          {!isLoading && myRfqs.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <MoonStar className="size-5 text-zinc-700" />
              <p className="text-sm text-zinc-600">No requests yet — post one above.</p>
            </div>
          )}
          {activeRfqs.map(renderRfqCard)}

          {completedRfqs.length > 0 && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                className="flex items-center gap-1.5 self-start text-[0.65rem] font-medium uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-300"
              >
                {showCompleted ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
                Completed · {completedRfqs.length}
              </button>
              {showCompleted && (
                <div className="flex flex-col gap-3 opacity-70">
                  {completedRfqs.map(renderRfqCard)}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
