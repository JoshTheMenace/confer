import { useEffect, useRef, useState } from 'react'
import { type Card, type ContactField, type Receipt, call, contactFields } from '../api'
import { useApp } from '../App'
import { Portrait } from '../Silhouette'
import { ApproachPill, CommonList, Icon, Loading, ago, fieldNames, listOf, nameOf, useLive } from '../ui'

// Only ever build https and mailto links, so a stored value can't become a javascript: URL.
const href = (f: ContactField, v: string) =>
  f === 'email' ? `mailto:${v}` : f === 'linkedin' ? `https://www.linkedin.com/in/${encodeURIComponent(v)}` : `https://github.com/${encodeURIComponent(v)}`

/** The live people list. Announces when someone shares with you, since the reveal itself is only visual. */
function usePeople() {
  const { session, say } = useApp()
  const [data, reload, error] = useLive(session, 'GET /api/people')
  const seen = useRef<Set<string>>(undefined)
  useEffect(() => {
    if (!data) return
    const shared = data.people.filter((p) => p.theyShared)
    const fresh = shared.filter((p) => seen.current && !seen.current.has(p.id))
    if (fresh.length) say(`${listOf(fresh.map(nameOf))} shared their card with you.`)
    seen.current = new Set(shared.map((p) => p.id))
  }, [data, say])
  return { people: data?.people, reload, error }
}

const filters = { all: 'All', shared: 'Shared with me', scanned: 'Scanned me' }
const keep: Record<keyof typeof filters, (c: Card) => boolean> = { all: () => true, shared: (c) => !!c.theyShared, scanned: (c) => c.met?.by !== 'me' }

export function People() {
  const { session, go, say } = useApp()
  const { people, reload, error } = usePeople()
  const [filter, setFilter] = useState<keyof typeof filters>('all')
  const [confirm, setConfirm] = useState(false)
  if (!people) return <Loading error={error} />
  const shared = people.filter((p) => p.theyShared).length, rest = people.filter((p) => !p.iShared)
  const shareAll = () => call(session, 'POST /api/people/share', { body: { ids: rest.map((p) => p.id) } }).then((r) => { say(`Shared your card with ${r.shared} people.`); setConfirm(false); void reload() }, (e: Error) => say(e.message))
  return (
    <>
      <h1>People</h1>
      <p className="lede"><b>{people.length}</b> met, <b>{shared}</b> shared with you</p>
      <div className="meter" role="img" aria-label={`${shared} of ${people.length} shared with you`}><i style={{ transform: `scaleX(${people.length ? shared / people.length : 0})` }} /></div>
      <div className="seg" role="group" aria-label="Filter people">
        {(Object.keys(filters) as (keyof typeof filters)[]).map((f) => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{filters[f]}</button>)}
      </div>
      {people.length === 0 && <p className="card dim">Nobody yet. Scan a badge and they will appear here as a silhouette.</p>}
      <ul className="grid">
        {people.filter(keep[filter]).map((p) => (
          <li key={p.id}>
            <button className="tile" onClick={() => go(`people/${p.id}`)}>
              <Portrait id={p.id} photo={p.theyShared?.photo} label={p.theyShared ? 'Photo' : 'Silhouette'} />
              <strong>{nameOf(p)}</strong>
              <small>{p.theyShared ? <><Icon name="check" />Shared with you</> : p.met?.by === 'me' ? 'You scanned' : p.met?.by === 'them' ? 'Scanned you' : 'Scanned each other'}</small>
            </button>
          </li>
        ))}
      </ul>
      {rest.length > 0 && (confirm ? (
        <div className="card" role="group" aria-label="Share with everyone">
          <p>Share your card with all {rest.length} people who don’t have it yet? You can unshare any of them later.</p>
          <div className="row"><button onClick={shareAll}>Yes, share with {rest.length}</button><button className="ghost" onClick={() => setConfirm(false)}>Not now</button></div>
        </div>
      ) : <button className="ghost wide" onClick={() => setConfirm(true)}>Share with everyone I met</button>)}
    </>
  )
}

export function Person({ id }: { id: string }) {
  const { session, me, go, say } = useApp()
  const { people, reload, error } = usePeople()
  const [fields, setFields] = useState<ContactField[]>(me.shareFields)
  const [receipt, setReceipt] = useState<Receipt>()
  const c = people?.find((p) => p.id === id)
  if (!people) return <Loading error={error} />
  if (!c) return <p className="card">You haven’t met them yet. <button className="ghost" onClick={() => go('scan')}>Scan a badge</button></p>
  const name = nameOf(c), they = c.theyShared
  const share = () => call(session, 'POST /api/people/:id/share', { params: { id }, body: { fields } }).then(() => { setReceipt(undefined); say(`Shared with ${name}. They can now see your photo and ${listOf(fields.map((f) => fieldNames[f]))}.`); void reload() }, (e: Error) => say(e.message))
  const unshare = () => call(session, 'DELETE /api/people/:id/share', { params: { id } }).then((r) => { setReceipt(r.receipt); say(`Unshared. ${name} sees your silhouette again.`); void reload() }, (e: Error) => say(e.message))
  return (
    <article className="person">
      <button className="ghost back" onClick={() => go('people')}><Icon name="back" />People</button>
      <div className="hero" data-shared={they ? '' : undefined}>
        <Portrait id={c.id} photo={they?.photo} label={they ? `Photo of ${name}` : `Silhouette of ${name}. They haven’t shared yet.`} />
      </div>
      <h1>{name}</h1>
      <p className="dim">{[c.pronouns, they?.role].filter(Boolean).join(' · ')}</p>
      <p className="row center"><ApproachPill approach={c.approach} />{c.commPref && <span className="quote">“{c.commPref}”</span>}</p>

      {they ? (
        <section className="card contact" aria-label={`${name}’s card`}>
          <h2><Icon name="check" />{name} shared with you</h2>
          <ul>{they.fields.map((f) => they.contact[f] && <li key={f}><span>{fieldNames[f]}</span><a href={href(f, they.contact[f])}>{they.contact[f]}</a></li>)}</ul>
        </section>
      ) : <p className="note"><Icon name="lock" />You see a silhouette until {name} taps Share.</p>}

      {receipt && !c.iShared && (
        <section className="receipt" aria-label="Deletion receipt">
          <h2>Deletion receipt</h2>
          <p>{name} no longer has your {listOf(receipt.fields.map((f) => fieldNames[f]))} or photo.</p>
          <p className="mono">{ago(receipt.at)} · trace {receipt.traceId?.slice(0, 8)}</p>
        </section>
      )}
      {c.iShared ? (
        <section className="card">
          <h2>{name} has your {listOf(['photo', ...c.iShared.fields.map((f) => fieldNames[f])])}</h2>
          <button className="ghost" onClick={unshare}><Icon name="undo" />Unshare and get a receipt</button>
        </section>
      ) : (
        <section className="card" data-nudge={they ? '' : undefined}>
          <h2>{they ? 'Share back?' : `${name} sees your silhouette`}</h2>
          <fieldset className="checks">
            <legend>Share hands over your photo and</legend>
            {contactFields.map((f) => (
              <label key={f}><input type="checkbox" checked={fields.includes(f)} onChange={(e) => setFields(e.target.checked ? [...fields, f] : fields.filter((x) => x !== f))} />{fieldNames[f]}</label>
            ))}
          </fieldset>
          <button onClick={share}>Share my card</button>
        </section>
      )}

      <CommonList items={c.common} them={name} />
    </article>
  )
}
