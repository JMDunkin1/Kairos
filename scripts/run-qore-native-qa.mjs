import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const readJson = filename => fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : null

// Inspect one recorded PID, never signal a process found by a global executable-name search.
function inspectPid(pid) {
  try {
    const row = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'pid=,ppid=,stat=,comm='], { encoding: 'utf8', timeout: 1000 }).trim()
    const match = row.match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/)
    return match && !match[3].startsWith('Z') ? { pid: Number(match[1]), ppid: Number(match[2]), command: match[4] } : null
  } catch (error) { if (error.status === 1) return null; throw error }
}

export async function runNativeQA({ appPath = path.join(root, '.local/native-qa/QORE QA.app'), deadlineMs = 60000, terminateGraceMs = 2000, serviceGraceMs = 5500, signal } = {}) {
  const output = path.dirname(appPath)
  const reportFile = path.join(output, 'qa-result.json'), progressFile = path.join(output, 'qa-progress.json')
  fs.mkdirSync(output, { recursive: true })
  for (const filename of [reportFile, progressFile]) fs.rmSync(filename, { force: true })
  const errors = []
  const child = spawn(path.join(appPath, 'Contents/MacOS/QoreDesktop'), [], { stdio: ['ignore', 'inherit', 'inherit'] })
  const appPid = child.pid ?? null
  let exit = null, ownedService = null, lastProgress = null
  const exitPromise = new Promise(resolve => {
    child.once('error', error => { exit = { code: null, signal: null, error: error.message }; resolve(exit) })
    child.once('exit', (code, signal) => { exit = { code, signal }; resolve(exit) })
  })
  const observeService = () => {
    try {
      const progress = readJson(progressFile)
      if (progress?.appPid !== appPid) return null
      lastProgress = progress
      if (!Number.isInteger(progress.servicePid) || progress.servicePid <= 1) return null
      const current = inspectPid(progress.servicePid)
      if (!current) return null
      const runtime = fs.realpathSync(path.join(appPath, 'Contents/Resources/runtime/node'))
      if (fs.realpathSync(current.command) !== runtime) throw new Error('Recorded service PID has a different executable; cleanup refused.')
      if (!exit && current.ppid === appPid) ownedService = current
      return current
    } catch (error) { if (!errors.includes(error.message)) errors.push(error.message); return { unknown: true } }
  }
  const monitor = setInterval(observeService, 100)
  let timedOut = false, interrupted = false
  try {
    const reason = await new Promise(resolve => {
      const timer = setTimeout(() => done('deadline'), deadlineMs)
      const abort = () => done('interrupted')
      function done(value) { clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(value) }
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      exitPromise.then(() => done('exit'))
    })
    timedOut = reason === 'deadline'; interrupted = reason === 'interrupted'
    if (!exit) {
      observeService()
      child.kill('SIGTERM')
      await Promise.race([exitPromise, delay(terminateGraceMs)])
      if (!exit) { child.kill('SIGKILL'); await Promise.race([exitPromise, delay(terminateGraceMs)]) }
    }
    clearInterval(monitor)
    // Allow the bundled service's parent-death watchdog one full interval first.
    const serviceDeadline = Date.now() + serviceGraceMs
    let service = observeService()
    while (service && Date.now() < serviceDeadline) { await delay(100); service = observeService() }
    if (service && ownedService && !service.unknown && service.pid === ownedService.pid && service.command === ownedService.command && [appPid, 1].includes(service.ppid)) {
      for (const stopSignal of ['SIGTERM', 'SIGKILL']) {
        // Revalidate identity and parent immediately before each signal.
        service = observeService()
        if (!service || service.unknown || service.pid !== ownedService.pid || service.command !== ownedService.command || ![appPid, 1].includes(service.ppid)) break
        try { process.kill(service.pid, stopSignal) } catch (error) { if (error.code !== 'ESRCH') errors.push(error.message) }
        const stopDeadline = Date.now() + terminateGraceMs
        while (observeService() && Date.now() < stopDeadline) await delay(50)
      }
    }
    service = observeService()
    let report = null
    try { report = readJson(reportFile) } catch (error) { errors.push(`Invalid native QA report: ${error.message}`) }
    if (!report) {
      report = { status: 'failed', stage: lastProgress?.stage ?? 'native-process-launch', checks: lastProgress?.checks ?? [], appPid,
        error: exit?.error ?? (timedOut ? `Native app exceeded the ${deadlineMs}ms launcher deadline.` : interrupted ? 'Native QA interrupted.' : 'Native app exited without a QA report.') }
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2))
    }
    const result = { appPid, launcherPid: appPid, launchMethod: 'direct owned native executable', timedOut, interrupted,
      exit, appStopped: exit !== null, orphanPids: service?.pid ? [String(service.pid)] : [], serviceStopped: service === null, lastStage: lastProgress?.stage ?? 'native-process-launch', errors, report }
    fs.writeFileSync(path.join(output, 'qa-launch-and-stop.json'), JSON.stringify(result, null, 2))
    return result
  } finally { clearInterval(monitor) }
}

export async function runNativeQACLI() {
  const controller = new AbortController()
  const interrupt = () => controller.abort()
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt)
  try {
    const result = await runNativeQA({ signal: controller.signal })
    console.log(JSON.stringify(result))
    if (result.timedOut || result.interrupted || !result.appStopped || result.exit?.code !== 0 || result.report.status !== 'passed' || !result.serviceStopped || result.errors.length) process.exitCode = 1
  } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runNativeQACLI()
