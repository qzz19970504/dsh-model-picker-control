// Settings-page building blocks: collapsible blocks (state remembered per browser) and the live picker preview card
// (drag to reorder models, a separate eye button to hide a model temporarily, e.g. when its quota is used up).

const PREVIEW_CSS = `
.mpc-set .mpc-fold{display:flex;align-items:center;gap:6px;width:100%;padding:2px 4px;margin:0 -4px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.mpc-set .mpc-fold:hover,.mpc-set .mpc-fold:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.mpc-set .mpc-fold h3,.mpc-set .mpc-fold .mpc-sub{flex:none}
.mpc-set .mpc-foldChevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .12s}
.mpc-set .mpc-fold[aria-expanded=false] .mpc-foldChevron{transform:rotate(-90deg)}
.mpc-set .mpc-foldSummary{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.mpc-set .mpc-foldHead{display:flex;align-items:center;gap:6px;min-width:0}
.mpc-set .mpc-foldHead .mpc-fold{flex:1;min-width:0;width:auto}
.mpc-set .mpc-foldActions{flex:none;width:36px;display:flex;justify-content:center}
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
function Fold({ id, folded, onToggle, title, summary, children, className, actions }) {
  const open = !folded.has(id)
  const bodyId = `mpc-fold-${id.replace(/[^a-z0-9_-]/gi, '_')}`
  return h('div', { className: cx('mpc-foldWrap', className), style: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 } },
    h('div', { className: 'mpc-foldHead' },
      h('button', { type: 'button', className: 'mpc-fold', 'aria-expanded': open, 'aria-controls': bodyId, onClick: () => onToggle(id) },
        h(IconChevronDown, { className: 'mpc-foldChevron' }), title,
        summary ? h('span', { className: 'mpc-foldSummary' }, summary) : null),
      actions ? h('span', { className: 'mpc-foldActions' }, actions) : null),
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
