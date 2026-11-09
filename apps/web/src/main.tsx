import { init } from '@dash0/sdk-web'
import { createRoot } from 'react-dom/client'
import { api } from './api'
import { App } from './App'
import './styles.css'

// Runtime config from the API so one image works in every environment.
try {
  const { dash0 } = await (await api.api.config.$get()).json()
  if (dash0.token) init({ serviceName: 'dex-web', endpoint: { url: dash0.url, authToken: dash0.token } })
} catch (err) {
  console.warn('telemetry config unavailable', err)
}

createRoot(document.getElementById('root')!).render(<App />)
