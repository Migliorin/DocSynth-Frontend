import { API } from '../../app/config/api.ts'
import type { AuthResponse, User } from './types.ts'

const keys = ['docsynth-token', 'docsynth-refresh-token', 'docsynth-user'] as const
const sessionEvent = 'docsynth-session-change'
let refreshPromise: Promise<string> | null = null

function notifySessionChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(sessionEvent))
}

export function subscribeSession(listener: () => void) {
  window.addEventListener(sessionEvent, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(sessionEvent, listener)
    window.removeEventListener('storage', listener)
  }
}

export function sessionProfileSnapshot() {
  return hasSession() ? sessionStore().getItem('docsynth-user') : null
}

export function sessionStore() {
  return sessionStorage.getItem('docsynth-refresh-token') || sessionStorage.getItem('docsynth-token')
    ? sessionStorage : localStorage
}

export function hasSession() {
  return Boolean(sessionStorage.getItem('docsynth-refresh-token') || localStorage.getItem('docsynth-refresh-token') || sessionStorage.getItem('docsynth-token') || localStorage.getItem('docsynth-token'))
}

function removeStoredSession() {
  for (const storage of [sessionStorage, localStorage]) for (const key of keys) storage.removeItem(key)
}

export function clearSession() {
  removeStoredSession()
  notifySessionChange()
}

export function saveSession(tokens: AuthResponse, user: User, persistent: boolean) {
  removeStoredSession()
  const storage = persistent ? localStorage : sessionStorage
  storage.setItem('docsynth-token', tokens.accessToken)
  storage.setItem('docsynth-refresh-token', tokens.refreshToken)
  storage.setItem('docsynth-user', JSON.stringify(user))
  notifySessionChange()
}

async function refreshToken() {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const storage = sessionStore()
    const token = storage.getItem('docsynth-refresh-token')
    if (!token) throw new Error('Sessão expirada.')
    const response = await fetch(`${API}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token }),
    })
    if (!response.ok) throw new Error('Sessão expirada.')
    const tokens = await response.json() as AuthResponse
    storage.setItem('docsynth-token', tokens.accessToken)
    storage.setItem('docsynth-refresh-token', tokens.refreshToken)
    return tokens.accessToken
  })().finally(() => { refreshPromise = null })
  return refreshPromise
}

export async function authenticatedFetch(path: string, options: RequestInit = {}) {
  const send = (token: string | null) => fetch(`${API}${path}`, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  })
  let token = sessionStore().getItem('docsynth-token')
  let response = await send(token)
  if (response.status === 401) {
    try {
      token = await refreshToken()
      response = await send(token)
    } catch {
      clearSession()
      ;(window.top ?? window).location.replace('/login')
      throw new Error('Sessão expirada.')
    }
    if (response.status === 401) {
      clearSession()
      ;(window.top ?? window).location.replace('/login')
    }
  }
  return response
}

export async function fetchUser(accessToken: string): Promise<User> {
  const response = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) throw new Error('Não foi possível carregar o perfil.')
  return response.json() as Promise<User>
}
