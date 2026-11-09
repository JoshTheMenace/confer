# Operating Confer with Radar

Confer runs on Kubernetes (namespace `dex`: two `dex-web` pods, two `dex-api` pods, and the `dex-consent-expirer` CronJob). Radar by Skyhook is connected to the cluster, and its MCP server is connected to our coding agent, so the same tool is used by the human in the UI and by the agent in the terminal.

## How we use it

| When | Radar tool | What it is for |
|---|---|---|
| Before and after every deploy | MCP `issues` | "Is anything broken right now?" |
| After every `kubectl apply` | MCP `wait_for` | Wait for the rollout instead of sleeping and guessing |
| Something looks wrong | `radar diagnose` (AI investigation), MCP `diagnose`, `get_changes` | Evidence first: logs, events, what changed |
| Before the demo | MCP `get_cluster_audit` | Configuration posture: security, reliability, efficiency |
| Explaining the system | UI Topology | The picture of services, deployments, pods and the CronJob |

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
| Service account token auto-mounted | medium | `automountServiceAccountToken: false` (the app never calls the Kubernetes API) |
| No CPU limit | medium | CPU limits added |
| `dex-web` has no liveness probe | medium | liveness probe added |
| No PodDisruptionBudget | medium | `k8s/base/pdb.yaml`: keep one copy of each service up |
| No topology spread constraints | medium | spread across nodes by hostname |
| All pods on one node | medium | **Accepted:** the demo cluster has one node. The spread constraint above takes effect on any real cluster. |

After applying, we used `wait_for` to confirm both rollouts (2/2 available in 20 seconds), `issues` to confirm nothing was broken, and ran the audit again: **0 high, 2 medium**, both the single-node finding we accept. The app was checked end to end on the hardened pods (read-only disk, no root).

### 3. The API ignored SIGTERM
Seen as pods sitting in `Terminating` for the full grace period during a rollout. Fixed with a graceful shutdown: [incidents.md](incidents.md#3-api-ignored-sigterm).
