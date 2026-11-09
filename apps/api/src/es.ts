import { Client } from '@elastic/elasticsearch'

export const es = new Client({
  node: process.env.ELASTIC_URL ?? 'http://localhost:9200',
  auth: { apiKey: process.env.ELASTIC_API_KEY ?? '' },
})

// The three envelopes, as indexes. The sealed envelope (vault) is a separate index
// that search never touches; it is only read when a consent grant releases it.
const indices = {
  profiles: {
    tagId: { type: 'integer' },
    kind: { type: 'keyword' }, // attendee | sponsor
    displayName: { type: 'text' },
    pronouns: { type: 'keyword' },
    approach: { type: 'keyword' }, // open | ask | quiet
    commPref: { type: 'text' },
    role: { type: 'text' },
    interests: { type: 'keyword', copy_to: 'about_semantic' },
    lookingFor: { type: 'keyword' },
    about: { type: 'text', copy_to: 'about_semantic' },
    about_semantic: { type: 'semantic_text' },
    interestsVisibleTo: { type: 'keyword' }, // peers | sponsors
    discoverable: { type: 'boolean' },
    tokenHash: { type: 'keyword' }, // never returned to clients
  },
  tags: { profile: { type: 'keyword' } }, // badge-number lock, see routes/me.ts
  tokens: { profile: { type: 'keyword' }, kind: { type: 'keyword' }, tagId: { type: 'integer' } }, // _id = token hash, see auth.ts
  vault: { email: { type: 'keyword' }, linkedin: { type: 'keyword' }, github: { type: 'keyword' } },
  catches: { catcher: { type: 'keyword' }, caught: { type: 'keyword' }, kind: { type: 'keyword' }, at: { type: 'date' } },
  consent_requests: {
    sponsor: { type: 'keyword' }, attendee: { type: 'keyword' }, fields: { type: 'keyword' },
    status: { type: 'keyword' }, // pending | deferred | granted | denied (expired ones are deleted)
    createdAt: { type: 'date' }, expiresAt: { type: 'date' },
  },
  receipts: { attendee: { type: 'keyword' }, viewer: { type: 'keyword' }, fields: { type: 'keyword' }, at: { type: 'date' } },
} as const

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
    peer_semantic: { type: 'semantic_text' }, // tags only: the one field a search for people may query
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
  requests: { booth: kw, attendee: kw, note: { ...text, fields: { raw: kw } }, attachment: { properties: { url: stored, label: text } }, status: kw, source: kw, createdAt: date, expiresAt: date }, // _id = booth_attendee
  mutes: { attendee: kw, booth: kw, at: date }, // _id = attendee_booth
  receipts: { owner: kw, who: kw, type: kw /* shared | opened | unshared */, fields: kw, at: date, traceId: kw },
  talks: { title: { ...text, copy_to: 'semantic' }, speaker: text, abstract: { ...text, copy_to: 'semantic' }, track: kw, room: kw, startsAt: date, endsAt: date, topics: { ...kw, copy_to: 'semantic' }, semantic: { type: 'semantic_text' } },
} as const
/** Index names: `ix.profiles`, `ix.vault`, ... Always go through this, never a string literal. */
export const ix = Object.fromEntries(Object.keys(v2).map((name) => [name, prefix + name])) as { [K in keyof typeof v2]: string }

export async function ensureIndices() {
  for (const [name, properties] of [...Object.entries(indices), ...Object.entries(v2).map(([n, p]) => [prefix + n, p] as const)]) {
    if (!(await es.indices.exists({ index: name }))) await es.indices.create({ index: name, mappings: { properties } as any })
  }
}
