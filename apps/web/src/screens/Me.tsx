import { type Api, type AutoShare, call, contactFields } from '../api'
import { useApp } from '../App'
import { BadgeSheet, TagSvg } from '../scan'
import { Silhouette } from '../Silhouette'
import { fieldNames, resizePhoto } from '../ui'
import { autoShares } from './Onboarding'

export const Print = () => {
  const { me, go } = useApp()
  return <><button className="ghost" onClick={() => go('me')}>Back</button> <button onClick={() => print()}>Print</button><BadgeSheet ids={[me.tagId]} /></>
}

export function MeScreen() {
  const { session, me, setMe, go, say, signOut } = useApp()
  const save = (body: Api['PATCH /api/me']['body'], done = 'Saved.') => call(session, 'PATCH /api/me', { body }).then((r) => { setMe(r.me); say(done) }, (e: Error) => say(e.message))
  const toggles = [['openToBooths', 'Matching booths may send me a request'], ['boothsSeeName', 'Booths can see my first name'], ['discoverable', 'Suggest me to other attendees']] as const
  const html = document.documentElement
  return (
    <>
      <h1>{me.displayName}</h1>
      <figure className="badge">
        <TagSvg id={me.tagId} size={248} />
        <figcaption>Badge {me.tagId}. Hold it up to be scanned.</figcaption>
      </figure>
      <button className="ghost wide" onClick={() => go('print')}>Printable badge sheet</button>

      <section className="card">
        <h2>What people see before you share</h2>
        <div className="row"><span className="mini"><Silhouette id={me.id} /></span><p className="dim">Your silhouette, {me.displayName}{me.pronouns ? `, ${me.pronouns}` : ''}, and only the interests you have in common.</p></div>
        <p className="chips">{me.interests.map((t) => <span key={t} className="chip">{t}</span>)}</p>
      </section>

      <section className="card">
        <h2>Sharing</h2>
        <fieldset className="checks">
          <legend>Share hands over</legend>
          {contactFields.map((f) => (
            <label key={f}><input type="checkbox" checked={me.shareFields.includes(f)} onChange={(e) => save({ shareFields: e.target.checked ? [...me.shareFields, f] : me.shareFields.filter((x) => x !== f) })} />{fieldNames[f]}</label>
          ))}
        </fieldset>
        {toggles.map(([k, label]) => <label key={k} className="check"><input type="checkbox" checked={me[k]} onChange={(e) => save({ [k]: e.target.checked })} />{label}</label>)}
        <label>Share automatically with<select value={me.autoShare} onChange={(e) => save({ autoShare: e.target.value as AutoShare })}>{(Object.keys(autoShares) as AutoShare[]).map((a) => <option key={a} value={a}>{autoShares[a]}</option>)}</select></label>
      </section>

      <section className="card">
        <h2>Selfie</h2>
        <div className="row selfie">
          <span className="mini">{me.photo ? <img src={me.photo} alt="Your selfie" /> : <Silhouette id={me.id} />}</span>
          <label>Take or choose a photo<input type="file" accept="image/*" capture="user" onChange={(e) => { const f = e.target.files?.[0]; if (f) void resizePhoto(f).then((photo) => save({ photo }, 'Selfie saved.')) }} /><small>Seen only by people you shared with. Deleted after the event.</small></label>
        </div>
        {me.photo && <button className="ghost" onClick={() => save({ photo: '' }, 'Selfie removed.')}>Remove selfie</button>}
      </section>

      <div className="row">
        <button className="ghost" onClick={() => { html.dataset.theme = html.dataset.theme === 'light' ? 'dark' : 'light' }}>Switch light or dark</button>
        <button className="ghost" onClick={signOut}>Sign out</button>
      </div>
    </>
  )
}
