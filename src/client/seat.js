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
    const live = React.useSyncExternalStore((fn) => directory.subscribe(fn), () => directory.getSnapshot())
    // Until the host has rebuilt its catalog, paint the last good one (and this session's last model) instead of "loading".
    const cached = live.groups.length === 0 && live.status === 'loading' ? catalogCache.read() : null
    const state = React.useMemo(() => {
      if (cached === null) return live
      return { ...live, groups: cached.groups, current: live.current ?? cachedSelection(cached, sessionId) }
    }, [live, cached, sessionId])
    const language = useLanguage()
    React.useEffect(() => {
      if (live.status === 'ready' && live.groups.length > 0) catalogCache.write({ groups: live.groups, current: live.current, sessionId })
    }, [live.status, live.groups, live.current?.provider, live.current?.model, live.current?.reasoningEffort, sessionId])
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
      return buildSections(state.groups, cfgState.config, { providerLabel, exhausted, current: hasFamilies ? currentKey : undefined })
    }, [state.groups, cfgState.config, accountName, exhausted, hasFamilies ? currentKey : undefined])
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
