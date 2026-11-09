import type { Common } from './contract.js'
import { es, ix } from './es.js'
import { log } from './telemetry.js'

const MODEL = '.jina-embeddings-v5-text-small', BATCH = 16 // the endpoint refuses more than 16 inputs per call
// Tuned live on bare tags: "OpenTelemetry"~"Distributed tracing" scores 0.49 and "eBPF"~"Cilium" 0.39; "Kubernetes"~"React" 0.36.
const THRESHOLD = 0.38
const key = (tag: string) => tag.trim().toLowerCase()
const vectors = new Map<string, number[]>() // in-process: the same tags repeat all day and a tag's vector never changes

function cosine(a?: number[], b?: number[]) {
  if (!a || !b) return 0
  let dot = 0, aa = 0, bb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2 }
  return dot / Math.sqrt(aa * bb)
}

/** Pure: same tags first (any case), then the closest related pairs. A tag is used once; at most 5 results. */
export function match(mine: string[], theirs: string[], vec: Map<string, number[]> = new Map(), threshold = THRESHOLD): Common[] {
  const common: Common[] = mine.flatMap((m) => {
    const t = theirs.find((t) => key(t) === key(m))
    return t ? [{ kind: 'same' as const, mine: m, theirs: t }] : []
  })
  const used = new Set(common.map((c) => key(c.mine)))
  const pairs = mine.flatMap((m) => theirs.map((t) => ({ mine: m, theirs: t, score: cosine(vec.get(key(m)), vec.get(key(t))) })))
    .filter((p) => p.score >= threshold).sort((a, b) => b.score - a.score)
  for (const p of pairs) {
    if (used.has(key(p.mine)) || used.has(key(p.theirs))) continue
    used.add(key(p.mine)).add(key(p.theirs))
    common.push({ kind: 'related', mine: p.mine, theirs: p.theirs })
  }
  return common.slice(0, 5)
}

/** Embeds the tags not seen before. Also called at signup and boot, so a scan rarely waits on inference. */
export async function embed(tags: string[], timeoutMs = 1500) {
  // Cached by lower-case key, but embedded as typed: the model reads "eBPF" better than "ebpf".
  const need = [...new Map(tags.map((t) => [key(t), t.trim()])).values()].filter((t) => t && !vectors.has(key(t)))
  const batches = Array.from({ length: Math.ceil(need.length / BATCH) }, (_, i) => need.slice(i * BATCH, (i + 1) * BATCH))
  await Promise.all(batches.map(async (input) => {
    const res = await es.inference.textEmbedding({ inference_id: MODEL, input }, { requestTimeout: timeoutMs, maxRetries: 0 })
    res?.text_embedding?.forEach((e, i) => vectors.set(key(input[i]), e.embedding))
  }))
}

export async function commonOf(mine: string[] = [], theirs: string[] = []): Promise<Common[]> {
  // Too slow or down: fall back to same tags only rather than hold up a scan.
  await embed([...mine, ...theirs]).catch((err) => log.warn({ err: err?.name }, 'embeddings unavailable, matching same tags only'))
  return match(mine, theirs, vectors)
}

/** At boot: embed every tag already in use (the first inference call after idle takes about 5s). */
export async function warm() {
  const res = await es.search({ index: ix.profiles, size: 0, aggs: { tags: { terms: { field: 'interests', size: 1000 } } } })
  await embed(((res.aggregations?.tags as { buckets?: { key: string }[] })?.buckets ?? []).map((b) => b.key), 20_000)
}
