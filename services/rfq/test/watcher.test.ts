import type { Quote } from "@noctua/shared"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SqliteRfqStore } from "../src/sqlite-store.js"
import type { RfqStore } from "../src/store.js"
import { MemoryRfqStore } from "../src/store.js"
import { ChainWatcher } from "../src/watcher.js"

const BORROWER = "0x2222222222222222222222222222222222222222"
const LOAN_ASSET = "0x3333333333333333333333333333333333333333"
const COLLATERAL_ASSET = "0x4444444444444444444444444444444444444444"
const MAKER = "0x5555555555555555555555555555555555555555"

function baseRfq(overrides: Partial<Parameters<RfqStore["createRfq"]>[0]> = {}) {
  return {
    borrower: BORROWER,
    loanAsset: LOAN_ASSET,
    collateralAsset: COLLATERAL_ASSET,
    principal: 10_000n,
    collateral: 5_000_000_000_000_000_000n,
    maturity: 9_999_999_999n,
    ...overrides,
  } as Parameters<RfqStore["createRfq"]>[0]
}

function baseQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    maker: MAKER,
    taker: BORROWER,
    loanAsset: LOAN_ASSET,
    collateralAsset: COLLATERAL_ASSET,
    oracle: "0x0000000000000000000000000000000000000000",
    principal: 10_000n,
    repayment: 10_400n,
    collateral: 5_000_000_000_000_000_000n,
    lltv: 800_000_000_000_000_000n,
    maturity: 9_999_999_999n,
    expiry: 9_999_999_999n,
    nonce: 0n,
    ...overrides,
  }
}

function digestFor(n: number): `0x${string}` {
  return `0x${n.toString(16).padStart(64, "0")}`
}

function txFor(n: number): `0x${string}` {
  return `0x${n.toString(16).padStart(64, "0")}`
}

/** Minimal stub of viem's PublicClient — only the two methods ChainWatcher calls. */
function makeStubClient(opts: {
  blockNumber: bigint
  logsByRange?: (from: bigint, to: bigint) => unknown[]
}) {
  return {
    getBlockNumber: vi.fn().mockResolvedValue(opts.blockNumber),
    getLogs: vi
      .fn()
      .mockImplementation(async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) =>
        opts.logsByRange ? opts.logsByRange(fromBlock, toBlock) : [],
      ),
    // biome-ignore lint/suspicious/noExplicitAny: stub cast to viem's PublicClient for tests
  } as any
}

const NOCTUA_ADDRESS = "0x00000000000000000000000000000000000000C7"

const storeFactories: Array<[string, () => RfqStore]> = [
  ["MemoryRfqStore", () => new MemoryRfqStore()],
  ["SqliteRfqStore", () => new SqliteRfqStore(":memory:")],
]

