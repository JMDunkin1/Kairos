import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { runNativeQA } from './run-qore-native-qa.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qore-native-qa-regression-'))
const live = pid => { try { process.kill(pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error } }
const children = []
try {
  const state = fs.readFileSync(path.join(root, 'desktop/QoreNativeQAState.swift'), 'utf8')
  const swiftTest = `${state}
func require(_ condition: @autoclosure () -> Bool, _ message: String) { if !condition() { fatalError(message) } }
func readResult(_ directory: URL) -> [String: Any] {
    return try! JSONSerialization.jsonObject(with: Data(contentsOf: directory.appendingPathComponent("qa-result.json"))) as! [String: Any]
}
let base = URL(fileURLWithPath: CommandLine.arguments[1])
func scenario(_ name: String) -> URL {
    let url = base.appendingPathComponent(name)
    try! FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}
let timeoutOutput = scenario("no-didFinish")
var timeoutFinishes = 0
let neverNavigated = QoreNativeQAState(output: timeoutOutput, timeout: 0.04) { timeoutFinishes += 1 }
neverNavigated.start()
neverNavigated.markStage("navigation-loading")
RunLoop.current.run(until: Date().addingTimeInterval(0.15))
let timeoutResult = readResult(timeoutOutput)
require(timeoutResult["status"] as? String == "failed", "No didFinish must produce a failed report")
require(timeoutResult["stage"] as? String == "navigation-loading", "Timeout must retain stalled startup stage")
require(timeoutFinishes == 1, "Deadline terminates exactly once")
let failureOutput = scenario("startup-failure")
var failureFinishes = 0
let startupFailure = QoreNativeQAState(output: failureOutput, timeout: 0.04) { failureFinishes += 1 }
startupFailure.start()
startupFailure.markStage("service-starting")
startupFailure.finish("The bundled simulation service could not start.")
startupFailure.finish()
RunLoop.current.run(until: Date().addingTimeInterval(0.1))
let failureResult = readResult(failureOutput)
require(failureResult["error"] as? String == "The bundled simulation service could not start.", "Startup error must survive deadline and duplicate finish")
require(failureFinishes == 1, "Startup failure terminates exactly once")
let passOutput = scenario("completed")
let completed = QoreNativeQAState(output: passOutput, timeout: 0.04) {}
completed.start()
completed.markStage("qa-started")
completed.checks.append("headless check")
completed.finish()
RunLoop.current.run(until: Date().addingTimeInterval(0.1))
require(readResult(passOutput)["status"] as? String == "passed", "Successful report must not be overwritten by deadline")
print("ok - startup failure, no-didFinish timeout, and terminal report idempotence")
`
  const swiftSource = path.join(tmp, 'main.swift'), swiftBinary = path.join(tmp, 'state-tests')
  fs.writeFileSync(swiftSource, swiftTest)
  const compile = spawnSync('/usr/bin/xcrun', ['swiftc', '-module-cache-path', path.join(tmp, 'swift-cache'), swiftSource, '-o', swiftBinary], { encoding: 'utf8', timeout: 30000 })
  assert.equal(compile.status, 0, compile.stderr)
  const swiftResult = spawnSync(swiftBinary, [tmp], { encoding: 'utf8', timeout: 5000 })
  assert.equal(swiftResult.status, 0, swiftResult.stderr)
  console.log(swiftResult.stdout.trim())
  const desktopSource = fs.readFileSync(path.join(root, 'desktop/QoreDesktop.swift'), 'utf8')
  assert.ok(desktopSource.indexOf('qa?.start()') < desktopSource.indexOf('launchService()'), 'deadline wired before startup')
  assert.match(desktopSource, /func fail\(_ detail: String\)[\s\S]*?#if QORE_QA\s+qa\?\.finish\(detail\)/, 'real startup failure uses the tested report path')
  const qaSource = fs.readFileSync(path.join(root, 'desktop/QoreDesktopQA.swift'), 'utf8')
  const chartsReady = JSON.parse(qaSource.match(/let chartsReady = ("[^\n]+")/)[1])
  const chartReady = (width, height, curve) => runInNewContext(chartsReady, { document: { querySelectorAll: () => [{ viewBox: { baseVal: { width, height } }, querySelectorAll: () => curve ? [{ getAttribute: () => curve }] : [] }] } })
  assert.equal(chartReady(1, 1, 'M48 18 L68 38'), false, 'snapshot waits for ResizeObserver measurement')
  assert.equal(chartReady(640, 400, null), false, 'snapshot requires a drawn series')
  assert.equal(chartReady(640, 400, 'M48 18 L540 380'), true, 'measured chart with a series is ready')
  assert.equal(runInNewContext(chartsReady, { document: { querySelectorAll: () => [] } }), true, 'non-chart views can be captured')
  console.log('ok - snapshots wait for measured chart geometry and a rendered curve')

  if (!process.argv.includes('--state-only')) {
  function fixture(name, body) {
    const output = path.join(tmp, name), appPath = path.join(output, 'QORE QA.app')
    fs.mkdirSync(path.join(appPath, 'Contents/MacOS'), { recursive: true })
    fs.mkdirSync(path.join(appPath, 'Contents/Resources/runtime'), { recursive: true })
    fs.symlinkSync(process.execPath, path.join(appPath, 'Contents/Resources/runtime/node'))
    fs.writeFileSync(path.join(appPath, 'Contents/MacOS/QoreDesktop'), `#!${process.execPath}\nimport fs from 'node:fs'; import { spawn } from 'node:child_process';\nconst output=${JSON.stringify(output)}; const runtime=${JSON.stringify(path.join(appPath, 'Contents/Resources/runtime/node'))};\n${body}`, { mode: 0o755 })
    return appPath
  }
  const limits = { deadlineMs: 600, terminateGraceMs: 150, serviceGraceMs: 100 }
  const passed = await runNativeQA({ ...limits, appPath: fixture('pass', `fs.writeFileSync(output+'/qa-result.json',JSON.stringify({status:'passed'}));`) })
  assert.equal(passed.exit.code, 0); assert.equal(passed.report.status, 'passed'); assert.equal(passed.serviceStopped, true)
  assert.equal(passed.launcherPid, passed.appPid, 'launcher owns the actual executable PID')
  console.log('ok - direct executable completes and reports clean ownership')

  const hungApp = fixture('hung', `process.on('SIGTERM',()=>{});fs.writeFileSync(output+'/qa-progress.json',JSON.stringify({appPid:process.pid,stage:'navigation-loading'}));setInterval(()=>{},1000);`)
  const before = Date.now()
  const hung = await runNativeQA({ ...limits, appPath: hungApp })
  assert.equal(hung.timedOut, true); assert.equal(hung.exit.signal, 'SIGKILL'); assert.equal(hung.appStopped, true)
  assert.equal(hung.report.stage, 'navigation-loading'); assert.equal(hung.report.status, 'failed'); assert.equal(live(hung.appPid), false)
  assert.ok(Date.now() - before < 3000, 'hung native app has a bounded cleanup')
  console.log('ok - hung launch escalates against the owned app PID and writes a staged failure')

  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' }); children.push(unrelated)
  const serviceApp = fixture('owned-service', `const service=spawn(runtime,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore',detached:true});fs.writeFileSync(output+'/qa-progress.json',JSON.stringify({appPid:process.pid,servicePid:service.pid,stage:'service-started'}));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`)
  const owned = await runNativeQA({ ...limits, appPath: serviceApp })
  const recorded = JSON.parse(fs.readFileSync(path.join(path.dirname(serviceApp), 'qa-progress.json'), 'utf8'))
  assert.equal(owned.serviceStopped, true, JSON.stringify(owned)); assert.deepEqual(owned.errors, [])
  assert.equal(live(recorded.servicePid), false, 'detached owned service is cleaned after parent death')
  assert.equal(live(unrelated.pid), true, 'unrelated process with the same executable survives')
  console.log('ok - cleanup targets the verified app child and preserves unrelated Node processes')

  const badOwnershipApp = fixture('foreign-service', `fs.writeFileSync(output+'/qa-progress.json',JSON.stringify({appPid:process.pid,servicePid:${unrelated.pid},stage:'service-started'}));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`)
  const foreign = await runNativeQA({ ...limits, appPath: badOwnershipApp })
  assert.equal(foreign.serviceStopped, false); assert.equal(live(unrelated.pid), true, 'unverified PID is never signaled')
  console.log('ok - recorded PID without parent ownership is reported and left untouched')

  const absent = await runNativeQA({ ...limits, appPath: path.join(tmp, 'missing/QORE QA.app') })
  assert.match(absent.exit.error, /ENOENT/); assert.equal(absent.report.status, 'failed'); assert.equal(absent.serviceStopped, true)
  const controller = new AbortController()
  const interruption = runNativeQA({ ...limits, deadlineMs: 5000, appPath: hungApp, signal: controller.signal })
  setTimeout(() => controller.abort(), 200)
  const interrupted = await interruption
  assert.equal(interrupted.interrupted, true); assert.equal(interrupted.appStopped, true); assert.equal(live(interrupted.appPid), false)
  console.log('ok - spawn failure and interruption remain bounded and produce failure evidence')
  }
} finally {
  for (const child of children) { child.kill('SIGKILL'); await new Promise(resolve => { if (child.exitCode !== null || child.signalCode !== null) resolve(); else child.once('exit', resolve) }) }
  fs.rmSync(tmp, { recursive: true, force: true })
}
