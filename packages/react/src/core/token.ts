// Phase 4: JWT decode + hydration
// Will decode the session token and extract flow config

export function decodeSessionToken(_token: string): Record<string, unknown> {
  // Phase 4: implement JWT decode (base64url, no verification — server already signed)
  throw new Error('Token mode not yet implemented')
}
