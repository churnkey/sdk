// Catches a model slipping another writing system into a translation: a
// Vietnamese word in Khmer, Bengali letters in Maithili, an English word left
// in Hindi. Shared by the pack generator and the pack test; not imported at
// runtime.

const SCRIPTS = [
  'Latin',
  'Cyrillic',
  'Greek',
  'Arabic',
  'Devanagari',
  'Bengali',
  'Gujarati',
  'Gurmukhi',
  'Tamil',
  'Telugu',
  'Kannada',
  'Malayalam',
  'Sinhala',
  'Ethiopic',
  'Khmer',
  'Myanmar',
  'Thai',
  'Hangul',
  'Han',
  'Hiragana',
  'Katakana',
].map((name) => ({ name, test: new RegExp(`\\p{Script=${name}}`, 'u') }))

// Japanese and Chinese mix these by design.
const CJK = new Set(['Han', 'Hiragana', 'Katakana'])

/** What is wrong with `text`'s writing systems, or undefined. Placeholders are ignored. */
export function scriptProblem(text: string): string | undefined {
  const letters = text.replace(/\{\w+\}/g, '')
  const found = new Set<string>()
  for (const ch of letters) {
    const script = SCRIPTS.find((s) => s.test.test(ch))
    if (script) found.add(CJK.has(script.name) ? 'CJK' : script.name)
  }
  const other = [...found].filter((s) => s !== 'Latin')
  if (other.length > 1) return `mixes ${other.join(' and ')}`
  if (other.length === 1 && /\p{Script=Latin}{2,}/u.test(letters)) return `Latin letters inside ${other[0]}`
  return undefined
}
