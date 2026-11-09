import { Client } from '@elastic/elasticsearch'

export const es = new Client({
  node: process.env.ELASTIC_URL ?? 'http://localhost:9200',
  auth: { apiKey: process.env.ELASTIC_API_KEY ?? '' },
})

// Silhouette data model. Index names carry a prefix so a dev or test run never touches the live event's data:
// the live prefix is used only when it is set explicitly or in production.
const prefix = process.env.ES_INDEX_PREFIX || (process.env.NODE_ENV === 'production' ? 'confer_' : 'dev_')
const kw = { type: 'keyword' }, date = { type: 'date' }, text = { type: 'text' }, bool = { type: 'boolean' }
const stored = { type: 'keyword', index: false, doc_values: false } // kept in _source only: never searchable
const v2 = {
  profiles: {
    tagId: { type: 'integer' }, kind: kw, displayName: text, pronouns: kw, approach: kw, commPref: text,
    role: { ...text, copy_to: 'about_semantic' },
    interests: { ...kw, copy_to: ['about_semantic', 'peer_semantic'] },
    lookingFor: { ...kw, copy_to: ['about_semantic', 'peer_semantic'] },
    about: { ...text, copy_to: 'about_semantic' },
    stuckOn: { ...text, copy_to: 'about_semantic' },
    about_semantic: { type: 'semantic_text' }, // everything: only booth and talk matching may query it
    peer_semantic: { type: 'semantic_text' }, // tag lists only (topics, looking for): the one semantic field a search for people may query
    discoverable: bool, openToBooths: bool, boothsSeeName: bool, autoShare: kw, shareFields: kw, starred: kw, hasPhoto: bool,
    interestEdits: { type: 'integer' }, // capped, so interests can't be cycled to probe other people's
    pitch: text, attachment: { properties: { url: stored, label: text } },
    tokenHash: kw, // never returned to clients
  },
  vault: { email: kw, linkedin: kw, github: kw, photo: stored }, // the sealed envelope: read only through a share
  tags: { profile: kw }, // badge-number lock: _id = tagId
  tokens: { profile: kw, kind: kw, tagId: { type: 'integer' } }, // _id = token hash
  meetings: { scanner: kw, scanned: kw, kind: kw /* peer | booth */, source: kw, at: date, common: { properties: { kind: kw, mine: kw, theirs: kw } } }, // _id = scanner_scanned
  shares: { from: kw, to: kw, fields: kw, via: kw /* manual | auto | request */, note: text, at: date }, // _id = from_to; deleting it is Unshare
  mutes: { attendee: kw, booth: kw, at: date }, // _id = muter_muted. The field names are from when only booths could be muted: `booth` is whoever was muted
  // One doc per pair (_id = the two profile ids, sorted, joined by '_'). Messages live inside it, so a chat is one real-time get.
  threads: {
    a: kw, b: kw, startedBy: kw, kind: kw /* booth: a booth started it */, shared: bool /* the recipient shared because of it */, status: kw /* request | open | ignored */, source: kw, createdAt: date, expiresAt: date, lastAt: date, readA: date, readB: date,
    why: { properties: { kind: kw, mine: kw, theirs: kw } }, attachment: { properties: { url: stored, label: text } },
    firstText: { type: 'keyword', ignore_above: 512 }, // exact first message: lets a booth compare which pitch earns shares
    messages: { type: 'object', enabled: false }, // [{ id, from, text, at }]: stored, never indexed or searchable
  },
  receipts: { owner: kw, who: kw, type: kw /* shared | opened | unshared */, fields: kw, at: date, traceId: kw },
  talks: { title: { ...text, copy_to: 'semantic' }, speaker: text, abstract: { ...text, copy_to: 'semantic' }, track: kw, room: kw, startsAt: date, endsAt: date, topics: { ...kw, copy_to: 'semantic' }, semantic: { type: 'semantic_text' } },
} as const
/** Index names: `ix.profiles`, `ix.vault`, ... Always go through this, never a string literal. */
export const ix = Object.fromEntries(Object.keys(v2).map((name) => [name, prefix + name])) as { [K in keyof typeof v2]: string }

/** Makes a brand-new doc searchable now instead of within 5 seconds. Never awaited: the write is already readable by id. */
export const refreshSoon = (index: string) => void es.indices.refresh({ index }).catch(() => {})

export async function ensureIndices() {
  for (const [name, properties] of Object.entries(v2)) {
    const index = prefix + name
    if (!(await es.indices.exists({ index }))) await es.indices.create({ index, mappings: { properties } as any })
  }
}
