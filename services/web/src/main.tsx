import "@fontsource-variable/geist"
import "@fontsource-variable/geist-mono"
import "@rainbow-me/rainbowkit/styles.css"
import { lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit"
import { QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { WagmiProvider } from "wagmi"
import { App } from "./App.js"
import { ACTIVE_CHAIN } from "./lib/chain.js"
import { queryClient } from "./lib/query-client.js"
import { wagmiConfig } from "./lib/wagmi.js"

const root = document.getElementById("root")
if (!root) throw new Error("missing #root element")

// RainbowKit theme in KRWQ brand: cobalt accent on the light palette.
const theme = lightTheme({
  accentColor: "#0047ab",
  accentColorForeground: "white",
  borderRadius: "large",
})

createRoot(root).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider initialChain={ACTIVE_CHAIN} theme={theme} modalSize="compact">
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
