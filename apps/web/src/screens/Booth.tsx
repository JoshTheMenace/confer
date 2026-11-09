import { useState, type FormEvent } from 'react'
import { call, type Visitor } from '../api'
import { silhouetteUrl } from '../Silhouette'
import { ago, ContactCard, Count, Screen, Tag, useApp, useLive } from '../ui'

const pct = (n: number) => `${Math.round(n * 100)}%`

function VisitorRow({ v, onSend }: { v: Visitor; onSend: (ids: string[]) => void }) {
  return (
    <li>
      <span className="fit">{v.fit}</span>
      <div>
        <b>{v.card.name ?? 'Attendee'}</b>
        <small>{v.source === 'scan' ? `Scanned ${v.scannedAt ? ago(v.scannedAt) : ''}` : 'Matches your topics'}{v.card.stuckOn && ` · Stuck on: ${v.card.stuckOn}`}</small>
        <p className="tags">{v.card.common.map((c) => <Tag key={c.mine + c.theirs} label={c.theirs} />)}</p>
      </div>
      {v.request ? <span className="stamp-line">{v.request.status === 'pending' ? 'Asked' : v.request.status}</span> : <button className="ghost" onClick={() => onSend([v.card.id])}>Send</button>}
    </li>
  )
}

export function Leads() {
  const { session, me, say } = useApp()
  const { data, error, reload } = useLive(session, 'GET /api/booth')
  const prospects = useLive(session, 'GET /api/booth/prospects')
  const [note, setNote] = useState(me.pitch ?? '')
  const send = async (to: string[]) => {
    const { sent, autoShared } = await call(session, 'POST /api/booth/requests', { body: { to, note, attachment: me.attachment } })
    say(`Sent ${sent} requests. ${autoShared} shared right away.`)
    reload()
    prospects.reload()
  }
  const s = data?.stats, open = [...(data?.visitors ?? []), ...(prospects.data?.prospects ?? [])].filter((v) => !v.request).map((v) => v.card.id)
  return (
    <Screen title="Leads" tone="green" lede="Only people who said yes.">
      {error && <p role="alert" className="error">{error}</p>}
      {s && (
        <dl className="stats">
          <div className="wide"><dt>Share rate</dt><dd><Count n={pct(s.shareRate)} /></dd></div>
          <div><dt>Scans</dt><dd><Count n={s.scans} /></dd></div>
          <div><dt>Requests</dt><dd><Count n={s.requests} /></dd></div>
          <div><dt>Content delivered</dt><dd><Count n={s.contentDelivered} /></dd></div>
        </dl>
      )}
      <h2 className="rule">Said yes <small>{data?.leads.length}</small></h2>
      <ul className="results">
        {data?.leads.map((l) => (
          <li key={l.card.id} className="lead">
            <img src={l.card.theyShared?.photo ?? silhouetteUrl(l.card.id)} alt="" />
            <div>
              <b>{l.card.name}</b><small>{l.via === 'auto' ? 'Auto-shared' : l.via === 'request' ? 'Answered your request' : 'Shared at the booth'} · {ago(l.sharedAt)}</small>
              {l.note && <blockquote>{l.note}</blockquote>}
              {l.card.theyShared && <ContactCard contact={l.card.theyShared.contact} role={l.card.theyShared.role} />}
            </div>
          </li>
        ))}
      </ul>
      <h2 className="rule">Ask for a share</h2>
      <form className="composer" onSubmit={(e: FormEvent) => { e.preventDefault(); send(open) }}>
        <label>Your note<textarea rows={2} required value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {me.attachment && <p className="attach">Goes with it, whether or not they share: <b>{me.attachment.label}</b></p>}
        <button disabled={!open.length}>Send to all {open.length}</button>
      </form>
      <h2 className="rule">Visitors by fit</h2>
      <ul className="results">{data?.visitors.map((v) => <VisitorRow key={v.card.id} v={v} onSend={send} />)}</ul>
      <h2 className="rule">Prospects who never walked past</h2>
      <ul className="results">{prospects.data?.prospects.map((v) => <VisitorRow key={v.card.id} v={v} onSend={send} />)}</ul>
      {s && <>
        <h2 className="rule">Which pitch earns shares</h2>
        <table>
          <thead><tr><th scope="col">Note</th><th scope="col">Sent</th><th scope="col">Shared</th></tr></thead>
          <tbody>{s.notes.map((n) => <tr key={n.note}><th scope="row">{n.note}</th><td>{n.sent}</td><td>{pct(n.rate)}</td></tr>)}</tbody>
        </table>
        <h2 className="rule">Top interests at your booth</h2>
        <p className="tags">{s.topInterests.map((t) => <span key={t.term}><Tag label={t.term} /> {t.count}</span>)}</p>
      </>}
    </Screen>
  )
}

export function Booth() {
  const { session, me, setMe, say, signOut } = useApp()
  const [f, setF] = useState({ topics: me.interests.join(', '), pitch: me.pitch ?? '', label: me.attachment?.label ?? '', url: me.attachment?.url ?? '' })
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const interests = [...new Set(f.topics.split(',').map((t) => t.trim()).filter(Boolean))]
    setMe((await call(session, 'PATCH /api/me', { body: { interests, pitch: f.pitch, attachment: f.label && f.url ? { label: f.label, url: f.url } : undefined } })).me)
    say('Booth saved.')
  }
  return (
    <Screen title={me.displayName} tone="pink" lede={`Booth badge ${me.tagId}`}>
      <form className="composer" onSubmit={save}>
        <label>Topics, separated by commas<input value={f.topics} onChange={(e) => setF({ ...f, topics: e.target.value })} /></label>
        <label>Default note on a request<textarea rows={3} value={f.pitch} onChange={(e) => setF({ ...f, pitch: e.target.value })} /></label>
        <label>Attachment name<input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></label>
        <label>Attachment link<input type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></label>
        <button>Save booth</button>
      </form>
      <button className="ghost" onClick={signOut}>Sign out</button>
    </Screen>
  )
}
