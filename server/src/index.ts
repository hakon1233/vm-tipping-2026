import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { readServerConfig } from "./config.js";
import { createStore } from "./store.js";

const config = readServerConfig(process.env);
const app = createApp({ ...config, store: createStore({ databasePath: config.databasePath }) });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`VM-tipping API listening on http://localhost:${info.port}`);
});
