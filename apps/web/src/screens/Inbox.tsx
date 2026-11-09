import { useEffect, useRef } from 'react'
import { type BoothRequest, type Receipt, call } from '../api'
import { useApp } from '../App'
import { Icon, type IconName, Loading, ago, fieldNames, listOf, nameOf, useLive } from '../ui'

const receiptCopy: Record<Receipt['type'], [IconName, (who: string, what: string) => string]> = {
  shared: ['check', (who, what) => `You shared ${what} with ${who}`],
  opened: ['eye', (who) => `${who} opened your card`],
  unshared: ['undo', (who, what) => `You unshared. ${who} no longer has ${what}`],
}
const done = { shared: 'You shared your card.', ignored: 'Ignored. They were not told.', pending: '' }

export function Inbox() {
  const { session, say } = useApp()
  const [data, reload, error] = useLive(session, 'GET /api/inbox')
  const seen = useRef<Set<string>>(undefined)
  useEffect(() => {
    if (!data) return
    const fresh = data.requests.filter((r) => seen.current && !seen.current.has(r.id))
    if (fresh.length) say(`New request from ${listOf(fresh.map((r) => nameOf(r.booth)))}.`)
    seen.current = new Set(data.requests.map((r) => r.id))
  }, [data, say])
  if (!data) return <Loading error={error} />
  const answer = (r: BoothRequest, action: 'share' | 'ignore' | 'mute') =>
    call(session, 'POST /api/inbox/:id', { params: { id: r.id }, body: { action } }).then(() => {
      say(action === 'share' ? `Shared your card with ${nameOf(r.booth)}.` : action === 'mute' ? `Muted ${nameOf(r.booth)}. They can’t send you more.` : 'Ignored.')
      void reload()
    }, (e: Error) => say(e.message))
  return (
    <>
      <h1>Inbox</h1>
      <p className="dim">Booths can ask. Only you say yes.</p>
      {data.requests.length === 0 && <p className="card dim">No requests. Booths only see your interests, never your name, until you share.</p>}
      <ul className="stack">
        {data.requests.map((r) => (
          <li key={r.id} className="card request" data-status={r.status}>
            <h2>{nameOf(r.booth)}</h2>
            <p className="dim">{r.source === 'scan' ? 'Scanned your badge' : 'Matched your interests'} · {ago(r.createdAt)}</p>
            <p className="quote">“{r.note}”</p>
            {r.attachment && <a className="attach" href={r.attachment.url}><Icon name="doc" /><span>{r.attachment.label}<small>Yours either way</small></span></a>}
            {r.why.length > 0 && <p className="dim">Why you: {listOf(r.why.map((w) => (w.kind === 'same' ? w.mine : `${w.mine} (related to ${w.theirs})`)))}</p>}
            {r.status === 'pending' ? (
              <div className="row">
                <button onClick={() => answer(r, 'share')}>Share my card</button>
                <button className="ghost" onClick={() => answer(r, 'ignore')}>Ignore</button>
                <button className="ghost" onClick={() => answer(r, 'mute')}>Mute booth</button>
              </div>
            ) : <p className="note"><Icon name={r.status === 'shared' ? 'check' : 'moon'} />{done[r.status]}</p>}
          </li>
        ))}
      </ul>
      <h2>Receipts</h2>
      <p className="dim">Every share, open and unshare leaves a trace you can point to.</p>
      <ol className="timeline">
        {data.receipts.map((r) => {
          const [icon, text] = receiptCopy[r.type]
          return (
            <li key={r.id} data-type={r.type}>
              <Icon name={icon} />
              <p>{text(r.who ? nameOf(r.who) : 'Someone', listOf(r.fields.map((f) => fieldNames[f])))}<small className="mono">{ago(r.at)}{r.traceId && ` · trace ${r.traceId.slice(0, 8)}`}</small></p>
            </li>
          )
        })}
      </ol>
    </>
  )
}
