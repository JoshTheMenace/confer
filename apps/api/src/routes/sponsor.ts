import type { estypes } from '@elastic/elasticsearch'
import { Hono } from 'hono'
import { auth, type Me } from '../auth.js'
import { cardsFor, profilesById, sponsorAggQuery, tally, type ConsentRequest } from '../consent.js'
import { es } from '../es.js'

type Terms = estypes.AggregationsStringTermsAggregate
const buckets = (a?: Terms) => ((a?.buckets ?? []) as estypes.AggregationsStringTermsBucket[]).map((b) => ({ term: String(b.key), count: b.doc_count }))

export const sponsor = new Hono<{ Variables: { me: Me } }>()
  .use(auth)
  .get('/leads', async (c) => {
    const me = c.var.me
    if (me.kind !== 'sponsor') return c.json({ error: 'sponsors only' }, 403)
    const [scans, requests] = await Promise.all([
      es.search<{ caught: string }>({ index: 'catches', size: 10000, _source: ['caught'], query: { term: { catcher: me.id } } }),
      es.search<ConsentRequest>({ index: 'consent_requests', size: 10000, query: { term: { sponsor: me.id } } }),
    ])
    const caught = scans.hits.hits.map((h) => h._source!.caught)
    const reqs = requests.hits.hits.map((h) => h._source!)
    const granted = reqs.filter((r) => r.status === 'granted').map((r) => r.attendee)
    const [leads, agg] = await Promise.all([
      profilesById(granted).then((p) => cardsFor(me, p)),
      es.search<unknown, Record<'interests' | 'lookingFor', Terms>>(sponsorAggQuery(caught)),
    ])
    return c.json({
      leads,
      stats: { scans: caught.length, ...tally(reqs.map((r) => r.status)), interests: buckets(agg.aggregations?.interests), lookingFor: buckets(agg.aggregations?.lookingFor) },
    })
  })
