import { useEffect, useState } from "react"
import { COLLATERAL_ASSET_ADDRESS, LOAN_ASSET_ADDRESS, NOCTUA_ADDRESS } from "../lib/addresses.js"
import { erc20Abi } from "../lib/abi.js"
import { borrowerAccount, makerAccount, publicClient } from "../lib/clients.js"
import { formatUnits18, shortAddr } from "../lib/format.js"
import type { StatusEvent } from "../lib/status.js"

type Balances = {
  makerLoan: bigint
  makerColl: bigint
  borrowerLoan: bigint
  borrowerColl: bigint
  escrowLoan: bigint
  escrowColl: bigint
}

const ZERO: Balances = {
  makerLoan: 0n,
  makerColl: 0n,
  borrowerLoan: 0n,
  borrowerColl: 0n,
  escrowLoan: 0n,
  escrowColl: 0n,
}

export function StatusStrip({ lastEvent }: { lastEvent: StatusEvent | null }) {
  const [balances, setBalances] = useState<Balances>(ZERO)

  useEffect(() => {
    const balanceOf = (token: `0x${string}`, holder: `0x${string}`) =>
      publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [holder] })

    const refresh = async () => {
      const [makerLoan, makerColl, borrowerLoan, borrowerColl, escrowLoan, escrowColl] = await Promise.all([
        balanceOf(LOAN_ASSET_ADDRESS, makerAccount.address),
        balanceOf(COLLATERAL_ASSET_ADDRESS, makerAccount.address),
        balanceOf(LOAN_ASSET_ADDRESS, borrowerAccount.address),
        balanceOf(COLLATERAL_ASSET_ADDRESS, borrowerAccount.address),
        balanceOf(LOAN_ASSET_ADDRESS, NOCTUA_ADDRESS),
        balanceOf(COLLATERAL_ASSET_ADDRESS, NOCTUA_ADDRESS),
      ])
      setBalances({ makerLoan, makerColl, borrowerLoan, borrowerColl, escrowLoan, escrowColl })
    }

    refresh().catch(() => undefined)
    const id = setInterval(() => refresh().catch(() => undefined), 3000)
    return () => clearInterval(id)
  }, [])

  return (
    <footer className="status-strip">
      <div className="balances">
        <div>
          <span className="label">Maker</span>
          <span>{formatUnits18(balances.makerLoan)} DAI</span>
          <span>{formatUnits18(balances.makerColl)} WETH</span>
        </div>
        <div>
          <span className="label">Borrower</span>
          <span>{formatUnits18(balances.borrowerLoan)} DAI</span>
          <span>{formatUnits18(balances.borrowerColl)} WETH</span>
        </div>
        <div>
          <span className="label">Noctua escrow</span>
          <span>{formatUnits18(balances.escrowLoan)} DAI</span>
          <span>{formatUnits18(balances.escrowColl)} WETH</span>
        </div>
      </div>
      <div className="last-event">
        {lastEvent === null && <span className="muted">no activity yet</span>}
        {lastEvent?.kind === "tx" && (
          <span className="event-tx">
            {lastEvent.label}: {shortAddr(lastEvent.hash)}
          </span>
        )}
        {lastEvent?.kind === "info" && <span className="event-info">{lastEvent.label}</span>}
        {lastEvent?.kind === "error" && (
          <span className="event-error">
            {lastEvent.label}: {lastEvent.message}
          </span>
        )}
      </div>
    </footer>
  )
}
