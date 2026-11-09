# How we write code here

- **Fewest lines that meet the requirement.** Prefer the clean, boring fix over a clever one. Flag dead code, unused exports, and abstractions with a single caller.
- **One contract.** `apps/api/src/contract.ts` (types only) is the source of truth for every route. Handlers return `satisfies Api['METHOD /path']['res']` and the web client is typed by the same `Api` map. Flag a route, field or response that is not in the contract, and any `any` cast used to get around it.
- **Index names go through `ix`** (`apps/api/src/es.ts`), never a string literal, so dev and test runs use their own prefix and never touch live event data.
- **Validate every request body with zod** (`zValidator`). Flag handlers that read `c.req.json()` directly.
- **Elasticsearch is the only database.** No new datastores, caches with state that must survive restarts, or local files.
- **Comments explain why, not what.** Flag comments that restate the code.
- **Tests:** vitest, with the `es` client mocked. Pure decision logic (who sees what, query building) belongs in pure functions with direct tests.
- **Kubernetes:** containers keep explicit `imagePullPolicy`, probes, and memory limits. No secrets in YAML: they come from the `dex-secrets` Secret.

See also @privacy.md and @accessibility.md.
