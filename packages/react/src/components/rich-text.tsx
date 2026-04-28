// Renders copy that may contain dashboard-authored HTML (offer body, step
// descriptions) as actual HTML rather than escaped text. Copy comes from a
// user's Churnkey dashboard, not user input, and
// merge fields are pre-substituted in the transform layer before the string
// reaches this component. If we ever need stricter hardening, sanitization
// (e.g. DOMPurify) should go here, not at every call site.

type RichTextTag = 'p' | 'div' | 'span'

interface RichTextProps {
  html: string | undefined | null
  as?: RichTextTag
  className?: string
}

export function RichText({ html, as = 'p', className }: RichTextProps) {
  if (!html) return null
  const Tag = as
  return (
    <Tag
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: see file-level comment
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
