# @noctua/web

Minimal local-only demo frontend for Noctua. Two hardcoded personas — a maker/lender (anvil
account #0) and a borrower (anvil account #1) — using embedded, well-known anvil private keys.
No wallet extension, no CORS server, no deployment: this is a click-through demo of the full
RFQ -> signed quote -> on-chain fill -> repay flow described in `services/rfq/e2e.mjs`.

**Never reuse this pattern (embedded private keys) outside a local demo.**

## Demo runbook

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
already baked into `src/lib/addresses.ts` as defaults. It also mints starter balances: 100,000 DAI
to the maker, and 100 WETH + 5,000 DAI to the borrower (so the borrower can repay the spread over
principal).

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
pnpm --filter @noctua/web dev
```

Open http://localhost:5173. The dev server proxies `/api/*` to `http://localhost:3901/*` (see
`vite.config.ts`) so the browser never needs CORS headers from the RFQ service.

## Walkthrough

1. In the **Borrower** panel, post an RFQ (defaults: 10,000 DAI principal, 10 WETH collateral,
   90-day term). The maturity is computed from the anvil chain's latest block timestamp.
2. In the **Maker** panel, the open RFQ appears within ~3s (polling). Click **Quote**, adjust the
   repayment / expiry / oracle toggle if desired, and sign & send. The maker's loan-asset (DAI)
   allowance to `Noctua` is approved on every quote submit.
3. Back in the **Borrower** panel, the quote appears with its implied APR and expiry countdown.
   Click **Accept** — this approves the collateral (WETH) to `Noctua`, calls `fill`, and closes
   the RFQ.
4. The loan is now `Active`. Click **Repay** to approve the loan asset (DAI) for the repayment
   amount and call `repay`.
5. The bottom status strip shows live DAI/WETH balances for both accounts and the `Noctua`
   contract's escrow balance, plus the most recent transaction hash or error.

## Layout

- `src/lib/addresses.ts` — chain id, contract addresses (env-overridable), embedded anvil keys.
- `src/lib/abi.ts` — hand-trimmed ABI fragments for the functions this demo calls.
- `src/lib/clients.ts` — viem public/wallet clients for the maker and borrower.
- `src/lib/format.ts` — 18-decimal amount formatting/parsing, APR percentage, countdowns.
- `src/lib/quote.ts` — wire (decimal-string) quote -> on-chain `Quote` struct conversion.
- `src/api.ts` — typed fetch wrappers over the RFQ service's HTTP API.
- `src/components/MakerPanel.tsx`, `BorrowerPanel.tsx`, `StatusStrip.tsx`, `App.tsx`.
