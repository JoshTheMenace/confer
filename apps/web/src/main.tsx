import { init } from '@dash0/sdk-web'
import { createRoot } from 'react-dom/client'
import { type Persona, call, isMock, param, personas } from './api'
import { App } from './App'
import { Stage } from './Stage'
import './styles.css'

const html = document.documentElement
html.dataset.theme = param('theme') ?? 'dark'
if (param('w')) html.style.setProperty('--w', `${param('w')}px`)
// One switch for all motion: the OS setting, or `?motion=reduce` for demos and screenshots.
const calm = matchMedia('(prefers-reduced-motion: reduce)')
const setMotion = () => { html.dataset.motion = calm.matches || param('motion') === 'reduce' ? 'reduce' : 'full' }
calm.addEventListener('change', setMotion)
setMotion()

// Telemetry is best-effort: runtime config from the API so one image works in every environment.
if (!isMock) {
  call(null, 'GET /api/config')
    .then(({ dash0 }) => dash0.token && init({ serviceName: 'confer-web', endpoint: { url: dash0.url, authToken: dash0.token } }))
    .catch((err) => console.warn('telemetry config unavailable', err))
}

const as = param('as') as Persona | null
createRoot(document.getElementById('root')!).render(
  location.hash.startsWith('#/stage') ? <Stage /> : <App slot={as ?? 'main'} token={as ? (personas[as]?.token ?? '') : undefined} />,
)
