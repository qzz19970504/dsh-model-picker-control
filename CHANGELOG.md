# 更新日志 / Changelog

按版本倒序。每个版本先中文后英文。只记录**用户能感知的改动**;实现细节看 `git log`。
Newest first. Chinese and English per version. Only user-visible changes; see `git log` for internals.

## 发布状态 / Release status

| 版本 | 日期 | npm | 说明 |
| --- | --- | --- | --- |
| 0.4.8 | 2026-10-28 | — | 已 tag `v0.4.8`,未发布 |
| 0.4.7 | 2026-10-28 | — | 已 tag `v0.4.7`,未发布 |
| 0.4.6 | 2026-10-28 | — | 未 tag、未发布 |
| 0.4.5 | 2026-10-28 | ✅ latest | |
| 0.4.3 | 2026-10-28 | — | 未 tag、未发布(内容随 0.4.5 上线) |
| 0.4.2 | 2026-10-28 | ✅ | |
| 0.3.5 | 2026-10-28 | — | 已 tag,未发布 |
| 0.3.4 | 2026-10-28 | — | 已 tag,未发布 |
| 0.3.3 | 2026-10-28 | — | 已 tag,未发布 |
| 0.2.3 | 2026-10-27 | — | 已 tag,未发布 |
| 0.2.2 | 2026-10-25 | ✅ | |
| 0.2.1 | 2026-10-25 | ✅ | 首个版本 |

`0.3.0`–`0.3.2`、`0.4.0`、`0.4.1` 是本地验证用的中间版本,没有单独发布,改动并入后一版。

---

## 0.4.8 — 2026-10-28

**中文**

- 炫彩胶囊里的文字在垂直方向偏下约 1px,改为上下不等内边距,西文上下各留 4.88px(微软雅黑差 0.3px)。胶囊高度仍是 18px,布局不变。

**English**

- Text inside the holo capsule sat about 1px low. Asymmetric padding now centres it: 4.88px above and below with Segoe UI (Microsoft YaHei is 0.3px off). The capsule is still 18px tall and the layout does not move.

## 0.4.7 — 2026-10-28

**中文**

- 文件夹接力的触发条件扩展。之前只在额度耗尽 / 限流 / 鉴权失败时换成员,遇到网络错误(`ECONNRESET`)、上游 5xx、或服务商直接拒绝(400/403/404)时会一直卡死在同一个成员上。现在:
  - 额度类错误:停用到次日零点(不变)
  - 网络 / 5xx / 超时:停用 10 分钟
  - 服务商拒绝(HTTP 400/403/404):停用 1 小时
  - 上下文超长等与「这个成员不可用」无关的错误仍然不接力
- 同一请求里所有成员都被拒绝时,会撤销这些短停用,避免一次坏请求把整个文件夹锁死一小时。

**English**

- Folder failover now also triggers on network errors (`ECONNRESET`), upstream 5xx and provider refusals (HTTP 400/403/404), not just quota / rate limit / auth. Previously one flaky member could keep receiving every request.
  - Quota errors: parked until the next local midnight (unchanged)
  - Transport / 5xx / timeout: parked for 10 minutes
  - Provider refusal (HTTP 400/403/404): parked for 1 hour
  - Context overflow and other errors unrelated to member usability still never relay
- When every member refuses the same request, those short parkings are undone so one bad request cannot lock the whole folder for an hour.

## 0.4.6 — 2026-10-28

**中文**

- 去掉炫彩胶囊上多余的白紫色焦点环。输入框的触发器本身已经画了焦点环,叠加后显得刺眼;悬停和键盘聚焦现在只让光晕轻微变亮。

**English**

- Removed the extra white/violet focus ring on the holo capsule. The composer trigger already draws its own focus ring, and stacking them looked harsh; hover and keyboard focus now only brighten the glow slightly.

## 0.4.5 — 2026-10-28

**中文**

