---
title: Sealed envelope stays sealed
description: Only the consent-release path may read the vault index.
when: PRs that query Elasticsearch
actions: Request changes if a search, match, or listing reads the vault index
type: check
---

Contact data and photos live in the vault index (`ix.vault`). Search, discovery, scans,
and booth or organizer totals must never read it. The vault may only be read for its owner,
or in code that first finds an existing share from the owner to the viewer (`ix.shares`)
and then writes a `receipts` entry for the read.
