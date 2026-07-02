import { readFileSync } from "node:fs"
import path from "node:path"
import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { createPublicClient, http } from "viem"
import { createApp } from "./app.js"
import { loadConfig } from "./config.js"
import { SqliteRfqStore } from "./sqlite-store.js"
import { ChainWatcher } from "./watcher.js"

const config = loadConfig()
const store = new SqliteRfqStore(config.dbPath)
const api = createApp(config, store)

const publicClient = createPublicClient({ transport: http(config.rpcUrl) })
const watcher = new ChainWatcher(publicClient, config.noctuaAddress, store, {
  pollIntervalMs: config.watchIntervalMs,
  confirmations: config.confirmations,
  startBlock: config.startBlock,
  maxBlockRange: config.maxBlockRange,
})
watcher.start()

const fromBlock = store.getCursor() ?? config.startBlock
console.log(`watcher: polling ${config.rpcUrl} from block ${fromBlock}`)

// The API mounts under /api; with STATIC_DIR set, the same process also serves the built
// frontend (single origin — no CORS, matches the vite dev proxy's URL layout).
const root = new Hono()
root.get("/health", (c) => c.json({ ok: true, chainId: config.chainId }))
root.route("/api", api)

if (config.staticDir) {
  // serveStatic resolves `root` relative to cwd, so normalize absolute paths.
  const staticRoot = path.relative(process.cwd(), config.staticDir) || "."
  const indexHtml = readFileSync(path.join(config.staticDir, "index.html"), "utf8")
  root.use("*", serveStatic({ root: staticRoot }))
  // SPA fallback: anything that isn't /api or an asset gets the app shell.
  root.get("*", (c) => c.html(indexHtml))
  console.log(`serving static frontend from ${config.staticDir}`)
}

serve({ fetch: root.fetch, port: config.port }, (info) => {
  console.log(`@noctua/rfq listening on http://localhost:${info.port}`)
})
