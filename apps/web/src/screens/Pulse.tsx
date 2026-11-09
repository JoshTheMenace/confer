import type { CSSProperties } from 'react'
import type { Pulse } from '../../../api/src/contract'
import { call, type Session } from '../api'
import { httpsUrl } from '../links'
import { Bars, pct, Problem, Stat, time, useApp, usePoll } from '../ui'

export function Chart({ series }: { series: Pulse['series'] }) {
  const max = Math.max(1, ...series.map((p) => p.scans))
  return (
    <figure className="chart">
      <div role="img" aria-label={`Scans per minute, last 30 minutes. Latest ${series.at(-1)?.scans ?? 0}.`}>
        {series.map((p) => <span key={p.t}><i style={{ '--h': p.scans / max } as CSSProperties} /><i className="shares" style={{ '--h': p.shares / max } as CSSProperties} /></span>)}
      </div>
      <figcaption><span className="key scans" /> scans <span className="key shares" /> shares, per minute</figcaption>
    </figure>
  )
}

export const usePulse = (session: Session) => usePoll(() => call(session, 'GET /api/pulse'), [session.token])

export function PulseTotals({ totals }: { totals: Pulse['totals'] }) {
  return <div className="stats"><Stat label="meetings" value={totals.meetings} /><Stat label="shares" value={totals.shares} /><Stat label="unshares" value={totals.unshares} /><Stat label="requests" value={totals.requests} /><Stat label="share rate" value={totals.shareRate} format={pct} /></div>
}

export function PulseScreen() {
  const { session, signOut } = useApp()
  const { data, error } = usePulse(session)
  const h = data?.health
  return (
    <>
      <h1 tabIndex={-1}>Event Pulse</h1>
      <Problem error={error} />
      {data && (
        <>
          <p className="muted">{data.totals.attendees} attendees · {data.totals.booths} booths · updated {time(data.at)}</p>
          <PulseTotals totals={data.totals} />
          <section className="paper"><h2>Last 30 minutes</h2><Chart series={data.series} /></section>
          <section className="paper"><h2>Top interests</h2><Bars terms={data.topInterests} /></section>
          {data.booths && (
            <section className="paper"><h2>Booths</h2>
              <table><thead><tr><th scope="col">Booth</th><th scope="col">Scans</th><th scope="col">Share rate</th><th scope="col">Mutes</th></tr></thead>
                <tbody>{data.booths.map((b) => <tr key={b.id}><th scope="row">{b.name}</th><td>{b.scans}</td><td>{pct(b.shareRate)}</td><td>{b.mutes}</td></tr>)}</tbody></table>
            </section>
          )}
          <section className="paper health">
            <h2>Health <small>{h?.source === 'dash0' ? 'read live from Dash0' : 'Dash0 is not reachable right now'}</small></h2>
            {h?.source === 'dash0' && (
              <>
                <div className="stats"><Stat label="p95 ms" value={h.p95Ms ?? 0} /><Stat label="errors" value={h.errorRate ?? 0} format={(n) => `${(n * 100).toFixed(1)}%`} /><Stat label="requests/min" value={h.requestsPerMin ?? 0} /></div>
                {h.slo && <p className={`slo ${h.slo.ok ? 'ok' : 'bad'}`}><span aria-hidden>{h.slo.ok ? '✓' : '!'}</span> {h.slo.name}: {(h.slo.current * 100).toFixed(1)}% (target {(h.slo.target * 100).toFixed(0)}%), {h.slo.ok ? 'within target' : 'below target'}</p>}
                {httpsUrl(h.dashboardUrl) && <a className="btn" href={httpsUrl(h.dashboardUrl)} target="_blank" rel="noreferrer">Open the Dash0 dashboard</a>}
              </>
            )}
          </section>
        </>
      )}
      <button type="button" className="btn" onClick={signOut}>Sign out</button>
    </>
  )
}
