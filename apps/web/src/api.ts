import { hc } from 'hono/client'
import type { AppType } from '../../api/src/app'

// End-to-end typed client: change an API route and the web build breaks, not production.
export const api = hc<AppType>('/')
