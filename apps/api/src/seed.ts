// Idempotent demo data: fixed ids + bulk index (overwrite), so re-running just resets the demo.
// Everyone here is fictional. Demo login token for any seeded badge is 'demo-<tagId>'.
import { hashToken } from './auth.js'
import { es, ensureIndices } from './es.js'

// name | pronouns | role | interests | lookingFor | about
const people = `
Amara Tracewell|she/her|SRE|OpenTelemetry,eBPF,Prometheus|mentoring,on-call tips|Chasing tail latency across 200 microservices and teaching teams to love their traces.
Diego Podsworth|he/him|Platform Engineer|Kubernetes,GitOps,Argo CD|platform teams,hiring|Building an internal developer platform so product teams never write YAML again.
Mei Lin Grafton|she/her|Data Engineer|Kafka,Elasticsearch,Streaming|collaborators,speaking slots|Turning firehoses of events into dashboards people actually read.
Kwame Kubeli|he/him|Security Engineer|Supply chain security,Sigstore,SBOM|maintainers,feedback|Signing every artifact from commit to cluster, and making it painless.
Priya Helmsdottir|she/they|DevRel|Community,Open source,Helm|speakers,contributors|Running meetups in three cities and maintaining a popular Helm chart.
Tomasz Sidecarski|he/him|Staff Engineer|Service mesh,Istio,Networking|architecture chats|Untangling east-west traffic at scale and debating sidecars versus ambient mode.
Aiyana Logsworth|she/her|Observability Lead|Logging,OpenTelemetry,Cost optimization|vendors,peers|Cutting log bills in half without losing the signals that matter.
Rafael Vectorio|he/him|ML Engineer|LLM,RAG,Vector search|AI infra folks|Shipping retrieval-augmented assistants on Kubernetes with GPUs that refuse to cooperate.
Sione Fluxley|they/them|DevOps Engineer|GitOps,Flux,CI/CD|mentoring|Automating everything between git push and production, one pipeline at a time.
Hana Ciliumoto|she/her|Network Engineer|Cilium,eBPF,Networking|eBPF nerds|Writing eBPF programs that make network policies visible and fast.
Oluwaseun Promly|he/him|SRE Manager|SLOs,Incident response,Prometheus|hiring,peers|Helping teams pick SLOs that match what users actually feel.
Lucia Wasmeida|she/her|Software Engineer|WebAssembly,Serverless,Rust|collaborators|Running WebAssembly workloads at the edge and on Kubernetes side by side.
Arjun Policyraman|he/him|Security Architect|Policy as code,OPA,Zero trust|feedback,architecture chats|Turning compliance checklists into policy as code that runs in admission control.
Nadia Spanfield|she/her|Frontend Engineer|React,Web performance,Accessibility|design feedback|Building fast, accessible dashboards for tracing data.
Bao Kafkanh|he/him|Data Platform Lead|Kafka,Postgres,Data mesh|hiring,vendors|Running a self-serve data platform for 40 product teams.
Ingrid Mentorsen|she/her|Engineering Manager|Mentoring,Diversity,Community|mentees,speakers|Growing first-time conference speakers into confident maintainers.
Mateo Inferenz|he/him|AI Platform Engineer|Inference,GPU scheduling,Kubernetes|AI infra folks,collaborators|Scheduling GPUs fairly so every team gets a turn at inference.
Fatima Auditley|she/her|Compliance Engineer|Compliance,Identity,Security|peers|Making audits boring by automating evidence collection.
Kenji Clusterwood|he/him|Cluster Operator|Kubernetes,Multi-cluster,Networking|architecture chats|Operating 60 clusters across three clouds and still sleeping at night.
Zanele Metrics|she/her|Observability Engineer|Metrics,Grafana,OpenTelemetry|collaborators|Designing metric pipelines that scale without a cardinality explosion.
Alexei Agentov|he/him|Software Engineer|AI agents,LLM,Observability|feedback,collaborators|Tracing what AI agents actually do in production, one span at a time.
Grace Docsmith|she/her|Technical Writer|Docs,Open source,Education|contributors|Writing docs that make cloud native projects feel approachable.
Yusuf Falconer|he/him|Threat Detection Engineer|Falco,Runtime security,eBPF|peers,feedback|Catching container escapes in real time with runtime detection rules.
Camila Searchwell|she/her|Search Engineer|Elasticsearch,Vector search,Relevance|collaborators|Blending keyword and semantic search so results feel obvious.
Rohan Profilesh|he/him|Performance Engineer|Profiling,eBPF,Go|peers|Continuous profiling in production to find the line of code burning your money.
Leilani Meshwood|she/her|Platform Engineer|Service mesh,Developer experience,Backstage|platform teams|Building golden paths so new services ship with observability on day one.
Omar Storageh|he/him|Storage Engineer|Storage,Databases,Kubernetes|architecture chats|Running stateful databases on Kubernetes without fear.
Elena Typescriptova|she/her|Full Stack Engineer|TypeScript,React,Serverless|mentoring,collaborators|Shipping end-to-end typed apps from database to browser.
Chidi Rotaton|he/him|Incident Commander|Incident response,On-call,SRE|peers,mentoring|Running blameless postmortems that actually change things.
Sofia Meetupova|she/her|Community Manager|Meetups,Community,DevRel|speakers,sponsors|Connecting local cloud native meetups across Latin America.
Haruto Argonaut|he/him|Release Engineer|Argo CD,Progressive delivery,CI/CD|feedback|Rolling out canaries automatically and rolling back before anyone notices.
Ama Sbomsah|she/her|Open Source Maintainer|SBOM,Supply chain security,Maintainer|contributors,funding|Maintaining an SBOM tool used by thousands of pipelines.
Viktor Tracegaard|he/him|Backend Engineer|Distributed tracing,Go,Kafka|collaborators|Propagating trace context through every queue and cron job.
Nia Analytico|she/her|Data Scientist|Analytics,Machine learning,Data|AI infra folks|Predicting incidents from telemetry before pagers go off.
Pedro Gatewaye|he/him|API Engineer|API gateways,Authentication,Networking|architecture chats|Designing API gateways with zero-trust auth baked in.
Ayesha Uxley|she/her|Product Designer|UX,Design systems,Accessibility|design feedback,collaborators|Designing developer tools that are kind to tired on-call engineers.
Lars Opsberg|he/him|Infrastructure Engineer|Infrastructure as code,Terraform,Platform|hiring|Turning click-ops into reviewed, versioned infrastructure.
Mariam Ragnar|she/her|ML Researcher|RAG,LLM evaluation,Data|collaborators,feedback|Measuring whether retrieval actually makes LLM answers better.
Tevita Wanderly|he/him|Student|Curiosity,Career change,Learning|mentoring,internships|First conference ever, here to learn what all these acronyms mean.
Zhao Observa|she/her|Founder|Observability,OpenTelemetry,AI|investors,peers|Building an open source tool that explains traces in plain language.`.trim().split('\n')

