import { z } from 'zod'

// Short-form write-confirmation guard shared by the tool definitions. A mutating
// tool gates its write behind `confirm: confirmLiteral('<token>')`, forcing the
// caller to echo the exact token. The generic preserves the literal token type at
// each call site. Tools that need contextual confirmation guidance keep an inline
// z.literal/z.string with their own describe text rather than routing through this.
export const confirmLiteral = <T extends string>(token: T) =>
  z.literal(token).describe('Required confirmation literal.')