describe.each(storeFactories)("ChainWatcher (%s)", (_name, makeStore) => {
  let store: RfqStore

  beforeEach(() => {
    store = makeStore()
  })

  it("Filled event marks the matching RFQ filled and records digest + tx hash", async () => {
    const rfq = store.createRfq(baseRfq())
    const digest = digestFor(1)
    store.addQuote({ digest, rfqId: rfq.id, quote: baseQuote(), signature: "0xabcd", createdAt: 0 })

    const client = makeStubClient({
      blockNumber: 10n,
      logsByRange: () => [
        {
          eventName: "Filled",
          args: { quoteHash: digest, maker: MAKER, borrower: BORROWER },
          blockNumber: 5n,
          logIndex: 0,
          transactionHash: txFor(1),
        },
      ],
    })
    const watcher = new ChainWatcher(client, NOCTUA_ADDRESS, store, {
      pollIntervalMs: 1000,
      confirmations: 0,
      startBlock: 0,
    })

    await watcher.poll()

    const updated = store.getRfq(rfq.id)
    expect(updated?.status).toBe("filled")
    expect(updated?.filledBy).toBe(digest)
    expect(updated?.fillTxHash).toBe(txFor(1))
  })

  it("Repaid event marks the filled RFQ's loanStatus repaid and records the tx hash", async () => {
    const rfq = store.createRfq(baseRfq())
    const digest = digestFor(10)
    store.addQuote({ digest, rfqId: rfq.id, quote: baseQuote(), signature: "0xabcd", createdAt: 0 })
    store.markRfqFilled(digest, txFor(10))

    const client = makeStubClient({
      blockNumber: 10n,
      logsByRange: () => [
        {
          eventName: "Repaid",
          args: { quoteHash: digest, payer: BORROWER },
          blockNumber: 5n,
          logIndex: 0,
          transactionHash: txFor(11),
        },
      ],
    })
    const watcher = new ChainWatcher(client, NOCTUA_ADDRESS, store, {
      pollIntervalMs: 1000,
      confirmations: 0,
      startBlock: 0,
    })

    await watcher.poll()

    const updated = store.getRfq(rfq.id)
    expect(updated?.loanStatus).toBe("repaid")
    expect(updated?.loanTxHash).toBe(txFor(11))
  })

  it("Liquidated event marks the filled RFQ's loanStatus liquidated and records the tx hash", async () => {
    const rfq = store.createRfq(baseRfq())
    const digest = digestFor(12)
    store.addQuote({ digest, rfqId: rfq.id, quote: baseQuote(), signature: "0xabcd", createdAt: 0 })
    store.markRfqFilled(digest, txFor(12))

    const client = makeStubClient({
      blockNumber: 10n,
      logsByRange: () => [
        {
          eventName: "Liquidated",
          args: { quoteHash: digest, liquidator: MAKER },
          blockNumber: 5n,
          logIndex: 0,
          transactionHash: txFor(13),
        },
      ],
    })
    const watcher = new ChainWatcher(client, NOCTUA_ADDRESS, store, {
      pollIntervalMs: 1000,
      confirmations: 0,
      startBlock: 0,
    })

    await watcher.poll()

    const updated = store.getRfq(rfq.id)
    expect(updated?.loanStatus).toBe("liquidated")
    expect(updated?.loanTxHash).toBe(txFor(13))
  })

  it("Defaulted event marks the filled RFQ's loanStatus defaulted and records the tx hash", async () => {
    const rfq = store.createRfq(baseRfq())
    const digest = digestFor(14)
    store.addQuote({ digest, rfqId: rfq.id, quote: baseQuote(), signature: "0xabcd", createdAt: 0 })
    store.markRfqFilled(digest, txFor(14))

    const client = makeStubClient({
      blockNumber: 10n,
      logsByRange: () => [
        {
          eventName: "Defaulted",
          args: { quoteHash: digest },
          blockNumber: 5n,
          logIndex: 0,
          transactionHash: txFor(15),
        },
      ],
    })
    const watcher = new ChainWatcher(client, NOCTUA_ADDRESS, store, {
      pollIntervalMs: 1000,
      confirmations: 0,
      startBlock: 0,
    })

    await watcher.poll()

    const updated = store.getRfq(rfq.id)
    expect(updated?.loanStatus).toBe("defaulted")
    expect(updated?.loanTxHash).toBe(txFor(15))
  })

  it("setLoanStatus is a no-op for an unknown digest", () => {
    const unknownDigest = digestFor(999)
    expect(() => store.setLoanStatus(unknownDigest, "repaid", txFor(20))).not.toThrow()
  })

  it("setLoanStatus is a no-op for an RFQ that was never filled", () => {
    const rfq = store.createRfq(baseRfq())
    const digest = digestFor(16)
    store.addQuote({ digest, rfqId: rfq.id, quote: baseQuote(), signature: "0xabcd", createdAt: 0 })
    // Quote exists but the RFQ was never filled (no filledBy set), so this must be a no-op.
    store.setLoanStatus(digest, "repaid", txFor(21))

    const updated = store.getRfq(rfq.id)
    expect(updated?.loanStatus).toBeNull()
    expect(updated?.loanTxHash).toBeNull()
  })

  it("Filled + Repaid in the same poll batch apply in (blockNumber, logIndex) order", async () => {
    const rfq = store.createRfq(baseRfq())
    const digest = digestFor(17)
    store.addQuote({ digest, rfqId: rfq.id, quote: baseQuote(), signature: "0xabcd", createdAt: 0 })

    const client = makeStubClient({
      blockNumber: 10n,
      logsByRange: () => [
        {
          eventName: "Filled",
          args: { quoteHash: digest, maker: MAKER, borrower: BORROWER },
          blockNumber: 5n,
          logIndex: 0,
          transactionHash: txFor(17),
        },
        {
          eventName: "Repaid",
          args: { quoteHash: digest, payer: BORROWER },
          blockNumber: 5n,
          logIndex: 1,
          transactionHash: txFor(18),
        },
      ],
    })
    const watcher = new ChainWatcher(client, NOCTUA_ADDRESS, store, {
      pollIntervalMs: 1000,
      confirmations: 0,
      startBlock: 0,
    })

    await watcher.poll()

    const updated = store.getRfq(rfq.id)
    expect(updated?.status).toBe("filled")
    expect(updated?.loanStatus).toBe("repaid")
    expect(updated?.loanTxHash).toBe(txFor(18))
  })

  it("Cancelled event removes the stored quote", async () => {
    const rfq = store.createRfq(baseRfq())
    const digest = digestFor(2)
    store.addQuote({ digest, rfqId: rfq.id, quote: baseQuote(), signature: "0xabcd", createdAt: 0 })
    expect(store.hasQuote(digest)).toBe(true)

    const client = makeStubClient({
      blockNumber: 10n,
      logsByRange: () => [
        {
          eventName: "Cancelled",
          args: { quoteHash: digest, maker: MAKER },
          blockNumber: 5n,
          logIndex: 0,
          transactionHash: txFor(2),
        },
      ],
    })
    const watcher = new ChainWatcher(client, NOCTUA_ADDRESS, store, {
      pollIntervalMs: 1000,
      confirmations: 0,
      startBlock: 0,
    })

    await watcher.poll()

    expect(store.hasQuote(digest)).toBe(false)
  })

  it("NonceBumped removes only stale-nonce quotes from that maker", async () => {
    const rfq = store.createRfq(baseRfq())
    const staleDigest = digestFor(3)
    const freshDigest = digestFor(4)
    const otherMakerDigest = digestFor(5)
    store.addQuote({
      digest: staleDigest,
      rfqId: rfq.id,
      quote: baseQuote({ nonce: 0n }),
      signature: "0xabcd",
      createdAt: 0,
    })
    store.addQuote({
      digest: freshDigest,
      rfqId: rfq.id,
      quote: baseQuote({ nonce: 1n }),
      signature: "0xabcd",
      createdAt: 0,
    })
    store.addQuote({
      digest: otherMakerDigest,
      rfqId: rfq.id,
      quote: baseQuote({ nonce: 0n, maker: "0x6666666666666666666666666666666666666666" }),
      signature: "0xabcd",
      createdAt: 0,
    })

    const client = makeStubClient({
      blockNumber: 10n,
      logsByRange: () => [
        {
          eventName: "NonceBumped",
          args: { maker: MAKER, newNonce: 1n },
          blockNumber: 5n,
          logIndex: 0,
          transactionHash: txFor(3),
        },
      ],
    })
    const watcher = new ChainWatcher(client, NOCTUA_ADDRESS, store, {
      pollIntervalMs: 1000,
      confirmations: 0,
      startBlock: 0,
    })

    await watcher.poll()

    expect(store.hasQuote(staleDigest)).toBe(false)
    expect(store.hasQuote(freshDigest)).toBe(true)
    expect(store.hasQuote(otherMakerDigest)).toBe(true)
  })

  it("advances the cursor to latestBlock - confirmations", async () => {
    const client = makeStubClient({ blockNumber: 100n })
    const watcher = new ChainWatcher(client, NOCTUA_ADDRESS, store, {
      pollIntervalMs: 1000,
      confirmations: 5,
      startBlock: 0,
    })

    await watcher.poll()

    expect(store.getCursor()).toBe(95n)
  })

  it("does not poll for logs or advance the cursor when from > to", async () => {
    store.setCursor(50n)
    const getLogs = vi.fn().mockResolvedValue([])
    const client = {
      getBlockNumber: vi.fn().mockResolvedValue(52n),
      getLogs,
      // biome-ignore lint/suspicious/noExplicitAny: stub cast to viem's PublicClient for tests
    } as any
    const watcher = new ChainWatcher(client, NOCTUA_ADDRESS, store, {
      pollIntervalMs: 1000,
      confirmations: 5,
      startBlock: 0,
    })

    await watcher.poll()

    expect(getLogs).not.toHaveBeenCalled()
    expect(store.getCursor()).toBe(50n)
  })

  it("guards against overlapping polls: a slow poll blocks a concurrent tick", async () => {
    vi.useFakeTimers()
    try {
      let resolveGetBlockNumber: ((value: bigint) => void) | undefined
      const getBlockNumber = vi.fn().mockImplementation(
        () =>
          new Promise<bigint>((resolve) => {
            resolveGetBlockNumber = resolve
          }),
      )
      const client = {
        getBlockNumber,
        getLogs: vi.fn().mockResolvedValue([]),
        // biome-ignore lint/suspicious/noExplicitAny: stub cast to viem's PublicClient for tests
      } as any
      const watcher = new ChainWatcher(client, NOCTUA_ADDRESS, store, {
        pollIntervalMs: 10,
        confirmations: 0,
        startBlock: 0,
      })

      watcher.start()
      await vi.advanceTimersByTimeAsync(10) // first tick starts, blocks on getBlockNumber
      await vi.advanceTimersByTimeAsync(30) // several more ticks would fire, but should be skipped
      expect(getBlockNumber).toHaveBeenCalledTimes(1)

      resolveGetBlockNumber?.(10n)
      await vi.advanceTimersByTimeAsync(0)
      expect(store.getCursor()).toBe(10n)

      watcher.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it("RPC error leaves the cursor unchanged", async () => {
    store.setCursor(20n)
    const client = {
      getBlockNumber: vi.fn().mockRejectedValue(new Error("rpc down")),
      getLogs: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: stub cast to viem's PublicClient for tests
    } as any
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const watcher = new ChainWatcher(client, NOCTUA_ADDRESS, store, {
      pollIntervalMs: 1000,
      confirmations: 0,
      startBlock: 0,
    })

    await expect(watcher.poll()).resolves.toBeUndefined()
    expect(store.getCursor()).toBe(20n)
    errSpy.mockRestore()
  })
})