const commPrefs = ["I'm Deaf, text me", 'Happy to chat anytime', 'Prefer a quick hello, then DMs', 'Low vision, please introduce yourself out loud', 'Async is best, leave a note', 'Quiet corner chats please']
const attendees = people.map((line, i) => {
  const [displayName, pronouns, role, interests, lookingFor, about] = line.split('|')
  return {
    tagId: 500 + i, kind: 'attendee', displayName, pronouns, role, about,
    interests: interests.split(','), lookingFor: lookingFor.split(','),
    approach: (['open', 'ask', 'quiet'] as const)[i % 3], commPref: commPrefs[i % commPrefs.length],
    interestsVisibleTo: i % 7 === 3 ? ['peers'] : ['peers', 'sponsors'], // a few keep sponsors out
    discoverable: i % 10 !== 9, // a few opt out of matchmaking
  }
})
const sponsors = ['Elastic', 'Dash0', 'Sonar', 'Skyhook'].map((name, i) => ({
  tagId: 580 + i, kind: 'sponsor', displayName: `${name} booth`, approach: 'open', commPref: 'Find us at the booth',
  interestsVisibleTo: [], discoverable: false,
}))

await ensureIndices()
const res = await es.bulk({
  refresh: true,
  operations: [...attendees, ...sponsors].flatMap((p) => {
    const _id = `seed-${p.tagId}`, hash = hashToken(`demo-${p.tagId}`)
    const profile = [{ index: { _index: 'profiles', _id } }, { ...p, tokenHash: hash }, { index: { _index: 'tokens', _id: hash } }, { profile: _id, kind: p.kind, tagId: p.tagId }]
    if (p.kind === 'sponsor') return profile
    const handle = p.displayName.toLowerCase().replace(/\s+/g, '.')
    return [...profile, { index: { _index: 'vault', _id } }, { email: `${handle}@example.com`, linkedin: `https://linkedin.com/in/${handle}-example`, github: `${handle}-example` }]
  }),
})
if (res.errors) throw new Error(`seed failed: ${res.items.filter((it) => it.index?.error).length} bulk errors`)
console.log(`Seeded ${attendees.length} attendees and ${sponsors.length} sponsors. Sponsor logins:`)
console.table(sponsors.map((s) => ({ sponsor: s.displayName, tagId: s.tagId, token: `demo-${s.tagId}` })))
