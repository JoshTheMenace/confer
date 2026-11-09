import { type FormEvent, useEffect, useState } from 'react'
import { type Visitor, call } from '../api'
import { useApp } from '../App'
import { TagSvg } from '../scan'
import { Portrait, Silhouette } from '../Silhouette'
import { Counter, Icon, Loading, ago, listOf, nameOf, pct, useLive } from '../ui'

const via = { manual: 'Shared at the booth', auto: 'Auto-shared', request: 'Said yes to your note' }

export function Leads() {
  const { session, me, say } = useApp()
  const [data, reload, error] = useLive(session, 'GET /api/booth')
  const [prospects, setProspects] = useState<Visitor[]>([])
  const [note, setNote] = useState(me.pitch ?? '')
  const loadProspects = () => void call(session, 'GET /api/booth/prospects').then((r) => setProspects(r.prospects), () => {})
  useEffect(loadProspects, [])
  if (!data) return <Loading error={error} />
  const { leads, visitors, stats } = data
  const open = [...visitors, ...prospects].filter((v) => !v.request)
  const send = (to: string[]) => call(session, 'POST /api/booth/requests', { body: { to, note, attachment: me.attachment } }).then((r) => {
    say(`Sent ${r.sent} ${r.sent === 1 ? 'request' : 'requests'}${r.autoShared ? `, ${r.autoShared} shared right away` : ''}. They get the guide either way.`)
    void reload(); loadProspects()
  }, (e: Error) => say(e.message))
  const row = (v: Visitor) => (
    <li key={v.card.id} className="card visitor">
      <span className="mini"><Silhouette id={v.card.id} /></span>
      <div>
        <h3>{v.card.name ?? 'Name hidden'} <span className="fit">{v.fit}% fit</span></h3>
        <p className="dim">{listOf(v.card.interests ?? [])}</p>
        {v.card.stuckOn && <p className="quote">Stuck on: {v.card.stuckOn}</p>}
        {v.request ? <p className="note"><Icon name={v.request.status === 'ignored' ? 'moon' : 'check'} />Request {v.request.status === 'pending' ? 'sent, waiting' : v.request.status} · {ago(v.request.sentAt)}</p>
          : <button className="ghost" onClick={() => send([v.card.id])}>Send request</button>}
      </div>
    </li>
  )
  return (
    <>
      <h1>Leads</h1>
      <dl className="stats">
        <div><dt>Share rate</dt><dd><Counter value={Math.round(stats.shareRate * 100)} format={(n) => `${n}%`} /></dd></div>
        <div><dt>Said yes</dt><dd><Counter value={leads.length} /></dd></div>
        <div><dt>Got your guide</dt><dd><Counter value={stats.contentDelivered} /></dd></div>
        <div><dt>Scans</dt><dd><Counter value={stats.scans} /></dd></div>
      </dl>

      <h2>People who said yes</h2>
      <ul className="stack">
        {leads.map((l) => (
          <li key={l.card.id} className="card visitor lead">
            <span className="mini"><Portrait id={l.card.id} photo={l.card.theyShared?.photo} label={`Photo of ${nameOf(l.card)}`} /></span>
            <div>
              <h3>{nameOf(l.card)}</h3>
              <p className="dim">{[l.card.theyShared?.role, l.card.theyShared?.contact.email].filter(Boolean).join(' · ')}</p>
              <p className="note"><Icon name="check" />{via[l.via]} · {ago(l.sharedAt)}</p>
              {l.note && <p className="quote">Won by: “{l.note}”</p>}
            </div>
          </li>
        ))}
      </ul>

      <form className="card composer" onSubmit={(e: FormEvent) => { e.preventDefault(); void send(open.map((v) => v.card.id)) }}>
        <h2>Your request</h2>
        <label>Note<textarea rows={3} required value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {me.attachment && <p className="attach"><Icon name="doc" /><span>{me.attachment.label}<small>Delivered whether or not they share</small></span></p>}
        <button type="submit" disabled={!open.length}>Send to all {open.length} without a request</button>
      </form>

      <h2>Visitors, by fit</h2>
      <p className="dim">You see interests and fit. Names and contact arrive only when they share.</p>
      <ul className="stack">{visitors.map(row)}</ul>
      <h2>Prospects who never walked past</h2>
      <p className="dim">Anonymous attendees who allow matching booths to reach out.</p>
      <ul className="stack">{prospects.map(row)}</ul>

      <h2>Which pitch earns shares</h2>
      <ul className="stack">{stats.notes.map((n) => (
        <li key={n.note} className="card"><p className="quote">“{n.note}”</p><p><b>{pct(n.rate)}</b> shared ({n.shared} of {n.sent})</p><div className="meter" aria-hidden><i style={{ transform: `scaleX(${n.rate})` }} /></div></li>
      ))}</ul>
      <h2>Top interests at your booth</h2>
      <p className="chips">{stats.topInterests.map((t) => <span key={t.term} className="chip">{t.term}<small>{t.count}</small></span>)}</p>
    </>
  )
}

export function Booth() {
  const { session, me, setMe, say, signOut } = useApp()
  const [topics, setTopics] = useState(me.interests.join(', '))
  const [pitch, setPitch] = useState(me.pitch ?? '')
  const [label, setLabel] = useState(me.attachment?.label ?? '')
  const [url, setUrl] = useState(me.attachment?.url ?? '')
  const save = (e: FormEvent) => {
    e.preventDefault()
    call(session, 'PATCH /api/me', { body: { interests: topics.split(',').map((t) => t.trim()).filter(Boolean), pitch, attachment: label && url ? { label, url } : undefined } }).then((r) => { setMe(r.me); say('Booth saved.') }, (err: Error) => say(err.message))
  }
  return (
    <>
      <h1>{me.displayName}</h1>
      <form className="card" onSubmit={save}>
        <h2>Booth profile</h2>
        <label>Topics, separated by commas<input value={topics} onChange={(e) => setTopics(e.target.value)} /><small>Used to find attendees who match. They see these too.</small></label>
        <label>Default note<textarea rows={3} value={pitch} onChange={(e) => setPitch(e.target.value)} /></label>
        <label>Attachment name<input value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label>Attachment link<input type="url" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        <button type="submit">Save</button>
      </form>
      <figure className="badge"><TagSvg id={me.tagId} size={200} /><figcaption>Booth badge {me.tagId}</figcaption></figure>
      <button className="ghost wide" onClick={signOut}>Sign out</button>
    </>
  )
}
