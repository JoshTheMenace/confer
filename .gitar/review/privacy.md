# Privacy review (this product's core promise)

Everyone you meet sees a silhouette and what you have in common. Contact and photo move only on Share. Review every change against these rules (full brief: `docs/design.md`):

| Data | Fields | Who may receive it |
|---|---|---|
| Badge | first name, pronouns, approach, communication preference | anyone who scans; a booth gets `name: null` unless `boothsSeeName` or the person shared |
| Things in common | `common` (same or related tags), frozen at first scan | the other person in that meeting |
| Topics | `interests`, `role`, `about`, `stuckOn` | the owner; booths (anonymous). **Never another attendee.** |
| Sealed envelope | email, linkedin, github, photo (index `ix.vault`) | the owner; someone the owner has an active share to (`ix.shares`, doc `from_to`) |

Treat these as **Critical** findings:
- A code path that sends an attendee's full `interests`, `role`, `about` or `stuckOn` to another attendee, or recomputes `common` after the first scan (that lets someone probe by editing their own tags).
- A read of `ix.vault` that is not for the owner or backed by an existing share, or that does not write a receipt.
- Unshare that leaves the contact or photo reachable (the share doc must be gone, and a deletion receipt written).
- A booth receiving a name without `boothsSeeName` or a share; booth or organizer totals that are not anonymous.
- PII (names, email, handles, photos, free text from profiles, request notes) in logs, span attributes, metric attributes, RUM events or error messages. Telemetry goes to a third party.
- `tokenHash` reaching a client.
- Silence turning into consent: an unanswered request never becomes a share (auto-share happens only under a rule the attendee turned on).
