// Loaded with `node --import` before the app. The stock register only patches CommonJS `require`,
// so without this ESM hook, packages we `import` (like pino) are never instrumented and logs never reach Dash0.
import { register } from 'node:module'

register('@opentelemetry/instrumentation/hook.mjs', import.meta.url)
await import('@opentelemetry/auto-instrumentations-node/register')
