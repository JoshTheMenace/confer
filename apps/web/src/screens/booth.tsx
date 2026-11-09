import { type CSSProperties, type FormEvent, useState } from 'react'
import type { Pulse, Visitor } from '../../../api/src/contract'
import { call, type Session } from '../api'
import { Count, listFields, Portrait, Problem, time, useApp, usePoll } from '../ui'

const pct = (n: number) => `${Math.round(n * 100)}%`
const Stat = ({ label, value, format }: { label: string; value: number; format?: (n: number) => string }) => (
  <div className="stat"><b><Count value={value} format={format} /></b><span>{label}</span></div>
)

function VisitorRow({ v, picked, onPick }: { v: Visitor; picked: boolean; onPick: (on: boolean) => void }) {
  return (
    <li className="paper visitor">
      <Portrait card={v.card} size="sm" />
      <div>
        <b>{v.card.name ?? 'Name not shared'}</b><span className="fit">{v.fit}% fit</span>
        <p>{v.card.interests?.slice(0, 4).map((t) => <span key={t} className="chip">{t}</span>)}</p>
        {v.card.stuckOn && <small>Stuck on: {v.card.stuckOn}</small>}
        {v.request ? <small className="status">Request {v.request.status === 'pending' ? 'waiting' : v.request.status}</small>
          : <label className="pickme"><input type="checkbox" checked={picked} onChange={(e) => onPick(e.target.checked)} /> Send a request</label>}
      </div>
    </li>
  )
}

export function LeadsScreen() {
  const { session, me, say } = useApp()
  const booth = usePoll(() => call(session, 'GET /api/booth'), [session.token])
  const prospects = usePoll(() => call(session, 'GET /api/booth/prospects'), [session.token])
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState(me.pitch ?? '')
  const everyone = [...(booth.data?.visitors ?? []), ...(prospects.data?.prospects ?? [])]
  const open = everyone.filter((v) => !v.request).map((v) => v.card.id)
  const send = (to: string[]) => call(session, 'POST /api/booth/requests', { body: { to, note, attachment: me.attachment } }).then((r) => {
    say(`Sent ${r.sent} ${r.sent === 1 ? 'request' : 'requests'}. ${r.autoShared} shared right away.`); setPicked([]); booth.reload(); prospects.reload()
  })
  const row = (v: Visitor) => <VisitorRow key={v.card.id} v={v} picked={picked.includes(v.card.id)} onPick={(on) => setPicked(on ? [...picked, v.card.id] : picked.filter((x) => x !== v.card.id))} />
  const s = booth.data?.stats
  return (
    <>
      <h1 tabIndex={-1}>Leads</h1>
      <Problem error={booth.error} />
      {s && <div className="stats"><Stat label="said yes" value={s.shared} /><Stat label="share rate" value={s.shareRate} format={pct} /><Stat label="got your content" value={s.contentDelivered} /><Stat label="scans" value={s.scans} /></div>}
      <h2>Leads who said yes</h2>
      <ul className="results">
        {booth.data?.leads.map((l) => (
          <li key={l.card.id} className="paper visitor">
            <Portrait card={l.card} size="sm" />
            <div>
              <b>{l.card.name}</b> <small>{l.card.theyShared?.role} · {time(l.sharedAt)}</small>
              <p>{l.card.theyShared && Object.values(l.card.theyShared.contact).join(' · ')}</p>
              {l.note && <blockquote>Won by: “{l.note}”</blockquote>}
            </div>
          </li>
        ))}
        {booth.data && !booth.data.leads.length && <li className="paper muted">Nobody yet. Leads appear only when a person chooses to share.</li>}
      </ul>
      <form className="paper composer" onSubmit={(e: FormEvent) => { e.preventDefault(); send(picked) }}>
        <h2>Send a request</h2>
        <label>Your note<textarea rows={3} required value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <p className="muted">Carries: {me.attachment?.label ?? 'no attachment'}. They get it whether or not they share.</p>
        <div className="row"><button className="btn primary" disabled={!picked.length}>Send to {picked.length} picked</button><button type="button" className="btn" disabled={!open.length} onClick={() => send(open)}>Send to all {open.length}</button></div>
      </form>
      <h2>Visitors, best fit first</h2>
      <ul className="results">{booth.data?.visitors.map(row)}</ul>
      <h2>People who match but never walked past</h2>
      <p className="muted">Anonymous. They opted in to hear from matching booths.</p>
      <ul className="results">{prospects.data?.prospects.map(row)}</ul>
      {s && (
        <section className="paper">
          <h2>Which pitch earns shares</h2>
          <table><thead><tr><th scope="col">Note</th><th scope="col">Sent</th><th scope="col">Shared</th><th scope="col">Rate</th></tr></thead>
            <tbody>{s.notes.map((n) => <tr key={n.note}><td>{n.note}</td><td>{n.sent}</td><td>{n.shared}</td><td>{pct(n.rate)}</td></tr>)}</tbody></table>
          <h2>Top interests at your booth</h2>
          <Bars terms={s.topInterests} />
        </section>
      )}
    </>
  )
}

