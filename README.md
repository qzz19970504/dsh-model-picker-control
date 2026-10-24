# dsh-model-picker-control

Model picker control for DSH. It takes over the composer model picker and the `/model` popup so you can manage how models are shown, without touching any third-party plugin.

- Rename models and provider groups.
- Reorder provider groups, hide a whole provider or a single model.
- Custom partitions such as "Free" or "Experimental" that merge models from different providers.
- In-group sorting by catalog order, or name.
- A short suffix capsule (short text, up to 20 characters; blue, dark red or cyan) can be added to any model. It sits next to the host's own `1017` tag.
- Everything is stored in your profile config and survives restarts.

## Install

```
dsh plugin add dsh-model-picker-control
```

Restart DSH, then open Settings and pick **Model picker** (模型选择器) next to the built-in **Models** page.

## How it works

- The picker seat `conversation.input.model` is registered at priority `-1`, which shadows the host seat (priority `0`). Selecting, reasoning effort, search, keyboard navigation, the pending state and the "not available in subagent sessions" behaviour are ported from the host picker and use the host's own `model` translations. Disable the plugin and the host picker returns.
- The `/model` popup builds its rows through the same pipeline, so names, groups, order and hidden models match the picker. Row ids stay `provider/model`, so the host's select handler is still the one that switches models.
- Hiding only changes what is displayed. A saved selection that is no longer visible is left untouched; the trigger falls back to the "Select model" text and you can pick another model.
- Settings are stored under this plugin's row (`config.picker`) through the host settings service: writes are revision-checked, rolled back on failure, and never rewrite the whole `cordis.patch.yml`. "Restore all defaults" clears them.

## Development

```
npm run build   # concatenates src/ into lib/client.js (no bundler needed)
npm test        # pure pipeline tests
npm pack
```

License: MIT
