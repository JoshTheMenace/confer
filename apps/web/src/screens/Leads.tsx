import { type FormEvent, useState } from 'react'
import type { Visitor } from '../../../api/src/contract'
import { call } from '../api'
import { Bars, ContactCard, pct, Portrait, Problem, Stat, time, useAct, useApp, usePoll } from '../ui'

function VisitorRow({ v, picked, onPick }: { v: Visitor; picked: boolean; onPick: (on: boolean) => void }) {
  return (
    <li className="paper visitor">
      <Portrait card={v.card} size="sm" />
      <div>
        <b>{v.card.name ?? 'Name not shared'}</b><span className="fit">{v.fit}% fit</span>
        <p>{v.card.interests?.slice(0, 4).map((t) => <span key={t} className="chip">{t}</span>)}</p>
        {v.card.stuckOn && <small>Stuck on: {v.card.stuckOn}</small>}
        {v.request ? <small className="status">{v.card.theyShared ? 'Shared their card' : { request: 'Request waiting', open: 'Chat open', ignored: 'Ignored' }[v.request.status]}</small>
          : <label className="pickme"><input type="checkbox" checked={picked} onChange={(e) => onPick(e.target.checked)} /> Send a request</label>}
      </div>
    </li>
  )
}

export function LeadsScreen() {
  const { session, me, say, go } = useApp()
  const booth = usePoll(() => call(session, 'GET /api/booth'), [session.token])
  const prospects = usePoll(() => call(session, 'GET /api/booth/prospects'), [session.token])
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState(me.pitch ?? '')
  const everyone = [...(booth.data?.visitors ?? []), ...(prospects.data?.prospects ?? [])]
  const open = everyone.filter((v) => !v.request).map((v) => v.card.id)
  const act = useAct()
  const send = (to: string[]) => act.run(() => call(session, 'POST /api/booth/requests', { body: { to, note, attachment: me.attachment } }).then((r) => {
    say(`Sent ${r.sent} ${r.sent === 1 ? 'request' : 'requests'}. ${r.autoShared} shared right away.`); setPicked([])
  }))
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
              <b>{l.card.name ?? 'Name not shared'}</b> <small>{l.card.theyShared?.role} · {time(l.sharedAt)}</small>
              {l.card.theyShared && <ContactCard they={l.card.theyShared} />}
              {l.note && <blockquote>Won by: “{l.note}”</blockquote>}
              {l.card.thread && <button type="button" className="btn" onClick={() => go(`inbox/${l.card.id}`)}>Chat</button>}
            </div>
          </li>
        ))}
        {booth.data && !booth.data.leads.length && <li className="paper muted">Nobody yet. Leads appear only when a person chooses to share.</li>}
      </ul>
      <form className="paper composer" onSubmit={(e: FormEvent) => { e.preventDefault(); send(picked) }}>
        <h2>Send a message request</h2>
        <label>Your note <small>the first message they read</small><textarea rows={3} required value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <p className="muted">Carries: {me.attachment?.label ?? 'no attachment'}. They get it whether or not they share.</p>
        <Problem error={act.error} retry={act.retry} />
        <div className="row"><button type="submit" className="btn primary" disabled={act.busy || !picked.length}>{act.busy ? 'Sending…' : `Send to ${picked.length} picked`}</button><button type="button" className="btn" disabled={act.busy || !open.length} onClick={() => send(open)}>Send to all {open.length}</button></div>
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
