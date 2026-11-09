import { Hono } from 'hono'
import { es } from './es.js'
import { matches } from './routes/matches.js'

export const app = new Hono()
  .get('/healthz', (c) => c.text('ok'))
  .get('/readyz', async (c) => ((await es.ping().catch(() => false)) ? c.text('ok') : c.text('elasticsearch unreachable', 503)))
  .get('/api/config', (c) => c.json({ dash0: { url: process.env.DASH0_WEB_ENDPOINT ?? '', token: process.env.DASH0_WEB_TOKEN ?? '' } }))
  .get('/api/status', async (c) => {
    const info = await es.info().catch(() => null)
    return c.json({
      elastic: info ? `${info.cluster_name} v${info.version.number}` : null,
      dash0: !!process.env.OTEL_EXPORTER_OTLP_HEADERS,
      openai: !!process.env.OPENAI_API_KEY,
    })
  })
  .route('/api/matches', matches)

export type AppType = typeof app
