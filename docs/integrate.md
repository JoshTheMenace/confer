# Use Confer from your own event app

Confer's web app is only one client. Everything it does goes through one HTTP API, described by one typed file: [`apps/api/src/contract.ts`](../apps/api/src/contract.ts). An event app that already has its own screens can call the same endpoints and keep its own look.

Think of Confer as the consent desk at the conference: your app sends people to it, and it decides what each person may see.

## The five calls most apps need

`$CONFER` is where the API runs. Each attendee gets a token at sign-up; send it as `Authorization: Bearer <token>`.

```sh
# 1. Create the attendee (once). `tagId` is the number on the badge they were handed; leave it out to be given one.
curl -X POST $CONFER/api/me/signup -H 'content-type: application/json' -d '{
  "displayName": "Sam", "approach": "open", "interests": ["Kubernetes", "Rust", "Search"], "lookingFor": [],
  "discoverable": true, "openToBooths": true, "boothsSeeName": false, "autoShare": "off",
  "shareFields": ["email"], "contact": { "email": "sam@example.dev" }, "tagId": 501 }'
# → { "token": "…", "me": { … } }

# 2. They scanned a badge. You get a card: first name, things in common, nothing private.
curl -X POST $CONFER/api/scan -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{ "tagIds": [540], "source": "camera" }'

# 3. The log: everyone they met, in either direction. This is where a Connect button goes.
curl $CONFER/api/people -H "authorization: Bearer $TOKEN"

# 4. Connect (share my card with that person), and take it back.
curl -X POST   $CONFER/api/people/<id>/share -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{}'
curl -X DELETE $CONFER/api/people/<id>/share -H "authorization: Bearer $TOKEN"   # returns a deletion receipt

# 5. For a sponsor: the leads who said yes, as CSV. Each row is checked against Kubernetes RBAC when it can be asked;
#    otherwise the share alone decides. The X-Confer-Gate header (kubernetes | elasticsearch-only) says which.
curl $CONFER/api/booth/export -H "authorization: Bearer $BOOTH_TOKEN"
```

Messaging (`/api/chats/:id`), the inbox (`/api/inbox`), search (`/api/discover`) and the organizer numbers (`/api/pulse`) are in the contract too.

## What you can reuse

- **The types.** Import `contract.ts` in a TypeScript app and every request and response is checked at build time. The web app's whole client is one small function built on it (`apps/web/src/api.ts`).
- **The badge scanner.** `apps/web/src/scan/` is a self-contained AprilTag reader (a WASM detector in a Web Worker) and a component that draws the tag for printing.
- **The rules.** Your app never has to decide who may see what. The API only ever returns what that viewer is allowed to see, so a screen cannot leak by mistake.

## What is not built for integrators yet

Said plainly, so nobody plans around something that is not there:

- **No keys per event app.** Today every caller is an attendee, a booth or an organizer with their own token. A partner app would want its own key and a way to act for its users.
- **No webhooks.** To learn that someone connected, poll `/api/people` or `/api/inbox` (the web app does this every 4 seconds).
- **No published package.** The contract and the scanner live in this repository; they are not on npm.
- **One event per deployment.** There is no event id in the API.
