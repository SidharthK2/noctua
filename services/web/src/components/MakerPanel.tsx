import { Inbox, Loader2 } from "lucide-react"
import { useState } from "react"
import { useAccount } from "wagmi"
import type { QuoteWire, RfqWire } from "../api.js"
import {
  COLLATERAL_DECIMALS,
  COLLATERAL_SYMBOL,
  LOAN_DECIMALS,
  LOAN_DISPLAY_DECIMALS,
  LOAN_SYMBOL,
} from "../lib/addresses.js"
import { formatAmount, formatCountdown, formatUnits } from "../lib/format.js"
import type { RfqDetail } from "../lib/queries.js"
import {
  useClaimDefaultMutation,
  useMakerLoans,
  useOpenRfqs,
  useSendQuoteMutation,
} from "../lib/queries.js"
import type { StatusEvent } from "../lib/status.js"
import { useNowSeconds } from "../lib/use-now-seconds.js"
import { AddressPill } from "./address-pill.js"
import type { BadgeStatus } from "./status-badge.js"
import { StatusBadge } from "./status-badge.js"
import { Button } from "./ui/button.js"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js"
import { Input } from "./ui/input.js"

function AmountLine({
  principal,
  repayment,
  collateral,
  maturity,
  nowSec,
}: {
  principal: bigint
  repayment: bigint
  collateral: bigint
  maturity: bigint
  nowSec: bigint
}) {
  const countdown = formatCountdown(maturity, nowSec)
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="font-mono text-base tabular-nums text-neutral-900">
        {formatAmount(principal, LOAN_DECIMALS, LOAN_DISPLAY_DECIMALS)}
      </span>
      <span className="text-xs text-neutral-500">{LOAN_SYMBOL}</span>
      <span className="text-neutral-300">→</span>
      <span className="font-mono text-sm tabular-nums text-neutral-700">
        {formatAmount(repayment, LOAN_DECIMALS, LOAN_DISPLAY_DECIMALS)}
      </span>
      <span className="text-xs text-neutral-500">{LOAN_SYMBOL} owed</span>
      <span className="text-neutral-300">·</span>
      <span className="font-mono text-sm tabular-nums text-neutral-600">
        {formatAmount(collateral, COLLATERAL_DECIMALS)}
      </span>
      <span className="text-xs text-neutral-500">{COLLATERAL_SYMBOL} collateral</span>
      <span className="text-neutral-300">·</span>
      <span className="text-xs tabular-nums text-neutral-500">
        {countdown === "expired" ? "past maturity" : `matures in ${countdown}`}
      </span>
    </div>
  )
}

const LOAN_STATUS_TEXT = {
  repaid: "Repaid — principal and interest received.",
  defaulted: "Defaulted — collateral claimed.",
} as const

