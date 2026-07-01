# Noctua

RFQ-based fixed-rate lending: lend/borrow terms are negotiated off-chain via request-for-quote, signed as EIP-712 intents, and settled and enforced on-chain with collateral, maturity, repayment, and liquidation.

Inspired by [Morpho Midnight](https://morpho.org/whitepapers/midnight-whitepaper.pdf) (fixed-rate, fixed-maturity credit) and Polymarket-style off-chain order flow with on-chain settlement. Built as an engineering artifact, not for TVL.

## Flow

1. A **borrower** posts an RFQ (loan asset, collateral asset, principal, collateral, maturity) to the RFQ service.
2. **Makers** (lenders) respond with signed `Quote`s — EIP-712 structs naming exact `principal` and `repayment` amounts. The rate is implicit, zero-coupon style: no APR, day-count, or rate math exists on-chain.
3. The borrower picks a quote and calls `Noctua.fill(quote, signature)`: collateral is escrowed, principal moves maker → borrower.
4. Until maturity (inclusive) anyone may `repay` on the borrower's behalf: repayment moves to the maker, collateral returns to the borrower.
5. Enforcement:
   - **Margin liquidation** (pre-maturity, only if the quote names an oracle): once `repayment > collateralValue × lltv`, a liquidator pays the full repayment and takes the full collateral. The incentive is the spread — no bonus factor.
   - **Default** (strictly after maturity): anyone may trigger `claimDefault`; all collateral goes to the maker, pawn-style (surplus is forfeited to the lender).
6. Makers cancel a single quote by hash, or all outstanding quotes by bumping their nonce.

Quotes with `oracle = address(0)` are pawn-style loans enforced by default-at-maturity only. Quotes may be reserved for a specific `taker` or left open.

## Layout

| Path | What |
| --- | --- |
| `contracts/` | Foundry — `Noctua.sol` settlement + enforcement, `QuoteLib` EIP-712 hashing |
| `packages/shared` | TS types, EIP-712 signing/hashing helpers (viem), must byte-match `QuoteLib` |
| `services/rfq` | Minimal RFQ service — in-memory MVP: post RFQs, collect signed quotes, validate signatures |

## Develop

```shell
pnpm install
pnpm build:contracts && pnpm test:contracts   # forge
pnpm -r build && pnpm -r test                 # TS workspaces
pnpm check                                    # biome
```

## Deploying to Base Sepolia

The web app and RFQ service are fully env-driven — no code changes are needed for a real deploy,
only the steps below.

1. **Deploy the contracts.** From the repo root, with a funded Base Sepolia deployer key:

   ```shell
   PRIVATE_KEY=0x... forge script contracts/script/DeployTestnet.s.sol:DeployTestnet \
     --root contracts --rpc-url https://sepolia.base.org --broadcast
   ```

   This deploys `Noctua`, two `ERC20Mock`s ("Noctua Mock DAI" / "DAI", "Noctua Mock WETH" /
   "WETH"), and an `OracleMock` seeded at `2000e36` (1 WETH = 2000 DAI). The script logs all four
   addresses. Note the block number the deploy transactions landed in — that's `START_BLOCK`
   below.

2. **Configure the RFQ service** (`services/rfq`, config in `src/config.ts`, all env-driven already):

   ```shell
   RPC_URL=https://sepolia.base.org \
   CHAIN_ID=84532 \
   NOCTUA_ADDRESS=<deployed Noctua address> \
   START_BLOCK=<deploy block number> \
   CONFIRMATIONS=1 \
     node services/rfq/dist/index.js
   ```

   `CONFIRMATIONS=1` (or a few more) is a reasonable default on a public testnet, vs. `0` for
   instant-finality local anvil.

3. **Configure the web app** (`services/web`, see `.env.example`):

   ```shell
   VITE_CHAIN_ID=84532
   VITE_RPC_URL=https://sepolia.base.org
   VITE_NOCTUA_ADDRESS=<deployed Noctua address>
   VITE_LOAN_ADDRESS=<deployed DAI mock address>
   VITE_COLLATERAL_ADDRESS=<deployed WETH mock address>
   VITE_ORACLE_ADDRESS=<deployed OracleMock address>
   ```

   Connect an injected wallet (MetaMask or similar) on Base Sepolia and use the **faucet** button
   in the header to mint test DAI/WETH to your connected address — `ERC20Mock.mint` is public, so
   no separate funding step is required.

## Design choices (MVP)

- **Implicit zero-coupon over stored-rate or tick-priced units**: quotes state amounts, not rates. Tick/unit fungibility (Midnight-style) only pays off in an open orderbook; RFQ quotes are bespoke, so the machinery is dropped.
- **Whole-position fills and liquidations** — no partial fills, no close factor.
- **Calldata-over-storage**: the contract stores only `(borrower, status)` per loan; `repay`/`liquidate`/`claimDefault` take the full `Quote` again and re-derive its hash.
- Fee-on-transfer / rebasing tokens unsupported. Reentrancy handled by strict checks-effects-interactions.

Not yet built: partial fills, Postgres persistence (SQLite via `node:sqlite` today), maker deposits/reputation, surplus auction on default.
