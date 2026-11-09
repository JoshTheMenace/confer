import { beforeEach, expect, test, vi } from 'vitest'
import { commonOf, match } from './common.js'
import { es } from './es.js'

vi.mock('./es.js', () => ({ es: { inference: { rerank: vi.fn() } }, ix: {} }))

// What the cross-encoder says about each pair of tags (anything else scores 0).
const table: Record<string, number> = { 'opentelemetry|distributed tracing': 0.11, 'react|css': 0.2, 'react|rust': 0.07 }
const score = (m: string, t: string) => table[`${m.toLowerCase()}|${t.toLowerCase()}`] ?? 0

test('same tags match in any case and come first', () => {
  expect(match(['React', 'OpenTelemetry'], ['Distributed tracing', 'react'], score))
    .toEqual([{ kind: 'same', mine: 'React', theirs: 'react' }, { kind: 'related', mine: 'OpenTelemetry', theirs: 'Distributed tracing' }])
})

test('pairs the reranker scores below the threshold are not related', () => {
  expect(match(['React'], ['Rust'], score)).toEqual([]) // both "programming things", not the same conversation
  expect(match(['Kubernetes'], ['React'], score)).toEqual([])
})

test('a tag is used once: the best pair wins, and a same tag is never reused as related', () => {
  expect(match(['React'], ['CSS', 'react'], score)).toEqual([{ kind: 'same', mine: 'React', theirs: 'react' }])
  expect(match(['OpenTelemetry', 'Kubernetes'], ['Distributed tracing'], score)).toEqual([{ kind: 'related', mine: 'OpenTelemetry', theirs: 'Distributed tracing' }])
})

test('without scores only same tags match, and never more than 5', () => {
  expect(match(['OpenTelemetry'], ['Distributed tracing'])).toEqual([])
  const tags = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  expect(match(tags, tags)).toHaveLength(5)
})

beforeEach(() => vi.clearAllMocks())
const rerank = (scoreOf: (query: string, doc: string) => number) =>
  vi.mocked(es.inference.rerank).mockImplementation((async ({ query, input }: { query: string; input: string[] }) => ({ rerank: input.map((d, index) => ({ index, relevance_score: scoreOf(query, d) })) })) as any)

test('asks the reranker only about tags without an exact match, one call per tag of mine, and caches the answers', async () => {
  rerank(score)
  const mine = ['OpenTelemetry', 'Go'], theirs = ['go', 'Distributed tracing', 'Sigstore']
  expect(await commonOf(mine, theirs)).toEqual([{ kind: 'same', mine: 'Go', theirs: 'go' }, { kind: 'related', mine: 'OpenTelemetry', theirs: 'Distributed tracing' }])
  expect(vi.mocked(es.inference.rerank).mock.calls.map(([r]) => [r.query, r.input])).toEqual([['OpenTelemetry', ['Distributed tracing', 'Sigstore']]])
  await commonOf(mine, theirs)
  expect(es.inference.rerank).toHaveBeenCalledTimes(1)
})

test('when the reranker fails or times out, same tags still match', async () => {
  vi.mocked(es.inference.rerank).mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
  expect(await commonOf(['Falco', 'Go'], ['go', 'Cilium'])).toEqual([{ kind: 'same', mine: 'Go', theirs: 'go' }])
})
