// dsh-model-picker-control — Host half.
//
// Owns exactly one thing: persistence of the picker configuration. The whole
// user configuration lives in ONE volatile field (`picker`) of this plugin's own
// Loader row, so a write is a live commit (no remount) that the settings service
// persists into the active profile through config-editor: comment-preserving,
// atomic, and never a rewrite of the whole cordis.patch.yml. No other plugin's
// row is ever touched.
import z from '@deepseek-ai/schemastery'
// The same pure pipeline the client bundle is built from (src/pipeline.js ships in the package for this import).
import { normalizeConfig, modelKey, pickFamilyMember, liveCooldowns, nextLocalMidnight, FAILOVER_CODES, highestEffort, relayMembers } from '../src/pipeline.js'

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

  // ---- families: ordered failover -------------------------------------------------------------
  // A session is "bound" to a family when the user picked the family entry. On a quota-type failure the member in
  // use is parked until the next local midnight and the request is retried on the next member, by re-selecting that
  // model exactly like a manual switch (selectModel) and rewriting the retried request's route.
  const bindings = new Map() // sessionId -> familyId
  const routes = new WeakMap() // agent -> modelKey of the request currently in flight
  const cooldowns = {} // modelKey -> epoch ms until which the member is skipped
  const families = () => normalizeConfig(face?.get().value).families
  const familyOf = (id) => families().find((f) => f.id === id)
  const prune = () => {
    const live = liveCooldowns(cooldowns, Date.now())
    for (const k of Object.keys(cooldowns)) if (live[k] === undefined) delete cooldowns[k]
  }
  // Only members the picker shows inside the folder take part (a hidden or moved member must never receive a request).
  const relayOf = (family) => relayMembers(family, face?.get().value)
  const keyOfMember = (m) => modelKey(m.provider, m.model)
  // Members hidden by hand (the eye button) are skipped too: that is the manual "this quota is gone" mark.
  const hiddenByHand = () => new Set(normalizeConfig(face?.get().value).tempHidden)

  ctx.inject(['sessionController', 'llm'], (sctx) => {
    const switching = new WeakMap() // agent -> in-flight selectModel promise (avoid double selects)
    // A member taking over starts at its highest reasoning level (vendors differ, so the previous level is not portable).
    const topEffort = async (member) => {
      try { return highestEffort((await sctx.llm.resolveModelInfo(member.provider, member.model))?.reasoning) } catch { return undefined }
    }
    const select = (agent, member, reasoningEffort) => {
      const op = Promise.resolve(sctx.sessionController.selectModel({ sessionId: agent.id, provider: member.provider, model: member.model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }))
        .catch((error) => ctx.logger?.warn?.(`dsh-model-picker-control: family switch to ${keyOfMember(member)} failed: ${error instanceof Error ? error.message : String(error)}`))
        .finally(() => { if (switching.get(agent) === op) switching.delete(agent) })
      switching.set(agent, op)
      return op
    }

    // Outermost, so the family route wins over the selection override that dsh-agent applies in its own listener.
    sctx.on('agent/request', async (payload, next) => {
      const config = await next()
      const agent = payload.agent
      const familyId = bindings.get(agent.id)
      if (familyId === undefined) return config
      const family = familyOf(familyId)
      const current = modelKey(config.provider, config.model)
      if (family === undefined || !family.members.some((m) => keyOfMember(m) === current)) {
        bindings.delete(agent.id) // the session moved off the family by other means (e.g. /model): stop managing it
        return config
      }
      prune()
      const target = pickFamilyMember(relayOf(family), cooldowns, Date.now(), hiddenByHand())
      if (target === undefined) { routes.set(agent, current); return config }
      const key = keyOfMember(target)
      routes.set(agent, key)
      if (key === current) return config
      const effort = await topEffort(target)
      await select(agent, target, effort)
      const { reasoningEffort: _effort, ...rest } = config
      return { ...rest, provider: target.provider, model: target.model, ...(effort === undefined ? {} : { reasoningEffort: effort }) }
    }, { prepend: true })

    sctx.on('agent/request-error', async (payload, next) => {
      const { agent, failure } = payload
      const familyId = bindings.get(agent.id)
      const key = routes.get(agent)
      const family = familyId === undefined ? undefined : familyOf(familyId)
      if (family === undefined || key === undefined || !FAILOVER_CODES.includes(failure?.code)) return next()
      if (!family.members.some((m) => keyOfMember(m) === key)) return next()
      cooldowns[key] = nextLocalMidnight(Date.now())
      prune()
      const target = pickFamilyMember(relayOf(family), cooldowns, Date.now(), hiddenByHand())
      if (target === undefined) return next()
      ctx.logger?.info?.(`dsh-model-picker-control: family "${family.name}": ${key} unusable (${failure.code}), continuing on ${keyOfMember(target)}`)
      await select(agent, target, await topEffort(target))
      return { kind: 'retry' }
    })
  })

  const api = {
    'family.state': (payload) => {
      prune()
      const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : undefined
      return { familyId: sessionId === undefined ? undefined : bindings.get(sessionId), cooldowns: { ...cooldowns } }
    },
    'family.bind': (payload) => {
      if (typeof payload?.sessionId !== 'string' || payload.sessionId === '') throw new PickerError('bad-request', 'sessionId is required')
      if (typeof payload.familyId === 'string' && familyOf(payload.familyId) !== undefined) bindings.set(payload.sessionId, payload.familyId)
      else bindings.delete(payload.sessionId)
      return { ok: true }
    },
    // key + until (epoch ms) parks a member by hand; key without until releases it; no key releases all.
    'family.cooldown': (payload) => {
      if (typeof payload?.key !== 'string') { for (const k of Object.keys(cooldowns)) delete cooldowns[k] } else if (typeof payload.until === 'number' && payload.until > Date.now()) cooldowns[payload.key] = payload.until
      else delete cooldowns[payload.key]
      return { cooldowns: { ...cooldowns } }
    },
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
