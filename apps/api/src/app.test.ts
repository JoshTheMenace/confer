import { expect, test } from 'vitest'
import { app } from './app.js'

test('liveness probe answers', async () => {
  const res = await app.request('/healthz')
  expect(await res.text()).toBe('ok')
})
