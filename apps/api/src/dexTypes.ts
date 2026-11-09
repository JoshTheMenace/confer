// Pure and dependency-free so the web app can import it too.
export const dexTypes = ['Observability', 'Security', 'Platform', 'AI', 'Data', 'Frontend', 'Community', 'Explorer'] as const
export type DexType = (typeof dexTypes)[number]

// Keywords match at the start of a word ("observ" hits "Observability"), so "ai" never matches "maintainer".
const buckets: [DexType, RegExp][] = [
  ['Observability', /\b(observ|otel|opentelemetry|tracing|traces|metrics|logs|logging|monitor|sre|prometheus|grafana|ebpf|profiling)/i],
  ['Security', /\b(secur|supply chain|sbom|sigstore|zero trust|vuln|policy|opa|falco|auth|identity|compliance)/i],
  ['Platform', /\b(kubernetes|k8s|platform|gitops|argo|flux|helm|devops|infra|serverless|wasm|webassembly|service mesh|istio|cilium|ci\/cd|networking|cluster)/i],
  ['AI', /\b(ai|ml|llm|genai|agent|rag|vector|inference|machine learning)/i],
  ['Data', /\b(data|database|postgres|kafka|search|elasticsearch|storage|analytics|streaming|sql)/i],
  ['Frontend', /\b(frontend|react|web|ux|design|javascript|typescript|mobile|accessib|a11y|css)/i],
  ['Community', /\b(community|devrel|open source|oss|mentor|diversity|education|docs|speaking|maintainer|meetup)/i],
]

// The bucket hit by the most interests wins; ties go to the earlier bucket; no hits = Explorer.
export function typeOf(interests: string[]): DexType {
  let best: DexType = 'Explorer', bestHits = 0
  for (const [type, re] of buckets) {
    const hits = interests.filter((i) => re.test(i)).length
    if (hits > bestHits) [best, bestHits] = [type, hits]
  }
  return best
}
