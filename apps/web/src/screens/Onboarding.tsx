import { type FormEvent, useState } from 'react'
import { type Api, type Approach, type AutoShare, type Persona, call, param, personas } from '../api'
import { Silhouette } from '../Silhouette'
import { Icon, approaches, resizePhoto } from '../ui'

type Form = Api['POST /api/me/signup']['body']
const suggestions = ['OpenTelemetry', 'Kubernetes', 'Rust', 'Platform engineering', 'Incident response', 'Accessibility', 'Search', 'Postgres', 'eBPF', 'Design systems', 'SLOs', 'Vector databases']
export const autoShares: Record<AutoShare, string> = { off: 'Never. I decide each time', starred: 'Booths I starred', matching: 'Booths with 2 or more things in common' }
const steps = ['You', 'Interests', 'Sharing']

export function Onboarding({ onToken }: { onToken: (token: string) => void }) {
  const [step, setStep] = useState(Number(param('step') ?? 0))
  const [form, setForm] = useState<Form>({ displayName: '', approach: 'open', interests: [], lookingFor: [], discoverable: true, openToBooths: true, boothsSeeName: false, autoShare: 'off', shareFields: ['email'], contact: {} })
  const [tag, setTag] = useState('')
  const [error, setError] = useState<string>()
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))
  const toggle = (t: string) => set({ interests: form.interests.includes(t) ? form.interests.filter((x) => x !== t) : [...form.interests, t].slice(0, 8) })
  const ready = [!!form.displayName.trim(), form.interests.length >= 3, true][step]

  const next = (e: FormEvent) => {
    e.preventDefault()
    if (step < 2) return setStep(step + 1)
    const shareFields = form.shareFields.filter((f) => form.contact[f])
    call(null, 'POST /api/me/signup', { body: { ...form, shareFields } }).then((r) => onToken(r.token), (err: Error) => setError(err.message))
  }

  return (
    <form className="onboard" onSubmit={next}>
      <ol className="steps" aria-label="Progress">{steps.map((s, i) => <li key={s} aria-current={i === step ? 'step' : undefined}>{s}</li>)}</ol>
      {step === 0 && (
        <>
          <div className="pitch">
            <span className="mini"><Silhouette id="you" /></span>
            <h1>The front of your badge says hi. <em>Only you say yes.</em></h1>
          </div>
          <ul className="promises">
            <li><Icon name="people" />People you meet see a silhouette and what you have in common.</li>
            <li><Icon name="lock" />Your photo and contact move only when you tap Share.</li>
            <li><Icon name="undo" />Unshare takes them back, with a receipt.</li>
          </ul>
          <label>First name or nickname<input required autoComplete="given-name" value={form.displayName} onChange={(e) => set({ displayName: e.target.value })} /></label>
          <label>Pronouns (optional)<input value={form.pronouns ?? ''} onChange={(e) => set({ pronouns: e.target.value })} placeholder="they/them" /></label>
          <fieldset className="choices">
            <legend>How should people approach you?</legend>
            {(Object.keys(approaches) as Approach[]).map((a) => (
              <label key={a} data-approach={a}><input type="radio" name="approach" checked={form.approach === a} onChange={() => set({ approach: a })} /><Icon name={approaches[a].icon} /><span>{approaches[a].label}<small>{approaches[a].hint}</small></span></label>
            ))}
          </fieldset>
          <label>Anything that helps a conversation? (optional)<input value={form.commPref ?? ''} onChange={(e) => set({ commPref: e.target.value })} placeholder="Quiet corners are easier for me" /></label>
        </>
      )}
      {step === 1 && (
        <>
          <h1>What are you into?</h1>
          <p className="dim">Pick 3 to 8. People only ever see the ones you have in common.</p>
          <fieldset className="tags">
            <legend>Suggestions ({form.interests.length} of 8 picked)</legend>
            {[...new Set([...suggestions, ...form.interests])].map((t) => <button type="button" key={t} className="chip" aria-pressed={form.interests.includes(t)} onClick={() => toggle(t)}>{t}</button>)}
          </fieldset>
          <div className="row">
            <label>Add your own<input value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && tag.trim()) { e.preventDefault(); toggle(tag.trim()); setTag('') } }} /></label>
            <button type="button" className="ghost" onClick={() => { if (tag.trim()) toggle(tag.trim()); setTag('') }}>Add</button>
          </div>
          <label>What are you stuck on? (optional)<input value={form.stuckOn ?? ''} onChange={(e) => set({ stuckOn: e.target.value })} placeholder="Tracing across 200 services" /><small>Only matching booths you allow can see this.</small></label>
        </>
      )}
      {step === 2 && (
        <>
          <h1>What Share hands over</h1>
          <p className="dim">Nothing below leaves your phone’s account until you tap Share on a person or a booth.</p>
          <label>Email<input type="email" autoComplete="email" value={form.contact.email ?? ''} onChange={(e) => set({ contact: { ...form.contact, email: e.target.value }, shareFields: ['email', 'linkedin', 'github'] })} /></label>
          <label>LinkedIn (optional)<input value={form.contact.linkedin ?? ''} onChange={(e) => set({ contact: { ...form.contact, linkedin: e.target.value } })} /></label>
          <label>GitHub (optional)<input value={form.contact.github ?? ''} onChange={(e) => set({ contact: { ...form.contact, github: e.target.value } })} /></label>
          <div className="row selfie">
            <span className="mini">{form.photo ? <img src={form.photo} alt="Your selfie" /> : <Silhouette id={form.displayName || 'you'} />}</span>
            <label>Selfie (optional)<input type="file" accept="image/*" capture="user" onChange={(e) => { const f = e.target.files?.[0]; if (f) void resizePhoto(f).then((photo) => set({ photo })) }} /><small>Shrunk on your phone. Seen only by people you share with.</small></label>
          </div>
          <label className="check"><input type="checkbox" checked={form.openToBooths} onChange={(e) => set({ openToBooths: e.target.checked })} />Matching booths may send me a request</label>
          <label>Share automatically with<select value={form.autoShare} onChange={(e) => set({ autoShare: e.target.value as AutoShare })}>{(Object.keys(autoShares) as AutoShare[]).map((a) => <option key={a} value={a}>{autoShares[a]}</option>)}</select></label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="row">
        {step > 0 && <button type="button" className="ghost" onClick={() => setStep(step - 1)}>Back</button>}
        <button type="submit" disabled={!ready}>{step < 2 ? 'Continue' : 'Get my badge'}</button>
      </div>
      {step === 0 && (
        <div className="row demo" role="group" aria-label="Or try a demo account">
          <span className="dim">Or try the demo as</span>
          {(Object.keys(personas) as Persona[]).map((k) => <button type="button" key={k} className="ghost" onClick={() => onToken(personas[k].token)}>{personas[k].label}</button>)}
        </div>
      )}
    </form>
  )
}
