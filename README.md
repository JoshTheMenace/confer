# Dex (working name)

Consent-first networking for conferences. Catch the people you meet by scanning their AprilTag badge.
Your data travels in three envelopes, and nobody opens the sealed one without your yes.

| Envelope | Contents | Peer scan | Sponsor scan |
|---|---|---|---|
| 🟢 Badge | name, pronouns, approach preference | shown | shown |
| 🟡 Interests | role, topics, looking for | if you allow peers | if you allow sponsors |
| 🔴 Contact | email, LinkedIn, GitHub | mutual catch only | Consent Inbox: share now / after event / never. No answer = expires and is deleted |

## Architecture

```
Phone (React + WASM AprilTag + Dash0 RUM) ─► dex-web (nginx) ─► dex-api (Hono, OTel) ─► Elastic Cloud
                                                                     └─► OpenAI (traced by OpenLIT)
Kubernetes: dex-web, dex-api, dex-consent-expirer (CronJob) · watched by Radar · telemetry to Dash0
GitHub: every PR reviewed by Gitar against .gitar/rules · CI builds images to GHCR
```

## Run locally

```sh
cp .env.example .env   # fill in Elastic, Dash0, OpenAI
pnpm install
pnpm dev               # web on :5173, api on :3000
```

## Deploy to Kubernetes

```sh
kubectl apply -f k8s/namespace.yaml
kubectl -n dex create secret generic dex-secrets --from-env-file=.env
kubectl apply -k k8s
```

## AI disclosure

Built with Claude Code (Anthropic) as a pair programmer. All code was reviewed by the team, and every change landed through a PR reviewed by Gitar.
