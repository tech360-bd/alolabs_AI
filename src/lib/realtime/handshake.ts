/** Pull a bearer token out of a Socket.IO handshake. */
export function handshakeToken(handshake: { auth?: Record<string, unknown>; headers?: Record<string, unknown> }): string {
  const fromAuth = handshake.auth?.token
  if (typeof fromAuth === 'string' && fromAuth) return fromAuth
  const header = handshake.headers?.authorization
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
}
