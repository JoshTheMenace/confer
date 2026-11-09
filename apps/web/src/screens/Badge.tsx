import { useState } from 'react'
import { api, call, setToken, type Me } from '../api'
import { approaches, type Approach } from '../lib'
import { BadgeSheet, TagSvg } from '../scan'
import { ApproachBadge, Problem } from '../ui'

type Patch = Partial<Pick<Me, 'approach' | 'interestsVisibleTo' | 'discoverable'>>

export function Badge({ me, onChange }: { me: Me; onChange: (me: Me | null) => void }) {
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const save = async (json: Patch) => {
    setSaving(true)
    try { onChange((await call(api.api.me.$patch({ json }))).me); setError(undefined) } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  const toggle = (k: 'peers' | 'sponsors', on: boolean) => save({ interestsVisibleTo: on ? [...me.interestsVisibleTo, k] : me.interestsVisibleTo.filter((x) => x !== k) })

  return (
    <>
      <h1>My badge</h1>
      <p>No printer? Hold your phone up so people can scan this screen. <strong>Tip:</strong> turn your brightness all the way up.</p>
      <figure className="tag-big">
        <TagSvg id={me.tagId} />
        <figcaption style={{ color: '#000', textAlign: 'center', fontWeight: 800 }}>#{me.tagId} · {me.displayName}</figcaption>
      </figure>
      <ApproachBadge approach={me.approach} big />
      <p className="row"><a className="btn" href="#/print">Printable badge</a><button type="button" onClick={() => { setToken(''); onChange(null) }}>Sign out</button></p>

      <h2>Your choices</h2>
      <p className="hint">Changes save right away.</p>
      <fieldset className="field">
        <legend>How should people approach you?</legend>
        <div className="options">
          {(Object.keys(approaches) as Approach[]).map((k) => (
            <label key={k} className="option">
              <input type="radio" name="approach" checked={me.approach === k} onChange={() => save({ approach: k })} disabled={saving} />
              <span><span aria-hidden>{approaches[k].icon} </span>{approaches[k].label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>Who can see your interests?</legend>
        <label className="check"><input type="checkbox" checked={me.interestsVisibleTo.includes('peers')} onChange={(e) => toggle('peers', e.target.checked)} disabled={saving} />People I meet</label>
        <label className="check"><input type="checkbox" checked={me.interestsVisibleTo.includes('sponsors')} onChange={(e) => toggle('sponsors', e.target.checked)} disabled={saving} />Sponsors</label>
      </fieldset>
      <label className="check"><input type="checkbox" checked={me.discoverable} onChange={(e) => save({ discoverable: e.target.checked })} disabled={saving} />Suggest me in other people’s matches</label>
      <Problem error={error} />
    </>
  )
}

export const Print = ({ me }: { me: Me }) => (
  <>
    <h1>Printable badge</h1>
    <p>Prints about 6 cm wide. Pin it where people can see it.</p>
    <p className="row"><button type="button" className="btn-primary" onClick={() => print()}>Print</button><a className="btn" href="#/badge">Back</a></p>
    <BadgeSheet ids={[me.tagId]} />
  </>
)
