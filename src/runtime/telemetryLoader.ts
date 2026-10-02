// UI request coordination only; every request still uses the read-only API.
export function createTelemetryLoader<T>(
  read: (refresh: boolean) => Promise<T>,
  handlers: {
    isActive: () => boolean
    onResult: (result: T) => void
    onError: (error: unknown) => void
    onBusy: (busy: boolean) => void
  },
) {
  let sequence = 0
  let refreshInFlight = false
  return {
    invalidate: () => { sequence += 1 },
    async load(refresh = false) {
      // A passive poll must not supersede a manual refresh or clear its busy state.
      if (refreshInFlight) return
      const ticket = ++sequence
      if (refresh) { refreshInFlight = true; handlers.onBusy(true) }
      try {
        const result = await read(refresh)
        if (handlers.isActive() && ticket === sequence) handlers.onResult(result)
      } catch (error) {
        if (handlers.isActive() && ticket === sequence) handlers.onError(error)
      } finally {
        if (refresh) refreshInFlight = false
        if (handlers.isActive() && ticket === sequence) handlers.onBusy(false)
      }
    },
  }
}
