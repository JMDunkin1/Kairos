import { spawn } from 'node:child_process'
import path from 'node:path'

// One owned child uses the existing sanitized, read-only M1 bridge. There is
// no arbitrary proxy destination or broker submission path in the desktop.
export function desktopTelemetry(origin, root) {
  let child = null
  let ready = null
  let stopped = false
  const ensure = () => {
    if (stopped) return Promise.reject(new Error('Kairos is closing.'))
    if (ready) return ready
    ready = new Promise((resolve, reject) => {
      child = spawn(process.execPath, [path.join(root, 'scripts/qore-command-bridge.mjs')], {
        cwd: root,
        env: { ...process.env, QORE_COMMAND_BRIDGE_PORT: '0', QORE_COMMAND_PARENT_PID: String(process.pid), QORE_DASHBOARD_SERVICE_ALLOWED_ORIGINS: origin },
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const owned = child
      let buffer = ''
      const timeout = setTimeout(() => { owned.kill('SIGTERM'); reject(new Error('The read-only connection could not start.')) }, 10_000)
      owned.stdout.on('data', chunk => {
        buffer += chunk
        if (buffer.length > 4096) { owned.kill('SIGTERM'); clearTimeout(timeout); reject(new Error('Invalid read-only connection startup.')); return }
        const match = buffer.match(/^(?:Kairos|QORE) Command bridge: (http:\/\/127\.0\.0\.1:\d+)\n/)
        if (match) { clearTimeout(timeout); resolve(match[1]) }
      })
      owned.once('error', () => { clearTimeout(timeout); reject(new Error('The read-only connection could not start.')) })
      owned.once('exit', () => { clearTimeout(timeout); if (child === owned) { child = null; ready = null } reject(new Error('The read-only connection stopped.')) })
    })
    return ready
  }
  return {
    async read(endpoint, method) {
      if (!((method === 'GET' && ['/api/live/status', '/api/connection/status'].includes(endpoint)) || (method === 'POST' && endpoint === '/api/live/refresh'))) throw new Error('Unsupported read-only request.')
      const upstream = await ensure()
      const response = await fetch(new URL(endpoint, upstream), { method, headers: { Accept: 'application/json', Origin: origin }, signal: AbortSignal.timeout(method === 'POST' ? 50_000 : 30_000) })
      const chunks = []
      let bytes = 0
      for await (const chunk of response.body) {
        bytes += chunk.length
        if (bytes > 512 * 1024) { await response.body.cancel().catch(() => {}); throw new Error('Read-only telemetry exceeded the size limit.') }
        chunks.push(chunk)
      }
      return { status: response.status, body: JSON.parse(Buffer.concat(chunks).toString()) }
    },
    async stop() {
      stopped = true
      if (!child) return
      const owned = child
      await new Promise(resolve => {
        const timeout = setTimeout(() => { owned.kill('SIGKILL'); resolve() }, 3_000)
        owned.once('exit', () => { clearTimeout(timeout); resolve() })
        owned.kill('SIGTERM')
      })
    },
  }
}
