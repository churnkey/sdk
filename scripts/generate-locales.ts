#!/usr/bin/env npx tsx
/**
 * Generate the built-in locale packs under packages/react/src/locales.
 *
 * One JSON file per language, shaped like a `MessagesPatch` over
 * `defaultMessages`. Strings whose English matches an embed string are
 * copied from the embed's catalog so both surfaces say the same thing; the
 * rest go to the same model and prompt the API uses for blueprint
 * translations. Every pack is validated before it is written.
 *
 * Usage:
 *   OPENAI_API_KEY=... npx tsx scripts/generate-locales.ts [--force] [--only=es,tr]
 *   AWS_PROFILE=churnkey npx tsx scripts/generate-locales.ts --provider=bedrock
 *
 * The OpenAI path is the API's translation model and prompt. The Bedrock
 * path (Claude through the operator's AWS credentials and the `aws` CLI)
 * exists for when the OpenAI account can't be used; same prompt, same
 * validation. Only what changed is translated: strings a pack is missing,
 * and strings whose English differs from en.json, the catalog as of the last
 * run (a test fails when it drifts). --force redoes everything. CHURNKEY_EMBED_DIR
 * points at a churnkey-embed checkout (default: ../churnkey-embed next to
 * this repo); without one nothing is seeded.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { defaultMessages } from '../packages/react/src/core/messages'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'packages/react/src/locales')
const SOURCE_FILE = resolve(OUT_DIR, 'en.json')
const EMBED_DIR = process.env.CHURNKEY_EMBED_DIR ?? resolve(ROOT, '../churnkey-embed')

// Same model as churnkey-api's blueprint translation service (XDEV-2426).
const OPENAI_MODEL = 'gpt-4.1-mini'
const BEDROCK_MODEL = process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-5-5'
const BEDROCK_REGION = process.env.AWS_REGION ?? 'us-east-1'
const PER_CALL_TIMEOUT_MS = 45_000
const CONCURRENCY = 6
// USD per 1M tokens, for the cost line at the end. Bedrock figures are the
// Sonnet list price and only an estimate.
const PRICE = { openai: { input: 0.4, output: 1.6 }, bedrock: { input: 3, output: 15 } }
type Provider = keyof typeof PRICE

// The embed's built-in languages, in its order. English is `defaultMessages`.
const LANGUAGES: Record<string, string> = {
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  'zh-CN': 'Chinese Mandarin (Simplified)',
  hi: 'Hindi',
  ar: 'Arabic (Modern Standard)',
  bn: 'Bengali',
  'pt-BR': 'Portuguese (Brazil)',
  ru: 'Russian',
  ur: 'Urdu',
  id: 'Indonesian (Bahasa)',
  ja: 'Japanese',
  pcm: 'Nigerian Pidgin',
  sw: 'Swahili',
  mr: 'Marathi',
  te: 'Telugu',
  tr: 'Turkish',
  vi: 'Vietnamese',
  ko: 'Korean',
  ta: 'Tamil',
  jv: 'Javanese (Indonesia)',
  ha: 'Hausa (Nigeria)',
  it: 'Italian',
  'fa-IR': 'Persian (Farsi, Iran)',
  th: 'Thai',
  gu: 'Gujarati',
  pa: 'Punjabi (Gurmukhi)',
  'ms-MY': 'Malay (Malaysia)',
  my: 'Burmese (Myanmar)',
  yue: 'Chinese Cantonese (Traditional)',
  yo: 'Yoruba (Nigeria)',
  ig: 'Igbo (Nigeria)',
  kn: 'Kannada',
  ml: 'Malayalam',
  mai: 'Maithili',
  sd: 'Sindhi',
  ne: 'Nepali',
  si: 'Sinhala',
  km: 'Khmer',
  am: 'Amharic',
  om: 'Oromo',
  pl: 'Polish',
  uk: 'Ukrainian',
  bho: 'Bhojpuri',
  ro: 'Romanian',
  el: 'Greek',
  nl: 'Dutch (Netherlands)',
  az: 'Azerbaijani (Latin)',
  cs: 'Czech',
}

// Address the customer the way the embed catalog already does.
const REGISTER: Record<string, string> = {
  de: 'Address the reader formally (Sie).',
  fr: 'Address the reader formally (vous).',
  es: 'Address the reader informally (tú).',
  'pt-BR': 'Address the reader as você.',
  tr: 'Address the reader formally (siz).',
  it: 'Address the reader formally (Lei).',
  nl: 'Address the reader informally (je).',
  pl: 'Address the reader formally (Państwo/Pan/Pani forms are too stiff; use the neutral second person plural or impersonal phrasing).',
  ru: 'Address the reader formally (вы).',
  uk: 'Address the reader formally (ви).',
  ja: 'Use polite desu/masu style.',
  ko: 'Use polite 해요체.',
}

// Languages written in a non-Latin script: a Latin-only output means the
// model left the English in place.
const NON_LATIN = new Set([
  'zh-CN',
  'hi',
  'ar',
  'bn',
  'ru',
  'ur',
  'ja',
  'mr',
  'te',
  'ko',
  'ta',
  'fa-IR',
  'th',
  'gu',
  'pa',
  'my',
  'yue',
  'kn',
  'ml',
  'mai',
  'sd',
  'ne',
  'si',
  'km',
  'am',
  'el',
  'uk',
  'bho',
])

type Flat = Record<string, string>

function flatten(node: unknown, prefix = '', out: Flat = {}): Flat {
  if (typeof node === 'string') {
    if (node !== '') out[prefix] = node
    return out
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) flatten(value, prefix ? `${prefix}.${key}` : key, out)
  }
  return out
}

function unflatten(flat: Flat): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const [path, value] of Object.entries(flat)) {
    const keys = path.split('.')
    let node = root
    for (const key of keys.slice(0, -1)) {
      node[key] ??= {}
      node = node[key] as Record<string, unknown>
    }
    node[keys[keys.length - 1]] = value
  }
  return root
}

function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}

/** Problems with a pack, empty when it is good. `warnings` are not fatal. */
function validate(lang: string, source: Flat, pack: Flat): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  for (const path of Object.keys(pack)) if (!(path in source)) errors.push(`${path}: not in the catalog`)
  for (const [path, english] of Object.entries(source)) {
    const value = pack[path]
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${path}: missing`)
      continue
    }
    const want = placeholders(english)
    const got = placeholders(value)
    if (want.join() !== got.join())
      errors.push(`${path}: placeholders ${JSON.stringify(got)} != ${JSON.stringify(want)}`)
    const letters = value.replace(/\{\w+\}/g, '')
    if (NON_LATIN.has(lang) && ![...letters].some((ch) => ch.charCodeAt(0) > 127))
      errors.push(`${path}: still Latin script: ${value}`)
    else if (value === english && english.length > 3) warnings.push(`${path}: identical to English`)
  }
  return { errors, warnings }
}

// Embed strings with the same English, so both surfaces agree. An embed value
// equal to its own English is an untranslated leftover there, not a match.
async function loadEmbedSeeds(): Promise<Record<string, Flat>> {
  const file = resolve(EMBED_DIR, 'src/lang/all.ts')
  if (!existsSync(file)) {
    console.warn(`No embed catalog at ${file}; nothing seeded.`)
    return {}
  }
  const { messages } = (await import(pathToFileURL(file).href)) as { messages: Record<string, Record<string, string>> }
  const byEnglish = new Map<string, string[]>()
  for (const [key, value] of Object.entries(messages.en)) {
    if (typeof value !== 'string') continue
    byEnglish.set(value, [...(byEnglish.get(value) ?? []), key])
  }
  const source = flatten(defaultMessages)
  const seeds: Record<string, Flat> = {}
  for (const lang of Object.keys(LANGUAGES)) {
    const catalog = messages[lang]
    if (!catalog) continue
    const flat: Flat = {}
    for (const [path, english] of Object.entries(source)) {
      for (const key of byEnglish.get(english) ?? []) {
        const value = catalog[key]
        if (typeof value === 'string' && value.trim() && value !== english) {
          flat[path] = value
          break
        }
      }
    }
    seeds[lang] = flat
  }
  return seeds
}

const usage = { input: 0, output: 0 }

interface ModelRequest {
  system: string
  user: string
  schema: Record<string, unknown>
  maxTokens: number
}

async function callOpenAI({ system, user, schema, maxTokens }: ModelRequest): Promise<Flat> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
  const body = {
    model: OPENAI_MODEL,
    max_completion_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'translated_messages', strict: true, schema } },
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PER_CALL_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const json = (await res.json()) as any
  usage.input += json.usage?.prompt_tokens ?? 0
  usage.output += json.usage?.completion_tokens ?? 0
  const choice = json.choices?.[0]
  if (choice?.finish_reason === 'length') throw new Error('length limit')
  if (choice?.message?.refusal) throw new Error(`refusal: ${choice.message.refusal}`)
  return JSON.parse(choice.message.content)
}

// Claude on Bedrock through the AWS CLI, so the script needs no SDK and uses
// whatever credentials the operator already has. The schema goes in as a
// tool the model is told to call; forced tool choice isn't supported there.
async function callBedrock(request: ModelRequest): Promise<Flat> {
  return parseBedrock(invokeBedrock(request))
}

function invokeBedrock({ system, user, schema, maxTokens }: ModelRequest): any {
  const dir = mkdtempSync(resolve(tmpdir(), 'ck-locales-'))
  const bodyFile = resolve(dir, 'body.json')
  const outFile = resolve(dir, 'out.json')
  writeFileSync(
    bodyFile,
    JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      system: `${system}\nAnswer only by calling the translated_messages tool.`,
      messages: [{ role: 'user', content: user }],
      tools: [{ name: 'translated_messages', input_schema: schema }],
      tool_choice: { type: 'auto' },
    }),
  )
  try {
    execFileSync(
      'aws',
      [
        'bedrock-runtime',
        'invoke-model',
        '--region',
        BEDROCK_REGION,
        '--model-id',
        BEDROCK_MODEL,
        '--cli-binary-format',
        'raw-in-base64-out',
        '--content-type',
        'application/json',
        '--accept',
        'application/json',
        '--body',
        `file://${bodyFile}`,
        outFile,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'], timeout: PER_CALL_TIMEOUT_MS * 2 },
    )
    return JSON.parse(readFileSync(outFile, 'utf8'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function parseBedrock(json: any): Flat {
  usage.input += json.usage?.input_tokens ?? 0
  usage.output += json.usage?.output_tokens ?? 0
  if (json.stop_reason === 'max_tokens') throw new Error('length limit')
  const tool = (json.content as any[]).find((c) => c.type === 'tool_use')
  if (!tool) throw new Error(`no tool call in response: ${JSON.stringify(json.content).slice(0, 200)}`)
  return tool.input
}

async function translate(provider: Provider, lang: string, text: Flat): Promise<Flat> {
  if (Object.keys(text).length === 0) return {}
  const language = `${LANGUAGES[lang]} (${lang})`
  const system = `You're an expert ${language} translator for subscription cancellation flows. Think step-by-step:

1. Understand the original meaning and intent
2. Translate into natural, native-sounding ${language} that preserves:
   - Emotional tone and persuasiveness
   - Cultural resonance for ${LANGUAGES[lang]} speakers
   - Effectiveness of retention incentives
3. These are interface strings: button labels, headings, short notices. Keep them as short as the English.
4. Keep every {placeholder} token exactly as written, in braces, untranslated. Reorder it in the sentence if the grammar needs that.
5. Keep punctuation style (a trailing period or ellipsis stays).
${REGISTER[lang] ? `6. ${REGISTER[lang]}` : ''}
Return a JSON object with exactly the same keys as the input.`
  const request: ModelRequest = {
    system,
    user: JSON.stringify(text, null, 2),
    schema: {
      type: 'object',
      properties: Object.fromEntries(Object.keys(text).map((k) => [k, { type: 'string' }])),
      required: Object.keys(text),
      additionalProperties: false,
    },
    // Sized to the input so a runaway generation hits the cap quickly. Indic,
    // Khmer and Burmese scripts tokenize at several tokens per character, so
    // the ceiling is well above the API's one-token-per-char rule of thumb.
    maxTokens: Math.min(16000, Math.max(2048, JSON.stringify(text).length * 4)),
  }
  let lastError: Error | undefined
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return provider === 'openai' ? await callOpenAI(request) : await callBedrock(request)
    } catch (err) {
      lastError = err as Error
      const msg = `${lastError.message} ${(lastError as any).stderr ?? ''}`
      if (attempt === 1 && /length limit|timed out|timeout|JSON|5\d\d|429|Throttling|ETIMEDOUT/i.test(msg)) {
        console.warn(`${lang}: retrying after: ${msg.trim().slice(0, 200)}`)
        continue
      }
      throw lastError
    }
  }
  throw lastError
}

