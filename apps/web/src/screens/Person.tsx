import { useEffect, useState } from 'react'
import type { ContactField, Receipt } from '../../../api/src/contract'
import { call, flag } from '../api'
import { ApproachChip, Badge, CommonList, ContactCard, FieldPicker, Icon, keepCard, keptCard, listFields, Loading, nameOf, Portrait, Problem, ReceiptSlip, Stamp, useAct, useApp, who } from '../ui'
import { Connect } from './Connect'

export function PersonScreen({ id }: { id: string }) {
  const { session, me, say, go, inbox, people: { data, error } } = useApp()
  const [fields, setFields] = useState<ContactField[]>(me.shareFields)
  const [receipt, setReceipt] = useState<Receipt>()
  const act = useAct()
  const found = data?.people.find((p) => p.id === id), kept = keptCard(session, id)
  // The list is a search that lags a write: keep the card we already have, and the request we just sent.
  const card = found && (found.thread || !kept?.thread) ? found : kept
  if (found && card === found) keepCard(session, found)
  useEffect(() => { if (flag('unshare') !== null && card?.iShared) unshare() }, [card?.iShared?.at]) // deep link: plays Unshare once
  if (!card) return <><h1 tabIndex={-1}>Person</h1><Problem error={error ?? (data && 'You have not met this person yet.')} /><Loading of={{ data, error }} /><button type="button" className="btn" onClick={() => go('people')}>Back to Recently met</button></>
  const name = nameOf(card), they = card.theyShared
  const last = [...(inbox.data?.chats ?? []), ...(inbox.data?.requests ?? [])].find((t) => t.id === id)?.last
  const share = () => { setReceipt(undefined); act.run(() => call(session, 'POST /api/people/:id/share', { params: { id }, body: { fields } }).then(() => say(`Shared your card with ${name}.`))) }
  const unshare = () => act.run(() => call(session, 'DELETE /api/people/:id/share', { params: { id } }).then((r) => { setReceipt(r.receipt); say(`Unshared. ${name}'s copy in Confer is deleted.`) }))
  return (
    <>
      <button type="button" className="btn back" onClick={() => go('people')}><Icon name="back" /> Recently met</button>
      <Badge swing className="person">
        <Portrait card={card} size="lg" />
        {they && <Stamp>Shared with you</Stamp>}
        <h1 tabIndex={-1}>{who(card)} {card.pronouns && <small>{card.pronouns}</small>}</h1>
        {they ? <>{they.role && <p className="role">{they.role}</p>}<ContactCard they={they} /></> : <p className="note">A silhouette until {name} taps Share. Nobody is judged on a photo first.</p>}
        {last &&<blockquote className="last"><small>{last.from === 'me' ? 'You' : name} wrote</small>{last.text}</blockquote>}
        <Connect card={card} />
        {card.iShared ? (
          <div className="row had">
            <p><b><span aria-hidden>✓</span> {name} has your card</b><br /><small>{listFields(card.iShared.fields)}{me.hasPhoto && ' and your photo'}</small></p>
            <button type="button" className="btn" disabled={act.busy} onClick={unshare}>{act.busy ? 'Unsharing…' : 'Unshare'}</button>
          </div>
        ) : (
          <>
            {they && !receipt && <p className="nudge"><b>{name} shared with you.</b> Share back?</p>}
            <button type="button" className={`btn big ${they ? 'primary' : ''}`} disabled={act.busy} onClick={share}>{act.busy ? 'Sharing…' : 'Share my card'}</button>
          </>
        )}
        <Problem error={act.error} retry={act.retry} />
        {receipt && !card.iShared && <ReceiptSlip receipt={receipt} name={name} />}
        <p className="row"><ApproachChip approach={card.approach} />{card.commPref && <span className="muted">Prefers: {card.commPref}</span>}</p>
      </Badge>
      <CommonList common={card.common} them={name} />
      {!card.iShared && (
        <section className="paper">
          <FieldPicker legend={`What Share hands ${name}`} value={fields} onChange={setFields} />
          <p className="muted">Email means your real address. Your selfie goes too, if you added one. Unshare removes it all from Confer for {name}; it cannot recall a copy they already made.</p>
        </section>
      )}
    </>
  )
}
