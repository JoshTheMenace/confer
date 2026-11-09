import { init } from '@dash0/sdk-web'
import { createRoot } from 'react-dom/client'
import { api } from './api'
import { App } from './App'

// Runtime config from the API so one image works in every environment.
const { dash0 } = await (await api.api.config.$get()).json()
if (dash0.token) init({ serviceName: 'dex-web', endpoint: { url: dash0.url, authToken: dash0.token } })

createRoot(document.getElementById('root')!).render(<App />)
