import { type FormEvent, type InputHTMLAttributes, useState } from 'react'
import { api, call, setToken, type Me } from '../api'
import { approaches, splitList, type Approach } from '../lib'
import { Envelopes, Problem } from '../ui'

const Field = ({ label, hint, ...input }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) => (
  <label className="field">{label}{hint && <small>{hint}</small>}<input name={label} {...input} /></label>
)
const Check = ({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) => (
  <label className="check"><input type="checkbox" name={name} defaultChecked={defaultChecked} />{label}</label>
)

export function Onboarding({ onDone }: { onDone: (me: Me) => void }) {
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const run = async (work: () => Promise<Me>) => {
    setBusy(true)
    setError(undefined)
    try { onDone(await work()) } catch (e) { setError((e as Error).message); setBusy(false) }
  }

  const signup = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    const opt = (k: string) => s(k) || undefined
    void run(async () => {
      const { token, me } = await call(api.api.me.signup.$post({ json: {
        displayName: s('Display name'), pronouns: opt('Pronouns'), approach: s('approach') as Approach, commPref: opt('How to communicate with me'),
        role: opt('Role'), interests: splitList(s('Interests')), lookingFor: splitList(s('Looking for')), about: opt('About me'),
        interestsVisibleTo: (['peers', 'sponsors'] as const).filter((k) => f.has(k)), discoverable: f.has('discoverable'),
        contact: { email: opt('Email'), linkedin: opt('LinkedIn'), github: opt('GitHub') }, sponsorCode: opt('Sponsor code'),
      } }))
      setToken(token)
      return { ...me, kind: me.kind as Me['kind'] } // the API's literal widens to string in transit
    })
  }

  const signin = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setToken(String(new FormData(e.currentTarget).get('token')).trim())
    void run(() => call(api.api.me.$get()).then((r) => r.me, () => {
      setToken('')
      throw new Error('That token didn’t match a badge.')
    }))
  }

  return (
    <>
      <h1>Meet people on your terms</h1>
      <p>Scan badges to catch the people you meet. Your details travel in three envelopes:</p>
      <Envelopes />
      <form onSubmit={signup} aria-describedby="signup-note">
        <fieldset className="env green">
          <legend>🟢 Badge · everyone sees this</legend>
          <Field label="Display name" required maxLength={60} autoComplete="nickname" />
          <Field label="Pronouns" hint="Optional, e.g. she/her, they/them" maxLength={30} />
          <fieldset className="field">
            <legend>How should people approach you?</legend>
            <div className="options">
              {(Object.entries(approaches) as [Approach, (typeof approaches)[Approach]][]).map(([k, a], i) => (
                <label key={k} className="option">
                  <input type="radio" name="approach" value={k} defaultChecked={i === 0} required />
                  <span><span aria-hidden>{a.icon} </span>{a.label}<br /><small className="hint">{a.hint}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="How to communicate with me" hint="Optional, e.g. “I’m Deaf, text me”" maxLength={140} />
        </fieldset>

        <fieldset className="env yellow">
          <legend>🟡 Interests · you choose who sees this</legend>
          <Field label="Role" hint="Optional" maxLength={80} />
          <Field label="Interests" hint="Separate with commas, e.g. OpenTelemetry, Kubernetes" />
          <Field label="Looking for" hint="Separate with commas, e.g. mentoring, collaborators" />
          <label className="field">About me<small>Optional, a sentence or two</small><textarea name="About me" rows={3} maxLength={1000} /></label>
          <fieldset>
            <legend>Who can see your interests?</legend>
            <Check label="People I meet" name="peers" defaultChecked />
            <Check label="Sponsors" name="sponsors" />
          </fieldset>
          <Check label="Suggest me in other people’s matches" name="discoverable" defaultChecked />
        </fieldset>

        <fieldset className="env red">
          <legend>🔴 Contact · sealed</legend>
          <p className="hint">Opens for a person only when you both catch each other. Sponsors must ask, and you decide.</p>
          <Field label="Email" type="email" autoComplete="email" />
          <Field label="LinkedIn" hint="Profile URL or username" />
          <Field label="GitHub" hint="Username" autoComplete="username" />
        </fieldset>

        <details>
          <summary>I’m a sponsor</summary>
          <Field label="Sponsor code" hint="From the event organizers" autoComplete="off" />
        </details>
        <Problem error={error} />
        <p id="signup-note" className="hint">You can change all of this later.</p>
        <button className="btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>Get my badge</button>
      </form>

      <details style={{ marginTop: 24 }}>
        <summary>Already have a badge? Sign in</summary>
        <form onSubmit={signin} className="row" style={{ alignItems: 'end' }}>
          <label className="field" style={{ flex: 1 }}>Sign-in token<input name="token" required autoComplete="off" /></label>
          <button type="submit" disabled={busy}>Sign in</button>
        </form>
      </details>
    </>
  )
}
