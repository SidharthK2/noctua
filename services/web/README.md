# @noctua/web

Demo frontend for Noctua. A single connected wallet drives both personas — the **Maker** panel
lists all open RFQs (including the connected wallet's own) and signs quotes as the connected
account via an EIP-712 wallet popup; the **Borrower** panel shows RFQs posted by the connected
address and lets it accept quotes / repay loans. Wallet connection is injected-only (MetaMask,
Coinbase Wallet extension, etc.) via `wagmi` — no WalletConnect, no RainbowKit.

Defaults to **Base Sepolia** (chain id `84532`); also supports a local anvil chain (`31337`) for
fully offline development. Both the active chain and the four contract addresses are
environment-driven — see `.env.example`.

## Demo runbook (local anvil)

Run each step in its own terminal, from the repo root.

### 1. Start anvil

```sh
anvil
```

### 2. Deploy the demo contracts

```sh
./services/web/scripts/deploy-demo.sh
```

This deploys `Noctua`, two `ERC20Mock`s ("Mock DAI" / "Mock WETH"), and an `OracleMock` (price
`2000e36`) from anvil account #0, in the exact order that produces the deterministic addresses
already baked into `src/lib/addresses.ts` as defaults for chain `31337`. It also mints starter
balances to anvil accounts #0/#1 — but since the app no longer embeds those accounts' keys, use
the **faucet** button in the header (see below) to fund whichever wallet you actually connect
with instead.

If your anvil account #0 wasn't at nonce 0 (e.g. you reused a dirty anvil instance), the deployed
addresses will differ from the defaults — export `VITE_NOCTUA_ADDRESS`, `VITE_LOAN_ADDRESS`,
`VITE_COLLATERAL_ADDRESS`, `VITE_ORACLE_ADDRESS` to match before starting the web app.

### 3. Start the RFQ service

```sh
pnpm --filter @noctua/rfq build
PORT=3901 NOCTUA_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3 CHAIN_ID=31337 \
  node services/rfq/dist/index.js
```

### 4. Start the web app

```sh
VITE_CHAIN_ID=31337 pnpm --filter @noctua/web dev
```

Open http://localhost:5173. The dev server proxies `/api/*` to `http://localhost:3901/*` (see
`vite.config.ts`) so the browser never needs CORS headers from the RFQ service. Connect a wallet
pointed at `http://localhost:8545` (e.g. import one of anvil's printed private keys into
MetaMask), then use the **faucet** button in the header to mint test DAI/WETH.

## Deploying to Base Sepolia

No code changes are needed — see the root README's "Deploying to Base Sepolia" section for the
full walkthrough (forge deploy script, RFQ service env vars, web app env vars). In short: deploy
via `contracts/script/DeployTestnet.s.sol`, then set `VITE_CHAIN_ID=84532`,
`VITE_RPC_URL=https://sepolia.base.org`, and the four `VITE_*_ADDRESS` vars from the deploy output
(see `.env.example`). Missing address vars on a non-anvil chain render a full-page config error
instead of silently falling back to anvil addresses.

## Walkthrough

1. Click **Connect wallet** in the header (injected wallet only — MetaMask, Coinbase Wallet
   extension, etc.). If the wallet is on the wrong chain, a red banner offers to switch.
2. Use the **faucet** button (visible once connected) to mint 100,000 DAI and 100 WETH to your
   connected address — `ERC20Mock.mint` is public, so no separate funding step is required.
3. In the **Borrower** panel, post an RFQ (defaults: 10,000 DAI principal, 10 WETH collateral,
   90-day term). The maturity is computed from the chain's latest block timestamp.
4. In the **Maker** panel, the open RFQ appears within ~3s (polling) — including your own, since
   one wallet plays both personas. Click **Quote**, adjust the repayment / expiry / oracle toggle
   if desired, and **Sign & send** — this triggers an EIP-712 signature popup and approves the
   maker's loan-asset (DAI) allowance to `Noctua`.
5. Back in the **Borrower** panel, the quote appears with its implied APR and expiry countdown.
   Click **Accept** — this approves the collateral (WETH) to `Noctua`, calls `fill`, and closes
   the RFQ.
6. The loan is now `Active`. Click **Repay** to approve the loan asset (DAI) for the repayment
   amount and call `repay`.
7. The bottom status strip shows live DAI/WETH balances for your wallet and the `Noctua`
   contract's escrow balance, plus the most recent transaction hash or error.

## Layout

- `src/lib/chain.ts` — active chain (`VITE_CHAIN_ID`) and RPC URL (`VITE_RPC_URL`) resolution.
- `src/lib/wagmi.ts` — injected-only wagmi config for Base Sepolia + anvil.
- `src/lib/addresses.ts` — contract addresses (env-overridable; anvil defaults only on chain 31337).
- `src/lib/abi.ts` — hand-trimmed ABI fragments for the functions this demo calls.
- `src/lib/format.ts` — 18-decimal amount formatting/parsing, APR percentage, countdowns.
- `src/lib/quote.ts` — wire (decimal-string) quote -> on-chain `Quote` struct conversion.
- `src/lib/queries.ts` — TanStack Query hooks wrapping the RFQ API and on-chain reads/writes,
  driven by the connected wagmi wallet.
- `src/api.ts` — typed fetch wrappers over the RFQ service's HTTP API.
- `src/components/MakerPanel.tsx`, `BorrowerPanel.tsx`, `StatusStrip.tsx`, `App.tsx`.
