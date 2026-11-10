import { type FormEvent, type ReactNode, useState } from 'react'
import type { Card } from '../../../api/src/contract'
import { call } from '../api'
import { openers, threadState } from '../links'
import { keepCard, nameOf, Problem, useAct, useApp } from '../ui'

/** The main action on anyone you met: one line saying why. It lands as a message request; no card moves. */
export function Connect({ card, onSent }: { card: Card; onSent?: () => void }) {
  const { session, say, go } = useApp()
  const [text, setText] = useState('')
  const act = useAct()
  const name = nameOf(card), state = threadState(card)
  if (state !== 'Connect') return (
    <div className="row had">
      <p><b>{state === 'Request sent' ? `Request sent. ${name} decides.` : state === 'Reply' ? `${name} sent you a message request.` : `You and ${name} are chatting.`}</b></p>
      <button type="button" className="btn primary" onClick={() => go(`inbox/${card.id}`)}>{state === 'Request sent' ? 'Open' : state}{!!card.thread?.unread && <span className="sr"> ({card.thread.unread} new)</span>}</button>
    </div>
  )
  const send = (e: FormEvent) => {
    e.preventDefault()
    act.run(() => call(session, 'POST /api/chats/:id', { params: { id: card.id }, body: { text: text.trim() } }).then(() => { keepCard(session, { ...card, thread: { status: 'request', startedBy: 'me', unread: 0 } }); say(`Request sent to ${name}. They decide whether to answer.`); onSent?.() }))
  }
  return (
    <form className="connect" onSubmit={send}>
      <fieldset>
        <legend>Connect with {name}: say why</legend>
        <div className="openers">
          {openers(card).map((o) => <button type="button" key={o} className="opener" aria-pressed={text === o} onClick={() => setText(o)}>{o}</button>)}
        </div>
      </fieldset>
      <label>Your line <small>edit it or write your own</small>
        <textarea rows={2} required maxLength={280} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pick one above or type here" />
      </label>
      <Problem error={act.error} retry={act.retry} />
      <div className="row end">
        <small>A message request. Your card stays with you.</small>
        <button type="submit" className="btn primary" disabled={act.busy || !text.trim()}>{act.busy ? 'Sending…' : 'Send request'}</button>
      </div>
    </form>
  )
}

/** Messaging is the optional extra (loud rooms, Deaf attendees): the button opens the chat, or the composer for a first line. */
export function Message({ card, children }: { card: Card; children?: ReactNode }) {
  const { go } = useApp()
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="row">{children}<button type="button" className="btn" aria-expanded={card.thread ? undefined : open} onClick={() => (card.thread ? go(`inbox/${card.id}`) : setOpen(!open))}>Message</button></div>
      {open && !card.thread && <Connect card={card} onSent={() => setOpen(false)} />}
    </>
  )
}
