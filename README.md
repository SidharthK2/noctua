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

## Design choices (MVP)

- **Implicit zero-coupon over stored-rate or tick-priced units**: quotes state amounts, not rates. Tick/unit fungibility (Midnight-style) only pays off in an open orderbook; RFQ quotes are bespoke, so the machinery is dropped.
- **Whole-position fills and liquidations** — no partial fills, no close factor.
- **Calldata-over-storage**: the contract stores only `(borrower, status)` per loan; `repay`/`liquidate`/`claimDefault` take the full `Quote` again and re-derive its hash.
- Fee-on-transfer / rebasing tokens unsupported. Reentrancy handled by strict checks-effects-interactions.

Not yet built: partial fills, chain watcher for the RFQ service (close-on-fill is on trust), Postgres persistence, maker deposits/reputation, surplus auction on default.
