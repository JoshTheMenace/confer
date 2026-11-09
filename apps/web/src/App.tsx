import { useEffect, useState } from 'react'
import { api } from './api'

type Status = Awaited<ReturnType<Awaited<ReturnType<typeof api.api.status.$get>>['json']>>

export function App() {
  const [status, setStatus] = useState<Status>()
  useEffect(() => void api.api.status.$get().then((r) => r.json()).then(setStatus), [])
  return (
    <main style={{ fontFamily: 'system-ui', padding: 16 }}>
      <h1>Dex system check</h1>
      {!status ? <p>Checking…</p> : (
        <ul>
          <li>Elasticsearch: {status.elastic ?? '❌ not connected'}</li>
          <li>Dash0: {status.dash0 ? '✅' : '❌'}</li>
          <li>OpenAI: {status.openai ? '✅' : '❌'}</li>
        </ul>
      )}
    </main>
  )
}
