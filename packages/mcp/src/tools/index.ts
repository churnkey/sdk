import type { ChurnkeyClient } from '../client'
import { blueprintTools } from './blueprints'
import { dnsTools } from './dns'
import { dsrTools } from './dsr'
import { metricsTools } from './metrics'
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
    ...blueprintTools(client),
    ...segmentTools(client),
    ...settingsTools(client),
    ...dnsTools(client),
    ...dsrTools(client),
  ]
}

export type { ToolDefinition } from './types'
