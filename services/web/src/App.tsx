import { Loader2, Moon, X } from "lucide-react"
import { useState } from "react"
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi"
import { AddressPill } from "./components/address-pill.js"
import { BorrowerPanel } from "./components/BorrowerPanel.js"
import { MakerPanel } from "./components/MakerPanel.js"
import { StatusStrip } from "./components/StatusStrip.js"
import { Button } from "./components/ui/button.js"
import { addressConfigResult, NOCTUA_ADDRESS } from "./lib/addresses.js"
import { ACTIVE_CHAIN } from "./lib/chain.js"
import { useFaucetMutation } from "./lib/queries.js"
import type { StatusEvent } from "./lib/status.js"

/** Rendered instead of the app when the active chain isn't 31337 (anvil) and any of the four
 * `VITE_*` contract address env vars are missing — anvil defaults only apply locally. */
function ConfigErrorPage({ missing }: { missing: string[] }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-red-900/40 bg-red-950/20 p-6 text-sm">
        <h1 className="mb-2 text-base font-semibold text-red-100">Missing configuration</h1>
        <p className="mb-3 text-red-300">
          Chain {ACTIVE_CHAIN.id} ({ACTIVE_CHAIN.name}) needs contract addresses set explicitly —
          the anvil defaults only apply on chain 31337.
        </p>
        <p className="mb-1.5 text-red-300">Set these environment variables and reload:</p>
        <ul className="list-inside list-disc space-y-0.5 font-mono text-xs text-red-200">
          {missing.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function WalletControl() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-1">
        <AddressPill address={address} />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-zinc-500 hover:text-red-400"
          title="Disconnect"
          onClick={() => disconnect()}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <Button
      type="button"
      size="sm"
      disabled={isPending || connectors.length === 0}
      onClick={() => connect({ connector: connectors[0] })}
    >
      {isPending && <Loader2 className="size-3.5 animate-spin" />}
      Connect wallet
    </Button>
  )
}

function WrongNetworkBanner() {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || chainId === ACTIVE_CHAIN.id) return null

  return (
    <div className="flex items-center justify-center gap-3 border-b border-red-900/40 bg-red-950/30 px-6 py-1.5 text-xs text-red-300">
      <span className="size-1.5 shrink-0 rounded-full bg-red-400" />
      Wrong network — connected to chain {chainId ?? "unknown"}.
      <Button
        type="button"
        size="xs"
        variant="destructive"
        disabled={isPending}
        onClick={() => switchChain({ chainId: ACTIVE_CHAIN.id })}
      >
        {isPending && <Loader2 className="size-3 animate-spin" />}
        Switch to {ACTIVE_CHAIN.name}
      </Button>
    </div>
  )
}

function FaucetButton({ onStatus }: { onStatus: (event: StatusEvent) => void }) {
  const { isConnected } = useAccount()
  const faucet = useFaucetMutation(onStatus)

  if (!isConnected) return null

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="text-zinc-500 hover:text-zinc-300"
      disabled={faucet.isPending}
      onClick={() => faucet.mutate()}
    >
      {faucet.isPending && <Loader2 className="size-3.5 animate-spin" />}
      faucet
    </Button>
  )
}

export function App() {
  const [lastEvent, setLastEvent] = useState<StatusEvent | null>(null)

  if (!addressConfigResult.ok) {
    return <ConfigErrorPage missing={addressConfigResult.missing} />
  }

  return (
    <div className="flex min-h-screen flex-col pb-20">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-800/80 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
            <Moon className="size-4 text-emerald-400" fill="currentColor" strokeWidth={0} />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-zinc-100">Noctua</h1>
            <p className="text-xs text-zinc-500">RFQ fixed-rate lending</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FaucetButton onStatus={setLastEvent} />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-xs tabular-nums text-zinc-400">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            chain {ACTIVE_CHAIN.id}
          </span>
          <AddressPill address={NOCTUA_ADDRESS} />
          <WalletControl />
        </div>
      </header>

      <WrongNetworkBanner />

      <main className="mx-auto grid w-full max-w-screen-2xl flex-1 grid-cols-1 items-start gap-6 p-6 lg:grid-cols-2">
        <MakerPanel onStatus={setLastEvent} />
        <BorrowerPanel onStatus={setLastEvent} />
      </main>

      <StatusStrip lastEvent={lastEvent} />
    </div>
  )
}
