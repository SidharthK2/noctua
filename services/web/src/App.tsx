import { useState } from "react"
import { BorrowerPanel } from "./components/BorrowerPanel.js"
import { MakerPanel } from "./components/MakerPanel.js"
import { StatusStrip } from "./components/StatusStrip.js"
import type { StatusEvent } from "./lib/status.js"

export function App() {
  const [lastEvent, setLastEvent] = useState<StatusEvent | null>(null)

  return (
    <div className="app">
      <header className="banner">
        <strong>local demo — anvil keys</strong>
        <span>
          Maker uses anvil account #0, borrower uses anvil account #1. Private keys are the
          well-known deterministic anvil test keys — never use this pattern outside a local demo.
        </span>
      </header>

      <main className="panels">
        <MakerPanel onStatus={setLastEvent} />
        <BorrowerPanel onStatus={setLastEvent} />
      </main>

      <StatusStrip lastEvent={lastEvent} />
    </div>
  )
}
