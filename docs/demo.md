# The five-minute demo

Everything in this repo was built to make these five minutes work. Present from the laptop in **Stage mode** (`/#/stage`): two live phones side by side and a strip of live event numbers.

## Before you walk up (2 minutes)

1. `pnpm --filter @dex/api demo:reset` puts the event back to its starting state (Amara and Diego have not met; the Elastic booth has not scanned anyone on stage).
2. Open `http://localhost:8080/#/stage`. Left phone: **Amara**. Right phone: **Diego**.
3. Open three more tabs, in this order: Radar topology (`http://localhost:9280`), the Dash0 dashboard, and the pull request list on GitHub.
4. Paper badge in hand. Laptop volume on (a catch beeps).
5. If the Wi-Fi is bad: `http://localhost:8080/?mock#/stage` runs the same demo on built-in sample data. Say so out loud; do not pretend it is live.

## The script

| Time | Say | Do |
|---|---|---|
| 0:00 | "This is the state of the art in conference privacy." *(hold up a badge with its code blacked out)* "A Sharpie. People deface their own badges so booths can't scan them, because one scan puts your email on a lead list and the sales emails start before you've flown home. One conference even told attendees how: color over the code with a black Sharpie." | Hold up the blacked-out badge. Let it land. |
| 0:20 | "The scan isn't the problem. What happens after it is. So what if a scan gave away nothing?" *(swap to the clean badge)* "This is Confer. The front of your badge says hi. Only you say yes." | Stage mode is on screen. |
| 0:30 | "Amara scans Diego's badge from across the table. Diego doesn't touch his phone." | Left phone: Scan. Hold the badge to the webcam (or type its number). |
| 0:40 | "She gets a first name, a silhouette, and what they have in common. Not his job title, not his email, not even his full list of interests. And look at this one: she wrote OpenTelemetry, he wrote distributed tracing. Elasticsearch embeddings know that's the same conversation." | Point at the *related* pair. |
| 1:00 | "She wants to keep talking, so she says why. Like a LinkedIn invite, except Diego sees the reason and what they have in common before he gives up anything." | Left phone: **Connect**, pick the suggested opener, send. Right phone: the request arrives in the Inbox. |
| 1:10 | "Share, ignore, or mute. He shares." | Right phone: **Share**. |
| 1:15 | "Watch the left phone." *(pause)* "That's the moment. His silhouette fills in because he chose to." | The reveal plays on the left. |
| 1:30 | "And he can take it back." | Right phone: **Unshare**. The photo drains, the receipt appears. "A receipt, backed by a trace id. Honest limit: we can't un-see a screenshot, and we say so." |
| 1:50 | "Now the booth. Same badge, same scan." | Right phone: switch to **Elastic booth**, Scan Amara's badge. |
| 2:00 | "The booth sees what she cares about and how well she fits. No name. So instead of harvesting her email, the rep sends a note and the guide they talked about." | Send the request. |
| 2:15 | "Amara gets the guide whether she shares or not. Share, ignore, or mute the booth. She shares." | Left phone: Inbox, **Share**. |
| 2:30 | "Why would a sponsor want this? Because this list is only people who said yes, each with the note that won them. Share rate per pitch. And people who opted in and match, who never walked past the booth." | Right phone: Leads. Point at leads, pitch table, prospects. |
| 3:00 | "And for attendees: what are you stuck on?" | Left phone: Discover, type **"tracing across 200 services"**. "Talks, booths and people. Keyword and semantic search fused, then reranked. Elasticsearch is the only database we have." |
| 3:25 | "We didn't just build it, we operated it today." | Switch persona to **organizer**: Pulse. "These numbers moved while I was talking. The health block is read live from Dash0." |
| 3:40 | "Dash0's Agent0 found that every save waited up to five seconds on a search refresh. We fixed it: 4.8 seconds to 1.0." | Dash0 dashboard tab. |
| 3:55 | "Radar's AI investigation fixed our first broken deploy, and its audit took us from 17 findings to 2." | Radar tab. |
| 4:10 | "Every change went through a pull request that Gitar reviewed, including the design contract, where it caught a privacy hole before we wrote the code. When we disagreed, we showed it data, and it agreed." | GitHub tab. |
| 4:30 | "Last thing. A silhouette means nobody is judged on how they look before they choose to share. You can say how you want to be approached, and how to talk to you. It scans from a distance, works with a keyboard, and respects reduced motion." | Back to Stage. |
| 4:50 | "Confer. The front of your badge says hi. Only you say yes." | Stop. |

## If something breaks

- **Camera will not read the badge:** type the badge number. It is the accessible path anyway; say that.
- **A save is slow:** "That is Elastic Serverless on conference Wi-Fi; the write floor is half a second and it is on our SLO."
- **Everything is down:** the `?mock` link above.

## The problem, with sources

Open with the problem, not the product. Things we can point to:

- **Organizers telling people to deface their badges.** WordCamp US 2019's own badge guide said attendees who did not want to be scanned could "use a black sharpie to color over the QR code" or cover it with any sticker ([WCUS Badges and QR Codes](https://us.wordcamp.org/2019/category/tickets/), 2019-10-29).
- **Scanning without a conversation.** Attendees describe booths scanning badges as people walk past, or offering swag first and scanning before saying who they are ([Zuant: "Mindless scanning badges and random follow up"](https://www.zuant.com/2014/10/mindless-scanning-badges-and-random-follow-up/)).
- **The emails afterwards.** An Esri DevSummit attendee reported a stream of vendor email after each year's event, from senders who would not say where they got the address ([Esri Community thread](https://community.esri.com/thread/230513-spam-emails-after-devsummit)).

Only say what these sources say. If you quote a person's post in the video, show the real post and its link.

## Questions you will get

- **"Sponsors pay for lead lists. Why would they accept fewer leads?"** They get fewer rows and more replies. Every lead said yes and comes with the note that worked, they can reach matching attendees who never visited, their content reaches every scan, and they see which pitch earns shares. The organizer sees each booth's share rate, so good behavior is visible.
- **"Can't someone just type badge numbers?"** A scan only ever shows a first name, a silhouette and overlap. It is rate limited, shows up in the other person's "who scanned me" list, and never unlocks contact. Production badges would carry a random code instead of a number.
- **"Can't I change my interests to find out someone's?"** What you have in common is frozen at the first scan, and interest edits are capped.
- **"What does Unshare really do?"** It removes the contact and photo from Confer for that person at once and writes a receipt. It cannot recall a copy they already made. The roadmap fix for email is a private forwarding address per person that stops working on Unshare.
- **"What is not built?"** Forwarding email addresses, the evening digest, and badge reissue. They are in the roadmap, not in the demo.
