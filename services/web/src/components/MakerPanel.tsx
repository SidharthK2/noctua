import { Inbox, Loader2 } from "lucide-react"
import { useState } from "react"
import { useAccount } from "wagmi"
import type { RfqWire } from "../api.js"
import {
  COLLATERAL_DECIMALS,
  COLLATERAL_SYMBOL,
  LOAN_DECIMALS,
  LOAN_SYMBOL,
} from "../lib/addresses.js"
import { formatAmount, formatCountdown, formatUnits } from "../lib/format.js"
import { useOpenRfqs, useSendQuoteMutation } from "../lib/queries.js"
import type { StatusEvent } from "../lib/status.js"
import { useNowSeconds } from "../lib/use-now-seconds.js"
import { AddressPill } from "./address-pill.js"
import { Button } from "./ui/button.js"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js"
import { Input } from "./ui/input.js"

export function MakerPanel({ onStatus }: { onStatus: (event: StatusEvent) => void }) {
  const [quotingId, setQuotingId] = useState<string | null>(null)
  const [repaymentInput, setRepaymentInput] = useState("")
  const [expiryMinutesInput, setExpiryMinutesInput] = useState("60")
  const nowSec = useNowSeconds()
  const { address, isConnected } = useAccount()

  const { data: openRfqs = [], isLoading } = useOpenRfqs()
  const sendQuote = useSendQuoteMutation(onStatus)

  function startQuote(rfq: RfqWire) {
    setQuotingId(rfq.id)
    const defaultRepayment = (BigInt(rfq.principal) * 104n) / 100n
    setRepaymentInput(formatUnits(defaultRepayment, LOAN_DECIMALS))
    setExpiryMinutesInput("60")
  }

  function onSendQuote(rfq: RfqWire) {
    sendQuote.mutate(
      { rfq, repaymentInput, expiryMinutesInput },
      { onSuccess: () => setQuotingId(null) },
    )
  }

  if (!isConnected || !address) {
    return (
      <Card className="border-zinc-800/80 shadow-lg shadow-black/20">
        <CardHeader className="border-b border-zinc-800/60 pb-4">
          <CardTitle className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Maker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="size-5 text-zinc-700" />
            <p className="text-sm text-zinc-600">Connect a wallet to quote on open requests.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-zinc-800/80 shadow-lg shadow-black/20">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-zinc-800/60 pb-4">
        <CardTitle className="text-xs font-medium uppercase tracking-widest text-zinc-400">
          Maker
        </CardTitle>
        <AddressPill address={address} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-600">
            <Loader2 className="size-4 animate-spin" /> Loading requests…
          </div>
        )}
        {!isLoading && openRfqs.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="size-5 text-zinc-700" />
            <p className="text-sm text-zinc-600">No open requests — waiting for borrowers.</p>
          </div>
        )}
        {openRfqs.map((rfq) => {
          const busy = sendQuote.isPending && sendQuote.variables?.rfq.id === rfq.id
          return (
            <div
              key={rfq.id}
              className="flex flex-col gap-3 rounded-lg border border-zinc-800/70 p-4 transition-colors hover:border-zinc-800"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-mono text-base tabular-nums text-zinc-100">
                    {formatAmount(BigInt(rfq.principal), LOAN_DECIMALS)}
                  </span>
                  <span className="text-xs text-zinc-500">{LOAN_SYMBOL}</span>
                  <span className="text-zinc-700">·</span>
                  <span className="font-mono text-sm tabular-nums text-zinc-400">
                    {formatAmount(BigInt(rfq.collateral), COLLATERAL_DECIMALS)}
                  </span>
                  <span className="text-xs text-zinc-500">{COLLATERAL_SYMBOL} collateral</span>
                  <span className="text-zinc-700">·</span>
                  <span className="text-xs tabular-nums text-zinc-500">
                    {formatCountdown(BigInt(rfq.maturity), nowSec)} term
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <AddressPill address={rfq.borrower} />
                  {quotingId !== rfq.id && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={sendQuote.isPending}
                      onClick={() => startQuote(rfq)}
                    >
                      Quote
                    </Button>
                  )}
                </div>
              </div>

              {quotingId === rfq.id && (
                <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800/70 bg-zinc-950/60 p-4">
                  <label
                    className="flex flex-col gap-1.5 text-[0.65rem] uppercase tracking-wider text-zinc-500"
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
                    className="flex flex-col gap-1.5 text-[0.65rem] uppercase tracking-wider text-zinc-500"
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
                      className="text-zinc-500 hover:text-zinc-300"
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
      </CardContent>
    </Card>
  )
}
