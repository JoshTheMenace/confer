---
title: No PII in telemetry
description: Contact data must never reach logs, spans, metrics, or RUM.
when: PRs that add or change logging, span attributes, metric attributes, or browser telemetry
actions: Request changes and explain which field leaked and where
type: check
---

This app's promise is that contact details stay sealed until the attendee consents.
Telemetry is exported to a third party (Dash0), so it counts as sharing.

Block the PR if any log call, span attribute, metric attribute, or error message includes
`email`, `linkedin`, `github`, `phone`, a resume, or any field read from the `vault` index.
Opaque IDs (`tagId`, user IDs, sponsor IDs) and counts are fine.