- 炫彩胶囊重做,每个胶囊独立动画:彩虹边框 5.5s 转一圈,一道冷色折射光 9s 反向漂移,紫色与青色光晕各自呼吸。
- 去掉横穿胶囊的扫光带(它压在边框图层上,让边缘看起来比边框还粗)。
- 光晕收敛到 4–6px,悬停不再放大,只多转一点边框;输入框那一行上下只有约 5px,不会再被光晕糊住。
- 修正光晕被父容器裁成矩形的问题(用抵消的 padding/margin,布局不动)。
- `prefers-reduced-motion` 下保留静态渐变边框,键盘焦点有内侧描边。

**English**

- The holo capsule is now animated per capsule: the rainbow border turns every 5.5 s, a pale catch-light drifts the other way every 9 s, and the violet and cyan glows breathe on their own periods.
- Removed the left-to-right sheen band; it sat on top of the border layer and made the edge look thicker than the border.
- Glow is 4–6 px and no longer grows on hover (hover only gives the border an extra turn); the composer row only leaves about 5 px above and below the capsule.
- Fixed the glow being clipped into a rectangle by its parent container (cancelling padding/margin, so the layout does not move).
- `prefers-reduced-motion` keeps the static gradient border; keyboard focus draws an inner ring.

## 0.4.3 — 2026-10-28

**中文**

- 重启 DSH 后不再长时间显示「正在加载模型…」:把上一次成功的模型目录和每个会话上次使用的模型缓存到 localStorage,宿主重建目录期间先画缓存。
- `/model` 弹窗改为包装宿主的注册表,不再每秒轮询。
- 接力逻辑搬到可单测的 `src/relay.js` 并加固:尊重插件的启用开关;同一次请求里每个成员最多跳一次,避免在失败的切换里打转;宿主的 selectModel 被拒绝时不再偷偷改路由;只处理与当前路由 provider 一致的错误。
- 文件夹绑定与停用状态持久化到 `~/.dsh/state/dsh-model-picker-control.json`,重启后不丢(不写进 `config.picker`,那会触发宿主重载整个模型目录)。
- 清理死代码,补 MIT NOTICE,`prims.js` 的说明从「照搬宿主」改为「改编自宿主」。

**English**

- No more long "Loading models..." after a full DSH restart: the last good model catalog and each session's last model are cached in localStorage and painted while the host rebuilds its catalog.
- The `/model` popup now wraps the host's contribution registry instead of polling every second.
- Failover moved into the unit-tested `src/relay.js` and hardened: it honours the plugin's `enabled` switch, allows at most one hop per member per request, no longer re-routes behind the UI's back when the host refuses a `selectModel`, and ignores errors whose provider differs from the routed request.
- Folder bindings and parked members persist to `~/.dsh/state/dsh-model-picker-control.json` and survive restarts (not written into `config.picker`, which would make the host reload its whole model catalog).
- Removed dead code, added the MIT NOTICE, and reworded the `prims.js` header from "verbatim" to "adapted".

## 0.4.2 — 2026-10-28

**中文**

- 胶囊新增两种色调:自定义颜色(取色器 + 十六进制/RGB,默认白色,文字颜色自动推导为同色系且对比度足够)和炫彩(彩虹边框)。
- 胶囊可以只有颜色没有文字;每个胶囊有单独的清除按钮。
- 分区行新增「胶囊颜色」,一键把某个分区里所有模型设成同一色调;「清除空胶囊」一次删掉所有无色胶囊。
- 设置页的隐藏复选框换成眼睛图标,每个 provider 卡片标题栏加一只眼睛,一键显示/隐藏该 provider 的所有模型。
- 设置页改用固定栅格,列对齐、不再换行或溢出,窄宽度自动收拢。
- 修复:接力只考虑文件夹所在分组里可见的成员。

**English**

- Two new capsule tones: a free custom colour (picker + hex/RGB, default white, text colour derived in the same hue with enough contrast) and holo (a rainbow border).
- Capsules may be colour-only, and each capsule has its own clear button.
- New per-section "Capsule colour" applies one tone to every model in the section; "Clear empty capsules" removes all text-less capsules at once.
- Hide checkboxes are now eye toggles, and each provider card has an eye in its header that shows or hides all of its models.
- The settings page uses a fixed grid, so columns line up and nothing wraps or overflows; narrow widths collapse.
- Fixed: failover only considers visible members of the folder's own group.

