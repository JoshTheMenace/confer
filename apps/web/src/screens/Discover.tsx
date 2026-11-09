import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { call, type Discover as Results } from '../api'
import { silhouetteUrl } from '../Silhouette'
import { param, Screen, Tag, useApp } from '../ui'

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function Discover() {
  const { session, me, go, say } = useApp()
  const [q, setQ] = useState(param('q') ?? me.stuckOn ?? '')
  const [res, setRes] = useState<Results>()
  const [error, setError] = useState('')
  const search = useCallback((text: string) => call(session, 'GET /api/discover', { query: { q: text } }).then((r) => {
    setRes(r)
    setError('')
    say(`${r.talks.length} talks, ${r.booths.length} booths, ${r.people.length} people.`)
  }, (e: Error) => setError(e.message)), [session, say])
  useEffect(() => { search(q) }, [search]) // eslint-disable-line react-hooks/exhaustive-deps -- first load only; later searches are submitted
  const star = async (id: string, on: boolean) => {
    await call(session, on ? 'PUT /api/booths/:id/star' : 'DELETE /api/booths/:id/star', { params: { id } })
    search(q)
  }
  return (
    <Screen title="Discover" tone="green">
      <form className="search" role="search" onSubmit={(e: FormEvent) => { e.preventDefault(); search(q) }}>
        <label>What are you stuck on?<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tracing across 200 services" /></label>
        <button>Find</button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
      {res && <>
        <h2 className="rule">Talks <small>{res.talks.length}</small></h2>
        <ul className="results">
          {res.talks.map(({ talk, fit, why }) => (
            <li key={talk.id}><span className="fit">{fit}</span><div><b>{talk.title}</b><small>{talk.speaker} · {talk.room} · {time(talk.startsAt)}</small><p className="tags">{why.map((w) => <Tag key={w} label={w} />)}</p></div></li>
          ))}
        </ul>
        <h2 className="rule">Booths <small>{res.booths.length}</small></h2>
        <ul className="results">
          {res.booths.map(({ card, fit, why }) => (
            <li key={card.id}><span className="fit">{fit}</span><div><b>{card.name}</b><small>{card.about}</small><p className="tags">{why.map((w) => <Tag key={w} label={w} />)}</p></div>
              <button className="star ghost" aria-pressed={!!card.starred} onClick={() => star(card.id, !card.starred)}>{card.starred ? '★ Starred' : '☆ Star'}</button></li>
          ))}
        </ul>
        <h2 className="rule">People <small>{res.people.length}</small></h2>
        <ul className="results">
          {res.people.map(({ card, common }) => (
            <li key={card.id}><img src={silhouetteUrl(card.id)} alt="" /><div><b>{card.name}</b><small>{card.met ? 'You met' : 'Not met yet. Find their badge to connect.'}</small><p className="tags">{common.slice(0, 3).map((c) => <Tag key={c.mine + c.theirs} label={c.theirs} />)}</p></div>
              {card.met && <button className="ghost" onClick={() => go(`people/${card.id}`)}>Open</button>}</li>
          ))}
        </ul>
      </>}
    </Screen>
  )
}
