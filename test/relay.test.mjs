import test from 'node:test'
import assert from 'node:assert/strict'
import { createRelay } from '../src/relay.js'

const m = (provider, model) => ({ provider, model })
const T0 = new Date(2026, 9, 28, 12, 0, 0).getTime()

// A folder of three members in one partition; `b` is the fallback chain's middle member.
function config(extra = {}) {
  return {
    partitions: [{ id: 'Flash', name: 'Flash' }],
    models: {
      'a/x': { partition: 'Flash' },
      'b/x': { partition: 'Flash' },
      'c/x': { partition: 'Flash' },
    },
    families: [{ id: 'f1', name: 'Flash', section: 'p:Flash', members: [m('a', 'x'), m('b', 'x'), m('c', 'x')] }],
    ...extra,
  }
}

function harness({ cfg = config(), selectFails = false, store, clock = { t: T0 }, info = async () => ({ reasoning: { efforts: [{ id: 'low' }, { id: 'high' }] } }), effort = 'low' } = {}) {
  const selects = []
  const relay = createRelay({
    getConfig: () => cfg,
    now: () => clock.t,
    store,
    selectModel: async (sessionId, member, effort) => {
      selects.push({ sessionId, key: `${member.provider}/${member.model}`, effort })
      if (selectFails) throw new Error('refused')
    },
    resolveModelInfo: (provider, model) => info(provider, model),
  })
  const agent = { id: 's1' }
  const request = async (provider, model) => relay.onRequest({ agent }, async () => ({ provider, model, reasoningEffort: effort }))
  const fail = (provider, code = 'QUOTA') => relay.onError({ agent, provider, failure: { code } }, async () => undefined)
  return { relay, selects, agent, request, fail, cfg, clock }
}

test('a bound session fails over to the next member and lands on its highest effort', async () => {
  const h = harness()
  h.relay.bind('s1', 'f1')
  assert.equal((await h.request('a', 'x')).provider, 'a')
  assert.deepEqual(await h.fail('a'), { kind: 'retry' })
  const next = await h.request('a', 'x')
  assert.equal(`${next.provider}/${next.model}`, 'b/x')
  assert.equal(next.reasoningEffort, 'high')
  assert.deepEqual(h.selects.map((s) => s.key), ['b/x', 'b/x'])
})

test('errors that are not quota-type do not trigger a relay', async () => {
  const h = harness()
  h.relay.bind('s1', 'f1')
  await h.request('a', 'x')
  assert.equal(await h.fail('a', 'INVALID_REQUEST'), undefined)
  assert.equal(h.selects.length, 0)
})

test('a disabled plugin never rewrites a request or relays', async () => {
  const h = harness({ cfg: config({ enabled: false }) })
  h.relay.bind('s1', 'f1')
  assert.equal((await h.request('a', 'x')).provider, 'a')
  assert.equal(await h.fail('a'), undefined)
  assert.equal(h.selects.length, 0)
})

test('hand-hidden and moved members never receive a request', async () => {
  const h = harness({ cfg: config({ tempHidden: ['b/x'], models: { 'a/x': { partition: 'Flash' }, 'b/x': { partition: 'Flash' }, 'c/x': { partition: 'Flash' } } }) })
  h.relay.bind('s1', 'f1')
  await h.request('a', 'x')
  await h.fail('a')
  const next = await h.request('a', 'x')
  assert.equal(`${next.provider}/${next.model}`, 'c/x')
})

test('a refused switch keeps the request on the model the UI shows and asks for no retry', async () => {
  const h = harness({ selectFails: true })
  h.relay.bind('s1', 'f1')
  await h.request('a', 'x')
  h.relay.cooldown({ key: 'a/x', until: T0 + 3600_000 })
  const kept = await h.request('a', 'x')
  assert.equal(`${kept.provider}/${kept.model}`, 'a/x')
  assert.equal(await h.fail('a'), undefined)
})

test('a late error from another provider does not park the member in flight', async () => {
  const h = harness()
  h.relay.bind('s1', 'f1')
  await h.request('a', 'x')
  assert.equal(await h.fail('zzz'), undefined)
  assert.deepEqual(h.relay.state('s1').cooldowns, {})
})

test('the relay stops after every member had its turn for one request', async () => {
  const h = harness()
  h.relay.bind('s1', 'f1')
  await h.request('a', 'x')
  assert.deepEqual(await h.fail('a'), { kind: 'retry' })
  await h.request('a', 'x')
  assert.deepEqual(await h.fail('b'), { kind: 'retry' })
  await h.request('a', 'x')
  assert.equal(await h.fail('c'), undefined) // third member exhausted: nothing left to try
})

test('state survives a restart and expired cooldowns are dropped', async () => {
  let saved = {}
  const store = { load: () => saved, save: (s) => { saved = JSON.parse(JSON.stringify(s)) } }
  const clock = { t: T0 }
  const first = harness({ store, clock })
  first.relay.bind('s1', 'f1')
  await first.request('a', 'x')
  await first.fail('a')
  assert.equal(saved.bindings.s1, 'f1')
  assert.ok(saved.cooldowns['a/x'] > T0)

  const second = harness({ store, clock })
  assert.equal(second.relay.state('s1').familyId, 'f1')
  assert.ok(second.relay.state('s1').cooldowns['a/x'] > T0)

  clock.t = saved.cooldowns['a/x'] + 1 // next local midnight has passed
  const third = harness({ store, clock })
  assert.deepEqual(third.relay.state('s1').cooldowns, {})
})

