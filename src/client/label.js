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
    show1017 && is1017Model(entry.provider, entry.model) ? h(Tag, { tone: 'info' }, '1017') : null)
}

function ModelLabel({ entry, configStore }) {
  const cfg = useStore(configStore).config
  return h(LabelView, { entry, show1017: cfg.badges.show1017 })
}
