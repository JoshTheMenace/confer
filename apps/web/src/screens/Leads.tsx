import { type FormEvent, type ReactNode, useState } from 'react'
import type { Visitor } from '../../../api/src/contract'
import { call, exportCsv } from '../api'
import { Bars, ContactCard, Loading, pct, Portrait, Problem, Stat, time, useAct, useApp, usePoll } from '../ui'

function VisitorRow({ v, picked, onPick }: { v: Visitor; picked: boolean; onPick: (on: boolean) => void }) {
  return (
    <li className="paper visitor slim">
      <Portrait card={v.card} size="sm" />
      <div>
        <p><b>{v.card.name ?? 'Name not shared'}</b><span className="fit">{v.fit}% fit</span></p>
        <p>{v.card.interests?.slice(0, 3).map((t) => <span key={t} className="chip">{t}</span>)}</p>
        {v.card.stuckOn && <small>Stuck on: {v.card.stuckOn}</small>}
        {v.request ? <small className="status">{v.card.theyShared ? 'Shared their card' : { request: 'Request waiting', open: 'Chat open', ignored: 'Ignored' }[v.request.status]}</small>
          : <label className="pickme"><input type="checkbox" checked={picked} onChange={(e) => onPick(e.target.checked)} /> Send a request</label>}
      </div>
    </li>
  )
}

/** At most five rows until asked for the rest, so the page stays short. */
function Capped({ items, row }: { items: Visitor[]; row: (v: Visitor) => ReactNode }) {
  const [all, setAll] = useState(false)
  return (
    <>
      <ul className="results">{(all ? items : items.slice(0, 5)).map(row)}</ul>
      {!all && items.length > 5 && <button type="button" className="btn" onClick={() => setAll(true)}>Show all {items.length}</button>}
    </>
  )
}

// What Kubernetes answered for a lead's grant: icon + words, never colour alone.
const verdicts = { allowed: ['✓', 'allowed'], denied: ['✕', 'denied'], unavailable: ['?', 'not checked'] } as const

export function LeadsScreen() {
  const { session, me, say, go } = useApp()
  const booth = usePoll(() => call(session, 'GET /api/booth'), [session.token])
  const prospects = usePoll(() => call(session, 'GET /api/booth/prospects'), [session.token])
  const grants = usePoll(() => call(session, 'GET /api/booth/grants'), [session.token], 0) // once, and again after any write
  const [picked, setPicked] = useState<string[]>([])
  const [done, setDone] = useState<Awaited<ReturnType<typeof exportCsv>>>()
  const exp = useAct()
  const download = () => exp.run(() => exportCsv(session).then((r) => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([r.csv], { type: 'text/csv' })), download: r.name })
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    setDone(r)
  }))
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
      <Loading of={booth} />
      {s && <div className="stats"><Stat label="said yes" value={s.shared} /><Stat label="share rate" value={s.shareRate} format={pct} /><Stat label="got your content" value={s.contentDelivered} /><Stat label="scans" value={s.scans} /></div>}
      {booth.data && <>
      <h2>Leads who said yes</h2>
      <div className="export">
        <button type="button" className="btn primary" disabled={exp.busy} onClick={download}>{exp.busy ? 'Exporting…' : 'Export CSV'}</button>
        <p className="muted">Each yes is a Kubernetes RoleBinding. Unshare deletes it, and the export stops.</p>
        <p role="status">{done && `Exported ${done.exported} ${done.exported === 1 ? 'lead' : 'leads'}. ${done.gate === 'kubernetes' ? `Kubernetes allowed ${done.exported}, denied ${done.denied}.` : 'Kubernetes was not reachable; the share records alone decided.'}`}</p>
        <Problem error={exp.error} retry={exp.retry} />
      </div>
      <ul className="results">
        {booth.data.leads.map((l) => { const g = grants.data?.grants.find((x) => x.attendeeId === l.card.id); return (
          <li key={l.card.id} className="paper visitor">
            <Portrait card={l.card} size="sm" />
            <div>
              <b>{l.card.name ?? 'Name not shared'}</b> <small>{l.card.theyShared?.role} · {time(l.sharedAt)}</small>
              {l.card.theyShared && <ContactCard they={l.card.theyShared} />}
              {g && <p className={`k8s ${g.kubernetes}`}><b><span aria-hidden>{verdicts[g.kubernetes][0]}</span> Kubernetes: {verdicts[g.kubernetes][1]}</b><code>{g.namespace}/{g.binding} · {g.verbs.join(' ')}</code></p>}
              {l.note && <blockquote>Won by: “{l.note}”</blockquote>}
              {l.card.thread && <button type="button" className="btn" onClick={() => go(`inbox/${l.card.id}`)}>Chat</button>}
            </div>
          </li>
        ) })}
        {!booth.data.leads.length && <li className="paper muted">Nobody yet. Leads appear only when a person chooses to share.</li>}
      </ul>
      <form className="paper composer" onSubmit={(e: FormEvent) => { e.preventDefault(); send(picked) }}>
        <h2>Send a message request</h2>
        <label>Your note <small>the first message they read</small><textarea rows={3} required value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <p className="muted">Carries: {me.attachment?.label ?? 'no attachment'}. They get it whether or not they share.</p>
        <Problem error={act.error} retry={act.retry} />
        <div className="row"><button type="submit" className="btn primary" disabled={act.busy || !picked.length}>{act.busy ? 'Sending…' : `Send to ${picked.length} picked`}</button><button type="button" className="btn" disabled={act.busy || !open.length} onClick={() => send(open)}>Send to all {open.length}</button></div>
      </form>
      <h2>Visitors, best fit first</h2>
      <Capped items={booth.data.visitors} row={row} />
      <h2>People who match but never walked past</h2>
      <p className="muted">Anonymous. They opted in to hear from matching booths.</p>
      <Loading of={prospects} />
      <Capped items={prospects.data?.prospects ?? []} row={row} />
      {s && (
        <section className="paper">
          <h2>Which pitch earns shares</h2>
          <table><thead><tr><th scope="col">Note</th><th scope="col">Sent</th><th scope="col">Shared</th><th scope="col">Rate</th></tr></thead>
            <tbody>{s.notes.map((n) => <tr key={n.note}><td>{n.note}</td><td>{n.sent}</td><td>{n.shared}</td><td>{pct(n.rate)}</td></tr>)}</tbody></table>
          <h2>Top interests at your booth</h2>
          <Bars terms={s.topInterests} />
        </section>
      )}
      </>}
    </>
  )
}
