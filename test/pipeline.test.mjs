import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSections, normalizeConfig, popupRows, addPartition, removePartition, setModelOverride,
  setProviderOverride, moveSection, moveSectionTo, effectiveSectionIds, hostProviderOrder, normalizeCap,
  parseColor, capTextColor, contrastRatio, hexToRgb, setTempHidden, clearTempHidden, moveModel, moveModelTo,
  mergeIntoFamily, setFamily, dissolveFamily, ungroupMember, moveFamilyMember, moveFamilyMemberTo,
  familyTarget, pickFamilyMember, nextLocalMidnight, liveCooldowns, FAILOVER_CODES,
  highestEffort, familyReasoning, mapEffort,
} from '../src/pipeline.js'

const groups = [
  { id: 'workbuddy', name: 'WorkBuddy', models: [{ id: 'glm', name: 'GLM-5 · x0.50' }, { id: 'kimi', name: 'Kimi · x2.00' }, { id: 'abc', name: 'Alpha · x1.00' }] },
  { id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash' }, { id: 'pro', name: 'DeepSeek-V4-Pro' }] },
  { id: 'deepseek-account', name: 'DeepSeek Account', models: [{ id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash' }] },
]
const ids = (b) => b.sections.map((s) => s.id)

test('defaults reproduce host order', () => {
  assert.deepEqual(hostProviderOrder(groups).map((g) => g.id), ['deepseek-account', 'deepseek-official', 'workbuddy'])
  const b = buildSections(groups, undefined)
  assert.deepEqual(ids(b), ['deepseek-account', 'deepseek-official', 'workbuddy'])
  assert.equal(b.entries.length, 6)
})

test('disabled plugin = host behaviour', () => {
  const b = buildSections(groups, { enabled: false, providers: { workbuddy: { hidden: true } } })
  assert.equal(b.entries.length, 6)
})

test('rename, hide provider, hide model', () => {
  let c = setProviderOverride(undefined, 'workbuddy', { name: '工作伙伴' })
  c = setModelOverride(c, 'deepseek-official/pro', { hidden: true })
  const b = buildSections(groups, c)
  assert.equal(b.sections.find((s) => s.id === 'workbuddy').name, '工作伙伴')
  assert.ok(!b.byKey.has('deepseek-official/pro'))
  c = setProviderOverride(c, 'workbuddy', { hidden: true })
  assert.ok(!ids(buildSections(groups, c)).includes('workbuddy'))
})

test('cross-provider partition merges and keeps real provider ids', () => {
  let { config: c, id } = addPartition(undefined, '免费')
  c = setModelOverride(c, 'workbuddy/glm', { partition: id })
  c = setModelOverride(c, 'deepseek-official/pro', { partition: id })
  const b = buildSections(groups, c)
  assert.equal(ids(b)[0], `p:${id}`)
  const sec = b.sections[0]
  // catalog order inside a merged section follows the host provider order (official before workbuddy)
  assert.deepEqual(sec.entries.map((e) => [e.provider, e.model.id]), [['deepseek-official', 'pro'], ['workbuddy', 'glm']])
  assert.deepEqual(popupRows(b, 'workbuddy/glm')[1], { id: 'workbuddy/glm', label: 'GLM-5 · x0.50', group: { name: `p:${id}`, label: '免费' }, active: true })
  c = removePartition(c, id)
  assert.ok(buildSections(groups, c).byKey.has('workbuddy/glm'))
  assert.deepEqual(ids(buildSections(groups, c)), ['deepseek-account', 'deepseek-official', 'workbuddy'])
})

test('hidden provider but model pinned to a partition stays visible', () => {
  let { config: c, id } = addPartition(undefined, '实验')
  c = setProviderOverride(c, 'workbuddy', { hidden: true })
  c = setModelOverride(c, 'workbuddy/kimi', { partition: id })
  const b = buildSections(groups, c)
  assert.deepEqual(b.entries.filter((e) => e.provider === 'workbuddy').map((e) => e.model.id), ['kimi'])
})

test('sorting modes', () => {
  // 0.2.0-rc.* had a `multiplier` mode; it is gone and old values fall back to catalog order.
  const legacy = { sort: { default: 'multiplier', bySection: { workbuddy: 'multiplier' } } }
  assert.deepEqual(normalizeConfig(legacy).sort, { default: 'catalog', bySection: {} })
  const catalogIds = buildSections(groups, undefined).sections.find((s) => s.id === 'workbuddy').entries.map((e) => e.model.id)
  assert.deepEqual(buildSections(groups, legacy).sections.find((s) => s.id === 'workbuddy').entries.map((e) => e.model.id), catalogIds)
  const byName = { sort: { default: 'name', bySection: {} } }
  assert.deepEqual(buildSections(groups, byName).sections.find((s) => s.id === 'workbuddy').entries.map((e) => e.model.id), ['abc', 'glm', 'kimi'])
  assert.deepEqual(normalizeConfig({ sort: { default: 'weight', bySection: { workbuddy: 'weight' } } }).sort, { default: 'catalog', bySection: {} })
})

test('section reorder and idempotence', () => {
  let c = moveSection(groups, undefined, 'workbuddy', -1)
  c = moveSection(groups, c, 'workbuddy', -1)
  assert.deepEqual(ids(buildSections(groups, c)), ['workbuddy', 'deepseek-account', 'deepseek-official'])
  assert.deepEqual(effectiveSectionIds(groups, c), ['workbuddy', 'deepseek-account', 'deepseek-official'])
  assert.deepEqual(normalizeConfig(normalizeConfig(c)), normalizeConfig(c))
  assert.deepEqual(setModelOverride(c, 'x/y', {}), normalizeConfig(c))
})

test('normalizeConfig survives junk', () => {
  for (const junk of [null, 1, 'x', [], { providers: 3, models: [], partitions: [null, { id: 3 }], sort: 'z', promo: [] }]) {
    const n = normalizeConfig(junk)
    assert.equal(n.version, 1)
    buildSections(groups, junk)
  }
})

test('unknown stored selection simply has no entry (host fallback)', () => {
  const b = buildSections(groups, setModelOverride(undefined, 'workbuddy/glm', { hidden: true }))
  assert.equal(b.byKey.get('workbuddy/glm'), undefined)
})

test('capsule: suffix only, max 3 chars, three tones, empty = none, legacy data migrates', () => {
  assert.deepEqual(normalizeCap({ text: ' 免费新品 ', tone: 'red' }), { text: '免费新品', tone: 'red' })
  assert.deepEqual(normalizeCap({ text: 'ab', tone: 'purple' }), { text: 'ab', tone: 'blue' })
  assert.deepEqual(normalizeCap({ text: 'ab', color: '#112233' }), { text: 'ab', tone: 'blue' })
  assert.equal(normalizeCap({ text: '  ' }), undefined)
  assert.equal(normalizeCap('x'), undefined)
  const c = setModelOverride(undefined, 'workbuddy/glm', { suffix: { text: 'x'.repeat(30), tone: 'cyan' } })
  assert.deepEqual(buildSections(groups, c).byKey.get('workbuddy/glm').suffix, { text: 'x'.repeat(20), tone: 'cyan' })
  // 0.1.x `badge` and 0.2.0-rc.1 `prefix`/`weight` fields: badge folds into suffix, the rest is dropped.
  const legacy = buildSections(groups, { models: { 'workbuddy/glm': { badge: 'Hot', prefix: { text: 'NEW' }, weight: 3 } } }).byKey.get('workbuddy/glm')
  assert.deepEqual(legacy.suffix, { text: 'Hot', tone: 'blue' })
  assert.equal(legacy.prefix, undefined)
  assert.equal(normalizeConfig({ models: { 'a/b': { weight: 3 } } }).models['a/b'], undefined)
})

test('drag reorder: moveSectionTo before/after target', () => {
  const g = (c) => effectiveSectionIds(groups, c)
  let c = moveSectionTo(groups, undefined, 'workbuddy', 'deepseek-account', false)
  assert.deepEqual(g(c), ['workbuddy', 'deepseek-account', 'deepseek-official'])
  c = moveSectionTo(groups, c, 'workbuddy', 'deepseek-official', true)
  assert.deepEqual(g(c), ['deepseek-account', 'deepseek-official', 'workbuddy'])
  assert.deepEqual(moveSectionTo(groups, c, 'nope', 'workbuddy'), normalizeConfig(c))
  assert.deepEqual(ids(buildSections(groups, moveSectionTo(groups, undefined, 'deepseek-official', 'deepseek-account'))), ['deepseek-official', 'deepseek-account', 'workbuddy'])
})

test('capsule: custom color is normalized, default white, presets unchanged', () => {
  assert.deepEqual(normalizeCap({ text: 'x', tone: 'custom' }), { text: 'x', tone: 'custom', color: '#ffffff' })
  assert.deepEqual(normalizeCap({ text: 'x', tone: 'custom', color: '#ABC' }), { text: 'x', tone: 'custom', color: '#aabbcc' })
  assert.deepEqual(normalizeCap({ text: 'x', tone: 'custom', color: 'nope' }), { text: 'x', tone: 'custom', color: '#ffffff' })
  assert.deepEqual(normalizeCap({ text: 'x', tone: 'red', color: '#123456' }), { text: 'x', tone: 'red' })
  assert.equal(normalizeCap({ text: '', tone: 'custom', color: '#123456' }), undefined)
})

test('parseColor accepts hex and RGB spellings, rejects junk', () => {
  assert.equal(parseColor('#FF8800'), '#ff8800')
  assert.equal(parseColor('ff8800'), '#ff8800')
  assert.equal(parseColor('f80'), '#ff8800')
  assert.equal(parseColor('255, 136, 0'), '#ff8800')
  assert.equal(parseColor('255 136 0'), '#ff8800')
  assert.equal(parseColor('rgb(255,136,0)'), '#ff8800')
  for (const bad of ['', '256,0,0', '#12', '#12345', 'red', 5, undefined, '1,2']) assert.equal(parseColor(bad), undefined, String(bad))
})

test('capTextColor keeps >= 4.5:1 contrast and the same hue family on every fill', () => {
  const fills = ['#ffffff', '#000000', '#ffff00', '#00ff00', '#0000ff', '#ff00ff', '#808080', '#777777', '#ff0000', '#00ffff', '#123456', '#fedcba', '#7f7f00', '#ff8800']
  for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) fills.push('#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join(''))
  for (const fill of fills) {
    const text = capTextColor(fill)
    assert.ok(contrastRatio(hexToRgb(text), hexToRgb(fill)) >= 4.5, fill + ' -> ' + text)
  }
  // Hue is kept on a clearly tinted fill (the text is a lighter/darker shade of it, not black/white).
  const [r, g, b] = hexToRgb(capTextColor('#3366cc'))
  assert.ok(b > r && b >= g, 'blue-ish text on a blue fill')
})

test('temporary hide is separate from permanent hide and reversible', () => {
  let c = setTempHidden(undefined, 'workbuddy/glm', true)
  assert.ok(!buildSections(groups, c).byKey.has('workbuddy/glm'))
  assert.ok(buildSections(groups, c, { includeTempHidden: true }).byKey.get('workbuddy/glm').tempHidden)
  assert.equal(normalizeConfig(c).models['workbuddy/glm'], undefined)
  c = setTempHidden(c, 'workbuddy/glm', false)
  assert.ok(buildSections(groups, c).byKey.has('workbuddy/glm'))
  c = clearTempHidden(setTempHidden(setTempHidden(c, 'a/b', true), 'workbuddy/kimi', true))
  assert.deepEqual(c.tempHidden, [])
})

test('manual order: preview drag freezes order, new models go last, junk is dropped', () => {
  const keys = (c) => buildSections(groups, c).sections.find((s) => s.id === 'workbuddy').entries.map((e) => e.key)
  let c = moveModelTo(groups, undefined, 'workbuddy', 'workbuddy/abc', 'workbuddy/glm')
  assert.deepEqual(keys(c), ['workbuddy/abc', 'workbuddy/glm', 'workbuddy/kimi'])
  assert.equal(c.sort.bySection.workbuddy, 'manual')
  c = moveModelTo(groups, c, 'workbuddy', 'workbuddy/abc', 'workbuddy/kimi', true)
  assert.deepEqual(keys(c), ['workbuddy/glm', 'workbuddy/kimi', 'workbuddy/abc'])
  c = moveModel(groups, c, 'workbuddy', 'workbuddy/abc', -1)
  assert.deepEqual(keys(c), ['workbuddy/glm', 'workbuddy/abc', 'workbuddy/kimi'])
  // a model the saved order does not know yet stays after the known ones
  const extended = groups.map((g) => (g.id === 'workbuddy' ? { ...g, models: [{ id: 'new', name: 'New' }, ...g.models] } : g))
  assert.deepEqual(buildSections(extended, c).sections.find((s) => s.id === 'workbuddy').entries.map((e) => e.key), ['workbuddy/glm', 'workbuddy/abc', 'workbuddy/kimi', 'workbuddy/new'])
  // reordering around a temp-hidden model keeps it in place so it returns where it was
  const t = setTempHidden(c, 'workbuddy/abc', true)
  assert.deepEqual(keys(t), ['workbuddy/glm', 'workbuddy/kimi'])
  assert.deepEqual(normalizeConfig({ order: { s: ['a', 'a', 5, ''], bad: 'x' } }).order, { s: ['a'] })
  assert.equal(moveModelTo(groups, undefined, 'nope', 'a', 'b').order.nope, undefined)
})

test('folders: merge inside one group, active member, exhausted, hidden', () => {
  const sid = 'workbuddy'
  let c = mergeIntoFamily(groups, undefined, sid, 'workbuddy/kimi', 'workbuddy/glm')
  assert.equal(c.families.length, 1)
  assert.equal(c.families[0].name, 'GLM-5 · x0.50')
  assert.equal(c.families[0].section, sid)
  c = mergeIntoFamily(groups, c, sid, 'workbuddy/abc', '$family/' + c.families[0].id) // append to the existing folder
  assert.deepEqual(c.families[0].members.map((m) => m.model), ['glm', 'kimi', 'abc'])
  const b = buildSections(groups, c)
  const sec = b.sections.find((x) => x.id === sid)
  assert.equal(sec.entries.filter((x) => x.family).length, 1)
  assert.equal(sec.entries.some((x) => x.key === 'workbuddy/kimi'), false) // folded away
  const e = sec.entries.find((x) => x.family)
  assert.equal(e.provider, 'workbuddy')
  assert.equal(e.model.id, 'glm')
  // exhausted first member -> next usable one is active
  const e2 = buildSections(groups, c, { exhausted: ['workbuddy/glm'] }).entries.find((x) => x.family)
  assert.equal(e2.model.id, 'kimi')
  assert.equal(familyTarget(e2, undefined).key, 'workbuddy/kimi')
  // hand-hidden members are skipped too, the member in use wins while usable
  c = setTempHidden(c, 'workbuddy/glm', true)
  assert.equal(buildSections(groups, c, { includeTempHidden: true }).entries.find((x) => x.family).model.id, 'kimi')
  assert.equal(buildSections(groups, c, { current: 'workbuddy/abc' }).entries.find((x) => x.family).model.id, 'abc')
  // popup takeover can leave folders out
  assert.equal(buildSections(groups, c, { families: false }).entries.some((x) => x.family), false)
  // reorder inside the folder
  c = moveFamilyMember(c, c.families[0].id, 'workbuddy/abc', -1)
  assert.deepEqual(c.families[0].members.map((m) => m.model), ['glm', 'abc', 'kimi'])
  c = moveFamilyMemberTo(c, c.families[0].id, 'workbuddy/kimi', 'workbuddy/glm', false)
  assert.deepEqual(c.families[0].members.map((m) => m.model), ['kimi', 'glm', 'abc'])
  c = setFamily(c, c.families[0].id, { name: 'Renamed', suffix: { text: 'F', tone: 'blue' } })
  assert.equal(c.families[0].name, 'Renamed')
  assert.equal(c.families[0].suffix.text, 'F')
})

test('folders: only same-group merges, folders cannot be dragged into folders', () => {
  const before = mergeIntoFamily(groups, undefined, 'workbuddy', 'workbuddy/glm', 'deepseek-official/pro')
  assert.equal(before.families.length, 0) // target is in another section
  const c = mergeIntoFamily(groups, undefined, 'workbuddy', 'workbuddy/kimi', 'workbuddy/glm')
  const key = '$family/' + c.families[0].id
  assert.equal(mergeIntoFamily(groups, c, 'workbuddy', key, 'workbuddy/abc').families[0].members.length, 2)
})

test('folders: ungroup and dissolve keep the models, a lone member dissolves the folder', () => {
  let c = mergeIntoFamily(groups, undefined, 'workbuddy', 'workbuddy/kimi', 'workbuddy/glm')
  c = mergeIntoFamily(groups, c, 'workbuddy', 'workbuddy/abc', '$family/' + c.families[0].id)
  const id = c.families[0].id
  c = ungroupMember(groups, c, id, 'workbuddy/abc')
  assert.equal(c.families[0].members.length, 2)
  assert.ok(buildSections(groups, c).byKey.has('workbuddy/abc'))
  c = ungroupMember(groups, c, id, 'workbuddy/kimi')
  assert.equal(c.families.length, 0)
  const keys = buildSections(groups, c).sections.find((x) => x.id === 'workbuddy').entries.map((x) => x.key)
  assert.ok(keys.includes('workbuddy/glm') && keys.includes('workbuddy/kimi') && keys.includes('workbuddy/abc'))
  c = mergeIntoFamily(groups, c, 'workbuddy', 'workbuddy/kimi', 'workbuddy/glm')
  assert.equal(dissolveFamily(groups, c, c.families[0].id).families.length, 0)
})

test('folders: moving a model to another partition takes it out of the folder', () => {
  let c = mergeIntoFamily(groups, undefined, 'workbuddy', 'workbuddy/kimi', 'workbuddy/glm')
  c = mergeIntoFamily(groups, c, 'workbuddy', 'workbuddy/abc', '$family/' + c.families[0].id)
  c = addPartition(c, 'Free').config
  const part = c.partitions[0].id
  c = setModelOverride(c, 'workbuddy/abc', { partition: part })
  assert.deepEqual(c.families[0].members.map((m) => m.model), ['glm', 'kimi'])
})

test('family failover: pick, cooldown until next local midnight', () => {
  const members = [{ provider: 'a', model: '1' }, { provider: 'b', model: '2' }, { provider: 'c', model: '3' }]
  const now = new Date(2026, 9, 27, 21, 30).getTime()
  const mid = nextLocalMidnight(now)
  assert.equal(new Date(mid).getHours(), 0)
  assert.equal(new Date(mid).getDate(), 28)
  const cd = { 'a/1': mid }
  assert.equal(pickFamilyMember(members, cd, now).provider, 'b')
  cd['b/2'] = mid
  assert.equal(pickFamilyMember(members, cd, now).provider, 'c')
  cd['c/3'] = mid
  assert.equal(pickFamilyMember(members, cd, now), undefined)
  // after midnight the top member is back
  assert.equal(pickFamilyMember(members, cd, mid + 1).provider, 'a')
  // hand-hidden members are skipped
  assert.equal(pickFamilyMember(members, {}, now, new Set(['a/1'])).provider, 'b')
  assert.deepEqual(liveCooldowns(cd, mid + 1), {})
  assert.deepEqual(FAILOVER_CODES, ['QUOTA', 'ACCOUNT_QUOTA', 'RATE_LIMIT', 'AUTH'])
})

test('effort helpers: highest level, folder options from top member, rank mapping', () => {
  const four = { efforts: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }, { id: 'max' }], defaultEffort: 'medium' }
  const two = { efforts: [{ id: 'low' }, { id: 'high' }] }
  assert.equal(highestEffort(four), 'max')
  assert.equal(highestEffort(undefined), undefined)
  assert.equal(familyReasoning({ members: [{ missing: true }, { model: { reasoning: two } }, { model: { reasoning: four } }] }), two)
  assert.equal(mapEffort(four, two, 'high'), 'high')
  assert.equal(mapEffort(four, two, 'max'), 'high')
  assert.equal(mapEffort(four, two, 'low'), 'low')
  assert.equal(mapEffort(two, four, 'low'), 'low')
  assert.equal(mapEffort(four, undefined, 'low'), undefined)
})
