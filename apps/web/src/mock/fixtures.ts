import type { Approach, Kind, Me, Talk } from '../api'

export type MockProfile = Me & { token: string }

const hues = ['#ffd9c2', '#cfe3ff', '#d8f5d0', '#ffe9a8', '#f3d1ff', '#c9f1ee']
const skins = ['#f2c9a5', '#d99e73', '#a86b45', '#7a4a2c', '#f7dcc4', '#c58a5c']
const hairs = ['#1c1c1c', '#5a3b22', '#b5651d', '#d9d9d9', '#7b2d8b', '#0f6e6e']

/** A drawn portrait (never a real face), unique per person, as a small SVG data URL. */
export function portrait(n: number) {
  const pick = (a: string[], k: number) => a[(n * k + k) % a.length]
  const hair = [`<path d="M26 44a24 24 0 0 1 48 0v6H26z"/>`, `<circle cx="50" cy="26" r="13"/><path d="M27 46a23 23 0 0 1 46 0z"/>`, `<path d="M24 70V44a26 26 0 0 1 52 0v26h-8V44H32v26z"/>`, `<path d="M28 42q22-30 44 0l-4 4H32z"/>`][n % 4]
  const extra = n % 3 === 0 ? `<g fill="none" stroke="#111" stroke-width="2"><circle cx="41" cy="50" r="6"/><circle cx="59" cy="50" r="6"/><path d="M47 50h6"/></g>` : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${pick(hues, 3)}"/><path d="M14 100q0-28 36-28t36 28z" fill="${pick(['#2b4bff', '#ff4b1f', '#00a06b', '#111', '#8a5cff'], 2)}"/><rect x="43" y="62" width="14" height="14" fill="${pick(skins, 5)}"/><circle cx="50" cy="48" r="20" fill="${pick(skins, 5)}"/><g fill="${pick(hairs, 7)}">${hair}</g><circle cx="41" cy="50" r="2.2" fill="#111"/><circle cx="59" cy="50" r="2.2" fill="#111"/><path d="M42 58q8 7 16 0" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round"/>${extra}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const person = (tagId: number, displayName: string, pronouns: string, approach: Approach, commPref: string, role: string, interests: string[], stuckOn?: string): MockProfile => ({
  id: `p${tagId}`, tagId, kind: 'attendee', token: `demo-${tagId}`, displayName, pronouns, approach, commPref, role, interests, stuckOn,
  lookingFor: [], discoverable: true, openToBooths: true, boothsSeeName: false, autoShare: 'off', shareFields: ['email', 'linkedin'], starred: [],
  hasPhoto: true, photo: portrait(tagId), contact: { email: `${displayName.toLowerCase()}@example.com`, linkedin: displayName.toLowerCase(), github: `${displayName.toLowerCase()}-dev` },
})

const org = (tagId: number, kind: Kind, displayName: string, interests: string[], about: string, pitch?: string, label?: string): MockProfile => ({
  ...person(tagId, displayName, '', 'open', '', kind === 'sponsor' ? 'Booth' : 'Organizer', interests), kind, about, pitch, hasPhoto: false, photo: undefined,
  attachment: label ? { label, url: `https://example.com/${tagId}.pdf` } : undefined, contact: { email: `hello@${displayName.toLowerCase()}.example` },
})

