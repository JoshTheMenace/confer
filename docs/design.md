# Confer: product direction and build plan

*2026-11-09. This is the brief every contributor (human or agent) builds from. The contract is `apps/api/src/contract.ts`.*

## One line

**The front of your badge says hi. Only you say yes.** Everyone you meet sees a silhouette and what you have in common. Your contact card and photo move only when you tap Share, and Unshare takes them back.

## What changed from v1 (the "Silhouette" model)

| v1 | Now |
|---|---|
| Scan shows name, role, full interests | Scan shows first name, a **silhouette**, and **things in common** (never the full list) |
| Contact opens on a mutual scan | **One-way Share**, any time, by either person; "Share back?" nudge; **Unshare** with a deletion receipt |
| No photo | Optional selfie, seen only by people you shared with, deleted after the event |
| Nobody says why they want your details | **Connection requests are the center of the app.** Anyone, a person or a booth, asks with a short note that says why. You see who is asking (a silhouette), why, and what you have in common, then pick **Share / Ignore / Mute** |
| Booth scan creates a blanket consent request | Booth sees interests and fit, **no name**; its request carries a note **and an attachment** you get either way |
| Only the scanner keeps the meeting | Meeting lands in **both** people's list: that list is also the "who scanned me" log |
| Exact tag overlap | Things in common = same tags **plus related tags** found with Elastic embeddings ("Tracing" ↔ "OpenTelemetry") |

Deferred to the roadmap (say so honestly, do not fake): private forwarding email addresses, the evening digest email, badge reissue. There is no limit on requests or messages; people Mute instead.

## Why sponsors want this (the open risk, answered)

1. **Leads that said yes, with the note that won them.** A booth's lead list is only people who chose to share, each with a fit score.
2. **Reach beyond the booth.** Attendees who opt in ("matching booths may reach out") show up as anonymous prospects ranked by hybrid search against the booth's topics and the attendee's "what I'm stuck on" line. Booths reach the right people who never walked past.
3. **Content reaches every scan.** The attachment is delivered whether or not the person shares.
4. **Pitch analytics.** Share rate per note: booths learn which pitch works. Organizers see share rate and mutes per booth.
5. **Auto-share.** Attendees can pre-approve starred or matching booths, so the best-fit leads arrive instantly.

## Privacy rules (reviewers: treat violations as critical)

- A peer never receives another attendee's full `interests`, `role`, `about` or `stuckOn`: only `common`, frozen at first scan. Interest edits are capped (5 per account) so nobody can probe by cycling tags.
- Searching for people only ever queries topic tags (`peer_semantic`), and only for attendees who turned on `discoverable`. What someone wrote about themselves or is stuck on is matched for booths and talks, never for another attendee's search.
- A booth never receives a name unless `boothsSeeName` or the person shared. Booth totals are anonymous.
- Contact and photo live in the `vault` index and are read only through an existing share (or by the owner). Every share, read and unshare writes a receipt carrying the trace id.
- No PII in logs, span attributes, metric attributes or RUM events. Ids, kinds and counts only.

## The five-minute demo (everything is built for this)

Presented from a laptop on **Stage mode** (`#/stage`): two live phones side by side plus a live pulse strip, so the room sees cause and effect at once. Real phones join over HTTPS if the network allows; the laptop webcam scans a paper AprilTag.

| Time | Beat | What the room sees |
|---|---|---|
| 0:00 | Hook | "Every badge scan today puts your email on a lead list." Paper badge held up. |
| 0:20 | Meet | Left phone scans the badge. A silhouette springs up: first name, "3 things in common", one marked *related*. The other person touched nothing. |
| 0:50 | Connect | Left phone taps Connect and sends one line on why. The right phone's inbox shows who is asking, why, and what they have in common. |
| 1:10 | Share | Right phone taps Share. On the left, the silhouette fills in with the photo and the card appears. "Share back?" Then Unshare: the photo drains back to a silhouette and a receipt prints. |
| 1:40 | Booth | Booth phone scans the badge: interests and fit, no name. Sends a note plus a benchmark guide. The attendee's inbox lights up: content delivered, Share / Ignore / Mute. They share. |
| 2:30 | Sponsor value | Booth dashboard: leads that said yes, share rate per pitch, anonymous prospects who match. |
| 3:00 | Discover | "I'm stuck on tracing across 200 services" finds talks, booths and people (keyword + semantic + rerank on Elasticsearch). |
| 3:30 | Operated, not just built | Event Pulse: live numbers ticking from the demo, health read from Dash0. Then the evidence: Agent0 found the 5-second write wait (4.8s to 1.0s); Radar's AI investigation; Gitar reviewed every PR and we pushed back with data. |
| 4:30 | Inclusion and close | Silhouettes remove appearance bias; approach and communication preferences; scanning from afar; reduced motion. Roadmap: forwarding addresses. |

## App structure (web)

- **One `App` per session slot.** Standalone: one App, hash routes. Stage mode: two Apps in one page, each with its own token and in-memory route, so two personas run side by side. No iframes.
- **Live:** People and Inbox poll every 2 seconds while visible, so a share or request appears on the other phone without a reload.
- **Mock mode** (`?mock`): the whole app runs on in-memory fixtures typed by the contract. It is how the UI is designed without a backend and the fallback if the venue Wi-Fi dies.
- Attendee tabs: **Scan, People, Inbox, Discover, Me** (badge and settings). The **Inbox is the heart**: requests to you (who, why, in common), requests you sent and their status, and receipts. Booth tabs: **Scan, Leads, Booth**. Organizer: **Pulse**.
- Onboarding is three short steps (You, Interests, Sharing and selfie), about 90 seconds.

## Signature moments (motion)

1. **Catch:** viewfinder locks on the tag, a ripple, the silhouette card springs up from where the tag was; a group catch fans the cards.
2. **Things in common:** the count ticks up and chips pop in one by one; *related* pairs draw a link between the two tags.
3. **Reveal:** on Share, the silhouette fills in with the photo (the hero moment). Unshare runs it backwards and prints a receipt.
4. **Request:** a note slides into the inbox saying who wants to connect and why (a booth's also carries its attachment); answering it resolves the card.
5. **Pulse:** counters roll and the chart grows as the demo happens.

Everything respects `prefers-reduced-motion` (cross-fades instead), keeps WCAG AA contrast, visible focus, 44px targets, never uses color alone, and announces changes to screen readers. Silhouettes are neutral: no gendered shapes or skin cues, distinct per person by a generated gradient and pattern.

## Who builds what

| Stream | Owns |
|---|---|
| Core | `consent.ts` (the who-sees-what lens), scan, people, share, inbox, booth, signup, seed and demo reset |
| Discover | talks index and seed, `/api/discover`, prospects, booth stars |
| Observability | `/api/pulse` (Elasticsearch + Dash0 PromQL), business spans, dashboard and SLO as code |
| Web | the redesign, chosen by a design competition and a mixed panel of model judges |
