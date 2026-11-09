// Runs as a Kubernetes CronJob. Silence means no: unanswered sponsor requests are deleted.
import { es } from './es.js'
import { log } from './telemetry.js'

const res = await es.deleteByQuery({
  index: 'consent_requests',
  query: { bool: { filter: [{ terms: { status: ['pending', 'deferred'] } }, { range: { expiresAt: { lt: 'now' } } }] } },
})
log.info({ deleted: res.deleted }, 'deleted expired consent requests')
