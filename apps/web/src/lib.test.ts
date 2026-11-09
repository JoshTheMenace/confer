import { expect, test } from 'vitest'
import { approaches, contactHref, groupByType, parseRoute, splitList } from './lib'

test('comma lists are trimmed, de-duplicated and skip blanks', () => {
  expect(splitList(' eBPF, Kubernetes ,, eBPF ')).toEqual(['eBPF', 'Kubernetes'])
})

test('dex groups by type in canonical order; private interests land in Explorer', () => {
  const card = (id: string, interests?: string[]) => ({ id, ...(interests && { interests: { interests } }) })
  const groups = groupByType([card('a', ['React']), card('b', ['OpenTelemetry']), card('c'), card('d', ['Kubernetes'])])
  expect(groups.map(([type, cards]) => [type, cards.map((c) => c.id)])).toEqual([
    ['Observability', ['b']], ['Platform', ['d']], ['Frontend', ['a']], ['Explorer', ['c']],
  ])
})

test('unknown routes fall back to scan', () => {
  expect(parseRoute('#/inbox')).toBe('inbox')
  expect(parseRoute('#/nope')).toBe('scan')
  expect(parseRoute('')).toBe('scan')
})

test('approach is never color alone: every option has an icon and words', () => {
  for (const a of Object.values(approaches)) expect(a.icon && a.label && a.hint).toBeTruthy()
})

test('contact links cannot become javascript: URLs', () => {
  expect(contactHref('linkedin', 'javascript:alert(1)')).toBe('https://www.linkedin.com/in/javascript%3Aalert(1)')
  expect(contactHref('linkedin', 'https://linkedin.com/in/ana')).toBe('https://linkedin.com/in/ana')
  expect(contactHref('github', '@ana')).toBe('https://github.com/ana')
  expect(contactHref('email', 'ana@example.com')).toBe('mailto:ana@example.com')
})
