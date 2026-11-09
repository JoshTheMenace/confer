# Consent is Kubernetes RBAC

Think of a hotel. The front desk keeps the guest list (Elasticsearch). Each share is a **key card programmed for one door** (a RoleBinding). When a booth wants to take a contact home, the app does not just read the guest list: **the door asks the lock**. If the card was cancelled, the lock says no, and that "no" is a real Kubernetes access denial.

## How a share becomes Kubernetes objects

| In the app | In Kubernetes |
|---|---|
| A sponsor booth | A **Namespace** `booth-<booth id>`, annotated with the booth's public name |
| An attendee shares their card with the booth | A **Role** `contact-<attendee id>` plus a **RoleBinding** of the same name to the User `booth:<booth id>` |
| The fields they shared | The Role's **verbs**: `read-email`, `read-linkedin`, `read-github`, plus `export` when anything is shared |
| Unshare, or expiry (30 days after the event) | The Role and RoleBinding are deleted |

The Role allows those verbs on `contacts.confer.dev`, limited by `resourceNames` to that one attendee. Both objects are labeled `app.kubernetes.io/managed-by: confer` and annotated with `confer.dev/shared-at` and `confer.dev/expires-at`. They carry **ids only**: no name, email or note ever goes into Kubernetes. The `contacts.confer.dev` CRD stores nothing (no Contact object is ever created); it only teaches the cluster the name, so `kubectl` and Radar can resolve it.

Two small programs do the work:

- **The consent operator** (`apps/api/src/operator.ts`, Deployment `dex-consent-operator`). Every 3 seconds it reads the shares to booths from Elasticsearch and the grants in Kubernetes, then creates what is missing, updates what changed, and deletes what was taken back. When a grant expires it also deletes the share in Elasticsearch and writes the same deletion receipt an Unshare writes.
- **The export** (`GET /api/booth/export`, a CSV download for sponsors). For every row it asks Kubernetes with a SubjectAccessReview: "may `booth:<id>` `export` this contact?" A row Kubernetes denies is left out before the vault is even opened. Each exported person gets an `exported` receipt. Response headers tell you what happened: `X-Confer-Gate`, `X-Confer-Exported`, `X-Confer-Denied`.

`GET /api/booth/grants` returns the same answer per lead as JSON, so the booth screen can show "Kubernetes says: allowed".

## Live demo

```sh
# Every consent grant in the cluster, one line each
kubectl get rolebindings -A -l app.kubernetes.io/managed-by=confer

# What exactly did this person allow?
kubectl get role contact-<attendee id> -n booth-<booth id> -o yaml

# Ask the lock. Before Unshare: yes
kubectl auth can-i export contacts.confer.dev/<attendee id> --as booth:<booth id> -n booth-<booth id>

# The attendee taps Unshare. A few seconds later, the same command: no
kubectl auth can-i export contacts.confer.dev/<attendee id> --as booth:<booth id> -n booth-<booth id>

# A field they did not share is a no all along
kubectl auth can-i read-linkedin contacts.confer.dev/<attendee id> --as booth:<booth id> -n booth-<booth id>
```

`kubectl` warns that `export` "is not a known verb". That is expected: RBAC verbs are plain strings, and these are ours.

**In Radar:** open the `booth-*` namespaces. Each one lists its Roles and RoleBindings, and the timeline shows a binding appear on Share and disappear on Unshare. The MCP tool `get_subject_permissions` answers "what can `booth:<id>` do?" in one call.

## Why Elasticsearch stays the system of record

Shares, receipts and the vault live in Elasticsearch, and every read of a contact still needs a share document there. Kubernetes is a **second, independent lock that must agree**: it can only take access away, never add it. So:

- Kubernetes says no (binding deleted by hand, or not created yet): the row is not exported.
- Kubernetes cannot be reached: the app keeps working on the Elasticsearch share alone and says so (`X-Confer-Gate: elasticsearch-only`).
- Unshare is instant in the app, because the share is read by id from Elasticsearch on every export. Kubernetes catches up a moment later.

## The reconcile delay

The operator runs every 3 seconds and finds shares with a search, which Elasticsearch Serverless refreshes within about 5 seconds. So a new grant shows up in `kubectl` within roughly 3 to 8 seconds. During that gap a brand-new lead is counted as denied in an export (safe: run it again), and a just-unshared lead is already gone from the export because Elasticsearch said no first.

## Running it on a laptop

```sh
kubectl proxy --port=8011                      # in one terminal
K8S_API_URL=http://127.0.0.1:8011 pnpm --filter @dex/api operator
```

In a pod nothing needs setting: the service account token is used, and the cluster CA reaches Node through `NODE_EXTRA_CA_CERTS`. The operator's ClusterRole can manage namespaces, Roles and RoleBindings. The API's can do exactly one thing: create a SubjectAccessReview.

## Deliberately not built

- **An email relay.** A booth still receives the real address once it is shared; private forwarding addresses are on the roadmap.
- **Action scopes.** Today the verbs are the shared fields plus `export`. The next step is verbs for what a booth may *do*: `send-resource`, `book-meeting`, `newsletter`, each one a checkbox for the attendee and a `kubectl auth can-i` away from being checked.
- **Cleaning up empty booth namespaces.** A booth's namespace stays after its last grant is gone.
