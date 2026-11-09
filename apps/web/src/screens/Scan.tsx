import { type CSSProperties, type FormEvent, useEffect, useState } from 'react'
import { type Card, call, isMock } from '../api'
import { useApp } from '../App'
import { Scanner } from '../scan'
import { Portrait } from '../Silhouette'
import { ApproachPill, CommonList, listOf, nameOf } from '../ui'

export function Scan() {
  const { session, me, say, go, deep } = useApp()
  const [cards, setCards] = useState<Card[]>()
  const [camera, setCamera] = useState(!isMock)
  const [typed, setTyped] = useState('')
  const [round, setRound] = useState(0) // replays the catch animation on every scan

  const scan = (tagIds: number[], source: 'camera' | 'manual') =>
    call(session, 'POST /api/scan', { body: { tagIds, source } }).then(({ cards }) => {
      setCards(cards)
      setRound((r) => r + 1)
      say(cards.length ? `You met ${listOf(cards.map(nameOf))}. They see your silhouette, not your card.` : 'Nobody here has that badge yet.')
    }, (e: Error) => say(e.message))
  useEffect(() => { const ids = deep('catch'); if (ids) void scan(ids.split(',').map(Number), 'manual') }, [])

  const submit = (e: FormEvent) => { e.preventDefault(); if (typed) void scan([Number(typed)], 'manual'); setTyped('') }
  const nearby = [[501], [500], [503, 508, 510]].filter((ids) => !ids.includes(me.tagId))

  return (
    <>
      <h1>Scan a badge</h1>
      <div className="finder">
        {round > 0 && <i key={round} className="ripple" aria-hidden />}
        {camera ? <Scanner onCatch={(ids) => void scan(ids, 'camera')} /> : <div className="lens" aria-hidden><i /><i /><i /><i /><b /></div>}
      </div>
      {!camera && (
        <div className="row" role="group" aria-label="Simulate a scan (demo)">
          {nearby.map((ids) => <button key={ids.join()} className="ghost" onClick={() => void scan(ids, 'manual')}>{ids.length > 1 ? 'Scan a group of 3' : `Scan badge ${ids[0]}`}</button>)}
          <button className="ghost" onClick={() => setCamera(true)}>Use camera</button>
        </div>
      )}
      {!cards && <p className="dim">Point at a badge, even from across the table. They don’t need to do anything.</p>}
      {cards && (
        <section key={round} className="catches" aria-label="Who you just met">
          {cards.map((c, i) => (
            <article key={c.id} className="card catch" style={{ '--i': i } as CSSProperties}>
              <header>
                <Portrait id={c.id} photo={c.theyShared?.photo} label={c.theyShared ? `Photo of ${nameOf(c)}` : `Silhouette of ${nameOf(c)}`} />
                <div>
                  <h2>{nameOf(c)}</h2>
                  {c.pronouns && <p className="dim">{c.pronouns}</p>}
                  <ApproachPill approach={c.approach} />
                </div>
              </header>
              {c.commPref && <p className="quote">“{c.commPref}”</p>}
              {me.kind === 'sponsor' && c.interests ? <p className="dim">Into {listOf(c.interests)}. No name or contact until they share.</p> : null}
              <CommonList items={c.common} them={nameOf(c)} />
              <button onClick={() => go(me.kind === 'sponsor' ? 'leads' : `people/${c.id}`)}>{me.kind === 'sponsor' ? 'Send a request from Leads' : `Open ${nameOf(c)}`}</button>
            </article>
          ))}
        </section>
      )}
      {!camera && (
        <form onSubmit={submit} className="row">
          <label>Or type a badge number<input type="number" inputMode="numeric" min={0} max={586} value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
          <button type="submit">Look up</button>
        </form>
      )}
    </>
  )
}
