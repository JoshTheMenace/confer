import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import type { Api, Approach, AutoShare, Me } from '../../../api/src/contract'
import { call, isMock, personas, type Session } from '../api'
import { BadgeSheet, TagSvg } from '../scan'
import { Scenery } from '../Scenery'
import { Silhouette } from '../Silhouette'
import { approachLabel, FieldPicker, Problem, useAct, useApp } from '../ui'

export type Draft = Api['POST /api/me/signup']['body']
type Step = { draft: Draft; set: (patch: Partial<Draft>) => void; children?: ReactNode }

const suggestions = ['Kubernetes', 'OpenTelemetry', 'Distributed tracing', 'Observability', 'Platform engineering', 'Security', 'eBPF', 'AI', 'Search', 'Developer experience', 'Rust', 'Postgres', 'Incident response', 'Accessibility', 'SLOs', 'Open source']
const blank: Draft = { displayName: '', approach: 'open', interests: [], lookingFor: [], discoverable: true, openToBooths: true, boothsSeeName: false, autoShare: 'off', shareFields: ['email'], contact: {} }

/** Shrinks a selfie (a chosen file or a camera frame) in the browser to at most 320px JPEG before it goes anywhere. */
async function resize(source: File | HTMLVideoElement) {
  const img = await createImageBitmap(source), k = Math.min(1, 320 / Math.max(img.width, img.height))
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) })
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8)
}

/** The device camera, inline: a live preview, one button takes the picture, and the camera is off again. */
function Camera({ onPhoto, onClose }: { onPhoto: (photo: string) => void; onClose: (why?: string) => void }) {
  const video = useRef<HTMLVideoElement>(null), take = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let stream: MediaStream | undefined, gone = false
    const stop = () => { for (const t of stream?.getTracks() ?? []) t.stop() }
    const none = () => onClose('The camera is not available or was not allowed. Choose a picture instead.')
    if (!navigator.mediaDevices?.getUserMedia) return none()
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then((s) => {
      stream = s
      if (gone || !video.current) return stop()
      video.current.srcObject = s
      take.current?.focus()
    }, none)
    return () => { gone = true; stop() }
  }, [])
  return (
    <div className="camera">
      <video ref={video} autoPlay muted playsInline aria-label="Camera preview" />
      <div className="row">
        <button ref={take} type="button" className="btn primary" onClick={() => resize(video.current!).then(onPhoto, () => onClose('The camera was not ready. Try again.'))}>Take photo</button>
        <button type="button" className="btn" onClick={() => onClose()}>Cancel</button>
      </div>
    </div>
  )
}

function You({ draft, set, children }: Step) {
  return (
    <>
      <label>First name or nickname<input required autoComplete="given-name" value={draft.displayName} onChange={(e) => set({ displayName: e.target.value })} /></label>
      {children}
      <label>Pronouns <small>optional</small><input value={draft.pronouns ?? ''} onChange={(e) => set({ pronouns: e.target.value })} placeholder="she/her, they/them…" /></label>
      <fieldset className="checks">
        <legend>How should people approach you?</legend>
        {(['open', 'ask', 'quiet'] as Approach[]).map((a) => (
          <label key={a}><input type="radio" name="approach" checked={draft.approach === a} onChange={() => set({ approach: a })} /> {approachLabel(a)}</label>
        ))}
      </fieldset>
      <label>How do you like to talk? <small>optional</small><input value={draft.commPref ?? ''} onChange={(e) => set({ commPref: e.target.value })} placeholder="Short chats, text first…" /></label>
    </>
  )
}

function Interests({ draft, set }: Step) {
  const [extra, setExtra] = useState('')
  const toggle = (t: string) => set({ interests: draft.interests.includes(t) ? draft.interests.filter((x) => x !== t) : [...draft.interests, t].slice(0, 8) })
  const add = () => { if (extra.trim()) toggle(extra.trim()); setExtra('') }
  return (
    <>
      <fieldset>
        <legend>Pick 3 to 8 topics <small aria-live="polite">{draft.interests.length} picked</small></legend>
        <div className="chips">
          {[...new Set([...suggestions, ...draft.interests])].map((t) => (
            <button type="button" key={t} className="chip pick" aria-pressed={draft.interests.includes(t)} onClick={() => toggle(t)}>{t}</button>
          ))}
        </div>
      </fieldset>
      <div className="row">
        <label>Add your own<input value={extra} onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && extra.trim() && (e.preventDefault(), add())} /></label>
        <button type="button" className="btn" onClick={add}>Add</button>
      </div>
      <label>What are you stuck on? <small>optional. Only booths you allow can see it.</small><input value={draft.stuckOn ?? ''} onChange={(e) => set({ stuckOn: e.target.value })} placeholder="Tracing across 200 services" /></label>
    </>
  )
}

