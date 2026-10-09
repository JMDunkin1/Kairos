#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadHistoricalReplay } from './lib/qore-hub-replay.mjs'
import { loadPaperBundle } from './lib/qore-hub-paper.mjs'
import { desktopCatalog } from './qore-hub-service.mjs'

const repo = fileURLToPath(new URL('..', import.meta.url))
if (process.platform !== 'darwin') throw new Error('Desktop installation supports macOS only.')
const destination = '/Applications/Kairos.app'
const formerDestination = '/Applications/QORE.app'
const installed = [destination, formerDestination].filter(filename => fs.existsSync(filename))
assert.ok(installed.length <= 1, 'Both Kairos and QORE are installed. Resolve the duplicate application before updating.')
const previousDestination = installed[0]
if (spawnSync('/usr/bin/pgrep', ['-f', '^/Applications/(QORE|Kairos)\\.app/Contents/MacOS/QoreDesktop([[:space:]]|$)']).status === 0) throw new Error('Quit Kairos (or the former QORE app) before installing an update.')
loadHistoricalReplay(); loadPaperBundle(); desktopCatalog()
const execute = (command, args) => {
  const result = spawnSync(command, args, { cwd: repo, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`)
}
execute('npm', ['run', 'build'])
const scratchRoot = path.join(repo, '.local/qore/build-staging')
fs.mkdirSync(scratchRoot, { recursive: true })
const work = fs.mkdtempSync(path.join(scratchRoot, 'install-'))
const app = path.join(work, 'Kairos.app'), resources = path.join(app, 'Contents/Resources')
const old = path.join(work, 'replaced-app')
let replaced = false
try {
  for (const directory of ['Contents/MacOS', 'Contents/Resources/runtime', 'Contents/Resources/hub/scripts/lib', 'Contents/Resources/hub/config']) fs.mkdirSync(path.join(app, directory), { recursive: true })
  const hub = path.join(resources, 'hub')
  fs.cpSync(path.join(repo, 'dist'), path.join(hub, 'dist'), { recursive: true })
  for (const directory of ['assets/offline-paper', 'assets/released-replay']) fs.cpSync(path.join(repo, directory), path.join(hub, directory), { recursive: true })
  for (const name of ['qore-hub-service.mjs', 'qore-command-bridge.mjs']) fs.copyFileSync(path.join(repo, 'scripts', name), path.join(hub, 'scripts', name))
  for (const name of ['qore-hub-ledger.mjs', 'qore-hub-replay.mjs', 'qore-hub-paper.mjs', 'qore-desktop-telemetry.mjs', 'qore-portfolio-control.mjs', 'qore-portfolio-plan.mjs', 'qore-portfolio-shadow.mjs']) fs.copyFileSync(path.join(repo, 'scripts/lib', name), path.join(hub, 'scripts/lib', name))
  fs.copyFileSync(path.join(repo, 'config/qore-desktop.json'), path.join(hub, 'config/qore-desktop.json'))
  fs.copyFileSync(path.join(repo, 'config/qore-portfolio-adapters.json'), path.join(hub, 'config/qore-portfolio-adapters.json'))
  fs.copyFileSync(path.join(repo, 'config/qore-portfolio-shadow.json'), path.join(hub, 'config/qore-portfolio-shadow.json'))
  fs.mkdirSync(path.join(hub, 'data/qore/market'), { recursive: true })
  fs.copyFileSync(path.join(repo, 'data/qore/market/index-basket-config.json'), path.join(hub, 'data/qore/market/index-basket-config.json'))
  fs.writeFileSync(path.join(hub, 'package.json'), '{"type":"module"}\n')
  fs.copyFileSync(process.execPath, path.join(resources, 'runtime/node')); fs.chmodSync(path.join(resources, 'runtime/node'), 0o755)
  const architecture = { arm64: 'arm64', x64: 'x86_64' }[process.arch]
  assert.ok(architecture, 'Unsupported Mac architecture.')
  const compile = (source, executable) => execute('/usr/bin/xcrun', ['swiftc', '-target', `${architecture}-apple-macosx13.0`, '-module-cache-path', path.join(work, 'swift-cache'), '-framework', 'AppKit', '-framework', 'WebKit', source, '-o', executable])
  compile('desktop/QoreDesktop.swift', path.join(app, 'Contents/MacOS/QoreDesktop'))
  const iconExecutable = path.join(work, 'QoreIcon'), iconset = path.join(work, 'Qore.iconset')
  compile('desktop/QoreIcon.swift', iconExecutable); execute(iconExecutable, [iconset, path.join(repo, 'desktop/assets/offset-icon.png')])
  execute('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', path.join(resources, 'Kairos.icns')])
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
  fs.writeFileSync(path.join(app, 'Contents/Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>QoreDesktop</string><key>CFBundleIdentifier</key><string>local.qore.desktop</string><key>CFBundleName</key><string>Kairos</string><key>CFBundleDisplayName</key><string>Kairos</string><key>CFBundleIconFile</key><string>Kairos.icns</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.2.1</string><key>CFBundleVersion</key><string>3</string><key>LSMinimumSystemVersion</key><string>13.0</string><key>NSHighResolutionCapable</key><true/><key>QORERepositoryPath</key><string>${escape(repo)}</string><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>\n`)
  const files = {}
  const inspect = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      assert.ok(!entry.isSymbolicLink(), 'The packaged hub cannot contain symlinks.')
      if (entry.isDirectory()) inspect(filename)
      else files[path.relative(hub, filename)] = createHash('sha256').update(fs.readFileSync(filename)).digest('hex')
    }
  }
  inspect(hub)
  const sourceRevision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim()
  const sourceDirty = spawnSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).stdout.trim() !== ''
  const manifest = { schemaVersion: 1, application: 'Kairos', sourceRevision, sourceDirty, catalogSha256: files['config/qore-desktop.json'], files, brokerSubmissionEnabled: false, syntheticStrategiesPackaged: false }
  fs.writeFileSync(path.join(resources, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  execute('/usr/bin/codesign', ['--force', '--sign', '-', path.join(resources, 'runtime/node')])
  execute('/usr/bin/codesign', ['--force', '--sign', '-', app])
  execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', app])
  if (previousDestination) {
    const id = spawnSync('/usr/libexec/PlistBuddy', ['-c', 'Print CFBundleIdentifier', path.join(previousDestination, 'Contents/Info.plist')], { encoding: 'utf8' }).stdout.trim()
    assert.equal(id, 'local.qore.desktop', 'Refusing to replace an unrelated application.')
    fs.renameSync(previousDestination, old); replaced = true
  }
  try { fs.renameSync(app, destination) }
  catch (error) { if (replaced) { fs.renameSync(old, previousDestination); replaced = false } throw error }
  // The replaced app is deleted; no archived app or build cache is retained.
  fs.rmSync(old, { recursive: true, force: true }); replaced = false
  execute('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', destination])
  console.log(`Installed ${destination}. Temporary build files and the replaced app were deleted.`)
} finally {
  if (replaced && !fs.existsSync(destination)) fs.renameSync(old, previousDestination)
  fs.rmSync(work, { recursive: true, force: true })
}
