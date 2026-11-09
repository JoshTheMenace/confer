import { init } from '@dash0/sdk-web'
import { createRoot } from 'react-dom/client'
import { call } from './api'
import { App, personas } from './App'
import { Stage } from './Stage'
import { param } from './ui'
import './styles.css'

// Runtime config from the API so one image works in every environment. Best effort: never blocks the app.
call({ slot: 'config', token: null }, 'GET /api/config')
  .then(({ dash0 }) => dash0.token && init({ serviceName: 'confer-web', endpoint: { url: dash0.url, authToken: dash0.token } }))
  .catch((err) => console.warn('telemetry config unavailable', err))

// One switch for all motion: the OS setting, or ?motion=reduce to show it on stage.
const reduce = matchMedia('(prefers-reduced-motion: reduce)')
const root = document.documentElement
const setMotion = () => { root.dataset.motion = reduce.matches || param('motion') === 'reduce' ? 'reduce' : 'full' }
reduce.addEventListener('change', setMotion)
setMotion()
if (param('theme')) root.dataset.theme = param('theme')!

function Root() {
  if (location.hash.startsWith('#/stage')) return <Stage />
  return <App token={personas.find((p) => p.key === param('as'))?.token} />
}
addEventListener('hashchange', (e) => new URL(e.oldURL).hash.startsWith('#/stage') !== location.hash.startsWith('#/stage') && location.reload())
createRoot(document.getElementById('root')!).render(<Root />)
