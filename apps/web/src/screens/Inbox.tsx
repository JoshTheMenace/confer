import { useState } from 'react'
import { api, call } from '../api'
import { when } from '../lib'
import { Loading, PersonCard, Problem, useLoad } from '../ui'

type Request = Awaited<ReturnType<typeof call<Awaited<ReturnType<typeof api.api.consent.$get>>>>>['requests'][number]
type Field = Request['fields'][number]

const fieldNames: Record<Field, string> = { email: 'Email', linkedin: 'LinkedIn', github: 'GitHub' }
const statusText = { pending: 'Waiting for your answer', deferred: 'You’ll decide after the event', granted: 'Shared', denied: 'Not shared' }

function RequestCard({ r }: { r: Request }) {
  const [fields, setFields] = useState<Field[]>(r.fields) // all fields until a grant narrows them
  const [shared, setShared] = useState({ status: r.status, fields: r.fields })
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const decide = async (decision: 'now' | 'later' | 'never') => {
    setSaving(true)
    try {
      const { status } = await call(api.api.consent[':id'].$post({ param: { id: r.id }, json: { decision, ...(decision === 'now' && { fields }) } }))
      setShared({ status, fields })
      setError(undefined)
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }

  return (
    <PersonCard card={r.sponsor} viewer="attendee">
      <p role="status"><strong>{saving ? 'Saving…' : statusText[shared.status]}</strong>{shared.status === 'granted' && `: ${shared.fields.map((f) => fieldNames[f]).join(', ')}`}</p>
      {(shared.status === 'pending' || shared.status === 'deferred') && <p className="hint">No answer by {when(r.expiresAt)} means no. The request is then deleted.</p>}
      <fieldset className="field">
        <legend>What to share</legend>
        {(Object.keys(fieldNames) as Field[]).map((f) => (
          <label key={f} className="check">
            <input type="checkbox" checked={fields.includes(f)} onChange={(e) => setFields(e.target.checked ? [...fields, f] : fields.filter((x) => x !== f))} />
            {fieldNames[f]}
          </label>
        ))}
      </fieldset>
      <div className="row">
        <button type="button" className="btn-primary" disabled={saving || !fields.length} onClick={() => decide('now')}>Share now</button>
        <button type="button" disabled={saving} onClick={() => decide('later')}>Decide after event</button>
        <button type="button" disabled={saving} onClick={() => decide('never')}>Never</button>
      </div>
      <Problem error={error} />
    </PersonCard>
  )
}

export function Inbox() {
  const requests = useLoad(() => call(api.api.consent.$get()))
  const receipts = useLoad(() => call(api.api.consent.receipts.$get()))
  return (
    <>
      <h1>Inbox</h1>
      <p>Sponsors who scanned you ask before seeing your contact. You can change your answer anytime.</p>
      <h2>Requests</h2>
      <Problem error={requests.error} />
      {!requests.data ? !requests.error && <Loading what="requests" /> : requests.data.requests.length
        ? requests.data.requests.map((r) => <RequestCard key={r.id} r={r} />)
        : <p className="muted">No requests. Nobody gets your contact without asking.</p>}

      <h2>Who opened your contact</h2>
      <p className="hint">Whenever someone opens your sealed envelope, you get a receipt showing exactly what they saw.</p>
      <Problem error={receipts.error} />
      {receipts.data && (receipts.data.receipts.length ? (
        <ul className="card">
          {receipts.data.receipts.map((x, i) => (
            <li key={i}><strong>{x.viewer?.badge.displayName ?? 'A deleted profile'}</strong> saw your {x.fields.map((f) => fieldNames[f]).join(', ')} · <span className="muted">{when(x.at)}</span></li>
          ))}
        </ul>
      ) : <p className="muted">No one has opened your contact yet.</p>)}
    </>
  )
}
