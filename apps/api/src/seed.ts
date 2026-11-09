// Demo reset: wipes this prefix's indexes and rebuilds the demo (talks are left alone: the Discover seed owns them).
// Everyone here is fictional. Portraits are illustrations (DiceBear "notionists", CC0), drawn locally: never real faces.
// The login token for any seeded badge is `demo-<tagId>`.
import { notionists } from '@dicebear/collection'
import { createAvatar } from '@dicebear/core'
import { hashToken } from './auth.js'
import { commonOf } from './common.js'
import { expiresAt, pairId, swap, threadId, type ThreadDoc } from './consent.js'
import type { Common, ContactField } from './contract.js'
import { es, ensureIndices, ix } from './es.js'

// name | pronouns | role | interests | lookingFor | about | stuck on (optional)
const people = `
Amara Tracewell|she/her|SRE|OpenTelemetry,eBPF,Kubernetes,Platform engineering|mentoring,on-call tips|Chasing tail latency across 200 microservices and teaching teams to love their traces.|Tracing a request across 200 services without drowning in spans
Diego Podsworth|he/him|Platform Engineer|Kubernetes,Platform engineering,Distributed tracing,Cilium|platform teams,hiring|Building an internal developer platform so product teams never write YAML again.|Getting product teams to adopt the golden path
Mei Lin Grafton|she/her|Data Engineer|Kafka,Elasticsearch,Streaming|collaborators,speaking slots|Turning firehoses of events into dashboards people actually read.
Kwame Kubeli|he/him|Security Engineer|Supply chain security,Sigstore,SBOM|maintainers,feedback|Signing every artifact from commit to cluster, and making it painless.|Verifying signatures at admission without slowing deploys
Priya Helmsdottir|she/they|DevRel|Community,Open source,Helm|speakers,contributors|Running meetups in three cities and maintaining a popular Helm chart.
Tomasz Sidecarski|he/him|Staff Engineer|Service mesh,Istio,Networking|architecture chats|Untangling east-west traffic at scale and debating sidecars versus ambient mode.
Aiyana Logsworth|she/her|Observability Lead|Logging,OpenTelemetry,Cost optimization|vendors,peers|Cutting log bills in half without losing the signals that matter.|Log volume doubled this quarter and the budget did not
Rafael Vectorio|he/him|ML Engineer|LLM,RAG,Vector search|AI infra folks|Shipping retrieval-augmented assistants on Kubernetes with GPUs that refuse to cooperate.
Sione Fluxley|they/them|DevOps Engineer|GitOps,Flux,CI/CD|mentoring|Automating everything between git push and production, one pipeline at a time.
Hana Ciliumoto|she/her|Network Engineer|Cilium,eBPF,Networking|eBPF nerds|Writing eBPF programs that make network policies visible and fast.|Debugging dropped packets between clusters
Oluwaseun Promly|he/him|SRE Manager|SLOs,Incident response,Prometheus|hiring,peers|Helping teams pick SLOs that match what users actually feel.
Lucia Wasmeida|she/her|Software Engineer|WebAssembly,Serverless,Rust|collaborators|Running WebAssembly workloads at the edge and on Kubernetes side by side.
Arjun Policyraman|he/him|Security Architect|Policy as code,OPA,Zero trust|feedback,architecture chats|Turning compliance checklists into policy as code that runs in admission control.|Policies that pass review but break deploys
Nadia Spanfield|she/her|Frontend Engineer|React,Web performance,Accessibility|design feedback|Building fast, accessible dashboards for tracing data.
Bao Kafkanh|he/him|Data Platform Lead|Kafka,Postgres,Data mesh|hiring,vendors|Running a self-serve data platform for 40 product teams.
Ingrid Mentorsen|she/her|Engineering Manager|Mentoring,Diversity,Community|mentees,speakers|Growing first-time conference speakers into confident maintainers.
Mateo Inferenz|he/him|AI Platform Engineer|Inference,GPU scheduling,Kubernetes|AI infra folks,collaborators|Scheduling GPUs fairly so every team gets a turn at inference.|GPU nodes sit idle while jobs queue
Fatima Auditley|she/her|Compliance Engineer|Compliance,Identity,Security|peers|Making audits boring by automating evidence collection.
Kenji Clusterwood|he/him|Cluster Operator|Kubernetes,Multi-cluster,Networking|architecture chats|Operating 60 clusters across three clouds and still sleeping at night.|Upgrading 60 clusters without a weekend of pages
Zanele Metrics|she/her|Observability Engineer|Metrics,Grafana,OpenTelemetry|collaborators|Designing metric pipelines that scale without a cardinality explosion.
Alexei Agentov|he/him|Software Engineer|AI agents,LLM,Observability|feedback,collaborators|Tracing what AI agents actually do in production, one span at a time.
Grace Docsmith|she/her|Technical Writer|Docs,Open source,Education|contributors|Writing docs that make cloud native projects feel approachable.
Yusuf Falconer|he/him|Threat Detection Engineer|Falco,Runtime security,eBPF|peers,feedback|Catching container escapes in real time with runtime detection rules.|Too many runtime alerts and no way to rank them
Camila Searchwell|she/her|Search Engineer|Elasticsearch,Vector search,Relevance|collaborators|Blending keyword and semantic search so results feel obvious.
Rohan Profilesh|he/him|Performance Engineer|Profiling,eBPF,Go|peers|Continuous profiling in production to find the line of code burning your money.
Leilani Meshwood|she/her|Platform Engineer|Service mesh,Developer experience,Backstage|platform teams|Building golden paths so new services ship with observability on day one.|Nobody keeps the service catalog up to date
Omar Storageh|he/him|Storage Engineer|Storage,Databases,Kubernetes|architecture chats|Running stateful databases on Kubernetes without fear.
Elena Typescriptova|she/her|Full Stack Engineer|TypeScript,React,Serverless|mentoring,collaborators|Shipping end-to-end typed apps from database to browser.
Chidi Rotaton|he/him|Incident Commander|Incident response,On-call,SRE|peers,mentoring|Running blameless postmortems that actually change things.|The same incident keeps coming back
Sofia Meetupova|she/her|Community Manager|Meetups,Community,DevRel|speakers,sponsors|Connecting local cloud native meetups across Latin America.
Haruto Argonaut|he/him|Release Engineer|Argo CD,Progressive delivery,CI/CD|feedback|Rolling out canaries automatically and rolling back before anyone notices.
Ama Sbomsah|she/her|Open Source Maintainer|SBOM,Supply chain security,Maintainer|contributors,funding|Maintaining an SBOM tool used by thousands of pipelines.
Viktor Tracegaard|he/him|Backend Engineer|Distributed tracing,Go,Kafka|collaborators|Propagating trace context through every queue and cron job.|Trace context gets lost at every queue
Nia Analytico|she/her|Data Scientist|Analytics,Machine learning,Data|AI infra folks|Predicting incidents from telemetry before pagers go off.
Pedro Gatewaye|he/him|API Engineer|API gateways,Authentication,Networking|architecture chats|Designing API gateways with zero-trust auth baked in.
Ayesha Uxley|she/her|Product Designer|UX,Design systems,Accessibility|design feedback,collaborators|Designing developer tools that are kind to tired on-call engineers.
Lars Opsberg|he/him|Infrastructure Engineer|Infrastructure as code,Terraform,Platform|hiring|Turning click-ops into reviewed, versioned infrastructure.|Terraform plans nobody dares to apply
Mariam Ragnar|she/her|ML Researcher|RAG,LLM evaluation,Data|collaborators,feedback|Measuring whether retrieval actually makes LLM answers better.
Tevita Wanderly|he/him|Student|Curiosity,Career change,Learning|mentoring,internships|First conference ever, here to learn what all these acronyms mean.
Zhao Observa|she/her|Founder|Observability,OpenTelemetry,AI|investors,peers|Building an open source tool that explains traces in plain language.|Explaining a trace to someone who has never seen one`.trim().split('\n')

