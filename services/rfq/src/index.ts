import { serve } from "@hono/node-server"
import { createApp } from "./app.js"
import { loadConfig } from "./config.js"
import { SqliteRfqStore } from "./sqlite-store.js"

const config = loadConfig()
const store = new SqliteRfqStore(config.dbPath)
const app = createApp(config, store)

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`@noctua/rfq listening on http://localhost:${info.port}`)
})
