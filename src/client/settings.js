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
.mpc-set .mpc-card{container-type:inline-size}
.mpc-set button.mpc-btn,.mpc-set .mpc-row>label,.mpc-set .mpc-section label{white-space:nowrap}
.mpc-set .mpc-section{display:grid;grid-template-columns:22px minmax(120px,1fr) 62px 168px 36px 88px 56px;align-items:center;column-gap:10px;padding:3px 4px;border-radius:var(--dsw-radius-md);border-top:2px solid transparent;border-bottom:2px solid transparent}
.mpc-set .mpc-section>*{min-width:0}
.mpc-set .mpc-section select,.mpc-set .mpc-section input[type=text]{width:100%}
.mpc-set .mpc-section label{display:inline-flex;align-items:center;gap:6px}
.mpc-set .mpc-section button.mpc-btn{width:100%;padding:0 6px}
.mpc-set .mpc-kind{color:var(--dsw-alias-label-tertiary);font-size:12px;white-space:nowrap}
.mpc-set .mpc-bulk{display:block}
.mpc-set .mpc-bulk>button{width:100%}
@container (max-width:600px){.mpc-set .mpc-section{grid-template-columns:22px minmax(100px,1fr) 150px 36px 84px 52px}.mpc-set .mpc-section .mpc-kind{display:none}.mpc-set .mpc-model{grid-template-columns:minmax(80px,1fr) max-content 104px 36px;gap:8px}}
.mpc-set .mpc-section[data-drop=before]{border-top-color:var(--dsw-alias-state-business-primary)}
.mpc-set .mpc-section[data-drop=after]{border-bottom-color:var(--dsw-alias-state-business-primary)}
.mpc-set .mpc-section[data-dragging]{opacity:.45}
.mpc-set .mpc-handle{flex:none;width:22px;height:28px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:grab;font-size:16px;line-height:28px;padding:0;border-radius:var(--dsw-radius-md)}
.mpc-set .mpc-handle:hover,.mpc-set .mpc-handle:focus-visible{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.mpc-set .mpc-handle:active{cursor:grabbing}
.mpc-set .mpc-model{display:grid;grid-template-columns:minmax(96px,1fr) max-content 124px 36px;gap:8px 12px;align-items:center}
.mpc-set .mpc-model>*{min-width:0}
.mpc-set .mpc-model input[type=text],.mpc-set .mpc-model select{width:100%;min-width:0}
.mpc-set .mpc-modelHead{color:var(--dsw-alias-label-tertiary);font-size:11px}
.mpc-set .mpc-modelHead>*{text-align:left;padding-left:2px}
.mpc-set .mpc-modelHead>:last-child{text-align:center;padding-left:0}
.mpc-set .mpc-modelHide{display:flex;justify-content:center;align-items:center;min-height:28px}
.mpc-set .mpc-eye{flex:none;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.mpc-set .mpc-eye:hover,.mpc-set .mpc-eye:focus-visible{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);outline:none}
.mpc-set .mpc-eye[data-off]{color:var(--dsw-alias-label-tertiary);opacity:.65}
.mpc-set .mpc-eye[data-partial]{opacity:.7}
.mpc-set .mpc-capCell{display:flex;align-items:center;gap:6px;min-height:28px}
.mpc-set .mpc-tones{position:relative;display:inline-flex;align-items:center;gap:6px;flex:none}
.mpc-set .mpc-capColor{display:flex;align-items:center;gap:6px}
.mpc-set .mpc-capPop,.mpc-set .mpc-pop{position:absolute;z-index:20;top:calc(100% + 6px);left:0;padding:8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);box-shadow:0 6px 20px rgba(0,0,0,.28)}
.mpc-set .mpc-pop{right:0;left:auto;display:flex;flex-direction:column;gap:8px;width:max-content;max-width:260px}
.mpc-set .mpc-pop .mpc-tones{flex-wrap:wrap}
.mpc-set .mpc-pop .mpc-capColor{margin-top:2px}
.mpc-set .mpc-bulk{position:relative}
.mpc-set .mpc-applyBtn{align-self:flex-end}
.mpc-set .mpc-tone[data-holo]{background:conic-gradient(from 30deg,#ff3df0,#7a5cff,#00d4ff,#2bff9e,#ffe14d,#ff7a3d,#ff3df0);box-shadow:none}
.mpc-set .mpc-capClear{flex:none;width:18px;height:18px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:16px;cursor:pointer}
.mpc-set .mpc-capClear:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.mpc-set .mpc-capClear:disabled{opacity:.25;cursor:default}
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
 * One row of tone dots (blue / red / cyan / custom / holo). Custom opens a small popover under the dot (color picker +
 * hex / RGB text) instead of pushing a second row into the table; `inline` shows those two fields in place (used inside
 * another popover). `value` = { tone, color? } or undefined (nothing selected).
 */
function TonePicker({ value, onPick, tr, inline = false }) {
  const [open, setOpen] = React.useState(false)
  const box = React.useRef(null)
  const tone = value?.tone
  const color = value?.color ?? DEFAULT_CAP_COLOR
  React.useEffect(() => {
    if (!open || inline) return undefined
    const away = (e) => { if (box.current !== null && !box.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true) }
  }, [open, inline])
  const fields = h('div', { className: cx('mpc-capColor', !inline && 'mpc-capPop') },
    h('input', { type: 'color', value: color, 'aria-label': tr('cap.color'), title: tr('cap.color'), onChange: (e) => onPick({ tone: 'custom', color: parseColor(e.target.value) ?? color }) }),
    h(CommitInput, { value: color, placeholder: '#RRGGBB / R,G,B', 'aria-label': tr('cap.colorText'), title: tr('cap.colorHint'), spellCheck: false,
      validate: (v) => parseColor(v) !== undefined, onCommit: (v) => onPick({ tone: 'custom', color: parseColor(v) }) }))
  const dot = (key, style, label, extra) => h('button', { key, type: 'button', className: 'mpc-tone', style, 'aria-pressed': tone === key, title: label, 'aria-label': label, ...extra })
  return h('span', { className: 'mpc-tones', ref: box },
    ['blue', 'red', 'cyan'].map((x) => dot(x, { '--mpc-tone': TONE_COLORS[x] }, tr('cap.tone.' + x), { onClick: () => { setOpen(false); onPick({ tone: x }) } })),
    dot('custom', { '--mpc-tone': tone === 'custom' ? color : CUSTOM_SWATCH }, tr('cap.tone.custom'), { 'data-custom': '', 'aria-expanded': inline ? undefined : open,
      onClick: () => { onPick({ tone: 'custom', color }); if (!inline) setOpen(tone !== 'custom' || !open) } }),
    dot('holo', {}, tr('cap.tone.holo'), { 'data-holo': '', onClick: () => { setOpen(false); onPick({ tone: 'holo' }) } }),
    inline ? (tone === 'custom' ? fields : null) : (open && tone === 'custom' ? fields : null))
}

/**
 * Suffix capsule editor: up to CAP_MAX characters + a tone (TonePicker). Text may stay empty: that is a color-only
 * capsule. The text color is derived automatically (capTextColor: same hue, contrast >= 4.5:1). The x removes the capsule.
 */
function CapCell({ cap, onChange, tr }) {
  const text = cap?.text ?? ''
  const emit = (patch) => onChange({ text, tone: cap?.tone ?? 'blue', ...(cap?.tone === 'custom' ? { color: cap.color } : {}), ...patch })
  return h('div', { className: 'mpc-capCell' },
    h(CommitInput, { value: text, 'aria-label': tr('cap.text'), title: tr('cap.text'), maxLength: CAP_MAX,
      onCommit: (v) => emit({ text: Array.from(v.trim()).slice(0, CAP_MAX).join('') }) }),
    h(TonePicker, { value: cap, tr, onPick: (s) => onChange({ text, tone: s.tone, ...(s.tone === 'custom' ? { color: s.color } : {}) }) }),
    h('button', { type: 'button', className: 'mpc-capClear', disabled: cap === undefined, 'aria-label': tr('cap.none'), title: tr('cap.none'), onClick: () => onChange(undefined) }, '×'))
}

/** Eye toggle replacing the old "hide" checkboxes. hidden -> crossed eye. */
function EyeToggle({ hidden, partial = false, onToggle, label }) {
  return h('button', { type: 'button', className: 'mpc-eye', 'data-off': hidden ? '' : undefined, 'data-partial': partial ? '' : undefined, 'aria-pressed': hidden, title: label, 'aria-label': label, onClick: onToggle },
    hidden ? h(IconEyeOff) : h(IconEye))
}

/** Per-section "same capsule color for every model in it" popover. */
function BulkCap({ onApply, tr }) {
  const [open, setOpen] = React.useState(false)
  const [style, setStyle] = React.useState({ tone: 'blue' })
  const box = React.useRef(null)
  React.useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (box.current !== null && !box.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true) }
  }, [open])
  return h('span', { className: 'mpc-bulk', ref: box },
    h('button', { type: 'button', className: 'mpc-btn', 'aria-expanded': open, title: tr('bulk.title'), onClick: () => setOpen(!open) }, tr('bulk.open')),
    open && h('div', { className: 'mpc-pop', role: 'dialog', 'aria-label': tr('bulk.title') },
      h('div', { className: 'mpc-hint' }, tr('bulk.hint')),
      h(TonePicker, { value: style, tr, inline: true, onPick: setStyle }),
      h('button', { type: 'button', className: 'mpc-btn mpc-applyBtn', onClick: () => { onApply(style); setOpen(false) } }, tr('bulk.apply'))))
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
    const emptyCaps = countEmptyCaps(cfg)
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
              h('span', { className: 'mpc-kind' }, isPartition ? tr('sections.partition') : tr('sections.provider')),
              h('select', { value: cfg.sort.bySection[id] ?? '', 'aria-label': tr('sections.sort'), onChange: (e) => edit((c) => { const bySection = { ...c.sort.bySection }; if (e.target.value === '') delete bySection[id]; else bySection[id] = e.target.value; return { ...c, sort: { ...c.sort, bySection } } }) },
                h('option', { value: '' }, tr('sort.inherit')), sortOptions),
              h(EyeToggle, { hidden: sectionHidden(id), onToggle: () => setSection(id, { hidden: !sectionHidden(id) }), label: tr(sectionHidden(id) ? 'action.unhide' : 'action.hide') }),
              h(BulkCap, { tr, onApply: (style) => edit((c) => setSectionCaps(groups, c, id, style)) }),
              isPartition ? h('button', { type: 'button', className: 'mpc-btn mpc-danger', onClick: () => edit((c) => removePartition(c, id.slice(PARTITION_PREFIX.length))) }, tr('action.delete')) : h('span', null))
          }),
          h('div', { className: 'mpc-row' },
            h('input', { type: 'text', className: 'mpc-grow', value: newPartition, placeholder: tr('partition.placeholder'), onChange: (e) => setNewPartition(e.target.value),
              onKeyDown: (e) => { if (e.key === 'Enter') addNewPartition() } }),
            h('button', { type: 'button', className: 'mpc-btn', disabled: newPartition.trim() === '', onClick: addNewPartition }, tr('partition.add'))),
          h('div', { className: 'mpc-row' },
            h('button', { type: 'button', className: 'mpc-btn', disabled: emptyCaps === 0, onClick: () => edit((c) => clearEmptyCaps(c)) }, tr('bulk.clearEmpty')),
            h('span', { className: 'mpc-hint' }, tr('bulk.clearEmptyHint', { count: emptyCaps })))))),


      h('section', { className: 'mpc-sec' }, h(Fold, { id: 'models', ...foldProps, title: h('h3', null, tr('models.title')) },
        h('div', { className: 'mpc-hint' }, tr('models.hint')),
        h('div', { className: 'mpc-cards' }, groups.map((g) => h('div', { key: g.id, className: 'mpc-card' },
          h(Fold, { id: 'models:' + g.id, ...foldProps, title: h('span', { className: 'mpc-sub', title: g.id }, cfg.providers[g.id]?.name ?? g.name), summary: tr('models.count', { count: g.models.length }),
            actions: (() => {
              const keys = g.models.map((m) => modelKey(g.id, m.id))
              const hiddenCount = keys.filter((k) => cfg.models[k]?.hidden === true).length
              const all = keys.length > 0 && hiddenCount === keys.length
              return h(EyeToggle, { hidden: all, partial: hiddenCount > 0 && !all, label: tr(all ? 'models.showAll' : 'models.hideAll'),
                onToggle: () => edit((c) => setModelsHidden(c, keys, !all)) })
            })() },
          h('div', { className: 'mpc-model mpc-modelHead' }, ['name', 'suffix', 'partition', 'hide'].map((k) => h('span', { key: k }, tr(`models.col.${k}`)))),
          g.models.map((m) => {
            const key = modelKey(g.id, m.id)
            const ov = cfg.models[key] ?? {}
            const set = (patch) => edit((c) => setModelOverride(c, key, patch))
            const setCap = (cap) => set({ suffix: cap })
            return h('div', { key: m.id, className: 'mpc-model' },
              h(CommitInput, { value: ov.name ?? m.name, restore: m.name, title: m.name, onCommit: (v) => set({ name: v.trim() === m.name ? undefined : v.trim() }) }),
              h(CapCell, { cap: ov.suffix, onChange: setCap, tr }),
              h('select', { value: ov.partition ?? '', onChange: (e) => set({ partition: e.target.value }) },
                h('option', { value: '' }, tr('models.noPartition')), cfg.partitions.map((p) => h('option', { key: p.id, value: p.id }, p.name))),
              h('div', { className: 'mpc-modelHide' }, h(EyeToggle, { hidden: ov.hidden === true, onToggle: () => set({ hidden: ov.hidden !== true }), label: tr(ov.hidden === true ? 'action.unhide' : 'action.hide') })))
          }))))))),

      h('section', { className: 'mpc-sec' }, h(Fold, { id: 'preview', ...foldProps, title: h('h3', null, tr('preview.title')) },
        h('div', { className: 'mpc-hint' }, tr('preview.hint')),
        h('div', { className: 'mpc-card' },
          h(ModelPreview, { groups, cfg, tr, accountName, onMove: (sid, key, d) => edit((c) => moveModel(groups, c, sid, key, d)),
            onMoveTo: (sid, key, target, after) => edit((c) => moveModelTo(groups, c, sid, key, target, after)), onTempHide: tempHide, onClearTempHidden: clearTemp,
            onMerge: (sid, key, target) => edit((c) => mergeIntoFamily(groups, c, sid, key, target)), cooldowns, onRelease: release,
            onFamily: { rename: (id, name) => edit((c) => setFamily(c, id, { name })), cap: (id, cap) => edit((c) => setFamily(c, id, { suffix: cap })),
              dissolve: (id) => edit((c) => dissolveFamily(groups, c, id)), ungroup: (id, key) => edit((c) => ungroupMember(groups, c, id, key)),
              moveMember: (id, key, delta) => edit((c) => moveFamilyMember(c, id, key, delta)), moveMemberTo: (id, key, target, after) => edit((c) => moveFamilyMemberTo(c, id, key, target, after)) } })))),

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
