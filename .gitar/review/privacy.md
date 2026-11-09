# Privacy review (this product's core promise)

Attendee data travels in three envelopes. Review every change against them:

| Envelope | Fields | Who may see it |
|---|---|---|
| Badge | displayName, pronouns, approach, commPref | anyone who scans |
| Interests | role, interests, lookingFor, about | only audiences listed in `interestsVisibleTo` |
| Contact | email, linkedin, github (index `vault`) | the owner; peers after a mutual catch; sponsors only for fields in a `granted` consent request |

Treat these as **Critical** findings:
- A code path that returns or logs `vault` data without the check above, or without writing a `receipts` doc.
- PII (names, email, handles, free text from profiles) in logs, span attributes, metric attributes, error messages, or LLM prompts that are traced. Telemetry goes to a third party.
- `tokenHash` reaching a client.
- Sponsor-facing aggregates that include attendees who did not share interests with sponsors.
- Silence turning into consent: unanswered requests must expire and be deleted, never auto-granted.
