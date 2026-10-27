// Settings-page building blocks: collapsible blocks (state remembered per browser) and the live picker preview card
// (drag to reorder models, a separate eye button to hide a model temporarily, e.g. when its quota is used up).

const PREVIEW_CSS = `
.mpc-set .mpc-fold{display:flex;align-items:center;gap:6px;width:100%;padding:2px 4px;margin:0 -4px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.mpc-set .mpc-fold:hover,.mpc-set .mpc-fold:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.mpc-set .mpc-fold h3,.mpc-set .mpc-fold .mpc-sub{flex:none}
.mpc-set .mpc-foldChevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .12s}
.mpc-set .mpc-fold[aria-expanded=false] .mpc-foldChevron{transform:rotate(-90deg)}
.mpc-set .mpc-foldSummary{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
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
function Fold({ id, folded, onToggle, title, summary, children, className }) {
  const open = !folded.has(id)
  const bodyId = `mpc-fold-${id.replace(/[^a-z0-9_-]/gi, '_')}`
  return h('div', { className: cx('mpc-foldWrap', className), style: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 } },
    h('button', { type: 'button', className: 'mpc-fold', 'aria-expanded': open, 'aria-controls': bodyId, onClick: () => onToggle(id) },
      h(IconChevronDown, { className: 'mpc-foldChevron' }), title,
      summary ? h('span', { className: 'mpc-foldSummary' }, summary) : null),
    h('div', { id: bodyId, className: 'mpc-foldBody', hidden: !open }, children))
}

const IconEye = (p) => h(Svg, { size: 16, ...p }, path('M1.5 8C2.8 5.4 5.2 3.8 8 3.8S13.2 5.4 14.5 8C13.2 10.6 10.8 12.2 8 12.2S2.8 10.6 1.5 8Z'), path('M8 9.9A1.9 1.9 0 1 0 8 6.1A1.9 1.9 0 0 0 8 9.9Z'))
const IconEyeOff = (p) => h(Svg, { size: 16, ...p }, path('M2 2L14 14'), path('M6.6 4.1C7 4 7.5 3.8 8 3.8C10.8 3.8 13.2 5.4 14.5 8C14 9 13.3 9.8 12.5 10.4'), path('M9.4 11.9C8.9 12.1 8.5 12.2 8 12.2C5.2 12.2 2.8 10.6 1.5 8C2 7 2.7 6.2 3.5 5.6'))

/**
 * Renders exactly what the picker menu will show (same pipeline, same labels) from the draft config.
 * Rows drag within their own group; ↑ ↓ on the handle works too. The eye button hides a model temporarily:
 * it is applied (and saved) at once through `onTempHide`, without waiting for the Save button.
 */
function ModelPreview({ groups, cfg, tr, onMove, onMoveTo, onTempHide, onClearTempHidden, accountName }) {
  const [drag, setDrag] = React.useState(null) // { section, key, over, after }
  const built = React.useMemo(() => buildSections(groups, cfg, {
    includeTempHidden: true,
    providerLabel: (g) => (g.id === 'deepseek-account' ? accountName : g.name),
  }), [groups, cfg, accountName])
  const tempCount = cfg.tempHidden.length
  const editable = cfg.enabled

  const rowDrop = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientY > rect.top + rect.height / 2
  }
  return h('div', { className: 'mpc-cards' },
    !editable && h('div', { className: 'mpc-hint' }, tr('preview.disabled')),
    h('div', { className: 'mpc-row' },
      h('span', { className: 'mpc-hint mpc-grow' }, tempCount === 0 ? tr('preview.noTemp') : tr('preview.tempCount', { count: tempCount })),
      h('button', { type: 'button', className: 'mpc-btn', disabled: tempCount === 0, onClick: onClearTempHidden }, tr('preview.showAll'))),
    built.sections.length === 0
      ? h('div', { className: 'mpc-hint' }, tr('catalog.empty'))
      : h('div', { className: 'mpc-pv', role: 'list' }, built.sections.map((section) => h('div', { key: section.id, role: 'group', 'aria-label': section.name },
        h('div', { className: 'mpc-pvHead' }, section.name),
        section.entries.map((entry) => {
          const dropState = drag !== null && drag.section === section.id && drag.over === entry.key && drag.key !== entry.key ? (drag.after ? 'after' : 'before') : undefined
          const temp = entry.tempHidden === true
          return h('div', {
            key: entry.key, role: 'listitem', className: 'mpc-pvRow', 'data-drop': dropState,
            'data-dragging': drag !== null && drag.key === entry.key ? '' : undefined, 'data-temp': temp ? '' : undefined,
            onDragOver: (e) => {
              if (drag === null || drag.section !== section.id) return
              e.preventDefault()
              const after = rowDrop(e)
              if (drag.over !== entry.key || drag.after !== after) setDrag({ ...drag, over: entry.key, after })
            },
            onDrop: (e) => {
              if (drag === null || drag.section !== section.id) return
              e.preventDefault()
              onMoveTo(section.id, drag.key, entry.key, rowDrop(e))
              setDrag(null)
            },
          },
          h('button', {
            type: 'button', className: 'mpc-pvBtn mpc-pvDrag', draggable: editable, disabled: !editable, 'aria-label': tr('preview.drag'), title: tr('preview.drag'),
            onDragStart: (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', entry.key); setDrag({ section: section.id, key: entry.key, over: entry.key, after: false }) },
            onDragEnd: () => setDrag(null),
            onKeyDown: (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onMove(section.id, entry.key, e.key === 'ArrowUp' ? -1 : 1) } },
          }, '⋮⋮'),
          h('span', { className: 'mpc-pvName' }, h(LabelView, { entry, show1017: cfg.badges.show1017 })),
          h('button', {
            type: 'button', className: 'mpc-pvBtn', 'aria-pressed': temp, title: temp ? tr('preview.unhide') : tr('preview.hide'),
            'aria-label': (temp ? tr('preview.unhide') : tr('preview.hide')) + ': ' + entry.name, onClick: () => onTempHide(entry.key, !temp),
          }, temp ? h(IconEyeOff) : h(IconEye)))
        })))))
}
