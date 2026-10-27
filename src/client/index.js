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
