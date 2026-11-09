---
title: Sealed envelope stays sealed
description: Only the consent-release path may read the vault index.
when: PRs that query Elasticsearch
actions: Request changes if a search, match, or listing reads the vault index
type: check
---

Contact data lives in the `vault` index. Search, matchmaking, catches, and sponsor
aggregates must only use `profiles`, `catches`, `consent_requests`, and `receipts`.
The `vault` index may only be read in code that first checks for a `granted` consent
request (or a mutual catch) and then writes a `receipts` entry for the read.