const Bars = ({ terms }: { terms: { term: string; count: number }[] }) => (
  <ul className="bars">{terms.map((t) => <li key={t.term}><span>{t.term}</span><i style={{ '--w': t.count / Math.max(...terms.map((x) => x.count)) } as CSSProperties} /><b>{t.count}</b></li>)}</ul>
)

export function BoothScreen() {
  const { session, me, setMe, say, signOut } = useApp()
  const [topics, setTopics] = useState(me.interests.join(', '))
  const [pitch, setPitch] = useState(me.pitch ?? '')
  const [label, setLabel] = useState(me.attachment?.label ?? '')
  const [url, setUrl] = useState(me.attachment?.url ?? '')
  const [problem, setProblem] = useState<string>()
  const save = (e: FormEvent) => {
    e.preventDefault()
    call(session, 'PATCH /api/me', { body: { interests: topics.split(',').map((t) => t.trim()).filter(Boolean), pitch, attachment: url ? { url, label: label || url } : undefined } })
      .then((r) => { setMe(r.me); say('Booth saved.') }, (err: Error) => setProblem(err.message))
  }
  return (
    <>
      <h1 tabIndex={-1}>{me.displayName} booth</h1>
      <form className="paper" onSubmit={save}>
        <label>Topics your products cover <small>comma separated</small><input value={topics} onChange={(e) => setTopics(e.target.value)} /></label>
        <label>Default note on a request<textarea rows={3} value={pitch} onChange={(e) => setPitch(e.target.value)} /></label>
        <label>Attachment name<input value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label>Attachment link<input type="url" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        <Problem error={problem} />
        <div className="row end"><button className="btn primary">Save booth</button></div>
      </form>
      <p className="note">You see topics and fit, never a name, until a person shares: {listFields(me.shareFields)} is what you hand over in return.</p>
      <button className="btn" onClick={signOut}>Sign out</button>
    </>
  )
}

export function Chart({ series }: { series: Pulse['series'] }) {
  const max = Math.max(1, ...series.map((p) => p.scans))
  return (
    <figure className="chart">
      <div role="img" aria-label={`Scans per minute, last 30 minutes. Latest ${series.at(-1)?.scans ?? 0}.`}>
        {series.map((p) => <span key={p.t}><i style={{ '--h': p.scans / max } as CSSProperties} /><i className="shares" style={{ '--h': p.shares / max } as CSSProperties} /></span>)}
      </div>
      <figcaption><span className="key scans" /> scans <span className="key shares" /> shares, per minute</figcaption>
    </figure>
  )
}

export const usePulse = (session: Session) => usePoll(() => call(session, 'GET /api/pulse'), [session.token])

export function PulseTotals({ totals }: { totals: Pulse['totals'] }) {
  return <div className="stats"><Stat label="meetings" value={totals.meetings} /><Stat label="shares" value={totals.shares} /><Stat label="unshares" value={totals.unshares} /><Stat label="booth requests" value={totals.requests} /><Stat label="share rate" value={totals.shareRate} format={pct} /></div>
}

export function PulseScreen() {
  const { session, signOut } = useApp()
  const { data, error } = usePulse(session)
  const h = data?.health
  return (
    <>
      <h1 tabIndex={-1}>Event Pulse</h1>
      <Problem error={error} />
      {data && (
        <>
          <p className="muted">{data.totals.attendees} attendees · {data.totals.booths} booths · updated {time(data.at)}</p>
          <PulseTotals totals={data.totals} />
          <section className="paper"><h2>Last 30 minutes</h2><Chart series={data.series} /></section>
          <section className="paper"><h2>Top interests</h2><Bars terms={data.topInterests} /></section>
          {data.booths && (
            <section className="paper"><h2>Booths</h2>
              <table><thead><tr><th scope="col">Booth</th><th scope="col">Scans</th><th scope="col">Share rate</th><th scope="col">Mutes</th></tr></thead>
                <tbody>{data.booths.map((b) => <tr key={b.id}><th scope="row">{b.name}</th><td>{b.scans}</td><td>{pct(b.shareRate)}</td><td>{b.mutes}</td></tr>)}</tbody></table>
            </section>
          )}
          <section className="paper health">
            <h2>Health <small>{h?.source === 'dash0' ? 'read live from Dash0' : 'Dash0 is not reachable right now'}</small></h2>
            {h?.source === 'dash0' && (
              <>
                <div className="stats"><Stat label="p95 ms" value={h.p95Ms ?? 0} /><Stat label="errors" value={h.errorRate ?? 0} format={(n) => `${(n * 100).toFixed(1)}%`} /><Stat label="requests/min" value={h.requestsPerMin ?? 0} /></div>
                {h.slo && <p className={`slo ${h.slo.ok ? 'ok' : 'bad'}`}><span aria-hidden>{h.slo.ok ? '✓' : '!'}</span> {h.slo.name}: {(h.slo.current * 100).toFixed(1)}% (target {(h.slo.target * 100).toFixed(0)}%), {h.slo.ok ? 'within target' : 'below target'}</p>}
                {h.dashboardUrl && <a className="btn" href={h.dashboardUrl} target="_blank" rel="noreferrer">Open the Dash0 dashboard</a>}
              </>
            )}
          </section>
        </>
      )}
      <button className="btn" onClick={signOut}>Sign out</button>
    </>
  )
}
