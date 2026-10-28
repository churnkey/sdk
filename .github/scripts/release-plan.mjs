// Decides what a Release run publishes. Writes two outputs: `packages`, every
// package missing any of its npm version, `<name>@<version>` tag or GitHub
// release, and `builds`, the subset not yet on npm. So a run that failed after
// `npm publish` is finished by running the workflow again. Each entry carries
// the commit that set the version, and that is what gets built and tagged,
// not whatever main points at when the run happens.
import { execFileSync } from 'node:child_process'
import { appendFileSync, readdirSync, readFileSync } from 'node:fs'

// Versions kept by hand outside package.json. A release has to move them together.
const HAND_MAINTAINED = {
  '@churnkey/mcp': [
    { file: 'server.json', read: (s) => JSON.parse(s).version },
    { file: 'src/server.ts', read: (s) => s.match(/SERVER_VERSION = '([^']+)'/)?.[1] },
  ],
  '@churnkey/node': [{ file: 'src/index.ts', read: (s) => s.match(/VERSION = '([^']+)'/)?.[1] }],
}

const repo = process.env.GITHUB_REPOSITORY ?? 'churnkey/sdk'

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function npmView(spec, field) {
  try {
    return run('npm', ['view', spec, field])
  } catch (err) {
    if (String(err.stderr).includes('E404')) return '' // never published
    throw err
  }
}

function releaseExists(tag) {
  try {
    run('gh', ['api', `repos/${repo}/releases/tags/${tag}`, '--jq', '.id'])
    return true
  } catch (err) {
    if (String(err.stderr).includes('404')) return false
    throw err
  }
}

function tagSha(tag) {
  return run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]).split('\t')[0] || ''
}

// npm refuses a version below the current `latest` or a prerelease unless told
// which dist-tag to use. Neither is something a merge to main should publish.
function belowLatest(version, latest) {
  const a = version.split('-')[0].split('.').map(Number)
  const b = latest.split('-')[0].split('.').map(Number)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]
  return false
}

// The newest commit on main whose parent had a different version. First-parent
// only: without it a merge commit is simplified away and the answer is a commit
// inside the PR branch, missing whatever the PR changed after the bump.
function versionCommit(dir, version) {
  const shas = run('git', ['log', '--first-parent', '--format=%H', '--', `${dir}/package.json`])
    .split('\n')
    .filter(Boolean)
  for (const sha of shas) {
    let before
    try {
      before = JSON.parse(run('git', ['show', `${sha}~1:${dir}/package.json`])).version
    } catch {
      before = undefined // first commit of the file
    }
    if (before !== version) return sha
  }
  return shas.at(-1)
}

function handMaintainedMismatches(pkg, dir) {
  return (HAND_MAINTAINED[pkg.name] ?? [])
    .map(({ file, read }) => ({ file, found: read(readFileSync(`${dir}/${file}`, 'utf8')) }))
    .filter(({ found }) => found !== pkg.version)
}

const packages = []
let failed = false
for (const entry of readdirSync('packages')) {
  const dir = `packages/${entry}`
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'))
  if (pkg.private) continue
  const tag = `${pkg.name}@${pkg.version}`

  const published = npmView(tag, 'version') === pkg.version
  const tagged = Boolean(tagSha(tag))
  const released = releaseExists(tag)
  if (published && tagged && released) continue

  if (!published) {
    const latest = npmView(pkg.name, 'version')
    if (pkg.version.includes('-') || (latest && belowLatest(pkg.version, latest))) {
      console.log(`::notice::${tag} is a prerelease or below latest (${latest}); not published automatically.`)
      continue
    }
  }
  for (const { file, found } of handMaintainedMismatches(pkg, dir)) {
    console.log(`::error file=${dir}/${file}::${dir}/${file} says ${found}, package.json says ${pkg.version}.`)
    failed = true
  }

  packages.push({
    name: pkg.name,
    version: pkg.version,
    dir,
    slug: entry,
    tag,
    sha: versionCommit(dir, pkg.version),
    published,
    tagged,
    released,
  })
}
if (failed) process.exit(1)

console.log(packages.length ? `To release: ${packages.map((p) => p.tag).join(', ')}` : 'Nothing to release.')
const outputs = [
  `packages=${JSON.stringify(packages)}`,
  `builds=${JSON.stringify(packages.filter((p) => !p.published))}`,
]
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`)
else console.log(outputs.join('\n'))