/** Strings to (re)translate for `lang`: everything under --force, else what the pack lacks or whose English changed. */
function stale(source: Flat, previous: Flat, existing: Flat | undefined, force: boolean): string[] {
  if (force || !existing) return Object.keys(source)
  const problems = new Set(validate('', source, existing).errors.map((e) => e.split(':')[0]))
  return Object.keys(source).filter((path) => problems.has(path) || previous[path] !== source[path])
}

async function generate(provider: Provider, lang: string, source: Flat, previous: Flat, seeds: Flat, force: boolean) {
  const file = resolve(OUT_DIR, `${lang}.json`)
  const existing = existsSync(file) ? flatten(JSON.parse(readFileSync(file, 'utf8'))) : undefined
  const paths = stale(source, previous, existing, force)
  if (paths.length === 0) return { lang, status: 'kept' as const }
  const pending: Flat = {}
  const seeded: Flat = {}
  for (const path of paths) {
    if (path in seeds) seeded[path] = seeds[path]
    else pending[path] = source[path]
  }
  const pack: Flat = { ...existing, ...seeded, ...(await translate(provider, lang, pending)) }
  const { errors, warnings } = validate(lang, source, pack)
  if (errors.length) {
    // One more try for just the failed paths.
    const retry: Flat = {}
    for (const e of errors) retry[e.split(':')[0]] = source[e.split(':')[0]]
    Object.assign(pack, await translate(provider, lang, retry))
    const again = validate(lang, source, pack)
    if (again.errors.length) throw new Error(`${lang}: ${again.errors.join('; ')}`)
  }
  const ordered: Flat = {}
  for (const path of Object.keys(source)) ordered[path] = pack[path]
  writeFileSync(file, `${JSON.stringify(unflatten(ordered), null, 2)}\n`)
  return {
    lang,
    status: 'written' as const,
    seeded: Object.keys(seeded).length,
    generated: Object.keys(pending).length,
    retried: errors.length > 0,
    warnings,
  }
}

