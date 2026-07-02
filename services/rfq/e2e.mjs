// End-to-end smoke test: RFQ service -> signed quote -> on-chain fill -> repay.
import { readFileSync } from "node:fs"
import { createPublicClient, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { foundry } from "viem/chains"
import { signQuote } from "@noctua/shared"

const API = "http://localhost:3901/api"
const NOCTUA = "0x5FbDB2315678afecb367f032d93F642f64180aa3"
const LOAN = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
const COLL = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"
const OUT = "/Users/sid/repos/eth/noctua/contracts/out"

const noctuaAbi = JSON.parse(readFileSync(`${OUT}/Noctua.sol/Noctua.json`, "utf8")).abi
const erc20Abi = JSON.parse(readFileSync(`${OUT}/ERC20Mock.sol/ERC20Mock.json`, "utf8")).abi

const maker = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")
const borrower = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d")
const pub = createPublicClient({ chain: foundry, transport: http() })
const wallets = {
  maker: createWalletClient({ account: maker, chain: foundry, transport: http() }),
  borrower: createWalletClient({ account: borrower, chain: foundry, transport: http() }),
}

async function tx(who, address, abi, functionName, args) {
  const hash = await wallets[who].writeContract({ address, abi, functionName, args })
  const receipt = await pub.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`)
  return receipt
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log(`ok: ${msg}`)
}
const api = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`)
  return json
}

const WAD = 10n ** 18n
const principal = 10_000n * WAD
const repayment = 10_400n * WAD
const collateral = 10n * WAD

// funding + approvals
await tx("maker", LOAN, erc20Abi, "mint", [maker.address, principal])
await tx("borrower", LOAN, erc20Abi, "mint", [borrower.address, repayment - principal])
await tx("borrower", COLL, erc20Abi, "mint", [borrower.address, collateral])
await tx("maker", LOAN, erc20Abi, "approve", [NOCTUA, principal])
await tx("borrower", COLL, erc20Abi, "approve", [NOCTUA, collateral])
await tx("borrower", LOAN, erc20Abi, "approve", [NOCTUA, repayment])

const now = (await pub.getBlock()).timestamp
const maturity = now + 90n * 86_400n

// 1. borrower posts an RFQ
const rfq = await api("POST", "/rfqs", {
  borrower: borrower.address,
  loanAsset: LOAN,
  collateralAsset: COLL,
  principal: principal.toString(),
  collateral: collateral.toString(),
  maturity: maturity.toString(),
})
assert(rfq.id && rfq.status === "open", `RFQ posted (id ${rfq.id})`)

// 2. maker discovers it and responds with a signed quote
const open = await api("GET", "/rfqs?status=open")
assert(open.some((r) => r.id === rfq.id), "RFQ visible in open list")
const quote = {
  maker: maker.address,
  taker: borrower.address,
  loanAsset: LOAN,
  collateralAsset: COLL,
  principal,
  repayment,
  collateral,
  maturity,
  expiry: now + 3_600n,
  nonce: 0n,
}
const signature = await signQuote(maker, quote, 31337, NOCTUA)
const submitted = await api("POST", `/rfqs/${rfq.id}/quotes`, {
  ...Object.fromEntries(Object.entries(quote).map(([k, v]) => [k, v.toString()])),
  signature,
})
assert(submitted.digest || submitted.quoteHash || submitted.hash, "service accepted the signed quote")

// tampered signature must be rejected
const badSig = signature.slice(0, -2) + (signature.endsWith("00") ? "01" : "00")
const rejected = await fetch(`${API}/rfqs/${rfq.id}/quotes`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    ...Object.fromEntries(Object.entries(quote).map(([k, v]) => [k, v.toString()])),
    expiry: (quote.expiry + 1n).toString(),
    signature: badSig,
  }),
})
assert(!rejected.ok, "service rejects a tampered signature")

// 3. borrower fetches quotes for the RFQ, takes the best one
const listed = await api("GET", `/rfqs/${rfq.id}/quotes`)
assert(listed.length === 1, "one valid quote listed for the RFQ")
const q = { ...listed[0].quote, signature: listed[0].signature }
const onchainQuote = {
  maker: q.maker,
  taker: q.taker,
  loanAsset: q.loanAsset,
  collateralAsset: q.collateralAsset,
  principal: BigInt(q.principal),
  repayment: BigInt(q.repayment),
  collateral: BigInt(q.collateral),
  maturity: BigInt(q.maturity),
  expiry: BigInt(q.expiry),
  nonce: BigInt(q.nonce),
}

// 4. settle on-chain
const bal = (token, holder) =>
  pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [holder] })
