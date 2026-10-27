// Pure display pipeline: host catalog groups + user config -> ordered sections.
// No DOM, no React: unit-testable in plain Node. The build script inlines this
// file into lib/client.js (it strips the `export ` keywords).

export const CONFIG_VERSION = 1
export const PARTITION_PREFIX = 'p:'
export const SORT_MODES = ['catalog', 'name', 'manual']

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
    order: {},
    tempHidden: [],
    badges: { show1017: true },
  }
}

// ---- colors --------------------------------------------------------------------------------
export const DEFAULT_CAP_COLOR = '#ffffff'

const clamp255 = (n) => Math.min(255, Math.max(0, Math.round(n)))
const toHex = (r, g, b) => '#' + [r, g, b].map((n) => clamp255(n).toString(16).padStart(2, '0')).join('')

/** Accepts "#rgb", "#rrggbb", "rrggbb", "r,g,b", "r g b" and "rgb(r, g, b)" (0-255). Returns "#rrggbb" (lower case) or undefined. */
export function parseColor(input) {
  if (typeof input !== 'string') return undefined
  const s = input.trim().toLowerCase()
  let m = /^#?([0-9a-f]{3})$/.exec(s)
  if (m) return '#' + Array.from(m[1]).map((c) => c + c).join('')
  m = /^#?([0-9a-f]{6})$/.exec(s)
  if (m) return '#' + m[1]
  m = /^(?:rgb\(\s*)?(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)?$/.exec(s)
  if (m) {
    const n = [m[1], m[2], m[3]].map(Number)
    if (n.every((x) => x <= 255)) return toHex(n[0], n[1], n[2])
  }
  return undefined
}

export function hexToRgb(hex) {
  const h6 = parseColor(hex) ?? DEFAULT_CAP_COLOR
  return [1, 3, 5].map((i) => parseInt(h6.slice(i, i + 2), 16))
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

function hslToRgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

/** WCAG relative luminance of an [r,g,b] (0-255) triple. */
export function relativeLuminance([r, g, b]) {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function contrastRatio(rgbA, rgbB) {
  const a = relativeLuminance(rgbA)
  const b = relativeLuminance(rgbB)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export const MIN_CAP_CONTRAST = 4.5

/**
 * Text color for a capsule filled with `hex`: same hue and saturation as the fill, with lightness pushed away
 * from it (darker on light fills, lighter on dark fills) in 1% steps until WCAG contrast reaches 4.5:1.
 * Black (or white) always clears 4.5:1 on the side chosen below, so the loop is guaranteed to stop in range.
 */
export function capTextColor(hex) {
  const bg = hexToRgb(hex)
  const [h, s, l] = rgbToHsl(bg)
  const goDark = relativeLuminance(bg) > 0.179 // the luminance where black and white contrast equally
  const step = goDark ? -0.01 : 0.01
  let tl = l
  for (let i = 0; i <= 100; i++) {
    const rgb = hslToRgb([h, s, Math.min(1, Math.max(0, tl))]).map(clamp255)
    if (contrastRatio(rgb, bg) >= MIN_CAP_CONTRAST) return toHex(...rgb)
    tl += step
  }
  return goDark ? '#000000' : '#ffffff'
}

/**
 * Suffix capsule after a model name: at most CAP_MAX characters (a sanity bound, the user decides the length).
 * Tone is a preset (blue / red / cyan) or `custom`, which carries a free `color` (#rrggbb, default white).
 * Empty text = no capsule.
 */
export const CAP_MAX = 20
export const CAP_TONES = ['blue', 'red', 'cyan', 'custom']
export function normalizeCap(v) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined
  const text = typeof v.text === 'string' ? Array.from(v.text.trim()).slice(0, CAP_MAX).join('') : ''
  if (text === '') return undefined
  const tone = CAP_TONES.includes(v.tone) ? v.tone : 'blue'
  if (tone !== 'custom') return { text, tone }
  return { text, tone, color: parseColor(v.color) ?? DEFAULT_CAP_COLOR }
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
  // Manual model order per section (section id -> model keys, top first). Used when the section's sort mode is `manual`.
  out.order = {}
  if (isObj(raw.order)) {
    for (const [sid, list] of Object.entries(raw.order)) {
      if (!Array.isArray(list)) continue
      const keys = [...new Set(list.filter((k) => typeof k === 'string' && k !== ''))]
      if (keys.length > 0) out.order[sid] = keys
    }
  }
  // Models hidden by hand for now (e.g. quota used up), independent of the permanent `hidden` flag.
  out.tempHidden = Array.isArray(raw.tempHidden) ? [...new Set(raw.tempHidden.filter((k) => typeof k === 'string' && k !== ''))] : []
  out.badges = { show1017: !(isObj(raw.badges) && raw.badges.show1017 === false) }
  return out
}

function sortEntries(entries, mode, order) {
  if (mode === 'catalog') return entries
  const idx = new Map(entries.map((e, i) => [e, i]))
  if (mode === 'manual') {
    // Listed keys first in the saved order; anything new (not listed) keeps catalog order after them.
    const rank = new Map((order ?? []).map((k, i) => [k, i]))
    const at = (e) => rank.get(e.key) ?? Infinity
    return [...entries].sort((a, b) => (at(a) === at(b) ? idx.get(a) - idx.get(b) : at(a) - at(b)))
  }
  const cmp = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  }[mode]
  return [...entries].sort((a, b) => cmp(a, b) || idx.get(a) - idx.get(b))
}

/**
 * Build the displayed sections.
 * @param groups host catalog groups [{id,name,models:[{id,name,reasoning?}]}]
 * @param rawConfig stored (possibly partial) config
 * @param opts { providerLabel?: (group)=>string, includeTempHidden?: boolean } includeTempHidden keeps temporarily
 *   hidden models (flagged `tempHidden`) in place; the settings preview uses it so they can be shown again.
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
  const tempHidden = new Set(config.tempHidden)
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
      const entry = makeEntry(g, m, pname, ov, ov.name ?? m.name)
      if (tempHidden.has(entry.key)) {
        if (!opts.includeTempHidden) continue
        entry.tempHidden = true
      }
      target.entries.push(entry)
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
  for (const s of sections) s.entries = sortEntries(s.entries, config.sort.bySection[s.id] ?? config.sort.default, config.order[s.id])
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
  delete next.order[PARTITION_PREFIX + id]
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

/** Temporarily hide / show one model (the picker skips it; the settings preview still lists it). */
export function setTempHidden(rawConfig, key, hidden) {
  const config = normalizeConfig(rawConfig)
  const rest = config.tempHidden.filter((k) => k !== key)
  return normalizeConfig({ ...config, tempHidden: hidden ? [...rest, key] : rest })
}

export function clearTempHidden(rawConfig) {
  return normalizeConfig({ ...normalizeConfig(rawConfig), tempHidden: [] })
}

/**
 * Preview drag-and-drop: put model `key` right before (or, with `after`, right after) `targetKey` inside
 * section `sectionId`. Freezes the section's current visible order into `order[sectionId]` and switches the
 * section to `manual` sorting, so the result is exactly what the preview showed.
 */
export function moveModelTo(groups, rawConfig, sectionId, key, targetKey, after = false, opts = {}) {
  const config = normalizeConfig(rawConfig)
  if (key === targetKey) return config
  const section = buildSections(groups, config, { ...opts, includeTempHidden: true }).sections.find((s) => s.id === sectionId)
  if (section === undefined) return config
  const keys = section.entries.map((e) => e.key)
  if (!keys.includes(key) || !keys.includes(targetKey)) return config
  keys.splice(keys.indexOf(key), 1)
  keys.splice(keys.indexOf(targetKey) + (after ? 1 : 0), 0, key)
  return normalizeConfig({
    ...config,
    order: { ...config.order, [sectionId]: keys },
    sort: { ...config.sort, bySection: { ...config.sort.bySection, [sectionId]: 'manual' } },
  })
}

/** Keyboard/button reorder: move model `key` up (-1) or down (+1) inside its section. */
export function moveModel(groups, rawConfig, sectionId, key, delta, opts = {}) {
  const config = normalizeConfig(rawConfig)
  const section = buildSections(groups, config, { ...opts, includeTempHidden: true }).sections.find((s) => s.id === sectionId)
  if (section === undefined) return config
  const keys = section.entries.map((e) => e.key)
  const i = keys.indexOf(key)
  const j = i + delta
  if (i < 0 || j < 0 || j >= keys.length) return config
  return moveModelTo(groups, config, sectionId, key, keys[j], delta > 0, opts)
}
