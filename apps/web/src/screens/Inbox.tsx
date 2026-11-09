import { useEffect, useRef } from 'react'
import { call } from '../api'
import { silhouetteUrl } from '../Silhouette'
import { ago, fieldNames, Screen, Tag, useApp, useLive } from '../ui'

const verbs = { shared: 'You shared', opened: 'Opened by', unshared: 'You unshared from' }
const done = { shared: 'You shared your card', ignored: 'Ignored', pending: '' }

export function Inbox() {
  const { session, say } = useApp()
  const { data, error, reload } = useLive(session, 'GET /api/inbox')
  const count = useRef<number>(undefined)
  const pending = data?.requests.filter((r) => r.status === 'pending') ?? []
  useEffect(() => {
    if (!data) return
    if (count.current !== undefined && pending.length > count.current) say(`New request from ${pending[0].booth.name}.`)
    count.current = pending.length
  }, [data, pending, say])
  const answer = async (id: string, action: 'share' | 'ignore' | 'mute') => {
    const { request } = await call(session, 'POST /api/inbox/:id', { params: { id }, body: { action } })
    say(action === 'share' ? `Shared your card with ${request.booth.name}.` : action === 'mute' ? `Muted ${request.booth.name}.` : 'Ignored.')
    reload()
  }
  return (
    <Screen title="Inbox" tone="red" lede={<><b>{pending.length}</b> {pending.length === 1 ? 'booth is' : 'booths are'} asking. You decide.</>}>
      {error && <p role="alert" className="error">{error}</p>}
      <ul className="requests">
        {data?.requests.map((r) => (
          <li key={r.id} className={`request ${r.status}`}>
            <header><img src={silhouetteUrl(r.booth.id)} alt="" /><div><h2>{r.booth.name}</h2><small>{r.source === 'scan' ? 'Scanned your badge' : 'Matched your interests'} · {ago(r.createdAt)}</small></div></header>
            <blockquote>{r.note}</blockquote>
            {r.attachment && <p className="attach">Yours either way: <a href={r.attachment.url} target="_blank" rel="noreferrer">{r.attachment.label}</a></p>}
            {r.why.length > 0 && <p className="tags"><small>Why you match</small>{r.why.map((w) => <Tag key={w.mine + w.theirs} label={w.mine} />)}</p>}
            {r.status === 'pending' ? (
              <div className="row">
                <button onClick={() => answer(r.id, 'share')}>Share</button>
                <button className="ghost" onClick={() => answer(r.id, 'ignore')}>Ignore</button>
                <button className="ghost" onClick={() => answer(r.id, 'mute')}>Mute</button>
              </div>
            ) : <p className="stamp-line">{done[r.status]}</p>}
          </li>
        ))}
      </ul>
      {data && !data.requests.length && <p className="muted">No requests. Booths can only ask; they never get your card unless you say yes.</p>}
      <h2 className="rule">Receipts</h2>
      <ol className="receipts">
        {data?.receipts.map((r) => (
          <li key={r.id} className={r.type}>
            <b>{verbs[r.type]} {r.who?.name ?? 'someone'}</b>
            <span>{r.fields.map((f) => fieldNames[f]).join(', ')}</span>
            <small>{ago(r.at)} · trace <code>{r.traceId?.slice(0, 8) ?? 'none'}</code></small>
          </li>
        ))}
      </ol>
    </Screen>
  )
}
