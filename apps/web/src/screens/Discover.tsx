import { type FormEvent, useEffect, useState } from 'react'
import { type Discover as Results, call } from '../api'
import { useApp } from '../App'
import { Silhouette } from '../Silhouette'
import { Icon, Loading, listOf, nameOf } from '../ui'

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function Discover() {
  const { session, me, go, say, deep } = useApp()
  const [q, setQ] = useState(deep('q') ?? me.stuckOn ?? '')
  const [res, setRes] = useState<Results>()
  const search = (e?: FormEvent) => { e?.preventDefault(); call(session, 'GET /api/discover', { query: { q } }).then((r) => { setRes(r); if (e) say(`${r.talks.length} talks, ${r.booths.length} booths and ${r.people.length} people found.`) }, (err: Error) => say(err.message)) }
  useEffect(search, [])
  const star = (id: string, on: boolean) => call(session, on ? 'PUT /api/booths/:id/star' : 'DELETE /api/booths/:id/star', { params: { id } }).then(() => search(), (err: Error) => say(err.message))
  return (
    <>
      <h1>Discover</h1>
      <form onSubmit={search} className="row">
        <label>What are you stuck on?<input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button type="submit" aria-label="Search"><Icon name="search" /></button>
      </form>
      {!res ? <Loading /> : (
        <>
          <h2>Talks</h2>
          <ul className="stack">{res.talks.slice(0, 3).map(({ talk, fit, why }) => (
            <li key={talk.id} className="card result">
              <h3>{talk.title}</h3>
              <p className="dim">{talk.speaker} · {talk.room} · {time(talk.startsAt)}</p>
              <p className="why">{fit}% match · {listOf(why)}</p>
            </li>
          ))}</ul>
          <h2>Booths</h2>
          <ul className="stack">{res.booths.map(({ card, fit, why }) => (
            <li key={card.id} className="card result row">
              <div><h3>{nameOf(card)}</h3><p className="dim">{card.about}</p><p className="why">{fit}% match · {listOf(why)}</p></div>
              <button className="ghost star" aria-pressed={!!card.starred} aria-label={`Star ${nameOf(card)}`} onClick={() => star(card.id, !card.starred)}><Icon name="star" /></button>
            </li>
          ))}</ul>
          <h2>People</h2>
          <p className="dim">Silhouettes only. You see what you share in common, never their full list.</p>
          <ul className="stack">{res.people.map(({ card, common }) => (
            <li key={card.id} className="card result row">
              <span className="mini"><Silhouette id={card.id} /></span>
              <div><h3>{nameOf(card)}</h3><p className="why">{common.length} in common · {listOf(common.map((c) => c.mine))}</p></div>
              {card.met && <button className="ghost" onClick={() => go(`people/${card.id}`)}>Open</button>}
            </li>
          ))}</ul>
        </>
      )}
    </>
  )
}
