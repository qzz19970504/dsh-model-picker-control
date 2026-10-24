// Client stores: persisted configuration (via the Host half's fenced route) and the WorkBuddy usage snapshot.
// External-store shape (subscribe/getSnapshot) so React reads them with useSyncExternalStore.

const API = 'model-picker-control/api/'
const PROVIDER_REGIONS = new Map([['workbuddy', 'cn'], ['workbuddy-global', 'global']])
const regionOfProvider = (id) => PROVIDER_REGIONS.get(id)

function routeUrl(path) {
  return new URL(path.replace(/^\/+/, ''), document.baseURI).href
}

async function call(method, payload) {
  let response
  try {
    response = await fetch(routeUrl(API + method), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload ?? {}),
    })
  } catch (error) {
    const err = new Error(error instanceof Error ? error.message : String(error))
    err.code = 'network'
    throw err
  }
  let body
  try { body = await response.json() } catch { body = undefined }
  if (body === undefined || body.ok !== true) {
    const err = new Error(body?.error?.message ?? `HTTP ${response.status}`)
    err.code = body?.error?.code ?? `http-${response.status}`
    throw err
  }
  return body.value
}

function createExternalStore(initial) {
  let state = initial
  const listeners = new Set()
  return {
    getSnapshot: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    set(next) { if (next === state) return; state = next; for (const l of [...listeners]) l() },
  }
}

/** Persisted configuration. save() is optimistic, serialized, conflict-aware and rolls back on failure. */
function createConfigStore() {
  const store = createExternalStore({ config: normalizeConfig(undefined), revision: undefined, available: undefined, loaded: false, saving: false, error: undefined })
  let chain = Promise.resolve()

  const patchState = (p) => store.set({ ...store.getSnapshot(), ...p })

  async function load() {
    try {
      const v = await call('settings.get', {})
      patchState({ config: normalizeConfig(v.value), revision: v.revision, available: v.available !== false, loaded: true, error: undefined })
    } catch (error) {
      patchState({ loaded: true, available: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  /** @param change (config) => nextConfig. Resolves { ok } and never throws. */
  function save(change) {
    const run = async () => {
      const before = store.getSnapshot()
      const next = normalizeConfig(change(before.config))
      if (JSON.stringify(next) === JSON.stringify(before.config)) return { ok: true, unchanged: true }
      patchState({ config: next, saving: true, error: undefined })
      const attempt = async (config, revision) => call('settings.update', { picker: config, expectedRevision: revision })
      try {
        let result
        try {
          result = await attempt(next, before.revision)
        } catch (error) {
          if (error.code !== 'settings-conflict') throw error
          // Someone else (another tab) wrote: rebase our change on the fresh value and retry once.
          const fresh = await call('settings.get', {})
          const rebased = normalizeConfig(change(normalizeConfig(fresh.value)))
          result = await attempt(rebased, fresh.revision)
        }
        patchState({ config: normalizeConfig(result.value), revision: result.revision, saving: false, error: undefined })
        return { ok: true }
      } catch (error) {
        patchState({ config: before.config, saving: false, error: error instanceof Error ? error.message : String(error) })
        return { ok: false, error }
      }
    }
    const task = chain.then(run, run)
    chain = task.then(() => undefined, () => undefined)
    return task
  }

  return { ...store, load, save, getConfig: () => store.getSnapshot().config }
}
