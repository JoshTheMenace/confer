import { useEffect, useMemo, useRef, useState } from 'react'
import type { Kind, Me } from '../../api/src/contract'
import { call, flag, loadToken, saveToken, type Session } from './api'
import { DiscoverScreen, InboxScreen, PeopleScreen, PersonScreen, ScanScreen } from './screens/attendee'
import { BoothScreen, LeadsScreen, PulseScreen, PulseTotals, usePulse } from './screens/booth'
import { MeScreen, Onboarding, PrintScreen } from './screens/profile'
import { AppCtx, usePoll } from './ui'

const tabs: Record<Kind, [string, string, string][]> = {
  attendee: [['scan', 'Scan', '◎'], ['people', 'People', '☺'], ['inbox', 'Inbox', '✉'], ['discover', 'Discover', '⌕'], ['me', 'Me', '▣']],
  sponsor: [['scan', 'Scan', '◎'], ['leads', 'Leads', '✓'], ['booth', 'Booth', '▣']],
  organizer: [['pulse', 'Pulse', '♥']],
}
export const personas = { amara: 'demo-500', diego: 'demo-501', booth: 'demo-580', organizer: 'demo-590' }
export type Persona = keyof typeof personas
const hashRoute = () => location.hash.replace(/^#\/?/, '')

/** One signed-in person. Standalone it follows the URL hash; on Stage each phone keeps its own route in memory. */
export function App({ slot = 'solo', persona, start, inMemory }: { slot?: string; persona?: Persona; start?: string; inMemory?: boolean }) {
  const [token, setTokenState] = useState(() => (persona ? personas[persona] : loadToken(slot)))
  const [me, setMe] = useState<Me>()
  const [route, setRoute] = useState(start ?? (inMemory ? '' : hashRoute()))
  const [said, setSaid] = useState('')
  const main = useRef<HTMLElement>(null)
  const session = useMemo<Session>(() => ({ slot, token }), [slot, token])
  const setToken = (t: string | null) => { saveToken(slot, t); setMe(undefined); setTokenState(t) }

  useEffect(() => { if (persona) setToken(personas[persona]) }, [persona])
  useEffect(() => {
    if (token) call(session, 'GET /api/me').then((r) => setMe(r.me), () => setToken(null))
  }, [session])
  useEffect(() => {
    if (inMemory) return
    const onHash = () => setRoute(hashRoute())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [inMemory])
  // The Inbox tab lights up, and says so, wherever you are when a booth's request lands.
  const inbox = usePoll(async () => (me?.kind === 'attendee' ? call(session, 'GET /api/inbox') : undefined), [session, me?.kind])
  const pending = inbox.data?.requests.filter((r) => r.status === 'pending').length ?? 0
  const before = useRef<number>(undefined)
  useEffect(() => {
    if (!inbox.data) return
    if (before.current !== undefined && pending > before.current) setSaid('A booth sent you a request.')
    before.current = pending
  }, [inbox.data])
  const first = useRef(true)
  useEffect(() => {
    // Move focus to the new screen's heading, but not on first paint (Stage has two Apps).
    if (!first.current) main.current?.querySelector<HTMLElement>('h1')?.focus()
    first.current = false
  }, [route])

  if (!token) return <Onboarding session={session} onToken={setToken} />
  if (!me) return <main className="screen" aria-busy="true"><p className="muted">Getting your badge…</p></main>

  const go = (r: string) => (inMemory ? setRoute(r) : (location.hash = `/${r}`))
  const mine = tabs[me.kind], [page, id] = (mine.some(([t]) => route.startsWith(t)) || route === 'print' ? route : mine[0][0]).split('/')
  const screen = { scan: <ScanScreen />, people: id ? <PersonScreen key={id} id={id} /> : <PeopleScreen />, inbox: <InboxScreen />, discover: <DiscoverScreen />, me: <MeScreen />, print: <PrintScreen me={me} />, leads: <LeadsScreen />, booth: <BoothScreen />, pulse: <PulseScreen /> }[page]
  return (
    <AppCtx value={{ session, me, setMe, route, go, say: setSaid, signOut: () => setToken(null) }}>
      <div className="app">
        <header className="bar"><span className="wordmark">Confer</span><span className="whoami">{me.displayName} · badge {me.tagId}</span></header>
        <main ref={main} className="screen" key={page + (id ?? '')}>{screen}</main>
        <nav aria-label="Sections">
          {mine.map(([t, label, icon]) => (
            <a key={t} href={`#/${t}`} aria-current={page === t ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(t) }}><span aria-hidden>{icon}</span>{label}{t === 'inbox' && pending > 0 && <b className="dot" key={pending}>{pending}<span className="sr"> waiting</span></b>}</a>
          ))}
        </nav>
        <p className="sr" aria-live="polite" role="status">{said}</p>
      </div>
    </AppCtx>
  )
}

const names: Record<Persona, string> = { amara: 'Amara', diego: 'Diego', booth: 'Elastic booth', organizer: 'Organizer' }

function Phone({ slot, initial, start }: { slot: string; initial: Persona; start?: string }) {
  const [persona, setPersona] = useState(initial)
  return (
    <section className="phone-wrap" aria-label={`${names[persona]}'s phone`}>
      <div className="switch" role="group" aria-label="Who holds this phone">
        {(Object.keys(personas) as Persona[]).map((p) => <button key={p} aria-pressed={p === persona} onClick={() => setPersona(p)}>{names[p]}</button>)}
      </div>
      <div className="phone"><App key={persona} slot={slot} persona={persona} start={start} inMemory /></div>
    </section>
  )
}

/** The projector view: two live phones and the pulse strip, so the room sees cause and effect together. */
export function Stage() {
  const { data } = usePulse(useMemo(() => ({ slot: 'stage', token: personas.organizer }), []))
  return (
    <div className="stage">
      <header><p className="wordmark">Confer</p><p className="tagline">The front of your badge says hi. <em>Only you say yes.</em></p></header>
      <div className="phones">
        <Phone slot="left" initial={(flag('left') as Persona) ?? 'amara'} start={flag('l') ?? 'scan'} />
        <Phone slot="right" initial={(flag('right') as Persona) ?? 'diego'} start={flag('r') ?? 'people'} />
      </div>
      <footer aria-label="Event Pulse, live">{data ? <PulseTotals totals={data.totals} /> : <p className="muted">Pulse is warming up…</p>}</footer>
    </div>
  )
}
