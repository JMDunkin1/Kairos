export function assertHubRuntime(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number)
  if (!(major === 22 && minor >= 18 || major >= 24)) throw new Error(`QORE Strategy Hub requires Node 22.18+ (22.x) or Node 24+ for built-in TypeScript support; found ${version}.`)
}
