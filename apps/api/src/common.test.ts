import { beforeEach, expect, test, vi } from 'vitest'
import { commonOf, match } from './common.js'
import { es } from './es.js'

vi.mock('./es.js', () => ({ es: { inference: { textEmbedding: vi.fn() } }, ix: {} }))

// Two directions: "tracing" tags point one way, "frontend" tags the other.
const vec = new Map([['opentelemetry', [1, 0.1]], ['distributed tracing', [1, 0.2]], ['kubernetes', [0.6, 0.8]], ['react', [0, 1]], ['css', [0.1, 1]]])

test('same tags match in any case and come first', () => {
  expect(match(['React', 'OpenTelemetry'], ['Distributed tracing', 'react'], vec, 0.9))
    .toEqual([{ kind: 'same', mine: 'React', theirs: 'react' }, { kind: 'related', mine: 'OpenTelemetry', theirs: 'Distributed tracing' }])
})

test('tags below the threshold are not related', () => {
  expect(match(['Kubernetes'], ['React'], vec, 0.9)).toEqual([])
  expect(match(['OpenTelemetry'], ['React'], vec, 0.9)).toEqual([])
})

test('a tag is used once: the closest pair wins, and a same tag is never reused as related', () => {
  expect(match(['React'], ['CSS', 'react'], vec, 0.9)).toEqual([{ kind: 'same', mine: 'React', theirs: 'react' }])
  expect(match(['OpenTelemetry', 'Kubernetes'], ['Distributed tracing'], vec, 0.5)).toEqual([{ kind: 'related', mine: 'OpenTelemetry', theirs: 'Distributed tracing' }])
})

test('without vectors only same tags match, and never more than 5', () => {
  expect(match(['OpenTelemetry'], ['Distributed tracing'])).toEqual([])
  const tags = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  expect(match(tags, tags)).toHaveLength(5)
})

beforeEach(() => vi.clearAllMocks())

test('embeds unseen tags in batches of 16, as typed, and caches them', async () => {
  vi.mocked(es.inference.textEmbedding).mockImplementation((async ({ input }: { input: string[] }) => ({ text_embedding: input.map(() => ({ embedding: [1, 0] })) })) as any)
  const mine = Array.from({ length: 10 }, (_, i) => `Mine ${i}`), theirs = Array.from({ length: 10 }, (_, i) => `Theirs ${i}`)
  expect(await commonOf(mine, theirs)).toHaveLength(5)
  expect(vi.mocked(es.inference.textEmbedding).mock.calls.map(([r]) => (r.input as string[]).length)).toEqual([16, 4])
  expect((vi.mocked(es.inference.textEmbedding).mock.calls[0][0].input as string[])[0]).toBe('Mine 0')
  await commonOf(mine, theirs)
  expect(es.inference.textEmbedding).toHaveBeenCalledTimes(2)
})

test('when embeddings fail or time out, same tags still match', async () => {
  vi.mocked(es.inference.textEmbedding).mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
  expect(await commonOf(['Falco', 'Go'], ['go', 'Sigstore'])).toEqual([{ kind: 'same', mine: 'Go', theirs: 'go' }])
})
