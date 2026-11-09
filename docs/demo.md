# The five-minute demo

Everything in this repo was built to make these five minutes work. Present from the laptop in **Stage mode** (`/#/stage`): two live phones side by side and a strip of live event numbers. The left phone is yours. The right phone belongs to a volunteer you sign up live.

## Before you walk up (2 minutes)

1. `pnpm --filter @dex/api demo:reset` puts the event back to its starting state and frees badge 501 (about 30 seconds). Run it again before every new audience.
2. Open `http://localhost:8080/#/stage`. Left phone: **Amara** (you). Right phone: **New person**.
3. Open three more tabs, in this order: Radar (`http://localhost:9280`, RoleBindings filtered to `booth-`), the Dash0 dashboard, and the pull request list on GitHub.
4. The paper badge (AprilTag 501) and a badge with its code blacked out. Allow the camera in the browser once, before you start.
5. If the Wi-Fi is bad: `http://localhost:8080/?mock#/stage` rehearses the same screens on built-in sample data. Say so out loud; do not present it as live.

## The script

| Time | Say | Do |
|---|---|---|
| 0:00 | "This is the state of the art in conference privacy." *(hold up the blacked-out badge)* "A Sharpie. People deface their own badges so they can't be scanned, because one scan can put your email on a lead list. One conference's badge guide even explained how." | Let it land. |
| 0:20 | "The scan isn't the problem. What happens after it is. So what if a scan gave away nothing? Can I borrow one of you? You'll be on screen with your first name and a photo, and I'll delete both before I sit down. Is that OK?" | Hand over the paper badge. Wait for a yes. |
| 0:30 | "Thirty-second sign-up. First name? Three things you're into?" | Right phone: first name, badge number **501**, tap three topics (steer toward Kubernetes or tracing), **Take photo**, a placeholder email (`you@example.dev`, never their real one). |
| 1:05 | "Now I'm across the room and I scan your badge. You don't touch anything." | Left phone: Scan, point the webcam at the badge (or type 501). |
| 1:15 | "I get a first name, a silhouette, and what we have in common. Not your face, not your email, not your job. And this one is *related*: I wrote OpenTelemetry, you picked distributed tracing. Elasticsearch judged that those are the same conversation." | Point at the things in common. |
| 1:35 | "If I want more, I have to ask, and say why." | Left phone: **Connect**, pick the suggested opener, send. Right phone: the request arrives. |
| 1:45 | "Your call: reply, share, ignore, or mute me. Chatting gives away nothing." | Volunteer taps **Reply** and sends a line. Then: "Want to share your card with me? You tap it." They tap **Share my card**. |
| 2:05 | "Watch my phone." *(pause)* "That's the moment. Your face appears because you chose it." | The reveal plays on the left. |
| 2:20 | "And you can take it back." | Volunteer taps **Unshare**. The photo drains, the receipt prints. "A receipt with a trace id. Honest limit: we can't un-see a screenshot, and the app says so." |
| 2:35 | "Now I'm a sponsor booth. Same badge, same scan." | Left phone: switch to **Booth**, scan 501. "Topics and fit. No name. So instead of harvesting an email, I send a note and the guide we talked about." Send it. |
| 2:55 | "You get the guide either way. Share with the booth?" | Volunteer: Inbox, **Share my card**. Left phone: **Leads**. "Only people who said yes, each with the note that won them." |
| 3:10 | "Here is my favourite part. That yes is now a Kubernetes RoleBinding in this booth's own namespace. The export asks Kubernetes about every row before it opens any contact data." | Left phone: **Export CSV**: "Kubernetes allowed 4". Radar tab: the binding `contact-…` in `booth-seed-580`. |
| 3:30 | "Unshare from the booth." | Volunteer: **Unshare**. Radar: the binding disappears. Left phone: **Export CSV** again: one row fewer. "Consent you can `kubectl get`." |
| 3:50 | "We didn't just build it, we operated it today." | Left phone: **Organizer**, Pulse. "These numbers moved while we talked. Health and the SLO are read live from Dash0." |
| 4:00 | "Dash0's Agent0 found that every request spent a quarter of a second re-checking the sign-in. Four tokens, 746 lookups. We cached it." | Dash0 tab. |
| 4:10 | "Radar's AI investigation fixed our first broken deploy, and its MCP server checks every rollout." | Radar tab. |
| 4:20 | "Every pull request was reviewed by Gitar. It caught a privacy hole in the API contract before any code existed, and it pushed fixes itself. Twice we disagreed and showed it measurements." | GitHub tab. |
| 4:35 | "Last thing. Your photo stays hidden until you choose. You can say how you like to be approached, chat instead of shouting over a hall, type a number instead of using a camera, and turn motion off." | Back to Stage. |
| 4:50 | "Confer. The front of your badge says hi. Only you say yes. And as promised:" | Run `demo:reset`: the volunteer's profile and photo are gone. |

