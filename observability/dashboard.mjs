// "Confer: event health" as code. Each row below is one panel: [title, unit, [legend, PromQL]...].
// Dash0 dashboards are Perses documents; the boilerplate around each query is generated at the bottom.
const api = 'service_name="dex-api", otel_span_kind="SERVER", http_route=~"/api/.*"' // real API routes, not probes
const spans = (extra = '') => `{otel_metric_name="dash0.spans", ${api}${extra}}`
const duration = (labels) => `{otel_metric_name="dash0.spans.duration", ${labels}}`
const count = (metric, by) => `sum by (${by}) (increase({otel_metric_name="${metric}"}[5m]))`
const vital = (name) => `histogram_quantile(0.75, sum(rate({otel_metric_name="dash0.web.vitals.${name}", service_name="dex-web"}[5m])))`
const slo = (metric) => `{otel_metric_name="dash0.slo.${metric}", slo="confer-api-fast"}`

const panels = [
  ['Requests per minute, by route', 'decimal', ['{{http_route}}', `sum by (http_route) (rate(${spans()}[5m])) * 60`]],
  ['p95 latency by route', 'milliseconds', ['{{http_route}}', `histogram_quantile(0.95, sum by (http_route) (rate(${duration(api)}[5m]))) * 1000`]],
  ['Error rate', 'percent-decimal', ['errors / requests', `(sum(rate(${spans(', otel_span_status_code="ERROR"')}[5m])) or vector(0)) / sum(rate(${spans()}[5m]))`]],
  ['Elasticsearch p95 latency, by operation', 'milliseconds', ['{{db_operation_name}}', `histogram_quantile(0.95, sum by (db_operation_name) (rate(${duration('service_name="dex-api", db_system_name="elasticsearch"')}[5m]))) * 1000`]],
  ['SLO: share of requests that succeed in under 2s', 'percent-decimal', ['last 28 days', `last_over_time(${slo('success_ratio')}[30m])`], ['target', slo('target')]],
  ['SLO burn rate (1 = budget runs out)', 'decimal', ['fast burn', slo('burn_rate.fast')], ['slow burn', slo('burn_rate.slow')]],
  ['Scans', 'decimal', ['{{kind}} {{source}}', count('confer.scans', 'kind, source')], ['{{kind}} (v1 catches)', count('dex.catches', 'kind')]],
  ['Shares and unshares', 'decimal', ['shared via {{via}}', count('confer.shares', 'via')], ['unshared', `sum(increase({otel_metric_name="confer.unshares"}[5m]))`]],
  ['Booth requests, by action', 'decimal', ['{{action}}', count('confer.requests', 'action')]],
  ['Sealed envelope reads, by reason', 'decimal', ['{{reason}}', count('confer.vault.reads', 'reason')]],
  ['Web vitals p75 (dex-web RUM)', 'seconds', ['LCP', vital('lcp')], ['INP', vital('inp')]],
  ['Page views and browser errors (dex-web RUM)', 'decimal', ['page views', `sum(increase({otel_metric_name="dash0.web.page_views", service_name="dex-web"}[5m]))`], ['errors', `sum(increase({otel_metric_name="dash0.web.errors", service_name="dex-web"}[5m]))`]],
]

const query = ([seriesNameFormat, query]) => ({ kind: 'TimeSeriesQuery', spec: { plugin: { kind: 'PrometheusTimeSeriesQuery', spec: { query, seriesNameFormat } } } })
export const dashboard = {
  kind: 'Dashboard',
  metadata: { name: 'confer-event-health' },
  spec: {
    display: { name: 'Confer: event health', description: 'Is the event app healthy, and is the product being used? Applied from observability/ in the repo.' },
    duration: '1h',
    refreshInterval: '30s',
    panels: Object.fromEntries(panels.map(([name, unit, ...queries], i) => [`p${i}`, {
      kind: 'Panel',
      spec: { display: { name }, plugin: { kind: 'TimeSeriesChart', spec: { legend: { position: 'bottom' }, yAxis: { format: { unit } } } }, queries: queries.map(query) },
    }])),
    // Two panels per row on a 24-column grid.
    layouts: [{ kind: 'Grid', spec: { items: panels.map((_, i) => ({ x: (i % 2) * 12, y: Math.floor(i / 2) * 7, width: 12, height: 7, content: { $ref: `#/spec/panels/p${i}` } })) } }],
  },
}
