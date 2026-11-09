import { trace } from '@opentelemetry/api'
import { Hono } from 'hono'
import { routePath } from 'hono/route'
import type { Api } from './contract.js'
import { es } from './es.js'
import { booth } from './routes/booth.js'
import { chats } from './routes/chats.js'
import { booths, discover, prospects } from './routes/discover.js'
import { inbox } from './routes/inbox.js'
import { me } from './routes/me.js'
import { people } from './routes/people.js'
import { pulse } from './routes/pulse.js'
import { scan } from './routes/scan.js'

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
  .get('/api/config', (c) => c.json({
    dash0: { url: process.env.DASH0_WEB_ENDPOINT ?? '', token: process.env.DASH0_WEB_TOKEN ?? '' },
    event: { name: process.env.EVENT_NAME ?? 'Cloud Native Hackathon', endsAt: process.env.EVENT_ENDS_AT ?? '2026-11-09T18:30:00-07:00' },
  } satisfies Api['GET /api/config']['res']))
  .get('/api/status', async (c) => {
    const info = await es.info().catch(() => null)
    return c.json({
      elastic: info ? `${info.cluster_name} v${info.version.number}` : null,
      dash0: !!process.env.OTEL_EXPORTER_OTLP_HEADERS,
      openai: !!process.env.OPENAI_API_KEY,
    })
  })
  .route('/api/me', me)
  .route('/api/scan', scan)
  .route('/api/people', people)
  .route('/api/inbox', inbox)
  .route('/api/chats', chats)
  .route('/api/booth', booth)
  .route('/api/booth', prospects)
  .route('/api/discover', discover)
  .route('/api/booths', booths)
  .route('/api/pulse', pulse)

export type AppType = typeof app
