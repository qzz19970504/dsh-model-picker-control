// Stylesheet: the host picker CSS (ModelSelect.module.css) renamed to the mpc- namespace plus
// the primitive styles (menu surface/group, input, spinner, tag, toast) and the badge/label styles.
const PICKER_CSS = `
.mpc-root{min-width:0;position:relative}
.mpc-trigger{border-radius:var(--dsw-radius-sm);min-width:0;max-width:min(360px,45cqw);height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:400;line-height:20px;display:flex}
.mpc-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.mpc-trigger:focus-visible:not([data-selection-focus]){box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.mpc-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.mpc-triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}
.mpc-triggerEffort{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-caption);flex-shrink:1000;overflow:hidden}
.mpc-triggerIcon{display:var(--dsh-composer-model-icon-display,none);flex:none}
.mpc-triggerLabel,.mpc-triggerEffort{display:var(--dsh-composer-model-text-display,block)}
.mpc-chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s}
.mpc-chevronOpen{transform:rotate(180deg)}
.mpc-surface.mpc-menu{z-index:1100;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:max-content;min-width:min(240px,100vw - 32px);max-width:min(420px,100vw - 32px);max-height:min(360px,100vh - 96px);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;flex-direction:column;padding:4px;display:flex;position:fixed;overflow:hidden}
.mpc-status,.mpc-empty{color:var(--dsw-alias-label-tertiary);padding:8px;font-size:12px;line-height:18px}
.mpc-error,.mpc-warning{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:3px;padding:6px 7px;font-size:11px;line-height:16px;display:flex}
.mpc-warning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}
.mpc-retry{color:inherit;font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:0;font-weight:600}
.mpc-searchRow{flex-shrink:0;margin:2px 0 3px;position:relative}
.mpc-searchRow .mpc-search{border-radius:var(--dsw-radius-md);background:0 0;border:0 solid #0000;height:auto;padding:5px 7px;display:flex}
.mpc-searchRow .mpc-searchWithQuery{padding-right:34px}
.mpc-searchClear{corner-shape:round;width:24px;height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:50%;justify-content:center;align-items:center;padding:0;display:inline-flex;position:absolute;top:50%;right:4px;transform:translateY(-50%)}
.mpc-searchClear:hover,.mpc-searchClear:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.mpc-searchRow .mpc-search:focus-within{border-color:#0000}
.mpc-searchRow .mpc-search input{padding:0;font-size:12px;line-height:normal}
.mpc-searchRow .mpc-search input::placeholder{color:var(--dsw-alias-label-caption)}
.mpc-groups{min-height:0;overflow-y:auto}
.mpc-option{box-sizing:border-box;border-radius:var(--dsw-radius-md);width:auto;min-width:100%;min-height:34px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;outline:none;align-items:center;gap:6px;padding:5px 7px;display:flex}
.mpc-option:not(.mpc-modelOption):hover:not(:disabled),.mpc-option:focus-visible,.mpc-optionActive:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.mpc-selected{background:0 0}
.mpc-option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.mpc-optionCopy{flex-direction:column;flex:1;min-width:0;display:flex}
.mpc-modelName{color:inherit;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:400;line-height:18px;overflow:hidden}
.mpc-check{color:var(--dsw-alias-label-primary);flex:0 0 14px;place-items:center;display:grid}
.mpc-check svg{width:14px;height:14px}
.mpc-cell{box-sizing:border-box;border-radius:var(--dsw-radius-md);width:auto;min-width:100%;height:34px;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;background:0 0;border:none;outline:none;align-items:center;gap:6px;padding:0 8px;font-size:13px;line-height:20px;display:flex}
.mpc-cell:hover,.mpc-cell:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.mpc-cellLabel{white-space:nowrap;flex:none}
.mpc-cellValue{text-overflow:ellipsis;white-space:nowrap;text-align:right;min-width:0;color:var(--dsw-alias-label-tertiary);flex:auto;overflow:hidden}
.mpc-cellChevron{width:12px;height:12px;color:var(--dsw-alias-menu-icon);flex:none}
.mpc-surface{anchor-name:var(--dsh-menu-anchor);isolation:isolate;border-radius:var(--dsw-radius-lg);position:relative}
.mpc-material{position:absolute;inset:0;z-index:-1;border-radius:inherit;background:var(--dsw-menu-surface-fill);backdrop-filter:var(--dsw-menu-backdrop-filter);pointer-events:none}
.mpc-group{position:relative}
.mpc-group+.mpc-group{margin-top:3px}
.mpc-groupStart{position:absolute;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none}
.mpc-groupHeading{position:sticky;top:0;z-index:1;padding:4px 7px 2px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-weight:500;border-radius:var(--dsw-radius-md)}
.mpc-groupHeading[data-stuck]{background:var(--dsw-alias-menu-group-header-fill)}
.mpc-inputWrap{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}
.mpc-inputWrap:focus-within{border-color:var(--dsw-alias-state-business-primary)}
.mpc-inputIcon{display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary)}
.mpc-input{flex:1;min-width:0;border:none;outline:none;background:transparent;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}
.mpc-input::placeholder{color:var(--dsw-alias-label-dimmed)}
.mpc-spinner{flex:none;color:var(--dsw-alias-label-tertiary)}
.mpc-spinnerMotion{transform-origin:center;animation:mpc-spin 1.5s linear infinite}
.mpc-spinnerTrack,.mpc-spinnerArc{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
.mpc-spinnerTrack{opacity:.25}
.mpc-spinnerArc{stroke-dasharray:12 150;animation:mpc-dash 1.5s ease-in-out infinite}
@keyframes mpc-spin{to{transform:rotate(360deg)}}
@keyframes mpc-dash{0%{stroke-dasharray:12 150;stroke-dashoffset:0}50%{stroke-dasharray:24 150;stroke-dashoffset:-6}to{stroke-dasharray:12 150;stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){.mpc-spinnerMotion,.mpc-spinnerArc{animation:none}.mpc-spinnerArc{stroke-dasharray:18 150;stroke-dashoffset:-3}}
.mpc-tag{flex:none;box-sizing:border-box;display:inline-flex;align-items:center;border-radius:999px;corner-shape:round;padding:1px 8px;font-size:11px;line-height:17px;font-weight:600;font-family:inherit;white-space:nowrap}
.mpc-tag[data-tone=info]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);color:var(--dsw-alias-state-business-primary)}
.mpc-tag[data-tone=blue]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 88%,#000)}
.mpc-tag[data-tone=red]{background:color-mix(in srgb,#d9544f 12%,transparent);color:color-mix(in srgb,#d9544f 88%,#000)}
.mpc-tag[data-tone=cyan]{background:color-mix(in srgb,#1fb89a 12%,transparent);color:color-mix(in srgb,#1fb89a 88%,#000)}
.mpc-tag[data-tone=neutral]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.mpc-toast{position:fixed;top:40px;left:50%;z-index:1100;pointer-events:none;display:flex;align-items:center;gap:10px;width:max-content;max-width:min(640px,calc(100vw - 48px));padding:12px 16px;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-toast-bg);color:var(--dsw-alias-toast-label);font-size:14px;line-height:22px;box-shadow:var(--dsw-shadow-lv3);transform:translate(-50%);animation:mpc-toast-in .16s ease-out,mpc-toast-fade 1s ease var(--mpc-toast-hold,3s) forwards}
@keyframes mpc-toast-in{0%{opacity:0;transform:translate(-50%,-6px)}to{opacity:1;transform:translate(-50%)}}
@keyframes mpc-toast-fade{to{opacity:0;visibility:hidden}}
.mpc-label{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;vertical-align:baseline;max-width:100%}
.mpc-labelText{overflow:hidden;text-overflow:ellipsis}
`

function installStyles(doc, name, css) {
  const id = `dsh-model-picker-control/${name}`
  if (doc.querySelector(`style[data-plugin-css=${JSON.stringify(id)}]`) !== null) return () => {}
  const tag = doc.createElement('style')
  tag.dataset.plugin = 'dsh-model-picker-control'
  tag.dataset.pluginCss = id
  tag.textContent = css
  doc.head.appendChild(tag)
  return () => tag.remove()
}
