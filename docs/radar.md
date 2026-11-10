# Operating Confer with Radar

Confer runs on Kubernetes (namespace `dex`: two `dex-web` pods, two `dex-api` pods, the `dex-consent-operator`, and the `dex-consent-expirer` CronJob; plus one `booth-*` namespace per sponsor, holding that booth's consent grants). Radar by Skyhook is connected to the cluster, and its MCP server is connected to our coding agent, so the same tool is used by the human in the UI and by the agent in the terminal.

## How we use it

| When | Radar tool | What it is for |
|---|---|---|
| Before and after every deploy | MCP `issues` | "Is anything broken right now?" |
| After every `kubectl apply` | MCP `wait_for` | Wait for the rollout instead of sleeping and guessing |
| Something looks wrong | `radar diagnose` (AI investigation), MCP `diagnose`, `get_changes` | Evidence first: logs, events, what changed |
| Before the demo | MCP `get_cluster_audit` | Configuration posture: security, reliability, efficiency |
| Explaining the system | UI Topology | The picture of services, deployments, pods and the CronJob |

Radar's topology of the final deploy, with the consent operator and both service accounts: [screenshot](screenshots/radar-topology.png).

Radar on the morning's first deploy (before the consent operator existed): [overview](screenshots/13-radar-overview.png), [topology](screenshots/14-radar-topology.png), [AI investigation](screenshots/15-radar-ai-investigation.png).

## What Radar found, and what we did

### 1. First deploy: every pod stuck in ErrImagePull (AI investigation)
Radar's AI investigation traced it to the image reference and recommended an explicit pull policy. We fixed the manifests and added the `k8s/local` overlay. Full write-up: [incidents.md](incidents.md#1-pods-stuck-in-errimagepull-on-first-deploy-radar-ai-investigation), evidence: [evidence/radar-errimagepull.json](evidence/radar-errimagepull.json).

### 2. Cluster audit: 17 findings down to 2 (MCP `get_cluster_audit`)
We asked Radar "is this well configured?" before the demo. It returned 17 findings for our namespace, 2 of them high:

| Finding (both deployments unless noted) | Severity | Fix in `k8s/base` |
|---|---|---|
| Containers allow privilege escalation | high | `allowPrivilegeEscalation: false`, drop all capabilities |
| May run as root | medium | `runAsNonRoot: true` with the image's own user, `seccompProfile: RuntimeDefault` |
| Root filesystem is writable | medium | `readOnlyRootFilesystem: true`, with an `emptyDir` for `/tmp` |
| Service account token auto-mounted | medium | `automountServiceAccountToken: false` on web and the expirer. The API and the consent operator now mount one on purpose, each bound to a narrow role: see [kubernetes-consent.md](kubernetes-consent.md) |
| No CPU limit | medium | CPU limits added |
| `dex-web` has no liveness probe | medium | liveness probe added |
| No PodDisruptionBudget | medium | `k8s/base/pdb.yaml`: keep one copy of each service up |
| No topology spread constraints | medium | spread across nodes by hostname |
| All pods on one node | medium | **Accepted:** the demo cluster has one node. The spread constraint above takes effect on any real cluster. |

After applying, we used `wait_for` to confirm both rollouts (2/2 available in 20 seconds), `issues` to confirm nothing was broken, and ran the audit again: **0 high, 2 medium**, both the single-node finding we accept. The app was checked end to end on the hardened pods (read-only disk, no root).

### 3. The API ignored SIGTERM
Seen as pods sitting in `Terminating` for the full grace period during a rollout. Fixed with a graceful shutdown: [incidents.md](incidents.md#3-api-ignored-sigterm).

### 4. The consent operator: audit again, act again (MCP `wait_for`, `issues`, `get_cluster_audit`)
The afternoon added a new workload: the operator that mirrors every share to a booth as a Kubernetes RoleBinding ([kubernetes-consent.md](kubernetes-consent.md)). What the Radar MCP server returned on the final deploys (2026-11-09, MST):

| Time | Call | Result |
|---|---|---|
| 15:17 | `wait_for` deployments in `dex` | `met`: `dex-api` 2/2, `dex-consent-operator` 1/1, `dex-web` 2/2, after 20 s |
| 15:17 | `issues` in `dex` | 0 issues. The change feed listed what we had just done: `serviceAccountName: (default)→confer-api`, `NODE_EXTRA_CA_CERTS` added |
| 15:46 | `get_cluster_audit` in `dex` | 0 high, **7 medium** (2 before the operator). New: the operator had no readiness probe, no liveness probe, one replica; the API and the operator mount a service account token |
| 15:51 | `wait_for`, then `get_cluster_audit` | after [PR #22](https://github.com/JoshTheMenace/confer/pull/22) (a heartbeat file and two probes): 0 high, **5 medium** |

The five that remain are accepted on purpose:

- **Service account token mounted** on the API and the operator (2): they are the two workloads that talk to the Kubernetes API. Each has its own account with a narrow role: the API may only create SubjectAccessReviews; the operator may only manage namespaces, Roles and RoleBindings it labels.
- **One operator replica** (1): two copies would both reconcile without leader election. Safe, because the work is idempotent, but pointless at this size.
- **All pods on one node** (2): the demo cluster has one node.

The same change feed is how the `AUTH_CACHE_SECONDS` setting from [incident 5](incidents.md) shows up: Radar flags it as an application configuration change on `dex-api`, with the old and new value.

### Seeing consent in Radar
Open a `booth-*` namespace in the Radar UI: each lead is a Role and a RoleBinding named `contact-<attendee id>`. A Share makes one appear within a few seconds, and an Unshare removes it. `get_subject_permissions` for `booth:<id>` answers "what may this booth do, and for whom?" in one call.

