// Discover: pure query builders and result shaping. Every search is a hybrid: keyword and semantic retrievers fused by rank.
import type { estypes } from '@elastic/elasticsearch'
import type { Card, Common, Discover, Profile, Talk, Visitor } from './contract.js'
import { ix } from './es.js'

type Q = estypes.QueryDslQueryContainer
type Doc = Omit<Profile, 'id'>
type Hit<T> = estypes.SearchHit<T>
type Mine = { id: string } & Partial<Pick<Profile, 'interests' | 'lookingFor' | 'stuckOn' | 'about' | 'starred'>>

const badge = ['tagId', 'kind', 'displayName', 'pronouns', 'approach', 'commPref']
// The filter sits inside both retrievers, so nothing out of scope can be ranked at all.
const hybrid = (text: string, fields: string[], tagField: string, tags: string[], semantic: string, filter: Q[], must_not: Q[] = []) => {
  const scoped = (must: Q) => ({ standard: { query: { bool: { must, filter, must_not } } } })
  // Tags are keywords, so free text can't match them by word: exact tags get their own boosted clause.
  const keyword = { bool: { should: [{ multi_match: { query: text, fields } }, { terms: { [tagField]: tags, boost: 3 } }] } }
  return text ? { rrf: { retrievers: [scoped(keyword), scoped({ semantic: { field: semantic, query: text } })], rank_window_size: 50 } } : scoped({ match_all: {} })
}
const highlight = (...fields: string[]) => ({ pre_tags: [''], post_tags: [''], fragment_size: 90, number_of_fragments: 1, fields: Object.fromEntries(fields.map((f) => [f, {}])) })

/** Talks, booths and people, in that order, as one msearch body. No `q`: search for what the caller told us about themselves. */
export function discoverSearches(me: Mine, q?: string) {
  const text = q?.trim() || [...(me.interests ?? []), ...(me.lookingFor ?? []), me.stuckOn ?? ''].join(' ').trim()
  const tags = q?.trim() ? [] : me.interests ?? []
  const talks = hybrid(text, ['title^3', 'abstract', 'speaker'], 'topics', tags, 'semantic', [])
  return {
    text,
    searches: [
      { index: ix.talks },
      {
        size: 6, _source: { excludes: ['semantic'] }, highlight: highlight('abstract'),
        // Free text is a question, so a cross-encoder re-reads the abstracts of the hybrid shortlist. It only reads real _source fields.
        retriever: q?.trim() ? { text_similarity_reranker: { retriever: talks, field: 'abstract', inference_id: process.env.ELASTIC_RERANKER ?? '.jina-reranker-v3', inference_text: text, rank_window_size: 20 } } : talks,
      },
      { index: ix.profiles },
      { size: 4, _source: [...badge, 'interests', 'about', 'pitch', 'attachment'], highlight: highlight('about', 'pitch'), retriever: hybrid(text, ['displayName^2', 'about', 'pitch'], 'interests', tags, 'about_semantic', [{ term: { kind: 'sponsor' } }]) },
      { index: ix.profiles },
      // People are searched by topic tags only (peer_semantic): what someone wrote about themselves must not be probeable by another attendee.
      { size: 6, _source: [...badge, 'interests'], retriever: hybrid(text, ['interests^2', 'lookingFor'], 'interests', tags, 'peer_semantic', [{ term: { kind: 'attendee' } }, { term: { discoverable: true } }], [{ ids: { values: [me.id] } }]) },
    ],
  }
}

/** Attendees who let matching booths reach out, minus the ones this booth already scanned or who muted it. */
export function prospectSearch(booth: Mine, exclude: string[]) {
  const text = [...(booth.interests ?? []), booth.about ?? ''].join(' ').trim()
  return {
    index: ix.profiles, size: 20, _source: [...badge, 'boothsSeeName', 'role', 'interests', 'about', 'stuckOn'],
    retriever: hybrid(text, ['stuckOn^2', 'about', 'role'], 'interests', booth.interests ?? [], 'about_semantic', [{ term: { kind: 'attendee' } }, { term: { openToBooths: true } }], [{ ids: { values: exclude } }]),
  }
}

/** The silhouette: badge fields only, never topics. One place, so the integrator can swap in the shared lens from consent.ts. */
export const toCard = (id: string, p: Doc): Card => ({ id, tagId: p.tagId, kind: p.kind, name: p.displayName, pronouns: p.pronouns, approach: p.approach, commPref: p.commPref, common: [] })

export const sameTags = (mine: string[] = [], theirs: string[] = []): Common[] =>
  mine.flatMap((m) => theirs.filter((t) => t.toLowerCase() === m.toLowerCase()).map((t) => ({ kind: 'same' as const, mine: m, theirs: t })))

/**
 * 0 to 100, from rank alone. A fused score is 1/(60+rank) per list, so 2/61 (first in both the keyword and the semantic list) is 100
 * and a result only one of them found lands near 50. Reranked hits carry a model score instead, so they go by position.
 */
export const fit = (h: Hit<unknown>, position: number, reranked = false) => (reranked ? Math.max(0, 97 - position * 6) : Math.min(100, Math.round(((h._score ?? 0) * 6100) / 2)))

// A crude stem (first five letters) lets "accessible" meet "Accessibility" and "secure" meet "Security".
const stems = (s: string) => (s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).map((w) => w.slice(0, 5))
/** Why this ranked: the tags the query touched (or what it covers), and the phrase that matched (or that it matched on meaning). */
export function why(tags: string[] = [], text: string, hit: Hit<unknown>) {
  const asked = new Set(stems(text)), matched = tags.filter((t) => stems(t).some((s) => asked.has(s)))
  const phrase = Object.values(hit.highlight ?? {})[0]?.[0]?.trim()
  return [matched.length ? `Matches ${matched.join(', ')}` : `Covers ${tags.slice(0, 3).join(', ')}`, phrase ? `“${phrase}”` : 'Matched on meaning, not keywords']
}

export type DiscoverHits = [talks: Hit<Omit<Talk, 'id'>>[], booths: Hit<Doc>[], people: Hit<Doc>[]]
export const toDiscover = (me: Mine, query: string, [talks, booths, people]: DiscoverHits, freeText = false): Discover => ({
  query,
  talks: talks.map((h, i) => ({ talk: { id: h._id!, ...h._source! }, fit: fit(h, i, freeText), why: why(h._source!.topics, query, h) })),
  booths: booths.map((h, i) => {
    const { interests, about, pitch, attachment } = h._source!
    return { card: { ...toCard(h._id!, h._source!), interests, about, pitch, attachment, starred: !!me.starred?.includes(h._id!) }, fit: fit(h, i), why: why(interests, query, h) }
  }),
  people: people.map((h, i) => ({ card: toCard(h._id!, h._source!), fit: fit(h, i), common: sameTags(me.interests, h._source!.interests) })),
})

/** A booth's view of a prospect: topics yes, name only if they allow it, contact never. */
export const toProspect = (h: Hit<Doc>, rank: number): Visitor => {
  const p = h._source!
  return { card: { ...toCard(h._id!, p), name: p.boothsSeeName ? p.displayName : null, role: p.role, interests: p.interests, about: p.about, stuckOn: p.stuckOn }, fit: fit(h, rank), source: 'match' }
}
