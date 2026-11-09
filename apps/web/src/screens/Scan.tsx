import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { call, isMock, type Card } from '../api'
import { Scanner } from '../scan'
import { Portrait } from '../Silhouette'
import { ApproachBadge, CommonList, param, Screen, Tag, useApp } from '../ui'

export function Scan() {
  const { session, me, go, say } = useApp()
  const [cards, setCards] = useState<Card[]>([])
  const [error, setError] = useState('')
  const booth = me.kind === 'sponsor'
  const scan = useCallback((tagIds: number[], source: 'camera' | 'manual' = 'camera') =>
    call(session, 'POST /api/scan', { body: { tagIds, source } }).then(({ cards }) => {
      setCards(cards)
      setError('')
      say(cards.map((c) => `Met ${c.name ?? 'an attendee'}. ${c.common.length} things in common.`).join(' '))
    }, (e: Error) => setError(e.message)), [session, say])
  // ?catch=501 or ?catch=501,502,503 shows a catch without a camera (standalone only).
  useEffect(() => { if (session.slot === 'main' && param('catch')) scan(param('catch')!.split(',').map(Number), 'manual') }, [scan, session.slot])

  return (
    <Screen title="Scan" tone="cobalt" lede={booth ? 'Scan a badge. You see interests and fit, never a name.' : 'Point at a badge. They touch nothing.'}>
      {cards.length > 0 && (
        <section className={`catches${cards.length > 1 ? ' group' : ''}`} aria-label="Just met">
          {cards.map((c, i) => (
            <article className="catch" key={c.id} style={{ '--i': i } as CSSProperties}>
              <div className="who">
                <Portrait card={c} />
                <div>
                  <h2>{c.name ?? 'Attendee'}</h2>
                  {c.pronouns && <p>{c.pronouns}</p>}
                  <ApproachBadge approach={c.approach} />
                  {c.commPref && <p className="muted">Prefers: {c.commPref}</p>}
                </div>
              </div>
              <CommonList common={c.common} theirs={c.name ?? 'Them'} />
              {booth && c.stuckOn && <p>Stuck on: <b>{c.stuckOn}</b></p>}
              {booth && <p className="tags">{c.interests?.map((t) => <Tag key={t} label={t} />)}</p>}
              <button onClick={() => go(booth ? 'leads' : `people/${c.id}`)}>{booth ? 'Send them a request' : `Open ${c.name}`}</button>
            </article>
          ))}
          <button className="ghost" onClick={() => setCards([])}>Scan again</button>
        </section>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      {!cards.length && <div className="scanner"><Scanner onCatch={scan} /></div>}
      {isMock && !cards.length && (
        <div className="row simulate">
          <button onClick={() => scan([booth ? 500 : me.tagId === 501 ? 500 : 501], 'manual')}>Simulate a scan</button>
          <button className="ghost" onClick={() => scan([507, 508, 511], 'manual')}>Simulate a group</button>
        </div>
      )}
    </Screen>
  )
}
