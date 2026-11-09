import { useState } from 'react'
import { api, call, type Card, type Me } from '../api'
import { approaches } from '../lib'
import { Scanner } from '../scan'
import { PersonCard, Problem } from '../ui'

export function Scan({ me }: { me: Me }) {
  const [caught, setCaught] = useState<Card[]>([])
  const [said, setSaid] = useState('')
  const [error, setError] = useState<string>()
  const sponsor = me.kind === 'sponsor'

  const onCatch = async (tagIds: number[]) => {
    try {
      const { cards } = await call(api.api.catch.$post({ json: { tagIds } }))
      setError(undefined)
      setSaid(cards.length
        ? cards.map((c) => `${c.badge.displayName}: ${approaches[c.badge.approach].label}`).join('. ')
        : `No one is wearing badge ${tagIds.join(', ')} yet.`)
      setCaught((prev) => [...cards, ...prev.filter((p) => !cards.some((c) => c.id === p.id))])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <h1>{sponsor ? 'Scan visitors' : 'Catch someone'}</h1>
      <p>Point your camera at a badge. Several badges in view? You catch them all at once.</p>
      {sponsor && <p className="hint">Scanning sends a request. Each attendee decides whether to share contact details.</p>}
      <Scanner onCatch={onCatch} />
      <Problem error={error} />
      <p role="status"><strong>{said}</strong></p>
      {!!caught.length && <h2>Just caught</h2>}
      {caught.map((c) => <PersonCard key={c.id} card={c} viewer={me.kind} className="pop" />)}
    </>
  )
}