async function main() {
  const force = process.argv.includes('--force')
  const providerArg = process.argv.find((a) => a.startsWith('--provider='))?.slice('--provider='.length)
  const provider: Provider = (providerArg as Provider) ?? (process.env.OPENAI_API_KEY ? 'openai' : 'bedrock')
  if (!(provider in PRICE)) throw new Error(`Unknown provider ${provider}`)
  const only = process.argv
    .find((a) => a.startsWith('--only='))
    ?.slice('--only='.length)
    .split(',')
  const langs = Object.keys(LANGUAGES).filter((l) => !only || only.includes(l))
  for (const l of only ?? []) if (!LANGUAGES[l]) throw new Error(`Unknown language ${l}`)
  mkdirSync(OUT_DIR, { recursive: true })
  const source = flatten(defaultMessages)
  const previous: Flat = existsSync(SOURCE_FILE) ? flatten(JSON.parse(readFileSync(SOURCE_FILE, 'utf8'))) : {}
  const seeds = await loadEmbedSeeds()
  console.log(
    `${Object.keys(source).length} strings, ${langs.length} languages, ${provider === 'openai' ? OPENAI_MODEL : BEDROCK_MODEL}`,
  )

  const results: Awaited<ReturnType<typeof generate>>[] = []
  const failures: string[] = []
  const queue = [...langs]
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let lang = queue.shift(); lang; lang = queue.shift()) {
        try {
          const r = await generate(provider, lang, source, previous, seeds[lang] ?? {}, force)
          results.push(r)
          if (r.status === 'written') {
            console.log(
              `${lang}: ${r.seeded} from embed, ${r.generated} generated${r.retried ? ' (retried)' : ''}${r.warnings.length ? `, ${r.warnings.length} identical to English` : ''}`,
            )
          }
        } catch (err) {
          failures.push(`${lang}: ${(err as Error).message}`)
          console.error(`${lang}: FAILED ${(err as Error).message}`)
        }
      }
    }),
  )
  const written = results.filter((r) => r.status === 'written')
  const price = PRICE[provider]
  const cost = (usage.input * price.input + usage.output * price.output) / 1e6
  console.log(`\n${written.length} written, ${results.length - written.length} kept, ${failures.length} failed`)
  console.log(
    `${provider === 'openai' ? OPENAI_MODEL : BEDROCK_MODEL}: ${usage.input} in / ${usage.output} out tokens, ~$${cost.toFixed(3)}`,
  )
  if (failures.length) process.exit(1)
  // Only once every pack is current: a failed language must still see the old English next run.
  if (!only) writeFileSync(SOURCE_FILE, `${JSON.stringify(unflatten(source), null, 2)}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
