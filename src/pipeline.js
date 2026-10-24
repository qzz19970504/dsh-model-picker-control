// Pure display pipeline: host catalog groups + user config -> ordered sections.
// No DOM, no React: unit-testable in plain Node. The build script inlines this
// file into lib/client.js (it strips the `export ` keywords).

export const CONFIG_VERSION = 1
export const PARTITION_PREFIX = 'p:'
export const SORT_MODES = ['catalog', 'name']

/** The host's hard-coded provider order (ui-model-selection orderModelProviders). */
export function hostProviderOrder(groups) {
  const rank = (id) => (id === 'deepseek-account' ? 0 : id === 'deepseek-official' ? 1 : 2)
  return groups.map((g, i) => ({ g, i })).sort((a, b) => rank(a.g.id) - rank(b.g.id) || a.i - b.i).map((x) => x.g)
}

export const modelKey = (providerId, modelId) => `${providerId}/${modelId}`

export function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    enabled: true,
    sectionOrder: [],
    providers: {},
    models: {},
    partitions: [],
    sort: { default: 'catalog', bySection: {} },
    badges: { show1017: true },
  }
}

/** Suffix capsule after a model name: at most CAP_MAX characters (a sanity bound, the user decides the length) and one of three tones. Empty text = no capsule. */
export const CAP_MAX = 20
export const CAP_TONES = ['blue', 'red', 'cyan']
export function normalizeCap(v) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined
  const text = typeof v.text === 'string' ? Array.from(v.text.trim()).slice(0, CAP_MAX).join('') : ''
  if (text === '') return undefined
  return { text, tone: CAP_TONES.includes(v.tone) ? v.tone : 'blue' }
}

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v) => (typeof v === 'string' ? v : undefined)

/** Coerce any stored value into a well-formed config (never throws, drops junk). */
export function normalizeConfig(raw) {
  const base = defaultConfig()
  if (!isObj(raw)) return base
  const out = { ...base }
  out.enabled = raw.enabled !== false
  out.sectionOrder = Array.isArray(raw.sectionOrder) ? [...new Set(raw.sectionOrder.filter((s) => typeof s === 'string'))] : []
  out.providers = {}
  if (isObj(raw.providers)) {
    for (const [id, v] of Object.entries(raw.providers)) {
      if (!isObj(v)) continue
      const p = {}
      if (str(v.name) !== undefined && v.name.trim() !== '') p.name = v.name.trim()
      if (v.hidden === true) p.hidden = true
      if (Object.keys(p).length > 0) out.providers[id] = p
    }
  }
  out.models = {}
  if (isObj(raw.models)) {
    for (const [key, v] of Object.entries(raw.models)) {
      if (!isObj(v)) continue
      const m = {}
      for (const f of ['name', 'partition']) if (str(v[f]) !== undefined && v[f].trim() !== '') m[f] = v[f].trim()
      // 0.1.x stored `badge` (text after the name); 0.2.0-rc.1 stored prefix/suffix with free colors. Both fold into `suffix`.
      const suffix = normalizeCap(v.suffix) ?? normalizeCap({ text: v.badge })
      if (suffix !== undefined) m.suffix = suffix
      if (v.hidden === true) m.hidden = true
      if (Object.keys(m).length > 0) out.models[key] = m
    }
  }
  out.partitions = []
  if (Array.isArray(raw.partitions)) {
    const seen = new Set()
    for (const p of raw.partitions) {
      if (!isObj(p) || typeof p.id !== 'string' || p.id === '' || seen.has(p.id)) continue
      seen.add(p.id)
      out.partitions.push({ id: p.id, name: str(p.name)?.trim() || p.id, ...(p.hidden === true ? { hidden: true } : {}) })
    }
  }
  const sort = isObj(raw.sort) ? raw.sort : {}
  out.sort = { default: SORT_MODES.includes(sort.default) ? sort.default : 'catalog', bySection: {} }
  if (isObj(sort.bySection)) for (const [k, v] of Object.entries(sort.bySection)) if (SORT_MODES.includes(v)) out.sort.bySection[k] = v
  out.badges = { show1017: !(isObj(raw.badges) && raw.badges.show1017 === false) }
  return out
}

