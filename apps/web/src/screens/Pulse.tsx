import { useApp } from '../App'
import { Counter, Icon, Loading, pct, useLive } from '../ui'

export function PulseScreen() {
  const { session, signOut } = useApp()
  const [p, , error] = useLive(session, 'GET /api/pulse')
  if (!p) return <Loading error={error} />
  const { totals: t, health: h } = p
  const max = Math.max(1, ...p.series.map((s) => s.scans)), topMax = Math.max(1, ...p.topInterests.map((i) => i.count))
  const big = (n: number) => n.toLocaleString()
  return (
    <>
      <h1>Event pulse</h1>
      <dl className="stats">
        <div><dt>People met</dt><dd><Counter value={t.meetings} format={big} /></dd></div>
        <div><dt>Cards shared</dt><dd><Counter value={t.shares} format={big} /></dd></div>
        <div><dt>Taken back</dt><dd><Counter value={t.unshares} /></dd></div>
        <div><dt>Share rate</dt><dd>{pct(t.shareRate)}</dd></div>
        <div><dt>Attendees</dt><dd><Counter value={t.attendees} /></dd></div>
        <div><dt>Booth requests</dt><dd><Counter value={t.requests} /></dd></div>
      </dl>

      <section className="card">
        <h2>Last 30 minutes</h2>
        <svg className="chart" viewBox="0 0 300 100" role="img" aria-label={`Scans and shares per minute. Latest minute: ${p.series.at(-1)?.scans} scans, ${p.series.at(-1)?.shares} shares.`}>
          <defs><linearGradient id="bars" x1="0" y1="1" x2="0" y2="0"><stop stopColor="#8b6cff" /><stop offset=".6" stopColor="#ff6f7d" /><stop offset="1" stopColor="#ffb454" /></linearGradient></defs>
          {p.series.map((s, i) => (
            <g key={s.t} transform={`translate(${i * 10} 0)`}>
              <rect className="bar" x="1.5" width="7" rx="2" y={100 - (s.scans / max) * 96} height={(s.scans / max) * 96} fill="url(#bars)" opacity=".85" />
              <rect x="1.5" width="7" y={100 - (s.shares / max) * 96} height="2" fill="var(--text)" />
            </g>
          ))}
        </svg>
        <p className="dim legend"><i className="k1" />Scans per minute <i className="k2" />Shares per minute</p>
      </section>

      <section className="card">
        <h2>Top interests</h2>
        <ul className="bars">{p.topInterests.map((i) => <li key={i.term}><span>{i.term}</span><div className="meter" aria-hidden><i style={{ transform: `scaleX(${i.count / topMax})` }} /></div><b>{i.count}</b></li>)}</ul>
      </section>

      {p.booths && (
        <section className="card">
          <h2>Booths</h2>
          <table>
            <thead><tr><th scope="col">Booth</th><th scope="col">Scans</th><th scope="col">Share rate</th><th scope="col">Mutes</th></tr></thead>
            <tbody>{p.booths.map((b) => <tr key={b.id}><th scope="row">{b.name}</th><td>{b.scans}</td><td>{pct(b.shareRate)}</td><td>{b.mutes}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      <section className="card health">
        <h2>Health, read from Dash0</h2>
        {h.source === 'unavailable' ? <p className="dim">Dash0 isn’t reachable right now.</p> : (
          <>
            {h.slo && <p className="note"><Icon name={h.slo.ok ? 'check' : 'ask'} />{h.slo.name}: {h.slo.ok ? 'on target' : 'at risk'} ({(h.slo.current * 100).toFixed(1)}% of {(h.slo.target * 100).toFixed(0)}%)</p>}
            <dl className="stats">
              <div><dt>p95</dt><dd>{h.p95Ms} ms</dd></div>
              <div><dt>Errors</dt><dd>{((h.errorRate ?? 0) * 100).toFixed(1)}%</dd></div>
              <div><dt>Requests / min</dt><dd>{h.requestsPerMin}</dd></div>
            </dl>
            {h.dashboardUrl && <a href={h.dashboardUrl} target="_blank" rel="noreferrer">Open the Dash0 dashboard</a>}
          </>
        )}
      </section>
      <button className="ghost wide" onClick={signOut}>Sign out</button>
    </>
  )
}
