// `pnpm obs:apply`: pushes the SLO, the check rule and the dashboard to Dash0.
// Safe to re-run: each one is PUT under a fixed id (its "origin"), so a second run updates instead of duplicating.
// Needs a Dash0 auth token with "All permissions" (an ingest-only token gets 403).
import { readFileSync } from 'node:fs'
import { dashboard } from './dashboard.mjs'

// `||`, not `??`: a line left blank in .env arrives as an empty string.
const base = process.env.DASH0_API_URL || 'https://api.us-west-2.aws.dash0.com'
const token = process.env.DASH0_API_TOKEN || /Bearer ([^,\s]+)/.exec(process.env.OTEL_EXPORTER_OTLP_HEADERS ?? '')?.[1]
const dataset = process.env.DASH0_DATASET || 'default'
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
const json = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'))

for (const [path, body] of [
  ['/api/slos/confer-api-fast', json('./slo.json')],
  ['/api/alerting/check-rules/confer-slo-burn', json('./check-rule.json')],
  ['/api/dashboards/confer-event-health', dashboard],
]) {
  const res = await fetch(`${base}${path}?dataset=${dataset}`, { method: 'PUT', headers, body: JSON.stringify(body) })
  console.log(res.status, path, res.ok ? '' : await res.text())
  if (!res.ok) process.exitCode = 1
}

// The link the Event Pulse shows: put this line in .env.
const dashboards = await (await fetch(`${base}/api/dashboards?dataset=${dataset}`, { headers })).json()
const id = Array.isArray(dashboards) && dashboards.find((d) => d.origin === 'confer-event-health')?.id
if (id) console.log(`DASH0_DASHBOARD_URL=https://app.dash0.com/goto/dashboards?dashboard_id=${id}`)
