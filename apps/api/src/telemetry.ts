import { metrics, SpanStatusCode, trace, type Attributes } from '@opentelemetry/api'
import pino from 'pino'

// Logs go to stdout AND to Dash0 (pino is auto-instrumented: trace_id/span_id are attached).
// Rule: never log contact fields. See .gitar/rules/no-pii-in-telemetry.md
export const log = pino({ level: process.env.LOG_LEVEL ?? 'info' })

// Product metrics. Attributes are small fixed sets (kinds, outcomes): never ids, names or contact data.
const m = metrics.getMeter('confer')
export const scans = m.createCounter('confer.scans', { description: 'Badges scanned, by kind (peer|booth) and source (camera|manual)' })
export const shares = m.createCounter('confer.shares', { description: 'Contact cards shared, by via (manual|auto|request) and to (peer|booth)' })
export const unshares = m.createCounter('confer.unshares', { description: 'Shares taken back, by to (peer|booth)' })
export const requests = m.createCounter('confer.requests', { description: 'Booth connection requests, by action (sent|shared|ignored|muted)' })
export const vaultReads = m.createCounter('confer.vault.reads', { description: 'Reads of the sealed envelope, by reason (self|share)' })
export const commonSize = m.createHistogram('confer.common.size', { description: 'Things in common found per scan' })

const tracer = trace.getTracer('confer')
/** Wraps one business step in a span (e.g. `consent.share`), so a trace reads like the product. Attributes follow the no-PII rule. */
export const span = <T>(name: string, attributes: Attributes, fn: () => Promise<T>) =>
  tracer.startActiveSpan(name, { attributes }, (s) =>
    fn().then((v) => (s.end(), v), (err) => { s.recordException(err); s.setStatus({ code: SpanStatusCode.ERROR }); s.end(); throw err }))
/** The current trace id, stored on receipts so every "who saw my data" line is backed by a trace in Dash0. */
export const traceId = () => trace.getActiveSpan()?.spanContext().traceId
