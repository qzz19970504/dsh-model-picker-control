// dsh-model-picker-control — Host half.
//
// Owns exactly one thing: persistence of the picker configuration. The whole
// user configuration lives in ONE volatile field (`picker`) of this plugin's own
// Loader row, so a write is a live commit (no remount) that the settings service
// persists into the active profile through config-editor: comment-preserving,
// atomic, and never a rewrite of the whole cordis.patch.yml. No other plugin's
// row is ever touched.
import z from '@deepseek-ai/schemastery'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
// Failover logic: src/relay.js (built on the same pure src/pipeline.js as the client bundle); both ship in the package for this import.
import { createRelay } from '../src/relay.js'

export const name = 'dsh-model-picker-control'
export const PACKAGE_NAME = 'dsh-model-picker-control'
export const API_PREFIX = '/model-picker-control/api'
export const inject = ['webServer', 'connection']

/** Schemastery must be DSH's build: only it wraps volatile fields (see dsh-better-sidebar/src/config.ts). */
export const Config = z.object({
  picker: z.any().default({}).volatile().description('Model picker control configuration (managed by the settings page).'),
})

const MAX_BODY_BYTES = 256 * 1024

class PickerError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

function writeJson(res, status, body) {
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(text)
}

async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new PickerError('bad-request', 'request body too large', 413)
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new PickerError('bad-request', 'request body is not valid JSON')
  }
}

/** The Loader row id that mounted THIS package (bundle patch uses `model-picker-control`). */
function ownEntryId(ctx) {
  let fallback
  try {
    for (const entry of ctx.loader.entries()) {
      const id = entry.options.id
      if (entry.options.name !== PACKAGE_NAME || typeof id !== 'string' || id === '') continue
      if (entry.fiber === ctx.fiber) return id
      if (entry.disabled !== true && fallback === undefined) fallback = id
    }
  } catch {
    return undefined
  }
  return fallback
}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

export function apply(ctx) {
  const fence = (req) => ctx.connection.requestRejection(req) === undefined
  let face // { get(), update(value, expectedRevision) } once the settings service is up

  ctx.inject(['settings'], (sctx) => {
    const ns = ownEntryId(ctx)
    if (ns === undefined) {
      ctx.logger?.warn?.('dsh-model-picker-control: no loader row for this package; configuration is read-only')
      return
    }
    // The plugin ships its own settings page, so the generated auto-form is opted out.
    ctx.effect(() => sctx.settings.configure({ auto: false }, ctx.fiber), 'dsh-model-picker-control: settings page policy')
    const view = () => {
      const d = sctx.settings.describe({ redactSecrets: true }).find((c) => c.ns === ns)
      const value = d?.value?.picker
      return { value: isPlainObject(value) ? value : {}, revision: d?.revision }
    }
    face = {
      get: view,
      update: async (picker, expectedRevision) => {
        try {
          // `replace` (not `update`): update deep-merges plain objects, so removed overrides/partitions would survive a save.
          await sctx.settings.replace(ns, { picker }, expectedRevision)
        } catch (error) {
          if (error?.name === 'SettingsConflictError') throw new PickerError('settings-conflict', error.message, 409)
          throw new PickerError('settings-rejected', error instanceof Error ? error.message : String(error), 400)
        }
        return view()
      },
    }
    return () => { face = undefined }
  })

  // ---- families: ordered failover ---------------------------------------------------------------
  // The relay logic lives in src/relay.js (testable without a host). Here it is only wired to the real services.
  // Its small state (folder bindings + parked members) survives a DSH restart in <DSH_HOME>/state, deliberately NOT in
  // the `picker` config: a config write makes the host reload its whole model catalog.
  const stateFile = join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'state', `${PACKAGE_NAME}.json`)
  const store = {
    load: () => {
      try { return JSON.parse(readFileSync(stateFile, 'utf8')) } catch { return {} }
    },
    save: (state) => {
      mkdirSync(dirname(stateFile), { recursive: true })
      const tmp = `${stateFile}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(state))
      renameSync(tmp, stateFile)
    },
  }
  let host // { sessionController, llm } once injected
  const relay = createRelay({
    getConfig: () => face?.get().value,
    store,
    logger: ctx.logger,
    selectModel: (sessionId, member, reasoningEffort) => {
      if (host === undefined) throw new Error('session controller is not available')
      return host.sessionController.selectModel({ sessionId, provider: member.provider, model: member.model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) })
    },
    resolveModelInfo: (provider, model) => host?.llm.resolveModelInfo(provider, model),
  })

  ctx.inject(['sessionController', 'llm'], (sctx) => {
    host = sctx
    // Outermost, so the family route wins over the selection override that dsh-agent applies in its own listener.
    sctx.on('agent/request', (payload, next) => relay.onRequest(payload, next), { prepend: true })
    sctx.on('agent/request-error', (payload, next) => relay.onError(payload, next))
    return () => { if (host === sctx) host = undefined }
  })

  const api = {
    'family.state': (payload) => relay.state(typeof payload?.sessionId === 'string' ? payload.sessionId : undefined),
    'family.bind': (payload) => {
      if (typeof payload?.sessionId !== 'string' || payload.sessionId === '') throw new PickerError('bad-request', 'sessionId is required')
      relay.bind(payload.sessionId, payload.familyId)
      return { ok: true }
    },
    'family.cooldown': (payload) => relay.cooldown(payload),
    'settings.get': () => (face === undefined ? { value: undefined, revision: undefined, available: false } : { ...face.get(), available: true }),
    'settings.update': async (payload) => {
      if (face === undefined) throw new PickerError('settings-rejected', 'the settings service is not mounted in this deployment', 503)
      const picker = payload?.picker
      if (!isPlainObject(picker)) throw new PickerError('bad-request', 'picker must be a plain object')
      const expectedRevision = typeof payload.expectedRevision === 'number' ? payload.expectedRevision : undefined
      return { ...(await face.update(picker, expectedRevision)), available: true }
    },
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: async (req, res) => {
      if (!fence(req)) return writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
      if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } })
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith(`${API_PREFIX}/`) ? pathname.slice(API_PREFIX.length + 1) : undefined
      try {
        if (method === undefined || method.includes('/')) throw new PickerError('not-found', 'unknown API method', 404)
        const handler = Object.hasOwn(api, method) ? api[method] : undefined
        if (typeof handler !== 'function') throw new PickerError('not-found', `unknown API method "${method}"`, 404)
        const value = await handler(await readJsonBody(req))
        writeJson(res, 200, { ok: true, value })
      } catch (error) {
        const status = error instanceof PickerError ? error.status : 500
        const code = error instanceof PickerError ? error.code : 'internal'
        writeJson(res, status, { ok: false, error: { code, message: error instanceof Error ? error.message : String(error) } })
      }
    },
  }), 'dsh-model-picker-control: api routes')
}
