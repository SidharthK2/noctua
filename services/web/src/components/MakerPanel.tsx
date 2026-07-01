import { signQuote } from "@noctua/shared"
import { useEffect, useState } from "react"
import { maxUint256, zeroAddress } from "viem"
import type { RfqWire } from "../api.js"
import { listRfqs, submitQuote } from "../api.js"
import { CHAIN_ID, NOCTUA_ADDRESS, ORACLE_ADDRESS } from "../lib/addresses.js"
import { erc20Abi, noctuaAbi } from "../lib/abi.js"
import { makerAccount, makerWallet, publicClient } from "../lib/clients.js"
import { formatUnits18, parseUnits18 } from "../lib/format.js"
import type { StatusEvent } from "../lib/status.js"

const DEFAULT_LLTV = 800_000_000_000_000_000n // 0.8e18

export function MakerPanel({ onStatus }: { onStatus: (event: StatusEvent) => void }) {
  const [openRfqs, setOpenRfqs] = useState<RfqWire[]>([])
  const [quotingId, setQuotingId] = useState<string | null>(null)
  const [repaymentInput, setRepaymentInput] = useState("")
  const [expiryMinutesInput, setExpiryMinutesInput] = useState("60")
  const [oracleOn, setOracleOn] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function refresh() {
    setOpenRfqs(await listRfqs("open"))
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: poll on mount only, refresh/onStatus are stable enough for a demo
  useEffect(() => {
    refresh().catch((err) => onStatus({ kind: "error", label: "refresh open RFQs", message: (err as Error).message }))
    const id = setInterval(() => {
      refresh().catch((err) => onStatus({ kind: "error", label: "refresh open RFQs", message: (err as Error).message }))
    }, 3000)
    return () => clearInterval(id)
  }, [])

  function startQuote(rfq: RfqWire) {
    setQuotingId(rfq.id)
    const defaultRepayment = (BigInt(rfq.principal) * 104n) / 100n
    setRepaymentInput(formatUnits18(defaultRepayment))
    setExpiryMinutesInput("60")
    setOracleOn(true)
  }

  async function sendQuote(rfq: RfqWire) {
    setBusyId(rfq.id)
    try {
      const approveHash = await makerWallet.writeContract({
        address: rfq.loanAsset,
        abi: erc20Abi,
        functionName: "approve",
        args: [NOCTUA_ADDRESS, maxUint256],
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      onStatus({ kind: "tx", label: "approved loan asset", hash: approveHash })

      const nonce = await publicClient.readContract({
        address: NOCTUA_ADDRESS,
        abi: noctuaAbi,
        functionName: "nonces",
        args: [makerAccount.address],
      })
      const block = await publicClient.getBlock()
      const expiry = block.timestamp + BigInt(expiryMinutesInput) * 60n

      const quote = {
        maker: makerAccount.address,
        taker: rfq.borrower,
        loanAsset: rfq.loanAsset,
        collateralAsset: rfq.collateralAsset,
        oracle: oracleOn ? ORACLE_ADDRESS : zeroAddress,
        principal: BigInt(rfq.principal),
        repayment: parseUnits18(repaymentInput),
        collateral: BigInt(rfq.collateral),
        lltv: oracleOn ? DEFAULT_LLTV : 0n,
        maturity: BigInt(rfq.maturity),
        expiry,
        nonce,
      }

      const signature = await signQuote(makerAccount, quote, CHAIN_ID, NOCTUA_ADDRESS)
      await submitQuote(rfq.id, { ...quote, signature })
      onStatus({ kind: "info", label: `sent quote for RFQ ${rfq.id.slice(0, 8)}` })
      setQuotingId(null)
    } catch (err) {
      onStatus({ kind: "error", label: "send quote failed", message: (err as Error).message })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="panel">
      <h2>Maker — {makerAccount.address}</h2>

      <div className="rfq-list">
        {openRfqs.length === 0 && <p className="muted">No open RFQs.</p>}
        {openRfqs.map((rfq) => (
          <div className="rfq-card" key={rfq.id}>
            <div className="rfq-card-header">
              <span>
                {formatUnits18(BigInt(rfq.principal))} DAI / {formatUnits18(BigInt(rfq.collateral))} WETH /{" "}
                {rfq.borrower.slice(0, 8)}…
              </span>
              {quotingId !== rfq.id && (
                <button type="button" onClick={() => startQuote(rfq)}>
                  Quote
                </button>
              )}
            </div>

            {quotingId === rfq.id && (
              <div className="quote-form">
                <label>
                  Repayment (DAI)
                  <input value={repaymentInput} onChange={(e) => setRepaymentInput(e.target.value)} />
                </label>
                <label>
                  Expiry (minutes)
                  <input value={expiryMinutesInput} onChange={(e) => setExpiryMinutesInput(e.target.value)} />
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" checked={oracleOn} onChange={(e) => setOracleOn(e.target.checked)} />
                  Oracle-backed (lltv 0.8)
                </label>
                <div className="quote-form-actions">
                  <button type="button" disabled={busyId === rfq.id} onClick={() => sendQuote(rfq)}>
                    Sign &amp; send quote
                  </button>
                  <button type="button" onClick={() => setQuotingId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
