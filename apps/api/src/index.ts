import { serve } from '@hono/node-server'
import OpenAI from 'openai'
import { Openlit } from 'openlit'
import { app } from './app.js'
import { warm } from './common.js'
import { ensureIndices } from './es.js'
import { log } from './telemetry.js'

// captureMessageContent off: prompts contain names, and spans leave for a third party (Dash0).
Openlit.init({ applicationName: process.env.OTEL_SERVICE_NAME ?? 'dex-api', instrumentations: { openai: OpenAI }, captureMessageContent: false })
await ensureIndices().catch((err) => log.error({ err }, 'index bootstrap failed'))
void warm().catch((err) => log.warn({ err: err?.name }, 'reranker not warmed'))
const server = serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, ({ port }) => log.info({ port }, 'api listening'))
// OTel's register traps SIGTERM to flush telemetry but never exits, so Kubernetes would wait out the full grace period.
process.on('SIGTERM', () => server.close(() => setTimeout(() => process.exit(0), 1000)))
