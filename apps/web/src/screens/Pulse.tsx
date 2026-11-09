import type { CSSProperties } from 'react'
import { Count, Screen, Tag, useApp, useLive } from '../ui'

const pct = (n: number) => `${Math.round(n * 100)}%`

export function Pulse() {
  const { session, signOut } = useApp()
  const { data, error } = useLive(session, 'GET /api/pulse')
  if (!data) return <Screen title="Pulse" tone="cobalt">{error && <p role="alert" className="error">{error}</p>}</Screen>
  const { totals: t, health: h, series } = data, peak = Math.max(1, ...series.map((s) => s.scans)), top = Math.max(1, ...data.topInterests.map((i) => i.count))
  return (
    <Screen title="Pulse" tone="cobalt" lede="The event, live. Totals only, no names.">
      <dl className="stats">
        <div className="wide"><dt>Share rate</dt><dd><Count n={pct(t.shareRate)} /></dd></div>
        {([['Attendees', t.attendees], ['Met', t.meetings], ['Shared', t.shares], ['Unshared', t.unshares], ['Booth requests', t.requests], ['Booths', t.booths]] as const).map(([label, n]) => <div key={label}><dt>{label}</dt><dd><Count n={n} /></dd></div>)}
      </dl>
      <h2 className="rule">Last 30 minutes</h2>
      <div className="chart" role="img" aria-label={`Scans per minute, peak ${peak}. ${series.at(-1)?.scans} in the last minute.`}>
        {series.map((s) => <i key={s.t} style={{ '--h': s.scans / peak, '--s': s.shares / peak } as CSSProperties}><b /></i>)}
      </div>
      <p className="legend"><span className="k1" /> Scans <span className="k2" /> Shares</p>
      <h2 className="rule">Top interests</h2>
      <ul className="bars">{data.topInterests.map((i) => <li key={i.term}><Tag label={i.term} /><i style={{ '--h': i.count / top } as CSSProperties} /><span>{i.count}</span></li>)}</ul>
      {data.booths && <>
        <h2 className="rule">Booths</h2>
        <table>
          <thead><tr><th scope="col">Booth</th><th scope="col">Scans</th><th scope="col">Share rate</th><th scope="col">Mutes</th></tr></thead>
          <tbody>{data.booths.map((b) => <tr key={b.id}><th scope="row">{b.name}</th><td>{b.scans}</td><td>{pct(b.shareRate)}</td><td>{b.mutes}</td></tr>)}</tbody>
        </table>
      </>}
      <h2 className="rule">Health, from Dash0</h2>
      {h.source === 'unavailable' ? <p className="muted">Dash0 is not reachable right now.</p> : (
        <dl className="stats">
          <div><dt>p95</dt><dd>{h.p95Ms ?? '–'}<small> ms</small></dd></div>
          <div><dt>Errors</dt><dd>{h.errorRate === undefined ? '–' : `${(h.errorRate * 100).toFixed(1)}%`}</dd></div>
          {h.slo && <div className="wide"><dt>{h.slo.name}</dt><dd className={h.slo.ok ? 'ok' : 'bad'}>{h.slo.ok ? '✓ Meeting target' : '✕ Below target'} <small>{(h.slo.current * 100).toFixed(1)}% of {pct(h.slo.target)}</small></dd></div>}
        </dl>
      )}
      {h.dashboardUrl && <a className="button ghost" href={h.dashboardUrl} target="_blank" rel="noreferrer">Open the Dash0 dashboard</a>}
      <button className="ghost" onClick={signOut}>Sign out</button>
    </Screen>
  )
}
