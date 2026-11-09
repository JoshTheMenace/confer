import type { Approach, Kind, Me, Talk } from '../../../api/src/contract'

/** Fixture portraits are drawn here as flat illustrations: never real faces, no network. */
export function portrait(seed: number) {
  const pick = <T,>(xs: T[], n: number) => xs[(seed * 7 + n * 13) % xs.length]
  const bg = pick(['#ffd166', '#9bdeac', '#a0c4ff', '#ffadad', '#cdb4db', '#fdffb6'], 1)
  const face = pick(['#f2c9a0', '#c98f62', '#8d5a3b', '#e8b48a', '#6b4226'], 2)
  const hair = pick(['#2b2118', '#7a3e1d', '#1d3557', '#b5651d', '#3d405b', '#6d597a'], 3)
  const top = pick(['#e4572e', '#2a9d8f', '#264653', '#7b2cbf', '#0077b6'], 4)
  const hairPath = pick(['M22 34a18 18 0 0 1 36 0v6H22z', 'M20 40a20 22 0 0 1 40 0l-4-8-10-4-14 2z', 'M21 36a19 19 0 0 1 38 0v18h-5V36H26v18h-5z', 'M24 30a16 14 0 0 1 32 0z'], 5)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="${bg}"/><path d="M10 80a30 26 0 0 1 60 0z" fill="${top}"/><rect x="34" y="48" width="12" height="12" rx="4" fill="${face}"/><circle cx="40" cy="37" r="15" fill="${face}"/><path d="${hairPath}" fill="${hair}"/><circle cx="34.500" cy="38" r="1.600" fill="#1c1917"/><circle cx="45.500" cy="38" r="1.600" fill="#1c1917"/><path d="M35 44q5 4 10 0" stroke="#1c1917" stroke-width="1.600" fill="none" stroke-linecap="round"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const person = (tagId: number, displayName: string, pronouns: string, approach: Approach, role: string, interests: string[], stuckOn: string, commPref = 'Short chats, then async'): Me => ({
  id: `p${tagId}`, tagId, kind: 'attendee', displayName, pronouns, approach, commPref, role, interests, lookingFor: [], stuckOn,
  discoverable: true, openToBooths: tagId % 4 !== 3, boothsSeeName: false, autoShare: 'off', shareFields: ['email', 'linkedin'],
  starred: [], hasPhoto: true, photo: portrait(tagId),
  contact: { email: `${displayName.toLowerCase()}@example.dev`, linkedin: `${displayName.toLowerCase()}-dev`, github: `${displayName.toLowerCase()}${tagId}` },
})

const org = (tagId: number, kind: Kind, displayName: string, interests: string[], about = '', pitch = '', label = ''): Me => ({
  id: `p${tagId}`, tagId, kind, displayName, approach: 'open', role: kind === 'sponsor' ? 'Sponsor booth' : 'Organizer', interests, lookingFor: [], about, pitch,
  attachment: label ? { url: `https://example.dev/${displayName.toLowerCase()}-guide.pdf`, label } : undefined,
  discoverable: true, openToBooths: false, boothsSeeName: true, autoShare: 'off', shareFields: ['email'], starred: [], hasPhoto: false,
  contact: { email: `hello@${displayName.toLowerCase()}.example` },
})

export const profiles = (): Me[] => [
  person(500, 'Amara', 'she/her', 'open', 'Staff SRE', ['OpenTelemetry', 'Kubernetes', 'Rust', 'Developer experience', 'Incident response'], 'Tracing across 200 services'),
  person(501, 'Diego', 'he/him', 'ask', 'Platform engineer', ['Distributed tracing', 'Kubernetes', 'Rust', 'Postgres', 'Climbing'], 'Cutting our p95 in half', 'Text first, then talk'),
  person(502, 'Mei', 'she/they', 'quiet', 'Data engineer', ['Postgres', 'Kubernetes', 'Vector search'], 'Slow hybrid queries', 'A note is best'),
  person(503, 'Tomasz', 'he/him', 'open', 'Backend lead', ['Rust', 'Incident response', 'eBPF'], 'On-call burnout'),
  person(504, 'Priya', 'she/her', 'ask', 'Engineering manager', ['Developer experience', 'Platform engineering', 'Hiring'], 'Onboarding takes weeks'),
  person(505, 'Kwame', 'he/him', 'open', 'Observability engineer', ['OpenTelemetry', 'Logs', 'Kubernetes'], 'Too many dashboards'),
  person(506, 'Sofia', 'she/her', 'open', 'Founder', ['AI agents', 'Developer experience', 'Rust'], 'Evals that mean something'),
  person(507, 'Noor', 'they/them', 'quiet', 'Security engineer', ['Supply chain security', 'Kubernetes', 'eBPF'], 'Signing every image', 'A wave is plenty'),
  person(508, 'Jun', 'he/him', 'ask', 'Frontend engineer', ['Accessibility', 'Developer experience', 'Web performance'], 'Real user monitoring'),
  person(509, 'Lena', 'she/her', 'open', 'SRE', ['Incident response', 'SLOs', 'OpenTelemetry'], 'Alert fatigue'),
  person(510, 'Ravi', 'he/him', 'open', 'ML engineer', ['Vector search', 'AI agents', 'Rust'], 'Reranking cost'),
  person(511, 'Ife', 'she/her', 'ask', 'Student', ['Rust', 'Accessibility', 'Open source'], 'Finding a first job'),
  org(580, 'sponsor', 'Elastic', ['OpenTelemetry', 'Vector search', 'Logs', 'Distributed tracing'], 'Search, observability and security on one platform.', 'You mentioned tracing at scale. Here is how teams keep 200 services searchable.', 'Tracing benchmark guide (PDF)'),
  org(581, 'sponsor', 'Dash0', ['OpenTelemetry', 'SLOs', 'Kubernetes'], 'OpenTelemetry-native observability.', 'Want SLOs from the spans you already send?', 'SLO starter kit'),
  org(582, 'sponsor', 'Gitar', ['Developer experience', 'AI agents', 'Platform engineering'], 'AI code review that fixes CI.', 'We review every pull request so people do not have to wait.', 'CI health checklist'),
  org(590, 'organizer', 'Organizer', []),
]

/** Semantically close tags: what the real API finds with embeddings. */
export const related: [string, string][] = [
  ['OpenTelemetry', 'Distributed tracing'], ['Platform engineering', 'Kubernetes'], ['SLOs', 'Incident response'], ['Logs', 'Incident response'], ['AI agents', 'Vector search'], ['Web performance', 'OpenTelemetry'],
]

const talk = (n: number, title: string, speaker: string, track: string, room: string, topics: string[], abstract: string): Talk => ({
  id: `t${n}`, title, speaker, track, room, topics, abstract,
  startsAt: new Date(Date.UTC(2026, 10, 9, 17 + n, 0)).toISOString(), endsAt: new Date(Date.UTC(2026, 10, 9, 17 + n, 40)).toISOString(),
})

export const talks: Talk[] = [
  talk(1, 'Tracing 200 services without losing the plot', 'Lena', 'Observability', 'Hall A', ['Distributed tracing', 'OpenTelemetry'], 'Sampling, context propagation and the three dashboards that matter.'),
  talk(2, 'Kubernetes for people who would rather not', 'Priya', 'Platform', 'Hall B', ['Kubernetes', 'Platform engineering'], 'A paved road that developers choose on their own.'),
  talk(3, 'Rust in the hot path', 'Tomasz', 'Languages', 'Room 3', ['Rust', 'Web performance'], 'Rewriting one service and measuring honestly.'),
  talk(4, 'Hybrid search that explains itself', 'Ravi', 'Data', 'Room 2', ['Vector search', 'Postgres'], 'Keyword, vectors and a reranker, with receipts.'),
  talk(5, 'SLOs your team will keep', 'Kwame', 'Observability', 'Hall A', ['SLOs', 'Incident response'], 'Start from one user journey and one promise.'),
  talk(6, 'Accessible by default', 'Jun', 'Frontend', 'Room 3', ['Accessibility', 'Developer experience'], 'Reduced motion, focus and contrast as product features.'),
  talk(7, 'Agents on call', 'Sofia', 'AI', 'Hall B', ['AI agents', 'Incident response'], 'What an AI investigation should and should not touch.'),
  talk(8, 'Signing everything', 'Noor', 'Security', 'Room 2', ['Supply chain security', 'Kubernetes'], 'From build to cluster without trusting the network.'),
]

/** What the booth's export hands back in mock mode: obviously made-up people. */
export const sampleCsv = `name,role,email,linkedin,github,shared_at
Sample Person One,Platform Engineer,sample.one@example.dev,linkedin.com/in/sample-one,sample-one,2026-11-09T10:02:00Z
Sample Person Two,SRE,sample.two@example.dev,linkedin.com/in/sample-two,,2026-11-09T10:15:00Z
Sample Person Three,Developer Advocate,sample.three@example.dev,,sample-three,2026-11-09T10:31:00Z
`