export const seedProfiles = (): MockProfile[] => [
  person(500, 'Amara', 'she/her', 'open', 'Happy to talk shop', 'Platform engineer', ['OpenTelemetry', 'Kubernetes', 'Rust', 'Platform engineering', 'Bouldering'], 'Tracing across 200 services'),
  person(501, 'Diego', 'he/him', 'ask', 'Text beats calls', 'Site reliability engineer', ['Distributed tracing', 'Kubernetes', 'Rust', 'Elasticsearch', 'Espresso'], 'Alert fatigue'),
  person(502, 'Priya', 'she/her', 'open', 'Coffee walks', 'ML engineer', ['Vector search', 'RAG', 'Kubernetes', 'OpenTelemetry']),
  person(503, 'Kenji', 'he/him', 'quiet', 'A note is best', 'Systems engineer', ['Rust', 'WebAssembly', 'Bouldering']),
  person(504, 'Noor', 'they/them', 'ask', 'Small groups', 'Staff engineer', ['Platform engineering', 'Kubernetes', 'Accessibility']),
  person(505, 'Lucía', 'she/her', 'open', 'Whiteboards', 'Observability lead', ['OpenTelemetry', 'eBPF', 'Rust'], 'Sampling without losing errors'),
  person(506, 'Tobias', 'he/him', 'open', 'Hallway chats', 'Backend engineer', ['Distributed tracing', 'Go', 'Kubernetes'], 'Trace storage costs'),
  person(507, 'Wren', 'they/them', 'quiet', 'Messages first', 'Design engineer', ['Accessibility', 'Design systems', 'Bouldering']),
  person(508, 'Ifeoma', 'she/her', 'ask', 'Lunch tables', 'Search engineer', ['RAG', 'Vector search', 'Platform engineering']),
  person(509, 'Sami', 'he/they', 'open', 'Pair on a laptop', 'Kernel engineer', ['eBPF', 'Kubernetes', 'Rust']),
  person(510, 'Hana', 'she/her', 'open', 'Quick demos', 'Developer advocate', ['WebAssembly', 'Rust', 'OpenTelemetry']),
  person(511, 'Mateo', 'he/him', 'ask', 'Email after', 'Data engineer', ['Go', 'Elasticsearch', 'Kubernetes']),
  org(580, 'sponsor', 'Elastic', ['Observability', 'Elasticsearch', 'Vector search', 'OpenTelemetry', 'Distributed tracing'], 'Search, observability and security on one platform.', 'We cut trace storage by 70%. Want the benchmark guide?', 'Tracing benchmark guide (PDF)'),
  org(581, 'sponsor', 'Dash0', ['OpenTelemetry', 'Observability', 'Kubernetes'], 'OpenTelemetry-native observability.', 'You like OpenTelemetry. Here is our collector cheat sheet.', 'OTel collector cheat sheet'),
  org(582, 'sponsor', 'Gitar', ['Platform engineering', 'Go', 'Accessibility'], 'Code review that checks your own rules.', 'Rules-as-code for reviews, in ten minutes.', 'Review rules starter kit'),
  org(590, 'organizer', 'Organizer', [], 'Runs the event.'),
]

/** Stand-in for the Elastic embedding match: tag pairs that mean nearly the same thing. */
export const related: [string, string][] = [
  ['OpenTelemetry', 'Distributed tracing'], ['Vector search', 'RAG'], ['Observability', 'eBPF'], ['Design systems', 'Accessibility'], ['Tracing', 'Distributed tracing'],
]

const talk = (n: number, title: string, speaker: string, track: string, room: string, topics: string[], abstract: string): Talk => ({
  id: `t${n}`, title, speaker, track, room, topics, abstract,
  startsAt: new Date(Date.UTC(2026, 10, 9, 20 + Math.floor(n / 2), (n % 2) * 30)).toISOString(), endsAt: new Date(Date.UTC(2026, 10, 9, 20 + Math.floor(n / 2), (n % 2) * 30 + 25)).toISOString(),
})
export const talks: Talk[] = [
  talk(1, 'Tracing 200 services without going broke', 'L. Okafor', 'Observability', 'Hall A', ['Distributed tracing', 'OpenTelemetry'], 'Tail sampling, tracing budgets and what to keep across many services.'),
  talk(2, 'OpenTelemetry collectors in anger', 'M. Brandt', 'Observability', 'Hall A', ['OpenTelemetry', 'Kubernetes'], 'Running the collector as a fleet on Kubernetes.'),
  talk(3, 'Hybrid search that actually ranks', 'S. Iyer', 'Search', 'Room 2', ['Vector search', 'Elasticsearch', 'RAG'], 'Keyword, semantic and rerank in one query.'),
  talk(4, 'Rust in the hot path', 'J. Nakamura', 'Systems', 'Room 3', ['Rust', 'WebAssembly'], 'Where Rust paid off and where it did not.'),
  talk(5, 'Platform teams are product teams', 'A. Haddad', 'Platform', 'Hall B', ['Platform engineering', 'Kubernetes'], 'Golden paths people choose to use.'),
  talk(6, 'eBPF for the rest of us', 'R. Silva', 'Systems', 'Room 3', ['eBPF', 'Observability'], 'Zero-code signals from the kernel.'),
  talk(7, 'Accessible by default', 'W. Adeyemi', 'Design', 'Room 2', ['Accessibility', 'Design systems'], 'Design systems that make the right thing easy.'),
  talk(8, 'Go services at 3am', 'T. Lindqvist', 'Platform', 'Hall B', ['Go', 'Distributed tracing'], 'Debugging production with traces instead of guesses.'),
]
