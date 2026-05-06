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
  handler: (args: z.infer<Schema>) => Promise<unknown>
}
