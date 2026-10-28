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

// A "family" is a folder: an ordered list of models from ONE displayed section, shown as ONE picker entry that sits
// where its first member was. Its entry key cannot collide with a model key.
export const FAMILY_KEY_PREFIX = '$family/'

export function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    enabled: true,
    sectionOrder: [],
    providers: {},
    models: {},
    partitions: [],
    families: [],
    sort: { default: 'catalog', bySection: {} },
    order: {},
    tempHidden: [],
    badges: { show1017: true },
    headings: { art: true },
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
export const CAP_TONES = ['blue', 'red', 'cyan', 'custom', 'holo']
export function normalizeCap(v) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined
  const text = typeof v.text === 'string' ? Array.from(v.text.trim()).slice(0, CAP_MAX).join('') : ''
  // A capsule may be color only (empty text): that needs an explicit tone, otherwise empty text still means "no capsule".
  if (text === '' && !CAP_TONES.includes(v.tone)) return undefined
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
  out.families = []
  if (Array.isArray(raw.families)) {
    const seen = new Set()
    for (const f of raw.families) {
      if (!isObj(f) || typeof f.id !== 'string' || f.id === '' || seen.has(f.id)) continue
      seen.add(f.id)
      const members = []
      const memberSeen = new Set()
      if (Array.isArray(f.members)) {
        for (const m of f.members) {
          if (!isObj(m) || typeof m.provider !== 'string' || typeof m.model !== 'string' || m.provider === '' || m.model === '') continue
          const k = modelKey(m.provider, m.model)
          if (memberSeen.has(k)) continue
          memberSeen.add(k)
          members.push({ provider: m.provider, model: m.model })
        }
      }
      if (members.length < 2) continue // a folder of one is just a model
      const fam = { id: f.id, name: str(f.name)?.trim() || f.id, members }
      if (typeof f.section === 'string' && f.section !== '') fam.section = f.section
      const suffix = normalizeCap(f.suffix)
      if (suffix !== undefined) fam.suffix = suffix
      out.families.push(fam)
    }
  }
  out.badges = { show1017: !(isObj(raw.badges) && raw.badges.show1017 === false) }
  out.headings = { art: !(isObj(raw.headings) && raw.headings.art === false) }
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
 * @param opts { providerLabel?: (group)=>string, includeTempHidden?: boolean, families?: boolean,
 *   exhausted?: Set<modelKey>|string[], current?: modelKey } includeTempHidden keeps temporarily hidden models (flagged
 *   `tempHidden`) in place; the settings preview uses it so they can be shown again. `families: false` shows every
 *   member as a plain model (the /model popup cannot select a folder). `exhausted` greys family members; `current` is
 *   the model the session is on (the folder's active member).
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

  const folding = opts.families !== false
  const famByMember = new Map() // modelKey -> family
  if (folding) for (const f of config.families) for (const m of f.members) famByMember.set(modelKey(m.provider, m.model), f)
  const seenKeys = new Set()
  const folders = new Map() // family id -> { fam, home, at, found: Map<modelKey, member> }

  for (const g of ordered) {
    const pname = config.providers[g.id]?.name ?? providerLabel(g)
    for (const m of g.models) {
      const ov = config.models[modelKey(g.id, m.id)] ?? {}
      const inPartition = ov.partition !== undefined && partitionIds.has(ov.partition)
      const target = inPartition ? buckets.get(PARTITION_PREFIX + ov.partition) : buckets.get(g.id)
      const providerHidden = config.providers[g.id]?.hidden === true
      const mkey = modelKey(g.id, m.id)
      seenKeys.add(mkey)
      const fam = famByMember.get(mkey)
      if (fam !== undefined && (fam.section ?? target.id) === target.id && ov.hidden !== true && !(providerHidden && !inPartition)) {
        // Folded into its family: the folder takes the place of the first member found.
        let folder = folders.get(fam.id)
        if (folder === undefined) folders.set(fam.id, (folder = { fam, home: target, at: target.entries.length, found: new Map() }))
        folder.found.set(mkey, { provider: g.id, modelId: m.id, model: m, providerName: pname, name: ov.name ?? m.name })
        continue
      }
      if (ov.hidden === true || (providerHidden && !inPartition)) continue
      const entry = makeEntry(g, m, pname, ov, ov.name ?? m.name)
      if (tempHidden.has(entry.key)) {
        if (!opts.includeTempHidden) continue
        entry.tempHidden = true
      }
      target.entries.push(entry)
    }
  }

  const placed = [...folders.values()].sort((a, b) => b.at - a.at) // insert from the back so earlier indexes stay valid
  for (const { fam, home, at, found } of placed) {
    const entry = makeFamilyEntry(fam, found, seenKeys, opts, tempHidden)
    if (tempHidden.has(entry.key)) {
      if (!opts.includeTempHidden) continue
      entry.tempHidden = true
    }
    if (entry.unavailable && !opts.includeTempHidden) continue
    home.entries.splice(Math.min(at, home.entries.length), 0, entry)
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

/** One picker entry for a folder: shows the folder name and, as `via`, the member the session is really on. */
function makeFamilyEntry(fam, found, seenKeys, opts, tempHidden) {
  const exhausted = opts.exhausted instanceof Set ? opts.exhausted : new Set(opts.exhausted ?? [])
  const members = []
  for (const m of fam.members) {
    const key = modelKey(m.provider, m.model)
    const f = found.get(key)
    if (f !== undefined) members.push({ key, ...f, missing: false, exhausted: exhausted.has(key), tempHidden: tempHidden.has(key) })
    else if (!seenKeys.has(key)) members.push({ key, provider: m.provider, modelId: m.model, model: undefined, name: m.model, providerName: m.provider, missing: true, exhausted: false, tempHidden: false })
    // else: the model is hidden or lives in another section now; it is no longer part of this folder's display
  }
  const usable = members.filter((m) => !m.missing && !m.tempHidden)
  // The member the session is on is shown; otherwise the first usable one that still has quota.
  const active = usable.find((m) => m.key === opts.current) ?? usable.find((m) => !m.exhausted) ?? usable[0]
  const first = active ?? members.find((m) => !m.missing)
  return {
    key: FAMILY_KEY_PREFIX + fam.id, family: true, familyId: fam.id, section: fam.section,
    provider: first?.provider ?? '', providerName: first?.providerName ?? '', model: first?.model ?? { id: '', name: '' },
    name: fam.name, via: active?.name, suffix: fam.suffix, members, activeKey: active?.key, unavailable: active === undefined,
  }
}

/** The member to switch to when a folder is picked: the one in use if usable, else the first usable that is not exhausted. */
export function familyTarget(entry, currentKey) {
  const usable = entry.members.filter((m) => !m.missing && !m.tempHidden)
  return usable.find((m) => m.key === currentKey && !m.exhausted) ?? usable.find((m) => !m.exhausted) ?? usable[0]
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
  // A folder lives in one section; moving a member to another partition takes it out of the folder.
  if (Object.hasOwn(patch, 'partition')) next.families = next.families.map((f) => ({ ...f, members: f.members.filter((m) => modelKey(m.provider, m.model) !== key) }))
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
  next.families = next.families.filter((f) => f.section !== PARTITION_PREFIX + id)
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

// ---- families (editing) --------------------------------------------------------------------
const freezeOrder = (config, sectionId, keys) => ({
  ...config,
  order: { ...config.order, [sectionId]: keys },
  sort: { ...config.sort, bySection: { ...config.sort.bySection, [sectionId]: 'manual' } },
})
const sectionEntries = (groups, config, sectionId, opts = {}) =>
  buildSections(groups, config, { ...opts, includeTempHidden: true }).sections.find((s) => s.id === sectionId)?.entries
const uniqueFamilyId = (config, name) => {
  const base = slugify(name)
  let id = base
  for (let n = 2; config.families.some((f) => f.id === id); n++) id = `${base}-${n}`
  return id
}

/**
 * Preview drag-and-drop "into": put model `key` into the folder made by (or already at) `targetKey`, inside section
 * `sectionId`. Both must be entries of that same section (a plain model; a folder is only valid as the target);
 * anything else is refused and the config comes back unchanged. The section order is frozen so the folder keeps the
 * target's place.
 */
export function mergeIntoFamily(groups, rawConfig, sectionId, key, targetKey, opts = {}) {
  const config = normalizeConfig(rawConfig)
  if (key === targetKey || key.startsWith(FAMILY_KEY_PREFIX)) return config
  const entries = sectionEntries(groups, config, sectionId, opts)
  const dragged = entries?.find((e) => e.key === key)
  const target = entries?.find((e) => e.key === targetKey)
  if (dragged === undefined || target === undefined) return config
  const keys = entries.map((e) => e.key).filter((k) => k !== key)
  const member = { provider: dragged.provider, model: dragged.model.id }
  if (target.family) {
    const families = config.families.map((f) => (f.id === target.familyId ? { ...f, members: [...f.members, member] } : f))
    return normalizeConfig(freezeOrder({ ...config, families }, sectionId, keys))
  }
  const id = uniqueFamilyId(config, target.name)
  const fam = { id, name: target.name, section: sectionId, members: [{ provider: target.provider, model: target.model.id }, member] }
  keys[keys.indexOf(targetKey)] = FAMILY_KEY_PREFIX + id
  return normalizeConfig(freezeOrder({ ...config, families: [...config.families, fam] }, sectionId, keys))
}

/** patch: { name?, suffix? } (suffix undefined = no capsule). */
export function setFamily(rawConfig, id, patch) {
  const config = normalizeConfig(rawConfig)
  return normalizeConfig({ ...config, families: config.families.map((f) => {
    if (f.id !== id) return f
    const out = { ...f, ...patch }
    if (out.suffix === undefined) delete out.suffix
    return out
  }) })
}

/** Take members out of a folder (all of them, or just `only`); a folder left with fewer than two members dissolves. */
function releaseMembers(groups, rawConfig, id, only) {
  const config = normalizeConfig(rawConfig)
  const fam = config.families.find((f) => f.id === id)
  if (fam === undefined) return config
  const folderKey = FAMILY_KEY_PREFIX + id
  const all = fam.members.map((m) => modelKey(m.provider, m.model))
  const out = new Set(only === undefined ? all : [only])
  const remaining = fam.members.filter((m) => !out.has(modelKey(m.provider, m.model)))
  const dissolve = remaining.length < 2
  const released = all.filter((k) => dissolve || out.has(k))
  const families = config.families.flatMap((f) => (f.id !== id ? [f] : dissolve ? [] : [{ ...f, members: remaining }]))
  const next = { ...config, families, tempHidden: dissolve ? config.tempHidden.filter((k) => k !== folderKey) : config.tempHidden }
  const home = buildSections(groups, config, { includeTempHidden: true }).sections.find((s) => s.entries.some((e) => e.key === folderKey))
  if (home === undefined) return normalizeConfig(next)
  const keys = home.entries.map((e) => e.key)
  const at = keys.indexOf(folderKey)
  keys.splice(at, 1, ...(dissolve ? released : [folderKey, ...released]))
  return normalizeConfig(freezeOrder(next, home.id, keys))
}

/** Dissolve a folder: every member returns to the section as a plain model. */
export function dissolveFamily(groups, rawConfig, id) {
  return releaseMembers(groups, rawConfig, id, undefined)
}

/** Drag one member out of its folder (a folder left with one member dissolves). */
export function ungroupMember(groups, rawConfig, id, key) {
  return releaseMembers(groups, rawConfig, id, key)
}

/** Move a member up (-1) or down (+1); priority is the list order, top first. */
export function moveFamilyMember(rawConfig, id, key, delta) {
  const config = normalizeConfig(rawConfig)
  return normalizeConfig({ ...config, families: config.families.map((f) => {
    if (f.id !== id) return f
    const members = [...f.members]
    const i = members.findIndex((m) => modelKey(m.provider, m.model) === key)
    const j = i + delta
    if (i < 0 || j < 0 || j >= members.length) return f
    ;[members[i], members[j]] = [members[j], members[i]]
    return { ...f, members }
  }) })
}

/** Drag a member before/after another member of the same folder. */
export function moveFamilyMemberTo(rawConfig, id, key, targetKey, after = false) {
  const config = normalizeConfig(rawConfig)
  return normalizeConfig({ ...config, families: config.families.map((f) => {
    if (f.id !== id || key === targetKey) return f
    const members = [...f.members]
    const i = members.findIndex((m) => modelKey(m.provider, m.model) === key)
    if (i < 0) return f
    const [m] = members.splice(i, 1)
    const t = members.findIndex((x) => modelKey(x.provider, x.model) === targetKey)
    if (t < 0) return f
    members.splice(t + (after ? 1 : 0), 0, m)
    return { ...f, members }
  }) })
}

// ---- failover (pure; the host half drives it) ---------------------------------------------
/** Failure codes that make a member "unusable" (INVALID_REQUEST / context overflow are NOT here: another member would fail too). */
export const FAILOVER_CODES = ['QUOTA', 'ACCOUNT_QUOTA', 'RATE_LIMIT', 'AUTH']

export const NETWORK_CODES = ['TRANSPORT', 'SERVER', 'TIMEOUT']
export const NETWORK_COOLDOWN_MS = 10 * 60_000
export const REJECTED_COOLDOWN_MS = 60 * 60_000
const REJECTED_STATUSES = [400, 403, 404]

/** HTTP status of a failure: the explicit field, else a leading "400:" / "HTTP 400" in the message. */
function failureStatus(failure) {
  if (typeof failure?.status === 'number') return failure.status
  const m = /^\s*(\d{3})\s*:|HTTP\s*(\d{3})/i.exec(String(failure?.message ?? ''))
  return m ? Number(m[1] ?? m[2]) : undefined
}

/**
 * How a failed request should park its member, or undefined when another member would fail the same way.
 *  - 'quota'    QUOTA / ACCOUNT_QUOTA / RATE_LIMIT / AUTH: back at the next local midnight.
 *  - 'network'  TRANSPORT / SERVER / TIMEOUT (the host's own retries are spent by the time we see them): 10 minutes.
 *  - 'rejected' the provider refused this request with 400/403/404 (plan, channel, model not allowed): 1 hour.
 * CONTEXT_WINDOW_EXCEEDED and other codes never relay.
 */
export function classifyFailure(failure) {
  const code = failure?.code
  if (FAILOVER_CODES.includes(code)) return 'quota'
  if (NETWORK_CODES.includes(code)) return 'network'
  if ((code === 'PROVIDER_HTTP_ERROR' || code === 'INVALID_REQUEST') && REJECTED_STATUSES.includes(failureStatus(failure))) return 'rejected'
  return undefined
}

/** Epoch ms until which a member stays parked after a failure of the given kind. */
export function cooldownUntil(kind, now) {
  if (kind === 'network') return now + NETWORK_COOLDOWN_MS
  if (kind === 'rejected') return now + REJECTED_COOLDOWN_MS
  return nextLocalMidnight(now)
}

/** Epoch ms of the next local midnight after `now` (members come back the next day). */
export function nextLocalMidnight(now) {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime()
}

/** Drop cooldown entries whose time has passed. cooldowns: { [modelKey]: untilEpochMs }. */
export function liveCooldowns(cooldowns, now) {
  const out = {}
  for (const [k, until] of Object.entries(cooldowns ?? {})) if (typeof until === 'number' && until > now) out[k] = until
  return out
}

/**
 * The member to run a family request on: the first member (top first) that is not cooling down. Because a failed member
 * stays parked until the next local midnight, this is naturally sticky on the member that took over, and it returns to
 * the top member once its cooldown has ended. Returns undefined when every member is cooling down.
 * @param members [{provider, model}] in priority order; `skip` (Set of keys) = members hidden by hand
 */
export function pickFamilyMember(members, cooldowns, now, skip) {
  const live = liveCooldowns(cooldowns, now)
  return members.find((m) => live[modelKey(m.provider, m.model)] === undefined && !(skip?.has(modelKey(m.provider, m.model)) ?? false))
}

// ---- reasoning effort across a folder ------------------------------------------------------------
// A folder offers the effort levels of its top member (members of different vendors rarely agree), and a
// failover lands on the highest level of the member it moves to.

/** Highest level a model offers (levels are listed low -> high), or undefined for a model without reasoning. */
export function highestEffort(reasoning) {
  const efforts = reasoning?.efforts
  return Array.isArray(efforts) && efforts.length > 0 ? efforts[efforts.length - 1].id : undefined
}

/** The folder's own reasoning options: those of its first member that exists in the catalog. */
export function familyReasoning(entry) {
  return entry.members.find((m) => !m.missing)?.model?.reasoning
}

/** Translate an effort id of `from` into one `to` accepts: same id if offered, else the same relative rank. */
export function mapEffort(from, to, effortId) {
  if (effortId === undefined || to === undefined) return undefined
  if (to.efforts.some((e) => e.id === effortId)) return effortId
  const fromIds = from?.efforts.map((e) => e.id) ?? []
  const at = fromIds.indexOf(effortId)
  if (at < 0 || fromIds.length < 2) return to.defaultEffort ?? highestEffort(to)
  return to.efforts[Math.round((at / (fromIds.length - 1)) * (to.efforts.length - 1))].id
}

// ---- which members actually relay ---------------------------------------------------------------------
/**
 * The members of a folder that take part in the relay: the ones the picker would show inside the folder. Hidden
 * models, models of a hidden provider (unless a partition brings them back) and models that now sit in another
 * section never receive a request. The host half has no catalog, so this is decided from the saved config alone;
 * it mirrors the folding rule in buildSections.
 */
export function relayMembers(fam, rawConfig) {
  const config = normalizeConfig(rawConfig)
  const partitionIds = new Set(config.partitions.map((p) => p.id))
  return fam.members.filter((m) => {
    const ov = config.models[modelKey(m.provider, m.model)] ?? {}
    const inPartition = ov.partition !== undefined && partitionIds.has(ov.partition)
    const sectionId = inPartition ? PARTITION_PREFIX + ov.partition : m.provider
    if (ov.hidden === true) return false
    if (config.providers[m.provider]?.hidden === true && !inPartition) return false
    return (fam.section ?? sectionId) === sectionId
  })
}

// ---- bulk capsule colors --------------------------------------------------------------------------------
/**
 * Give every model shown in a section (folders count as one) the same capsule color. Text that is already there is
 * kept; a model without a capsule gets a color-only one. `style` = { tone, color? }.
 */
export function setSectionCaps(groups, rawConfig, sectionId, style) {
  const config = normalizeConfig(rawConfig)
  const section = buildSections(groups, config, { includeTempHidden: true }).sections.find((s) => s.id === sectionId)
  if (section === undefined) return config
  const models = { ...config.models }
  const folderIds = new Set()
  const capFor = (old) => normalizeCap({ text: old?.text ?? '', tone: style.tone, color: style.color })
  for (const e of section.entries) {
    if (e.family) folderIds.add(e.familyId)
    else models[e.key] = { ...(models[e.key] ?? {}), suffix: capFor(e.suffix) }
  }
  const families = config.families.map((f) => (folderIds.has(f.id) ? { ...f, suffix: capFor(f.suffix) } : f))
  return normalizeConfig({ ...config, models, families })
}

/** How many capsules carry no text (the ones "clear empty capsules" removes). */
export function countEmptyCaps(rawConfig) {
  const config = normalizeConfig(rawConfig)
  const empty = (c) => c !== undefined && c.text === ''
  return Object.values(config.models).filter((m) => empty(m.suffix)).length + config.families.filter((f) => empty(f.suffix)).length
}

/** Remove every capsule that has no text, in all sections; capsules with text are untouched. */
export function clearEmptyCaps(rawConfig) {
  const config = normalizeConfig(rawConfig)
  const models = {}
  for (const [k, m] of Object.entries(config.models)) {
    const { suffix, ...rest } = m
    const next = suffix !== undefined && suffix.text === '' ? rest : m
    if (Object.keys(next).length > 0) models[k] = next
  }
  const families = config.families.map((f) => {
    if (f.suffix === undefined || f.suffix.text !== '') return f
    const { suffix: _s, ...rest } = f
    return rest
  })
  return normalizeConfig({ ...config, models, families })
}

/** Hide (or show again) several models at once: the per-provider eye button in settings. */
export function setModelsHidden(config, keys, hidden) {
  let next = normalizeConfig(config)
  for (const key of keys) next = setModelOverride(next, key, { hidden: hidden === true })
  return next
}

// ---- model catalog cache ---------------------------------------------------------------------------
// After a full restart the host rebuilds its model catalog from scratch (every provider adapter lists its models over
// the network), and the picker sits on "loading" until the slowest one answers. The last good catalog and each
// session's last selection are kept (by the client, in localStorage) and shown while the real one loads.
export const CATALOG_CACHE_VERSION = 1
const MAX_CACHED_SESSIONS = 40

const isSelection = (v) => isObj(v) && typeof v.provider === 'string' && typeof v.model === 'string'
const pickSelection = (v) => ({ provider: v.provider, model: v.model, ...(typeof v.reasoningEffort === 'string' ? { reasoningEffort: v.reasoningEffort } : {}) })

/** Fold a freshly loaded catalog (and the session's selection) into the cache value. Pure; returns a new object. */
export function packCatalogCache(prev, { groups, current, sessionId, now }) {
  const sessions = isObj(prev?.sessions) ? { ...prev.sessions } : {}
  const selection = isSelection(current) ? pickSelection(current) : undefined
  if (selection !== undefined && typeof sessionId === 'string' && sessionId !== '') {
    delete sessions[sessionId] // re-insert: insertion order is recency
    sessions[sessionId] = selection
    for (const key of Object.keys(sessions).slice(0, Math.max(0, Object.keys(sessions).length - MAX_CACHED_SESSIONS))) delete sessions[key]
  }
  return { v: CATALOG_CACHE_VERSION, at: now, groups, last: selection ?? (isSelection(prev?.last) ? prev.last : undefined), sessions }
}

/** Validate whatever came out of storage; anything malformed is treated as "no cache". */
export function readCatalogCache(raw) {
  if (!isObj(raw) || raw.v !== CATALOG_CACHE_VERSION || !Array.isArray(raw.groups) || raw.groups.length === 0) return undefined
  const groups = raw.groups.filter((g) => isObj(g) && typeof g.id === 'string' && typeof g.name === 'string' && Array.isArray(g.models)
    && g.models.every((m) => isObj(m) && typeof m.id === 'string'))
  if (groups.length === 0) return undefined
  return { v: raw.v, at: typeof raw.at === 'number' ? raw.at : 0, groups, last: isSelection(raw.last) ? pickSelection(raw.last) : undefined, sessions: isObj(raw.sessions) ? raw.sessions : {} }
}

/** The selection to show for a session before the real catalog arrives: its own, else the last one seen. */
export function cachedSelection(cache, sessionId) {
  const own = cache?.sessions?.[sessionId]
  if (isSelection(own)) return pickSelection(own)
  return isSelection(cache?.last) ? pickSelection(cache.last) : null
}
