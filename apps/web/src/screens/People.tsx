import { useEffect, useRef, useState } from 'react'
import { call, type Card, type ContactField, type Receipt } from '../api'
import { Portrait } from '../Silhouette'
import { ago, ApproachBadge, CommonList, ContactCard, fieldNames, FieldPicker, param, Screen, useApp, useLive } from '../ui'

const filters: [string, (c: Card) => boolean][] = [['All', () => true], ['Shared with me', (c) => !!c.theyShared], ['Scanned me', (c) => c.met?.by !== 'me']]
const metBy = { me: 'You scanned them', them: 'They scanned you', both: 'You scanned each other' }

/** Announces a share that arrives from the other phone, so the reveal is never motion-only. */
function useShareNews(people: Card[] | undefined) {
  const { say } = useApp(), seen = useRef<Set<string>>(undefined)
  useEffect(() => {
    if (!people) return
    const now = new Set(people.filter((p) => p.theyShared).map((p) => p.id))
    if (seen.current) people.filter((p) => now.has(p.id) && !seen.current!.has(p.id)).forEach((p) => say(`${p.name} shared their card with you.`))
    seen.current = now
  }, [people, say])
}

export function People() {
  const { session, go, say } = useApp()
  const { data, error, reload } = useLive(session, 'GET /api/people')
  const [filter, setFilter] = useState(0)
  const [armed, setArmed] = useState(false)
  useShareNews(data?.people)
  const people = data?.people ?? [], shared = people.filter((p) => p.theyShared).length, unsent = people.filter((p) => !p.iShared)
  const shareAll = async () => {
    if (!armed) return setArmed(true)
    const { shared } = await call(session, 'POST /api/people/share', { body: { ids: unsent.map((p) => p.id) } })
    say(`Shared your card with ${shared} people.`)
    setArmed(false)
    reload()
  }
  return (
    <Screen title="People" tone="yellow" lede={<><b>{people.length}</b> met, <b>{shared}</b> shared with you</>}>
      <div className="meter" role="img" aria-label={`${shared} of ${people.length} shared with you`}>{people.map((p) => <i key={p.id} className={p.theyShared ? 'on' : ''} />)}</div>
      <div className="filters" role="group" aria-label="Filter people">
        {filters.map(([label], i) => <button key={label} aria-pressed={filter === i} onClick={() => setFilter(i)}>{label}</button>)}
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {data && !people.length && <p className="muted">Nobody yet. Scan a badge to start your album.</p>}
      <ul className="album">
        {people.filter(filters[filter][1]).map((p) => (
          <li key={p.id} className={p.theyShared ? 'filled' : ''}>
            <a href={`#/people/${p.id}`} onClick={(e) => { e.preventDefault(); go(`people/${p.id}`) }}>
              <Portrait card={p} />
              <b>{p.name}</b>
              <small>{p.theyShared ? 'Shared with you' : `${p.common.length} in common`}</small>
            </a>
          </li>
        ))}
      </ul>
      {unsent.length > 0 && (
        <section className="endcap">
          <h2>Event wrapping up?</h2>
          <button className={armed ? 'big' : 'ghost'} onClick={shareAll}>{armed ? `Yes, share with ${unsent.length} people` : 'Share with everyone I met'}</button>
          {armed && <button className="ghost" onClick={() => setArmed(false)}>Cancel</button>}
        </section>
      )}
    </Screen>
  )
}

export function Person({ id }: { id: string }) {
  const { session, me, go, say } = useApp()
  const { data, reload } = useLive(session, 'GET /api/people')
  const [fields, setFields] = useState<ContactField[]>(me.shareFields)
  const [receipt, setReceipt] = useState<Receipt>()
  useShareNews(data?.people)
  const p = data?.people.find((x) => x.id === id)
  const back = <a className="back" href="#/people" onClick={(e) => { e.preventDefault(); go('people') }}>← People</a>
  if (!p) return <Screen title={data ? 'Not met yet' : '…'} tone="yellow">{back}{data && <p>Scan their badge first.</p>}</Screen>

  const share = async () => {
    await call(session, 'POST /api/people/:id/share', { params: { id }, body: { fields } })
    setReceipt(undefined)
    say(`Shared your card with ${p.name}.`)
    reload()
  }
  const unshare = async () => {
    const res = await call(session, 'DELETE /api/people/:id/share', { params: { id } })
    setReceipt(res.receipt)
    say(`Unshared. ${p.name} no longer has your card.`)
    reload()
  }
  const freeze = param('reveal')
  return (
    <Screen title={p.name ?? 'Attendee'} tone={p.theyShared ? 'paper' : 'yellow'} lede={<>{p.pronouns && <>{p.pronouns} · </>}{p.met && `${metBy[p.met.by]} ${ago(p.met.at)}`}</>}>
      {back}
      <div className="hero"><Portrait card={p} freeze={freeze === null ? undefined : Number(freeze)} /></div>
      <p className="status">{p.theyShared ? `${p.name} shared their card with you.` : `A silhouette until ${p.name} chooses to share.`}</p>
      <p><ApproachBadge approach={p.approach} />{p.commPref && <span className="muted"> Prefers: {p.commPref}</span>}</p>
      <CommonList common={p.common} theirs={p.name ?? 'Them'} />
      {p.theyShared && <ContactCard contact={p.theyShared.contact} role={p.theyShared.role} />}
      <section className="sharebox">
        {p.iShared ? <>
          <h2>You shared {p.iShared.fields.map((f) => fieldNames[f]).join(' and ')}</h2>
          <p className="muted">{ago(p.iShared.at)}. Unshare deletes it from their list.</p>
          <button className="danger" onClick={unshare}>Unshare</button>
        </> : <>
          <h2>{p.theyShared ? 'Share back?' : `Share with ${p.name}?`}</h2>
          <FieldPicker legend="Hand over" value={fields} onChange={setFields} />
          <button className="big" disabled={!fields.length} onClick={share}>Share my card</button>
        </>}
      </section>
      {receipt && (
        <div className="receipt" role="status">
          <div>
            <b>Deletion receipt</b>
            <p>{receipt.fields.map((f) => fieldNames[f]).join(', ')} and photo removed from {p.name}'s list.</p>
            <p><small>{new Date(receipt.at).toLocaleTimeString()} · trace <code>{receipt.traceId?.slice(0, 8)}</code></small></p>
          </div>
        </div>
      )}
    </Screen>
  )
}
