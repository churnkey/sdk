import type { ChurnkeyClient } from '../client'
import { abTestTools } from './abtests'
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
    ...sessionTools(client),
    ...metricsTools(client),
    ...recoveryTools(client),
    ...paymentRecoveryTools(client),
    ...blueprintTools(client),
    ...segmentTools(client),
    ...abTestTools(client),
    ...settingsTools(client),
    ...dnsTools(client),
    ...dsrTools(client),
  ]
}

export type { ToolDefinition } from './types'
