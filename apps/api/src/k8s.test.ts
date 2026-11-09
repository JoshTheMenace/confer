import { afterEach, describe, expect, test, vi } from 'vitest'
import { boothNamespace, canI, grantName, grantOf, grantVerbs, namespaceManifest, reconcile, roleBindingManifest, roleManifest, subjectFor, type Found, type Grant } from './k8s.js'

vi.mock('./es.js', () => ({ es: {}, ix: {} }))
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const uuid = '0b1e7c1a-5a4f-4f0e-9a43-1c2d3e4f5a6b'
const grant = (attendee: string, over: Partial<Grant> = {}): Grant =>
  ({ booth: 'acme', attendee, verbs: ['read-email', 'export'], sharedAt: '2026-11-09T11:00:00.000Z', expiresAt: '2026-12-09T00:00:00.000Z', ...over })
const found = (attendee: string, over: Partial<Found> = {}): Found =>
  ({ namespace: 'booth-acme', name: `contact-${attendee}`, verbs: ['read-email', 'export'], sharedAt: '2026-11-09T11:00:00.000Z', bound: true, ...over })
const now = Date.parse('2026-11-10T00:00:00Z')

describe('names', () => {
  test('a booth namespace is a valid DNS label, and two different ids never share one', () => {
    expect(boothNamespace(uuid)).toBe(`booth-${uuid}`)
    for (const id of ['Acme Corp!', 'acme-corp', '___', 'x'.repeat(200), uuid]) expect(boothNamespace(id)).toMatch(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/)
    expect(boothNamespace('Acme')).not.toBe(boothNamespace('acme'))
  })

  test('the subject and the grant carry ids only', () => {
    expect(subjectFor('acme')).toBe('booth:acme')
    expect(grantName('ana')).toBe('contact-ana')
  })

  test('one verb per shared field, plus export when anything is shared', () => {
    expect(grantVerbs({ fields: ['email', 'github'] })).toEqual(['read-email', 'read-github', 'export'])
    expect(grantVerbs({ fields: [] })).toEqual([])
  })
})

describe('manifests', () => {
  test('a grant is a Role for one attendee and a RoleBinding to the booth, labeled and dated', () => {
    vi.stubEnv('EVENT_ENDS_AT', '2026-11-09T18:30:00-07:00')
    const g = grantOf({ from: 'ana', to: 'acme', fields: ['email'], via: 'manual', note: 'secret note', at: '2026-11-09T11:00:00.000Z' })
    expect(g.expiresAt).toBe('2026-12-10T01:30:00.000Z')
    const metadata = {
      name: 'contact-ana', namespace: 'booth-acme', labels: { 'app.kubernetes.io/managed-by': 'confer' },
      annotations: { 'confer.dev/shared-at': '2026-11-09T11:00:00.000Z', 'confer.dev/expires-at': '2026-12-10T01:30:00.000Z' },
    }
    expect(roleManifest(g)).toEqual({
      apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'Role', metadata,
      rules: [{ apiGroups: ['confer.dev'], resources: ['contacts'], resourceNames: ['ana'], verbs: ['read-email', 'export'] }],
    })
    expect(roleBindingManifest(g)).toEqual({
      apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'RoleBinding', metadata,
      subjects: [{ kind: 'User', apiGroup: 'rbac.authorization.k8s.io', name: 'booth:acme' }],
      roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: 'contact-ana' },
    })
    expect(JSON.stringify([roleManifest(g), roleBindingManifest(g)])).not.toContain('secret note')
  })

  test("the namespace carries the booth's public name and nothing else about it", () => {
    expect(namespaceManifest('acme', 'Acme Search')).toEqual({
      apiVersion: 'v1', kind: 'Namespace',
      metadata: { name: 'booth-acme', labels: { 'app.kubernetes.io/managed-by': 'confer' }, annotations: { 'confer.dev/booth': 'acme', 'confer.dev/display-name': 'Acme Search' } },
    })
  })
})

describe('reconcile', () => {
  test('in step: nothing to do', () => {
    expect(reconcile([grant('ana')], [found('ana')], now)).toEqual({ create: [], update: [], revoke: [], expire: [] })
  })

  test('a new share is created; so is a grant missing its binding or its Role', () => {
    const wanted = [grant('ana'), grant('ben'), grant('cy')]
    const plan = reconcile(wanted, [found('ben', { bound: false }), found('cy', { verbs: undefined })], now)
    expect(plan).toEqual({ create: wanted, update: [], revoke: [], expire: [] })
  })

  test('changed fields, or a newer share, update the grant', () => {
    const fields = grant('ana', { verbs: ['read-email', 'read-github', 'export'] }), again = grant('ben', { sharedAt: '2026-11-09T12:00:00.000Z' })
    expect(reconcile([fields, again], [found('ana'), found('ben')], now)).toEqual({ create: [], update: [fields, again], revoke: [], expire: [] })
  })

  test('Unshare: a grant with no share is revoked, in any booth', () => {
    const stray = found('ben', { namespace: 'booth-other' })
    expect(reconcile([grant('ana')], [found('ana'), found('ben'), stray], now).revoke).toEqual([found('ben'), stray])
  })

  test('a share with no fields grants nothing, and an existing grant for it is revoked', () => {
    const plan = reconcile([grant('ana', { verbs: [] })], [found('ana')], now)
    expect(plan).toEqual({ create: [], update: [], revoke: [found('ana')], expire: [] })
  })

  test('past expires-at: expired, not kept, and not counted as an Unshare', () => {
    const old = grant('ana', { expiresAt: '2026-11-09T00:00:00.000Z' })
    expect(reconcile([old, grant('ben')], [found('ana'), found('ben')], now)).toEqual({ create: [], update: [], revoke: [], expire: [old] })
  })
})

describe('canI', () => {
  const answer = (body: object, status = 201) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))

  test('asks Kubernetes with a SubjectAccessReview for the booth, in its namespace', async () => {
    vi.stubEnv('K8S_API_URL', 'http://k8s.test')
    answer({ status: { allowed: true } })
    expect(await canI('acme', 'export', 'ana')).toBe('allowed')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('http://k8s.test/apis/authorization.k8s.io/v1/subjectaccessreviews')
    expect(JSON.parse(init!.body as string).spec).toEqual({
      user: 'booth:acme', resourceAttributes: { namespace: 'booth-acme', verb: 'export', group: 'confer.dev', resource: 'contacts', name: 'ana' },
    })
    expect(init!.headers).not.toHaveProperty('authorization')
  })

  test('denied is a real answer; an error, or no cluster at all, is unavailable', async () => {
    vi.stubEnv('K8S_API_URL', 'http://k8s.test')
    answer({ status: { allowed: false } })
    expect(await canI('acme', 'export', 'ana')).toBe('denied')
    answer({ reason: 'Forbidden' }, 403)
    expect(await canI('acme', 'export', 'ana')).toBe('unavailable')
    vi.stubEnv('K8S_API_URL', '')
    expect(await canI('acme', 'export', 'ana')).toBe('unavailable')
  })
})
