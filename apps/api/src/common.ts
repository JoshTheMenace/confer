import type { Common } from './contract.js'
import { es } from './es.js'
import { log } from './telemetry.js'

// Is "OpenTelemetry" the same conversation as "Distributed tracing"? A cross-encoder (Elastic inference reranker) reads the
// two tags together and scores them. Measured live on bare tags: related pairs score 0.09 to 0.25, while unrelated ones
// (React and Rust, Prometheus and Argo CD) stay under 0.09. Embedding cosine could not tell those apart, so this is a reranker.
const MODEL = process.env.ELASTIC_RERANKER ?? '.jina-reranker-v3', THRESHOLD = 0.09
const key = (tag: string) => tag.trim().toLowerCase()
const pair = (mine: string, theirs: string) => `${key(mine)}|${key(theirs)}`
const scores = new Map<string, number>() // in-process: the same tag pairs repeat all day and a pair's score never changes

/** Pure: same tags first (any case), then the best-scoring related pairs. A tag is used once; at most 5 results. */
export function match(mine: string[], theirs: string[], score: (mine: string, theirs: string) => number = () => 0, threshold = THRESHOLD): Common[] {
  const common: Common[] = mine.flatMap((m) => {
    const t = theirs.find((t) => key(t) === key(m))
    return t ? [{ kind: 'same' as const, mine: m, theirs: t }] : []
  })
  const used = new Set(common.map((c) => key(c.mine)))
  const pairs = mine.flatMap((m) => theirs.map((t) => ({ mine: m, theirs: t, score: score(m, t) })))
    .filter((p) => p.score >= threshold).sort((a, b) => b.score - a.score)
  for (const p of pairs) {
    if (used.has(key(p.mine)) || used.has(key(p.theirs))) continue
    used.add(key(p.mine)).add(key(p.theirs))
    common.push({ kind: 'related', mine: p.mine, theirs: p.theirs })
  }
  return common.slice(0, 5)
}

/** Scores the pairs not seen before: one rerank call per tag of mine, all at once, each tag sent as typed. */
async function scorePairs(mine: string[], theirs: string[], timeoutMs: number) {
  await Promise.all(mine.map(async (m) => {
    const input = theirs.filter((t) => !scores.has(pair(m, t)))
    if (!input.length) return
    const res = await es.inference.rerank({ inference_id: MODEL, query: m, input }, { requestTimeout: timeoutMs, maxRetries: 0 })
    res.rerank.forEach((r) => scores.set(pair(m, input[r.index]), r.relevance_score))
  }))
}

export async function commonOf(mine: string[] = [], theirs: string[] = [], timeoutMs = 1500): Promise<Common[]> {
  // Only tags without an exact match on the other side can be "related" to something.
  const rest = (a: string[], b: string[]) => [...new Map(a.filter((t) => t.trim() && !b.some((o) => key(o) === key(t))).map((t) => [key(t), t.trim()])).values()]
  // Too slow or down: fall back to same tags only rather than hold up a scan.
  await scorePairs(rest(mine, theirs), rest(theirs, mine), timeoutMs).catch((err) => log.warn({ err: err?.name }, 'reranker unavailable, matching same tags only'))
  return match(mine, theirs, (m, t) => scores.get(pair(m, t)) ?? 0)
}

/** At boot: wake the inference endpoint, because its first call after idle takes several seconds. */
export const warm = () => es.inference.rerank({ inference_id: MODEL, query: 'OpenTelemetry', input: ['Distributed tracing'] }, { requestTimeout: 20_000 })
