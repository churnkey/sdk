import type { ChurnkeyClient } from '../client'
import { abTestTools } from './abtests'
import { accountTools } from './account'
import { auditTools } from './audit'
import { blueprintTools } from './blueprints'
import { dnsTools } from './dns'
import { dsrTools } from './dsr'
import { metricsTools } from './metrics'
import { paymentRecoveryTools } from './payment-recovery'
import { recoveryTools } from './recoveries'
import { segmentTools } from './segments'
import { sessionTools } from './sessions'
import { settingsTools } from './settings'
import type { ToolDefinition } from './types'

export function allTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    // Identity/context first — agents are nudged to call get_account before
    // acting (which org, which mode, what scopes).
    ...accountTools(client),
    ...sessionTools(client),
    ...metricsTools(client),
    ...recoveryTools(client),
    ...paymentRecoveryTools(client),
    ...blueprintTools(client),
    ...segmentTools(client),
    ...abTestTools(client),
    ...settingsTools(client),
    ...dnsTools(client),
    ...auditTools(client),
    ...dsrTools(client),
  ]
}

export type { ToolDefinition } from './types'
