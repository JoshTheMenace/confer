import { metrics } from '@opentelemetry/api'
import pino from 'pino'

// Logs go to stdout AND to Dash0 (pino is auto-instrumented: trace_id/span_id are attached).
// Rule: never log contact fields. See .gitar/rules/no-pii-in-telemetry.md
export const log = pino({ level: process.env.LOG_LEVEL ?? 'info' })

const meter = metrics.getMeter('dex')
export const catches = meter.createCounter('dex.catches', { description: 'Badges caught, by catcher kind' })
export const consentDecisions = meter.createCounter('dex.consent.decisions', { description: 'Consent requests resolved, by outcome' })
