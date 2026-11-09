import { type FormEvent, useState } from 'react'
import { api, call } from '../api'
import { ApproachBadge, Chips, Loading, Problem, useLoad } from '../ui'

type Match = Awaited<ReturnType<typeof call<Awaited<ReturnType<typeof api.api.matches.$get>>>>>[number]

function MatchCard({ m }: { m: Match }) {
  const [why, setWhy] = useState('')
  const ask = async () => {
    setWhy('Thinking…')
    setWhy(await call(api.api.matches[':id'].why.$get({ param: { id: m.id } })).then((r) => r.why, () => 'Couldn’t fetch a reason right now. Say hi anyway!'))
  }
  const { card } = m
  return (
    <article className="card" aria-labelledby={`m-${m.id}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 id={`m-${m.id}`}>{card.displayName}</h3>
        <span className="chip">{m.type}</span>
      </div>
      <p className="muted">#{m.tagId}{card.pronouns && ` · ${card.pronouns}`}{card.role && ` · ${card.role}`}</p>
      {card.approach && <ApproachBadge approach={card.approach} />}
      {card.commPref && <p><span aria-hidden>💬 </span>{card.commPref}</p>}
      {!!m.sharedInterests.length && <p><strong>You both like:</strong></p>}
      <Chips items={card.interests ?? []} shared={m.sharedInterests} label="Interests, shared ones starred" />
      {card.about && <p>{card.about}</p>}
      <button type="button" onClick={ask}>Why meet?</button>
      <p aria-live="polite">{why}</p>
    </article>
  )
}

export function Matches() {
  const [q, setQ] = useState('')
  const { data, error, reload } = useLoad(() => call(api.api.matches.$get({ query: { q: q || undefined } })))
  const search = (e: FormEvent) => {
    e.preventDefault()
    void reload()
  }
  return (
    <>
      <h1>People to meet</h1>
      <p>Picked by your interests and what you wrote about yourself. Only people who chose to be suggested show up.</p>
      <form role="search" onSubmit={search} className="row" style={{ alignItems: 'end' }}>
        <label className="field" style={{ flex: 1, margin: 0 }}>Looking for something specific?
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. eBPF tracing" />
        </label>
        <button type="submit">Search</button>
      </form>
      <Problem error={error} />
      {!data ? !error && <Loading what="matches" /> : data.length ? data.map((m) => <MatchCard key={m.id} m={m} />) : <p className="muted">No matches yet. Try adding interests.</p>}
    </>
  )
}
