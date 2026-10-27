import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSections, normalizeConfig, popupRows, addPartition, removePartition, setModelOverride,
  setProviderOverride, moveSection, moveSectionTo, effectiveSectionIds, hostProviderOrder, normalizeCap,
  parseColor, capTextColor, contrastRatio, hexToRgb, setTempHidden, clearTempHidden, moveModel, moveModelTo,
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
