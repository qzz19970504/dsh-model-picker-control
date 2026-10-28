<h1 align="center">dsh-model-picker-control</h1>

<p align="center"><a href="./README.md">English</a> | <a href="./README_ZH.md">中文</a></p>

<p align="center"><strong>Model picker control for DSH</strong> — <em>rename, regroup, sort, hide and badge every model in one place.</em></p>

<p align="center"><sub>cross-provider partitions · rename models &amp; groups · drag-to-reorder · hide a provider or a single model · suffix capsules · model folders with quota failover · one-click restore</sub></p>

<p align="center">
<a href="https://www.npmjs.com/package/dsh-model-picker-control"><img src="https://img.shields.io/npm/v/dsh-model-picker-control.svg?style=flat-square" alt="npm"></a>
<a href="./LICENSE"><img src="https://img.shields.io/npm/l/dsh-model-picker-control.svg?style=flat-square" alt="license"></a>
<a href="https://github.com/qzz19970504/dsh-model-picker-control"><img src="https://img.shields.io/badge/GitHub-qzz19970504%2Fdsh--model--picker--control-181717?style=flat-square&logo=github" alt="GitHub"></a>
<a href="https://www.deepseek.com"><img src="https://img.shields.io/badge/dsh-plugin-5786FE?style=flat-square" alt="dsh plugin"></a>
</p>

<p align="center">
<code>dsh plugin add dsh-model-picker-control</code>
</p>

<p align="center">
<a href="https://www.deepseek.com" title="DeepSeek Harness"><img src="https://cdn.simpleicons.org/deepseek/5786FE" height="26" alt="DeepSeek"></a>&nbsp;
<a href="https://nodejs.org" title="Node.js"><img src="https://cdn.simpleicons.org/nodedotjs/5FA04E" height="26" alt="Node.js"></a>&nbsp;
<a href="https://react.dev" title="React"><img src="https://cdn.simpleicons.org/react/61DAFB" height="26" alt="React"></a>&nbsp;
<a href="https://www.npmjs.com" title="npm"><img src="https://cdn.simpleicons.org/npm/CB3837" height="26" alt="npm"></a>
</p>

---

## Why

DSH ships a good model picker, but the display is fixed: providers come in a hard-coded order, model names are whatever the catalog says, and there is no way to put two models from different providers side by side. If you route some models through an account provider and others through a partner provider, the list you actually want never exists.

This plugin gives you one settings page — sitting next to the built-in **Models** page — that owns the *display* of the picker, without patching a single third-party plugin. Hide the models you never touch, rename the rest into something you can recognise at a glance, drag the groups into the order you think in, and merge models from different providers into a partition such as **Free** or **Experimental**.

## Features

| | |
|---|---|
| **Rename anything** | Model display names, provider group names, and a short suffix capsule per model. |
| **Cross-provider partitions** | Create a partition and drop models into it from any provider — they render as one group. |
| **Drag to reorder** | Reorder provider groups and partitions with a handle (or focus it and press <kbd>↑</kbd> <kbd>↓</kbd>). |
| **Hide, don't delete** | Hide a single model with the eye button; the eye on a provider card hides or shows all of its models at once. Nothing is removed from the catalog. |
| **In-group order** | Catalog order, by model name, or manual (drag in the preview). Per group or globally. |
| **Suffix capsules** | A host-native pill after the name — blue, dark red, cyan, any custom color or a holographic border — that sits beside the host's own `1017` tag. The text may be empty (a color-only chip). Per section, **Capsule color** paints every model in it at once, and **Clear empty capsules** removes the text-less ones. |
| **Model folders** | In the preview card, drag a row onto the middle of another row of the same group to merge them into a folder (a "family"). The folder takes one row in the picker, can carry a capsule, and its members run top to bottom: when a request fails with an exhausted quota, rate limit or auth error, the next member takes over and the request is resent as a normal model switch; the failed member rests until local midnight. Members you hid by hand, or that are hidden or outside the folder's group, are skipped. The folder offers the reasoning levels of its top member; after an automatic switch the highest level of the new member is used. Standalone, no other plugin needed. |
| **Preview & temporary hide** | A live preview card shows the picker as it will render: drag models into order, expand folders, and use the eye button to hide exhausted models for now (saved at once, no **Save** needed). |
| **Draft & save** | Every edit stays local until you press **Save**; leaving the page with changes asks first. |
| **Restore** | One click clears the plugin's settings; the host default returns. |

## Screenshots

The screenshots are rendered from this plugin's real build with sample data (the host UI is simulated, the plugin code is not). The picker shows cross-provider **Free**, **Fast** and **Flagship** partitions, a suffix capsule on most names in every tone (blue, red, cyan, custom color, holographic), a color-only capsule, and a **model folder** (`DeepSeek V4.1 Flash`, tagged `Pool`) that stands for several models and relays between them when one runs out of quota.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/qzz19970504/dsh-model-picker-control/main/docs/picker-en-dark.png">
    <img src="https://raw.githubusercontent.com/qzz19970504/dsh-model-picker-control/main/docs/picker-en-light.png" width="360" alt="Model picker with cross-provider partitions, suffix capsules and a model folder">
  </picture>
