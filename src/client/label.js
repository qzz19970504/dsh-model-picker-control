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
  return h(Tag, { tone: cap.tone, style: { minWidth: 'calc(4ch + 16px)', justifyContent: 'center' } }, cap.text)
}

function ModelLabel({ entry, configStore }) {
  const cfg = useStore(configStore).config
  return h('span', { className: 'mpc-label' },
    h('span', { className: 'mpc-labelText' }, entry.name),
    h(Cap, { cap: entry.suffix }),
    cfg.badges.show1017 && is1017Model(entry.provider, entry.model) ? h(Tag, { tone: 'info' }, '1017') : null)
}