type Seeded = { id: string; handle?: string; tagId: number; kind: string; displayName: string; interests: string[]; shareFields: ContactField[]; openToBooths: boolean; attachment?: { url: string; label: string }; [field: string]: unknown }
const commPrefs = ["I'm Deaf, text me", 'Happy to chat anytime', 'Prefer a quick hello, then DMs', 'Low vision, please introduce yourself out loud', 'Async is best, leave a note', 'Quiet corner chats please']
const fieldSets: ContactField[][] = [['email', 'linkedin'], ['linkedin'], ['email', 'linkedin', 'github']]
const attendees = people.map((line, i): Seeded => {
  const [name, pronouns, role, interests, lookingFor, about, stuckOn] = line.split('|')
  const demo = i < 2 // Amara and Diego: the live demo decides every share, so nothing is automatic
  return {
    id: `seed-${500 + i}`, handle: name.toLowerCase().replace(/\s+/g, '.'), tagId: 500 + i, kind: 'attendee',
    displayName: name.split(' ').slice(0, -1).join(' '), pronouns, role, about, stuckOn,
    interests: interests.split(','), lookingFor: lookingFor.split(','),
    approach: ['open', 'ask', 'quiet'][i % 3], commPref: commPrefs[i % commPrefs.length],
    discoverable: i % 10 !== 9, openToBooths: demo || i % 4 !== 3, boothsSeeName: !demo && i % 5 === 2,
    autoShare: demo ? 'off' : ['off', 'starred', 'matching'][i % 3], shareFields: fieldSets[i % 3],
    starred: !demo && i % 3 === 1 ? [`seed-${580 + (i % 4)}`] : [], hasPhoto: true,
  }
})
const booths = ([
  ['Elastic', ['Search', 'Observability', 'OpenTelemetry', 'Kubernetes', 'Vector search', 'Logging'], 'Search and observability guide'],
  ['Dash0', ['OpenTelemetry', 'Observability', 'Distributed tracing', 'Metrics', 'Logging'], 'OpenTelemetry quick start'],
  ['Sonar', ['Code quality', 'Security', 'CI/CD', 'Supply chain security'], 'Clean code checklist'],
  ['Skyhook', ['Kubernetes', 'Platform engineering', 'GitOps', 'Developer experience'], 'Platform team playbook'],
] as const).map(([name, interests, label], i): Seeded => ({
  id: `seed-${580 + i}`, tagId: 580 + i, kind: 'sponsor', displayName: `${name} booth`, approach: 'open', commPref: 'Find us at the booth',
  interests: [...interests], lookingFor: [], about: `Demo profile for the ${name} booth.`, discoverable: true, openToBooths: false, boothsSeeName: false,
  autoShare: 'off', shareFields: [], starred: [], hasPhoto: false,
  pitch: "Here's the guide we talked about", attachment: { url: `https://example.com/${name.toLowerCase()}-guide`, label },
}))
const organizer: Seeded = {
  id: 'seed-590', tagId: 590, kind: 'organizer', displayName: 'Event organizer', approach: 'open', interests: [], lookingFor: [],
  discoverable: false, openToBooths: false, boothsSeeName: false, autoShare: 'off', shareFields: [], starred: [], hasPhoto: false,
}
const [amara, diego] = attendees, elastic = booths[0]