</p>

The holographic capsule is a dark violet pill with a rainbow border that turns slowly, a small pale catch-light that drifts around that border the other way, and a violet and a cyan glow that breathe on their own rhythm. The glow stays within a few pixels so it fits the composer row. Hover gives the border one extra turn and brightens the glow without making it bigger. Keyboard focus draws a light ring. With `prefers-reduced-motion` it keeps the static gradient border and drops the motion:

<p align="center">
  <img src="https://raw.githubusercontent.com/qzz19970504/dsh-model-picker-control/main/docs/holo.gif" width="360" alt="Holographic capsules with a rotating border">
</p>

**Settings → Groups & partitions** — drag the groups into your own order, rename or hide a provider, and create a partition that pulls models in from any provider:

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/qzz19970504/dsh-model-picker-control/main/docs/groups-en-dark.png">
    <img src="https://raw.githubusercontent.com/qzz19970504/dsh-model-picker-control/main/docs/groups-en-light.png" width="640" alt="Groups and partitions page">
  </picture>
</p>

**Settings → Models** — rename a model, type a suffix capsule and pick its tone, drop it into a partition, or hide it. Nothing is written until you press **Save**:

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/qzz19970504/dsh-model-picker-control/main/docs/models-en-dark.png">
    <img src="https://raw.githubusercontent.com/qzz19970504/dsh-model-picker-control/main/docs/models-en-light.png" width="640" alt="Model table page">
  </picture>
</p>

**Settings → Picker preview** — the picker as it will render. Drag a row to reorder it, drop it on the middle of another row to merge both into a folder, and use the eye button to hide an exhausted model for now (applied at once, no **Save** needed):

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/qzz19970504/dsh-model-picker-control/main/docs/preview-en-dark.png">
    <img src="https://raw.githubusercontent.com/qzz19970504/dsh-model-picker-control/main/docs/preview-en-light.png" width="640" alt="Picker preview with an expanded model folder">
  </picture>
</p>

## Install

```
dsh plugin add dsh-model-picker-control
```

Then restart DSH. Open **Settings** — a new page, **Model picker** (模型选择器), appears next to the built-in **Models** page.

Prefer a local build?

```bash
git clone https://github.com/qzz19970504/dsh-model-picker-control.git
cd dsh-model-picker-control
npm install
npm test
npm pack                          # produces dsh-model-picker-control-<version>.tgz
dsh plugin add ./dsh-model-picker-control-<version>.tgz
```

## Quickstart

1. Open **Settings → Model picker**.
2. Under **Groups and partitions**, press **New partition** and name it, for example, `Free`.
3. In the **Models** table, pick `Free` in the partition dropdown of the models you want there — from any provider.
4. Drag the groups into the order you like, hide what you don't use, and give the important ones a suffix capsule such as `NEW` or `cheap`. To color a whole partition at once, use **Capsule color** on its row.
5. Optional: in the preview card, drag one model onto the middle of another in the same group to make a folder that fails over from top to bottom.
6. Press **Save**, then open the model picker in the composer. It matches immediately; no restart needed.

## Configuration

Everything is stored under this plugin's own row in your profile config (`config.picker`), written through the host settings service:

```yaml
- id: model-picker-control
  name: 'dsh-model-picker-control'
  config:
    picker:
      version: 1
      enabled: true          # false = restore the host display, keep the settings
      sectionOrder: [p:free, deepseek-official, workbuddy]
      providers:
        deepseek-account: { name: DeepSeek Account, hidden: false }
      models:
        deepseek-official/deepseek-pro: { name: DeepSeek-V4.1-Pro, suffix: { text: cheap, tone: red }, partition: p:free }
        workbuddy/step-5-preview: { suffix: { text: NEW, tone: cyan }, partition: p:free, hidden: false }
      partitions:
        - { id: p:free, name: Free }
      sort: { default: name, bySection: { workbuddy: catalog } }
      order: { p:free: [deepseek-official/deepseek-pro] }   # used when the sort is manual
      tempHidden: []                                          # the eye button in the preview
      badges: { show1017: true }
```

| Key | Type | Notes |
|---|---|---|
| `enabled` | boolean | `false` restores the host's own picker but keeps your edits. |
| `sectionOrder` | string[] | Section ids: a provider id, or `p:<partition id>`. |
| `providers[id].name` | string | Group heading. Empty = the catalog name. |
| `providers[id].hidden` | boolean | Hide the whole provider. |
| `models["provider/model"].name` | string | Display name. Empty = the catalog name. |
| `models["provider/model"].suffix` | `{text, tone, color?}` | `tone` is `blue`, `red`, `cyan`, `custom` (needs `color`, `#rrggbb`, default `#ffffff`) or `holo`. Up to 20 characters; `text` may be empty for a color-only chip. |
| `models["provider/model"].partition` | string | `p:<id>` to move it into a partition. |
| `models["provider/model"].hidden` | boolean | Hide this single model. |
| `partitions[]` | `{id, name}` | A partition merges models from different providers. |
| `sort.default` | `catalog` \| `name` \| `manual` | In-group order. |
| `sort.bySection` | map | Per-section override. |
| `order` | map | Per-section list of `provider/model` keys, used by the manual order. |
| `tempHidden` | string[] | Models hidden with the preview eye button; folder failover skips them too. |
| `badges.show1017` | boolean | Show or hide the host's `1017` tag next to a model. |
| `families[]` | `{id, name, section, suffix?, members: [{provider, model}]}` | Ordered members, top first. Failover triggers: quota/auth codes (`QUOTA`, `ACCOUNT_QUOTA`, `RATE_LIMIT`, `AUTH`), network codes (`TRANSPORT`, `SERVER`, `TIMEOUT`) and provider refusals (HTTP 400/403/404). |