function Sharing({ draft, set }: Step) {
  const [problem, setProblem] = useState<string>()
  const [cam, setCam] = useState(false)
  const shoot = useRef<HTMLButtonElement>(null)
  const close = (why?: string) => { setCam(false); setProblem(why); setTimeout(() => shoot.current?.focus()) }
  return (
    <>
      <fieldset>
        <legend>Selfie <small>optional. Only people you share with see it.</small></legend>
        {cam ? <Camera onPhoto={(photo) => { set({ photo }); close() }} onClose={close} /> : (
          <div className="row">
            {draft.photo && <img className="selfie" src={draft.photo} alt="Your selfie" />}
            <button ref={shoot} type="button" className="btn primary" onClick={() => { setProblem(undefined); setCam(true) }}>{draft.photo ? 'Retake photo' : 'Take photo'}</button>
            {draft.photo && <button type="button" className="btn" onClick={() => set({ photo: '' })}>Remove</button>}
          </div>
        )}
        <Problem error={problem} />
        <label>Choose a picture instead<input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && resize(e.target.files[0]).then((photo) => set({ photo }), () => setProblem('That picture did not load. Try another.'))} /></label>
      </fieldset>
      <p className="note">People you meet see a silhouette and what you have in common. <strong>Share</strong> hands over only what you tick here, plus your selfie. Email means your real address. <strong>Unshare</strong> removes it from Confer for that person; it cannot recall a copy they already made.</p>
      <label>Email<input type="email" autoComplete="email" value={draft.contact.email ?? ''} onChange={(e) => set({ contact: { ...draft.contact, email: e.target.value } })} /></label>
      <label>LinkedIn <small>optional</small><input value={draft.contact.linkedin ?? ''} onChange={(e) => set({ contact: { ...draft.contact, linkedin: e.target.value } })} /></label>
      <label>GitHub <small>optional</small><input value={draft.contact.github ?? ''} onChange={(e) => set({ contact: { ...draft.contact, github: e.target.value } })} /></label>
      <FieldPicker legend="Share hands over" value={draft.shareFields} onChange={(shareFields) => set({ shareFields })} />
      <fieldset className="checks">
        <legend>Booths</legend>
        <label><input type="checkbox" checked={draft.openToBooths} onChange={(e) => set({ openToBooths: e.target.checked })} /> Matching booths may send me a request (they see a silhouette, not my name)</label>
        <label><input type="checkbox" checked={draft.boothsSeeName} onChange={(e) => set({ boothsSeeName: e.target.checked })} /> Booths may see my first name</label>
        <label><input type="checkbox" checked={draft.discoverable} onChange={(e) => set({ discoverable: e.target.checked })} /> Suggest me to other attendees</label>
      </fieldset>
      <fieldset className="checks">
        <legend>Share automatically?</legend>
        {([['off', 'Never. I decide each time'], ['starred', 'With booths I starred'], ['matching', 'With booths that share 2+ topics with me']] as [AutoShare, string][]).map(([v, text]) => (
          <label key={v}><input type="radio" name="auto" checked={draft.autoShare === v} onChange={() => set({ autoShare: v })} /> {text}</label>
        ))}
      </fieldset>
    </>
  )
}

const steps = [['You', You], ['Interests', Interests], ['Sharing and selfie', Sharing]] as const

/** The whole idea in three lines: shown before sign-up and beside the phones on Stage. */
export const How = () => (
  <ol className="how">
    <li><b>Scan a badge.</b> You both see a silhouette and what you have in common.</li>
    <li><b>Tap Share</b> when you want to. Your card and photo go to that one person.</li>
    <li><b>Unshare any time.</b> Confer deletes their copy and gives you a receipt.</li>
  </ol>
)

