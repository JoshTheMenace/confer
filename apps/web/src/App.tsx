import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { type Kind, type Me, type Session, call, isMock, loadToken, param, saveToken } from './api'
import { Booth, Leads } from './screens/Booth'
import { Discover } from './screens/Discover'
import { Inbox } from './screens/Inbox'
import { MeScreen, Print } from './screens/Me'
import { Onboarding } from './screens/Onboarding'
import { People, Person } from './screens/People'
import { PulseScreen } from './screens/Pulse'
import { Scan } from './screens/Scan'
import { Icon, type IconName, Loading } from './ui'

type AppCtx = {
  session: Session; me: Me; setMe: (m: Me) => void; signOut: () => void
  go: (route: string) => void
  say: (message: string) => void // shown as a toast and read out by screen readers
  deep: (key: string) => string | null // deep-link query params; ignored inside Stage so two phones don't both act on them
}
const Ctx = createContext<AppCtx>(null!)
export const useApp = () => useContext(Ctx)

const tabs: Record<Kind, [string, IconName, string][]> = {
  attendee: [['scan', 'scan', 'Scan'], ['people', 'people', 'People'], ['inbox', 'inbox', 'Inbox'], ['discover', 'search', 'Discover'], ['me', 'badge', 'Me']],
  sponsor: [['scan', 'scan', 'Scan'], ['leads', 'chart', 'Leads'], ['booth', 'booth', 'Booth']],
  organizer: [['pulse', 'pulse', 'Pulse']],
}
const fromHash = () => location.hash.replace(/^#\/?/, '')

/** One signed-in phone. Standalone it follows the URL hash; inside Stage (`framed`) it keeps its route in memory. */
export function App({ slot, token, start = '', framed = false }: { slot: string; token?: string; start?: string; framed?: boolean }) {
  const [session, setSession] = useState<Session>(() => ({ slot, token: token ?? loadToken(slot) }))
  const [me, setMe] = useState<Me | null>() // undefined: loading, null: signed out
  const [error, setError] = useState<string>()
  const [route, setRoute] = useState(framed ? start : fromHash)
  const [toast, setToast] = useState('')
  const main = useRef<HTMLElement>(null)
  const first = useRef(true)

  const signIn = useCallback((t: string) => { saveToken(slot, t); setMe(undefined); setSession({ slot, token: t }) }, [slot])
  useEffect(() => {
    if (!session.token) return setMe(null)
    call(session, 'GET /api/me').then((r) => setMe(r.me), (e: Error & { status?: number }) => (e.status === 401 ? signIn('') : setError(e.message)))
  }, [session, signIn])
  useEffect(() => {
    if (framed) return
    const on = () => setRoute(fromHash())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [framed])
  // Land keyboard and screen reader users on the new screen (but don't steal focus on first paint).
  useEffect(() => { first.current ? (first.current = false) : main.current?.focus() }, [route])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t) }, [toast])

  const go = useCallback((r: string) => (framed ? setRoute(r) : void (location.hash = `#/${r}`)), [framed])
  const [name, arg] = route.split('/')
  const mine = me ? tabs[me.kind] : []
  const page = mine.some(([r]) => r === name) || name === 'print' ? name : mine[0]?.[0]
  const screens: Record<string, React.ReactNode> = {
    scan: <Scan />, people: arg ? <Person id={arg} /> : <People />, inbox: <Inbox />, discover: <Discover />, me: <MeScreen />, print: <Print />,
    leads: <Leads />, booth: <Booth />, pulse: <PulseScreen />,
  }

  return (
    <div className="app">
      <header className="bar">
        <span className="wordmark">Confer</span>
        {isMock && <span className="tag">Demo data</span>}
        {me && <span className="who">{me.displayName} <b>#{me.tagId}</b></span>}
      </header>
      <main ref={main} tabIndex={-1}>
        {me === undefined ? <Loading error={error} /> : me === null ? <Onboarding onToken={signIn} /> : (
          <Ctx.Provider value={{ session, me, setMe, go, say: setToast, signOut: () => signIn(''), deep: (k) => (framed ? null : param(k)) }}>
            {screens[page]}
          </Ctx.Provider>
        )}
      </main>
      <p className="toast" role="status" aria-live="polite">{toast}</p>
      {me && mine.length > 1 && (
        <nav className="tabs" aria-label="Main">
          {mine.map(([r, icon, label]) => (
            <a key={r} href={`#/${r}`} aria-current={page === r ? 'page' : undefined} onClick={(e) => { if (framed) { e.preventDefault(); go(r) } }}>
              <Icon name={icon} />{label}
            </a>
          ))}
        </nav>
      )}
    </div>
  )
}
