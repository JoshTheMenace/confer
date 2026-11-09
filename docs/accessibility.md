# Accessibility: what we tested, what we found, what we did not test

Confer is for a loud, crowded hall, so it has to work for people who cannot or would rather not do the default thing: talk, be photographed, hold a phone to a badge, or watch an animation.

## What the product does for inclusion

| Barrier at a conference | What Confer does |
|---|---|
| Being judged on appearance before a word is said | A photo stays hidden until its owner shares. Until then everyone is the same neutral silhouette: one shape, no skin or hair cues. |
| Unwanted approaches | An approach preference on every card (open, ask first, quiet), shown with an icon and words. |
| Loud rooms, hearing or speech differences, social anxiety | A communication preference ("text first, then talk") and text chat in every request, so nobody has to shout or talk at all. |
| Pressure to hand over contact details on the spot | Share is one-way and can be done later, or never. Unshare takes it back. Ignore and Mute are always there, and a mute is never revealed. |
| Cannot aim a camera, or no camera | Every scan can be typed as a badge number instead. |
| Motion sensitivity | With "reduce motion" on, nothing moves or scales: reveals and receipts cross-fade in 0.2 s or less. |
| Pronouns | Optional, shown beside the name wherever the name is shown. |

## Automated audit (axe-core)

An agent drove headless Chrome through 22 screens in light and dark mode (44 runs) with axe-core's WCAG 2.0, 2.1 and 2.2 A/AA rules plus best practices. The script is [evidence/axe-audit.mjs](evidence/axe-audit.mjs). To run it again: copy it to an empty folder, `npm i axe-core` there, serve the web app on port 5190 (`pnpm --filter @dex/web exec vite --port 5190`), then `node axe-audit.mjs`. It needs Google Chrome on macOS at its default path, and exits with 1 if any violation remains.

- **First run (15:40):** 28 violation nodes, none critical, none about colour contrast or missing names. Five causes: a chat list with a role that made its items invalid, a skipped heading level on the person card, two sections with the same label in a group scan, two `main` landmarks on the Stage, and sign-up steps without an `h1`.
- **After the fixes: 0 axe violation nodes across 44 screen/theme runs.**

| Screen | Theme | critical | serious | moderate | minor | passes |
|---|---|---|---|---|---|---|
| Stage | light | 0 | 0 | 0 | 0 | 37 |
| Onboarding 1 You | light | 0 | 0 | 0 | 0 | 31 |
| Onboarding 2 Interests | light | 0 | 0 | 0 | 0 | 28 |
| Onboarding 3 Sharing and selfie | light | 0 | 0 | 0 | 0 | 29 |
| Scan manual (type badge) | light | 0 | 0 | 0 | 0 | 36 |
| Scan card silhouette + Connect composer | light | 0 | 0 | 0 | 0 | 43 |
| Scan group of 3 | light | 0 | 0 | 0 | 0 | 41 |
| Person revealed (after share) | light | 0 | 0 | 0 | 0 | 46 |
| People list | light | 0 | 0 | 0 | 0 | 40 |
| Inbox: Requests | light | 0 | 0 | 0 | 0 | 39 |
| Inbox: Chats | light | 0 | 0 | 0 | 0 | 39 |
| Inbox: Receipts | light | 0 | 0 | 0 | 0 | 35 |
| Chat | light | 0 | 0 | 0 | 0 | 42 |
| Chat (request pending reply) | light | 0 | 0 | 0 | 0 | 42 |
| Discover | light | 0 | 0 | 0 | 0 | 43 |
| Discover with search | light | 0 | 0 | 0 | 0 | 43 |
| Me | light | 0 | 0 | 0 | 0 | 38 |
| Booth: Scan | light | 0 | 0 | 0 | 0 | 36 |
| Booth: Scan card | light | 0 | 0 | 0 | 0 | 44 |
| Booth: Leads | light | 0 | 0 | 0 | 0 | 50 |
| Booth: Setup | light | 0 | 0 | 0 | 0 | 36 |
| Organizer: Pulse | light | 0 | 0 | 0 | 0 | 42 |

Dark mode gave the same result on every screen.

## Checked by script, beyond axe

- **Keyboard:** every control on Scan, Inbox, a revealed person and Discover is reachable with Tab and shows a 3 px focus ring. Focus moves to the new screen's heading on navigation.
- **Target size:** every control is at least 44 by 44 px. The one exception found (contact links 17 px tall) was fixed.
- **Reduced motion:** nothing moves or scales; the remaining fades were cut to 0.2 s.
- **Announcements:** one polite status region announces scans, shares, requests and messages ("Met Diego: 3 things in common.").
- **Reflow:** no sideways scrolling at 320 px wide.
- **In CI:** `pnpm lint` runs Biome's accessibility rules on every pull request and fails the build. It caught a real issue on [PR #13](https://github.com/JoshTheMenace/confer/pull/13), which Gitar then fixed. `.gitar/review/accessibility.md` tells the reviewer what to look for.

## Not tested, and known limits

- **No screen reader was listened to.** Roles, names and live regions were checked by machine, not by ear with VoiceOver or NVDA.
- **No testing with disabled people.** One day, one builder.
- axe marked contrast on text over the illustrated Stage background as "needs review". We checked those pairs by hand, not with a tool.
- The camera scanner itself was not audited; the typed path is the accessible one.
- Tables on Pulse and Leads stick out a few pixels at 320 px without causing page scroll.
- We have not shown that silhouettes reduce bias. What is built is that a photo cannot be seen before its owner chooses.