test('a session moved off the folder by hand is released', async () => {
  const h = harness()
  h.relay.bind('s1', 'f1')
  await h.request('elsewhere', 'y')
  assert.equal(h.relay.state('s1').familyId, undefined)
})

test('a corrupt or failing store never breaks a request', async () => {
  const store = { load: () => { throw new Error('bad json') }, save: () => { throw new Error('disk full') } }
  const h = harness({ store })
  h.relay.bind('s1', 'f1')
  await h.request('a', 'x')
  assert.deepEqual(await h.fail('a'), { kind: 'retry' })
})

const failWith = (h, provider, failure) => h.relay.onError({ agent: h.agent, provider, failure }, async () => undefined)

test('network errors relay and park the member for ten minutes only', async () => {
  const h = harness()
  h.relay.bind('s1', 'f1')
  await h.request('a', 'x')
  assert.deepEqual(await failWith(h, 'a', { code: 'TRANSPORT', message: 'read ECONNRESET' }), { kind: 'retry' })
  assert.equal(h.relay.state('s1').cooldowns['a/x'], T0 + 10 * 60_000)
  h.clock.t = T0 + 11 * 60_000
  assert.equal((await h.request('a', 'x')).provider, 'a') // top member is back in line
})

test('a provider refusal (400/403/404, status field or message) relays for one hour', async () => {
  for (const failure of [
    { code: 'PROVIDER_HTTP_ERROR', status: 400, message: 'BAD_REQUEST' },
    { code: 'INVALID_REQUEST', message: '400: {"message":"unapproved channel"}' },
    { code: 'AUTH', status: 403 },
  ]) {
    const h = harness()
    h.relay.bind('s1', 'f1')
    await h.request('a', 'x')
    assert.deepEqual(await failWith(h, 'a', failure), { kind: 'retry' })
  }
  const h = harness()
  h.relay.bind('s1', 'f1')
  await h.request('a', 'x')
  await failWith(h, 'a', { code: 'PROVIDER_HTTP_ERROR', status: 400 })
  assert.equal(h.relay.state('s1').cooldowns['a/x'], T0 + 60 * 60_000)
})

test('context overflow, other statuses and unknown codes never relay', async () => {
  for (const failure of [
    { code: 'CONTEXT_WINDOW_EXCEEDED', status: 400 },
    { code: 'INVALID_REQUEST', status: 422 },
    { code: 'PROVIDER_HTTP_ERROR', status: 500 },
    { code: 'UNKNOWN' },
  ]) {
    const h = harness()
    h.relay.bind('s1', 'f1')
    await h.request('a', 'x')
    assert.equal(await failWith(h, 'a', failure), undefined, failure.code)
    assert.deepEqual(h.relay.state('s1').cooldowns, {})
  }
})

test('when every member refuses the same request, the non-quota parking is undone', async () => {
  const h = harness()
  h.relay.bind('s1', 'f1')
  const bad = { code: 'PROVIDER_HTTP_ERROR', status: 400 }
  await h.request('a', 'x')
  assert.deepEqual(await failWith(h, 'a', bad), { kind: 'retry' })
  await h.request('a', 'x')
  assert.deepEqual(await failWith(h, 'b', bad), { kind: 'retry' })
  await h.request('a', 'x')
  assert.equal(await failWith(h, 'c', bad), undefined)
  assert.deepEqual(h.relay.state('s1').cooldowns, {}) // a bad request must not lock the whole folder for an hour
})

test('an effort the model does not declare is fitted before the host rejects it', async () => {
  // 'max' is not offered by a/x any more (its catalog changed): the host would fail with UNSUPPORTED_REASONING_EFFORT.
  const h = harness({ effort: 'max' })
  h.relay.bind('s1', 'f1')
  assert.equal((await h.request('a', 'x')).reasoningEffort, 'high')
})

test('a model that declares no reasoning loses the effort instead of failing the request', async () => {
  const h = harness({ effort: 'max', info: async () => ({}) })
  h.relay.bind('s1', 'f1')
  const config = await h.request('a', 'x')
  assert.equal('reasoningEffort' in config, false)
})

test('an offered effort is kept, and a failed model lookup never blocks a request', async () => {
  const h = harness({ effort: 'low' })
  h.relay.bind('s1', 'f1')
  assert.equal((await h.request('a', 'x')).reasoningEffort, 'low')
  const broken = harness({ effort: 'max', info: async () => { throw new Error('catalog down') } })
  broken.relay.bind('s1', 'f1')
  assert.equal((await broken.request('a', 'x')).reasoningEffort, 'max')
})

test('a failover lands on the highest level of the next member, fitted to what it declares', async () => {
  const levels = { a: ['low', 'high'], b: ['minimal', 'low', 'medium', 'xhigh'] }
  const h = harness({ effort: 'high', info: async (provider) => ({ reasoning: { efforts: levels[provider].map((id) => ({ id })) } }) })
  h.relay.bind('s1', 'f1')
  await h.request('a', 'x')
  assert.deepEqual(await h.fail('a'), { kind: 'retry' })
  const next = await h.request('a', 'x') // the host still proposes the old route; the relay moves it
  assert.equal(`${next.provider}/${next.model}`, 'b/x')
  assert.equal(next.reasoningEffort, 'xhigh')
  assert.equal(h.selects.at(-1).effort, 'xhigh')
})
