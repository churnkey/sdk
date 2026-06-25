import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

// Reslice PR 1/2 (transport + OAuth + client infra): no tool definitions are
// registered yet. The full tool catalog lands in reslice PR 2/2.
export function allTools(_client: ChurnkeyClient): ToolDefinition[] {
  return []
}

export type { ToolDefinition } from './types'
