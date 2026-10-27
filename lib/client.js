window.__ModuleLoader__.load({
	id: "dsh-model-picker-control",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const ReactDOM = require("react-dom");
		const h = React.createElement;
		//#region src/pipeline.js
		// Pure display pipeline: host catalog groups + user config -> ordered sections.
		// No DOM, no React: unit-testable in plain Node. The build script inlines this
		// file into lib/client.js (it strips the `export ` keywords).

		const CONFIG_VERSION = 1
		const PARTITION_PREFIX = 'p:'
		const SORT_MODES = ['catalog', 'name', 'manual']

		/** The host's hard-coded provider order (ui-model-selection orderModelProviders). */
		function hostProviderOrder(groups) {
		  const rank = (id) => (id === 'deepseek-account' ? 0 : id === 'deepseek-official' ? 1 : 2)
		  return groups.map((g, i) => ({ g, i })).sort((a, b) => rank(a.g.id) - rank(b.g.id) || a.i - b.i).map((x) => x.g)
		}

		const modelKey = (providerId, modelId) => `${providerId}/${modelId}`

		// A "family" is a folder: an ordered list of models from ONE displayed section, shown as ONE picker entry that sits
		// where its first member was. Its entry key cannot collide with a model key.
		const FAMILY_KEY_PREFIX = '$family/'

		function defaultConfig() {
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
		  }
		}

		// ---- colors --------------------------------------------------------------------------------
		const DEFAULT_CAP_COLOR = '#ffffff'

		const clamp255 = (n) => Math.min(255, Math.max(0, Math.round(n)))
		const toHex = (r, g, b) => '#' + [r, g, b].map((n) => clamp255(n).toString(16).padStart(2, '0')).join('')

		/** Accepts "#rgb", "#rrggbb", "rrggbb", "r,g,b", "r g b" and "rgb(r, g, b)" (0-255). Returns "#rrggbb" (lower case) or undefined. */
		function parseColor(input) {
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

		function hexToRgb(hex) {
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
		function relativeLuminance([r, g, b]) {
		  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
		  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
		}

		function contrastRatio(rgbA, rgbB) {
		  const a = relativeLuminance(rgbA)
		  const b = relativeLuminance(rgbB)
		  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
		}

		const MIN_CAP_CONTRAST = 4.5

		/**
		 * Text color for a capsule filled with `hex`: same hue and saturation as the fill, with lightness pushed away
		 * from it (darker on light fills, lighter on dark fills) in 1% steps until WCAG contrast reaches 4.5:1.
		 * Black (or white) always clears 4.5:1 on the side chosen below, so the loop is guaranteed to stop in range.
		 */
		function capTextColor(hex) {
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
		const CAP_MAX = 20
		const CAP_TONES = ['blue', 'red', 'cyan', 'custom']
		function normalizeCap(v) {
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
		function normalizeConfig(raw) {
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
		function buildSections(groups, rawConfig, opts = {}) {
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
		function familyTarget(entry, currentKey) {
		  const usable = entry.members.filter((m) => !m.missing && !m.tempHidden)
		  return usable.find((m) => m.key === currentKey && !m.exhausted) ?? usable.find((m) => !m.exhausted) ?? usable[0]
		}

		function finish(sections, config, groups) {
		  const entries = sections.flatMap((s) => s.entries)
		  const byKey = new Map(entries.map((e) => [e.key, e]))
		  return { sections, entries, byKey, config, groups }
		}

		/** Rows for the /model popup: same grouping/order/names as the picker. */
		function popupRows(built, currentKey) {
		  return built.sections.flatMap((s) => s.entries.map((e) => ({
		    id: e.key,
		    label: e.name,
		    group: { name: s.id, label: s.name },
		    ...(e.key === currentKey ? { active: true } : {}),
		  })))
		}

		/** Helper for settings: merge a patch into config, pruning empties (idempotent). */
		function setModelOverride(config, key, patch) {
		  const next = normalizeConfig(config)
		  const merged = { ...(next.models[key] ?? {}), ...patch }
		  // A folder lives in one section; moving a member to another partition takes it out of the folder.
		  if (Object.hasOwn(patch, 'partition')) next.families = next.families.map((f) => ({ ...f, members: f.members.filter((m) => modelKey(m.provider, m.model) !== key) }))
		  for (const k of Object.keys(merged)) if (merged[k] === undefined || merged[k] === '' || merged[k] === false) delete merged[k]
		  if (Object.keys(merged).length === 0) delete next.models[key]
		  else next.models[key] = merged
		  return normalizeConfig(next)
		}

		function setProviderOverride(config, id, patch) {
		  const next = normalizeConfig(config)
		  const merged = { ...(next.providers[id] ?? {}), ...patch }
		  for (const k of Object.keys(merged)) if (merged[k] === undefined || merged[k] === '' || merged[k] === false) delete merged[k]
		  if (Object.keys(merged).length === 0) delete next.providers[id]
		  else next.providers[id] = merged
		  return normalizeConfig(next)
		}

		function slugify(name) {
		  const s = String(name).trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '')
		  return s === '' ? 'p' : s
		}

		function addPartition(config, name) {
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

		function removePartition(config, id) {
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
		function effectiveSectionIds(groups, rawConfig) {
		  const config = normalizeConfig(rawConfig)
		  const known = [...hostProviderOrder(groups).map((g) => g.id), ...config.partitions.map((p) => PARTITION_PREFIX + p.id)]
		  const ids = []
		  for (const id of config.sectionOrder) if (known.includes(id) && !ids.includes(id)) ids.push(id)
		  for (const id of known) if (id.startsWith(PARTITION_PREFIX) && !ids.includes(id)) ids.push(id)
		  for (const id of known) if (!ids.includes(id)) ids.push(id)
		  return ids
		}

		/** Drag-and-drop reorder: put `id` right before (or, with `after`, right after) `targetId`. */
		function moveSectionTo(groups, rawConfig, id, targetId, after = false) {
		  const config = normalizeConfig(rawConfig)
		  if (id === targetId) return config
		  const ids = effectiveSectionIds(groups, config)
		  if (!ids.includes(id) || !ids.includes(targetId)) return config
		  ids.splice(ids.indexOf(id), 1)
		  ids.splice(ids.indexOf(targetId) + (after ? 1 : 0), 0, id)
		  return normalizeConfig({ ...config, sectionOrder: ids })
		}

		function moveSection(groups, rawConfig, id, delta) {
		  const config = normalizeConfig(rawConfig)
		  const ids = effectiveSectionIds(groups, config)
		  const i = ids.indexOf(id)
		  const j = i + delta
		  if (i < 0 || j < 0 || j >= ids.length) return config
		  ;[ids[i], ids[j]] = [ids[j], ids[i]]
		  return normalizeConfig({ ...config, sectionOrder: ids })
		}

		/** Temporarily hide / show one model (the picker skips it; the settings preview still lists it). */
		function setTempHidden(rawConfig, key, hidden) {
		  const config = normalizeConfig(rawConfig)
		  const rest = config.tempHidden.filter((k) => k !== key)
		  return normalizeConfig({ ...config, tempHidden: hidden ? [...rest, key] : rest })
		}

		function clearTempHidden(rawConfig) {
		  return normalizeConfig({ ...normalizeConfig(rawConfig), tempHidden: [] })
		}

		/**
		 * Preview drag-and-drop: put model `key` right before (or, with `after`, right after) `targetKey` inside
		 * section `sectionId`. Freezes the section's current visible order into `order[sectionId]` and switches the
		 * section to `manual` sorting, so the result is exactly what the preview showed.
		 */
		function moveModelTo(groups, rawConfig, sectionId, key, targetKey, after = false, opts = {}) {
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
		function moveModel(groups, rawConfig, sectionId, key, delta, opts = {}) {
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
		function mergeIntoFamily(groups, rawConfig, sectionId, key, targetKey, opts = {}) {
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
		function setFamily(rawConfig, id, patch) {
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
		function dissolveFamily(groups, rawConfig, id) {
		  return releaseMembers(groups, rawConfig, id, undefined)
		}

		/** Drag one member out of its folder (a folder left with one member dissolves). */
		function ungroupMember(groups, rawConfig, id, key) {
		  return releaseMembers(groups, rawConfig, id, key)
		}

		/** Move a member up (-1) or down (+1); priority is the list order, top first. */
		function moveFamilyMember(rawConfig, id, key, delta) {
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
		function moveFamilyMemberTo(rawConfig, id, key, targetKey, after = false) {
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
		const FAILOVER_CODES = ['QUOTA', 'ACCOUNT_QUOTA', 'RATE_LIMIT', 'AUTH']

		/** Epoch ms of the next local midnight after `now` (members come back the next day). */
		function nextLocalMidnight(now) {
		  const d = new Date(now)
		  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime()
		}

		/** Drop cooldown entries whose time has passed. cooldowns: { [modelKey]: untilEpochMs }. */
		function liveCooldowns(cooldowns, now) {
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
		function pickFamilyMember(members, cooldowns, now, skip) {
		  const live = liveCooldowns(cooldowns, now)
		  return members.find((m) => live[modelKey(m.provider, m.model)] === undefined && !(skip?.has(modelKey(m.provider, m.model)) ?? false))
		}

		// ---- reasoning effort across a folder ------------------------------------------------------------
		// A folder offers the effort levels of its top member (members of different vendors rarely agree), and a
		// failover lands on the highest level of the member it moves to.

		/** Highest level a model offers (levels are listed low -> high), or undefined for a model without reasoning. */
		function highestEffort(reasoning) {
		  const efforts = reasoning?.efforts
		  return Array.isArray(efforts) && efforts.length > 0 ? efforts[efforts.length - 1].id : undefined
		}

		/** The folder's own reasoning options: those of its first member that exists in the catalog. */
		function familyReasoning(entry) {
		  return entry.members.find((m) => !m.missing)?.model?.reasoning
		}

		/** Translate an effort id of `from` into one `to` accepts: same id if offered, else the same relative rank. */
		function mapEffort(from, to, effortId) {
		  if (effortId === undefined || to === undefined) return undefined
		  if (to.efforts.some((e) => e.id === effortId)) return effortId
		  const fromIds = from?.efforts.map((e) => e.id) ?? []
		  const at = fromIds.indexOf(effortId)
		  if (at < 0 || fromIds.length < 2) return to.defaultEffort ?? highestEffort(to)
		  return to.efforts[Math.round((at / (fromIds.length - 1)) * (to.efforts.length - 1))].id
		}

		//#endregion
		//#region src/client/messages.js
		// Runtime dictionaries for the plugin's own namespace (zh + en). Host strings for the picker itself come from the host's `model` namespace.
		const MESSAGES = {
		  zh: {
		    settingsNav: '模型选择器',
		    intro: '统一管理模型选择器与 /model 弹窗的显示：改名、分区、排序、隐藏、胶囊。修改后需点击底部「保存」才会生效。',
		    'status.saved': '已保存，没有未保存的修改',
		    'status.unsaved': '有未保存的修改',
		    'status.saving': '正在保存…',
		    'status.error': '保存失败，已回滚：{message}',
		    'status.unavailable': '配置服务不可用，改动无法保存',
		    'general.title': '通用',
		    'general.enabled': '启用总控',
		    'general.enabledHint': '关闭后恢复宿主默认的显示方式（保留你的设置）',
		    'general.show1017': '显示 1017 徽标',
		    'general.defaultSort': '默认组内排序',
		    'sort.catalog': '目录原序',
		    'sort.name': '按名称',
		    'sort.manual': '手动（预览里拖动）',
		    'sort.inherit': '跟随默认',
		    'sections.title': '分组与分区',
		    'sections.hint': '拖动左侧手柄调整顺序（也可聚焦手柄后按 ↑ ↓）；provider 可改组名或隐藏；分区可以把不同 provider 的模型合并在一起。',
		    'sections.name': '分组名称',
		    'sections.provider': 'Provider',
		    'sections.partition': '分区',
		    'sections.sort': '组内排序',
		    'sections.drag': '拖动排序',
		    'catalog.empty': '模型目录尚未加载，稍后再试。',
		    'action.hide': '隐藏',
		    'action.delete': '删除',
		    'action.retry': '重试',
		    'action.save': '保存',
		    'action.discard': '放弃修改',
		    'partition.placeholder': '新建分区，例如「免费」「实验」',
		    'partition.add': '新建',
		    'models.title': '模型',
		    'models.hint': '直接修改显示名即可，清空则恢复原名。后缀胶囊默认没有，长度自定，可选蓝 / 暗红 / 青，或自定义任意颜色（RGB / 十六进制，默认白色）。把模型加入分区后，它会出现在该分区下。',
		    'models.col.name': '显示名',
		    'models.col.suffix': '后缀胶囊',
		    'models.col.partition': '分区',
		    'models.col.hide': '隐藏',
		    'models.noPartition': '（不加入分区）',
		    'cap.text': '胶囊文字',
		    'cap.tone.blue': '蓝色',
		    'cap.tone.red': '暗红色',
		    'cap.tone.cyan': '青色',
		    'cap.tone.custom': '自定义颜色',
		    'cap.color': '选择胶囊颜色',
		    'cap.colorText': '胶囊颜色（十六进制或 RGB）',
		    'cap.colorHint': '支持 #RRGGBB、#RGB、R,G,B 或 rgb(R,G,B)，默认白色。文字颜色会自动取同色系并保证可读。',
		    'models.count': '{count} 个模型',
		    'preview.title': '选择器预览',
		    'preview.hint': '这里就是选择器最终显示的样子。拖动左侧手柄调整模型上下顺序（也可聚焦手柄后按 ↑ ↓），拖动后该分组会改为「手动」排序，需点击底部「保存」生效。右侧的眼睛按钮用于临时隐藏模型（例如额度用尽），点击后立即生效，无需保存。',
		    'preview.drag': '拖动排序',
		    'preview.hide': '临时隐藏',
		    'preview.unhide': '取消临时隐藏',
		    'preview.noTemp': '当前没有临时隐藏的模型',
		    'preview.tempCount': '已临时隐藏 {count} 个模型',
		    'preview.showAll': '全部恢复显示',
		    'preview.disabled': '总控已关闭，选择器当前使用宿主默认显示。开启总控后才能在这里调整顺序。',
		    'family.name': '文件夹名称',
		    'family.members': '{count} 个成员',
		    'family.exhausted': '额度已用尽',
		    'family.exhaustedUntil': '已停用，恢复时间 {time}',
		    'family.release': '立即恢复',
		    'family.releaseAll': '恢复全部',
		    'family.missing': '目录中找不到',
		    'family.collapse': '收起文件夹',
		    'family.expand': '展开文件夹',
		    'family.sameGroup': '只能合并同一个分组里的模型。',
		    'family.dissolve': '解散文件夹',
		    'family.ungroup': '移出文件夹',
		    'family.order': '成员从上到下就是接力顺序：靠上的先用，额度用尽后自动换下一个。眼睛按钮手动标记「这个用完了」，接力会跳过它。',
		    'reset.title': '重置',
		    'reset.button': '全部恢复默认',
		    'reset.confirm': '确定清除所有模型选择器设置吗？（仍需点「保存」才生效）',
		    'leave.title': '有未保存的修改',
		    'leave.body': '离开前要保存这些修改吗？',
		    'leave.save': '保存并离开',
		    'leave.discard': '放弃修改',
		    'leave.cancel': '继续编辑',
		    'reset.yes': '确定清除',
		    'reset.no': '取消',
		    'reset.hint': '只会清除本插件保存的设置，不影响模型目录本身。',
		  },
		  en: {
		    settingsNav: 'Model picker',
		    intro: 'Control how the model picker and the /model popup look: rename, group, sort, hide and add capsules. Changes take effect only after you press Save at the bottom.',
		    'status.saved': 'Saved, no pending changes',
		    'status.unsaved': 'You have unsaved changes',
		    'status.saving': 'Saving…',
		    'status.error': 'Save failed and was rolled back: {message}',
		    'status.unavailable': 'The settings service is unavailable; changes cannot be saved',
		    'general.title': 'General',
		    'general.enabled': 'Enable control',
		    'general.enabledHint': 'Off restores the host default display (your settings are kept)',
		    'general.show1017': 'Show the 1017 badge',
		    'general.defaultSort': 'Default in-group order',
		    'sort.catalog': 'Catalog order',
		    'sort.name': 'By name',
		    'sort.manual': 'Manual (drag in preview)',
		    'sort.inherit': 'Use default',
		    'sections.title': 'Groups and partitions',
		    'sections.hint': 'Drag the handle on the left to reorder (or focus it and press ↑ ↓). Rename or hide a provider. A partition merges models from different providers.',
		    'sections.name': 'Group name',
		    'sections.provider': 'Provider',
		    'sections.partition': 'Partition',
		    'sections.sort': 'In-group order',
		    'sections.drag': 'Drag to reorder',
		    'catalog.empty': 'The model catalog has not loaded yet. Try again shortly.',
		    'action.hide': 'Hide',
		    'action.delete': 'Delete',
		    'action.retry': 'Retry',
		    'action.save': 'Save',
		    'action.discard': 'Discard changes',
		    'partition.placeholder': 'New partition, e.g. "Free" or "Lab"',
		    'partition.add': 'Add',
		    'models.title': 'Models',
		    'models.hint': 'Edit the display name directly; clear it to restore the original. The suffix capsule is off by default, any length, in blue / dark red / cyan or any custom color (RGB / hex, default white). A model in a partition appears under that partition.',
		    'models.col.name': 'Display name',
		    'models.col.suffix': 'Suffix capsule',
		    'models.col.partition': 'Partition',
		    'models.col.hide': 'Hide',
		    'models.noPartition': '(no partition)',
		    'cap.text': 'Capsule text',
		    'cap.tone.blue': 'Blue',
		    'cap.tone.red': 'Dark red',
		    'cap.tone.cyan': 'Cyan',
		    'cap.tone.custom': 'Custom color',
		    'cap.color': 'Pick the capsule color',
		    'cap.colorText': 'Capsule color (hex or RGB)',
		    'cap.colorHint': 'Accepts #RRGGBB, #RGB, R,G,B or rgb(R,G,B). Default white. The text color is derived from it automatically and kept readable.',
		    'models.count': '{count} models',
		    'preview.title': 'Picker preview',
		    'preview.hint': 'This is what the picker will finally show. Drag the handle to reorder models (or focus it and press ↑ ↓); the group then switches to Manual order and needs Save at the bottom. The eye button hides a model temporarily (for example when its quota is used up) and applies at once, no Save needed.',
		    'preview.drag': 'Drag to reorder',
		    'preview.hide': 'Hide temporarily',
		    'preview.unhide': 'Show again',
		    'preview.noTemp': 'No models are temporarily hidden',
		    'preview.tempCount': '{count} model(s) temporarily hidden',
		    'preview.showAll': 'Show all again',
		    'preview.disabled': 'Control is off, so the picker uses the host default display. Turn it on to arrange models here.',
		    'family.name': 'Folder name',
		    'family.members': '{count} member(s)',
		    'family.exhausted': 'quota used up',
		    'family.exhaustedUntil': 'Resting until {time}',
		    'family.release': 'Restore now',
		    'family.releaseAll': 'Restore all',
		    'family.missing': 'not in catalog',
		    'family.collapse': 'Collapse folder',
		    'family.expand': 'Expand folder',
		    'family.sameGroup': 'Only models of the same group can be merged.',
		    'family.dissolve': 'Dissolve folder',
		    'family.ungroup': 'Take out of folder',
		    'family.order': 'Members run top to bottom: the upper one is used first, and when its quota is gone the next one takes over. The eye button marks one as used up by hand; failover skips it.',
		    'reset.title': 'Reset',
		    'reset.button': 'Restore all defaults',
		    'reset.confirm': 'Clear all model picker settings? (Press Save to apply.)',
		    'leave.title': 'Unsaved changes',
		    'leave.body': 'Save these changes before leaving?',
		    'leave.save': 'Save and leave',
		    'leave.discard': 'Discard',
		    'leave.cancel': 'Keep editing',
		    'reset.yes': 'Clear',
		    'reset.no': 'Cancel',
		    'reset.hint': 'Only the settings saved by this plugin are cleared; the model catalog itself is untouched.',
		  },
		}

		//#endregion
		//#region src/client/styles.js
		// Stylesheet: the host picker CSS (ModelSelect.module.css) renamed to the mpc- namespace plus
		// the primitive styles (menu surface/group, input, spinner, tag, toast) and the badge/label styles.
		const PICKER_CSS = `
		.mpc-root{min-width:0;position:relative}
		.mpc-trigger{border-radius:var(--dsw-radius-sm);min-width:0;max-width:min(360px,45cqw);height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:400;line-height:20px;display:flex}
		.mpc-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
		.mpc-trigger:focus-visible:not([data-selection-focus]){box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
		.mpc-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
		.mpc-triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}
		.mpc-triggerEffort{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-caption);flex-shrink:1000;overflow:hidden}
		.mpc-triggerIcon{display:var(--dsh-composer-model-icon-display,none);flex:none}
		.mpc-triggerLabel,.mpc-triggerEffort{display:var(--dsh-composer-model-text-display,block)}
		.mpc-chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s}
		.mpc-chevronOpen{transform:rotate(180deg)}
		.mpc-surface.mpc-menu{z-index:1100;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:max-content;min-width:min(240px,100vw - 32px);max-width:min(420px,100vw - 32px);max-height:min(360px,100vh - 96px);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;flex-direction:column;padding:4px;display:flex;position:fixed;overflow:hidden}
		.mpc-status,.mpc-empty{color:var(--dsw-alias-label-tertiary);padding:8px;font-size:12px;line-height:18px}
		.mpc-error,.mpc-warning{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:3px;padding:6px 7px;font-size:11px;line-height:16px;display:flex}
		.mpc-warning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}
		.mpc-retry{color:inherit;font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:0;font-weight:600}
		.mpc-searchRow{flex-shrink:0;margin:2px 0 3px;position:relative}
		.mpc-searchRow .mpc-search{border-radius:var(--dsw-radius-md);background:0 0;border:0 solid #0000;height:auto;padding:5px 7px;display:flex}
		.mpc-searchRow .mpc-searchWithQuery{padding-right:34px}
		.mpc-searchClear{corner-shape:round;width:24px;height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:50%;justify-content:center;align-items:center;padding:0;display:inline-flex;position:absolute;top:50%;right:4px;transform:translateY(-50%)}
		.mpc-searchClear:hover,.mpc-searchClear:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
		.mpc-searchRow .mpc-search:focus-within{border-color:#0000}
		.mpc-searchRow .mpc-search input{padding:0;font-size:12px;line-height:normal}
		.mpc-searchRow .mpc-search input::placeholder{color:var(--dsw-alias-label-caption)}
		.mpc-groups{min-height:0;overflow-y:auto}
		.mpc-option{box-sizing:border-box;border-radius:var(--dsw-radius-md);width:auto;min-width:100%;min-height:34px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;outline:none;align-items:center;gap:6px;padding:5px 7px;display:flex}
		.mpc-option:not(.mpc-modelOption):hover:not(:disabled),.mpc-option:focus-visible,.mpc-optionActive:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
		.mpc-selected{background:0 0}
		.mpc-option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
		.mpc-optionCopy{flex-direction:column;flex:1;min-width:0;display:flex}
		.mpc-modelName{color:inherit;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:400;line-height:18px;overflow:hidden}
		.mpc-check{color:var(--dsw-alias-label-primary);flex:0 0 14px;place-items:center;display:grid}
		.mpc-check svg{width:14px;height:14px}
		.mpc-cell{box-sizing:border-box;border-radius:var(--dsw-radius-md);width:auto;min-width:100%;height:34px;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;background:0 0;border:none;outline:none;align-items:center;gap:6px;padding:0 8px;font-size:13px;line-height:20px;display:flex}
		.mpc-cell:hover,.mpc-cell:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
		.mpc-cellLabel{white-space:nowrap;flex:none}
		.mpc-cellValue{text-overflow:ellipsis;white-space:nowrap;text-align:right;min-width:0;color:var(--dsw-alias-label-tertiary);flex:auto;overflow:hidden}
		.mpc-cellChevron{width:12px;height:12px;color:var(--dsw-alias-menu-icon);flex:none}
		.mpc-surface{anchor-name:var(--dsh-menu-anchor);isolation:isolate;border-radius:var(--dsw-radius-lg);position:relative}
		.mpc-material{position:absolute;inset:0;z-index:-1;border-radius:inherit;background:var(--dsw-menu-surface-fill);backdrop-filter:var(--dsw-menu-backdrop-filter);pointer-events:none}
		.mpc-group{position:relative}
		.mpc-group+.mpc-group{margin-top:3px}
		.mpc-groupStart{position:absolute;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none}
		.mpc-groupHeading{position:sticky;top:0;z-index:1;padding:4px 7px 2px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-weight:500;border-radius:var(--dsw-radius-md)}
		.mpc-groupHeading[data-stuck]{background:var(--dsw-alias-menu-group-header-fill)}
		.mpc-inputWrap{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}
		.mpc-inputWrap:focus-within{border-color:var(--dsw-alias-state-business-primary)}
		.mpc-inputIcon{display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary)}
		.mpc-input{flex:1;min-width:0;border:none;outline:none;background:transparent;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}
		.mpc-input::placeholder{color:var(--dsw-alias-label-dimmed)}
		.mpc-spinner{flex:none;color:var(--dsw-alias-label-tertiary)}
		.mpc-spinnerMotion{transform-origin:center;animation:mpc-spin 1.5s linear infinite}
		.mpc-spinnerTrack,.mpc-spinnerArc{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
		.mpc-spinnerTrack{opacity:.25}
		.mpc-spinnerArc{stroke-dasharray:12 150;animation:mpc-dash 1.5s ease-in-out infinite}
		@keyframes mpc-spin{to{transform:rotate(360deg)}}
		@keyframes mpc-dash{0%{stroke-dasharray:12 150;stroke-dashoffset:0}50%{stroke-dasharray:24 150;stroke-dashoffset:-6}to{stroke-dasharray:12 150;stroke-dashoffset:0}}
		@media (prefers-reduced-motion:reduce){.mpc-spinnerMotion,.mpc-spinnerArc{animation:none}.mpc-spinnerArc{stroke-dasharray:18 150;stroke-dashoffset:-3}}
		.mpc-tag{flex:none;box-sizing:border-box;display:inline-flex;align-items:center;border-radius:999px;corner-shape:round;padding:1px 8px;font-size:11px;line-height:17px;font-weight:600;font-family:inherit;white-space:nowrap}
		.mpc-tag[data-tone=info]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);color:var(--dsw-alias-state-business-primary)}
		.mpc-tag[data-tone=blue]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 88%,#000)}
		.mpc-tag[data-tone=red]{background:color-mix(in srgb,#d9544f 12%,transparent);color:color-mix(in srgb,#d9544f 88%,#000)}
		.mpc-tag[data-tone=cyan]{background:color-mix(in srgb,#1fb89a 12%,transparent);color:color-mix(in srgb,#1fb89a 88%,#000)}
		.mpc-tag[data-tone=neutral]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
		.mpc-toast{position:fixed;top:40px;left:50%;z-index:1100;pointer-events:none;display:flex;align-items:center;gap:10px;width:max-content;max-width:min(640px,calc(100vw - 48px));padding:12px 16px;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-toast-bg);color:var(--dsw-alias-toast-label);font-size:14px;line-height:22px;box-shadow:var(--dsw-shadow-lv3);transform:translate(-50%);animation:mpc-toast-in .16s ease-out,mpc-toast-fade 1s ease var(--mpc-toast-hold,3s) forwards}
		@keyframes mpc-toast-in{0%{opacity:0;transform:translate(-50%,-6px)}to{opacity:1;transform:translate(-50%)}}
		@keyframes mpc-toast-fade{to{opacity:0;visibility:hidden}}
		.mpc-set .mpc-famMember[data-off]{opacity:.7}
		.mpc-label{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;vertical-align:baseline;max-width:100%}
		.mpc-labelText{overflow:hidden;text-overflow:ellipsis}
		`

		function installStyles(doc, name, css) {
		  const id = `dsh-model-picker-control/${name}`
		  if (doc.querySelector(`style[data-plugin-css=${JSON.stringify(id)}]`) !== null) return () => {}
		  const tag = doc.createElement('style')
		  tag.dataset.plugin = 'dsh-model-picker-control'
		  tag.dataset.pluginCss = id
		  tag.textContent = css
		  doc.head.appendChild(tag)
		  return () => tag.remove()
		}

		//#endregion
		//#region src/client/prims.js
		// Own copies of the host primitives the stock picker uses (menu surface/group, input, spinner,
		// toast, fuzzy ranking, sticky group headings). Ported verbatim from the host bundle so the
		// picker feels identical, WITHOUT requiring any @deepseek-ai client package at runtime.
		// `React`, `ReactDOM` and `h` (= React.createElement) are provided by the build header.

		// ---- fuzzy ranking (rankByName) -------------------------------------------------------------
		function wordBoundaryBonus(e, t) {
		  return t === 0 || e.charAt(t - 1) === '-' || e.charAt(t - 1) === '_' ? 8 : 0
		}

		function fuzzyScore(e, t) {
		  if (t.length > e.length) return undefined
		  const NEG = Number.NEGATIVE_INFINITY
		  let row = Array(e.length).fill(NEG)
		  for (let s = 0; s < e.length; s++) if (e.charAt(s) === t.charAt(0)) row[s] = 1 + wordBoundaryBonus(e, s) - s
		  for (let s = 1; s < t.length; s++) {
		    const next = Array(e.length).fill(NEG)
		    let u = NEG, hh = NEG, p = NEG
		    for (const [g, y] of row.entries()) {
		      if (hh !== NEG) p = Math.max(p, hh + g - 2)
		      if (e.charAt(g) === t.charAt(s)) {
		        const bonus = 1 + wordBoundaryBonus(e, g)
		        let w = NEG
		        if (u !== NEG) w = u + bonus + 4
		        if (p !== NEG) w = Math.max(w, p + bonus + 1 - g)
		        next[g] = w
		      }
		      hh = u
		      u = y
		    }
		    row = next
		  }
		  let best = NEG
		  for (const s of row) best = Math.max(best, s)
		  return best === NEG ? undefined : best
		}

		function rankByName(items, query) {
		  const q = query.toLowerCase()
		  if (q === '') return items
		  const scored = []
		  items.forEach((item, index) => {
		    const texts = item.label === undefined ? [item.name] : [item.name, item.label]
		    let prefix = false
		    let best
		    for (const text of texts) {
		      const lower = text.toLowerCase()
		      const score = fuzzyScore(lower, q)
		      if (score !== undefined) {
		        prefix ||= lower.startsWith(q)
		        best = best === undefined ? score : Math.max(best, score)
		      }
		    }
		    if (best !== undefined) scored.push({ item, index, prefix, score: best })
		  })
		  scored.sort((a, b) => Number(b.prefix) - Number(a.prefix) || b.score - a.score || a.index - b.index)
		  return scored.map((s) => s.item)
		}

		// ---- sticky group headings (observeStickyMenuGroups) ----------------------------------------
		function observeStickyMenuGroups(root) {
		  const states = [...root.querySelectorAll(':scope > [data-menu-group]')].flatMap((section) => {
		    const heading = section.querySelector(':scope > [data-menu-group-heading]')
		    const start = section.querySelector(':scope > [data-menu-group-start]')
		    return heading === null || start === null ? [] : [{ section, heading, start, atTop: false, above: false, topTime: -Infinity, aboveTime: -Infinity }]
		  })
		  if (states.length === 0 || typeof IntersectionObserver === 'undefined' || typeof ResizeObserver === 'undefined') return () => {}
		  const bySection = new Map(states.map((s) => [s.section, s]))
		  const byStart = new Map(states.map((s) => [s.start, s]))
		  let disposed = false
		  let sectionObserver
		  let lastHeight
		  const apply = (s) => {
		    const stuck = s.atTop && s.above
		    if (s.heading.hasAttribute('data-stuck') !== stuck) s.heading.toggleAttribute('data-stuck', stuck)
		  }
		  const startObserver = new IntersectionObserver((entries) => {
		    if (disposed) return
		    for (const e of entries) {
		      const s = byStart.get(e.target)
		      if (!s || e.rootBounds === null || e.time < s.aboveTime) continue
		      s.above = e.boundingClientRect.top < e.rootBounds.top
		      s.aboveTime = e.time
		      apply(s)
		    }
		  }, { root, threshold: [0, 1] })
		  for (const { start } of states) startObserver.observe(start)
		  const resize = new ResizeObserver((entries) => {
		    if (disposed) return
		    for (const e of entries) {
		      if (e.target !== root || e.contentRect.height === lastHeight) continue
		      lastHeight = e.contentRect.height
		      sectionObserver?.disconnect()
		      const obs = new IntersectionObserver((list) => {
		        if (disposed || sectionObserver !== obs) return
		        for (const k of list) {
		          const s = bySection.get(k.target)
		          if (!s || k.rootBounds === null) continue
		          const top = k.rootBounds.top
		          if (k.time >= s.topTime) { s.atTop = k.isIntersecting && k.boundingClientRect.bottom > top; s.topTime = k.time }
		          if (k.time >= s.aboveTime) { s.above = k.boundingClientRect.top < top; s.aboveTime = k.time }
		          apply(s)
		        }
		      }, { root, rootMargin: `0px 0px ${Math.min(1, lastHeight) - lastHeight}px 0px`, threshold: 0 })
		      sectionObserver = obs
		      for (const { section } of states) obs.observe(section)
		    }
		  })
		  resize.observe(root)
		  return () => {
		    if (disposed) return
		    disposed = true
		    startObserver.disconnect()
		    sectionObserver?.disconnect()
		    resize.disconnect()
		    for (const { heading } of states) if (heading.hasAttribute('data-stuck')) heading.removeAttribute('data-stuck')
		  }
		}

		// ---- icons ----------------------------------------------------------------------------------
		function Svg({ size = 16, className, fill = 'none', stroke = 'currentColor', viewBox = '0 0 16 16', children }) {
		  return h('svg', { width: size, height: size, viewBox, fill, stroke, strokeWidth: fill === 'none' ? 1 : undefined, className, 'aria-hidden': 'true', focusable: 'false' }, children)
		}
		const path = (d, extra) => h('path', { d, strokeLinecap: 'round', strokeLinejoin: 'round', ...extra })
		const IconChevronDown = (p) => h(Svg, { size: 14, ...p }, path('M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6'))
		const IconChevronRight = (p) => h(Svg, { size: 14, ...p }, path('M6 12L9.29289 8.70711C9.68342 8.31658 9.68342 7.68342 9.29289 7.29289L6 4'))
		const IconCheck = (p) => h(Svg, { size: 16, ...p }, path('M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4'))
		const IconCloseFill = (p) => h(Svg, { size: 16, fill: 'currentColor', stroke: 'none', ...p }, h('path', { fillRule: 'evenodd', clipRule: 'evenodd', d: 'M15 8A7 7 0 1 1 1 8A7 7 0 1 1 15 8ZM6.409 10.652L5.348 9.591L6.939 8L5.348 6.409L6.409 5.348L8 6.939L9.591 5.348L10.652 6.409L9.061 8L10.652 9.591L9.591 10.652L8 9.061Z' }))
		const IconWarning = (p) => h(Svg, { size: 16, ...p }, path('M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z'), path('M8 4.29199V9.79199'), path('M8 10.708V11.708'))
		const IconData = (p) => h(Svg, { size: 16, ...p },
		  path('M13.1967 5.1869C13.7232 4.77378 14.0003 4.30517 14.0001 3.82819C14.0003 3.3512 13.7232 2.88259 13.1967 2.46947C12.6702 2.05635 11.9128 1.71328 11.0006 1.47475C10.0885 1.23621 9.05371 1.11062 8.00039 1.1106C6.94707 1.11057 5.9123 1.23612 5.00009 1.47461C4.08742 1.71301 3.32948 2.05604 2.80249 2.46919C2.2755 2.88235 1.99805 3.35106 1.99805 3.82819C1.99805 4.30531 2.2755 4.77402 2.80249 5.18718C3.32948 5.60033 4.08742 5.94336 5.00009 6.18176C5.9123 6.42025 6.94707 6.5458 8.00039 6.54578C9.05371 6.54575 10.0885 6.42016 11.0006 6.18163C11.9128 5.94309 12.6702 5.60002 13.1967 5.1869Z'),
		  path('M2 3.80371V11.7848'), path('M14 3.80371V11.7848'),
		  path('M2 7.81396C2 8.60524 2.63214 9.36411 3.75736 9.92363C4.88258 10.4832 6.4087 10.7975 8 10.7975C9.5913 10.7975 11.1174 10.4832 12.2426 9.92363C13.3679 9.36411 14 8.60524 14 7.81396'),
		  path('M2 11.7847C2 12.6081 2.63214 13.3977 3.75736 13.98C4.88258 14.5622 6.4087 14.8893 8 14.8893C9.5913 14.8893 11.1174 14.5622 12.2426 13.98C13.3679 13.3977 14 12.6081 14 11.7847'))

		function StateDot() {
		  return h('svg', { className: 'mpc-spinner', 'data-state': 'ongoing', width: 14, height: 14, viewBox: '0 0 24 24', 'aria-hidden': 'true' },
		    h('g', { className: 'mpc-spinnerMotion' },
		      h('circle', { className: 'mpc-spinnerTrack', cx: 12, cy: 12, r: 9.5 }),
		      h('circle', { className: 'mpc-spinnerArc', cx: 12, cy: 12, r: 9.5 })))
		}

		function Tag({ tone = 'neutral', children, title, style }) {
		  return h('span', { className: 'mpc-tag', 'data-tone': tone, title, style }, children)
		}

		// ---- menu ------------------------------------------------------------------------------------
		const MenuSurface = React.forwardRef(function MenuSurface({ className, children, ...rest }, ref) {
		  return h('div', { ref, 'data-menu-material': 'translucent', className: ['mpc-surface', className].filter(Boolean).join(' '), ...rest },
		    h('div', { 'aria-hidden': 'true', className: 'mpc-material' }), children)
		})

		function MenuGroup({ label, children }) {
		  const id = React.useId()
		  return h('section', { role: 'group', 'aria-labelledby': id, 'data-menu-group': '', className: 'mpc-group' },
		    h('span', { 'aria-hidden': 'true', 'data-menu-group-start': '', className: 'mpc-groupStart' }),
		    h('div', { id, 'data-menu-group-heading': '', className: 'mpc-groupHeading' }, label),
		    children)
		}

		const Input = React.forwardRef(function Input({ className, icon, ...props }, ref) {
		  return h('span', { className: ['mpc-inputWrap', className].filter(Boolean).join(' ') },
		    icon ? h('span', { className: 'mpc-inputIcon' }, icon) : null,
		    h('input', { ref, className: 'mpc-input', ...props }))
		})

		// ---- toast -----------------------------------------------------------------------------------
		const TOAST_HOLD_MS = 3000
		const TOAST_FADE_MS = 1000
		function Toast({ text, icon, anchor, onDone }) {
		  const [left, setLeft] = React.useState(undefined)
		  React.useLayoutEffect(() => {
		    if (anchor === null || anchor === undefined) return
		    const place = () => { const r = anchor.getBoundingClientRect(); setLeft(r.left + r.width / 2) }
		    place()
		    window.addEventListener('resize', place)
		    return () => window.removeEventListener('resize', place)
		  }, [anchor])
		  React.useEffect(() => {
		    const timer = setTimeout(onDone, TOAST_HOLD_MS + TOAST_FADE_MS)
		    return () => clearTimeout(timer)
		  }, [onDone])
		  return ReactDOM.createPortal(
		    h('div', { className: 'mpc-toast', role: 'alert', style: { ...(left === undefined ? {} : { left }), '--mpc-toast-hold': `${TOAST_HOLD_MS}ms` } },
		      icon ? h('span', { className: 'mpc-toastIcon' }, icon) : null, h('span', { className: 'mpc-toastText' }, text)),
		    document.body)
		}

		//#endregion
		//#region src/client/stores.js
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

		/** Family failover state lives in the Host half (in memory): which family a session follows and which members are parked. */
		const familyApi = {
		  state: (sessionId) => call('family.state', { sessionId }),
		  bind: (sessionId, familyId) => call('family.bind', { sessionId, familyId: familyId ?? 'none' }),
		  cooldown: (payload) => call('family.cooldown', payload ?? {}),
		}

		//#endregion
		//#region src/client/label.js
		// Label renderer: model name [suffix capsule] [host 1017 tag].
		// The capsule is user-defined (settings page): at most CAP_MAX characters, one of three tones, sized like the host 1017 tag.
		// The name is shown exactly as the provider reports it (providers such as WorkBuddy already append "· x0.50");
		// rename it in settings if you want something else.

		const OFFICIAL_PROVIDERS = new Set(['deepseek-account', 'deepseek-official'])

		/** The host's own 1017 rule (ui-deepseek-model-label-1017), kept verbatim so both badges can coexist. */
		function is1017Model(providerId, model) {
		  return OFFICIAL_PROVIDERS.has(providerId) && model.id === 'deepseek-flash' && model.name === 'DeepSeek-V4.1-Flash'
		}

		function useStore(store) {
		  return React.useSyncExternalStore((fn) => store.subscribe(fn), () => store.getSnapshot(), () => store.getSnapshot())
		}

		function Cap({ cap }) {
		  if (cap === undefined || cap.text === undefined) return null
		  const style = { minWidth: 'calc(4ch + 16px)', justifyContent: 'center' }
		  if (cap.tone === 'custom') {
		    // Free color: solid fill, text in the same hue pushed to >= 4.5:1 contrast (capTextColor), hairline edge for white-on-light.
		    const bg = cap.color ?? DEFAULT_CAP_COLOR
		    style.background = bg
		    style.color = capTextColor(bg)
		    style.boxShadow = 'inset 0 0 0 .5px color-mix(in srgb, ' + style.color + ' 35%, transparent)'
		  }
		  return h(Tag, { tone: cap.tone === 'custom' ? 'custom' : cap.tone, style }, cap.text)
		}

		/** Pure label (name + capsule + host 1017 tag); the settings preview renders it straight from the draft config. */
		function LabelView({ entry, show1017 }) {
		  return h('span', { className: 'mpc-label' },
		    h('span', { className: 'mpc-labelText' }, entry.name),
		    h(Cap, { cap: entry.suffix }),
		    !entry.family && show1017 && is1017Model(entry.provider, entry.model) ? h(Tag, { tone: 'info' }, '1017') : null)
		}

		function ModelLabel({ entry, configStore }) {
		  const cfg = useStore(configStore).config
		  return h(LabelView, { entry, show1017: cfg.badges.show1017 })
		}

		//#endregion
		//#region src/client/seat.js
		// The composer model seat: a line-for-line port of the host's ModelSelect (state machine, focus
		// management, keyboard navigation, pending/spinner, toast, two-pane menu) over the SAME per-session
		// ModelDirectory, with the group list produced by our display pipeline instead of the hard-coded
		// provider order. Selection still goes through directory.select(), so persistence/routing is untouched.
		const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 }
		const cx = (...parts) => parts.filter(Boolean).join(' ')

		function createSeat(env) {
		  const { configStore, locale, tHost, tMine } = env

		  function useLanguage() {
		    return React.useSyncExternalStore((fn) => locale.subscribe(fn), () => locale.getSnapshot().active, () => locale.getSnapshot().active)
		  }

		  // One model row. Memoized: hovering moves the highlight, which must re-render two rows, not the whole list.
		  // Handlers come through the stable `actions` object so they never change identity between renders.
		  const ModelRow = React.memo(function ModelRow({ entry, index, domId, selected, active, pending, disabled, tabIndex, itemRefs, show1017, actions }) {
		    const setRef = React.useCallback((node) => { itemRefs.current[index] = node }, [itemRefs, index])
		    return h('button', {
		      ref: setRef, type: 'button', role: 'menuitemradio', 'aria-checked': selected, id: domId, tabIndex, onFocus: () => actions.focus(index),
		      'data-highlighted': active ? '' : undefined,
		      className: cx('mpc-option', 'mpc-modelOption', selected && 'mpc-selected', active && 'mpc-optionActive'),
		      onMouseMove: disabled || active ? undefined : () => actions.hover(index),
		      title: entry.name, disabled: disabled || entry.unavailable === true, onClick: () => actions.pick(entry),
		    },
		    h('span', { className: 'mpc-optionCopy' },
		      h('span', { className: 'mpc-modelName' }, h('span', { 'data-provider-id': entry.provider, 'data-model-id': entry.model.id }, h(LabelView, { entry, show1017 })))),
		    h('span', { className: 'mpc-check' }, pending ? h(StateDot) : selected ? h(IconCheck) : null))
		  })

		  return function ModelSeat({ locked, available, sessionId, directory, load, select }) {
		    const state = React.useSyncExternalStore((fn) => directory.subscribe(fn), () => directory.getSnapshot())
		    const language = useLanguage()
		    const cfgState = useStore(configStore)
		    const t = tHost
		    const [open, setOpen] = React.useState(false)
		    const [pane, setPane] = React.useState('root')
		    const [query, setQuery] = React.useState('')
		    const [highlightedIndex, setHighlightedIndex] = React.useState(null)
		    const pointerMove = React.useRef(false)
		    const latest = React.useRef(null)
		    const actions = React.useMemo(() => ({
		      hover: (i) => latest.current.hover(i),
		      focus: (i) => latest.current.focus(i),
		      pick: (e) => { void latest.current.pick(e) },
		    }), [])
		    const [selectionFocus, setSelectionFocus] = React.useState(false)
		    const lastActionRef = React.useRef('load')
		    const [toast, setToast] = React.useState(null)
		    const toastSeq = React.useRef(0)
		    const rootRef = React.useRef(null)
		    const triggerRef = React.useRef(null)
		    const searchRef = React.useRef(null)
		    const menuRef = React.useRef(null)
		    const groupsRef = React.useRef(null)
		    const [menuPos, setMenuPos] = React.useState(null)
		    const itemRefs = React.useRef([])
		    const id = React.useId()
		    const accountName = t('provider.account')

		    const currentKey = state.current === null ? undefined : modelKey(state.current.provider, state.current.model)
		    // Family failover state (which family this session follows, which members are parked) lives in the Host half.
		    const [fam, setFam] = React.useState({ familyId: undefined, cooldowns: {} })
		    const refreshFam = React.useCallback(() => {
		      if (sessionId === undefined) return
		      familyApi.state(sessionId).then((v) => setFam((prev) => {
		        const cooldowns = v.cooldowns ?? {}
		        const same = prev.familyId === v.familyId && JSON.stringify(prev.cooldowns) === JSON.stringify(cooldowns)
		        return same ? prev : { familyId: v.familyId, cooldowns }
		      }), () => {})
		    }, [sessionId])
		    React.useEffect(() => { if (cfgState.config.families.length > 0) refreshFam() }, [refreshFam, currentKey, open, cfgState.config.families.length])
		    const exhaustedKey = Object.keys(fam.cooldowns).filter((k) => fam.cooldowns[k] > Date.now()).sort().join(',')
		    const exhausted = React.useMemo(() => (exhaustedKey === '' ? [] : exhaustedKey.split(',')), [exhaustedKey])
		    const hasFamilies = cfgState.config.families.length > 0
		    const built = React.useMemo(() => {
		      const providerLabel = (g) => (g.id === 'deepseek-account' ? accountName : g.name)
		      const first = buildSections(state.groups, cfgState.config, { providerLabel, exhausted, current: hasFamilies ? currentKey : undefined })
		      // The family entry the session follows (only while the model in use really is one of its members).
		      const bound = fam.familyId === undefined || currentKey === undefined ? undefined
		        : first.entries.find((e) => e.family && e.familyId === fam.familyId && e.members.some((m) => m.key === currentKey))
		      return bound === undefined ? first : { ...first, bound }
		    }, [state.groups, cfgState.config, accountName, exhausted, hasFamilies ? currentKey : undefined, fam.familyId])
		    const choices = built.entries
		    const showSearch = choices.length > 4
		    const filteredSections = React.useMemo(() => built.sections
		      .map((s) => ({ ...s, entries: rankByName(s.entries, showSearch ? query.trim() : '') }))
		      .filter((s) => s.entries.length > 0), [built, query, showSearch])
		    const visible = React.useMemo(() => filteredSections.flatMap((s) => s.entries), [filteredSections])
		    // A folder is current while the model in use is one of its members.
		    const isCurrent = (e) => state.current !== null && (e.family ? e.members.some((m) => m.key === currentKey)
		      : state.current.provider === e.provider && state.current.model === e.model.id)
		    const currentVisibleIndex = visible.findIndex(isCurrent)
		    const activeModelIndex = Math.min(highlightedIndex ?? Math.max(0, currentVisibleIndex), visible.length - 1)
		    // A saved selection hidden (or no longer in the catalog) falls back to the host's "Select model" text.
		    // A temporarily hidden model is gone from the list but stays the selection, so its name (and effort) keep showing.
		    const currentChoice = state.current === null ? undefined : choices.find(isCurrent) ?? (cfgState.config.tempHidden.length === 0 ? undefined
		      : buildSections(state.groups, cfgState.config, { includeTempHidden: true, families: false, providerLabel: (g) => (g.id === 'deepseek-account' ? accountName : g.name) }).entries.find((e) => e.provider === state.current.provider && e.model.id === state.current.model))
		    // A folder offers the levels of its TOP member; the member in use gets the level translated to its own scale.
		    const reasoning = currentChoice?.family ? familyReasoning(currentChoice) : currentChoice?.model.reasoning
		    const memberReasoning = currentChoice?.family ? currentChoice.members.find((m) => m.key === currentKey)?.model?.reasoning : reasoning
		    const effectiveEffort = (currentChoice?.family ? mapEffort(memberReasoning, reasoning, state.current?.reasoningEffort) : state.current?.reasoningEffort) ?? reasoning?.defaultEffort
		    const effortLabel = currentChoice === undefined ? undefined
		      : reasoning === undefined ? state.retainedEffort
		        : effectiveEffort === undefined ? t('effort.providerDefault')
		          : reasoning.efforts.find((l) => l.id === effectiveEffort)?.name ?? effectiveEffort
		    const effortChoices = React.useMemo(() => reasoning === undefined ? [] : [
		      ...(reasoning.defaultEffort === undefined ? [{ key: 'provider-default', effort: undefined, label: t('effort.providerDefault') }] : []),
		      ...reasoning.efforts.map((e) => ({ key: `effort:${e.id}`, effort: e.id, label: e.name })),
		    ], [reasoning, t])
		    const { pending } = state
		    const busy = pending !== null
		    const reload = () => { lastActionRef.current = 'load'; load() }

		    React.useEffect(() => {
		      if (!open) return
		      const closeOutside = (event) => {
		        if (rootRef.current?.contains(event.target) === true) return
		        if (menuRef.current?.contains(event.target) === true) return
		        setOpen(false)
		      }
		      document.addEventListener('mousedown', closeOutside)
		      return () => document.removeEventListener('mousedown', closeOutside)
		    }, [open])
		    React.useLayoutEffect(() => { if (!showSearch) { setQuery(''); setHighlightedIndex(null) } }, [showSearch])
		    const paneFocus = React.useRef(null)
		    const previousShowSearch = React.useRef(showSearch)
		    React.useEffect(() => {
		      const changedSearchMode = previousShowSearch.current !== showSearch
		      previousShowSearch.current = showSearch
		      const intent = paneFocus.current ?? (changedSearchMode && pane === 'model' ? 'drill' : null)
		      paneFocus.current = null
		      if (!open || intent === null) return
		      if (intent === 'drill') {
		        if (pane === 'model' && showSearch) { searchRef.current?.focus(); return }
		        (menuRef.current?.querySelector('[role="menuitemradio"][aria-checked="true"]:not([disabled])') ?? itemRefs.current.find((i) => i != null && !i.disabled) ?? triggerRef.current)?.focus()
		        return
		      }
		      const cell = itemRefs.current[intent === 'effort' ? 1 : 0]
		      ;(cell !== null && cell !== undefined && !cell.disabled ? cell : triggerRef.current)?.focus()
		    }, [open, pane, showSearch])
		    React.useEffect(() => {
		      const viewport = groupsRef.current
		      if (viewport === null) return
		      return observeStickyMenuGroups(viewport)
		    }, [available, open, pane, filteredSections])
		    React.useLayoutEffect(() => {
		      // Pointer hover moves the highlight too; it must never scroll the list (the row is already under the cursor).
		      if (pointerMove.current) { pointerMove.current = false; return }
		      if (open && pane === 'model' && activeModelIndex >= 0) itemRefs.current[activeModelIndex]?.scrollIntoView({ block: 'nearest' })
		    }, [open, pane, activeModelIndex, visible])
		    React.useLayoutEffect(() => {
		      if (!available || !open) { setMenuPos(null); return }
		      const place = () => {
		        const rect = triggerRef.current?.getBoundingClientRect()
		        if (rect === undefined) return
		        const MARGIN = 12
		        const lw = menuRef.current?.offsetWidth ?? 0
		        const lh = menuRef.current?.offsetHeight ?? 0
		        let x = rect.right - lw
		        let y = rect.top - 8 - lh
		        if (lw > 0) x = Math.min(Math.max(x, MARGIN), window.innerWidth - lw - MARGIN)
		        if (lh > 0) y = Math.min(Math.max(y, MARGIN), window.innerHeight - lh - MARGIN)
		        setMenuPos({ left: x, top: y })
		      }
		      place()
		      window.addEventListener('scroll', place, true)
		      window.addEventListener('resize', place)
		      const menu = menuRef.current
		      const observer = typeof ResizeObserver !== 'undefined' && menu !== null ? new ResizeObserver(place) : null
		      if (menu !== null) observer?.observe(menu)
		      return () => { observer?.disconnect(); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
		    }, [available, open, pane, state, query, cfgState.config])

		    if (!available) return null

		    const show = () => {
		      setSelectionFocus(false)
		      triggerRef.current?.focus()
		      setQuery('')
		      setHighlightedIndex(null)
		      if (currentChoice === undefined) paneFocus.current = 'drill'
		      setPane(currentChoice === undefined ? 'model' : 'root')
		      setOpen(true)
		      reload()
		    }
		    const changeQuery = (next) => { setQuery(next); setHighlightedIndex(0) }
		    const close = (restoreFocus = false) => {
		      setOpen(false)
		      setPane('root')
		      if (restoreFocus) queueMicrotask(() => { triggerRef.current?.focus() })
		    }
		    const closeAfterSelection = () => { setSelectionFocus(true); close(true) }
		    const drill = (next) => { setQuery(''); setHighlightedIndex(null); paneFocus.current = 'drill'; setPane(next) }
		    const back = (from) => { paneFocus.current = from; setPane('root') }
		    const moveFocus = (offset) => {
		      const items = itemRefs.current.filter((i) => i != null)
		      if (items.length === 0) return
		      const active = items.findIndex((i) => i === document.activeElement)
		      items[active === -1 ? (offset > 0 ? 0 : items.length - 1) : (active + offset + items.length) % items.length]?.focus()
		    }
		    const settleSelection = (result) => {
		      if (result === undefined) return
		      if (result.ok) { if (rootRef.current !== null) closeAfterSelection(); return }
		      const { error } = result
		      toastSeq.current += 1
		      setToast({ seq: toastSeq.current, text: error.code === 'session/writer-held' ? t('error.sessionInUse') : t('error.action', { message: `${error.code}: ${error.message}` }) })
		    }
		    const submit = (selection) => {
		      lastActionRef.current = 'select'
		      setSelectionFocus(true)
		      triggerRef.current?.focus()
		      select(selection).then(settleSelection)
		    }
		    const choose = (selection) => {
		      if (state.current?.provider === selection.provider && state.current.model === selection.model) { closeAfterSelection(); return }
		      submit(selection)
		    }
		    const chooseEffort = (effort) => {
		      if (state.current === null) return
		      if (effectiveEffort === effort) { closeAfterSelection(); return }
		      const sent = currentChoice?.family ? mapEffort(reasoning, memberReasoning, effort) : effort
		      submit({ provider: state.current.provider, model: state.current.model, ...(sent === undefined ? {} : { reasoningEffort: sent }) })
		    }
		    const pick = (entry) => {
		      if (entry.family) {
		        const target = familyTarget(entry, currentKey)
		        if (target === undefined) return
		        if (sessionId !== undefined) familyApi.bind(sessionId, entry.familyId).catch(() => {})
		        setFam((f) => ({ ...f, familyId: entry.familyId }))
		        const top = highestEffort(target.model?.reasoning)
		        choose({ provider: target.provider, model: target.modelId, ...(top === undefined ? {} : { reasoningEffort: top }) })
		        return
		      }
		      if (fam.familyId !== undefined && sessionId !== undefined) {
		        familyApi.bind(sessionId, undefined).catch(() => {})
		        setFam((f) => ({ ...f, familyId: undefined }))
		      }
		      choose({ provider: entry.provider, model: entry.model.id })
		    }

		    latest.current = {
		      pick,
		      focus: (i) => setHighlightedIndex(i),
		      hover: (i) => { pointerMove.current = true; if (showSearch) setHighlightedIndex(i); else itemRefs.current[i]?.focus({ preventScroll: true }) },
		    }

		    const onRootKeyDown = (event) => {
		      if (event.nativeEvent.isComposing) return
		      pointerMove.current = false
		      if (event.key === 'Escape' && open) {
		        event.preventDefault()
		        if (pane !== 'root' && currentChoice !== undefined) back(pane)
		        else close(true)
		        return
		      }
		      if (!open) return
		      if (pane === 'model' && showSearch && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
		        event.preventDefault()
		        if (!busy && visible.length > 0) {
		          setHighlightedIndex((activeModelIndex + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length)
		          searchRef.current?.focus()
		        }
		        return
		      }
		      if (pane === 'model' && showSearch && event.target instanceof HTMLInputElement && (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))) {
		        if (event.key === 'Tab' && visible.length === 0) return
		        event.preventDefault()
		        const highlighted = visible[activeModelIndex]
		        if (!busy && highlighted !== undefined) void pick(highlighted)
		        return
		      }
		      if (event.key === 'Tab') {
		        if (event.shiftKey) {
		          event.preventDefault()
		          if (pane !== 'root' && currentChoice !== undefined) back(pane)
		          else close(true)
		          return
		        }
		        const focused = document.activeElement
		        const rows = itemRefs.current.filter((i) => i != null)
		        if (focused instanceof HTMLButtonElement && rows.includes(focused)) { event.preventDefault(); focused.click(); return }
		        if (focused !== triggerRef.current) return
		        event.preventDefault()
		        if (pane === 'model' && showSearch) { setHighlightedIndex(null); searchRef.current?.focus(); return }
		        (menuRef.current?.querySelector('[role="menuitemradio"][aria-checked="true"]:not([disabled])') ?? rows.find((i) => !i.disabled))?.focus()
		        return
		      }
		      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); moveFocus(event.key === 'ArrowDown' ? 1 : -1) }
		    }
		    const onBlur = (event) => {
		      if (event.relatedTarget instanceof Node && (rootRef.current?.contains(event.relatedTarget) === true || menuRef.current?.contains(event.relatedTarget) === true)) return
		      close()
		    }

		    const waiting = currentChoice === undefined && state.status === 'loading'
		    const modelLabel = waiting ? t('trigger.loading') : currentChoice?.name ?? t('trigger.fallback')
		    const triggerLabel = effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`
		    const triggerAria = waiting ? t('trigger.loading') : currentChoice === undefined ? t('trigger.selectAria')
		      : effortLabel === undefined ? t('trigger.aria', { model: modelLabel }) : t('trigger.ariaEffort', { model: modelLabel, effort: effortLabel })
		    const renderLabel = (entry, placement) => h('span', { 'data-provider-id': entry.provider, 'data-model-id': entry.model.id },
		      h(ModelLabel, { entry, configStore }))

		    let itemIndex = 0
		    let modelIndex = 0
		    const itemRef = () => { const at = itemIndex++; return (node) => { itemRefs.current[at] = node } }
		    const loadError = state.error !== null && lastActionRef.current === 'load'
		    const errorStrip = (label) => h('div', { className: 'mpc-error' },
		      h('span', null, t('error.action', { message: state.error })),
		      h('button', { type: 'button', className: 'mpc-retry', onClick: reload }, label))

		    const rootPane = pane !== 'root' ? null : h(React.Fragment, null,
		      h('button', { ref: itemRef(), type: 'button', role: 'menuitem', className: 'mpc-cell', onClick: () => drill('model') },
		        h('span', { className: 'mpc-cellLabel' }, t('menu.model')),
		        h('span', { className: 'mpc-cellValue' }, currentChoice === undefined ? modelLabel : renderLabel(currentChoice, 'menu')),
		        h(IconChevronRight, { className: 'mpc-cellChevron' })),
		      reasoning !== undefined && h('button', { ref: itemRef(), type: 'button', role: 'menuitem', className: 'mpc-cell', onClick: () => drill('effort') },
		        h('span', { className: 'mpc-cellLabel' }, t('menu.effort')),
		        h('span', { className: 'mpc-cellValue' }, effortLabel),
		        h(IconChevronRight, { className: 'mpc-cellChevron' })))

		    const modelPane = pane !== 'model' ? null : h(React.Fragment, null,
		      showSearch && h('div', { className: 'mpc-searchRow' },
		        h(Input, {
		          ref: searchRef, className: cx('mpc-search', query !== '' && 'mpc-searchWithQuery'), type: 'text', role: 'searchbox',
		          'aria-label': t('search.placeholder'), 'aria-controls': `${id}-models`,
		          'aria-activedescendant': activeModelIndex < 0 ? undefined : `${id}-model-${activeModelIndex}`,
		          placeholder: t('search.placeholder'), value: query, readOnly: busy, onChange: (e) => changeQuery(e.target.value),
		        }),
		        query !== '' && h('button', { type: 'button', className: 'mpc-searchClear', 'aria-label': t('search.clear'), disabled: busy, onClick: () => { changeQuery(''); searchRef.current?.focus() } }, h(IconCloseFill)),
		      ),
		      state.status === 'loading' && h('div', { className: 'mpc-status' }, t('status.loading')),
		      loadError && errorStrip(t('retry')),
		      state.failures.map((failure) => h('div', { key: failure.id, className: 'mpc-warning' },
		        h('span', null, t('warning.groupLoad', { name: failure.id === 'deepseek-account' ? accountName : failure.name, message: failure.message })),
		        h('button', { type: 'button', className: 'mpc-retry', onClick: reload }, t('retry')))),
		      h('div', { ref: groupsRef, id: `${id}-models`, className: 'mpc-groups scrollable', role: 'menu', 'aria-label': t('menu.model'), hidden: filteredSections.length === 0 },
		        filteredSections.map((section) => h(MenuGroup, { key: section.id, label: section.name },
		          section.entries.map((entry) => {
		            const index = modelIndex++
		            return h(ModelRow, {
		              key: entry.key, entry, index, domId: `${id}-model-${index}`, selected: isCurrent(entry), active: index === activeModelIndex,
		              pending: pending !== null && (entry.family ? entry.members.some((m) => m.provider === pending.provider && m.modelId === pending.model)
		                : pending.provider === entry.provider && pending.model === entry.model.id),
		              disabled: busy, tabIndex: showSearch ? -1 : 0, itemRefs, show1017: cfgState.config.badges.show1017, actions,
		            })
		          })))),
		      state.status === 'ready' && filteredSections.length === 0 && h('div', { className: 'mpc-empty', role: 'status' }, t(choices.length === 0 ? 'empty.models' : 'search.empty')))

		    const effortPane = pane !== 'effort' ? null : h(React.Fragment, null,
		      loadError && errorStrip(t('action.reload')),
		      effortChoices.length === 0 ? h('div', { className: 'mpc-empty' }, t('empty.efforts'))
		        : effortChoices.map((level) => h('button', {
		          key: level.key, ref: itemRef(), type: 'button', role: 'menuitemradio', 'aria-checked': effectiveEffort === level.effort,
		          className: cx('mpc-option', effectiveEffort === level.effort && 'mpc-selected'), disabled: busy, onClick: () => chooseEffort(level.effort),
		        },
		        h('span', { className: 'mpc-optionCopy' }, h('span', { className: 'mpc-modelName' }, level.label)),
		        h('span', { className: 'mpc-check' }, pending !== null && pending.provider === state.current?.provider && pending.model === state.current.model && pending.reasoningEffort === level.effort
		          ? h(StateDot) : effectiveEffort === level.effort ? h(IconCheck) : null))))

		    return h('div', {
		      ref: rootRef, className: 'mpc-root', onKeyDown: onRootKeyDown, onBlur,
		      onMouseDown: (event) => { if (event.target instanceof Element && event.target.closest('button') !== null) event.preventDefault() },
		    },
		    h('button', {
		      ref: triggerRef, type: 'button', className: 'mpc-trigger', 'aria-label': triggerAria, 'aria-haspopup': 'menu', 'aria-expanded': open,
		      'aria-controls': open ? `${id}-menu` : undefined, title: triggerLabel, 'aria-busy': busy, 'data-selection-focus': selectionFocus ? '' : undefined,
		      onBlur: () => setSelectionFocus(false), disabled: locked, onClick: () => { if (open) close(true); else show() },
		    },
		    h(IconData, { className: 'mpc-triggerIcon', size: 16 }),
		    h('span', { className: 'mpc-triggerLabel' }, currentChoice === undefined ? modelLabel : renderLabel(currentChoice, 'trigger')),
		    effortLabel !== undefined && h('span', { className: 'mpc-triggerEffort' }, effortLabel),
		    busy ? h(StateDot) : h(IconChevronDown, { className: cx('mpc-chevron', open && 'mpc-chevronOpen') })),
		    open && ReactDOM.createPortal(h(MenuSurface, {
		      ref: menuRef, id: `${id}-menu`, className: 'mpc-menu', style: menuPos ?? MEASURE_STYLE,
		      role: pane === 'model' ? 'group' : 'menu', 'aria-label': t('menu.aria'), 'aria-busy': state.status === 'loading' || busy,
		    }, pane === 'root' && rootPane, pane === 'model' && modelPane, pane === 'effort' && effortPane), document.body),
		    toast !== null && h(Toast, {
		      key: toast.seq, text: toast.text, icon: h(IconWarning), anchor: rootRef.current?.closest('[data-composer-card]') ?? null, onDone: () => setToast(null),
		    }))
		  }
		}

		//#endregion
		//#region src/client/preview.js
		// Settings-page building blocks: collapsible blocks (state remembered per browser) and the live picker preview card
		// (drag to reorder models, a separate eye button to hide a model temporarily, e.g. when its quota is used up).

		const PREVIEW_CSS = `
		.mpc-set .mpc-fold{display:flex;align-items:center;gap:6px;width:100%;padding:2px 4px;margin:0 -4px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
		.mpc-set .mpc-fold:hover,.mpc-set .mpc-fold:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
		.mpc-set .mpc-fold h3,.mpc-set .mpc-fold .mpc-sub{flex:none}
		.mpc-set .mpc-foldChevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .12s}
		.mpc-set .mpc-fold[aria-expanded=false] .mpc-foldChevron{transform:rotate(-90deg)}
		.mpc-set .mpc-foldSummary{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
		.mpc-set .mpc-foldBody{display:flex;flex-direction:column;gap:10px;min-width:0}
		.mpc-set .mpc-foldBody[hidden]{display:none}
		.mpc-set .mpc-pv{max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:4px;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}
		.mpc-set .mpc-pvHead{padding:4px 7px 2px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-weight:500}
		.mpc-set .mpc-pvRow{display:flex;align-items:center;gap:6px;min-height:32px;padding:0 6px 0 2px;border-radius:var(--dsw-radius-md);border-top:2px solid transparent;border-bottom:2px solid transparent}
		.mpc-set .mpc-pvRow:hover{background:var(--dsw-alias-interactive-bg-hover)}
		.mpc-set .mpc-pvRow[data-drop=before]{border-top-color:var(--dsw-alias-state-business-primary)}
		.mpc-set .mpc-pvRow[data-drop=after]{border-bottom-color:var(--dsw-alias-state-business-primary)}
		.mpc-set .mpc-pvRow[data-dragging]{opacity:.45}
		.mpc-set .mpc-pvRow[data-temp] .mpc-pvName{opacity:.45;text-decoration:line-through}
		.mpc-set .mpc-pvName{flex:1;min-width:0;overflow:hidden;font-size:13px}
		.mpc-set .mpc-pvBtn{flex:none;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
		.mpc-set .mpc-pvBtn:hover:not(:disabled),.mpc-set .mpc-pvBtn:focus-visible{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);outline:none}
		.mpc-set .mpc-pvBtn:disabled{opacity:.3;cursor:default}
		.mpc-set .mpc-pvBtn[aria-pressed=true]{color:var(--dsw-alias-state-warning-primary,#d9a300)}
		.mpc-set .mpc-pvDrag{cursor:grab;font-size:16px;line-height:26px}
		.mpc-set .mpc-pvDrag:active{cursor:grabbing}
		.mpc-set .mpc-pvRow[data-drop=into]{background:var(--dsw-alias-interactive-bg-hover);box-shadow:inset 0 0 0 1.5px var(--dsw-alias-state-business-primary)}
		.mpc-set .mpc-pvRow[data-drop=deny]{box-shadow:inset 0 0 0 1.5px var(--dsw-alias-state-error-primary,#d9534f);cursor:not-allowed}
		.mpc-set .mpc-pvRow[data-folder]{background:color-mix(in srgb,var(--dsw-alias-interactive-bg-hover) 55%,transparent)}
		.mpc-set .mpc-pvChevron{width:20px}
		.mpc-set .mpc-pvProvider{margin-left:8px;color:var(--dsw-alias-label-tertiary);font-size:11px}
		.mpc-set .mpc-pvProvider[data-tone=warn]{color:var(--dsw-alias-state-warning-primary,#d9a300)}
		.mpc-set .mpc-pvFolder{display:flex;flex-direction:column;gap:4px;margin:2px 0 6px 26px;padding:6px 6px 6px 8px;border-left:2px solid var(--dsw-alias-state-business-primary);border-radius:var(--dsw-radius-md)}
		.mpc-set .mpc-pvMember[data-off] .mpc-pvName{opacity:.5}
		.mpc-set .mpc-pvIndex{flex:none;width:16px;text-align:right;color:var(--dsw-alias-label-tertiary);font-size:11px}
		`

		/** Collapsed block ids, remembered in localStorage (a pure view preference, not part of the saved picker config). */
		const FOLD_KEY = 'dsh-model-picker-control/collapsed'
		function readFolded() {
		  try {
		    const v = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '[]')
		    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
		  } catch { return new Set() }
		}
		function useFolded() {
		  const [folded, setFolded] = React.useState(readFolded)
		  const toggle = React.useCallback((id) => setFolded((prev) => {
		    const next = new Set(prev)
		    if (next.has(id)) next.delete(id); else next.add(id)
		    try { localStorage.setItem(FOLD_KEY, JSON.stringify([...next])) } catch { /* private mode: the fold just won't persist */ }
		    return next
		  }), [])
		  return [folded, toggle]
		}

		/** Header button + body. `title` is a node (h3 / provider name); `summary` is the dim text shown beside it. */
		function Fold({ id, folded, onToggle, title, summary, children, className }) {
		  const open = !folded.has(id)
		  const bodyId = `mpc-fold-${id.replace(/[^a-z0-9_-]/gi, '_')}`
		  return h('div', { className: cx('mpc-foldWrap', className), style: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 } },
		    h('button', { type: 'button', className: 'mpc-fold', 'aria-expanded': open, 'aria-controls': bodyId, onClick: () => onToggle(id) },
		      h(IconChevronDown, { className: 'mpc-foldChevron' }), title,
		      summary ? h('span', { className: 'mpc-foldSummary' }, summary) : null),
		    h('div', { id: bodyId, className: 'mpc-foldBody', hidden: !open }, children))
		}

		const IconEye = (p) => h(Svg, { size: 16, ...p }, path('M1.5 8C2.8 5.4 5.2 3.8 8 3.8S13.2 5.4 14.5 8C13.2 10.6 10.8 12.2 8 12.2S2.8 10.6 1.5 8Z'), path('M8 9.9A1.9 1.9 0 1 0 8 6.1A1.9 1.9 0 0 0 8 9.9Z'))
		const IconEyeOff = (p) => h(Svg, { size: 16, ...p }, path('M2 2L14 14'), path('M6.6 4.1C7 4 7.5 3.8 8 3.8C10.8 3.8 13.2 5.4 14.5 8C14 9 13.3 9.8 12.5 10.4'), path('M9.4 11.9C8.9 12.1 8.5 12.2 8 12.2C5.2 12.2 2.8 10.6 1.5 8C2 7 2.7 6.2 3.5 5.6'))

		/**
		 * Renders exactly what the picker menu will show (same pipeline, same labels) from the draft config.
		 * - Drag a row's handle: drop on the top/bottom edge of another row to reorder, drop on its middle to merge the two
		 *   into a folder (a "family"). Merging is only allowed inside one group; a drop on another group is refused.
		 * - A folder expands to show its members: their order is the failover order. Members can be reordered, hidden by
		 *   hand (skipped by failover), taken out of the folder, or released from the "rests until midnight" state.
		 * - The eye button hides a model (or a whole folder) temporarily: applied and saved at once through `onTempHide`.
		 */
		function ModelPreview({ groups, cfg, tr, onMove, onMoveTo, onMerge, onTempHide, onClearTempHidden, onFamily, cooldowns, onRelease, accountName }) {
		  const [drag, setDrag] = React.useState(null) // { kind: 'entry' | 'member', section, key, famId?, over, zone: 'before' | 'after' | 'into' | 'deny' }
		  const [open, setOpen] = React.useState(() => new Set())
		  const [notice, setNotice] = React.useState('')
		  const exhausted = React.useMemo(() => Object.keys(cooldowns ?? {}).filter((k) => cooldowns[k] > Date.now()), [cooldowns])
		  const built = React.useMemo(() => buildSections(groups, cfg, {
		    includeTempHidden: true,
		    exhausted,
		    providerLabel: (g) => (g.id === 'deepseek-account' ? accountName : g.name),
		  }), [groups, cfg, accountName, exhausted])
		  const tempCount = cfg.tempHidden.length
		  const editable = cfg.enabled
		  const toggleOpen = (id) => setOpen((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })

		  const zoneOf = (event, entry, dragging, sectionId) => {
		    if (dragging.section !== sectionId) return 'deny'
		    const rect = event.currentTarget.getBoundingClientRect()
		    const y = (event.clientY - rect.top) / Math.max(1, rect.height)
		    if (dragging.kind === 'entry' && !dragging.folder && entry.key !== dragging.key && y >= 0.28 && y <= 0.72) return 'into'
		    return y > 0.5 ? 'after' : 'before'
		  }
		  const endDrag = () => setDrag(null)

		  const renderMember = (entry, member, index, section) => {
		    const dropState = drag !== null && drag.kind === 'member' && drag.famId === entry.familyId && drag.over === member.key && drag.key !== member.key ? drag.zone : undefined
		    return h('div', {
		      key: member.key, role: 'listitem', className: 'mpc-pvRow mpc-pvMember', 'data-drop': dropState,
		      'data-dragging': drag !== null && drag.kind === 'member' && drag.key === member.key ? '' : undefined,
		      'data-temp': member.tempHidden ? '' : undefined, 'data-off': member.exhausted ? '' : undefined,
		      onDragOver: (e) => {
		        if (drag === null || drag.kind !== 'member' || drag.famId !== entry.familyId) return
		        e.preventDefault()
		        const rect = e.currentTarget.getBoundingClientRect()
		        const zone = e.clientY > rect.top + rect.height / 2 ? 'after' : 'before'
		        if (drag.over !== member.key || drag.zone !== zone) setDrag({ ...drag, over: member.key, zone })
		      },
		      onDrop: (e) => {
		        if (drag === null || drag.kind !== 'member' || drag.famId !== entry.familyId) return
		        e.preventDefault()
		        onFamily.moveMemberTo(entry.familyId, drag.key, member.key, drag.zone === 'after')
		        setDrag(null)
		      },
		    },
		    h('span', { className: 'mpc-pvIndex' }, String(index + 1)),
		    h('button', {
		      type: 'button', className: 'mpc-pvBtn mpc-pvDrag', draggable: editable, disabled: !editable, 'aria-label': tr('preview.drag'), title: tr('preview.drag'),
		      onDragStart: (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', member.key); setDrag({ kind: 'member', section: section.id, famId: entry.familyId, key: member.key, over: member.key, zone: 'before' }) },
		      onDragEnd: endDrag,
		      onKeyDown: (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onFamily.moveMember(entry.familyId, member.key, e.key === 'ArrowUp' ? -1 : 1) } },
		    }, '⋮⋮'),
		    h('span', { className: 'mpc-pvName', title: member.key }, member.name,
		      h('span', { className: 'mpc-pvProvider' }, member.providerName),
		      member.missing && h('span', { className: 'mpc-pvProvider' }, tr('family.missing')),
		      member.exhausted && h('span', { className: 'mpc-pvProvider', 'data-tone': 'warn' }, tr('family.exhausted'))),
		    member.exhausted && h('button', { type: 'button', className: 'mpc-btn', onClick: () => onRelease(member.key) }, tr('family.release')),
		    h('button', {
		      type: 'button', className: 'mpc-pvBtn', disabled: !editable, title: tr('family.ungroup'), 'aria-label': tr('family.ungroup') + ': ' + member.name,
		      onClick: () => onFamily.ungroup(entry.familyId, member.key),
		    }, '↗'),
		    h('button', {
		      type: 'button', className: 'mpc-pvBtn', 'aria-pressed': member.tempHidden, title: member.tempHidden ? tr('preview.unhide') : tr('preview.hide'),
		      'aria-label': (member.tempHidden ? tr('preview.unhide') : tr('preview.hide')) + ': ' + member.name, onClick: () => onTempHide(member.key, !member.tempHidden),
		    }, member.tempHidden ? h(IconEyeOff) : h(IconEye)))
		  }

		  const renderEntry = (section, entry) => {
		    const dropState = drag !== null && drag.kind === 'entry' && drag.over === entry.key && drag.key !== entry.key && drag.section === section.id ? drag.zone : undefined
		    const temp = entry.tempHidden === true
		    const isOpen = entry.family && open.has(entry.familyId)
		    return h(React.Fragment, { key: entry.key },
		      h('div', {
		        role: 'listitem', className: 'mpc-pvRow', 'data-drop': dropState, 'data-folder': entry.family ? '' : undefined,
		        'data-dragging': drag !== null && drag.kind === 'entry' && drag.key === entry.key ? '' : undefined, 'data-temp': temp ? '' : undefined,
		        onDragOver: (e) => {
		          if (drag === null || drag.kind !== 'entry') return
		          const zone = zoneOf(e, entry, drag, section.id)
		          if (zone === 'deny') { e.dataTransfer.dropEffect = 'none'; if (drag.over !== entry.key || drag.zone !== zone) setDrag({ ...drag, over: entry.key, zone }); return }
		          e.preventDefault()
		          if (drag.over !== entry.key || drag.zone !== zone) setDrag({ ...drag, over: entry.key, zone })
		        },
		        onDrop: (e) => {
		          if (drag === null || drag.kind !== 'entry') return
		          e.preventDefault()
		          const zone = zoneOf(e, entry, drag, section.id)
		          setDrag(null)
		          if (zone === 'deny') { setNotice(tr('family.sameGroup')); return }
		          setNotice('')
		          if (zone === 'into') onMerge(section.id, drag.key, entry.key)
		          else onMoveTo(section.id, drag.key, entry.key, zone === 'after')
		        },
		      },
		      h('button', {
		        type: 'button', className: 'mpc-pvBtn mpc-pvDrag', draggable: editable, disabled: !editable, 'aria-label': tr('preview.drag'), title: tr('preview.drag'),
		        onDragStart: (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', entry.key); setNotice(''); setDrag({ kind: 'entry', section: section.id, key: entry.key, folder: entry.family === true, over: entry.key, zone: 'before' }) },
		        onDragEnd: endDrag,
		        onKeyDown: (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onMove(section.id, entry.key, e.key === 'ArrowUp' ? -1 : 1) } },
		      }, '⋮⋮'),
		      entry.family && h('button', {
		        type: 'button', className: 'mpc-pvBtn mpc-pvChevron', 'aria-expanded': isOpen, title: tr(isOpen ? 'family.collapse' : 'family.expand'),
		        'aria-label': tr(isOpen ? 'family.collapse' : 'family.expand') + ': ' + entry.name, onClick: () => toggleOpen(entry.familyId),
		      }, h(IconChevronDown, { className: 'mpc-foldChevron', style: isOpen ? undefined : { transform: 'rotate(-90deg)' } })),
		      h('span', { className: 'mpc-pvName' }, h(LabelView, { entry, show1017: cfg.badges.show1017 }),
		        entry.family && h('span', { className: 'mpc-pvProvider' }, tr('family.members', { count: entry.members.length }))),
		      h('button', {
		        type: 'button', className: 'mpc-pvBtn', 'aria-pressed': temp, title: temp ? tr('preview.unhide') : tr('preview.hide'),
		        'aria-label': (temp ? tr('preview.unhide') : tr('preview.hide')) + ': ' + entry.name, onClick: () => onTempHide(entry.key, !temp),
		      }, temp ? h(IconEyeOff) : h(IconEye))),
		      isOpen && h('div', { className: 'mpc-pvFolder' },
		        h('div', { className: 'mpc-row' },
		          h(CommitInput, { className: 'mpc-grow', value: entry.name, 'aria-label': tr('family.name'), onCommit: (v) => { if (v.trim() !== '') onFamily.rename(entry.familyId, v.trim()) } }),
		          h(CapCell, { cap: entry.suffix, onChange: (cap) => onFamily.cap(entry.familyId, cap), tr }),
		          h('button', { type: 'button', className: 'mpc-btn mpc-danger', disabled: !editable, onClick: () => onFamily.dissolve(entry.familyId) }, tr('family.dissolve'))),
		        h('div', { className: 'mpc-hint' }, tr('family.order')),
		        entry.members.map((member, index) => renderMember(entry, member, index, section))))
		  }

		  return h('div', { className: 'mpc-cards' },
		    !editable && h('div', { className: 'mpc-hint' }, tr('preview.disabled')),
		    h('div', { className: 'mpc-row' },
		      h('span', { className: 'mpc-hint mpc-grow' }, tempCount === 0 ? tr('preview.noTemp') : tr('preview.tempCount', { count: tempCount })),
		      exhausted.length > 0 && h('button', { type: 'button', className: 'mpc-btn', onClick: () => onRelease(undefined) }, tr('family.releaseAll')),
		      h('button', { type: 'button', className: 'mpc-btn', disabled: tempCount === 0, onClick: onClearTempHidden }, tr('preview.showAll'))),
		    notice !== '' && h('div', { className: 'mpc-status', 'data-tone': 'warn', role: 'status' }, notice),
		    built.sections.length === 0
		      ? h('div', { className: 'mpc-hint' }, tr('catalog.empty'))
		      : h('div', { className: 'mpc-pv', role: 'list' }, built.sections.map((section) => h('div', { key: section.id, role: 'group', 'aria-label': section.name },
		        h('div', { className: 'mpc-pvHead' }, section.name),
		        section.entries.map((entry) => renderEntry(section, entry))))))
		}

		//#endregion
		//#region src/client/settings.js
		// Settings page (settings.section "model-picker-control"): rename, hide, reorder (drag), partitions, sorting, capsules.
		// Edits go to a local draft; nothing is persisted until the user presses Save (configStore.save is serialized,
		// conflict-aware and rolls back if the Host refuses).

		const SETTINGS_CSS = PREVIEW_CSS + `
		.mpc-set{min-width:0;max-width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:24px;padding:4px 2px 32px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
		.mpc-set .mpc-secHead{display:flex;flex-direction:column;gap:4px}
		.mpc-set .mpc-sec{display:flex;flex-direction:column;gap:10px;min-width:0}
		.mpc-set .mpc-cards{display:flex;flex-direction:column;gap:12px;min-width:0}
		.mpc-set h3{margin:0;font-size:14px;line-height:20px;font-weight:600}
		.mpc-set .mpc-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
		.mpc-set .mpc-card{min-width:0;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);padding:10px 12px;display:flex;flex-direction:column;gap:8px}
		.mpc-set .mpc-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:28px}
		.mpc-set .mpc-row>label{display:inline-flex;align-items:center;gap:6px}
		.mpc-set .mpc-grow{flex:1;min-width:120px}
		.mpc-set input[type=text],.mpc-set input[type=number],.mpc-set select{height:28px;box-sizing:border-box;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit}
		.mpc-set input:focus,.mpc-set select:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
		.mpc-set button.mpc-btn{height:28px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:transparent;color:inherit;font:inherit;cursor:pointer}
		.mpc-set button.mpc-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
		.mpc-set button.mpc-btn:disabled{opacity:.4;cursor:default}
		.mpc-set button.mpc-danger{color:var(--dsw-alias-state-error-primary)}
		.mpc-set .mpc-sub{font-weight:600}
		.mpc-set .mpc-section{display:flex;align-items:center;gap:8px;padding:2px 4px;border-radius:var(--dsw-radius-md);border-top:2px solid transparent;border-bottom:2px solid transparent}
		.mpc-set .mpc-section[data-drop=before]{border-top-color:var(--dsw-alias-state-business-primary)}
		.mpc-set .mpc-section[data-drop=after]{border-bottom-color:var(--dsw-alias-state-business-primary)}
		.mpc-set .mpc-section[data-dragging]{opacity:.45}
		.mpc-set .mpc-handle{flex:none;width:22px;height:28px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:grab;font-size:16px;line-height:28px;padding:0;border-radius:var(--dsw-radius-md)}
		.mpc-set .mpc-handle:hover,.mpc-set .mpc-handle:focus-visible{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
		.mpc-set .mpc-handle:active{cursor:grabbing}
		.mpc-set .mpc-model{display:grid;grid-template-columns:minmax(140px,320px) 176px 128px 40px;gap:8px 10px;align-items:start;justify-content:start}
		.mpc-set .mpc-model>*{min-width:0}
		.mpc-set .mpc-model input[type=text],.mpc-set .mpc-model select{width:100%;min-width:0}
		.mpc-set .mpc-modelHead{color:var(--dsw-alias-label-tertiary);font-size:11px}
		.mpc-set .mpc-modelHead>*{text-align:left;padding-left:2px}
		.mpc-set .mpc-modelHide{display:flex;justify-content:flex-start;padding-left:2px;min-height:28px;align-items:center}
		.mpc-set .mpc-capCell{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:28px}
		.mpc-set .mpc-capColor{flex-basis:100%;display:flex;align-items:center;gap:6px}
		.mpc-set .mpc-capColor input[type=color]{width:28px;height:28px;padding:1px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:transparent;cursor:pointer}
		.mpc-set .mpc-capColor input[type=text]{width:112px;font-variant-numeric:tabular-nums}
		.mpc-set .mpc-tone[data-custom]{box-shadow:none;background:var(--mpc-tone)}
		.mpc-set .mpc-capCell input[type=text]{width:56px;flex:none;padding:0 4px;text-align:center}
		.mpc-set .mpc-tone{width:18px;height:18px;flex:none;border-radius:50%;border:2px solid transparent;padding:0;cursor:pointer;background-clip:padding-box;box-shadow:inset 0 0 0 9px var(--mpc-tone)}
		.mpc-set .mpc-tone[aria-pressed=true]{border-color:var(--dsw-alias-label-primary)}
		.mpc-set .mpc-tone:disabled{opacity:.35;cursor:default}
		.mpc-leave{position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}
		.mpc-leaveCard{box-sizing:border-box;width:min(360px,calc(100vw - 32px));padding:16px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:8px;font-size:13px;line-height:20px;box-shadow:0 12px 40px rgba(0,0,0,.4)}
		.mpc-leaveCard h4{margin:0;font-size:14px;font-weight:600}
		.mpc-leaveCard .mpc-leaveBtns{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:8px}
		.mpc-leaveCard button{height:28px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:transparent;color:inherit;font:inherit;cursor:pointer}
		.mpc-leaveCard button:hover{background:var(--dsw-alias-interactive-bg-hover)}
		.mpc-leaveCard button.mpc-primary{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:#fff}
		.mpc-set .mpc-status{font-size:12px}
		.mpc-set .mpc-status[data-tone=error]{color:var(--dsw-alias-state-error-primary)}
		.mpc-set .mpc-status[data-tone=warn]{color:var(--dsw-alias-state-warning-primary,#d9a300)}
		.mpc-set .mpc-savebar{position:sticky;bottom:0;z-index:2;display:flex;align-items:center;gap:8px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}
		.mpc-set button.mpc-primary:not(:disabled){background:var(--dsw-alias-state-business-primary);border-color:transparent;color:#fff}
		`

		/** Text input that commits on blur / Enter (one draft change per edit instead of one per keystroke). */
		function CommitInput({ value, onCommit, placeholder, type = 'text', restore, validate, ...rest }) {
		  const [text, setText] = React.useState(value ?? '')
		  React.useEffect(() => { setText(value ?? '') }, [value])
		  // `restore`: text shown again when the field is emptied (the original name); an empty commit clears the override.
		  // `validate`: when given, text that fails it snaps back to the stored value instead of committing.
		  const commit = () => {
		    if (validate !== undefined && !validate(text)) { setText(value ?? ''); return }
		    if (restore !== undefined && text.trim() === '') { setText(restore); if ((value ?? '') !== restore) onCommit(''); return }
		    if (text !== (value ?? '')) onCommit(text)
		  }
		  return h('input', {
		    type, value: text, placeholder, ...rest,
		    onChange: (e) => setText(e.target.value), onBlur: commit,
		    onFocus: (e) => { if (restore !== undefined) e.currentTarget.select() },
		    onKeyDown: (e) => { if (e.key === 'Enter') { e.currentTarget.blur() } else if (e.key === 'Escape') { setText(value ?? ''); e.currentTarget.blur() } },
		  })
		}

		function Check({ checked, onChange, label, disabled, title }) {
		  return h('label', { title }, h('input', { type: 'checkbox', checked: !!checked, disabled, onChange: (e) => onChange(e.target.checked) }), label)
		}

		const TONE_COLORS = { blue: 'var(--dsw-alias-state-business-primary)', red: '#d9544f', cyan: '#1fb89a' }
		const CUSTOM_SWATCH = 'conic-gradient(#e5484d,#f5a524,#30a46c,#0091ff,#8e4ec6,#e5484d)'

		/**
		 * Suffix capsule editor: up to CAP_MAX characters + a preset tone (blue / red / cyan) or a custom color
		 * (color picker, or hex / RGB text; default white). The capsule text color is derived automatically
		 * (capTextColor: same hue, contrast >= 4.5:1). Empty text = no capsule.
		 */
		function CapCell({ cap, onChange, tr }) {
		  const text = cap?.text ?? ''
		  const tone = cap?.tone ?? 'blue'
		  const color = cap?.color ?? DEFAULT_CAP_COLOR
		  const emit = (patch) => onChange({ text, tone, ...(tone === 'custom' ? { color } : {}), ...patch })
		  return h('div', { className: 'mpc-capCell' },
		    h(CommitInput, { value: text, 'aria-label': tr('cap.text'), title: tr('cap.text'), maxLength: CAP_MAX,
		      onCommit: (v) => emit({ text: Array.from(v.trim()).slice(0, CAP_MAX).join('') }) }),
		    ['blue', 'red', 'cyan'].map((x) => h('button', { key: x, type: 'button', className: 'mpc-tone', style: { '--mpc-tone': TONE_COLORS[x] }, 'aria-pressed': tone === x, disabled: text === '',
		      title: tr('cap.tone.' + x), 'aria-label': tr('cap.tone.' + x), onClick: () => onChange({ text, tone: x }) })),
		    h('button', { type: 'button', className: 'mpc-tone', 'data-custom': '', style: { '--mpc-tone': tone === 'custom' ? color : CUSTOM_SWATCH }, 'aria-pressed': tone === 'custom', disabled: text === '',
		      title: tr('cap.tone.custom'), 'aria-label': tr('cap.tone.custom'), onClick: () => onChange({ text, tone: 'custom', color }) }),
		    tone === 'custom' && h('div', { className: 'mpc-capColor' },
		      h('input', { type: 'color', value: color, 'aria-label': tr('cap.color'), title: tr('cap.color'), onChange: (e) => onChange({ text, tone: 'custom', color: parseColor(e.target.value) ?? color }) }),
		      h(CommitInput, { value: color, placeholder: '#RRGGBB / R,G,B', 'aria-label': tr('cap.colorText'), title: tr('cap.colorHint'), spellCheck: false,
		        validate: (v) => parseColor(v) !== undefined, onCommit: (v) => onChange({ text, tone: 'custom', color: parseColor(v) }) })))
		}

		function createSettings(env) {
		  const { configStore, catalogStore, tr } = env

		  return function ModelPickerSettings() {
		    const cfgState = useStore(configStore)
		    const catalog = useStore(catalogStore)
		    // Draft model: edits only touch `draft`; nothing is persisted until the user presses Save.
		    const [draft, setDraftState] = React.useState(null)
		    const draftRef = React.useRef(null)
		    const cfg = draft ?? cfgState.config
		    const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(cfgState.config)
		    const groups = catalog.groups
		    React.useEffect(() => { configStore.load() }, [])
		    const [newPartition, setNewPartition] = React.useState('')
		    const [drag, setDrag] = React.useState(null) // { id, over, after }
		    const [confirmReset, setConfirmReset] = React.useState(false)
		    const [folded, toggleFold] = useFolded()
		    const accountName = env.tHost('provider.account')

		    const edit = (change) => {
		      const next = normalizeConfig(change(draftRef.current ?? configStore.getConfig()))
		      draftRef.current = next
		      setDraftState(next)
		    }
		    const commitDraft = async () => {
		      if (draftRef.current === null) return { ok: true }
		      const result = await configStore.save(() => draftRef.current)
		      if (result.ok) { draftRef.current = null; setDraftState(null) }
		      return result
		    }
		    const discardDraft = () => { draftRef.current = null; setDraftState(null) }
		    React.useEffect(() => {
		      if (!dirty) return
		      const warn = (e) => { e.preventDefault(); e.returnValue = '' }
		      window.addEventListener('beforeunload', warn)
		      return () => window.removeEventListener('beforeunload', warn)
		    }, [dirty])

		    // Leave guard. The settings shell owns navigation and closing, so while edits are unsaved we intercept (capture
		    // phase) the clicks / Escape that would unmount this page and ask first; the chosen action then replays the click.
		    const [leave, setLeave] = React.useState(null) // { resume } while the question is open
		    const bypass = React.useRef(false)
		    React.useEffect(() => {
		      if (!dirty) return
		      const PANEL = '[data-shortcut-modal="settings"]'
		      const leaving = (t) => {
		        if (!(t instanceof Element) || t.closest(PANEL) === null || t.closest('.mpc-set, .mpc-leave') !== null) return false
		        const button = t.closest('button')
		        if (t.closest('nav') !== null) return button !== null && button.getAttribute('aria-current') !== 'true' // another tab
		        if (button !== null) return button === button.parentElement?.lastElementChild && button.parentElement?.parentElement?.parentElement?.matches(PANEL) === true // close button
		        return t.getAttribute('aria-hidden') === 'true' && t.parentElement?.getAttribute('role') === 'presentation' // backdrop
		      }
		      const replay = (fn) => () => { bypass.current = true; try { fn() } finally { bypass.current = false } }
		      const onClick = (e) => {
		        if (bypass.current || !leaving(e.target)) return
		        e.preventDefault(); e.stopPropagation()
		        const target = e.target.closest('button') ?? e.target
		        setLeave({ resume: replay(() => (typeof target.click === 'function' ? target.click() : target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))) })
		      }
		      const onKey = (e) => {
		        if (bypass.current || e.key !== 'Escape' || !(e.target instanceof Element) || e.target.closest(PANEL) === null) return
		        if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || document.querySelector('.mpc-leave') !== null) return
		        e.preventDefault(); e.stopPropagation()
		        const from = e.target
		        setLeave({ resume: replay(() => from.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))) })
		      }
		      document.addEventListener('click', onClick, true)
		      document.addEventListener('keydown', onKey, true)
		      return () => { document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey, true) }
		    }, [dirty])
		    const leaveAnd = async (save) => {
		      const go = leave?.resume
		      if (save) { const r = await commitDraft(); if (!r.ok) { setLeave(null); return } } else discardDraft()
		      setLeave(null)
		      setTimeout(() => go?.(), 0)
		    }

		    const sectionIds = effectiveSectionIds(groups, cfg)
		    const groupById = new Map(groups.map((g) => [g.id, g]))
		    const nameOfSection = (id) => id.startsWith(PARTITION_PREFIX)
		      ? cfg.partitions.find((p) => PARTITION_PREFIX + p.id === id)?.name ?? id
		      : cfg.providers[id]?.name ?? groupById.get(id)?.name ?? id
		    const sortOptions = SORT_MODES.map((m) => h('option', { key: m, value: m }, tr(`sort.${m}`)))
		    const setSection = (id, patch) => edit((c) => id.startsWith(PARTITION_PREFIX)
		      ? { ...c, partitions: c.partitions.map((p) => (PARTITION_PREFIX + p.id === id ? { ...p, ...patch } : p)) }
		      : setProviderOverride(c, id, patch))
		    const sectionHidden = (id) => (id.startsWith(PARTITION_PREFIX) ? cfg.partitions.find((p) => PARTITION_PREFIX + p.id === id)?.hidden === true : cfg.providers[id]?.hidden === true)
		    const addNewPartition = () => { if (newPartition.trim() === '') return; edit((c) => addPartition(c, newPartition).config); setNewPartition('') }

		    const status = cfgState.error !== undefined
		      ? h('span', { className: 'mpc-status', 'data-tone': 'error', role: 'alert' }, tr('status.error', { message: cfgState.error }))
		      : cfgState.saving ? h('span', { className: 'mpc-status' }, tr('status.saving'))
		        : cfgState.available === false ? h('span', { className: 'mpc-status', 'data-tone': 'error' }, tr('status.unavailable'))
		          : dirty ? h('span', { className: 'mpc-status', 'data-tone': 'warn' }, tr('status.unsaved'))
		            : h('span', { className: 'mpc-status mpc-hint' }, tr('status.saved'))

		    // A temporary hide takes effect at once (no Save needed). The draft, if any, is kept in step so it does not turn dirty.
		    const tempHide = (key, hidden) => {
		      if (draftRef.current !== null) edit((c) => setTempHidden(c, key, hidden))
		      configStore.save((c) => setTempHidden(c, key, hidden))
		    }
		    const clearTemp = () => {
		      if (draftRef.current !== null) edit((c) => clearTempHidden(c))
		      configStore.save((c) => clearTempHidden(c))
		    }
		    const foldProps = { folded, onToggle: toggleFold }
		const [cooldowns, setCooldowns] = React.useState({})
		const refreshCooldowns = React.useCallback(() => { familyApi.state().then((v) => setCooldowns(v.cooldowns ?? {}), () => {}) }, [])
		React.useEffect(() => { refreshCooldowns() }, [refreshCooldowns, cfgState.config.families.length])
		const release = (key) => familyApi.cooldown(key === undefined ? {} : { key }).then((v) => setCooldowns(v.cooldowns ?? {}), () => {})

		    const dropPosition = (event) => {
		      const rect = event.currentTarget.getBoundingClientRect()
		      return event.clientY > rect.top + rect.height / 2
		    }

		    return h('div', { className: 'mpc-set' },
		      h('div', { className: 'mpc-hint' }, tr('intro')),

		      h('section', { className: 'mpc-sec' }, h(Fold, { id: 'general', ...foldProps, title: h('h3', null, tr('general.title')) },
		        h('div', { className: 'mpc-card' },
		          h('div', { className: 'mpc-row' }, h(Check, { checked: cfg.enabled, onChange: (v) => edit((c) => ({ ...c, enabled: v })), label: tr('general.enabled') }),
		            h('span', { className: 'mpc-hint' }, tr('general.enabledHint'))),
		          h('div', { className: 'mpc-row' }, h(Check, { checked: cfg.badges.show1017, onChange: (v) => edit((c) => ({ ...c, badges: { ...c.badges, show1017: v } })), label: tr('general.show1017') })),
		          h('div', { className: 'mpc-row' }, h('label', null, tr('general.defaultSort'),
		            h('select', { value: cfg.sort.default, onChange: (e) => edit((c) => ({ ...c, sort: { ...c.sort, default: e.target.value } })) }, sortOptions)))))),

		      h('section', { className: 'mpc-sec' }, h(Fold, { id: 'sections', ...foldProps, title: h('h3', null, tr('sections.title')) },
		        h('div', { className: 'mpc-hint' }, tr('sections.hint')),
		        h('div', { className: 'mpc-card' },
		          groups.length === 0 && h('div', { className: 'mpc-hint' }, tr('catalog.empty')),
		          sectionIds.map((id, i) => {
		            const isPartition = id.startsWith(PARTITION_PREFIX)
		            const dropState = drag !== null && drag.over === id && drag.id !== id ? (drag.after ? 'after' : 'before') : undefined
		            return h('div', {
		              key: id, className: 'mpc-section', 'data-drop': dropState, 'data-dragging': drag !== null && drag.id === id ? '' : undefined,
		              onDragOver: (e) => { if (drag === null) return; e.preventDefault(); const after = dropPosition(e); if (drag.over !== id || drag.after !== after) setDrag({ ...drag, over: id, after }) },
		              onDrop: (e) => { if (drag === null) return; e.preventDefault(); const after = dropPosition(e); edit((c) => moveSectionTo(groups, c, drag.id, id, after)); setDrag(null) },
		            },
		              h('button', {
		                type: 'button', className: 'mpc-handle', draggable: true, 'aria-label': tr('sections.drag'), title: tr('sections.drag'),
		                onDragStart: (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); setDrag({ id, over: id, after: false }) },
		                onDragEnd: () => setDrag(null),
		                onKeyDown: (e) => {
		                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); edit((c) => moveSection(groups, c, id, e.key === 'ArrowUp' ? -1 : 1)) }
		                },
		              }, '⋮⋮'),
		              h(CommitInput, { className: 'mpc-grow', value: nameOfSection(id), restore: isPartition ? undefined : (groupById.get(id)?.name ?? id), 'aria-label': tr('sections.name'),
		                onCommit: (v) => setSection(id, { name: isPartition ? (v.trim() === '' ? nameOfSection(id) : v) : (v.trim() === (groupById.get(id)?.name ?? id) ? undefined : v.trim()) }) }),
		              h('span', { className: 'mpc-hint' }, isPartition ? tr('sections.partition') : tr('sections.provider')),
		              h('select', { value: cfg.sort.bySection[id] ?? '', 'aria-label': tr('sections.sort'), onChange: (e) => edit((c) => { const bySection = { ...c.sort.bySection }; if (e.target.value === '') delete bySection[id]; else bySection[id] = e.target.value; return { ...c, sort: { ...c.sort, bySection } } }) },
		                h('option', { value: '' }, tr('sort.inherit')), sortOptions),
		              h(Check, { checked: sectionHidden(id), onChange: (v) => setSection(id, { hidden: v }), label: tr('action.hide') }),
		              isPartition && h('button', { type: 'button', className: 'mpc-btn mpc-danger', onClick: () => edit((c) => removePartition(c, id.slice(PARTITION_PREFIX.length))) }, tr('action.delete')))
		          }),
		          h('div', { className: 'mpc-row' },
		            h('input', { type: 'text', className: 'mpc-grow', value: newPartition, placeholder: tr('partition.placeholder'), onChange: (e) => setNewPartition(e.target.value),
		              onKeyDown: (e) => { if (e.key === 'Enter') addNewPartition() } }),
		            h('button', { type: 'button', className: 'mpc-btn', disabled: newPartition.trim() === '', onClick: addNewPartition }, tr('partition.add')))))),


		      h('section', { className: 'mpc-sec' }, h(Fold, { id: 'preview', ...foldProps, title: h('h3', null, tr('preview.title')) },
		        h('div', { className: 'mpc-hint' }, tr('preview.hint')),
		        h('div', { className: 'mpc-card' },
		          h(ModelPreview, { groups, cfg, tr, accountName, onMove: (sid, key, d) => edit((c) => moveModel(groups, c, sid, key, d)),
		            onMoveTo: (sid, key, target, after) => edit((c) => moveModelTo(groups, c, sid, key, target, after)), onTempHide: tempHide, onClearTempHidden: clearTemp,
		            onMerge: (sid, key, target) => edit((c) => mergeIntoFamily(groups, c, sid, key, target)), cooldowns, onRelease: release,
		            onFamily: { rename: (id, name) => edit((c) => setFamily(c, id, { name })), cap: (id, cap) => edit((c) => setFamily(c, id, { suffix: cap.text === '' ? undefined : cap })),
		              dissolve: (id) => edit((c) => dissolveFamily(groups, c, id)), ungroup: (id, key) => edit((c) => ungroupMember(groups, c, id, key)),
		              moveMember: (id, key, delta) => edit((c) => moveFamilyMember(c, id, key, delta)), moveMemberTo: (id, key, target, after) => edit((c) => moveFamilyMemberTo(c, id, key, target, after)) } })))),

		      h('section', { className: 'mpc-sec' }, h(Fold, { id: 'models', ...foldProps, title: h('h3', null, tr('models.title')) },
		        h('div', { className: 'mpc-hint' }, tr('models.hint')),
		        h('div', { className: 'mpc-cards' }, groups.map((g) => h('div', { key: g.id, className: 'mpc-card' },
		          h(Fold, { id: 'models:' + g.id, ...foldProps, title: h('span', { className: 'mpc-sub', title: g.id }, cfg.providers[g.id]?.name ?? g.name), summary: tr('models.count', { count: g.models.length }) },
		          h('div', { className: 'mpc-model mpc-modelHead' }, ['name', 'suffix', 'partition', 'hide'].map((k) => h('span', { key: k }, tr(`models.col.${k}`)))),
		          g.models.map((m) => {
		            const key = modelKey(g.id, m.id)
		            const ov = cfg.models[key] ?? {}
		            const set = (patch) => edit((c) => setModelOverride(c, key, patch))
		            const setCap = (cap) => set({ suffix: cap.text === '' ? undefined : cap })
		            return h('div', { key: m.id, className: 'mpc-model' },
		              h(CommitInput, { value: ov.name ?? m.name, restore: m.name, title: m.name, onCommit: (v) => set({ name: v.trim() === m.name ? undefined : v.trim() }) }),
		              h(CapCell, { cap: ov.suffix, onChange: setCap, tr }),
		              h('select', { value: ov.partition ?? '', onChange: (e) => set({ partition: e.target.value }) },
		                h('option', { value: '' }, tr('models.noPartition')), cfg.partitions.map((p) => h('option', { key: p.id, value: p.id }, p.name))),
		              h('div', { className: 'mpc-modelHide' }, h(Check, { checked: ov.hidden === true, onChange: (v) => set({ hidden: v }), title: tr('action.hide') })))
		          }))))))),

		      h('section', { className: 'mpc-sec' }, h('div', { className: 'mpc-secHead' }, h('h3', null, tr('reset.title'))),
		        h('div', { className: 'mpc-row' }, confirmReset
		            ? [h('span', { key: 'q', className: 'mpc-hint' }, tr('reset.confirm')),
		              h('button', { key: 'y', type: 'button', className: 'mpc-btn mpc-danger', onClick: () => { edit(() => defaultConfig()); setConfirmReset(false) } }, tr('reset.yes')),
		              h('button', { key: 'n', type: 'button', className: 'mpc-btn', onClick: () => setConfirmReset(false) }, tr('reset.no'))]
		            : h('button', { type: 'button', className: 'mpc-btn mpc-danger', onClick: () => setConfirmReset(true) }, tr('reset.button')),
		          h('span', { className: 'mpc-hint' }, tr('reset.hint')))),

		      leave !== null && ReactDOM.createPortal(h('div', { className: 'mpc-leave', role: 'presentation' },
		        h('div', { className: 'mpc-leaveCard', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': tr('leave.title') },
		          h('h4', null, tr('leave.title')), h('div', null, tr('leave.body')),
		          h('div', { className: 'mpc-leaveBtns' },
		            h('button', { type: 'button', autoFocus: true, onClick: () => setLeave(null) }, tr('leave.cancel')),
		            h('button', { type: 'button', onClick: () => leaveAnd(false) }, tr('leave.discard')),
		            h('button', { type: 'button', className: 'mpc-primary', onClick: () => leaveAnd(true) }, tr('leave.save'))))), document.body),

		      h('div', { className: 'mpc-savebar' },
		        status,
		        h('span', { className: 'mpc-grow' }),
		        h('button', { type: 'button', className: 'mpc-btn', disabled: !dirty || cfgState.saving, onClick: discardDraft }, tr('action.discard')),
		        h('button', { type: 'button', className: 'mpc-btn mpc-primary', disabled: !dirty || cfgState.saving, onClick: commitDraft }, tr('action.save'))))
		  }
		}

		//#endregion
		//#region src/client/index.js
		// Client entry: takes over the composer model seat (priority -1 shadows the host seat at 0), keeps the
		// /model popup consistent with it, and registers the settings page. Nothing in node_modules is touched;
		// every registration is an effect-owned disposer, so disabling the plugin hands the seat back to the host.
		const NS = 'model-picker-control'
		const SEAT_PRIORITY = -1
		// `remote` / `remote.session` are never used directly: modelDirectories.directoryFor() reads them off the
		// calling plugin's context ("cannot get property remote.session without inject"), so they must be injected
		// here exactly as the host's own model-selection plugin does.
		const inject = ['locale', 'sessions', 'slots', 'modelDirectories', 'commandUi', 'remote', 'remote.session']

		/** Read-only view of the host's shared model catalog (used by the settings page, which has no session). */
		function createCatalogStore(models) {
		  const catalog = models?.catalog
		  const empty = { groups: [], status: 'unavailable' }
		  if (catalog === undefined || catalog.store === undefined) {
		    return { subscribe: () => () => {}, getSnapshot: () => empty, load: () => {} }
		  }
		  let lastValue
		  let lastSnap = empty
		  return {
		    subscribe: (fn) => catalog.store.subscribe(fn),
		    getSnapshot: () => {
		      const s = catalog.store.getSnapshot()
		      if (s.value !== lastValue || lastSnap.status !== s.status) {
		        lastValue = s.value
		        lastSnap = { groups: s.value?.groups ?? [], status: s.status }
		      }
		      return lastSnap
		    },
		    load: () => { catalog.load().catch(() => {}) },
		  }
		}

		/**
		 * Keep the /model popup in step with the picker. The popup is a host command contribution whose
		 * `ui.options/onSelect` build rows with the hard-coded provider order, and `commandUi` only allows one
		 * contribution per name, so the supported route (register) would throw. We wrap the live contribution's
		 * `options` in place instead: same row ids (`provider/model`), so the host `onSelect` keeps working.
		 * Feature-detected, fail-soft, and fully restored on dispose.
		 */
		function takeOverModelPopup(ctx, env) {
		  const { commandUi, models, sessions, configStore, tHost } = env
		  const patched = new Map() // ui object -> original options
		  const patch = () => {
		    const contribution = commandUi?.live?.contributions?.get?.('model')
		    const ui = contribution?.ui
		    if (ui === undefined || typeof ui.options !== 'function' || patched.has(ui)) return
		    const original = ui.options
		    patched.set(ui, original)
		    ui.options = async (session, ...rest) => {
		      let state
		      try {
		        if (sessions.subagentAddress(session.sessionId) !== undefined) return original.call(ui, session, ...rest)
		        state = await models.directoryFor(session.sessionId).load()
		        if (!configStore.getSnapshot().loaded) await configStore.load()
		        const built = buildSections(state.groups, configStore.getConfig(), {
		          families: false,
		          providerLabel: (g) => (g.id === 'deepseek-account' ? tHost('provider.account') : g.name),
		        })
		        const currentKey = state.current === null ? undefined : modelKey(state.current.provider, state.current.model)
		        const rows = popupRows(built, currentKey)
		        for (const failure of state.failures) rows.push({
		          id: `failure/${failure.id}`,
		          label: failure.id === 'deepseek-account' ? tHost('provider.account') : failure.name,
		          detail: tHost('option.loadError', { message: failure.message }),
		        })
		        return rows
		      } catch (error) {
		        // Never break the host popup: fall back to its own rows if anything above fails.
		        if (state === undefined) throw error
		        return original.call(ui, session, ...rest)
		      }
		    }
		  }
		  patch()
		  // The host registers its /model contribution from its own inject callback, which can run after ours,
		  // and a re-registration produces a fresh object: re-check cheaply until disposed.
		  const timer = setInterval(patch, 1000)
		  return () => {
		    clearInterval(timer)
		    for (const [ui, original] of patched) ui.options = original
		    patched.clear()
		  }
		}

		function apply(ctx) {
		  const React_ = React
		  ctx.effect(() => installStyles(document, 'picker', PICKER_CSS), 'model-picker-control: styles')
		  ctx.effect(() => installStyles(document, 'settings', SETTINGS_CSS), 'model-picker-control: settings styles')
		  ctx.effect(() => {
		    const offZh = ctx.locale.register(NS, 'zh', MESSAGES.zh)
		    const offEn = ctx.locale.register(NS, 'en', MESSAGES.en)
		    return () => { offZh(); offEn() }
		  }, 'model-picker-control: dictionaries')

		  const tMine = ctx.locale.bind(NS)
		  const tHost = ctx.locale.bind('model')
		  const locale = ctx.locale
		  const models = ctx.modelDirectories
		  const sessions = ctx.sessions
		  const configStore = createConfigStore()
		  const catalogStore = createCatalogStore(models)
		  configStore.load()
		  catalogStore.load()

		  const env = { configStore, catalogStore, locale, tHost, tMine, tr: tMine, models, sessions, commandUi: ctx.commandUi }

		  // 1. The seat. Registered WITHOUT `children`: the host entry (priority 0) keeps declaring the label slot.
		  const ModelSeat = createSeat(env)
		  ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
		    name: 'conversation.input.model',
		    priority: SEAT_PRIORITY,
		    inject: (sessionId) => {
		      const directory = models.directoryFor(sessionId)
		      const available = sessions.subagentAddress(sessionId) === undefined
		      return {
		        available,
		        sessionId,
		        directory: directory.store,
		        load: () => { if (available) directory.load().catch(() => {}) },
		        select: (selection) => (available ? directory.select(selection) : Promise.resolve(undefined)),
		      }
		    },
		  }, ModelSeat))

		  // 2. /model popup consistency.
		  ctx.effect(() => {
		    try {
		      return takeOverModelPopup(ctx, env)
		    } catch (error) {
		      console.warn('[model-picker-control] /model popup left as the host default:', error)
		      return () => {}
		    }
		  }, 'model-picker-control: /model popup')

		  // 3. Settings page (sibling of the built-in "Models" page).
		  const SettingsCore = createSettings(env)
		  function SettingsInner(props) {
		    React_.useSyncExternalStore((fn) => locale.subscribe(fn), () => locale.getSnapshot().revision, () => locale.getSnapshot().revision)
		    return h(SettingsCore, props)
		  }
		  // A render error must never blank the whole settings dialog: show the message with a retry button instead.
		  class SettingsBoundary extends React.Component {
		    constructor(props) { super(props); this.state = { error: null } }
		    static getDerivedStateFromError(error) { return { error } }
		    render() {
		      if (this.state.error === null) return h(SettingsInner)
		      return h('div', { className: 'mpc-set', role: 'alert' },
		        h('p', null, String(this.state.error && this.state.error.message || this.state.error)),
		        h('button', { type: 'button', className: 'mpc-btn', onClick: () => this.setState({ error: null }) }, tMine('action.retry')))
		    }
		  }
		  function SettingsPage() {
		    return h(SettingsBoundary)
		  }
		  ctx.slots.inject('settings.section', () => ctx.slots.register({
		    name: 'settings.section',
		    id: 'model-picker-control',
		    order: 11,
		    label: () => tMine('settingsNav'),
		    inject: () => ({}),
		  }, SettingsPage))
		}

		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
