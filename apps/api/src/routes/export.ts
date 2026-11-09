import { trace } from '@opentelemetry/api'
import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { auth, type Me } from '../auth.js'
import { bulk, cards, relations, type Share } from '../consent.js'
import { contactFields, type Api, type Card } from '../contract.js'
import { es, ix } from '../es.js'
import { boothNamespace, canI, grantName, grantVerbs, kubernetes } from '../k8s.js'
import { log, span, traceId } from '../telemetry.js'

/** One CSV cell: quoted when needed, and never a formula (a leading = + - @ would run in a spreadsheet). */
export const cell = (value: unknown) => {
  const s = String(value ?? ''), safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}
const columns = ['name', 'role', ...contactFields, 'shared_at', 'how', 'note', 'in_common', 'allowed_uses']
const row = (card: Card, share: Share) => [
  card.name, card.theyShared?.role, ...contactFields.map((f) => card.theyShared?.contact[f]), share.at, share.via, share.note,
  card.common.map((c) => (c.kind === 'same' ? c.theirs : `${c.theirs} (related to ${c.mine})`)).join('; '), grantVerbs(share).join(' '),
]

/** Everyone who shares with this booth right now, and what Kubernetes says about each. */
async function leads(viewer: Me) {
  const shared = await es.search<Share>({ index: ix.shares, size: 1000, _source: ['from'], query: { term: { to: viewer.id } } })
  // Shares are re-read by id: someone who unshared a second ago is not a lead, whatever search still says.
  const { rels } = await relations(viewer, shared.hits.hits.map((h) => h._source!.from))
  const current = rels.filter((r) => r.subject.kind === 'attendee' && r.shareIn)
  const answers = await Promise.all(current.map((r) => canI(viewer.id, 'export', r.subject.id)))
  return current.map((r, i) => ({ rel: r, share: r.shareIn!, kubernetes: answers[i] }))
}

type Env = { Variables: { me: Me } }
// Mounted beside the booth dashboard at `/api/booth`, whose own middleware may already have signed the caller in:
// a second token lookup would cost another Elasticsearch round trip.
const sponsor = createMiddleware<Env>(async (c, next) => {
  if (!c.var.me) { const refused = await auth(c, async () => {}); if (refused) return refused }
  return c.var.me.kind === 'sponsor' ? next() : c.json({ error: 'Booths only' }, 403)
})

export const boothExport = new Hono<Env>()
  .get('/export', sponsor, (c) => span('export', {}, async () => {
    const viewer = c.var.me, all = (await leads(viewer)).filter((l) => grantVerbs(l.share).includes('export'))
    // Two locks: the share in Elasticsearch (read by id above) and Kubernetes RBAC. A row Kubernetes denies is left out
    // before the vault is opened; when Kubernetes cannot be asked, the share alone decides and the header says so.
    const allowed = all.filter((l) => l.kubernetes !== 'denied'), denied = all.length - allowed.length
    const gate = kubernetes() && allowed.every((l) => l.kubernetes === 'allowed') ? 'kubernetes' : 'elasticsearch-only'
    const list = await cards(viewer, allowed.map((l) => l.rel)), at = new Date().toISOString()
    await bulk(allowed.flatMap((l) => [
      { index: { _index: ix.receipts } }, { owner: l.rel.subject.id, who: viewer.id, type: 'exported', fields: l.share.fields, at, traceId: traceId() },
    ]))
    trace.getActiveSpan()?.setAttributes({ exported: allowed.length, denied, gate })
    log.info({ booth: viewer.id, exported: allowed.length, denied, gate }, 'booth export')
    const csv = [columns, ...allowed.map((l, i) => row(list[i], l.share))].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
    return c.body(csv satisfies Api['GET /api/booth/export']['res'], 200, {
      'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="confer-leads-${at.slice(0, 10)}.csv"`, 'cache-control': 'no-store',
      'x-confer-gate': gate, 'x-confer-exported': String(allowed.length), 'x-confer-denied': String(denied),
    })
  }))
  .get('/grants', sponsor, async (c) => c.json({
    grants: (await leads(c.var.me)).map((l) => ({
      attendeeId: l.rel.subject.id, namespace: boothNamespace(c.var.me.id), binding: grantName(l.rel.subject.id), verbs: grantVerbs(l.share), kubernetes: l.kubernetes,
    })),
  } satisfies Api['GET /api/booth/grants']['res']))