## If something breaks

- **Nobody volunteers, or they say no:** right phone to **Diego** (a fictional attendee) and play both sides. Type badge **540** for him, or use the Demo badges button.
- **Camera will not read the badge:** type 501. It is the accessible path anyway; say that.
- **The photo button fails:** skip the photo. The reveal still shows the card.
- **A save is slow:** "That is Elasticsearch Serverless over conference Wi-Fi. It is on our SLO, and that is what Agent0 helped with."
- **Kubernetes cannot be reached:** the export still works and says "the share records alone decided". Say what happened.
- **Everything is down:** the `?mock` link above, or the recorded video.

## The problem, with sources

Open with the problem, not the product. Only say what these sources say.

- **A conference had to tell people how to opt out with a pen.** WordCamp US 2019 handled this well: scanning needed permission and sponsors were told so. Even then its badge guide told attendees who did not want to be scanned to "use a black sharpie to color over the QR code" or cover it with a sticker ([WCUS Badges and QR Codes](https://us.wordcamp.org/2019/category/tickets/), 2019-10-29). The best available tool was a Sharpie.
- **Scanning without a conversation.** Attendees describe booths scanning badges as people walk past, or offering swag and scanning before saying who they are ([Zuant: "Mindless scanning badges and random follow up"](https://www.zuant.com/2014/10/mindless-scanning-badges-and-random-follow-up/)).

If you quote a person's post in the video, show the real post and its link.

## Questions you will get

- **"Sponsors pay for lead lists. Why would they accept fewer leads?"** Fewer rows, more replies. Every lead said yes and comes with the note that worked; booths can reach matching attendees who opted in but never walked past; and they see which pitch earns shares. The organizer sees each booth's share rate.
- **"Is Kubernetes part of the product or just hosting?"** Part of it. Shares become Roles and RoleBindings, and the export asks Kubernetes before each row. Elasticsearch stays the system of record. If Kubernetes cannot answer, the export falls back to the share records and says so in a header.
- **"Is Elastic really the main database?"** Yes, the only one: profiles, contact cards, sign-in links, meetings, conversations, shares, receipts and talks.
- **"What exactly is semantic and what is reranked?"** Discover fuses keyword and semantic retrieval (RRF) for talks, booths and people. Typed questions rerank the talks. Related topics between two people are judged by a reranker. Fit scores are ranking hints, not measured probabilities.
- **"What LLM calls does OpenLIT see?"** None. Confer makes no LLM calls; OpenLIT is initialized and idle. The Dash0 evidence is OpenTelemetry traces, logs, metrics and RUM.
- **"Did you blindly accept Gitar's fixes?"** No. On PR #10 we reverted one that brought back slow refresh waits, with measurements, and Gitar agreed.
- **"Can't someone just type badge numbers?"** A scan only shows a first name, a silhouette and overlap. It is rate limited, it shows up in the other person's "who scanned me" list, and it never unlocks contact. Production badges would carry a random code, not a small number.
- **"Can't I change my interests to find out someone's?"** What you have in common is frozen at the first scan, and interest edits are capped.
- **"What does Unshare really do?"** It revokes access in Confer and writes a receipt; other screens update within seconds. It cannot recall a CSV, a screenshot or any other copy. The roadmap fix for email is a private forwarding address per person that stops working on Unshare.
- **"Have you proved silhouettes reduce bias?"** No. What is built is that photos stay hidden until the person shares, plus approach and communication preferences.
- **"What is not built?"** Forwarding email addresses, the evening digest and badge reissue.
