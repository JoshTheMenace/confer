import type { Approach, Contact, Profile, Talk } from '../../../api/src/contract'

export type Row = { p: Profile; contact: Contact; photo?: string }

export const tokens: Record<string, string> = { 'demo-500': 'amara', 'demo-501': 'diego', 'demo-580': 'elastic', 'demo-590': 'organizer' }

/** Tag pairs the real API finds with embeddings. */
export const related: [string, string][] = [
  ['OpenTelemetry', 'Distributed tracing'], ['Observability', 'OpenTelemetry'], ['Distributed tracing', 'Observability'],
  ['SLOs', 'Incident response'], ['Design systems', 'Accessibility'], ['Search', 'Vector databases'],
]

/** An illustrated portrait as an SVG data URL: fixtures never use real faces. */
export function portrait(i: number) {
  const skin = ['#f2c9a5', '#c98d62', '#8d5a3b', '#e8b48a', '#6b4630', '#f6d7bd'][i % 6]
  const hair = ['#1d1730', '#5a2d1a', '#2b2b2b', '#b0562c', '#3a2a5c', '#d9d2c4'][(i * 5 + 1) % 6]
  const [a, b] = [['#8b6cff', '#ff6f7d'], ['#ff6f7d', '#ffb454'], ['#3d2a8c', '#8b6cff'], ['#ffb454', '#ff6f7d'], ['#5b3fd6', '#ffb454'], ['#2a1f55', '#ff6f7d']][i % 6]
  const top = [
    'M31 46c-2-16 7-27 19-27s21 11 19 27c-4-9-10-13-19-13s-15 4-19 13z',
    'M27 66c-4-28 6-48 23-48s27 20 23 48c-2-16-7-27-23-27s-21 11-23 27z',
    'M29 44c-5-15 8-28 21-25 13-3 26 10 21 25-3-8-10-11-21-11s-18 3-21 11z',
    'M32 41c1-13 8-20 18-20s17 7 18 20c-6-6-12-8-18-8s-12 2-18 8z',
  ][i % 4]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="78" cy="20" r="26" fill="#fff" opacity=".12"/><path d="M12 100c2-21 16-30 38-30s36 9 38 30z" fill="${['#f5f2ff', '#17122b', '#ffd9a0', '#241a4d'][i % 4]}"/><path d="M43 60h14v12c-4 4-10 4-14 0z" fill="${skin}"/><ellipse cx="50" cy="46" rx="16" ry="19" fill="${skin}"/><path d="${top}" fill="${hair}"/><circle cx="44" cy="47" r="1.8" fill="#1d1730"/><circle cx="56" cy="47" r="1.8" fill="#1d1730"/><path d="M44 55c4 4 8 4 12 0" fill="none" stroke="#1d1730" stroke-width="1.6" stroke-linecap="round"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const person = (i: number, id: string, displayName: string, pronouns: string, approach: Approach, commPref: string, role: string, interests: string[], stuckOn: string): Row => ({
  p: {
    id, tagId: 500 + i, kind: 'attendee', displayName, pronouns, approach, commPref, role, interests, stuckOn, lookingFor: [],
    discoverable: true, openToBooths: i !== 3, boothsSeeName: i % 3 === 2, autoShare: id === 'lars' ? 'matching' : 'off',
    shareFields: ['email', 'linkedin'], starred: [], hasPhoto: true,
  },
  contact: { email: `${id}@example.com`, linkedin: `${id}-confer`, github: id },
  photo: portrait(i),
})

const booth = (tagId: number, id: string, displayName: string, about: string, interests: string[], pitch: string, label: string): Row => ({
  p: {
    id, tagId, kind: 'sponsor', displayName, approach: 'open', about, interests, lookingFor: [], pitch, attachment: { label, url: `https://example.com/${id}/guide.pdf` },
    discoverable: true, openToBooths: false, boothsSeeName: true, autoShare: 'off', shareFields: ['email'], starred: [], hasPhoto: false,
  },
  contact: { email: `hello@${id}.example.com` },
})

export const seedRows = (): Row[] => [
  person(0, 'amara', 'Amara', 'she/her', 'open', 'Short and direct is great', 'Staff SRE', ['OpenTelemetry', 'Kubernetes', 'Rust', 'Incident response', 'Accessibility'], 'Tracing across 200 services without drowning in spans'),
  person(1, 'diego', 'Diego', 'he/him', 'ask', 'Text over calls', 'Platform engineer', ['Distributed tracing', 'Kubernetes', 'Rust', 'Platform engineering', 'Developer experience'], 'Getting teams onto one golden path'),
  person(2, 'priya', 'Priya', 'she/they', 'open', 'Walk and talk', 'Database engineer', ['Kubernetes', 'Incident response', 'eBPF', 'Postgres'], 'Postgres failover under load'),
  person(3, 'tomas', 'Tomás', 'he/him', 'quiet', 'A wave is plenty', 'Compiler engineer', ['Rust', 'WebAssembly', 'Accessibility'], 'Wasm cold starts'),
  person(4, 'mei', 'Mei', 'she/her', 'open', 'Happy to whiteboard', 'Observability lead', ['OpenTelemetry', 'Observability', 'Go'], 'Sampling without losing the weird traces'),
  person(5, 'kofi', 'Kofi', 'he/him', 'ask', 'Mornings are best', 'SRE manager', ['Incident response', 'SLOs', 'Kubernetes'], 'SLOs that product teams believe'),
  person(6, 'sana', 'Sana', 'they/them', 'open', 'Captions on, please', 'Design engineer', ['Accessibility', 'Design systems', 'React'], 'Accessible charts'),
  person(7, 'lars', 'Lars', 'he/him', 'quiet', 'Email first', 'Search engineer', ['Postgres', 'Rust', 'Search'], 'Hybrid search relevance'),
  person(8, 'noor', 'Noor', 'she/her', 'ask', 'Coffee chats', 'FinOps engineer', ['Kubernetes', 'Platform engineering', 'Cost'], 'Cluster cost per team'),
  person(9, 'ife', 'Ife', 'they/she', 'open', 'Ask me anything', 'Kernel engineer', ['OpenTelemetry', 'Rust', 'eBPF'], 'Profiling in production'),
  person(10, 'yuki', 'Yuki', 'he/they', 'ask', 'Slow talker, good listener', 'ML engineer', ['Search', 'Vector databases', 'Python'], 'Reranking on a budget'),
  person(11, 'rosa', 'Rosa', 'she/her', 'open', 'Loud rooms are hard, step outside?', 'Incident commander', ['Incident response', 'Accessibility', 'Kubernetes'], 'Calmer incident channels'),
  booth(580, 'elastic', 'Elastic', 'Search, observability and security on one platform.', ['Search', 'Observability', 'OpenTelemetry', 'Vector databases', 'Distributed tracing'], 'We benchmarked tail sampling at 200 services. Want the guide?', 'Tracing at scale: the benchmark guide'),
  booth(581, 'lumen', 'Lumen Cloud', 'Kubernetes cost you can explain to finance.', ['Kubernetes', 'Cost', 'Platform engineering'], 'You run Kubernetes. Here is how three teams cut spend by a third.', 'Kubernetes cost playbook'),
  booth(582, 'relay', 'Relay', 'On-call that people do not dread.', ['Incident response', 'SLOs', 'On-call'], 'Fewer pages, calmer incidents. Our runbook kit is yours.', 'Incident runbook kit'),
  { p: { id: 'organizer', tagId: 590, kind: 'organizer', displayName: 'Event team', approach: 'open', interests: [], lookingFor: [], discoverable: false, openToBooths: false, boothsSeeName: false, autoShare: 'off', shareFields: [], starred: [], hasPhoto: false }, contact: {} },
]

const talk = (i: number, title: string, speaker: string, track: string, room: string, topics: string[], abstract: string): Talk => {
  const start = new Date(new Date().setHours(9 + i, 30, 0, 0))
  return { id: `t${i}`, title, speaker, abstract, track, room, topics, startsAt: start.toISOString(), endsAt: new Date(+start + 40 * 60000).toISOString() }
}
export const talks: Talk[] = [
  talk(0, 'Tail sampling at 200 services', 'Hana Brandt', 'Observability', 'Hall A', ['Distributed tracing', 'OpenTelemetry', 'Observability'], 'Keep the traces that matter and drop the rest.'),
  talk(1, 'Kubernetes cost, without the spreadsheet', 'Omar Lindqvist', 'Platform', 'Hall B', ['Kubernetes', 'Cost', 'Platform engineering'], 'Showback that engineers trust.'),
  talk(2, 'Rust in the hot path', 'Chidi Moreau', 'Languages', 'Room 3', ['Rust', 'WebAssembly'], 'Where Rust paid for itself, and where it did not.'),
  talk(3, 'Incident response is a design problem', 'Leila Novak', 'Reliability', 'Hall A', ['Incident response', 'SLOs', 'Accessibility'], 'Calm, clear incidents by design.'),
  talk(4, 'eBPF for the rest of us', 'Jun Castillo', 'Observability', 'Room 2', ['eBPF', 'Observability', 'Kubernetes'], 'Kernel superpowers without the kernel.'),
  talk(5, 'Search that understands you', 'Anika Stone', 'Data', 'Hall B', ['Search', 'Vector databases'], 'Keyword, semantic and rerank, together.'),
  talk(6, 'Accessible by default', 'Mateo Hale', 'Frontend', 'Room 3', ['Accessibility', 'Design systems', 'React'], 'Design systems that hold up under pressure.'),
  talk(7, 'Golden paths developers choose', 'Zainab Frost', 'Platform', 'Room 2', ['Platform engineering', 'Developer experience', 'Kubernetes'], 'Platform engineering people opt into.'),
]
