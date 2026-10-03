import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assertHubRuntime } from './lib/qore-hub-runtime.mjs'

assertHubRuntime()
const root = fileURLToPath(new URL('..', import.meta.url))
if (process.platform !== 'darwin') throw new Error('Native desktop packaging currently supports macOS only.')
const architecture = { arm64: 'arm64', x64: 'x86_64' }[process.arch]
if (!architecture) throw new Error(`Unsupported macOS architecture: ${process.arch}.`)
const deploymentTarget = `${architecture}-apple-macosx13.0`
const qa = process.argv.includes('--qa')
const output = path.join(root, qa ? '.local/native-qa/QORE QA.app' : '.local/desktop/QORE Strategy Hub.app')
if (qa) fs.rmSync(path.join(root, '.local/native-qa/qa-result.json'), { force: true })
const contents = path.join(output, 'Contents'), resources = path.join(contents, 'Resources')
fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true })
fs.mkdirSync(path.join(resources, 'runtime'), { recursive: true })
const execute = (cmd, args) => { const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' }); if (r.status !== 0) throw new Error(`${cmd} failed.`) }
execute('npm', ['run', 'build'])
const appRoot = path.join(resources, 'hub')
fs.mkdirSync(path.join(appRoot, 'scripts/lib'), { recursive: true })
fs.mkdirSync(path.join(appRoot, 'src/hub'), { recursive: true })
fs.cpSync(path.join(root, 'dist'), path.join(appRoot, 'dist'), { recursive: true })
for (const name of ['types.ts', 'simulation.ts', 'fixture.ts', 'strategies.ts']) fs.copyFileSync(path.join(root, 'src/hub', name), path.join(appRoot, 'src/hub', name))
for (const name of ['qore-hub-store.mjs', 'qore-hub-ledger.mjs', 'qore-hub-runtime.mjs', 'qore-hub-state-migration.mjs', 'qore-hub-replay.mjs']) fs.copyFileSync(path.join(root, 'scripts/lib', name), path.join(appRoot, 'scripts/lib', name))
fs.cpSync(path.join(root, 'assets/released-replay'), path.join(appRoot, 'assets/released-replay'), { recursive: true })
fs.copyFileSync(path.join(root, 'scripts/qore-hub-service.mjs'), path.join(appRoot, 'scripts/qore-hub-service.mjs'))
fs.writeFileSync(path.join(appRoot, 'package.json'), '{"type":"module"}\n')
fs.copyFileSync(process.execPath, path.join(resources, 'runtime/node'))
fs.chmodSync(path.join(resources, 'runtime/node'), 0o755)
fs.writeFileSync(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>QoreDesktop</string><key>CFBundleIdentifier</key><string>local.qore.strategyhub.candidate</string><key>CFBundleName</key><string>QORE Strategy Hub</string><key>CFBundleDisplayName</key><string>QORE Strategy Hub</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.1.0</string><key>CFBundleVersion</key><string>1</string><key>LSMinimumSystemVersion</key><string>13.0</string><key>NSHighResolutionCapable</key><true/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>\n`)
const cache = path.join(root, '.local/swift-cache'); fs.mkdirSync(cache, { recursive: true })
let source = 'desktop/QoreDesktop.swift'
if (qa) {
  source = path.join(root, '.local/QoreDesktopQA-combined.swift')
  fs.writeFileSync(source, fs.readFileSync(path.join(root, 'desktop/QoreDesktop.swift'), 'utf8').replace('let app = NSApplication.shared', fs.readFileSync(path.join(root, 'desktop/QoreNativeQAState.swift'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'desktop/QoreDesktopQA.swift'), 'utf8') + '\nlet app = NSApplication.shared'))
}
execute('xcrun', ['swiftc', '-target', deploymentTarget, ...(qa ? ['-D', 'QORE_QA'] : []), '-module-cache-path', cache, '-framework', 'AppKit', '-framework', 'WebKit', source, '-o', path.join(contents, 'MacOS/QoreDesktop')])
execute('/usr/bin/codesign', ['--force', '--sign', '-', path.join(resources, 'runtime/node')])
execute('/usr/bin/codesign', ['--force', '--sign', '-', output])
console.log(`Native local candidate: ${output}`)
console.log('Double-click to launch. Runs persist in the dedicated Application Support folder. No external connection or order path.')
