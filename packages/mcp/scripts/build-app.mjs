// Bundles the Retention Dashboard MCP App into one self-contained HTML file at
// dist/retention-dashboard.html. MCP App iframes run under a CSP with no
// network access, so the script and both stylesheets are inlined.
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = join(root, 'app/retention-dashboard')
const require = createRequire(import.meta.url)

// The MCP SDK resolves our zod 3 (whose `zod/v4` subpath it imports) while the
// OpenAI extensions ship zod 4; left alone the bundle carries both. Point every
// zod import at the zod 4 copy, which also serves the `zod/v4` subpath.
const openaiRequire = createRequire(require.resolve('@openai/mcp-extensions/app/styles.css'))
const zod4 = dirname(openaiRequire.resolve('zod/package.json'))

const result = await build({
  entryPoints: [join(appDir, 'main.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
  legalComments: 'none',
  alias: { zod: zod4 },
})
const script = result.outputFiles[0].text

const openaiStyles = await readFile(
  join(dirname(require.resolve('@openai/mcp-extensions/app/styles.css')), 'styles.css'),
  'utf8',
)
const appStyles = await readFile(join(appDir, 'styles.css'), 'utf8')
const template = await readFile(join(appDir, 'index.html'), 'utf8')

const inline = (tag, body) => `<${tag}>${body.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`)}</${tag}>`
const html = template
  .replace('<!-- OPENAI_STYLES -->', () => inline('style', openaiStyles))
  .replace('<!-- APP_STYLES -->', () => inline('style', appStyles))
  .replace('<!-- APP_SCRIPT -->', () => inline('script', script))

const out = join(root, 'dist/retention-dashboard.html')
await writeFile(out, html)
console.log(`retention-dashboard.html ${(html.length / 1024).toFixed(1)} KB`)
