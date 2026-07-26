import { ConnectButton } from "@rainbow-me/rainbowkit"
import { Loader2 } from "lucide-react"
import { Toaster } from "sonner"
import { useAccount } from "wagmi"
import { BorrowerPanel } from "./components/BorrowerPanel.js"
import { MakerPanel } from "./components/MakerPanel.js"
import { Button } from "./components/ui/button.js"
import { addressConfigResult, NOCTUA_ADDRESS } from "./lib/addresses.js"
import { ACTIVE_CHAIN, IS_MAINNET } from "./lib/chain.js"
import { useFaucetMutation } from "./lib/queries.js"
import { notifyStatus } from "./lib/status.js"

const EXPLORER_URL = ACTIVE_CHAIN.blockExplorers?.default.url

/** Rendered instead of the app when the active chain isn't 31337 (anvil) and any of the
 * `VITE_*` contract address env vars are missing — anvil defaults only apply locally. */
function ConfigErrorPage({ missing }: { missing: string[] }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-sm">
        <h1 className="mb-2 text-base font-semibold text-red-900">Missing configuration</h1>
        <p className="mb-3 text-red-700">
          Chain {ACTIVE_CHAIN.id} ({ACTIVE_CHAIN.name}) needs contract addresses set explicitly —
          the anvil defaults only apply on chain 31337.
        </p>
        <p className="mb-1.5 text-red-700">Set these environment variables and reload:</p>
        <ul className="list-inside list-disc space-y-0.5 font-mono text-xs text-red-700">
          {missing.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function FaucetButton() {
  const { isConnected } = useAccount()
  const faucet = useFaucetMutation(notifyStatus)

  // Mainnet uses the real KRWQ and WETH — there is nothing to mint.
  if (IS_MAINNET || !isConnected) return null

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="text-neutral-500 hover:text-neutral-700"
      disabled={faucet.isPending}
      onClick={() => faucet.mutate()}
    >
      {faucet.isPending && <Loader2 className="size-3.5 animate-spin" />}
      faucet
    </Button>
  )
}

/** First-visit landing moment: what this is and why to trust it, with the connect CTA.
 * The open request book stays browsable below — it's public data. */
function Hero() {
  return (
    <section className="border-b border-neutral-200 px-6 py-14 text-center">
      <h2 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-neutral-900">
        The digital won, lent at fixed rates.
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-base text-neutral-500">
        Borrowers post requests, lenders answer with signed quotes, and the winning terms are
        escrowed and enforced on Base — repay by maturity or the collateral settles the debt.
      </p>
      <div className="mt-7 flex justify-center">
        <ConnectButton label="Connect a wallet to start" showBalance={false} />
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        {["Fixed rate, fixed maturity", "Oracle-free by design", "Built on KRWQ by Frax × IQ"].map(
          (chip) => (
            <span
              key={chip}
              className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600"
            >
              {chip}
            </span>
          ),
        )}
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-8 gap-y-2 border-t border-neutral-200 px-6 py-4 text-xs text-neutral-500">
      <span>Noctua — fixed-rate credit in KRWQ, the digital won · {ACTIVE_CHAIN.name}</span>
      <div className="flex items-center gap-4">
        <a
          href="https://www.krwq.cash"
          target="_blank"
          rel="noreferrer"
          className="transition-colors hover:text-neutral-900"
        >
          KRWQ ↗
        </a>
        {EXPLORER_URL && (
          <a
            href={`${EXPLORER_URL}/address/${NOCTUA_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-neutral-900"
          >
            Contract ↗
          </a>
        )}
      </div>
    </footer>
  )
}

export function App() {
  const { isConnected } = useAccount()

  if (!addressConfigResult.ok) {
    return <ConfigErrorPage missing={addressConfigResult.missing} />
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <img src="/brand/krwq-symbol.svg" alt="KRWQ" className="h-8 w-auto" />
          <div>
            <h1 className="text-base font-semibold tracking-tight text-neutral-900">Noctua</h1>
            <p className="text-xs text-neutral-500">Fixed-rate credit in KRWQ — the digital won</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FaucetButton />
          {/* RainbowKit owns connect/disconnect, the account modal, and the wrong-network state
              (its chain chip turns red and opens the switch modal). */}
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </header>

      {!isConnected && <Hero />}

      <main
        className={
          isConnected
            ? "mx-auto grid w-full max-w-screen-2xl flex-1 grid-cols-1 items-start gap-6 p-6 lg:grid-cols-2"
            : "mx-auto w-full max-w-3xl flex-1 p-6"
        }
      >
        <MakerPanel onStatus={notifyStatus} />
        {isConnected && <BorrowerPanel onStatus={notifyStatus} />}
      </main>

      <Footer />
      <Toaster position="bottom-right" theme="light" />
    </div>
  )
}
