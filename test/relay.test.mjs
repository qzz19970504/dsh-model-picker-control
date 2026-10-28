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

function harness({ cfg = config(), selectFails = false, store, clock = { t: T0 } } = {}) {
  const selects = []
  const relay = createRelay({
    getConfig: () => cfg,
    now: () => clock.t,
    store,
    selectModel: async (sessionId, member, effort) => {
      selects.push({ sessionId, key: `${member.provider}/${member.model}`, effort })
      if (selectFails) throw new Error('refused')
    },
    resolveModelInfo: async () => ({ reasoning: { efforts: [{ id: 'low' }, { id: 'high' }] } }),
  })
  const agent = { id: 's1' }
  const request = async (provider, model) => relay.onRequest({ agent }, async () => ({ provider, model, reasoningEffort: 'low' }))
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
