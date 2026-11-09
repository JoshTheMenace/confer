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
  vault: { email: { type: 'keyword' }, linkedin: { type: 'keyword' }, github: { type: 'keyword' } },
  catches: { catcher: { type: 'keyword' }, caught: { type: 'keyword' }, kind: { type: 'keyword' }, at: { type: 'date' } },
  consent_requests: {
    sponsor: { type: 'keyword' }, attendee: { type: 'keyword' }, fields: { type: 'keyword' },
    status: { type: 'keyword' }, // pending | deferred | granted | denied (expired ones are deleted)
    createdAt: { type: 'date' }, expiresAt: { type: 'date' },
  },
  receipts: { attendee: { type: 'keyword' }, viewer: { type: 'keyword' }, fields: { type: 'keyword' }, at: { type: 'date' } },
} as const

export async function ensureIndices() {
  for (const [name, properties] of Object.entries(indices)) {
    if (!(await es.indices.exists({ index: name }))) await es.indices.create({ index: name, mappings: { properties } as any })
  }
}
