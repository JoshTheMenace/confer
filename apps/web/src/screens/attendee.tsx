import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react'
import type { Card, ContactField, Receipt } from '../../../api/src/contract'
import { call, flag, isMock } from '../api'
import { Scanner } from '../scan'
import { ApproachChip, Badge, CommonList, FieldPicker, fieldNames, listFields, nameOf, Portrait, Problem, Stamp, time, useApp, usePoll } from '../ui'

const who = (c: Card) => (c.kind === 'sponsor' ? `${nameOf(c)} booth` : nameOf(c))
const tagList = (v: string | null) => (v ?? '').split(',').map(Number).filter(Boolean)

export function ScanScreen() {
  const { session, say, go } = useApp()
  const [cards, setCards] = useState<Card[]>([])
  const [problem, setProblem] = useState<string>()
  const onCatch = (tagIds: number[], source: 'camera' | 'manual' = 'camera') =>
    call(session, 'POST /api/scan', { body: { tagIds, source } }).then(({ cards }) => {
      setCards(cards)
      setProblem(cards.length ? undefined : 'That badge is not registered yet.')
      if (cards.length) say(cards.map((c) => `Met ${who(c)}: ${c.common.length} things in common.`).join(' '))
    }, (e: Error) => setProblem(e.message))
  useEffect(() => { if (tagList(flag('catch')).length) onCatch(tagList(flag('catch')), 'manual') }, []) // deep link: ?catch=501
  return (
    <>
      <h1 tabIndex={-1}>Scan a badge</h1>
      {cards.length > 0 ? (
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
              <p className="note">{nameOf(c)} sees your silhouette too. Nothing else moves until one of you taps Share.</p>
              <div className="row end"><button className="btn primary" onClick={() => go(`people/${c.id}`)}>Open {nameOf(c)}'s card</button></div>
            </Badge>
          ))}
          <button className="btn" onClick={() => setCards([])}>Scan another</button>
        </section>
      ) : (
        <>
          <p className="muted">Point the camera at a badge, even from across the table. You will see a silhouette and what you have in common.</p>
          <div className="viewfinder">{flag('nocam') === null ? <Scanner onCatch={(ids) => onCatch(ids)} /> : <p className="muted">Camera is off for this demo link.</p>}</div>
          {isMock && (
            <section className="paper sim" aria-label="Simulate a scan">
              <h2>No camera? Pretend to scan</h2>
              <div className="row">
                {([['Diego', [501]], ['Amara', [500]], ['A group of 3', [504, 508, 510]], ['Elastic booth', [580]]] as [string, number[]][]).map(([name, ids]) => (
                  <button key={name} className="btn" onClick={() => onCatch(ids, 'manual')}>{name}</button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      <Problem error={problem} />
    </>
  )
}

const filters = { all: 'All', shared: 'Shared with me', scanned: 'Scanned me' }

export function PeopleScreen() {
  const { session, say, go } = useApp()
  const { data, error, reload } = usePoll(() => call(session, 'GET /api/people'), [session.token])
  const [filter, setFilter] = useState<keyof typeof filters>('all')
  const [asking, setAsking] = useState(false)
  const people = data?.people ?? [], shared = people.filter((p) => p.theyShared)
  // Announce a share that lands while you are looking: the reveal itself is visual.
  const seen = useRef<Set<string>>(undefined)
  useEffect(() => {
    if (!data) return
    const now = new Set(shared.map((p) => p.id))
    if (seen.current) shared.filter((p) => !seen.current!.has(p.id)).forEach((p) => say(`${who(p)} shared their card with you.`))
    seen.current = now
  }, [data])
  const list = filter === 'all' ? people : filter === 'shared' ? shared : people.filter((p) => p.met && p.met.by !== 'me')
  const pending = people.filter((p) => !p.iShared)
  const shareAll = () => call(session, 'POST /api/people/share', { body: { ids: pending.map((p) => p.id) } }).then((r) => { say(`Shared your card with ${r.shared} people.`); setAsking(false); reload() })
  return (
    <>
      <h1 tabIndex={-1}>People</h1>
      <p className="progress"><b>{people.length}</b> met · <b>{shared.length}</b> shared with you</p>
      <div className="meter" role="img" aria-label={`${shared.length} of ${people.length} shared with you`}>{people.map((p) => <i key={p.id} className={p.theyShared ? 'on' : ''} />)}</div>
      <div className="row filters" role="group" aria-label="Filter people">
        {(Object.keys(filters) as (keyof typeof filters)[]).map((f) => <button key={f} className="chip pick" aria-pressed={filter === f} onClick={() => setFilter(f)}>{filters[f]}</button>)}
      </div>
      <Problem error={error} />
      {data && !list.length && <p className="paper muted">{filter === 'all' ? 'Nobody yet. Scan a badge to meet someone.' : 'Nobody here yet.'}</p>}
      <ul className="wall">
        {list.map((p) => (
          <li key={p.id}>
            <button className="mini" onClick={() => go(`people/${p.id}`)}>
              <span className="slot" aria-hidden />
              <Portrait card={p} size="sm" />
              <b>{who(p)}</b>
              <small>{p.theyShared ? 'Shared with you' : `${p.common.length} in common`}{p.met?.by === 'them' && ' · scanned you'}</small>
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
              <div className="row"><button className="btn primary" onClick={shareAll}>Yes, share with {pending.length}</button><button className="btn" onClick={() => setAsking(false)}>Not now</button></div>
            </>
          ) : <button className="btn" onClick={() => setAsking(true)}>Share with everyone I met</button>}
        </section>
      )}
    </>
  )
}

function ReceiptSlip({ receipt, name }: { receipt: Receipt; name: string }) {
  return (
    <div className="printer" role="status">
      <div className="slip">
        <b>Deletion receipt</b>
        <p>{name} no longer has your {listFields(receipt.fields).toLowerCase()} or your photo.</p>
        <p>{time(receipt.at)} · trace {receipt.traceId?.slice(0, 8)}</p>
      </div>
    </div>
  )
}

export function PersonScreen({ id }: { id: string }) {
  const { session, me, say, go } = useApp()
  const { data, error, reload } = usePoll(() => call(session, 'GET /api/people'), [session.token])
  const [fields, setFields] = useState<ContactField[]>(me.shareFields)
  const [receipt, setReceipt] = useState<Receipt>()
  const [problem, setProblem] = useState<string>()
  const card = data?.people.find((p) => p.id === id)
  const had = useRef(false)
  useEffect(() => {
    if (card?.theyShared && !had.current && data) say(`${nameOf(card)} shared their card with you.`)
    had.current = !!card?.theyShared
  }, [card?.theyShared?.at])
  if (!card) return <><h1 tabIndex={-1}>Person</h1><Problem error={error ?? (data && 'You have not met this person yet.')} /><button className="btn" onClick={() => go('people')}>Back to People</button></>
  const name = nameOf(card), they = card.theyShared
  const act = (p: Promise<unknown>, said: string) => p.then(() => { say(said); reload() }, (e: Error) => setProblem(e.message))
  const share = () => { setReceipt(undefined); act(call(session, 'POST /api/people/:id/share', { params: { id }, body: { fields } }), `Shared your card with ${name}.`) }
  const unshare = () => act(call(session, 'DELETE /api/people/:id/share', { params: { id } }).then((r) => setReceipt(r.receipt)), `Unshared. ${name} no longer has your card.`)
  return (
    <>
      <button className="btn back" onClick={() => go('people')}>← People</button>
      <Badge swing className="person">
        <Portrait card={card} size="lg" />
        {they && <Stamp>Shared with you</Stamp>}
        <h1 tabIndex={-1}>{who(card)} {card.pronouns && <small>{card.pronouns}</small>}</h1>
        {they?.role && <p className="role">{they.role}</p>}
        <p className="row"><ApproachChip approach={card.approach} />{card.commPref && <span className="muted">Prefers: {card.commPref}</span>}</p>
        {card.iShared ? (
          <div className="row had">
            <p><b><span aria-hidden>✓</span> {name} has your card</b><br /><small>{listFields(card.iShared.fields)}{me.hasPhoto && ' and your photo'}</small></p>
            <button className="btn" onClick={unshare}>Unshare</button>
          </div>
        ) : (
          <>
            {they && <p className="nudge"><b>{name} shared with you.</b> Share back?</p>}
            <button className="btn primary big" onClick={share}>Share my card</button>
          </>
        )}
        {receipt && !card.iShared && <ReceiptSlip receipt={receipt} name={name} />}
        <Problem error={problem} />
        {they ? (
          <dl className="contact">
            {they.fields.map((f) => <div key={f}><dt>{fieldNames[f]}</dt><dd>{they.contact[f]}</dd></div>)}
          </dl>
        ) : <p className="note">A silhouette until {name} taps Share. Nobody is judged on a photo first.</p>}
      </Badge>
      <CommonList common={card.common} them={name} />
      {!card.iShared && (
        <section className="paper">
          <FieldPicker legend={`What Share hands ${name}`} value={fields} onChange={setFields} />
          <p className="muted">Plus your selfie, if you added one. Unshare deletes it all and prints a receipt.</p>
        </section>
      )}
    </>
  )
}

const receiptWords = { shared: ['↗', 'You shared with'], opened: ['👁', 'Opened by'], unshared: ['✂', 'You unshared from'] } as const

export function InboxScreen() {
  const { session, say } = useApp()
  const { data, error, reload } = usePoll(() => call(session, 'GET /api/inbox'), [session.token])
  const count = useRef<number>(undefined)
  const pending = data?.requests.filter((r) => r.status === 'pending').length
  useEffect(() => {
    if (pending !== undefined && count.current !== undefined && pending > count.current) say('A booth sent you a request.')
    count.current = pending
  }, [pending])
  const answer = (id: string, action: 'share' | 'ignore' | 'mute', said: string) => call(session, 'POST /api/inbox/:id', { params: { id }, body: { action } }).then(() => { say(said); reload() })
  return (
    <>
      <h1 tabIndex={-1}>Inbox</h1>
      <Problem error={error} />
      <h2>Booth requests</h2>
      {data && !data.requests.length && <p className="paper muted">No requests. Booths can only ask; they never get your card unless you say yes.</p>}
      <ul className="requests">
        {data?.requests.map((r) => (
          <li key={r.id} className={`paper request ${r.status}`}>
            <header>
              <b>{r.booth.name}</b>
              <small>{r.source === 'scan' ? 'scanned your badge' : 'matched your topics'} · {time(r.createdAt)}</small>
            </header>
            <blockquote>{r.note}</blockquote>
            {r.attachment && <a className="attach" href={r.attachment.url} target="_blank" rel="noreferrer"><span aria-hidden>📎</span> {r.attachment.label}<small>Yours either way</small></a>}
            {r.why.length > 0 && <p className="why">Why you: {r.why.map((c) => <span key={c.mine} className="chip">{c.mine}</span>)}</p>}
            {r.status === 'pending' ? (
              <div className="row">
                <button className="btn primary" onClick={() => answer(r.id, 'share', `Shared your card with ${r.booth.name}.`)}>Share</button>
                <button className="btn" onClick={() => answer(r.id, 'ignore', 'Ignored.')}>Ignore</button>
                <button className="btn" onClick={() => answer(r.id, 'mute', `Muted ${r.booth.name}. They cannot ask again.`)}>Mute booth</button>
              </div>
            ) : <Stamp>{r.status === 'shared' ? 'You shared' : 'Ignored'}</Stamp>}
          </li>
        ))}
      </ul>
      <h2>Receipts</h2>
      <p className="muted">Every time your card moves, you get a line here.</p>
      <ol className="slip timeline">
        {data?.receipts.map((r) => (
          <li key={r.id}>
            <span aria-hidden>{receiptWords[r.type][0]}</span>
            <span><b>{receiptWords[r.type][1]} {r.who ? who(r.who) : 'someone'}</b><br />{listFields(r.fields)} · {time(r.at)}</span>
            <code title="Trace id">{r.traceId?.slice(0, 8)}</code>
          </li>
        ))}
        {data && !data.receipts.length && <li>Nothing yet.</li>}
      </ol>
    </>
  )
}

export function DiscoverScreen() {
  const { session, go } = useApp()
  const [text, setText] = useState(flag('q') ?? '')
  const [q, setQ] = useState(text)
  const { data, error, reload } = usePoll(() => call(session, 'GET /api/discover', { query: { q } }), [session.token, q])
  const star = (id: string, on: boolean) => call(session, on ? 'PUT /api/booths/:id/star' : 'DELETE /api/booths/:id/star', { params: { id } }).then(reload)
  const submit = (e: FormEvent) => { e.preventDefault(); setQ(text) }
  return (
    <>
      <h1 tabIndex={-1}>Discover</h1>
      <form onSubmit={submit} className="row search" role="search">
        <label>What are you stuck on?<input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tracing across 200 services" /></label>
        <button className="btn primary">Search</button>
      </form>
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
            <button className="btn star" aria-pressed={!!card.starred} onClick={() => star(card.id, !card.starred)}><span aria-hidden>{card.starred ? '★' : '☆'}</span> {card.starred ? 'Starred' : 'Star'}</button>
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
              <p>{common.map((c) => <span key={c.theirs} className="chip">{c.kind === 'related' ? `${c.mine} ~ ${c.theirs}` : c.mine}</span>)}</p>
              {card.met && <button className="btn" onClick={() => go(`people/${card.id}`)}>Open card</button>}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
