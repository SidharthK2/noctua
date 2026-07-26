# Noctua

RFQ-based fixed-rate lending denominated in **[KRWQ](https://www.krwq.cash/)** — the Korean won
stablecoin issued by Frax × IQ: lend/borrow terms are negotiated off-chain via request-for-quote,
signed as EIP-712 intents, and settled and enforced on-chain with collateral, maturity, and
repayment. Fully oracle-free — no price is ever read on-chain.

Inspired by [Morpho Midnight](https://morpho.org/whitepapers/midnight-whitepaper.pdf) (fixed-rate, fixed-maturity credit) and Polymarket-style off-chain order flow with on-chain settlement. Built as an engineering artifact, not for TVL.

## KRWQ, the loan asset

Every loan on Noctua is originated and repaid in KRWQ ("the digital won"), so principal,
repayment, and the implied rate are all won-denominated; collateral is a separate ERC-20 (WETH in
the demo). KRWQ is 100%+ asset-backed with monthly attestations, uses 18 on-chain decimals, and
is live on Base mainnet at
[`0x370923D39f139C64813f173a1bf0b4f9Ba36a24f`](https://basescan.org/token/0x370923D39f139C64813f173a1bf0b4f9Ba36a24f)
(plus Ethereum, Polygon, Fraxtal, and others). The contracts are asset-agnostic — KRWQ is wired
in at the deployment/config layer, and testnets use a mintable mock with the same symbol and
decimals since the real token is mainnet-only. Amounts render won-style throughout the UI: whole
units, no fractional digits.

## Flow

1. A **borrower** posts an RFQ (loan asset, collateral asset, principal, collateral, maturity) to the RFQ service.
2. **Makers** (lenders) respond with signed `Quote`s — EIP-712 structs naming exact `principal` and `repayment` amounts. The rate is implicit, zero-coupon style: no APR, day-count, or rate math exists on-chain.
3. The borrower picks a quote and calls `Noctua.fill(quote, signature)`: collateral is escrowed, principal moves maker → borrower.
4. Until maturity (inclusive) anyone may `repay` on the borrower's behalf: repayment moves to the maker, collateral returns to the borrower.
5. Enforcement is default-at-maturity only: strictly after maturity, anyone may trigger the permissionless `claimDefault`; all collateral goes to the maker, pawn-style (surplus is forfeited to the lender).
6. Makers cancel a single quote by hash, or all outstanding quotes by bumping their nonce.

Every loan is pawn-style — repay by maturity or forfeit the collateral. Quotes may be reserved for a specific `taker` or left open.

## Why oracle-free

The contract never needs to know a price. Every code path — `fill`, `repay`, `claimDefault`,
`cancel` — is triggered by a signature check or a timestamp comparison. The pawn model removed
the only operation that ever needed a price mid-term (margin liquidation), so there is no
"is this position healthy?" question left for the protocol to answer, and no feed to
manipulate, go stale, or depend on keepers.

The oracle problem doesn't disappear — it moves to the maker. Someone still decides that the
offered collateral justifies the principal; that price judgment is made **once, at quote time**,
by the party bearing the risk, using whatever data they trust. The consequences of getting it
wrong are scoped accordingly:

- A bad or manipulated price hurts only that maker on that quote — there is no shared feed
  whose failure cascades across every position in the system.
- Price movement *during* the term is unhedgeable through the protocol: if collateral crashes
  below the repayment value mid-term, the lender can do nothing until maturity. That path risk
  is priced upfront, via wider spreads and deeper overcollateralization.

So the design eliminates the **oracle as trusted shared infrastructure** — the entire attack
and liveness surface — not the need for price *information*. It privatizes pricing to the
counterparty who is paid to get it right. It's the same trade a pawnshop makes, and it's why
fixed terms matter: the risk window is bounded, so it's priceable.

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

## Deploying to production (Base mainnet)

Production runs against the real, already-deployed tokens — no mocks anywhere, and the UI hides
the faucet on chain 8453:

- **KRWQ** (loan asset): [`0x370923D39f139C64813f173a1bf0b4f9Ba36a24f`](https://basescan.org/token/0x370923D39f139C64813f173a1bf0b4f9Ba36a24f)
- **WETH** (collateral): [`0x4200000000000000000000000000000000000006`](https://basescan.org/token/0x4200000000000000000000000000000000000006)

Both are baked into the web app as chain-8453 defaults, so after deploying the contract only the
Noctua address needs configuring.

1. **Deploy `Noctua`** — the one contract, nothing else. Put a funded deployer key (real ETH on
   Base), a Base RPC URL, and an Etherscan key in `contracts/.env` (see `.env.example`), then
   from `contracts/`:

   ```shell
   forge script script/DeployMainnet.s.sol:DeployMainnet \
     --rpc-url base --broadcast --verify
   ```

   The script logs the Noctua address and deploy block — those are `NOCTUA_ADDRESS` and
   `START_BLOCK` below.

2. **Configure the service and web app** with the production values shown in the hosting section
   below.

## Deploying to testnet (Base Sepolia)

The testnet flow deploys mintable mock tokens alongside the contract so the faucet works without
real funds. The web app and RFQ service are fully env-driven — no code changes are needed,
only the steps below.

1. **Deploy the contracts.** Put a funded deployer key and an Etherscan v2 API key (one key
   covers all chains) in `contracts/.env` (see `contracts/.env.example`):

   ```shell
   DEPLOYER_PRIVATE_KEY=0x...
   ETHERSCAN_API_KEY=...
   ```

   Then, from `contracts/` (forge auto-loads `.env`; the RPC alias and Etherscan config live in
   `foundry.toml`):

   ```shell
   forge script script/DeployTestnet.s.sol:DeployTestnet \
     --rpc-url base_sepolia --broadcast --verify
   ```

   This deploys `Noctua` and two `ERC20Mock`s ("Noctua Mock KRWQ" / "KRWQ", "Noctua Mock WETH" /
   "WETH"). The script logs all three addresses. Note the block number the deploy transactions
   landed in — that's `START_BLOCK` below.

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
   VITE_LOAN_ADDRESS=<deployed KRWQ mock address>
   VITE_COLLATERAL_ADDRESS=<deployed WETH mock address>
   ```

   Connect an injected wallet (MetaMask or similar) on Base Sepolia and use the **faucet** button
   in the header to mint test KRWQ/WETH to your connected address — `ERC20Mock.mint` is public, so
   no separate funding step is required.

## Hosting (Railway or any Docker host)

The repo ships a single-service `Dockerfile`: one Node process serves the API (under `/api`),
runs the chain watcher, and serves the built frontend from the same origin (no CORS, no second
deployment). SQLite lives on a volume.

On Railway: create a service from this repo (it picks up the `Dockerfile`), attach a **volume
mounted at `/data`**, and set these service variables — the `VITE_*` ones are consumed at image
build time, the rest at runtime:

```shell
# build-time (frontend)
VITE_APP_URL=https://<public domain>          # absolute URLs for the OG/SEO tags
VITE_CHAIN_ID=8453
VITE_NOCTUA_ADDRESS=<mainnet Noctua address>
# VITE_RPC_URL is optional (defaults to the public Base RPC); VITE_LOAN_ADDRESS /
# VITE_COLLATERAL_ADDRESS are not needed on 8453 — KRWQ and WETH are built-in defaults.
# runtime (service + watcher)
CHAIN_ID=8453
RPC_URL=<keyed RPC, e.g. Alchemy Base>
NOCTUA_ADDRESS=<mainnet Noctua address>
START_BLOCK=<deploy block>
CONFIRMATIONS=1
# eth_getLogs range per call — set to your RPC provider's cap (Alchemy free tier: 10)
MAX_BLOCK_RANGE=10
WATCH_INTERVAL_MS=10000
```

For a testnet deployment instead, swap in `CHAIN_ID`/`VITE_CHAIN_ID=84532` and the mock-token
addresses from the testnet deploy (`VITE_LOAN_ADDRESS`/`VITE_COLLATERAL_ADDRESS` are required
there — no built-in defaults off mainnet).

`PORT`, `DB_PATH=/data/noctua-rfq.db`, and `STATIC_DIR` are preset in the image. `GET /health`
responds for healthchecks. The watcher does sustained `eth_getLogs` polling — use a keyed
endpoint (Alchemy/QuickNode) for `RPC_URL`; public RPCs rate-limit it into stalls.

## Design choices (MVP)

- **Implicit zero-coupon over stored-rate or tick-priced units**: quotes state amounts, not rates. Tick/unit fungibility (Midnight-style) only pays off in an open orderbook; RFQ quotes are bespoke, so the machinery is dropped.
- **Oracle-free by design**: no `oracle` field, no LTV math, no margin-call path — the trust surface is two signatures and the chain. See [Why oracle-free](#why-oracle-free).
- **Whole-position fills** — no partial fills.
- **Calldata-over-storage**: the contract stores only `(borrower, status)` per loan; `repay`/`claimDefault` take the full `Quote` again and re-derive its hash.
- Fee-on-transfer / rebasing tokens unsupported. Reentrancy handled by strict checks-effects-interactions.

Not yet built: partial fills, Postgres persistence (SQLite via `node:sqlite` today), maker deposits/reputation, surplus auction on default.
