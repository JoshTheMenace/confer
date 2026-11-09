import { type FormEvent, useEffect, useRef, useState } from 'react'
import type { Receipt } from '../../../api/src/contract'
import { call } from '../api'
import { AttachmentCard, ContactCard, Icon, listFields, nameOf, Portrait, Problem, ReceiptSlip, Stamp, time, useAct, useApp, usePoll, Why, who } from '../ui'

/** A text chat with one person or booth. It reveals nothing by itself: Share is its own button, up in the header. */
export function ChatScreen({ id }: { id: string }) {
  const { session, me, say, go } = useApp()
  const { data, error } = usePoll(() => call(session, 'GET /api/chats/:id', { params: { id } }), [session.token, id])
  const [text, setText] = useState('')
  const [receipt, setReceipt] = useState<Receipt>()
  const write = useAct(), card = useAct()
  const end = useRef<HTMLLIElement>(null)
  const count = data?.messages.length ?? 0
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [count])
  if (!data) return <><h1 tabIndex={-1}>Chat</h1><Problem error={error} /><button type="button" className="btn" onClick={() => go('inbox')}>Back to Inbox</button></>
  const { thread: t, messages } = data, them = t.with, name = nameOf(them)
  const asked = t.status !== 'open' && t.startedBy === 'them', waiting = t.status !== 'open' && t.startedBy === 'me'
  const send = (e: FormEvent) => {
    e.preventDefault()
    write.run(() => call(session, 'POST /api/chats/:id', { params: { id }, body: { text: text.trim() } }).then(() => { setText(''); say('Sent.') }))
  }
  const answer = (action: 'ignore' | 'mute', said: string) => write.run(() => call(session, 'POST /api/chats/:id/answer', { params: { id }, body: { action } }).then(() => { say(said); go('inbox') }))
  // Sharing from an unanswered request goes through its answer, which works even for someone you never scanned.
  const share = () => { setReceipt(undefined); card.run(() => (asked ? call(session, 'POST /api/chats/:id/answer', { params: { id }, body: { action: 'share' } }) : call(session, 'POST /api/people/:id/share', { params: { id }, body: {} })).then(() => say(`Shared your card with ${name}.`))) }
  const unshare = () => card.run(() => call(session, 'DELETE /api/people/:id/share', { params: { id } }).then((r) => { setReceipt(r.receipt); say(`Unshared. ${name}'s copy in Confer is deleted.`) }))
  return (
    <>
      <button type="button" className="btn back" onClick={() => go('inbox')}><Icon name="back" /> Inbox</button>
      <header className="paper chathead">
        <div className="who">
          <Portrait card={them} size="sm" />
          <div>
            <h1 tabIndex={-1}>{who(them)}</h1>
            <small>{them.theyShared ? 'Shared their card with you' : them.kind === 'sponsor' ? 'Booth' : 'A silhouette until they share'}</small>
          </div>
          {them.theyShared && <Stamp>Shared with you</Stamp>}
        </div>
        {them.theyShared && <ContactCard they={them.theyShared} />}
        <Why common={t.why} />
        {them.iShared ? (
          <div className="row had"><p><b><span aria-hidden>✓</span> {name} has your card</b><br /><small>{listFields(them.iShared.fields)}</small></p><button type="button" className="btn" disabled={card.busy} onClick={unshare}>{card.busy ? 'Unsharing…' : 'Unshare'}</button></div>
        ) : (
          <div className="row had"><small>Chatting shares nothing. Share hands over {listFields(me.shareFields)}{me.hasPhoto && ' and your photo'}.</small><button type="button" className="btn primary" disabled={card.busy} onClick={share}>{card.busy ? 'Sharing…' : 'Share my card'}</button></div>
        )}
        <Problem error={card.error} retry={card.retry} />
        {receipt && !them.iShared && <ReceiptSlip receipt={receipt} name={name} />}
      </header>
      {t.attachment && <AttachmentCard attachment={t.attachment} />}
      <Problem error={error} />
      <ol className="messages" role="log" aria-live="polite" aria-label={`Messages with ${name}`}>
        {messages.map((m) => (
          <li key={m.id} className={`msg ${m.from}`}><small>{m.from === 'me' ? 'You' : name} · {time(m.at)}</small><p>{m.text}</p></li>
        ))}
        <li ref={end} aria-hidden />
      </ol>
      {waiting ? <p className="note">Request sent. You can write again when {name} answers.</p> : (
        <form className="paper send" onSubmit={send}>
          <div className="row">
            <label>{asked ? `Reply to ${name}` : `Message ${name}`}<input required maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={asked ? 'Replying opens the chat' : 'Write a message'} /></label>
            <button type="submit" className="btn primary" disabled={write.busy || !text.trim()}>{write.busy ? 'Sending…' : 'Send'}</button>
          </div>
          <Problem error={write.error} retry={write.retry} />
          {asked && (
            <div className="row">
              <small>Replying opens the chat. It does not share your card.</small>
              <button type="button" className="btn" disabled={write.busy} onClick={() => answer('ignore', 'Ignored. They are not told.')}>Ignore</button>
              <button type="button" className="btn" disabled={write.busy} onClick={() => answer('mute', `Muted ${name}.`)}>Mute</button>
            </div>
          )}
        </form>
      )}
    </>
  )
}