const borrowerLoanBefore = await bal(LOAN, borrower.address)
const borrowerCollBefore = await bal(COLL, borrower.address)
const escrowBefore = await bal(COLL, NOCTUA)
await tx("borrower", NOCTUA, noctuaAbi, "fill", [onchainQuote, q.signature])
assert((await bal(LOAN, borrower.address)) - borrowerLoanBefore === principal, "fill: borrower received principal")
assert((await bal(COLL, NOCTUA)) - escrowBefore === collateral, "fill: collateral escrowed in Noctua")

const quoteHash = await pub.readContract({ address: NOCTUA, abi: noctuaAbi, functionName: "hashQuote", args: [onchainQuote] })
let loan = await pub.readContract({ address: NOCTUA, abi: noctuaAbi, functionName: "loans", args: [quoteHash] })
assert(loan[0].toLowerCase() === borrower.address.toLowerCase() && loan[1] === 1, "loan Active with correct borrower")

// 5. the chain watcher observes the Filled event and closes the RFQ itself — no client call.
const expectedDigest = await pub.readContract({
  address: NOCTUA,
  abi: noctuaAbi,
  functionName: "hashQuote",
  args: [onchainQuote],
})
const deadline = Date.now() + 10_000
let watched
while (Date.now() < deadline) {
  watched = await api("GET", `/rfqs/${rfq.id}`)
  if (watched.status === "filled") break
  await new Promise((r) => setTimeout(r, 300))
}
assert(watched?.status === "filled", "watcher observed the Filled event and closed the RFQ")
assert(watched.filledBy === expectedDigest, "RFQ records the filling quote's digest")
assert(!!watched.fillTxHash, "RFQ records the fill transaction hash")

// 6. repay before maturity
const makerLoanBefore = await bal(LOAN, maker.address)
await tx("borrower", NOCTUA, noctuaAbi, "repay", [onchainQuote])
assert((await bal(LOAN, maker.address)) - makerLoanBefore === repayment, "repay: maker received full repayment")
assert((await bal(COLL, borrower.address)) === borrowerCollBefore, "repay: collateral returned to borrower")
loan = await pub.readContract({ address: NOCTUA, abi: noctuaAbi, functionName: "loans", args: [quoteHash] })
assert(loan[1] === 2, "loan status Repaid")

// the watcher observes the Repaid event and flips the RFQ's loanStatus itself — no client call.
const repayDeadline = Date.now() + 10_000
let watchedAfterRepay
while (Date.now() < repayDeadline) {
  watchedAfterRepay = await api("GET", `/rfqs/${rfq.id}`)
  if (watchedAfterRepay.loanStatus === "repaid") break
  await new Promise((r) => setTimeout(r, 300))
}
assert(watchedAfterRepay?.loanStatus === "repaid", "watcher observed Repaid and set loanStatus")
assert(!!watchedAfterRepay.loanTxHash, "RFQ records the repay transaction hash")

// 7. maker cancels a second, unfilled quote on-chain; the watcher should observe the
// Cancelled event and remove it from the RFQ's quote listing.
const now2 = (await pub.getBlock()).timestamp
const maturity2 = now2 + 90n * 86_400n
const rfq2 = await api("POST", "/rfqs", {
  borrower: borrower.address,
  loanAsset: LOAN,
  collateralAsset: COLL,
  principal: principal.toString(),
  collateral: collateral.toString(),
  maturity: maturity2.toString(),
})
const quote2 = {
  maker: maker.address,
  taker: borrower.address,
  loanAsset: LOAN,
  collateralAsset: COLL,
  principal,
  repayment,
  collateral,
  maturity: maturity2,
  expiry: now2 + 3_600n,
  nonce: 0n,
}
const signature2 = await signQuote(maker, quote2, 31337, NOCTUA)
await api("POST", `/rfqs/${rfq2.id}/quotes`, {
  ...Object.fromEntries(Object.entries(quote2).map(([k, v]) => [k, v.toString()])),
  signature: signature2,
})
const listedBeforeCancel = await api("GET", `/rfqs/${rfq2.id}/quotes`)
assert(listedBeforeCancel.length === 1, "second quote listed before cancellation")

await tx("maker", NOCTUA, noctuaAbi, "cancel", [quote2])

const cancelDeadline = Date.now() + 10_000
let listedAfterCancel = listedBeforeCancel
while (Date.now() < cancelDeadline) {
  listedAfterCancel = await api("GET", `/rfqs/${rfq2.id}/quotes`)
  if (listedAfterCancel.length === 0) break
  await new Promise((r) => setTimeout(r, 300))
}
assert(listedAfterCancel.length === 0, "watcher observed Cancelled and removed the quote from listing")

console.log("\nE2E PASS: RFQ -> signed quote -> on-chain fill -> repay, plus watcher-driven close/cancel, all assertions green")
