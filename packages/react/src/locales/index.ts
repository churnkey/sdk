// Built-in translations of the SDK chrome, one file per language, same list
// as the embed ships. Each entry is its own dynamic import so bundlers emit a
// chunk per language and an English visitor downloads none of them.
import type { MessagesPatch } from '../core/messages'

type PackLoader = () => Promise<{ default: MessagesPatch }>

// Keys are lowercase; see pickKey. Exported for the test that validates every pack.
export const packs: Record<string, PackLoader> = {
  am: () => import('./am.json'),
  ar: () => import('./ar.json'),
  az: () => import('./az.json'),
  bho: () => import('./bho.json'),
  bn: () => import('./bn.json'),
  cs: () => import('./cs.json'),
  de: () => import('./de.json'),
  el: () => import('./el.json'),
  es: () => import('./es.json'),
  'fa-ir': () => import('./fa-IR.json'),
  fr: () => import('./fr.json'),
  gu: () => import('./gu.json'),
  ha: () => import('./ha.json'),
  hi: () => import('./hi.json'),
  id: () => import('./id.json'),
  ig: () => import('./ig.json'),
  it: () => import('./it.json'),
  ja: () => import('./ja.json'),
  jv: () => import('./jv.json'),
  km: () => import('./km.json'),
  kn: () => import('./kn.json'),
  ko: () => import('./ko.json'),
  mai: () => import('./mai.json'),
  ml: () => import('./ml.json'),
  mr: () => import('./mr.json'),
  'ms-my': () => import('./ms-MY.json'),
  my: () => import('./my.json'),
  ne: () => import('./ne.json'),
  nl: () => import('./nl.json'),
  om: () => import('./om.json'),
  pa: () => import('./pa.json'),
  pcm: () => import('./pcm.json'),
  pl: () => import('./pl.json'),
  'pt-br': () => import('./pt-BR.json'),
  ro: () => import('./ro.json'),
  ru: () => import('./ru.json'),
  sd: () => import('./sd.json'),
  si: () => import('./si.json'),
  sw: () => import('./sw.json'),
  ta: () => import('./ta.json'),
  te: () => import('./te.json'),
  th: () => import('./th.json'),
  tr: () => import('./tr.json'),
  uk: () => import('./uk.json'),
  ur: () => import('./ur.json'),
  vi: () => import('./vi.json'),
  yo: () => import('./yo.json'),
  yue: () => import('./yue.json'),
  'zh-cn': () => import('./zh-CN.json'),
}

// Exact tag, then base language, then any pack sharing the base (pt-PT reads
// pt-BR, zh-TW reads zh-CN): the embed's loose match, so both surfaces pick
// the same language for the same visitor. English is the catalog itself.
function pickKey(table: Record<string, PackLoader>, locale: string): string | undefined {
  const exact = locale.toLowerCase()
  const base = exact.split('-')[0]
  if (base === 'en') return undefined
  if (table[exact]) return exact
  if (table[base]) return base
  return Object.keys(table).find((key) => key.split('-')[0] === base)
}

// A chunk that never arrives (blocked CDN, stalled connection) must not hold
// the flow: past this the visitor gets English.
const LOAD_TIMEOUT_MS = 5000

export interface LocaleLoader {
  /** Whether a pack exists for `locale`, without loading it. */
  has(locale: string): boolean
  /** The pack for `locale` if a previous load finished, so a remount can start in that language. */
  peek(locale: string): MessagesPatch | undefined
  /**
   * The pack for `locale`, or undefined for English, an unknown language, a
   * failed load, or one that did not finish in time. Never rejects. Loads
   * are shared across callers; a failure is not cached, so a later mount
   * tries again.
   */
  load(locale: string): Promise<MessagesPatch | undefined>
}

export function createLocaleLoader(table: Record<string, PackLoader>, timeoutMs = LOAD_TIMEOUT_MS): LocaleLoader {
  const pending = new Map<string, Promise<MessagesPatch | undefined>>()
  const ready = new Map<string, MessagesPatch>()
  return {
    has: (locale) => pickKey(table, locale) !== undefined,
    peek: (locale) => {
      const key = pickKey(table, locale)
      return key === undefined ? undefined : ready.get(key)
    },
    load: (locale) => {
      const key = pickKey(table, locale)
      if (key === undefined) return Promise.resolve(undefined)
      const done = ready.get(key)
      if (done) return Promise.resolve(done)
      let load = pending.get(key)
      if (!load) {
        load = table[key]()
          .then((mod) => {
            ready.set(key, mod.default)
            return mod.default
          })
          .catch(() => undefined)
          .finally(() => pending.delete(key))
        pending.set(key, load)
      }
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(undefined), timeoutMs)
        load.then((pack) => {
          clearTimeout(timer)
          resolve(pack)
        })
      })
    },
  }
}

const builtIn = createLocaleLoader(packs)

export const hasLocalePack = builtIn.has
export const peekLocaleMessages = builtIn.peek
export const loadLocaleMessages = builtIn.load
