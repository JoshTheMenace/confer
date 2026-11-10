import { useState } from 'react'
import type { Api, Thread } from '../../../api/src/contract'
import { call } from '../api'
import { AttachmentCard, listFields, Loading, nameOf, Portrait, Problem, time, useAct, useApp, Why, who } from '../ui'

type Action = Api['POST /api/chats/:id/answer']['body']['action']
const receiptWords = { shared: ['↗', 'You shared with'], opened: ['👁', 'Opened by'], exported: ['⬇', 'Exported by'], unshared: ['✂', 'You unshared from'] } as const

/** A message request: who is asking (still a silhouette), why, what you have in common, and what a booth attached. */
function RequestCard({ t }: { t: Thread }) {
  const { session, say, go } = useApp()
  const act = useAct()
  const name = nameOf(t.with)
  const answer = (action: Action, said: string) => act.run(() => call(session, 'POST /api/chats/:id/answer', { params: { id: t.id }, body: { action } }).then(() => say(said)))
  return (
    <li className="paper request">
      <header>
        <Portrait card={t.with} size="sm" />
        <div><b>{who(t.with)}</b><small>{t.source === 'scan' ? 'met you' : 'matched your topics'} · {time(t.createdAt)}</small></div>
      </header>
      <blockquote>{t.last.text}</blockquote>
      <Why common={t.why} />
      {t.attachment && <AttachmentCard attachment={t.attachment} />}
      <Problem error={act.error} retry={act.retry} />
      <div className="row">
        <button type="button" className="btn primary" onClick={() => go(`inbox/${t.id}`)}>Reply</button>
        <button type="button" className="btn yellow" disabled={act.busy} onClick={() => answer('share', `Connected with ${name}.`)}>Connect</button>
        <button type="button" className="btn" disabled={act.busy} onClick={() => answer('ignore', 'Ignored. They are not told.')}>Ignore</button>
        <button type="button" className="btn" disabled={act.busy} onClick={() => answer('mute', `Muted ${name}. They cannot message you again.`)}>Mute</button>
      </div>
    </li>
  )
}

const tabs = ['Requests', 'Chats', 'Receipts'] as const

export function InboxScreen() {
  const { inbox: { data, error }, go } = useApp()
  const [picked, setPicked] = useState<(typeof tabs)[number]>()
  const n = data?.requests.length ?? 0
  const tab = picked ?? (data && !n && data.chats.length ? 'Chats' : 'Requests')
  return (
    <>
      <h1 tabIndex={-1}>Inbox</h1>
      <p className="progress" aria-live="polite">{n ? <><b>{n}</b> {n === 1 ? 'is' : 'are'} asking. You decide.</> : data ? 'Nobody is waiting on you.' : ''}</p>
      <fieldset className="row filters"><legend className="sr">Inbox sections</legend>
        {tabs.map((t) => <button type="button" key={t} className="chip pick" aria-pressed={tab === t} onClick={() => setPicked(t)}>{t}{t === 'Requests' && ` (${n})`}</button>)}
      </fieldset>
      <Problem error={error} />
      <Loading of={{ data, error }} />
      {tab === 'Requests' && (
        <ul className="requests">
          {data?.requests.map((t) => <RequestCard key={t.id} t={t} />)}
          {data && !n && <li className="paper muted">No requests. People and booths can only ask; nobody gets your card unless you tap Connect.</li>}
        </ul>
      )}
      {tab === 'Chats' && (
        <ul className="requests">
          {data?.chats.map((t) => (
            <li key={t.id}>
              <button type="button" className="paper chatrow" onClick={() => go(`inbox/${t.id}`)}>
                <Portrait card={t.with} size="sm" />
                <span>
                  <b>{who(t.with)}</b> <small>{time(t.last.at)}</small>
                  <span className="preview">{t.last.from === 'me' ? 'You: ' : ''}{t.last.text}</span>
                  <small>{t.status === 'open' ? (t.unread ? `${t.unread} new` : 'Chat open') : 'Request sent. Waiting for an answer.'}</small>
                </span>
              </button>
            </li>
          ))}
          {data && !data.chats.length && <li className="paper muted">No chats yet. Scan a badge and tap Connect.</li>}
        </ul>
      )}
      {tab === 'Receipts' && (
        <>
          <p className="muted">Every time your card moves, you get a line here.</p>
          <ol className="slip timeline">
            {data?.receipts.map((r) => (
              <li key={r.id}>
                <span aria-hidden>{receiptWords[r.type][0]}</span>
                <span><b>{receiptWords[r.type][1]} {r.who ? who(r.who) : 'someone'}</b><br />{listFields(r.fields)} · {time(r.at)}{r.type === 'exported' && <><br /><small>Kubernetes checked your grant first</small></>}</span>
                {r.traceId && <code title="Trace id">{r.traceId.slice(0, 8)}</code>}
              </li>
            ))}
            {data && !data.receipts.length && <li>Nothing yet.</li>}
          </ol>
        </>
      )}
    </>
  )
}