function sortEntries(entries, mode) {
  if (mode === 'catalog') return entries
  const idx = new Map(entries.map((e, i) => [e, i]))
  const cmp = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  }[mode]
  return [...entries].sort((a, b) => cmp(a, b) || idx.get(a) - idx.get(b))
}

/**
 * Build the displayed sections.
 * @param groups host catalog groups [{id,name,models:[{id,name,reasoning?}]}]
 * @param rawConfig stored (possibly partial) config
 * @param opts { providerLabel?: (group)=>string }
 * @returns {{ sections, entries, byKey, config }} entries are the visible flat list in display order
 */
export function buildSections(groups, rawConfig, opts = {}) {
  const config = normalizeConfig(rawConfig)
  const providerLabel = opts.providerLabel ?? ((g) => g.name)
  const ordered = hostProviderOrder(groups)

  if (!config.enabled) {
    const sections = ordered.map((g) => ({
      id: g.id, kind: 'provider', name: providerLabel(g), hidden: false,
      entries: g.models.map((m) => makeEntry(g, m, providerLabel(g), {}, m.name)),
    })).filter((s) => s.entries.length > 0)
    return finish(sections, config, groups)
  }

  const partitionIds = new Set(config.partitions.map((p) => p.id))
  const buckets = new Map() // section id -> section
  const sectionOf = (id, kind, name, hidden) => {
    let s = buckets.get(id)
    if (s === undefined) buckets.set(id, (s = { id, kind, name, hidden, entries: [] }))
    return s
  }
  for (const g of ordered) sectionOf(g.id, 'provider', config.providers[g.id]?.name ?? providerLabel(g), config.providers[g.id]?.hidden === true)
  for (const p of config.partitions) sectionOf(PARTITION_PREFIX + p.id, 'partition', p.name, p.hidden === true)

  for (const g of ordered) {
    const pname = config.providers[g.id]?.name ?? providerLabel(g)
    for (const m of g.models) {
      const ov = config.models[modelKey(g.id, m.id)] ?? {}
      const inPartition = ov.partition !== undefined && partitionIds.has(ov.partition)
      const target = inPartition ? buckets.get(PARTITION_PREFIX + ov.partition) : buckets.get(g.id)
      const providerHidden = config.providers[g.id]?.hidden === true
      if (ov.hidden === true || (providerHidden && !inPartition)) continue
      target.entries.push(makeEntry(g, m, pname, ov, ov.name ?? m.name))
    }
  }

  // Section order: user order first (known ids only), partitions next (new ones surface first), then host order.
  const all = [...buckets.values()]
  const byId = new Map(all.map((s) => [s.id, s]))
  const ids = []
  for (const id of config.sectionOrder) if (byId.has(id) && !ids.includes(id)) ids.push(id)
  for (const s of all) if (s.kind === 'partition' && !ids.includes(s.id)) ids.push(s.id)
  for (const s of all) if (!ids.includes(s.id)) ids.push(s.id)
  // New (unordered) partitions go before an unordered provider, which matches ids' construction above only when sectionOrder is empty.
  const sections = ids.map((id) => byId.get(id)).filter((s) => !s.hidden)
  for (const s of sections) s.entries = sortEntries(s.entries, config.sort.bySection[s.id] ?? config.sort.default)
  return finish(sections.filter((s) => s.entries.length > 0), config, groups)
}

function makeEntry(group, model, providerName, ov, name) {
  return {
    key: modelKey(group.id, model.id),
    provider: group.id,
    providerName,
    model,
    name,
    suffix: ov.suffix,
  }
}

function finish(sections, config, groups) {
  const entries = sections.flatMap((s) => s.entries)
  const byKey = new Map(entries.map((e) => [e.key, e]))
  return { sections, entries, byKey, config, groups }
}

