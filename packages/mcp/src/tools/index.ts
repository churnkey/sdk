import type { ChurnkeyClient } from '../client'
import { blueprintTools } from './blueprints'
import { dsrTools } from './dsr'
import { recoveryTools } from './recoveries'
import { segmentTools } from './segments'
import { sessionTools } from './sessions'
import type { ToolDefinition } from './types'

export function allTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    ...sessionTools(client),
    ...recoveryTools(client),
    ...blueprintTools(client),
    ...segmentTools(client),
    ...dsrTools(client),
  ]
}

export type { ToolDefinition } from './types'
