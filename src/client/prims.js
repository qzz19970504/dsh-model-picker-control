// Own copies of the host primitives the stock picker uses (menu surface/group, input, spinner,
// toast, fuzzy ranking, sticky group headings). Adapted from the DeepSeek Harness client bundle (MIT, see NOTICE) so
// the picker feels identical, WITHOUT requiring any @deepseek-ai client package at runtime.
// `React`, `ReactDOM` and `h` (= React.createElement) are provided by the build header.

// ---- fuzzy ranking (rankByName) -------------------------------------------------------------
function wordBoundaryBonus(e, t) {
  return t === 0 || e.charAt(t - 1) === '-' || e.charAt(t - 1) === '_' ? 8 : 0
}

function fuzzyScore(e, t) {
  if (t.length > e.length) return undefined
  const NEG = Number.NEGATIVE_INFINITY
  let row = Array(e.length).fill(NEG)
  for (let s = 0; s < e.length; s++) if (e.charAt(s) === t.charAt(0)) row[s] = 1 + wordBoundaryBonus(e, s) - s
  for (let s = 1; s < t.length; s++) {
    const next = Array(e.length).fill(NEG)
    let u = NEG, hh = NEG, p = NEG
    for (const [g, y] of row.entries()) {
      if (hh !== NEG) p = Math.max(p, hh + g - 2)
      if (e.charAt(g) === t.charAt(s)) {
        const bonus = 1 + wordBoundaryBonus(e, g)
        let w = NEG
        if (u !== NEG) w = u + bonus + 4
        if (p !== NEG) w = Math.max(w, p + bonus + 1 - g)
        next[g] = w
      }
      hh = u
      u = y
    }
    row = next
  }
  let best = NEG
  for (const s of row) best = Math.max(best, s)
  return best === NEG ? undefined : best
}

function rankByName(items, query) {
  const q = query.toLowerCase()
  if (q === '') return items
  const scored = []
  items.forEach((item, index) => {
    const texts = item.label === undefined ? [item.name] : [item.name, item.label]
    let prefix = false
    let best
    for (const text of texts) {
      const lower = text.toLowerCase()
      const score = fuzzyScore(lower, q)
      if (score !== undefined) {
        prefix ||= lower.startsWith(q)
        best = best === undefined ? score : Math.max(best, score)
      }
    }
    if (best !== undefined) scored.push({ item, index, prefix, score: best })
  })
  scored.sort((a, b) => Number(b.prefix) - Number(a.prefix) || b.score - a.score || a.index - b.index)
  return scored.map((s) => s.item)
}

// ---- sticky group headings (observeStickyMenuGroups) ----------------------------------------
function observeStickyMenuGroups(root) {
  const states = [...root.querySelectorAll(':scope > [data-menu-group]')].flatMap((section) => {
    const heading = section.querySelector(':scope > [data-menu-group-heading]')
    const start = section.querySelector(':scope > [data-menu-group-start]')
    return heading === null || start === null ? [] : [{ section, heading, start, atTop: false, above: false, topTime: -Infinity, aboveTime: -Infinity }]
  })
  if (states.length === 0 || typeof IntersectionObserver === 'undefined' || typeof ResizeObserver === 'undefined') return () => {}
  const bySection = new Map(states.map((s) => [s.section, s]))
  const byStart = new Map(states.map((s) => [s.start, s]))
  let disposed = false
  let sectionObserver
  let lastHeight
  const apply = (s) => {
    const stuck = s.atTop && s.above
    if (s.heading.hasAttribute('data-stuck') !== stuck) s.heading.toggleAttribute('data-stuck', stuck)
  }
  const startObserver = new IntersectionObserver((entries) => {
    if (disposed) return
    for (const e of entries) {
      const s = byStart.get(e.target)
      if (!s || e.rootBounds === null || e.time < s.aboveTime) continue
      s.above = e.boundingClientRect.top < e.rootBounds.top
      s.aboveTime = e.time
      apply(s)
    }
  }, { root, threshold: [0, 1] })
  for (const { start } of states) startObserver.observe(start)
  const resize = new ResizeObserver((entries) => {
    if (disposed) return
    for (const e of entries) {
      if (e.target !== root || e.contentRect.height === lastHeight) continue
      lastHeight = e.contentRect.height
      sectionObserver?.disconnect()
      const obs = new IntersectionObserver((list) => {
        if (disposed || sectionObserver !== obs) return
        for (const k of list) {
          const s = bySection.get(k.target)
          if (!s || k.rootBounds === null) continue
          const top = k.rootBounds.top
          if (k.time >= s.topTime) { s.atTop = k.isIntersecting && k.boundingClientRect.bottom > top; s.topTime = k.time }
          if (k.time >= s.aboveTime) { s.above = k.boundingClientRect.top < top; s.aboveTime = k.time }
          apply(s)
        }
      }, { root, rootMargin: `0px 0px ${Math.min(1, lastHeight) - lastHeight}px 0px`, threshold: 0 })
      sectionObserver = obs
      for (const { section } of states) obs.observe(section)
    }
  })
  resize.observe(root)
  return () => {
    if (disposed) return
    disposed = true
    startObserver.disconnect()
    sectionObserver?.disconnect()
    resize.disconnect()
    for (const { heading } of states) if (heading.hasAttribute('data-stuck')) heading.removeAttribute('data-stuck')
  }
}

