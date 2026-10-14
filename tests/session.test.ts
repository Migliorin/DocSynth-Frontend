import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authenticatedFetch, clearSession, saveSession, sessionProfileSnapshot, subscribeSession } from '../src/features/auth/session.ts'

test('renews an expired access token and retries the original request', async () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  } as Storage
  Object.assign(globalThis, { sessionStorage: storage, localStorage: storage })
  saveSession({ accessToken: 'old', refreshToken: 'refresh-old', tokenType: 'Bearer', expiresIn: 3600, refreshExpiresAt: '' },
    { name: 'Ana', email: 'ana@example.com', role: 'USER' }, false)
  const calls: string[] = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    calls.push(url)
    if (url.endsWith('/auth/refresh')) {
      assert.equal(JSON.parse(String(init?.body)).refreshToken, 'refresh-old')
      return Response.json({ accessToken: 'new', refreshToken: 'refresh-new' })
    }
    return new Response(null, { status: (init?.headers as Record<string, string>).Authorization === 'Bearer old' ? 401 : 200 })
  }
  const response = await authenticatedFetch('/documents')
  assert.equal(response.status, 200)
  assert.deepEqual(calls.map((url) => new URL(url).pathname), ['/documents', '/auth/refresh', '/documents'])
  assert.equal(storage.getItem('docsynth-refresh-token'), 'refresh-new')
})

test('keeps the cached profile until logout and notifies the shared header', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  } as Storage
  const previousWindow = globalThis.window
  Object.assign(globalThis, { window: new EventTarget(), sessionStorage: storage, localStorage: storage })
  let changes = 0
  const unsubscribe = subscribeSession(() => { changes += 1 })
  try {
    const user = { name: 'Ana', email: 'ana@example.com', role: 'USER' as const }
    saveSession({ accessToken: 'access', refreshToken: 'refresh', tokenType: 'Bearer', expiresIn: 3600, refreshExpiresAt: '' }, user, false)
    assert.deepEqual(JSON.parse(sessionProfileSnapshot() || ''), user)
    assert.equal(changes, 1)
    clearSession()
    assert.equal(sessionProfileSnapshot(), null)
    assert.equal(changes, 2)
  } finally {
    unsubscribe()
    Object.assign(globalThis, { window: previousWindow })
  }
})
