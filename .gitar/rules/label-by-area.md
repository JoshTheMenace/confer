---
title: Label by area
description: Label each pull request with the parts of the system it touches, so the right review lens is obvious.
when: Any pull request is opened or updated
actions: Add the matching labels
type: automation
---

Add a label for each area the pull request changes, and remove labels that no longer apply:

- `privacy`: `apps/api/src/consent.ts`, `apps/api/src/contract.ts`, anything that reads the vault index, shares, receipts, or `.gitar/review/privacy.md`
- `search`: `apps/api/src/discover.ts`, `apps/api/src/es.ts`, index mappings, queries
- `observability`: `apps/api/src/telemetry.ts`, `apps/api/src/otel.ts`, `apps/api/src/routes/pulse.ts`, `observability/`
- `kubernetes`: `k8s/`, `Dockerfile`
- `web`: `apps/web/`
- `ci`: `.github/`, `.gitar/`, `biome.json`

A pull request labeled `privacy` must be reviewed against every rule in `.gitar/review/privacy.md`, not only the changed lines.
