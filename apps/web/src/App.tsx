import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { call, loadToken, saveToken, type Kind, type Me } from './api'
import { BadgeSheet } from './scan'
import { Booth, Leads } from './screens/Booth'
import { Discover } from './screens/Discover'
import { Inbox } from './screens/Inbox'
import { MeScreen } from './screens/Me'
import { Onboarding } from './screens/Onboarding'
import { People, Person } from './screens/People'
import { Pulse } from './screens/Pulse'
import { Scan } from './screens/Scan'
import { AppCtx } from './ui'

export const personas = [
  { key: 'amara', label: 'Amara', token: 'demo-500' },
  { key: 'diego', label: 'Diego', token: 'demo-501' },
  { key: 'booth', label: 'Elastic booth', token: 'demo-580' },
  { key: 'organizer', label: 'Organizer', token: 'demo-590' },
]
const tabs: Record<Kind, [route: string, label: string][]> = {
  attendee: [['scan', 'Scan'], ['people', 'People'], ['inbox', 'Inbox'], ['discover', 'Discover'], ['me', 'Me']],
  sponsor: [['scan', 'Scan'], ['leads', 'Leads'], ['booth', 'Booth']],
  organizer: [['pulse', 'Pulse']],
}
const fromHash = () => location.hash.replace(/^#\/?/, '')

/** One phone: its own session, its own route. `memory` keeps the route out of the URL so two can share a page. */
export function App({ slot = 'main', token: given, route: start = '', memory = false }: { slot?: string; token?: string; route?: string; memory?: boolean }) {
  const [token, setToken] = useState(() => given ?? loadToken(slot))
  const [me, setMe] = useState<Me>()
  const [route, setRoute] = useState(memory ? start : fromHash())
  const [said, setSaid] = useState('')
  const main = useRef<HTMLElement>(null)
  const session = useMemo(() => ({ slot, token }), [slot, token])
  const signIn = useCallback((t: string | null) => { saveToken(slot, t); setToken(t); setMe(undefined) }, [slot])

  useEffect(() => { if (given) signIn(given) }, [given, signIn])
  useEffect(() => {
    if (token) call(session, 'GET /api/me').then((r) => setMe(r.me), () => signIn(null))
  }, [session, token, signIn])
  useEffect(() => {
    if (memory) return
    const onHash = () => setRoute(fromHash())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [memory])

  const go = useCallback((r: string) => {
    if (memory) setRoute(r); else location.hash = `/${r}`
    // Move focus to the new screen's heading so keyboard and screen reader users land where the content changed.
    requestAnimationFrame(() => main.current?.querySelector<HTMLElement>('h1')?.focus())
  }, [memory])

  if (!token) return <div className="app"><Onboarding onDone={(t) => signIn(t)} slot={slot} /></div>
  if (!me) return <div className="app"><p className="loading" role="status">Loading your badge…</p></div>

  const list = tabs[me.kind], [page, id] = (route || list[0][0]).split('/')
  const screen =
    page === 'print' ? <BadgeSheet ids={[me.tagId]} />
    : me.kind === 'organizer' ? <Pulse />
    : page === 'people' && id ? <Person id={id} />
    : page === 'people' ? <People />
    : page === 'inbox' ? <Inbox />
    : page === 'discover' ? <Discover />
    : page === 'me' ? <MeScreen />
    : page === 'leads' ? <Leads />
    : page === 'booth' ? <Booth />
    : <Scan />
  const current = list.some(([r]) => r === page) ? page : list[0][0]

  return (
    <AppCtx.Provider value={{ session, me, setMe, go, say: setSaid, signOut: () => signIn(null) }}>
      <div className="app">
        <main ref={main}>{screen}</main>
        {list.length > 1 && (
          <nav aria-label="Sections">
            {list.map(([r, label]) => (
              <a key={r} href={`#/${r}`} aria-current={r === current ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(r) }}>{label}</a>
            ))}
          </nav>
        )}
        <p className="sr" role="status" aria-live="polite">{said}</p>
      </div>
    </AppCtx.Provider>
  )
}
