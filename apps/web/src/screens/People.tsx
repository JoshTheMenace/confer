import { useState } from 'react'
import { call } from '../api'
import { threadState } from '../links'
import { Loading, Portrait, Problem, Stamp, useAct, useApp, who } from '../ui'

const filters = { all: 'All', shared: 'Shared with me', scanned: 'Scanned me' }

export function PeopleScreen() {
  const { session, say, go, people: { data, error } } = useApp()
  const [filter, setFilter] = useState<keyof typeof filters>('all')
  const [asking, setAsking] = useState(false)
  const act = useAct()
  const people = data?.people ?? [], shared = people.filter((p) => p.theyShared)
  const list = filter === 'all' ? people : filter === 'shared' ? shared : people.filter((p) => p.met && p.met.by !== 'me')
  const pending = people.filter((p) => !p.iShared)
  const shareAll = () => act.run(() => call(session, 'POST /api/people/share', { body: { ids: pending.map((p) => p.id) } }).then((r) => { say(`Shared your card with ${r.shared} people.`); setAsking(false) }))
  return (
    <>
      <h1 tabIndex={-1}>Recently met</h1>
      {data && <p className="progress"><b>{people.length}</b> met · <b>{shared.length}</b> shared with you</p>}
      <fieldset className="row filters"><legend className="sr">Filter people</legend>
        {(Object.keys(filters) as (keyof typeof filters)[]).map((f) => <button type="button" key={f} className="chip pick" aria-pressed={filter === f} onClick={() => setFilter(f)}>{filters[f]}</button>)}
      </fieldset>
      <Problem error={error} />
      <Loading of={{ data, error }} />
      {data && !list.length && <p className="paper muted">{filter === 'all' ? 'Nobody yet. Scan a badge to meet someone.' : 'Nobody here yet.'}</p>}
      <ul className="wall">
        {list.map((p) => (
          <li key={p.id}>
            <button type="button" className="mini" onClick={() => go(`people/${p.id}`)}>
              <span className="slot" aria-hidden />
              <Portrait card={p} size="sm" />
              <b>{who(p)}</b>
              <small>{p.theyShared ? 'Shared with you' : `${p.common.length} in common`}{p.met?.by === 'them' && ' · scanned you'}</small>
              <span className={`state ${p.thread ? 'on' : ''}`}>{threadState(p)}{!!p.thread?.unread && ` · ${p.thread.unread} new`}</span>
              {p.iShared && <Stamp>You shared</Stamp>}
            </button>
          </li>
        ))}
      </ul>
      {pending.length > 0 && (
        <section className="paper">
          <h2>Leaving soon?</h2>
          {asking ? (
            <>
              <p>This shares your card with {pending.length} people you met. You can still unshare one by one.</p>
              <Problem error={act.error} retry={act.retry} />
              <div className="row"><button type="button" className="btn primary" disabled={act.busy} onClick={shareAll}>{act.busy ? 'Sharing…' : `Yes, share with ${pending.length}`}</button><button type="button" className="btn" onClick={() => setAsking(false)}>Not now</button></div>
            </>
          ) : <button type="button" className="btn" onClick={() => setAsking(true)}>Share with everyone I met</button>}
        </section>
      )}
    </>
  )
}
