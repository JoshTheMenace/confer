import { api, call } from '../api'
import { Loading, PersonCard, Problem, useLoad } from '../ui'

function Terms({ title, terms }: { title: string; terms: { term: string; count: number }[] }) {
  const max = Math.max(1, ...terms.map((t) => t.count))
  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      {terms.length ? (
        <ul className="terms">
          {terms.slice(0, 8).map((t) => (
            <li key={t.term}>
              <span>{t.term}</span><strong>{t.count}</strong>
              <div className="bar" style={{ width: `${(t.count / max) * 100}%` }} aria-hidden />
            </li>
          ))}
        </ul>
      ) : <p className="muted">Nothing to show yet.</p>}
    </section>
  )
}

export function Leads() {
  const { data, error } = useLoad(() => call(api.api.sponsor.leads.$get()))
  if (!data) return <><h1>Leads</h1>{error ? <Problem error={error} /> : <Loading what="leads" />}</>
  const { leads, stats } = data
  const tiles = { Scans: stats.scans, Waiting: stats.pending, 'After event': stats.deferred, Shared: stats.granted, Declined: stats.denied }

  return (
    <>
      <h1>Leads</h1>
      <ul className="stat">{Object.entries(tiles).map(([k, v]) => <li key={k}><b>{v}</b>{k}</li>)}</ul>

      <h2>What your visitors care about</h2>
      <p className="hint">Anonymous totals, only from people who chose to share interests with sponsors.</p>
      <div className="card"><Terms title="Interests" terms={stats.interests} /><Terms title="Looking for" terms={stats.lookingFor} /></div>

      <h2>Shared contacts · {leads.length}</h2>
      {leads.length ? leads.map((c) => <PersonCard key={c.id} card={c} viewer="sponsor" />)
        : <p className="muted">When an attendee says yes, their details appear here.</p>}
    </>
  )
}
