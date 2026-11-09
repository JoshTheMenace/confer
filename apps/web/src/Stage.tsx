import { useMemo, useState } from 'react'
import { App, personas } from './App'
import { Count, param, useLive } from './ui'

/** One live phone with a persona switcher. `?l=amara:people/p501` picks who and where. */
function Phone({ side, initial }: { side: string; initial: string }) {
  const [who, route] = (param(side[0]) ?? initial).split(':')
  const [key, setKey] = useState(who)
  const persona = personas.find((p) => p.key === key) ?? personas[0]
  return (
    <section className="phone" aria-label={`${side} phone: ${persona.label}`}>
      <div className="switch" role="group" aria-label={`${side} phone persona`}>
        {personas.map((p) => <button key={p.key} aria-pressed={p.key === key} onClick={() => setKey(p.key)}>{p.label}</button>)}
      </div>
      <div className="frame"><App key={key} slot={`stage-${side}`} token={persona.token} route={key === who ? route : ''} memory /></div>
    </section>
  )
}

/** The presenter view: two phones and the event's live numbers, so the room sees cause and effect at once. */
export function Stage() {
  const organizer = useMemo(() => ({ slot: 'stage-pulse', token: 'demo-590' }), [])
  const { data } = useLive(organizer, 'GET /api/pulse')
  const t = data?.totals
  return (
    <div className="stage">
      <header>
        <p className="wordmark">Confer</p>
        <p className="tagline">The front of your badge says hi. <b>Only you say yes.</b></p>
        <ol className="how">
          <li><b>Scan</b> a badge. You get a silhouette and what you have in common.</li>
          <li><b>Share</b> hands over your card and photo. Only when you tap.</li>
          <li><b>Unshare</b> takes it back, with a receipt.</li>
        </ol>
      </header>
      <Phone side="left" initial="amara" />
      <Phone side="right" initial="diego" />
      <footer aria-label="Event pulse, live">
        <span className="live">Live</span>
        {t && [['Met', t.meetings], ['Shared', t.shares], ['Unshared', t.unshares], ['Booth requests', t.requests], ['Share rate', `${Math.round(t.shareRate * 100)}%`], ['p95', `${data.health.p95Ms ?? '–'} ms`]].map(([label, n]) => (
          <p key={label}><Count n={n} /><small>{label}</small></p>
        ))}
      </footer>
    </div>
  )
}
