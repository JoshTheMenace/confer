// Consent as Kubernetes RBAC (docs/kubernetes-consent.md): a booth is a namespace, a share is a Role + RoleBinding
// in it, and "may this booth export this person?" is a SubjectAccessReview. Elasticsearch stays the system of record;
// Kubernetes is a second lock that must agree. Object names carry ids only, never names or contact data.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { eventEndsAt, type Share } from './consent.js'

const sa = '/var/run/secrets/kubernetes.io/serviceaccount'
// K8S_API_URL (a `kubectl proxy` address, no token) wins; in a pod it is the cluster's own API with the service
// account token. The cluster CA reaches Node through NODE_EXTRA_CA_CERTS, set in the manifests.
const apiUrl = () => process.env.K8S_API_URL || (existsSync(`${sa}/token`) ? 'https://kubernetes.default.svc' : undefined)
export const kubernetes = () => !!apiUrl()

const rbac = '/apis/rbac.authorization.k8s.io/v1'
const managed = { 'app.kubernetes.io/managed-by': 'confer' }
const selector = `labelSelector=${encodeURIComponent('app.kubernetes.io/managed-by=confer')}`

/** What one share should be in Kubernetes. */
export type Grant = { booth: string; attendee: string; verbs: string[]; sharedAt: string; expiresAt: string }
/** A grant found in Kubernetes. `verbs` is missing when only the binding exists, `bound` is false when only the Role does. */
export type Found = { namespace: string; name: string; verbs?: string[]; sharedAt?: string; bound: boolean }

export const boothNamespace = (boothId: string) => {
  const slug = boothId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  // A slug that lost characters gets a short hash of the real id, so two booths can never land in one namespace.
  return `booth-${slug === boothId ? slug : `${slug}-${createHash('sha256').update(boothId).digest('hex').slice(0, 8)}`.replace(/^-/, '')}`
}
export const subjectFor = (boothId: string) => `booth:${boothId}`
export const grantName = (attendeeId: string) => `contact-${attendeeId}`
/** One verb per shared field, plus `export` when there is anything to take home. */
export const grantVerbs = (share: Pick<Share, 'fields'>) => [...share.fields.map((f) => `read-${f}`), ...(share.fields.length ? ['export'] : [])]
/** Grants to booths end 30 days after the event. */
export const grantOf = (s: Share): Grant =>
  ({ booth: s.to, attendee: s.from, verbs: grantVerbs(s), sharedAt: s.at, expiresAt: new Date(eventEndsAt() + 30 * 864e5).toISOString() })
const keyOf = (o: { namespace: string; name: string }) => `${o.namespace}/${o.name}`
export const grantKey = (g: Grant) => keyOf({ namespace: boothNamespace(g.booth), name: grantName(g.attendee) })

export const namespaceManifest = (boothId: string, displayName: string) => ({
  apiVersion: 'v1', kind: 'Namespace',
  metadata: { name: boothNamespace(boothId), labels: managed, annotations: { 'confer.dev/booth': boothId, 'confer.dev/display-name': displayName } },
})
const meta = (g: Grant) => ({
  name: grantName(g.attendee), namespace: boothNamespace(g.booth), labels: managed,
  annotations: { 'confer.dev/shared-at': g.sharedAt, 'confer.dev/expires-at': g.expiresAt },
})
// RBAC rules are plain strings, so the made-up `contacts.confer.dev` resource needs no CRD.
export const roleManifest = (g: Grant) => ({
  apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'Role', metadata: meta(g),
  rules: [{ apiGroups: ['confer.dev'], resources: ['contacts'], resourceNames: [g.attendee], verbs: g.verbs }],
})
export const roleBindingManifest = (g: Grant) => ({
  apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'RoleBinding', metadata: meta(g),
  subjects: [{ kind: 'User', apiGroup: 'rbac.authorization.k8s.io', name: subjectFor(g.booth) }],
  roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: grantName(g.attendee) },
})

