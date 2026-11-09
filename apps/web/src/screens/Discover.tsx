import { type FormEvent, useState } from 'react'
import { call, flag } from '../api'
import { threadState } from '../links'
import { ApproachChip, nameOf, Portrait, Problem, time, useApp, usePoll, Why } from '../ui'
import { Connect } from './Connect'

export function DiscoverScreen() {
  const { session, go } = useApp()
  const [text, setText] = useState(flag('q') ?? '')
  const [q, setQ] = useState(text)
  const [asking, setAsking] = useState<string>()
  const { data, error, reload } = usePoll(() => call(session, 'GET /api/discover', { query: { q } }), [session.token, q])
  const star = (id: string, on: boolean) => call(session, on ? 'PUT /api/booths/:id/star' : 'DELETE /api/booths/:id/star', { params: { id } }).then(reload, reload)
  const submit = (e: FormEvent) => { e.preventDefault(); setQ(text) }
  return (
    <>
      <h1 tabIndex={-1}>Discover</h1>
      <search><form onSubmit={submit} className="row search">
        <label>What are you stuck on?<input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tracing across 200 services" /></label>
        <button type="submit" className="btn primary">Search</button>
      </form></search>
      <Problem error={error} />
      {data && <p className="muted" aria-live="polite">{q ? `Results for “${data.query}”` : 'Picked from your topics'}</p>}
      <h2>Talks</h2>
      <ul className="results">
        {data?.talks.map(({ talk, fit, why }) => (
          <li key={talk.id} className="paper">
            <b>{talk.title}</b><span className="fit">{fit}% fit</span>
            <small>{talk.speaker} · {talk.room} · {time(talk.startsAt)}</small>
            <p>{why.map((w) => <span key={w} className="chip">{w}</span>)}</p>
          </li>
        ))}
      </ul>
      <h2>Booths</h2>
      <ul className="results">
        {data?.booths.map(({ card, fit, why }) => (
          <li key={card.id} className="paper">
            <b>{card.name}</b><span className="fit">{fit}% fit</span>
            <small>{card.about}</small>
            <p>{why.map((w) => <span key={w} className="chip">{w}</span>)}</p>
            <button type="button" className="btn star" aria-pressed={!!card.starred} onClick={() => star(card.id, !card.starred)}><span aria-hidden>{card.starred ? '★' : '☆'}</span> {card.starred ? 'Starred' : 'Star'}</button>
          </li>
        ))}
      </ul>
      <h2>People</h2>
      <ul className="results">
        {data?.people.map(({ card, common }) => (
          <li key={card.id} className="paper person-hit">
            <Portrait card={card} size="sm" />
            <div>
              <b>{nameOf(card)}</b> <ApproachChip approach={card.approach} />
              <Why common={common} />
              {asking === card.id ? <Connect card={card} onSent={() => { setAsking(undefined); reload() }} />
                : card.thread ? <button type="button" className="btn" onClick={() => go(`inbox/${card.id}`)}>{threadState(card)}</button>
                : <button type="button" className="btn" onClick={() => setAsking(card.id)}>Connect</button>}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
