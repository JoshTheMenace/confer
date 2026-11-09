import { type CSSProperties, type FormEvent, useEffect, useState } from 'react'
import type { Card } from '../../../api/src/contract'
import { call, flag, isMock } from '../api'
import { Scanner } from '../scan'
import { ApproachChip, Badge, CommonList, keepCard, nameOf, Portrait, Problem, useAct, useApp, usePoll, who } from '../ui'
import { Connect } from './Connect'

const tagList = (v: string | null) => (v ?? '').split(',').map(Number).filter(Boolean)
const demoBadges: [string, number][] = [['Amara', 500], ['Diego', 501]]

/** A booth's first message to someone it just scanned: the note plus the attachment. It sees topics and fit, never a name. */
function BoothNote({ card }: { card: Card }) {
  const { session, me, say, go } = useApp()
  const booth = usePoll(() => call(session, 'GET /api/booth'), [session.token])
  const [note, setNote] = useState(me.pitch ?? '')
  const act = useAct()
  const v = booth.data?.visitors.find((x) => x.card.id === card.id)
  const send = (e: FormEvent) => {
    e.preventDefault()
    act.run(() => call(session, 'POST /api/booth/requests', { body: { to: [card.id], note, attachment: me.attachment } }).then((r) => say(r.sent ? 'Request sent. They decide whether to share.' : 'Not sent: they are not taking requests from this booth.')))
  }
  return (
    <>
      <p className="chips">{v && <b className="fit">{v.fit}% fit</b>}{card.interests?.slice(0, 5).map((t) => <span key={t} className="chip">{t}</span>)}</p>
      {card.thread ? (
        <div className="row had"><p><b>Request sent.</b> They decide whether to share.</p><button type="button" className="btn primary" onClick={() => go('leads')}>See leads</button></div>
      ) : (
        <form className="connect" onSubmit={send}>
          <label>Your note <small>why you want to connect</small><textarea rows={3} required value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <p className="muted">Carries: {me.attachment?.label ?? 'no attachment'}. Theirs whether or not they share.</p>
          <Problem error={act.error} retry={act.retry} />
          <div className="row end"><button type="submit" className="btn primary" disabled={act.busy || !note.trim()}>{act.busy ? 'Sending…' : 'Send request'}</button></div>
        </form>
      )}
    </>
  )
}

export function ScanScreen() {
  const { session, me, say, go, stage, people } = useApp()
  const booth = me.kind === 'sponsor'
  const [ids, setIds] = useState<string[]>([])
  const [caught, setCaught] = useState<Card[]>([])
  const [camera, setCamera] = useState(!stage && flag('nocam') === null) // on Stage the camera waits for a tap: typing always works
  const [typed, setTyped] = useState('')
  const act = useAct()
  // The catch stays live, so "Request sent" shows up on the card the moment it is true.
  const cards = caught.map((c) => people.data?.people.find((p) => p.id === c.id) ?? c).filter((c) => ids.includes(c.id))
  const onCatch = (tagIds: number[], source: 'camera' | 'manual' = 'camera') => act.run(() => call(session, 'POST /api/scan', { body: { tagIds, source } }).then(({ cards }) => {
    if (!cards.length) throw new Error('That badge is not registered yet.')
    setCaught(cards)
    for (const c of cards) keepCard(session, c)
    setIds(cards.map((c) => c.id))
    say(cards.map((c) => `Met ${who(c)}: ${c.common.length} things in common.`).join(' '))
  }))
  useEffect(() => { if (tagList(flag('catch')).length && !stage) onCatch(tagList(flag('catch')), 'manual') }, []) // deep link: ?catch=501
  const lookUp = (e: FormEvent) => { e.preventDefault(); if (Number(typed)) onCatch([Number(typed)], 'manual'); setTyped('') }
  if (cards.length) return (
    <>
      <h1 tabIndex={-1} className="sr">{cards.length > 1 ? `Met ${cards.length} people` : `Met ${who(cards[0])}`}</h1>
      {cards.length > 1 && <p className="progress"><b>{cards.length}</b> people at once. Swipe to see each.</p>}
      <section className={`catch ${cards.length > 1 ? 'fan' : ''}`} aria-label="Just met">
        <span className="ripple" aria-hidden />
        {cards.map((c, i) => (
          <Badge key={c.id} swing className="caught">
            <div style={{ '--i': i } as CSSProperties} className="who">
              <Portrait card={c} />
              <div>
                <h2>{who(c)} {c.pronouns && <small>{c.pronouns}</small>}</h2>
                <ApproachChip approach={c.approach} />
                {c.commPref && <p className="muted">Prefers: {c.commPref}</p>}
              </div>
            </div>
            <CommonList common={c.common} them={nameOf(c)} />
            {booth ? <BoothNote card={c} /> : cards.length > 1 ? <button type="button" className="btn primary" onClick={() => go(`people/${c.id}`)}>Open {nameOf(c)}'s card</button> : <Connect card={c} onSent={() => go(`people/${c.id}`)} />}
          </Badge>
        ))}
      </section>
      <button type="button" className="btn" onClick={() => setIds([])}>Scan another</button>
    </>
  )
  return (
    <>
      <h1 tabIndex={-1}>Scan a badge</h1>
      <p className="muted">You will see a silhouette and what you have in common. Nothing else moves until someone taps Share.</p>
      <Problem error={act.error} retry={act.retry} />
      {camera ? <div className="viewfinder"><Scanner onCatch={(tags) => onCatch(tags)} /></div> : (
        <form className="paper" onSubmit={lookUp}>
          <div className="row">
            <label>Badge number<input inputMode="numeric" pattern="[0-9]*" required value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="For example 501" /></label>
            <button type="submit" className="btn primary" disabled={act.busy}>{act.busy ? 'Looking…' : 'Look up'}</button>
          </div>
          <button type="button" className="btn" onClick={() => setCamera(true)}>Use the camera instead</button>
        </form>
      )}
      <section className="paper sim" aria-label="Demo badges">
        <h2>Demo badges</h2>
        <div className="row">
          {demoBadges.filter(([, tag]) => tag !== me.tagId).map(([name, tag]) => <button type="button" key={tag} className="btn" disabled={act.busy} onClick={() => onCatch([tag], 'manual')}>Badge {tag} ({name})</button>)}
          {isMock && !booth && <button type="button" className="btn" disabled={act.busy} onClick={() => onCatch([504, 508, 510], 'manual')}>A group of 3</button>}
        </div>
      </section>
    </>
  )
}
