import { trace } from '@opentelemetry/api'
import { Hono } from 'hono'
import { routePath } from 'hono/route'
import { es } from './es.js'
import { catchRoutes } from './routes/catch.js'
import { consent } from './routes/consent.js'
import { me } from './routes/me.js'
import { sponsor } from './routes/sponsor.js'
import { booths, discover, prospects } from './routes/discover.js'

// Probes used to ping Elasticsearch on every call (683 pings at ~560ms, found by Dash0 Agent0); check in the background instead.
let esReady = false
const checkEs = () => es.ping().then((ok) => (esReady = ok), () => (esReady = false))
void checkEs()
setInterval(checkEs, 15_000).unref()

export const app = new Hono()
  // Name server spans by route pattern ("POST /api/consent/:id"), so Dash0 can group them and alert per route.
  .use(async (c, next) => {
    await next()
    const route = routePath(c, -1)
    trace.getActiveSpan()?.setAttribute('http.route', route).updateName(`${c.req.method} ${route}`)
  })
  .get('/healthz', (c) => c.text('ok'))
  .get('/readyz', (c) => (esReady ? c.text('ok') : c.text('elasticsearch unreachable', 503)))
  .get('/api/config', (c) => c.json({ dash0: { url: process.env.DASH0_WEB_ENDPOINT ?? '', token: process.env.DASH0_WEB_TOKEN ?? '' } }))
  .get('/api/status', async (c) => {
    const info = await es.info().catch(() => null)
    return c.json({
      elastic: info ? `${info.cluster_name} v${info.version.number}` : null,
      dash0: !!process.env.OTEL_EXPORTER_OTLP_HEADERS,
      openai: !!process.env.OPENAI_API_KEY,
    })
  })
  .route('/api/me', me)
  .route('/api/catch', catchRoutes)
  .route('/api/consent', consent)
  .route('/api/sponsor', sponsor)
  .route('/api/discover', discover)
  .route('/api/booths', booths)
  .route('/api/booth', prospects)

export type AppType = typeof app
