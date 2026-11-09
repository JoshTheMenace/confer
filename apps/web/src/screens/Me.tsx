import { call, type Api, type AutoShare } from '../api'
import { TagSvg } from '../scan'
import { ApproachBadge, FieldPicker, resizePhoto, Screen, Tag, useApp } from '../ui'

export function MeScreen() {
  const { session, me, setMe, go, say, signOut } = useApp()
  const save = async (body: Api['PATCH /api/me']['body']) => {
    setMe((await call(session, 'PATCH /api/me', { body })).me)
    say('Saved.')
  }
  return (
    <Screen title={me.displayName} tone="pink" lede={<>{me.pronouns && <>{me.pronouns} · </>}Badge {me.tagId}</>}>
      <figure className="badge">
        <TagSvg id={me.tagId} size={264} />
        <figcaption>Hold this up to be scanned. It says hi, nothing more.</figcaption>
      </figure>
      <a className="button ghost" href="#/print" onClick={(e) => { e.preventDefault(); go('print') }}>Printable badge sheet</a>
      <h2 className="rule">What a scan shows</h2>
      <p><ApproachBadge approach={me.approach} />{me.commPref && <span className="muted"> Prefers: {me.commPref}</span>}</p>
      <p className="tags">{me.interests.map((t) => <Tag key={t} label={t} />)}</p>
      <p className="muted">People see only the tags you have in common with them.</p>
      <h2 className="rule">Sharing</h2>
      <FieldPicker legend="Share hands over" value={me.shareFields} onChange={(shareFields) => save({ shareFields })} />
      <label className="check"><input type="checkbox" checked={me.openToBooths} onChange={(e) => save({ openToBooths: e.target.checked })} />Matching booths may send me a request</label>
      <label className="check"><input type="checkbox" checked={me.boothsSeeName} onChange={(e) => save({ boothsSeeName: e.target.checked })} />Booths may see my first name</label>
      <label className="check"><input type="checkbox" checked={me.discoverable} onChange={(e) => save({ discoverable: e.target.checked })} />Suggest me to other attendees</label>
      <label>Share with booths automatically
        <select value={me.autoShare} onChange={(e) => save({ autoShare: e.target.value as AutoShare })}>
          <option value="off">Never. I decide each time</option>
          <option value="starred">Booths I star</option>
          <option value="matching">Booths with 2+ things in common</option>
        </select>
      </label>
      <h2 className="rule">Selfie</h2>
      <div className="row">
        {me.photo ? <img className="selfie" src={me.photo} alt="Your selfie" /> : <p className="muted">No selfie. People you share with see your silhouette.</p>}
        <label>{me.photo ? 'Replace' : 'Add a selfie'}
          <input type="file" accept="image/*" capture="user" onChange={async (e) => e.target.files?.[0] && save({ photo: await resizePhoto(e.target.files[0]) })} />
        </label>
        {me.photo && <button className="ghost" onClick={() => save({ photo: '' })}>Remove</button>}
      </div>
      <button className="ghost" onClick={signOut}>Sign out</button>
    </Screen>
  )
}
