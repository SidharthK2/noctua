import { impliedAprWad } from "@noctua/shared"
import { useEffect, useState } from "react"
import type { QuoteWire, RfqWire } from "../api.js"
import { createRfq, getRfq, listRfqs } from "../api.js"
import { COLLATERAL_ASSET_ADDRESS, LOAN_ASSET_ADDRESS, NOCTUA_ADDRESS } from "../lib/addresses.js"
import { erc20Abi, noctuaAbi } from "../lib/abi.js"
import { borrowerAccount, borrowerWallet, publicClient } from "../lib/clients.js"
import { formatAprPct, formatCountdown, formatUnits18, parseUnits18 } from "../lib/format.js"
import { wireQuoteToOnchain } from "../lib/quote.js"
import type { StatusEvent } from "../lib/status.js"

type RfqDetail = RfqWire & { quotes: QuoteWire[] }

const LOAN_STATUS_LABEL = {
  active: "Active",
  repaid: "Repaid",
  liquidated: "Liquidated",
  defaulted: "Defaulted",
} as const

export function BorrowerPanel({ onStatus }: { onStatus: (event: StatusEvent) => void }) {
  const [principalInput, setPrincipalInput] = useState("10000")
  const [collateralInput, setCollateralInput] = useState("10")
  const [daysInput, setDaysInput] = useState("90")
  const [myRfqs, setMyRfqs] = useState<RfqDetail[]>([])
  const [acceptedByRfqId, setAcceptedByRfqId] = useState<Record<string, QuoteWire>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [nowSec, setNowSec] = useState(() => BigInt(Math.floor(Date.now() / 1000)))

  async function refresh() {
    const all = await listRfqs()
    const mine = all.filter((r) => r.borrower.toLowerCase() === borrowerAccount.address.toLowerCase())
    const details = await Promise.all(mine.map((r) => getRfq(r.id)))
    details.sort((a, b) => b.createdAt - a.createdAt)
    setMyRfqs(details)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: poll on mount only, refresh/onStatus are stable enough for a demo
  useEffect(() => {
    refresh().catch((err) => onStatus({ kind: "error", label: "refresh RFQs", message: (err as Error).message }))
    const id = setInterval(() => {
      refresh().catch((err) => onStatus({ kind: "error", label: "refresh RFQs", message: (err as Error).message }))
    }, 3000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNowSec(BigInt(Math.floor(Date.now() / 1000))), 1000)
    return () => clearInterval(id)
  }, [])

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

  async function postRfq(e: React.FormEvent) {
    e.preventDefault()
    setBusyId("post")
    try {
      const block = await publicClient.getBlock()
      const maturity = block.timestamp + BigInt(daysInput) * 86_400n
      const rfq = await createRfq({
        borrower: borrowerAccount.address,
        loanAsset: LOAN_ASSET_ADDRESS,
        collateralAsset: COLLATERAL_ASSET_ADDRESS,
        principal: parseUnits18(principalInput),
        collateral: parseUnits18(collateralInput),
        maturity,
      })
      onStatus({ kind: "info", label: `posted RFQ ${rfq.id.slice(0, 8)}` })
      await refresh()
    } catch (err) {
      onStatus({ kind: "error", label: "post RFQ failed", message: (err as Error).message })
    } finally {
      setBusyId(null)
    }
  }

  async function accept(rfqId: string, quoteWire: QuoteWire) {
    setBusyId(quoteWire.digest)
    try {
      const onchain = wireQuoteToOnchain(quoteWire.quote)

      const approveHash = await borrowerWallet.writeContract({
        address: onchain.collateralAsset,
        abi: erc20Abi,
        functionName: "approve",
        args: [NOCTUA_ADDRESS, onchain.collateral],
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      onStatus({ kind: "tx", label: "approved collateral", hash: approveHash })

      const fillHash = await borrowerWallet.writeContract({
        address: NOCTUA_ADDRESS,
        abi: noctuaAbi,
        functionName: "fill",
        args: [onchain, quoteWire.signature],
      })
      await publicClient.waitForTransactionReceipt({ hash: fillHash })
      onStatus({ kind: "tx", label: "filled quote", hash: fillHash })

      // The chain watcher observes the on-chain Filled event and marks the RFQ filled;
      // the 3s poll above will pick up the status change.
      setAcceptedByRfqId((prev) => ({ ...prev, [rfqId]: quoteWire }))
      await refresh()
    } catch (err) {
      onStatus({ kind: "error", label: "accept failed", message: (err as Error).message })
    } finally {
      setBusyId(null)
    }
  }

  async function repay(_rfqId: string, quoteWire: QuoteWire) {
    setBusyId(`repay-${quoteWire.digest}`)
    try {
      const onchain = wireQuoteToOnchain(quoteWire.quote)

      const approveHash = await borrowerWallet.writeContract({
        address: onchain.loanAsset,
        abi: erc20Abi,
        functionName: "approve",
        args: [NOCTUA_ADDRESS, onchain.repayment],
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      onStatus({ kind: "tx", label: "approved repayment", hash: approveHash })

      const repayHash = await borrowerWallet.writeContract({
        address: NOCTUA_ADDRESS,
        abi: noctuaAbi,
        functionName: "repay",
        args: [onchain],
      })
      await publicClient.waitForTransactionReceipt({ hash: repayHash })
      onStatus({ kind: "tx", label: "repaid loan", hash: repayHash })

      // The chain watcher observes the on-chain Repaid event and flips loanStatus itself;
      // the RFQ refresh poll will pick up the change within a poll or two.
      await refresh()
    } catch (err) {
      onStatus({ kind: "error", label: "repay failed", message: (err as Error).message })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="panel">
      <h2>Borrower — {borrowerAccount.address}</h2>

      <form className="rfq-form" onSubmit={postRfq}>
        <label>
          Principal (DAI)
          <input value={principalInput} onChange={(e) => setPrincipalInput(e.target.value)} />
        </label>
        <label>
          Collateral (WETH)
          <input value={collateralInput} onChange={(e) => setCollateralInput(e.target.value)} />
        </label>
        <label>
          Term (days)
          <input value={daysInput} onChange={(e) => setDaysInput(e.target.value)} />
        </label>
        <button type="submit" disabled={busyId === "post"}>
          Post RFQ
        </button>
      </form>

      <div className="rfq-list">
        {myRfqs.length === 0 && <p className="muted">No RFQs posted yet.</p>}
        {myRfqs.map((detail) => {
          const accepted = acceptedQuoteFor(detail)
          return (
            <div className="rfq-card" key={detail.id}>
              <div className="rfq-card-header">
                <span>
                  {formatUnits18(BigInt(detail.principal))} DAI / {formatUnits18(BigInt(detail.collateral))} WETH
                </span>
                <span className={`badge badge-${detail.status}`}>{detail.status}</span>
              </div>

              {accepted && (
                <div className="loan-status">
                  {detail.loanStatus === null ? (
                    <>Loan status: pending confirmation…</>
                  ) : detail.loanStatus === "active" ? (
                    <>
                      Loan status: <strong>Active</strong>
                      <button
                        type="button"
                        disabled={busyId === `repay-${accepted.digest}`}
                        onClick={() => repay(detail.id, accepted)}
                      >
                        Repay {formatUnits18(BigInt(accepted.quote.repayment))} DAI
                      </button>
                    </>
                  ) : (
                    <>
                      Loan status: <strong>{LOAN_STATUS_LABEL[detail.loanStatus]}</strong>
                    </>
                  )}
                </div>
              )}

              {!accepted && (
                <table className="quote-table">
                  <thead>
                    <tr>
                      <th>Repayment</th>
                      <th>APR</th>
                      <th>Expires</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {detail.quotes.map((qw) => {
                      const onchain = wireQuoteToOnchain(qw.quote)
                      let apr = "—"
                      try {
                        apr = formatAprPct(impliedAprWad(onchain, nowSec))
                      } catch {
                        apr = "—"
                      }
                      return (
                        <tr key={qw.digest}>
                          <td>{formatUnits18(onchain.repayment)} DAI</td>
                          <td>{apr}</td>
                          <td>{formatCountdown(onchain.expiry, nowSec)}</td>
                          <td>
                            <button
                              type="button"
                              disabled={busyId === qw.digest || detail.status !== "open"}
                              onClick={() => accept(detail.id, qw)}
                            >
                              Accept
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {detail.quotes.length === 0 && (
                      <tr>
                        <td colSpan={4} className="muted">
                          Waiting for quotes…
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
