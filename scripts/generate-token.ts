#!/usr/bin/env npx tsx
/**
 * Generate a real Churnkey session token for local testing.
 *
 * Usage:
 *   npx tsx sdk/scripts/generate-token.ts <appId> <apiKey> <customerId> [subscriptionId]
 *
 * Example:
 *   npx tsx sdk/scripts/generate-token.ts app_abc123 sk_live_xxx cus_123456
 *
 * Then open the playground with the token:
 *   http://localhost:5173/?token=ck_...
 */

import { createHmac } from 'node:crypto'

const [appId, apiKey, customerId, subscriptionId] = process.argv.slice(2)

if (!appId || !apiKey || !customerId) {
  console.error('Usage: npx tsx sdk/scripts/generate-token.ts <appId> <apiKey> <customerId> [subscriptionId]')
  console.error('')
  console.error('  appId          Your Churnkey app ID')
  console.error('  apiKey         Your Churnkey API key (secret)')
  console.error('  customerId     The Stripe/provider customer ID to test with')
  console.error('  subscriptionId (optional) Specific subscription ID')
  process.exit(1)
}

const authHash = createHmac('sha256', apiKey).update(customerId).digest('hex')

const payload = {
  a: appId,
  c: customerId,
  ...(subscriptionId ? { s: subscriptionId } : {}),
  h: authHash,
  m: 'live',
  t: Date.now(),
}

const json = JSON.stringify(payload)
const token = `ck_${Buffer.from(json).toString('base64url')}`

console.log('')
console.log('Token generated:')
console.log(token)
console.log('')
console.log('Open in playground:')
console.log(`  http://localhost:5173/?token=${token}`)
console.log('')
