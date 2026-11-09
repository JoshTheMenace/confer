import { useState, type FormEvent } from 'react'
import { call, type Approach, type AutoShare, type ContactField } from '../api'
import { silhouetteUrl } from '../Silhouette'
import { approaches, FieldPicker, param, resizePhoto, Tag } from '../ui'

const suggestions = ['OpenTelemetry', 'Kubernetes', 'Rust', 'Distributed tracing', 'Vector search', 'RAG', 'Platform engineering', 'eBPF', 'Go', 'Accessibility', 'WebAssembly', 'Elasticsearch']
const steps = ['You', 'Interests', 'Sharing']

export function Onboarding({ slot, onDone }: { slot: string; onDone: (token: string) => void }) {
  const [step, setStep] = useState(Number(param('step') ?? 0))
  const [f, setF] = useState({ displayName: '', pronouns: '', approach: 'open' as Approach, commPref: '', interests: [] as string[], stuckOn: '', email: '', linkedin: '', shareFields: ['email'] as ContactField[], photo: '', openToBooths: true, autoShare: 'off' as AutoShare })
  const [extra, setExtra] = useState('')
  const [error, setError] = useState('')
  const set = (patch: Partial<typeof f>) => setF((old) => ({ ...old, ...patch }))
  const toggle = (t: string) => set({ interests: f.interests.includes(t) ? f.interests.filter((x) => x !== t) : [...f.interests, t].slice(0, 8) })

  async function next(e: FormEvent) {
    e.preventDefault()
    if (step === 2 && f.interests.length < 3) return setError('Pick at least 3 so we can find things in common.')
    setError('')
    if (step < 3) return setStep(step + 1)
    const { email, linkedin, ...profile } = f
    try {
      const { token } = await call({ slot, token: null }, 'POST /api/me/signup', { body: { ...profile, photo: f.photo || undefined, contact: { email, linkedin: linkedin || undefined }, lookingFor: [], discoverable: true, boothsSeeName: false } })
      onDone(token)
    } catch (err) { setError((err as Error).message) }
  }

  if (step === 0) return (
    <main className="intro">
      <p className="wordmark">Confer</p>
      <h1>The front of your badge says hi. <b>Only you say yes.</b></h1>
      <ol>
        <li><img src={silhouetteUrl('intro-1')} alt="" /><span><b>They scan your badge.</b> They see a silhouette, your first name and what you have in common. Nothing else.</span></li>
        <li><img src={silhouetteUrl('intro-5')} alt="" /><span><b>You tap Share.</b> Only then do they get your contact card and photo.</span></li>
        <li><img src={silhouetteUrl('intro-9')} alt="" /><span><b>Changed your mind?</b> Unshare takes it back and gives you a receipt.</span></li>
      </ol>
      <button className="big" onClick={() => setStep(1)}>Set up my badge</button>
      <p className="muted">Three short steps. About 90 seconds.</p>
    </main>
  )

  return (
    <main>
      <form className="onboard" onSubmit={next}>
        <header className="masthead yellow">
          <p className="steps" aria-label={`Step ${step} of 3`}>{steps.map((s, i) => <span key={s} aria-current={i + 1 === step ? 'step' : undefined}>{i + 1} {s}</span>)}</p>
          <h1 tabIndex={-1}>{['', 'Who are you?', 'What are you into?', 'What does Share hand over?'][step]}</h1>
        </header>
        <div className="body">
          {step === 1 && <>
            <label>First name or nickname<input required autoComplete="given-name" value={f.displayName} onChange={(e) => set({ displayName: e.target.value })} /></label>
            <label>Pronouns (optional)<input value={f.pronouns} onChange={(e) => set({ pronouns: e.target.value })} placeholder="she/her, they/them…" /></label>
            <fieldset className="radios">
              <legend>How should people approach you?</legend>
              {(Object.keys(approaches) as Approach[]).map((a) => (
                <label key={a}><input type="radio" name="approach" checked={f.approach === a} onChange={() => set({ approach: a })} /><span><b>{approaches[a].label}</b> {approaches[a].hint}</span></label>
              ))}
            </fieldset>
            <label>Best way to talk with you (optional)<input value={f.commPref} onChange={(e) => set({ commPref: e.target.value })} placeholder="Text beats calls" /></label>
          </>}
          {step === 2 && <>
            <fieldset className="picks">
              <legend>Pick 3 to 8. People only ever see the ones you share with them. ({f.interests.length} picked)</legend>
              {[...new Set([...suggestions, ...f.interests])].map((t) => <button type="button" key={t} aria-pressed={f.interests.includes(t)} onClick={() => toggle(t)}><Tag label={t} /></button>)}
            </fieldset>
            <div className="row">
              <label>Add your own<input value={extra} onChange={(e) => setExtra(e.target.value)} /></label>
              <button type="button" className="ghost" onClick={() => { if (extra.trim()) toggle(extra.trim()); setExtra('') }}>Add</button>
            </div>
            <label>What are you stuck on? (optional)<input value={f.stuckOn} onChange={(e) => set({ stuckOn: e.target.value })} placeholder="Tracing across 200 services" /></label>
          </>}
          {step === 3 && <>
            <p>Share hands over the card below. Nobody gets it until you tap Share on them, and Unshare takes it back.</p>
            <label>Email<input type="email" required autoComplete="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></label>
            <label>LinkedIn name (optional)<input value={f.linkedin} onChange={(e) => set({ linkedin: e.target.value })} /></label>
            <FieldPicker legend="Share hands over" value={f.shareFields} onChange={(shareFields) => set({ shareFields })} />
            <label>Selfie (optional). Only people you share with see it.
              <input type="file" accept="image/*" capture="user" onChange={async (e) => e.target.files?.[0] && set({ photo: await resizePhoto(e.target.files[0]) })} />
            </label>
            {f.photo && <img className="selfie" src={f.photo} alt="Your selfie" />}
            <label className="check"><input type="checkbox" checked={f.openToBooths} onChange={(e) => set({ openToBooths: e.target.checked })} />Booths that match my interests may send me a request. They see no name.</label>
            <label>Share with booths automatically
              <select value={f.autoShare} onChange={(e) => set({ autoShare: e.target.value as AutoShare })}>
                <option value="off">Never. I decide each time</option>
                <option value="starred">Booths I star</option>
                <option value="matching">Booths with 2+ things in common</option>
              </select>
            </label>
          </>}
          {error && <p role="alert" className="error">{error}</p>}
          <div className="row">
            <button type="button" className="ghost" onClick={() => setStep(step - 1)}>Back</button>
            <button className="big">{step < 3 ? 'Next' : 'Make my badge'}</button>
          </div>
        </div>
      </form>
    </main>
  )
}
