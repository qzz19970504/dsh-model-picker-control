// Ordered failover for folders ("families"). Pure of host imports: every host service is injected, so
// the whole relay can be driven by a fake in node:test. lib/index.js wires it to the real cordis events.
import { normalizeConfig, modelKey, pickFamilyMember, liveCooldowns, classifyFailure, cooldownUntil, highestEffort, relayMembers } from './pipeline.js'

const MAX_BINDINGS = 200
const RETRY_WINDOW_MS = 60_000 // a retry we asked for must reach the next request within this window to count as a hop

/**
 * @param {object} deps
 * @param {() => unknown} deps.getConfig       current raw `picker` config
 * @param {(sessionId: string, member: {provider: string, model: string}, reasoningEffort?: string) => Promise<unknown>} deps.selectModel
 * @param {(provider: string, model: string) => Promise<{reasoning?: unknown} | undefined>} [deps.resolveModelInfo]
 * @param {{ load(): {bindings?: object, cooldowns?: object}, save(state: object): void }} [deps.store]  persistence (optional)
 * @param {{ info?: Function, warn?: Function }} [deps.logger]
 * @param {() => number} [deps.now]
 */
export function createRelay(deps) {
  const now = deps.now ?? Date.now
  const log = deps.logger ?? {}
  const bindings = new Map() // sessionId -> familyId (insertion order = recency)
  const cooldowns = {} // modelKey -> epoch ms until which the member is skipped
  const inflight = new WeakMap() // agent -> { provider, key, hops } for the request currently in flight
  const retrying = new WeakMap() // agent -> hops, set when we asked for a retry and consumed by the next request

  try {
    const saved = deps.store?.load() ?? {}
    for (const [sid, fid] of Object.entries(saved.bindings ?? {})) if (typeof fid === 'string') bindings.set(sid, fid)
    for (const [key, until] of Object.entries(saved.cooldowns ?? {})) if (typeof until === 'number') cooldowns[key] = until
  } catch (error) {
    log.warn?.(`dsh-model-picker-control: could not read relay state: ${error instanceof Error ? error.message : String(error)}`)
  }

  const config = () => normalizeConfig(deps.getConfig())
  const familyOf = (id) => config().families.find((f) => f.id === id)
  const keyOf = (m) => modelKey(m.provider, m.model)
  const prune = () => {
    const live = liveCooldowns(cooldowns, now())
    for (const k of Object.keys(cooldowns)) if (live[k] === undefined) delete cooldowns[k]
  }
  const persist = () => {
    while (bindings.size > MAX_BINDINGS) bindings.delete(bindings.keys().next().value)
    try { deps.store?.save({ bindings: Object.fromEntries(bindings), cooldowns: { ...cooldowns } }) } catch (error) {
      log.warn?.(`dsh-model-picker-control: could not save relay state: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  // Members the picker shows inside the folder, minus those hidden by hand (the manual "this quota is gone" mark).
  const candidates = (family) => relayMembers(family, deps.getConfig())
  const pick = (family) => pickFamilyMember(candidates(family), cooldowns, now(), new Set(config().tempHidden))

  // A member taking over starts at its highest reasoning level (vendors differ, so the previous level is not portable).
  const topEffort = async (member) => {
    try { return highestEffort((await deps.resolveModelInfo?.(member.provider, member.model))?.reasoning) } catch { return undefined }
  }
  /** Re-select like a manual switch. Resolves true only when the host accepted it. */
  const select = async (agent, member, effort) => {
    try {
      await deps.selectModel(agent.id, member, effort)
      return true
    } catch (error) {
      log.warn?.(`dsh-model-picker-control: family switch to ${keyOf(member)} failed: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  // If no member could serve, the request itself was probably bad: give back the members parked for non-quota reasons.
  const release = (keys) => {
    if (keys.length === 0) return
    for (const k of keys) delete cooldowns[k]
    persist()
  }

  /** `agent/request` listener (outermost). `next()` yields the config the rest of the chain produced. */
  async function onRequest(payload, next) {
    const resolved = await next()
    const agent = payload.agent
    const pending = retrying.get(agent)
    retrying.delete(agent)
    const fresh = pending !== undefined && now() - pending.at < RETRY_WINDOW_MS
    const hops = fresh ? pending.hops : 0
    const chain = fresh ? pending.chain ?? [] : []
    if (!config().enabled) return resolved
    const familyId = bindings.get(agent.id)
    if (familyId === undefined) return resolved
    const family = familyOf(familyId)
    const current = modelKey(resolved.provider, resolved.model)
    if (family === undefined || !family.members.some((m) => keyOf(m) === current)) {
      bindings.delete(agent.id) // the session moved off the family by other means (e.g. /model): stop managing it
      persist()
      return resolved
    }
    prune()
    const target = pick(family)
    if (target === undefined) { inflight.set(agent, { provider: resolved.provider, key: current, hops, chain }); return resolved }
    const key = keyOf(target)
    if (key === current) { inflight.set(agent, { provider: resolved.provider, key, hops, chain }); return resolved }
    const effort = await topEffort(target)
    // If the host refuses the switch, keep the request where the UI says it is instead of silently re-routing it.
    if (!(await select(agent, target, effort))) { inflight.set(agent, { provider: resolved.provider, key: current, hops, chain }); return resolved }
    inflight.set(agent, { provider: target.provider, key, hops, chain })
    const { reasoningEffort: _effort, ...rest } = resolved
    return { ...rest, provider: target.provider, model: target.model, ...(effort === undefined ? {} : { reasoningEffort: effort }) }
  }

  /** `agent/request-error` listener. Returns `{kind:'retry'}` after moving to the next member, otherwise defers. */
  async function onError(payload, next) {
    const { agent, failure } = payload
    if (!config().enabled) return next()
    const route = inflight.get(agent)
    const familyId = bindings.get(agent.id)
    const family = familyId === undefined ? undefined : familyOf(familyId)
    const kind = classifyFailure(failure)
    if (family === undefined || route === undefined || kind === undefined) return next()
    // The error must belong to the request we routed: a late error from another provider must not park the wrong member.
    if (payload.provider !== undefined && payload.provider !== route.provider) return next()
    if (!family.members.some((m) => keyOf(m) === route.key)) return next()
    const chain = route.chain ?? []
    if (route.hops >= family.members.length) { release(chain); return next() } // every member had its turn for this request
    cooldowns[route.key] = cooldownUntil(kind, now())
    // Only quota-type parking is trusted for the whole day; a network or refusal parking is undone when no member could serve.
    const nextChain = kind === 'quota' ? chain : [...chain, route.key]
    prune()
    persist()
    const target = pick(family)
    if (target === undefined) { release(nextChain); return next() }
    log.info?.(`dsh-model-picker-control: family "${family.name}": ${route.key} unusable (${failure.code}), continuing on ${keyOf(target)}`)
    if (!(await select(agent, target, await topEffort(target)))) { release(nextChain); return next() }
    retrying.set(agent, { hops: route.hops + 1, at: now(), chain: nextChain })
    return { kind: 'retry' }
  }

  return {
    onRequest,
    onError,
    state(sessionId) {
      prune()
      return { familyId: sessionId === undefined ? undefined : bindings.get(sessionId), cooldowns: { ...cooldowns } }
    },
    bind(sessionId, familyId) {
      if (typeof familyId === 'string' && familyOf(familyId) !== undefined) {
        bindings.delete(sessionId) // re-insert so the newest binding survives the size cap
        bindings.set(sessionId, familyId)
      } else bindings.delete(sessionId)
      persist()
    },
    // key + until (epoch ms) parks a member by hand; key without until releases it; no key releases all.
    cooldown(payload) {
      if (typeof payload?.key !== 'string') { for (const k of Object.keys(cooldowns)) delete cooldowns[k] } else if (typeof payload.until === 'number' && payload.until > now()) cooldowns[payload.key] = payload.until
      else delete cooldowns[payload.key]
      persist()
      return { cooldowns: { ...cooldowns } }
    },
  }
}
