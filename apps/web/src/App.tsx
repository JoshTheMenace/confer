import { useEffect, useMemo, useRef, useState } from 'react'
import type { Kind, Me } from '../../api/src/contract'
import { call, flag, isMock, loadToken, type Persona, personas, saveToken, type Session } from './api'
import { BoothScreen } from './screens/BoothSetup'
import { ChatScreen } from './screens/Chat'
import { DiscoverScreen } from './screens/Discover'
import { InboxScreen } from './screens/Inbox'
import { LeadsScreen } from './screens/Leads'
import { PeopleScreen } from './screens/People'
import { PersonScreen } from './screens/Person'
import { PulseScreen, usePulse } from './screens/Pulse'
import { MeScreen, Onboarding, PrintScreen } from './screens/profile'
import { ScanScreen } from './screens/Scan'
import { Scenery } from './Scenery'
import { AppCtx, Count, Icon, type IconName, Problem, usePoll, who } from './ui'

const tabs: Record<Kind, [route: string, label: string, icon: IconName][]> = {
  attendee: [['scan', 'Scan', 'scan'], ['people', 'People', 'people'], ['inbox', 'Inbox', 'inbox'], ['discover', 'Discover', 'discover'], ['me', 'Me', 'me']],
  sponsor: [['scan', 'Scan', 'scan'], ['leads', 'Leads', 'leads'], ['inbox', 'Inbox', 'inbox'], ['booth', 'Booth', 'booth']],
  organizer: [['pulse', 'Pulse', 'pulse']],
}
const hashRoute = () => location.hash.replace(/^#\/?/, '')

/** One signed-in person. Standalone it follows the URL hash; on Stage each phone keeps its own route in memory. */
export function App({ slot = 'solo', persona, start, inMemory }: { slot?: string; persona?: Persona; start?: string; inMemory?: boolean }) {
  const [token, setTokenState] = useState<string | null>(() => (persona ? personas[persona][1] : loadToken(slot)))
  const [me, setMe] = useState<Me>()
  const [problem, setProblem] = useState<string>()
  const [tries, setTries] = useState(0)
  const [route, setRoute] = useState(start ?? (inMemory ? '' : hashRoute()))
  const [said, setSaid] = useState('')
  const main = useRef<HTMLElement>(null)
  const known = useRef<{ asked: Set<string>; unread: Map<string, number>; shared: Set<string> }>(undefined)
  const session = useMemo<Session>(() => ({ slot, token }), [slot, token])
  const setToken = (t: string | null) => { saveToken(slot, t); known.current = undefined; setMe(undefined); setTokenState(t) }

  useEffect(() => { if (persona) setToken(personas[persona][1]) }, [persona])
  useEffect(() => {
    if (!token) return
    setProblem(undefined)
    // Only a rejected token signs you out; a network blip offers a retry instead.
    call(session, 'GET /api/me').then((r) => setMe(r.me), (e: Error) => (e.message === 'Please sign in again.' && !persona ? setToken(null) : setProblem(e.message)))
  }, [session, tries])
  useEffect(() => {
    if (inMemory) return
    const onHash = () => setRoute(hashRoute())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [inMemory])

  // Requests, messages and shares are announced from here, so they are heard and seen on whatever screen you are on.
  const social = !!me && me.kind !== 'organizer'
  // Lists default to empty, so an API that leaves one out cannot blank the app.
  const inbox = usePoll(async () => (social ? call(session, 'GET /api/inbox').then((r) => ({ requests: r.requests ?? [], chats: r.chats ?? [], receipts: r.receipts ?? [] })) : undefined), [session, social])
  const people = usePoll(async () => (social ? call(session, 'GET /api/people') : undefined), [session, social])
  const waiting = (inbox.data?.requests.length ?? 0) + (inbox.data?.chats.filter((t) => t.unread).length ?? 0)
  useEffect(() => {
    if (!inbox.data || !people.data) return
    const was = known.current, { requests, chats } = inbox.data, met = people.data.people
    if (was) {
      const news = [
        ...requests.filter((t) => !was.asked.has(t.id)).map((t) => `${who(t.with)} sent you a message request.`),
        ...chats.filter((t) => t.unread > (was.unread.get(t.id) ?? 0)).map((t) => `New message from ${who(t.with)}.`),
        ...met.filter((p) => p.theyShared && !was.shared.has(p.id)).map((p) => `${who(p)} shared their card with you.`),
      ]
      if (news.length) setSaid(news.join(' '))
    }
    known.current = { asked: new Set(requests.map((t) => t.id)), unread: new Map(chats.map((t) => [t.id, t.unread])), shared: new Set(met.filter((p) => p.theyShared).map((p) => p.id)) }
  }, [inbox.data, people.data])
  useEffect(() => {
    if (!said) return
    const t = setTimeout(() => setSaid(''), 5000)
    return () => clearTimeout(t)
  }, [said])
  const first = useRef(true)
  useEffect(() => {
    // Move focus to the new screen's heading, but not on first paint (Stage has two Apps).
    if (!first.current) main.current?.querySelector<HTMLElement>('h1')?.focus()
    first.current = false
  }, [route])

  if (!token) return <Onboarding session={session} onToken={setToken} />
  if (!me) return (
    <main className="screen" aria-busy={!problem}>
      {problem ? <><Problem error={problem} retry={() => setTries(tries + 1)} />{!persona && <button type="button" className="btn" onClick={() => setToken(null)}>Sign in as someone else</button>}</> : <p className="muted">Getting your badge…</p>}
    </main>
  )

  const go = (r: string) => (inMemory ? setRoute(r) : (location.hash = `/${r}`))
  const mine = tabs[me.kind], [page, id] = (mine.some(([t]) => route.startsWith(t)) || route === 'print' ? route : mine[0][0]).split('/')
  const screen = {
    scan: <ScanScreen />, people: id ? <PersonScreen key={id} id={id} /> : <PeopleScreen />, inbox: id ? <ChatScreen key={id} id={id} /> : <InboxScreen />, discover: <DiscoverScreen />,
    me: <MeScreen />, print: <PrintScreen me={me} />, leads: <LeadsScreen />, booth: <BoothScreen />, pulse: <PulseScreen />,
  }[page]
  return (
    <AppCtx value={{ session, me, setMe, route, go, say: setSaid, signOut: () => setToken(null), stage: !!inMemory, inbox }}>
      <div className="app">
        <header className="bar"><span className="wordmark">Confer</span><span className="whoami">{me.displayName} · badge {me.tagId}</span></header>
        <main ref={main} className="screen" key={page + (id ?? '')}>{screen}</main>
        <p className={`toast ${said ? 'on' : ''}`} aria-live="polite" role="status">{said}</p>
        <nav aria-label="Sections">
          {mine.map(([t, label, icon]) => (
            <a key={t} href={`#/${t}`} aria-current={page === t ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(t) }}>
              <Icon name={icon} />{label}{t === 'inbox' && waiting > 0 && <b className="dot" key={waiting}>{waiting}<span className="sr"> waiting</span></b>}
            </a>
          ))}
        </nav>
      </div>
    </AppCtx>
  )
}

function Phone({ slot, initial, start }: { slot: string; initial: Persona; start?: string }) {
  const [persona, setPersona] = useState(initial)
  return (
    <section className="phone-wrap" aria-label={`${personas[persona][0]}'s phone`}>
      <fieldset className="switch"><legend className="sr">Who holds this phone</legend>
        {(Object.keys(personas) as Persona[]).map((p) => <button type="button" key={p} aria-pressed={p === persona} onClick={() => setPersona(p)}>{personas[p][0]}</button>)}
      </fieldset>
      <div className="phone"><App key={persona} slot={slot} persona={persona} start={persona === initial ? start : undefined} inMemory /></div>
    </section>
  )
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/** The projector view: two live phones and the event's numbers, so the room sees cause and effect together. */
export function Stage() {
  const { data } = usePulse(useMemo(() => ({ slot: 'stage', token: personas.organizer[1] }), []))
  const t = data?.totals, p95 = data?.health.p95Ms
  const numbers: [string, number, ((n: number) => string)?][] = t ? [['Meetings', t.meetings], ['Shared', t.shares], ['Unshared', t.unshares], ['Requests', t.requests], ['Share rate', t.shareRate, pct]] : []
  return (
    <div className="stage">
      <Scenery />
      <header>
        <p className="wordmark">Confer</p>
        <p className="tagline">The front of your badge says hi. <b>Only you say yes.</b></p>
        <ol className="story">
          <li><b>Scan</b> A silhouette and what you have in common.</li>
          <li><b>Connect</b> Say why. They decide.</li>
          <li><b>Share</b> Your card moves only when you tap. Unshare removes it, with a receipt.</li>
        </ol>
        <section className="strip" aria-label={isMock ? 'Event numbers, sample data' : 'Event numbers, live'}>
          <p className="live">{isMock ? 'Sample data' : 'Live'}</p>
          {numbers.map(([label, value, format]) => <p className="stat" key={label}><b><Count value={value} format={format} /></b><span>{label}</span></p>)}
          {t && <p className="stat"><b>{p95 === undefined ? '–' : <Count value={p95} />}</b><span>p95 ms</span></p>}
          {!t && <p className="warming">Numbers are warming up…</p>}
        </section>
      </header>
      <Phone slot="left" initial={(flag('left') as Persona) ?? 'amara'} start={flag('l') ?? 'scan'} />
      <Phone slot="right" initial={(flag('right') as Persona) ?? 'diego'} start={flag('r') ?? 'inbox'} />
    </div>
  )
}