/** Rows for the /model popup: same grouping/order/names as the picker. */
export function popupRows(built, currentKey) {
  return built.sections.flatMap((s) => s.entries.map((e) => ({
    id: e.key,
    label: e.name,
    group: { name: s.id, label: s.name },
    ...(e.key === currentKey ? { active: true } : {}),
  })))
}

/** Helper for settings: merge a patch into config, pruning empties (idempotent). */
export function setModelOverride(config, key, patch) {
  const next = normalizeConfig(config)
  const merged = { ...(next.models[key] ?? {}), ...patch }
  for (const k of Object.keys(merged)) if (merged[k] === undefined || merged[k] === '' || merged[k] === false) delete merged[k]
  if (Object.keys(merged).length === 0) delete next.models[key]
  else next.models[key] = merged
  return normalizeConfig(next)
}

export function setProviderOverride(config, id, patch) {
  const next = normalizeConfig(config)
  const merged = { ...(next.providers[id] ?? {}), ...patch }
  for (const k of Object.keys(merged)) if (merged[k] === undefined || merged[k] === '' || merged[k] === false) delete merged[k]
  if (Object.keys(merged).length === 0) delete next.providers[id]
  else next.providers[id] = merged
  return normalizeConfig(next)
}

export function slugify(name) {
  const s = String(name).trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '')
  return s === '' ? 'p' : s
}

export function addPartition(config, name) {
  const next = normalizeConfig(config)
  let id = slugify(name)
  if (next.partitions.some((p) => p.id === id)) {
    let n = 2
    while (next.partitions.some((p) => p.id === `${id}-${n}`)) n++
    id = `${id}-${n}`
  }
  next.partitions.push({ id, name: String(name).trim() || id })
  next.sectionOrder = [PARTITION_PREFIX + id, ...next.sectionOrder]
  return { config: normalizeConfig(next), id }
}

export function removePartition(config, id) {
  const next = normalizeConfig(config)
  next.partitions = next.partitions.filter((p) => p.id !== id)
  next.sectionOrder = next.sectionOrder.filter((s) => s !== PARTITION_PREFIX + id)
  delete next.sort.bySection[PARTITION_PREFIX + id]
  for (const [k, v] of Object.entries(next.models)) if (v.partition === id) delete v.partition
  return normalizeConfig(next)
}

/** Full section id list in effective order (hidden ones included) for the settings reorder UI. */
export function effectiveSectionIds(groups, rawConfig) {
  const config = normalizeConfig(rawConfig)
  const known = [...hostProviderOrder(groups).map((g) => g.id), ...config.partitions.map((p) => PARTITION_PREFIX + p.id)]
  const ids = []
  for (const id of config.sectionOrder) if (known.includes(id) && !ids.includes(id)) ids.push(id)
  for (const id of known) if (id.startsWith(PARTITION_PREFIX) && !ids.includes(id)) ids.push(id)
  for (const id of known) if (!ids.includes(id)) ids.push(id)
  return ids
}

/** Drag-and-drop reorder: put `id` right before (or, with `after`, right after) `targetId`. */
export function moveSectionTo(groups, rawConfig, id, targetId, after = false) {
  const config = normalizeConfig(rawConfig)
  if (id === targetId) return config
  const ids = effectiveSectionIds(groups, config)
  if (!ids.includes(id) || !ids.includes(targetId)) return config
  ids.splice(ids.indexOf(id), 1)
  ids.splice(ids.indexOf(targetId) + (after ? 1 : 0), 0, id)
  return normalizeConfig({ ...config, sectionOrder: ids })
}

export function moveSection(groups, rawConfig, id, delta) {
  const config = normalizeConfig(rawConfig)
  const ids = effectiveSectionIds(groups, config)
  const i = ids.indexOf(id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= ids.length) return config
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  return normalizeConfig({ ...config, sectionOrder: ids })
}