// ---- icons ----------------------------------------------------------------------------------
function Svg({ size = 16, className, fill = 'none', stroke = 'currentColor', viewBox = '0 0 16 16', children }) {
  return h('svg', { width: size, height: size, viewBox, fill, stroke, strokeWidth: fill === 'none' ? 1 : undefined, className, 'aria-hidden': 'true', focusable: 'false' }, children)
}
const path = (d, extra) => h('path', { d, strokeLinecap: 'round', strokeLinejoin: 'round', ...extra })
const IconChevronDown = (p) => h(Svg, { size: 14, ...p }, path('M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6'))
const IconChevronRight = (p) => h(Svg, { size: 14, ...p }, path('M6 12L9.29289 8.70711C9.68342 8.31658 9.68342 7.68342 9.29289 7.29289L6 4'))
const IconCheck = (p) => h(Svg, { size: 16, ...p }, path('M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4'))
const IconCloseFill = (p) => h(Svg, { size: 16, fill: 'currentColor', stroke: 'none', ...p }, h('path', { fillRule: 'evenodd', clipRule: 'evenodd', d: 'M15 8A7 7 0 1 1 1 8A7 7 0 1 1 15 8ZM6.409 10.652L5.348 9.591L6.939 8L5.348 6.409L6.409 5.348L8 6.939L9.591 5.348L10.652 6.409L9.061 8L10.652 9.591L9.591 10.652L8 9.061Z' }))
const IconWarning = (p) => h(Svg, { size: 16, ...p }, path('M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z'), path('M8 4.29199V9.79199'), path('M8 10.708V11.708'))
const IconData = (p) => h(Svg, { size: 16, ...p },
  path('M13.1967 5.1869C13.7232 4.77378 14.0003 4.30517 14.0001 3.82819C14.0003 3.3512 13.7232 2.88259 13.1967 2.46947C12.6702 2.05635 11.9128 1.71328 11.0006 1.47475C10.0885 1.23621 9.05371 1.11062 8.00039 1.1106C6.94707 1.11057 5.9123 1.23612 5.00009 1.47461C4.08742 1.71301 3.32948 2.05604 2.80249 2.46919C2.2755 2.88235 1.99805 3.35106 1.99805 3.82819C1.99805 4.30531 2.2755 4.77402 2.80249 5.18718C3.32948 5.60033 4.08742 5.94336 5.00009 6.18176C5.9123 6.42025 6.94707 6.5458 8.00039 6.54578C9.05371 6.54575 10.0885 6.42016 11.0006 6.18163C11.9128 5.94309 12.6702 5.60002 13.1967 5.1869Z'),
  path('M2 3.80371V11.7848'), path('M14 3.80371V11.7848'),
  path('M2 7.81396C2 8.60524 2.63214 9.36411 3.75736 9.92363C4.88258 10.4832 6.4087 10.7975 8 10.7975C9.5913 10.7975 11.1174 10.4832 12.2426 9.92363C13.3679 9.36411 14 8.60524 14 7.81396'),
  path('M2 11.7847C2 12.6081 2.63214 13.3977 3.75736 13.98C4.88258 14.5622 6.4087 14.8893 8 14.8893C9.5913 14.8893 11.1174 14.5622 12.2426 13.98C13.3679 13.3977 14 12.6081 14 11.7847'))

function StateDot() {
  return h('svg', { className: 'mpc-spinner', 'data-state': 'ongoing', width: 14, height: 14, viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    h('g', { className: 'mpc-spinnerMotion' },
      h('circle', { className: 'mpc-spinnerTrack', cx: 12, cy: 12, r: 9.5 }),
      h('circle', { className: 'mpc-spinnerArc', cx: 12, cy: 12, r: 9.5 })))
}

function Tag({ tone = 'neutral', children, title, style }) {
  return h('span', { className: 'mpc-tag', 'data-tone': tone, title, style }, children)
}

// ---- menu ------------------------------------------------------------------------------------
const MenuSurface = React.forwardRef(function MenuSurface({ className, children, ...rest }, ref) {
  return h('div', { ref, 'data-menu-material': 'translucent', className: ['mpc-surface', className].filter(Boolean).join(' '), ...rest },
    h('div', { 'aria-hidden': 'true', className: 'mpc-material' }), children)
})

function MenuGroup({ label, children }) {
  const id = React.useId()
  return h('section', { role: 'group', 'aria-labelledby': id, 'data-menu-group': '', className: 'mpc-group' },
    h('span', { 'aria-hidden': 'true', 'data-menu-group-start': '', className: 'mpc-groupStart' }),
    h('div', { id, 'data-menu-group-heading': '', className: 'mpc-groupHeading' }, label),
    children)
}

const Input = React.forwardRef(function Input({ className, icon, ...props }, ref) {
  return h('span', { className: ['mpc-inputWrap', className].filter(Boolean).join(' ') },
    icon ? h('span', { className: 'mpc-inputIcon' }, icon) : null,
    h('input', { ref, className: 'mpc-input', ...props }))
})

// ---- toast -----------------------------------------------------------------------------------
const TOAST_HOLD_MS = 3000
const TOAST_FADE_MS = 1000
function Toast({ text, icon, anchor, onDone }) {
  const [left, setLeft] = React.useState(undefined)
  React.useLayoutEffect(() => {
    if (anchor === null || anchor === undefined) return
    const place = () => { const r = anchor.getBoundingClientRect(); setLeft(r.left + r.width / 2) }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor])
  React.useEffect(() => {
    const timer = setTimeout(onDone, TOAST_HOLD_MS + TOAST_FADE_MS)
    return () => clearTimeout(timer)
  }, [onDone])
  return ReactDOM.createPortal(
    h('div', { className: 'mpc-toast', role: 'alert', style: { ...(left === undefined ? {} : { left }), '--mpc-toast-hold': `${TOAST_HOLD_MS}ms` } },
      icon ? h('span', { className: 'mpc-toastIcon' }, icon) : null, h('span', { className: 'mpc-toastText' }, text)),
    document.body)
}