## 0.3.5 — 2026-10-28

**中文**

- 修复接力可能切到已隐藏成员的问题。之前隐藏了某个成员(或被隐藏的 provider、被移到别的分区)后,宿主机侧的接力仍会取原始成员表的第一个,请求被转到看不见的模型上并以 `UND_ERR_SOCKET` 失败。

**English**

- Fixed failover routing to hidden folder members. Hidden members (or members of hidden providers, or moved to another section) are now skipped, so requests no longer land on an invisible model and fail with `UND_ERR_SOCKET`.

## 0.3.4 — 2026-10-28

**中文**

- 设置页顺序调整为:通用、分组与分区、模型、选择器预览——先编辑模型,再在下方卡片里看结果。

**English**

- Settings are now ordered General, Groups and partitions, Models, Picker preview: edit the models first, then check the result in the preview card below.

## 0.3.3 — 2026-10-28

**中文**

- 新增文件夹(模型家族):把同一个显示分组里的一行拖到另一行**中间**即合并,拖上/下边缘仍是排序。文件夹在真实选择器里只占一行,在预览卡片里可展开,支持改名、胶囊、调整成员顺序、拆出成员、解散。
- 文件夹本身就是接力站:额度耗尽(QUOTA / ACCOUNT_QUOTA / RATE_LIMIT / AUTH)时,当前成员停用到次日零点,请求自动切到下一个成员;用眼睛临时隐藏的成员会被跳过。
- 思考等级跟随顶层成员,切换成员后从新成员的最高等级开始。
- 保持宿主原生外观:不显示成员小标签,行做了 memo,文件夹绑定不再吞掉点击。

**English**

- New folders (model families): drag a row onto the **middle** of another row in the same displayed group to merge them; dragging onto the top or bottom edge still reorders. A folder is a single row in the real picker and expands in the preview card (rename, capsule, reorder members, ungroup, dissolve).
- A folder works as a relay: on quota exhaustion (QUOTA / ACCOUNT_QUOTA / RATE_LIMIT / AUTH) the current member is parked until the next local midnight and the request moves to the next member; members hidden with the eye button are skipped.
- Reasoning effort follows the top member, and a member taking over starts at its highest level.
- Keeps the host's native look: no member chips, memoized rows, and folder binding no longer swallows clicks.

## 0.2.3 — 2026-10-27

**中文**

- 后缀胶囊新增「自定义」色调:任意十六进制或 RGB 颜色(默认白色),文字颜色按同色系推导并保证对比度 ≥ 4.5:1,再奇怪的颜色也看得清。
- 设置页的「通用」「分组与分区」「模型」以及模型里每个 provider 卡片都可以折叠,折叠状态记在 localStorage。
- 新增选择器预览卡片:直接拖动模型调整顺序(该分组自动切换为手动排序),眼睛按钮可临时隐藏模型,改动立即生效、无需保存。

**English**

- New "custom" capsule tone: any hex or RGB colour (default white), with the text colour derived in the same hue and kept at ≥ 4.5:1 contrast, so even odd colours stay readable.
- General, Groups and partitions, Models and every provider card under Models can be collapsed; the state is remembered in localStorage.
- New picker preview card: drag models to reorder (the group switches to manual order), and an eye button hides a model temporarily, applied at once without saving.

## 0.2.2 — 2026-10-25

**中文**

- README 改为中英双语,换用作者真实环境的截图。
- 声明 `dsh.engines.dsh`,插件市场可以据此匹配宿主版本。

**English**

- Bilingual README (Chinese and English) with real-world screenshots.
- Declare `dsh.engines.dsh` so the plugin market can match a host version.

## 0.2.1 — 2026-10-25

**中文**

- 首个版本。接管输入框的模型选择器和 `/model` 弹窗,支持改名、跨 provider 分区、排序、隐藏模型、为模型加后缀胶囊;设置页用草稿/保存的方式写回宿主设置。

**English**

- First release. Takes over the composer model picker and the `/model` popup to rename models, group them into cross-provider sections, sort, hide, and add suffix capsules; the settings page edits a draft and saves through the host settings service.