/** The operator's whole decision, pure: given what the shares ask for and what Kubernetes has, what to do. */
export function reconcile(wanted: Grant[], found: Found[], now: number) {
  const expire = wanted.filter((g) => Date.parse(g.expiresAt) <= now)
  const live = wanted.filter((g) => !expire.includes(g) && g.verbs.length)
  const have = new Map(found.map((f) => [keyOf(f), f])), keep = new Set(live.map(grantKey)), expired = new Set(expire.map(grantKey))
  const whole = (g: Grant) => { const f = have.get(grantKey(g)); return f?.bound && f.verbs ? f : undefined }
  return {
    create: live.filter((g) => !whole(g)),
    update: live.filter((g) => { const f = whole(g); return f && (f.verbs!.join() !== g.verbs.join() || f.sharedAt !== g.sharedAt) }),
    revoke: found.filter((f) => !keep.has(keyOf(f)) && !expired.has(keyOf(f))), // the share is gone: Unshare
    expire, // past expires-at: the grant, the share and a receipt
  }
}

/** One Kubernetes API call. Throws when there is no cluster, it cannot be reached, or it answers with a status not in `allow`. */
async function k8s(method: string, path: string, body?: object, { type = 'application/json', allow = [] as number[] } = {}): Promise<any> {
  const url = apiUrl()
  if (!url) throw new Error('kubernetes unavailable')
  const res = await fetch(url + path, {
    method, body: body && JSON.stringify(body), signal: AbortSignal.timeout(5000),
    // The projected token rotates, so it is read on every call.
    headers: { 'content-type': type, ...(!process.env.K8S_API_URL && { authorization: `Bearer ${readFileSync(`${sa}/token`, 'utf8')}` }) },
  })
  const json = await res.json().catch(() => undefined)
  if (!res.ok && !allow.includes(res.status)) throw new Error(`kubernetes ${method} answered ${res.status} ${json?.reason ?? ''}`)
  return json
}

/** Asks Kubernetes itself (a SubjectAccessReview): may this booth use this verb on this attendee's contact? */
export async function canI(boothId: string, verb: string, attendeeId: string): Promise<'allowed' | 'denied' | 'unavailable'> {
  try {
    const review = await k8s('POST', '/apis/authorization.k8s.io/v1/subjectaccessreviews', {
      apiVersion: 'authorization.k8s.io/v1', kind: 'SubjectAccessReview',
      spec: { user: subjectFor(boothId), resourceAttributes: { namespace: boothNamespace(boothId), verb, group: 'confer.dev', resource: 'contacts', name: attendeeId } },
    })
    return review.status.allowed ? 'allowed' : 'denied'
  } catch {
    return 'unavailable'
  }
}

export async function listGrants(): Promise<Found[]> {
  const [roles, bindings] = await Promise.all(['roles', 'rolebindings'].map((kind) => k8s('GET', `${rbac}/${kind}?${selector}`)))
  const found = new Map<string, Found>(roles.items.map((r: any) => [keyOf(r.metadata), {
    namespace: r.metadata.namespace, name: r.metadata.name, verbs: r.rules?.[0]?.verbs ?? [], sharedAt: r.metadata.annotations?.['confer.dev/shared-at'], bound: false,
  }]))
  for (const { metadata: m } of bindings.items) found.set(keyOf(m), { namespace: m.namespace, name: m.name, ...found.get(keyOf(m)), bound: true })
  return [...found.values()]
}
export const listNamespaces = async (): Promise<string[]> => (await k8s('GET', `/api/v1/namespaces?${selector}`)).items.map((n: any) => n.metadata.name)
/** 409: it already exists, which is all we need. */
export const createNamespace = (boothId: string, displayName: string) => k8s('POST', '/api/v1/namespaces', namespaceManifest(boothId, displayName), { allow: [409] })
// Server-side apply: one call that creates or updates. The Role goes first, because Kubernetes only lets us bind a Role it can read.
export async function applyGrant(g: Grant) {
  for (const [kind, manifest] of [['roles', roleManifest(g)], ['rolebindings', roleBindingManifest(g)]] as const)
    await k8s('PATCH', `${rbac}/namespaces/${manifest.metadata.namespace}/${kind}/${manifest.metadata.name}?fieldManager=confer-operator&force=true`, manifest, { type: 'application/apply-patch+yaml' })
}
/** Deleting the binding is the revocation; the Role goes with it. 404: already gone. */
export const deleteGrant = (f: { namespace: string; name: string }) =>
  Promise.all(['rolebindings', 'roles'].map((kind) => k8s('DELETE', `${rbac}/namespaces/${f.namespace}/${kind}/${f.name}`, undefined, { allow: [404] })))
