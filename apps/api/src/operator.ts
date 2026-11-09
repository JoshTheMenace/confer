// The consent operator: runs as its own Deployment and keeps Kubernetes RBAC in step with the shares in Elasticsearch.
// A share to a booth becomes a Role + RoleBinding in that booth's namespace; Unshare or expiry deletes them.
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { trace } from '@opentelemetry/api'
import { allShares, bulk, pairId } from './consent.js'
import type { Profile } from './contract.js'
import { es, ix } from './es.js'
import { applyGrant, boothNamespace, createNamespace, deleteGrant, grantName, grantOf, kubernetes, listGrants, listNamespaces, reconcile } from './k8s.js'
import { grants, log, span, traceId } from './telemetry.js'

const pass = () => span('grants.reconcile', {}, async () => {
  const sponsors = await es.search<Profile>({ index: ix.profiles, size: 1000, _source: ['displayName'], query: { term: { kind: 'sponsor' } } })
  const booths = new Map(sponsors.hits.hits.map((h) => [h._id!, h._source!.displayName]))
  const [shared, found, namespaces] = await Promise.all([
    allShares({ terms: { to: [...booths.keys()] } }),
    listGrants(), listNamespaces(),
  ])
  const shares = new Map(shared.map((s) => [s, grantOf(s)]))
  const plan = reconcile([...shares.values()], found, Date.now())

  const missing = new Set([...plan.create, ...plan.update].map((g) => g.booth).filter((id) => !namespaces.includes(boothNamespace(id))))
  await Promise.all([...missing].map((id) => createNamespace(id, booths.get(id) ?? '')))
  await Promise.all([...plan.create, ...plan.update].map(applyGrant))
  await Promise.all(plan.revoke.map(deleteGrant))
  // Expired: the share leaves Elasticsearch too, with the same deletion receipt an Unshare writes, so it is revoked everywhere.
  const expired = [...shares].filter(([, g]) => plan.expire.includes(g)).map(([s]) => s), at = new Date().toISOString()
  await bulk(expired.flatMap((s) => [
    { delete: { _index: ix.shares, _id: pairId(s.from, s.to) } },
    { create: { _index: ix.receipts, _id: `${pairId(s.from, s.to)}_${s.at}_expired` } }, { owner: s.from, who: s.to, type: 'unshared', fields: s.fields, at, traceId: traceId() },
  ]))
  await Promise.all(plan.expire.map((g) => deleteGrant({ namespace: boothNamespace(g.booth), name: grantName(g.attendee) })))

  const done = { created: plan.create, updated: plan.update, revoked: plan.revoke, expired: plan.expire }
  const counts = Object.fromEntries(Object.entries(done).map(([action, list]) => [action, list.length]))
  for (const [action, n] of Object.entries(counts)) if (n) grants.add(n, { action })
  trace.getActiveSpan()?.setAttributes({ shares: shares.size, ...counts })
  // Ids and counts only: never names or contact data.
  if (Object.values(counts).some(Boolean))
    log.info({ ...counts, grants: [...plan.create, ...plan.update, ...plan.expire].map((g) => `${g.booth}/${g.attendee}`), deleted: plan.revoke.map((f) => `${f.namespace}/${f.name}`) }, 'grants reconciled')
})

if (!kubernetes()) {
  log.error('no Kubernetes API: run in a pod with a service account, or set K8S_API_URL')
  process.exit(1)
}
const stop = new AbortController(), every = Number(process.env.RECONCILE_SECONDS ?? 3) * 1000
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => stop.abort())
log.info({ every }, 'consent operator started')
while (!stop.signal.aborted) {
  await pass().catch((err) => log.error({ err: err?.message }, 'reconcile failed'))
  writeFileSync(join(tmpdir(), 'alive'), '') // the heartbeat the Kubernetes probes read: the loop is turning, even when a pass failed
  await sleep(every, undefined, { signal: stop.signal }).catch(() => {})
}
log.info('consent operator stopped')
// OTel's register traps SIGTERM to flush telemetry but never exits (see index.ts).
setTimeout(() => process.exit(0), 1000)
