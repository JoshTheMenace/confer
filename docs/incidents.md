# Incident log

Real problems we hit while building, and how we found them.

## 1. Pods stuck in ErrImagePull on first deploy (Radar AI investigation)

- **Symptom:** every `dex-api` and `dex-web` pod stuck in `ErrImagePull`; the app never started.
- **Investigation:** `radar diagnose deploy/dex-api -n dex --agent claude` (full output: [evidence/radar-errimagepull.json](evidence/radar-errimagepull.json)).
  Radar found the image had been swapped to a local `dex-api:dev` tag that does not exist on Docker Hub, that the old ghcr image returned 403 with no pull secret, and recommended an explicit `imagePullPolicy: IfNotPresent`.
- **Root cause:** the Deployment was first created with a `:latest` tag, so Kubernetes defaulted `imagePullPolicy` to `Always`. That default stuck when the image changed, so the node kept trying to download an image that only existed locally (loaded with `kind load`).
- **Fix:** explicit `imagePullPolicy: IfNotPresent` on every container, and a `k8s/local` kustomize overlay so local images are used from the first apply.