## How it works

```
composer ──► slot conversation.input.model   (single, session scope)
                 │
                 ├─ host  @deepseek-ai/dsh-client-ui-model-selection   priority  0
                 └─ this  dsh-model-picker-control                     priority -1   ← wins, host seat goes inactive
                        │
                        │  ctx.modelDirectories.directoryFor(sessionId)
                        ▼
                 catalog groups ──┐
                 your config ─────┴──►  src/pipeline.js  ──►  sections (order, names, hidden, partitions)
                                                              │
                                             ┌────────────────┴────────────────┐
                                             ▼                                 ▼
                                   picker menu + trigger              /model popup rows
                                             │                                 │
                                             └────────► directory.select() ◄───┘
```

- The picker seat `conversation.input.model` is a single, session-scoped slot. The plugin registers it at priority `-1`, which shadows the host seat at priority `0`; disabling the plugin brings the host seat straight back. Selecting, reasoning effort, search, keyboard navigation, the pending state and the “not available in subagent sessions” behaviour are all ported from the host picker and use the host's own `model` translations.
- The `/model` popup builds its rows through the same pipeline, so names, groups, order and hidden models match the picker. Row ids stay `provider/model`, so the host's own select handler is still what switches models.
- The model list itself is never modified. The plugin reads `ctx.modelDirectories.directoryFor(sessionId)` and renders a section list derived from the catalog plus your config; choosing a model still goes through `directory.select()`.
- Hiding only changes what is displayed. A saved selection that becomes invisible is left untouched — the trigger falls back to “Select model” and you can pick another one.
- Writes are revision-checked by the settings service, rolled back on failure, and only ever touch this plugin's row — the rest of `cordis.patch.yml` is never rewritten.
- Folder failover runs in the plugin's host half. It listens to `agent/request-error`; it parks the failing member and switches the session with the host's own `selectModel` (so the usual "model changed" notice is added) and returns `{kind: "retry"}` so the request is resent. How long a member stays parked depends on the failure: `QUOTA`, `ACCOUNT_QUOTA`, `RATE_LIMIT` and `AUTH` until local midnight; `TRANSPORT`, `SERVER` and `TIMEOUT` (seen only after the host's own retries are spent) for 10 minutes; a provider refusal with HTTP 400/403/404 (`PROVIDER_HTTP_ERROR` or `INVALID_REQUEST`, status read from the field or from a leading `400:` / `HTTP 400` in the message) for 1 hour. Context-window overflow and every other code never relay. If every member of the folder refuses the same request, the 10-minute and 1-hour parkings are undone so a bad request cannot lock the folder. Each request is retried at most once per member. Folder bindings and parked members are saved in `<DSH_HOME>/state/dsh-model-picker-control.json` (not in the `picker` config, because a config write makes the host reload its model catalog), so they survive a restart; they clear when the parking ends or with the **Restore now** button on an exhausted member. With the plugin switched off, failover does nothing.
- The picker keeps the last good model list and each session's last model in the browser's `localStorage` (`dsh-model-picker-control/catalog`). After a full restart it paints that at once while the host rebuilds its catalog, which can take many seconds because every provider adapter lists its models over the network. The cache is display only and is replaced as soon as the live list arrives.
- The page is available in Chinese and English, following the GUI language.

## FAQ

**Does this patch other plugins?** No. It only registers slots and wraps the host's `/model` contribution in memory, and restores it on dispose.

**I hid the model I was using.** Your saved selection is kept; the trigger shows “Select model” and the picker offers whatever is still visible.

**Where are the settings?** In your DSH profile config, under the plugin's row: `config.picker`. **Restore all defaults** clears them.

**Can I keep the `1017` tag and add my own capsule?** Yes, they coexist — the tag and the capsule are separate slots.

**Does it work in subagent sessions?** The picker behaves as the host does there: it is shown as unavailable, matching host behaviour.

## Development

```bash
npm install
npm run build   # concatenates src/ into lib/client.js (no bundler required)
npm test        # pure pipeline tests (node:test)
npm pack
```

The source is plain ESM + `h()` calls — `src/pipeline.js` is pure data transformation and is what the tests cover; `src/client/` holds the slot code.

## License

[MIT](./LICENSE)