// History spread over the last 30 minutes, so lists, booth stats and the organizer pulse are alive.
// It never includes Amara meeting or messaging Diego, or the Elastic booth scanning or messaging Amara: the demo does that live.
const now = Date.now(), ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString()
const meetings = new Map<string, { scanner: Seeded; scanned: Seeded; kind: string; source: string; at: string; common: Common[] }>()
const meet = async (scanner: Seeded, scanned: Seeded, minutes: number) => {
  const kind = scanner.kind === 'sponsor' || scanned.kind === 'sponsor' ? 'booth' : 'peer'
  const reverse = meetings.get(pairId(scanned.id, scanner.id))
  const common = reverse ? swap(reverse.common) : await commonOf(scanner.interests, scanned.interests, 20_000)
  meetings.set(pairId(scanner.id, scanned.id), { scanner, scanned, kind, source: minutes % 3 ? 'camera' : 'manual', at: ago(minutes), common })
}
for (let k = 0; k < 46; k++) {
  const a = attendees[(k * 7 + 2) % 40], b = attendees[(k * 11 + 5) % 40]
  if (a !== b && !(a.tagId < 502 && b.tagId < 502)) await meet(a, b, 29.5 - k * 0.6)
}
const visitors = Array.from({ length: 16 }, (_, k) => ({ booth: booths[k % 4], attendee: attendees[2 + ((k * 5) % 38)], k }))
for (const { booth, attendee, k } of visitors) await meet(booth, attendee, 28 - k * 1.5)

