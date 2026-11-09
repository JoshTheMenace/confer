// Runs as a Kubernetes CronJob. Silence means no: unanswered message requests are deleted,
// and a day after the event ends every photo leaves the vault.
import { eventEndsAt } from './consent.js'
import { es, ix } from './es.js'
import { log } from './telemetry.js'

const requests = await es.deleteByQuery({ index: ix.threads, query: { bool: { filter: [{ term: { status: 'request' } }, { range: { expiresAt: { lt: 'now' } } }] } } })
log.info({ deleted: requests.deleted }, 'deleted expired requests')

if (Date.now() > eventEndsAt() + 864e5) {
  // `photo` is stored but not indexed, so there is nothing to query on: visit every vault doc and skip the ones without one.
  const [photos] = await Promise.all([
    es.updateByQuery({ index: ix.vault, script: { source: "if (ctx._source.remove('photo') == null) ctx.op = 'noop'" } }),
    es.updateByQuery({ index: ix.profiles, query: { term: { hasPhoto: true } }, script: { source: 'ctx._source.hasPhoto = false' } }),
  ])
  log.info({ removed: photos.updated }, 'removed photos after the event')
}
