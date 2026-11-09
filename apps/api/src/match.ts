import type { estypes } from '@elastic/elasticsearch'
import { typeOf } from './dexTypes.js'

export type Profile = {
  tagId: number; kind: 'attendee' | 'sponsor'; discoverable?: boolean; interestsVisibleTo?: string[]
  displayName: string; pronouns?: string; approach?: 'open' | 'ask' | 'quiet'; commPref?: string // green
  role?: string; interests?: string[]; lookingFor?: string[]; about?: string // yellow
}

// What a peer may see: green always, yellow only if the owner shares interests with peers. Never contact.
export const peerCard = (p: Profile) => ({
  displayName: p.displayName, pronouns: p.pronouns, approach: p.approach, commPref: p.commPref,
  ...(p.interestsVisibleTo?.includes('peers') && { role: p.role, interests: p.interests ?? [], lookingFor: p.lookingFor ?? [], about: p.about }),
})
export type Card = ReturnType<typeof peerCard>

export const sharedInterests = (a: string[] = [], b: string[] = []) => {
  const theirs = new Set(b.map((i) => i.toLowerCase()))
  return a.filter((i) => theirs.has(i.toLowerCase()))
}

// Hybrid search over 'profiles' only (the vault index is never part of matchmaking).
export function buildMatchQuery(me: { id: string } & Pick<Profile, 'interests' | 'lookingFor' | 'about'>, q?: string) {
  const text = q?.trim() || [...(me.interests ?? []), me.about ?? ''].join(' ').trim()
  // Consent filter: only discoverable attendees who share interests with peers, and never yourself.
  const scoped = (query: estypes.QueryDslQueryContainer) => ({
    standard: { query: { bool: {
      must: query,
      filter: [{ term: { kind: 'attendee' } }, { term: { discoverable: true } }, { term: { interestsVisibleTo: 'peers' } }],
      must_not: [{ ids: { values: [me.id] } }],
    } } },
  })
  const lexical: estypes.QueryDslQueryContainer = { bool: { should: [
    { multi_match: { query: text, fields: ['interests^3', 'lookingFor^2', 'role', 'about'] } },
    // interests/lookingFor are keywords, so also match exact tags both ways: what I like ↔ what they want.
    ...(q ? [] : [{ terms: { interests: me.interests ?? [], boost: 3 } }, { terms: { lookingFor: me.interests ?? [], boost: 2 } }, { terms: { interests: me.lookingFor ?? [], boost: 2 } }]),
  ] } }
  return {
    index: 'profiles', size: 10, _source: { excludes: ['tokenHash'] },
    retriever: text
      ? { text_similarity_reranker: {
          // Stage 3: a cross-encoder re-reads the hybrid shortlist and reorders it by true relevance.
          retriever: { rrf: { retrievers: [scoped(lexical), scoped({ semantic: { field: 'about_semantic', query: text } })], rank_window_size: 50 } },
          field: 'about', inference_id: process.env.ELASTIC_RERANKER ?? '.jina-reranker-v3', inference_text: text, rank_window_size: 20,
        } }
      : scoped({ match_all: {} }),
  } satisfies estypes.SearchRequest
}

export const toMatch = (me: Pick<Profile, 'interests'>, hit: estypes.SearchHit<Profile>) => ({
  id: hit._id!, tagId: hit._source!.tagId, card: peerCard(hit._source!), type: typeOf(hit._source!.interests ?? []),
  sharedInterests: sharedInterests(me.interests, hit._source!.interests), score: hit._score ?? 0,
})

export const whyPrompt = (me: Card, them: Card) =>
  `In one friendly sentence (max 30 words), tell me why I should meet this person at a cloud native conference. Address me as "you". Only use these details.\nMe: ${JSON.stringify(me)}\nThem: ${JSON.stringify(them)}`

export const templateWhy = (them: Card, shared: string[]) =>
  shared.length
    ? `You and ${them.displayName} both care about ${shared.slice(0, 3).join(', ')}, so you'll have plenty to swap notes on.`
    : `${them.displayName} could bring a fresh angle to your day, so say hi and ask what they're exploring.`
