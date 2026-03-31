export interface SessionCredentials {
  appId: string
  customerId: string
  subscriptionId?: string
  authHash: string
  mode: 'live' | 'test'
  issuedAt: number
}

/** Decode a session token created by `@churnkey/node`. */
export function decodeSessionToken(token: string): SessionCredentials {
  if (!token.startsWith('ck_')) {
    throw new Error('Invalid token: must start with "ck_"')
  }

  const encoded = token.slice(3)

  let json: string
  try {
    // base64url decode: replace URL-safe chars, add padding
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    json = atob(padded)
  } catch {
    throw new Error('Invalid token: malformed base64')
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(json)
  } catch {
    throw new Error('Invalid token: malformed JSON')
  }

  if (typeof payload.a !== 'string' || !payload.a) {
    throw new Error('Invalid token: missing appId')
  }
  if (typeof payload.c !== 'string' || !payload.c) {
    throw new Error('Invalid token: missing customerId')
  }
  if (typeof payload.h !== 'string' || !payload.h) {
    throw new Error('Invalid token: missing authHash')
  }

  return {
    appId: payload.a,
    customerId: payload.c,
    subscriptionId: typeof payload.s === 'string' ? payload.s : undefined,
    authHash: payload.h,
    mode: payload.m === 'test' ? 'test' : 'live',
    issuedAt: typeof payload.t === 'number' ? payload.t : 0,
  }
}
