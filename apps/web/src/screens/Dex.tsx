import { api, call, justCaught } from '../api'
import { groupByType, mergeRecent, when } from '../lib'
import { Loading, PersonCard, Problem, useLoad } from '../ui'

export function Dex() {
  const { data, error } = useLoad(() => call(api.api.catch.dex.$get()))
  if (!data) return <><h1>My Dex</h1>{error ? <Problem error={error} /> : <Loading what="your Dex" />}</>
  const dex = mergeRecent(data.dex, justCaught)
  const mutual = dex.filter((c) => c.unlocked.length).length

  return (
    <>
      <h1>My Dex</h1>
      <p>{dex.length} caught · <span className="unlocked"><span aria-hidden>🔓 </span>{mutual} mutual</span></p>
      {!dex.length && <p>Nobody yet. Head to <a href="#/scan">Scan</a> and say hi!</p>}
      {groupByType(dex).map(([type, cards]) => (
        <section key={type} aria-labelledby={`t-${type}`}>
          <h2 id={`t-${type}`}>{type} <span className="muted">· {cards.length}</span></h2>
          {cards.map((c) => (
            <PersonCard key={c.id} card={c} viewer="attendee">
              <p className="hint">Caught {when(c.caughtAt)}{c.unlocked.length > 0 && ' · you caught each other'}</p>
            </PersonCard>
          ))}
        </section>
      ))}
    </>
  )
}
