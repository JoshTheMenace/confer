import { type FormEvent, useState } from 'react'
import { call } from '../api'
import { listFields, Problem, useApp } from '../ui'

export function BoothScreen() {
  const { session, me, setMe, say, signOut } = useApp()
  const [topics, setTopics] = useState(me.interests.join(', '))
  const [pitch, setPitch] = useState(me.pitch ?? '')
  const [label, setLabel] = useState(me.attachment?.label ?? '')
  const [url, setUrl] = useState(me.attachment?.url ?? '')
  const [problem, setProblem] = useState<string>()
  const save = (e: FormEvent) => {
    e.preventDefault()
    call(session, 'PATCH /api/me', { body: { interests: topics.split(',').map((t) => t.trim()).filter(Boolean), pitch, attachment: url ? { url, label: label || url } : undefined } })
      .then((r) => { setMe(r.me); say('Booth saved.') }, (err: Error) => setProblem(err.message))
  }
  return (
    <>
      <h1 tabIndex={-1}>{me.displayName} booth</h1>
      <form className="paper" onSubmit={save}>
        <label>Topics your products cover <small>comma separated</small><input value={topics} onChange={(e) => setTopics(e.target.value)} /></label>
        <label>Default note on a request<textarea rows={3} value={pitch} onChange={(e) => setPitch(e.target.value)} /></label>
        <label>Attachment name<input value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label>Attachment link<input type="url" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        <Problem error={problem} />
        <div className="row end"><button type="submit" className="btn primary">Save booth</button></div>
      </form>
      <p className="note">You see topics and fit, never a name, until a person shares: {listFields(me.shareFields)} is what you hand over in return.</p>
      <button type="button" className="btn" onClick={signOut}>Sign out</button>
    </>
  )
}
