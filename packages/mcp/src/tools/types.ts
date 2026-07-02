import type { z } from 'zod'

export interface ToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export interface ToolDefinition<Schema extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> {
  name: string
  title: string
  description: string
  inputSchema: Schema
  annotations?: ToolAnnotations
  /**
   * Whether this tool's results/effects depend on the live/test mode. Runtime
   * DATA reads (sessions, metrics, recoveries, campaigns) and live-traffic
   * actions (A/B lifecycle, campaign interrupts) are mode-scoped; CONFIGURATION
   * tools (blueprints, segments, settings) are not — config is shared across
   * modes. server.ts uses this to (a) append a mode-sensitivity note to the
   * description and (b) echo the effective mode in every result, so an agent
   * always knows which mode the data/action belongs to.
   */
  modeScoped?: boolean
  handler: (args: z.infer<Schema>) => Promise<unknown>
}