export function Onboarding({ session, onToken, stage }: { session: Session; onToken: (token: string) => void; stage?: boolean }) {
  const [draft, setDraft] = useState(blank)
  const [badge, setBadge] = useState('')
  const [busy, setBusy] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const [step, setStep] = useState(0)
  const [problem, setProblem] = useState<string>()
  const [title, Fields] = steps[step]
  const Main = stage ? 'div' : 'main'
  useEffect(() => { if (step) heading.current?.focus() }, [step])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (step === 0 && badge.trim() && !(/^\d+$/.test(badge.trim()) && Number(badge) <= 586)) return setProblem('Badge numbers go from 0 to 586.')
    if (step === 1 && draft.interests.length < 3) return setProblem('Pick at least 3 topics so we can find what you have in common.')
    setProblem(undefined)
    if (step < 2) return setStep(step + 1)
    setBusy(true)
    // A badge that is already taken goes back to the badge field; everything typed stays.
    call(session, 'POST /api/me/signup', { body: { ...draft, ...(badge.trim() && { tagId: Number(badge) }) } }).then((r) => onToken(r.token), (err: Error) => { setBusy(false); if (err.message.startsWith('Badge')) setStep(0); setProblem(err.message) })
  }
  return (
    <Main className="screen onboarding">
      <Scenery className="band" />
      {step === 0 && !stage && (
        <header className="hero">
          <p className="wordmark">Confer</p>
          <h1>The front of your badge says hi. <em>Only you say yes.</em></h1>
          <How />
        </header>
      )}
      {(step > 0 || stage) && <h1 ref={heading} tabIndex={-1} className="sr">Sign up, step {step + 1} of 3: {title}</h1>}
      <form onSubmit={submit} className="paper">
        <p className="steps"><span className="sr">Step {step + 1} of 3. </span>{steps.map(([s], i) => <span key={s} aria-current={i === step ? 'step' : undefined}>{i + 1}. {s}</span>)}</p>
        <h2>{title}</h2>
        <Fields draft={draft} set={(patch) => setDraft((d) => ({ ...d, ...patch }))}>
          <label>Badge number <small>On the badge you were handed. Leave empty to get one.</small><input inputMode="numeric" pattern="[0-9]*" value={badge} onChange={(e) => setBadge(e.target.value)} aria-invalid={!!problem || undefined} /></label>
          <Problem error={problem} />
        </Fields>
        {step > 0 && <Problem error={problem} />}
        <div className="row end">
          {step > 0 && <button type="button" className="btn" onClick={() => setStep(step - 1)}>Back</button>}
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Getting your badge…' : step < 2 ? 'Next' : 'Get my badge'}</button>
        </div>
      </form>
      <section className="demo-in" aria-label="Demo sign-in">
        <h2>{isMock ? 'Or try a demo person' : 'Demo sign-in'}</h2>
        <div className="row">{Object.values(personas).map(([name, token]) => <button type="button" key={token} className="btn" onClick={() => onToken(token)}>{name}</button>)}</div>
      </section>
    </Main>
  )
}

export function MeScreen() {
  const { session, me, setMe, say, signOut, go } = useApp()
  const { id: _id, tagId: _tag, kind: _kind, starred: _starred, hasPhoto: _has, ...profile } = me // the API takes the profile, not the ids
  const [draft, setDraft] = useState<Draft>(profile)
  const [saved, setSaved] = useState(false)
  const act = useAct()
  const set = (patch: Partial<Draft>) => { setSaved(false); setDraft((d) => ({ ...d, ...patch })) }
  const save = (e: FormEvent) => {
    e.preventDefault()
    act.run(() => call(session, 'PATCH /api/me', { body: draft }).then((r) => { setMe(r.me); setSaved(true); say('Saved.') }))
  }
  return (
    <>
      <h1 tabIndex={-1}>Me</h1>
      <div className="badge mine">
        <span className="strap" aria-hidden /><span className="slot" aria-hidden />
        <p className="hello">Hi, I'm <b>{me.displayName}</b> {me.pronouns && <small>{me.pronouns}</small>}</p>
        <div className="tag"><TagSvg id={me.tagId} size={248} /></div>
        <p className="muted">Badge {me.tagId}. Hold this up to be scanned. It shows no personal details.</p>
        <p className="seen"><Silhouette id={me.id} label="Your silhouette" /><span>This is all anyone sees of you until you tap Share.</span></p>
        <button type="button" className="btn" onClick={() => go('print')}>Printable badge sheet</button>
      </div>
      <form onSubmit={save} className="paper settings">
        {steps.map(([title, Fields]) => <details key={title}><summary>{title}</summary><Fields draft={draft} set={set} /></details>)}
        <Problem error={act.error && `Could not save. ${act.error}`} retry={act.retry} />
        <div className="row end">{saved && !act.busy && <b><span aria-hidden>✓</span> Saved</b>}<button type="submit" className="btn primary" disabled={act.busy}>{act.busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>
      <button type="button" className="btn" onClick={signOut}>Sign out</button>
    </>
  )
}

export function PrintScreen({ me }: { me: Me }) {
  const { go } = useApp()
  return (
    <>
      <h1 tabIndex={-1}>Printable badges</h1>
      <div className="row"><button type="button" className="btn primary" onClick={() => print()}>Print</button><button type="button" className="btn" onClick={() => go('me')}>Back</button></div>
      <BadgeSheet ids={[me.tagId]} />
    </>
  )
}
