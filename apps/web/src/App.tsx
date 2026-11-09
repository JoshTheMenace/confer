import { type ReactNode, useEffect, useRef, useState } from 'react'
import { api, call, getToken, setToken, type Me } from './api'
import { parseRoute, type Route } from './lib'
import { Badge, Print } from './screens/Badge'
import { Dex } from './screens/Dex'
import { Inbox } from './screens/Inbox'
import { Leads } from './screens/Leads'
import { Onboarding } from './screens/Onboarding'
import { Scan } from './screens/Scan'
import { Loading, Problem } from './ui'

const tabs: Record<Me['kind'], [Route, string, string][]> = {
  attendee: [['scan', '📷', 'Scan'], ['badge', '🪪', 'Badge'], ['dex', '📚', 'Dex'], ['inbox', '📨', 'Inbox']],
  sponsor: [['scan', '📷', 'Scan'], ['leads', '📊', 'Leads'], ['badge', '🪪', 'Badge']],
  organizer: [],
}

function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(location.hash))
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash))
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return route
}

export function App() {
  const [me, setMe] = useState<Me | null>() // undefined = loading, null = signed out
  const [error, setError] = useState<string>()
  const route = useRoute()
  const main = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!getToken()) return setMe(null)
    call(api.api.me.$get()).then((r) => setMe(r.me), (e: Error & { status?: number }) => {
      if (e.status !== 401) return setError(e.message)
      setToken('') // stale token: start over
      setMe(null)
    })
  }, [])
  // Move focus to the new screen so keyboard and screen reader users land on its heading.
  useEffect(() => main.current?.focus({ preventScroll: false }), [route])

  const screens: Record<Route, () => ReactNode> = {
    scan: () => <Scan />, badge: () => <Badge />, print: () => <Print />,
    dex: () => <Dex />, inbox: () => <Inbox />, leads: () => <Leads />,
  }

  return (
    <>
      <header className="top" style={{ maxWidth: 640, margin: '0 auto', padding: '12px 16px 0' }}>
        <span className="logo"><i aria-hidden />Dex</span>
        {me && <span className="muted">#{me.tagId} · {me.displayName}</span>}
      </header>
      <main ref={main} tabIndex={-1} style={{ outline: 'none' }}>
        {me === undefined ? (error ? <Problem error={error} /> : <Loading what="Dex" />) : me ? screens[route]() : <Onboarding />}
      </main>
      {me && (
        <nav className="tabs" aria-label="Main">
          {tabs[me.kind].map(([r, icon, label]) => (
            <a key={r} href={`#/${r}`} aria-current={route === r || (r === 'badge' && route === 'print') ? 'page' : undefined}>
              <span aria-hidden>{icon}</span>{label}
            </a>
          ))}
        </nav>
      )}
    </>
  )
}
