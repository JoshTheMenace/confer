import { init } from '@dash0/sdk-web'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { call, flag, isMock, personas, type Persona } from './api'
import { App, Stage } from './App'
import './styles.css'

// Runtime config from the API so one image works in every environment. Best effort: the app never waits on it.
if (!isMock)
  call({ slot: 'config', token: null }, 'GET /api/config')
    .then(({ dash0 }) => dash0.token && init({ serviceName: 'dex-web', endpoint: { url: dash0.url, authToken: dash0.token } }))
    .catch((err) => console.warn('telemetry config unavailable', err))
else if (flag('demo')) (await import('./mock/server')).mock.demo(flag('demo')!)

// One switch each for theme and motion, so `?theme=dark` and `?rm` can show them without changing the OS.
const root = document.documentElement
const dark = matchMedia('(prefers-color-scheme: dark)'), still = matchMedia('(prefers-reduced-motion: reduce)')
const apply = () => {
  // Stage is always light: white phones on the navy stage read from the back of the room.
  root.dataset.theme = flag('theme') ?? (dark.matches && !location.hash.startsWith('#/stage') ? 'dark' : 'light')
  root.classList.toggle('rm', flag('rm') !== null || still.matches)
}
apply()
if (flag('w')) root.style.maxWidth = `${flag('w')}px` // screenshots: desktop headless Chrome will not go narrower than 500px
dark.addEventListener('change', apply)
still.addEventListener('change', apply)

function Root() {
  const [stage, setStage] = useState(location.hash.startsWith('#/stage'))
  useEffect(() => {
    const onHash = () => setStage(location.hash.startsWith('#/stage'))
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  const as = flag('as')
  return stage ? <Stage /> : <App persona={as && as in personas ? (as as Persona) : undefined} />
}

createRoot(document.getElementById('root')!).render(<Root />)