const notes = ["Here's the guide we talked about", 'Want the benchmark results from our talk?']
const outcomes = ['shared', 'pending', 'ignored', 'shared', 'pending'] as const
const prospects = attendees.slice(2).filter((p) => p.openToBooths && !visitors.some((v) => v.attendee === p)).slice(0, 4)
const requests = [
  ...visitors.map(({ booth, attendee, k }) => ({ booth, attendee, source: 'scan', status: outcomes[k % 5], note: notes[k % 2], minutes: 27 - k * 1.5 })),
  ...prospects.map((attendee, k) => ({ booth: booths[k % 4], attendee, source: 'match', status: outcomes[(k + 1) % 5], note: notes[1], minutes: 6 - k })),
]
// Every request is a chat. Lines alternate, starting with the sender; a request nobody answered has one line.
const threads = new Map<string, ThreadDoc>()
const thread = async (from: Seeded, to: Seeded, status: ThreadDoc['status'], minutes: number, lines: string[], shared?: true) => {
  const mine = meetings.get(pairId(from.id, to.id)), theirs = meetings.get(pairId(to.id, from.id))
  const [a, b] = [from.id, to.id].sort(), at = (i: number) => ago(minutes - i * 0.3), last = at(lines.length - 1)
  threads.set(threadId(a, b), {
    a, b, startedBy: from.id, kind: from.kind === 'sponsor' ? 'booth' : 'peer', status, source: mine || theirs ? 'scan' : 'match',
    why: mine?.common ?? (theirs ? swap(theirs.common) : await commonOf(from.interests, to.interests, 20_000)),
    attachment: from.attachment, firstText: lines[0], createdAt: at(0), lastAt: last, expiresAt: expiresAt(), shared,
    // A waiting request is unread on the recipient's side.
    ...(status === 'request' ? { [from.id === a ? 'readA' : 'readB']: last } : { readA: last, readB: last }),
    messages: lines.map((text, i) => ({ id: `${a}_${b}_${i}`, from: i % 2 ? to.id : from.id, text, at: at(i) })),
  })
}
for (const r of requests)
  await thread(r.booth, r.attendee, r.status === 'shared' ? 'open' : r.status === 'pending' ? 'request' : 'ignored', r.minutes, r.status === 'shared' ? [r.note, 'Yes please. Sharing my card now.'] : [r.note], r.status === 'shared' || undefined)
const talk = [
  ['Good to meet you! Want to compare notes on tracing after lunch?', 'Yes please. I am free at one.', 'Great, see you by the coffee stand.'],
  ['Hello! It looks like we both care about platform teams. How big is yours?', 'Six people and growing. Yours?'],
  ['Nice to meet you. Which talk was it you told me about?', 'The one on golden paths, room B at two.', 'Thank you!', 'Any time. Save me a seat.'],
  ['It is loud in here, so I am writing instead. Do you have a minute for a question?', 'Sure, text works well for me too.', 'How do you handle schema changes?', 'Slowly, and with a lot of tests.', 'Ha, same here.'],
]
const peers = [...meetings.values()].filter((m) => m.kind === 'peer' && m.scanner.tagId > 501 && m.scanned.tagId > 501).slice(20, 28)
for (const [k, m] of peers.entries()) await thread(m.scanner, m.scanned, 'open', 20 - k * 2, talk[k % talk.length])
// Two requests wait for Amara, so the Inbox is alive when the demo starts: one from a person, one from a booth with an attachment.
await thread(attendees[9], amara, 'request', 4, ['Hi Amara! I think we both work with eBPF. Could I ask how you find dropped packets between clusters?'])
await thread(booths[1], amara, 'request', 2, ['We wrote a short guide on tracing across many services. It is yours either way.'])
const mutes = requests.filter((r) => r.status === 'ignored').slice(0, 3)
const shares = [
  ...[...meetings.values()].filter((m) => m.kind === 'peer').slice(0, 17).map((m, k) => ({ from: k % 2 ? m.scanner : m.scanned, to: k % 2 ? m.scanned : m.scanner, via: 'manual', note: undefined as string | undefined, minutes: 26 - k * 1.5 })),
  ...requests.filter((r) => r.status === 'shared').map((r) => ({ from: r.attendee, to: r.booth, via: 'request', note: r.note as string | undefined, minutes: r.minutes - 1 })),
]
const index = (_index: string, _id: string | undefined, doc: object) => [{ index: { _index, _id } }, doc]

