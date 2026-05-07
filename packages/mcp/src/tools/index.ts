import type { ChurnkeyClient } from '../client'
import { dsrTools } from './dsr'
import { recoveryTools } from './recoveries'
import { sessionTools } from './sessions'
import type { ToolDefinition } from './types'

export function allTools(client: ChurnkeyClient): ToolDefinition[] {
  return [...sessionTools(client), ...recoveryTools(client), ...dsrTools(client)]
}

export type { ToolDefinition } from './types'
