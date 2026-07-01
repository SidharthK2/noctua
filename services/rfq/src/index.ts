import { serve } from "@hono/node-server"
import { createPublicClient, http } from "viem"
import { createApp } from "./app.js"
import { loadConfig } from "./config.js"
import { SqliteRfqStore } from "./sqlite-store.js"
import { ChainWatcher } from "./watcher.js"

const config = loadConfig()
const store = new SqliteRfqStore(config.dbPath)
const app = createApp(config, store)

const publicClient = createPublicClient({ transport: http(config.rpcUrl) })
const watcher = new ChainWatcher(publicClient, config.noctuaAddress, store, {
  pollIntervalMs: config.watchIntervalMs,
  confirmations: config.confirmations,
  startBlock: config.startBlock,
})
watcher.start()

const fromBlock = store.getCursor() ?? config.startBlock
console.log(`watcher: polling ${config.rpcUrl} from block ${fromBlock}`)

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`@noctua/rfq listening on http://localhost:${info.port}`)
})
