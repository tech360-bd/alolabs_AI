import { useAppStore } from '@/store/app'

/** localStorage key for the auth token */
export const AUTH_TOKEN_KEY = 'alo_token'

/**
 * Get the current auth token from store or localStorage.
 * Store is preferred (hydrated on init); localStorage is the fallback.
 */
function getAuthToken(): string | null {
  // Primary: Zustand store (hydrated from localStorage on init)
  try {
    const storeToken = useAppStore.getState().token
    if (storeToken) return storeToken
  } catch {
    // Store may not be available in SSR or test contexts
  }
  // Fallback: direct localStorage read
  if (typeof window !== 'undefined') {
    return localStorage.getItem(AUTH_TOKEN_KEY)
  }
  return null
}

export async function fetchApi<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const selectedCompany = useAppStore.getState().selectedCompany
  if (selectedCompany) headers['x-company-slug'] = selectedCompany

  const res = await fetch(path, { ...options, headers })

  if (res.status === 401) {
    useAppStore.getState().logout()
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Request failed')
    throw new Error(text || `HTTP ${res.status}`)
  }

  return res.json()
}

/**
 * Low-level fetch that returns the raw Response object (does not parse JSON).
 * Useful for streaming endpoints (SSE, file downloads, blob responses).
 */
export async function fetchApiRaw(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAuthToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const selectedCompany = useAppStore.getState().selectedCompany
  if (selectedCompany) headers['x-company-slug'] = selectedCompany
  if (options.body && !headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(path, { ...options, headers })

  if (res.status === 401) {
    useAppStore.getState().logout()
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Request failed')
    throw new Error(text || `HTTP ${res.status}`)
  }

  return res
}

export function buildQueryString(params: Record<string, string | number | boolean | undefined | null>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value))
    }
  }
  const qs = searchParams.toString()
  return qs ? `?${qs}` : ''
}
