# How we write code here

- **Fewest lines that meet the requirement.** Prefer the clean, boring fix over a clever one. Flag dead code, unused exports, and abstractions with a single caller.
- **TypeScript end to end.** API routes are chained `new Hono()` groups mounted with one `.route()` line in `apps/api/src/app.ts`, so the web client (`hc<AppType>`) stays typed. Flag routes that break this chain or cast to `any` to get around it.
- **Validate every request body with zod** (`zValidator`). Flag handlers that read `c.req.json()` directly.
- **Elasticsearch is the only database.** No new datastores, caches with state that must survive restarts, or local files.
- **Comments explain why, not what.** Flag comments that restate the code.
- **Tests:** vitest, with the `es` client mocked. Pure decision logic (who sees what, query building) belongs in pure functions with direct tests.
- **Kubernetes:** containers keep explicit `imagePullPolicy`, probes, and memory limits. No secrets in YAML: they come from the `dex-secrets` Secret.

See also @privacy.md and @accessibility.md.
