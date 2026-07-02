import type { Address, Hex, PublicClient } from "viem"
import { watcherAbi } from "./watcher-abi.js"
import type { RfqStore } from "./store.js"

export type ChainWatcherOptions = {
  pollIntervalMs: number
  confirmations: bigint | number
  startBlock: bigint | number
}

type WatcherLog = {
  eventName: "Filled" | "Cancelled" | "NonceBumped" | "Repaid" | "Defaulted"
  args: Record<string, unknown>
  blockNumber: bigint
  logIndex: number
  transactionHash: Hex
}

/**
 * Observes Noctua settlement events on-chain so RFQ closure and loan lifecycle are derived from
 * confirmed chain state rather than a trusted client call. Polls for `Filled` / `Cancelled` /
 * `NonceBumped` / `Repaid` / `Defaulted` logs, applies them to the store, and
 * advances a durable cursor.
 */
export class ChainWatcher {
  private readonly publicClient: PublicClient
  private readonly noctuaAddress: Address
  private readonly store: RfqStore
  private readonly pollIntervalMs: number
  private readonly confirmations: bigint
  private readonly startBlock: bigint

  private timer: ReturnType<typeof setInterval> | undefined
  private polling = false

  constructor(
    publicClient: PublicClient,
    noctuaAddress: Address,
    store: RfqStore,
    opts: ChainWatcherOptions,
  ) {
    this.publicClient = publicClient
    this.noctuaAddress = noctuaAddress
    this.store = store
    this.pollIntervalMs = opts.pollIntervalMs
    this.confirmations = BigInt(opts.confirmations)
    this.startBlock = BigInt(opts.startBlock)
  }

  /** Runs a single poll pass: fetch confirmed logs since the cursor and apply them in order. */
  async poll(): Promise<void> {
    try {
      const latest = await this.publicClient.getBlockNumber()
      const to = latest - this.confirmations
      const cursor = this.store.getCursor()
      const from = (cursor ?? this.startBlock - 1n) + 1n

      if (from > to) return

      const logs = (await this.publicClient.getLogs({
        address: this.noctuaAddress,
        events: watcherAbi,
        fromBlock: from,
        toBlock: to,
      })) as unknown as WatcherLog[]

      const ordered = [...logs].sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1
        return a.logIndex - b.logIndex
      })

      for (const log of ordered) {
        this.applyLog(log)
      }

      this.store.setCursor(to)
    } catch (err) {
      console.error("watcher: poll failed, will retry", err)
    }
  }

  private applyLog(log: WatcherLog): void {
    switch (log.eventName) {
      case "Filled": {
        const quoteHash = log.args.quoteHash as Hex
        this.store.markRfqFilled(quoteHash, log.transactionHash)
        break
      }
      case "Cancelled": {
        const quoteHash = log.args.quoteHash as Hex
        this.store.removeQuoteByDigest(quoteHash)
        break
      }
      case "NonceBumped": {
        const maker = log.args.maker as Address
        const newNonce = log.args.newNonce as bigint
        this.store.removeQuotesByMakerBelowNonce(maker, newNonce)
        break
      }
      case "Repaid": {
        const quoteHash = log.args.quoteHash as Hex
        this.store.setLoanStatus(quoteHash, "repaid", log.transactionHash)
        break
      }
      case "Defaulted": {
        const quoteHash = log.args.quoteHash as Hex
        this.store.setLoanStatus(quoteHash, "defaulted", log.transactionHash)
        break
      }
      default:
        break
    }
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      if (this.polling) return
      this.polling = true
      this.poll()
        .catch((err) => console.error("watcher: unexpected poll error", err))
        .finally(() => {
          this.polling = false
        })
    }, this.pollIntervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }
}
