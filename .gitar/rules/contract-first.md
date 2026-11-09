---
title: Contract first
description: A route cannot change without the shared contract changing with it.
when: PRs that add, remove or change an API route, its request body, or its response under apps/api/src/routes
actions: Request changes naming the route and the missing or mismatched contract entry
type: check
---

`apps/api/src/contract.ts` is the one description of the API that both the server and the web app compile against.

Judge only what the pull request adds or changes, so older routes that predate the contract do not cause blanket change requests:

- A route the pull request adds or changes must have a matching `'METHOD /path'` entry in the `Api` type, and its handler must return a value that `satisfies` that entry's `res`.
- A changed request body or response must change the contract in the same pull request.
- A response field the pull request adds that is not in the contract is a finding, even if TypeScript accepts it.
