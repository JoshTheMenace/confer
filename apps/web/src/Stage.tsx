import { useState } from 'react'
import { type Persona, param, personas } from './api'
import { App } from './App'
import { Counter, pct, useLive } from './ui'

const organizer = { slot: 'stage-pulse', token: personas.organizer.token }

function Phone({ side, first, start }: { side: string; first: Persona; start: string }) {
  const [who, setWho] = useState(first)
  return (
    <section className="stage-phone" aria-label={`${side} phone, signed in as ${personas[who].label}`}>
      <div className="switch" role="group" aria-label={`${side} phone persona`}>
        {(Object.keys(personas) as Persona[]).map((k) => <button key={k} aria-pressed={who === k} onClick={() => setWho(k)}>{personas[k].label}</button>)}
      </div>
      <div className="phone"><App key={who} slot={`stage-${side}-${who}`} token={personas[who].token} start={who === first ? start : ''} framed /></div>
    </section>
  )
}

/** The presenter view: two live phones and the event pulse between them, so the room sees cause and effect at once. */
export function Stage() {
  const [pulse] = useLive(organizer, 'GET /api/pulse')
  const t = pulse?.totals
  return (
    <div className="stage">
      <Phone side="Left" first={(param('left-as') as Persona) ?? 'amara'} start={param('left') ?? 'scan'} />
      <section className="stage-mid">
        <h1 className="wordmark">Confer</h1>
        <p className="tagline">The front of your badge says hi. <em>Only you say yes.</em></p>
        {t && (
          <dl className="strip" aria-label="Event pulse, live">
            <div><dt>People met</dt><dd><Counter value={t.meetings} format={(n) => n.toLocaleString()} /></dd></div>
            <div><dt>Cards shared</dt><dd><Counter value={t.shares} format={(n) => n.toLocaleString()} /></dd></div>
            <div><dt>Taken back</dt><dd><Counter value={t.unshares} /></dd></div>
            <div><dt>Booth requests</dt><dd><Counter value={t.requests} /></dd></div>
            <div><dt>Share rate</dt><dd>{pct(t.shareRate)}</dd></div>
          </dl>
        )}
        <p className="dim live"><i />Live event pulse</p>
      </section>
      <Phone side="Right" first={(param('right-as') as Persona) ?? 'diego'} start={param('right') ?? 'people'} />
    </div>
  )
}