export function MakerPanel({ onStatus }: { onStatus: (event: StatusEvent) => void }) {
  const [quotingId, setQuotingId] = useState<string | null>(null)
  const [repaymentInput, setRepaymentInput] = useState("")
  const [expiryMinutesInput, setExpiryMinutesInput] = useState("60")
  const [confirmingDefault, setConfirmingDefault] = useState<Record<string, boolean>>({})
  const nowSec = useNowSeconds()
  const { address, isConnected } = useAccount()

  const { data: openRfqs = [], isLoading } = useOpenRfqs()
  const { data: myLoans = [] } = useMakerLoans()
  const sendQuote = useSendQuoteMutation(onStatus)
  const claimDefault = useClaimDefaultMutation(onStatus)

  function startQuote(rfq: RfqWire) {
    setQuotingId(rfq.id)
    const defaultRepayment = (BigInt(rfq.principal) * 104n) / 100n
    setRepaymentInput(formatUnits(defaultRepayment, LOAN_DECIMALS, LOAN_DISPLAY_DECIMALS))
    setExpiryMinutesInput("60")
  }

  function onSendQuote(rfq: RfqWire) {
    sendQuote.mutate(
      { rfq, repaymentInput, expiryMinutesInput },
      { onSuccess: () => setQuotingId(null) },
    )
  }

  function onClaimDefault(rfqId: string, quoteWire: QuoteWire) {
    claimDefault.mutate(
      { rfqId, quoteWire },
      {
        // The tx confirms near-instantly on a local chain but the watcher takes a poll or two
        // to flip loanStatus — hold a "confirming" state so the UI never snaps back to the button.
        onSuccess: () => {
          setConfirmingDefault((prev) => ({ ...prev, [quoteWire.digest]: true }))
        },
      },
    )
  }

  const renderLoanCard = ({
    detail,
    winningQuote,
  }: {
    detail: RfqDetail
    winningQuote: QuoteWire
  }) => {
    const onchain = winningQuote.quote
    const confirming =
      confirmingDefault[winningQuote.digest] === true && detail.loanStatus === "active"
    const claiming =
      claimDefault.isPending && claimDefault.variables?.quoteWire.digest === winningQuote.digest
    const pastMaturity = nowSec > BigInt(onchain.maturity)
    return (
      <div
        key={detail.id}
        className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 transition-colors hover:border-neutral-300"
      >
        <div className="flex items-center justify-between gap-2">
          <AmountLine
            principal={BigInt(onchain.principal)}
            repayment={BigInt(onchain.repayment)}
            collateral={BigInt(onchain.collateral)}
            maturity={BigInt(onchain.maturity)}
            nowSec={nowSec}
          />
          <div className="flex items-center gap-2">
            <AddressPill address={detail.borrower} />
            <StatusBadge status={(detail.loanStatus ?? "pending") as BadgeStatus} />
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm">
          {confirming ? (
            <>
              <StatusBadge status="pending" />
              <span className="flex items-center gap-2 text-neutral-500">
                <Loader2 className="size-3.5 animate-spin" /> Confirming default…
              </span>
            </>
          ) : detail.loanStatus === "active" ? (
            pastMaturity ? (
              <>
                <span className="flex-1 text-neutral-500">Past maturity — repayment overdue.</span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={claimDefault.isPending}
                  onClick={() => onClaimDefault(detail.id, winningQuote)}
                >
                  {claiming ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Claiming
                    </>
                  ) : (
                    "Claim default"
                  )}
                </Button>
              </>
            ) : (
              <span className="text-neutral-500">Awaiting repayment</span>
            )
          ) : (
            <span className="text-neutral-500">
              {detail.loanStatus ? LOAN_STATUS_TEXT[detail.loanStatus] : "Awaiting repayment"}
            </span>
          )}
        </div>
      </div>
    )
  }

  const connected = isConnected && !!address

  return (
    <Card className="border-neutral-200 shadow-sm shadow-neutral-900/5">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-neutral-200 pb-4">
        <CardTitle className="text-xs font-medium uppercase tracking-widest text-neutral-600">
          Maker
        </CardTitle>
        {connected ? (
          <AddressPill address={address} />
        ) : (
          <span className="text-xs text-neutral-400">read-only — connect a wallet to quote</span>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-400">
            <Loader2 className="size-4 animate-spin" /> Loading requests…
          </div>
        )}
        {!isLoading && openRfqs.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="size-5 text-neutral-300" />
            <p className="text-sm text-neutral-400">No open requests — waiting for borrowers.</p>
          </div>
        )}
        {openRfqs.map((rfq) => {
          const busy = sendQuote.isPending && sendQuote.variables?.rfq.id === rfq.id
          return (
            <div
              key={rfq.id}
              className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 transition-colors hover:border-neutral-300"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-mono text-base tabular-nums text-neutral-900">
                    {formatAmount(BigInt(rfq.principal), LOAN_DECIMALS, LOAN_DISPLAY_DECIMALS)}
                  </span>
                  <span className="text-xs text-neutral-500">{LOAN_SYMBOL}</span>
                  <span className="text-neutral-300">·</span>
                  <span className="font-mono text-sm tabular-nums text-neutral-600">
                    {formatAmount(BigInt(rfq.collateral), COLLATERAL_DECIMALS)}
                  </span>
                  <span className="text-xs text-neutral-500">{COLLATERAL_SYMBOL} collateral</span>
                  <span className="text-neutral-300">·</span>
                  <span className="text-xs tabular-nums text-neutral-500">
                    {formatCountdown(BigInt(rfq.maturity), nowSec)} term
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <AddressPill address={rfq.borrower} />
                  {quotingId !== rfq.id && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={!connected || sendQuote.isPending}
                      title={connected ? undefined : "Connect a wallet to quote"}
                      onClick={() => startQuote(rfq)}
                    >
                      Quote
                    </Button>
                  )}
                </div>
              </div>

              {quotingId === rfq.id && (
                <div className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                  <label
                    className="flex flex-col gap-1.5 text-[0.65rem] uppercase tracking-wider text-neutral-500"
                    htmlFor={`quote-repayment-${rfq.id}`}
                  >
                    Repayment · {LOAN_SYMBOL}
                    <Input
                      id={`quote-repayment-${rfq.id}`}
                      className="w-32 text-right font-mono tabular-nums"
                      value={repaymentInput}
                      onChange={(e) => setRepaymentInput(e.target.value)}
                    />
                  </label>
                  <label
                    className="flex flex-col gap-1.5 text-[0.65rem] uppercase tracking-wider text-neutral-500"
                    htmlFor={`quote-expiry-${rfq.id}`}
                  >
                    Expiry · minutes
                    <Input
                      id={`quote-expiry-${rfq.id}`}
                      className="w-24 text-right font-mono tabular-nums"
                      value={expiryMinutesInput}
                      onChange={(e) => setExpiryMinutesInput(e.target.value)}
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={sendQuote.isPending}
                      onClick={() => onSendQuote(rfq)}
                    >
                      {busy ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" /> Signing
                        </>
                      ) : (
                        "Sign & send"
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-neutral-500 hover:text-neutral-700"
                      onClick={() => setQuotingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {connected && myLoans.length > 0 && (
          <div className="flex flex-col gap-3 pt-2">
            <span className="text-[0.65rem] font-medium uppercase tracking-widest text-neutral-500">
              My loans
            </span>
            {myLoans.map(renderLoanCard)}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