// Badge 501 stays free: it is the paper badge a volunteer claims at sign-up in the live demo. Diego keeps his sign-in (demo-501) and wears badge 540.
const badge = (id: string, tagId: number) => (id === 'seed-501' ? 540 : tagId)
const wipe = Object.entries(ix).filter(([name]) => name !== 'talks').map(([, index]) => index)
await es.indices.delete({ index: wipe, ignore_unavailable: true })
await ensureIndices()
const res = await es.bulk({
  refresh: true,
  operations: [
    ...[...attendees, ...booths, organizer].flatMap(({ id, handle, ...p }) => [
      ...index(ix.profiles, id, { ...p, tagId: badge(id, p.tagId), interestEdits: 0, tokenHash: hashToken(`demo-${p.tagId}`) }),
      ...index(ix.tokens, hashToken(`demo-${p.tagId}`), { profile: id, kind: p.kind, tagId: badge(id, p.tagId) }),
      ...index(ix.tags, String(badge(id, p.tagId)), { profile: id }),
      ...(handle ? index(ix.vault, id, {
        email: `${handle}@example.com`, linkedin: `https://linkedin.com/in/${handle}-example`, github: `${handle}-example`,
        photo: createAvatar(notionists, { seed: handle }).toDataUri(),
      }) : []),
    ]),
    ...[...meetings].flatMap(([id, m]) => index(ix.meetings, id, { ...m, scanner: m.scanner.id, scanned: m.scanned.id })),
    ...[...threads].flatMap(([id, t]) => index(ix.threads, id, t)),
    ...mutes.flatMap((r) => index(ix.mutes, pairId(r.attendee.id, r.booth.id), { attendee: r.attendee.id, booth: r.booth.id, at: ago(r.minutes - 1) })),
    ...shares.flatMap((s, k) => [
      ...index(ix.shares, pairId(s.from.id, s.to.id), { from: s.from.id, to: s.to.id, fields: s.from.shareFields, via: s.via, note: s.note, at: ago(s.minutes) }),
      ...index(ix.receipts, undefined, { owner: s.from.id, who: s.to.id, type: 'shared', fields: s.from.shareFields, at: ago(s.minutes) }),
      ...(k % 2 ? [] : index(ix.receipts, `${pairId(s.from.id, s.to.id)}_opened`, { owner: s.from.id, who: s.to.id, type: 'opened', fields: s.from.shareFields, at: ago(s.minutes - 0.5) })),
    ]),
  ],
})
if (res.errors) throw new Error(`seed failed: ${res.items.filter((it) => it.index?.error).length} bulk errors`)

// The demo depends on these, so a reset that breaks one fails loudly instead of on stage.
const both = await commonOf(amara.interests, diego.interests, 20_000), booth = await commonOf(elastic.interests, amara.interests, 20_000)
const involves = (...ids: string[]) => [...meetings.keys()].some((id) => id === pairId(ids[0], ids[1]) || id === pairId(ids[1], ids[0]))
const invariants = {
  'Amara and Diego have not met and have no thread': !involves(amara.id, diego.id) && !threads.has(threadId(amara.id, diego.id)),
  'Amara and Diego have 3+ things in common, one related': both.length >= 3 && both.some((c) => c.kind === 'related'),
  'the Elastic booth has not scanned Amara and has no thread with her': !involves(elastic.id, amara.id) && !threads.has(threadId(elastic.id, amara.id)),
  'the Elastic booth and Amara have 2+ things in common': booth.length >= 2,
  'Amara has 2 message requests waiting': [...threads.values()].filter((t) => t.status === 'request' && t.startedBy !== amara.id && [t.a, t.b].includes(amara.id)).length === 2,
  'neither is muted or auto-sharing': !mutes.some((r) => r.attendee === amara || r.attendee === diego) && amara.shareFields.length > 0 && diego.shareFields.length > 0,
}
console.table(invariants)
if (Object.values(invariants).includes(false)) throw new Error('demo invariants do not hold')
console.log(`Seeded ${attendees.length} attendees, ${booths.length} booths, 1 organizer, ${meetings.size} meetings, ${shares.length} shares, ${threads.size} threads, ${mutes.length} mutes.`)
console.log('Amara and Diego:', both.map((c) => `${c.mine} ${c.kind === 'same' ? '=' : '~'} ${c.theirs}`).join(', '))
console.table([amara, diego, ...booths, organizer].map((p) => ({ persona: p.displayName, kind: p.kind, tagId: badge(p.id, p.tagId), token: `demo-${p.tagId}` })))
