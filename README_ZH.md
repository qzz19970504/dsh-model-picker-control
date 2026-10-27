<h1 align="center">dsh-model-picker-control</h1>

<p align="center"><a href="./README.md">English</a> | <a href="./README_ZH.md">中文</a></p>

<p align="center"><strong>DSH 模型选择器总控</strong> — <em>改名、分区、排序、隐藏、胶囊，一处搞定。</em></p>

<p align="center"><sub>跨 provider 分区 · 改模型名与组名 · 拖拽排序 · 隐藏整个 provider 或单个模型 · 后缀胶囊 · 一键恢复</sub></p>

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

## 为什么做这个

DSH 自带的模型选择器很好用，但显示方式是固定的：provider 的先后顺序写死在代码里，模型名完全跟着目录走，也没办法把两个不同 provider 的模型放到一起。如果你有些模型走账号 provider、有些走合作方 provider，那你真正想要的那个列表从来就不存在。

这个插件给你一个独立的设置页 —— 与自带的「模型」页平级 —— 由它接管选择器的**显示**，而不去修改任何第三方插件。把用不到的模型藏起来，把其余的重命名成一眼能认出的名字，把分组拖成你脑子里想问题的顺序，再把不同 provider 的模型合并进「免费」「实验」这样的分区。

## 功能

| | |
|---|---|
| **什么都能改名** | 模型显示名、provider 分组名，以及每个模型后面的短后缀胶囊。 |
| **跨 provider 分区** | 新建一个分区，把任何 provider 的模型丢进去，它们就渲染成同一组。 |
| **拖拽排序** | 用左侧手柄拖动分组与分区（也可以聚焦手柄后按 <kbd>↑</kbd> <kbd>↓</kbd>）。 |
| **隐藏而非删除** | 隐藏整个 provider 或单个模型，目录本身不做任何改动。 |
| **组内排序** | 目录原序或按名称，可按组单独设置或全局默认。 |
| **后缀胶囊** | 名字后面的原生风格小胶囊 —— 蓝 / 暗红 / 青 —— 与宿主的 `1017` 徽标并排显示。 |
| **模型文件夹** | 在预览卡片里把一行拖到同一分组内另一行的中间，即合并成一个文件夹（family）。文件夹在选择器里只占一行，可加胶囊，成员从上到下接力：请求遇到额度用尽、限流或鉴权失败时，自动换到下一个成员并重发（等同于一次普通的手动切换模型），失败的成员停用到当天零点。完全独立，不依赖其他插件。 |
| **预览与临时隐藏** | 实时预览卡片：拖动调整模型顺序，眼睛按钮可临时隐藏额度耗尽的模型。 |
| **草稿与保存** | 所有修改先留在本地草稿里，按**保存**才写入；带着未保存的修改离开会先问你。 |
| **恢复默认** | 一键清空本插件的设置，回到宿主默认显示。 |

## 界面截图

真实使用截图，真实宿主界面。这是作者自己的选择器：顶部是跨 provider 的 **Free** 分区，下面是 **Fast** 分区，几乎每个名字后面都带自定义胶囊（`腾讯` `Tencent` `MiniMax` `Cmdc` `OpenAI` `Google` `Al`），用不到的 provider 全部隐藏，宿主自带的 `1017` 徽标依旧保留。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/qzz19970504/dsh-model-picker-control/main/docs/picker-zh-dark.png">
    <img src="https://raw.githubusercontent.com/qzz19970504/dsh-model-picker-control/main/docs/picker-zh-light.png" width="720" alt="带跨 provider 分区与后缀胶囊的模型选择器">
  </picture>
</p>

**设置 → 分组与分区** —— 拖动手柄把分组摆成你自己的顺序，改 provider 名或直接隐藏，新建一个分区把任意 provider 的模型并进来：

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/qzz19970504/dsh-model-picker-control/main/docs/groups-zh-dark.png">
    <img src="https://raw.githubusercontent.com/qzz19970504/dsh-model-picker-control/main/docs/groups-zh-light.png" width="640" alt="分组与分区页面">
  </picture>
</p>

**设置 → 模型** —— 改显示名、填后缀胶囊并选颜色、加入某个分区，或者直接隐藏。没按**保存**之前什么都不会写入：

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/qzz19970504/dsh-model-picker-control/main/docs/models-zh-dark.png">
    <img src="https://raw.githubusercontent.com/qzz19970504/dsh-model-picker-control/main/docs/models-zh-light.png" width="640" alt="模型表格页面">
  </picture>
</p>

## 安装

```
dsh plugin add dsh-model-picker-control
```

然后重启 DSH。打开**设置**，自带「模型」页旁边会多出一个**模型选择器**页。

想用本地构建的版本：

```bash
git clone https://github.com/qzz19970504/dsh-model-picker-control.git
cd dsh-model-picker-control
npm install
npm test
npm pack                          # 生成 dsh-model-picker-control-<版本号>.tgz
dsh plugin add ./dsh-model-picker-control-<版本号>.tgz
```

## 快速上手

1. 打开**设置 → 模型选择器**。
2. 在**分组与分区**里点**新建**，起个名字，比如「免费」。
3. 在**模型**表格里，把想放进去的模型的分区下拉改成「免费」—— 来自哪个 provider 都行。
4. 拖动分组调整顺序，隐藏用不到的，给重要的模型加个后缀胶囊，比如 `NEW`、`便宜`。
5. 点**保存**，然后打开输入框的模型选择器，立刻就是新的样子，不需要重启。

## 配置

所有内容都存在你 profile 配置里这个插件自己那一行（`config.picker`），通过宿主 settings 服务写入：

```yaml
- id: model-picker-control
  name: 'dsh-model-picker-control'
  config:
    picker:
      version: 1
      enabled: true          # false = 恢复宿主显示，但保留这些设置
      sectionOrder: [p:free, deepseek-official, workbuddy]
      providers:
        deepseek-account: { name: DeepSeek 账号, hidden: false }
      models:
        deepseek-official/deepseek-pro: { name: DeepSeek-V4.1-Pro, suffix: { text: 便宜, tone: red }, partition: p:free }
        workbuddy/step-5-preview: { suffix: { text: NEW, tone: cyan }, partition: p:free, hidden: false }
      partitions:
        - { id: p:free, name: 免费 }
      sort: { default: name, bySection: { workbuddy: catalog } }
      badges: { show1017: true }
```

| 键 | 类型 | 说明 |
|---|---|---|
| `enabled` | boolean | `false` 时交还宿主的默认选择器，但保留你改的内容。 |
| `sectionOrder` | string[] | 分组顺序，元素是 provider id 或 `p:<分区 id>`。 |
| `providers[id].name` | string | 分组标题，留空 = 用目录里的名字。 |
| `providers[id].hidden` | boolean | 隐藏整个 provider。 |
| `models["provider/model"].name` | string | 显示名，留空 = 用目录里的名字。 |
| `models["provider/model"].suffix` | `{text, tone}` | `tone` 为 `blue` / `red` / `cyan`，最多 20 个字符。 |
| `models["provider/model"].partition` | string | 设为 `p:<id>` 把它挪进某个分区。 |
| `models["provider/model"].hidden` | boolean | 隐藏这一个模型。 |
| `partitions[]` | `{id, name}` | 分区，用于把不同 provider 的模型合并成一组。 |
| `sort.default` | `catalog` \| `name` | 组内排序方式。 |
| `sort.bySection` | map | 单个分组单独指定排序。 |
| `badges.show1017` | boolean | 是否显示宿主模型上的 `1017` 徽标。 |
| `families[]` | `{id, name, section, suffix?, members: [{provider, model}]}` | 成员按从上到下的优先级排列。触发接力的错误码：`QUOTA`、`ACCOUNT_QUOTA`、`RATE_LIMIT`、`AUTH`。 |

## 实现方式

```
输入框 ──► 插槽 conversation.input.model   （single，session 作用域）
                 │
                 ├─ 宿主 @deepseek-ai/dsh-client-ui-model-selection   priority  0
                 └─ 本插件 dsh-model-picker-control                   priority -1   ← 生效，宿主座位变为 inactive
                        │
                        │  ctx.modelDirectories.directoryFor(sessionId)
                        ▼
                 目录分组 ────────┐
                 你的配置 ────────┴──►  src/pipeline.js  ──►  分组列表（顺序、改名、隐藏、分区）
                                                              │
                                             ┌────────────────┴────────────────┐
                                             ▼                                 ▼
                                     选择器菜单与触发按钮              /model 弹窗的行
                                             │                                 │
                                             └────────► directory.select() ◄───┘
```

- 选择器座位 `conversation.input.model` 是一个 single、session 作用域的插槽。插件以 priority `-1` 注册它，从而遮住宿主 priority `0` 的座位；关掉插件，宿主座位立刻回来。选中与切换、推理档位、搜索、键盘导航、pending 状态、subagent 会话不可用这些行为都是从宿主选择器移植而来，并沿用宿主的 `model` 词典。
- `/model` 弹窗走同一条显示管线，所以名字、分组、顺序、隐藏与选择器完全一致。行 id 仍然是 `provider/model`，因此真正切换模型的还是宿主自己的处理函数。
- 模型目录本身不做任何修改。插件读取 `ctx.modelDirectories.directoryFor(sessionId)`，把目录和你的配置组合成分组列表再渲染；选择模型依旧走 `directory.select()`。
- 隐藏只影响显示。已保存的选择即使变得不可见也不会被改动 —— 触发按钮回落到「请选择模型」，你可以重新选一个。
- 写入由宿主 settings 服务做版本校验，失败回滚，并且只碰本插件那一行 —— 不会重写整个 `cordis.patch.yml`。
- 设置页跟随 GUI 语言提供中文与英文。

## 常见问题

**会改动别的插件吗？** 不会。它只注册插槽，并在内存里包装宿主的 `/model` 贡献，dispose 时原样还原。

**我把正在用的模型藏了怎么办？** 已保存的选择会保留，触发按钮显示「请选择模型」，选择器里只列出还可见的模型，重选一个即可。

**设置存在哪？** 你的 DSH profile 配置里这个插件那一行，`config.picker`。**全部恢复默认**会清空它。

**能同时保留 `1017` 徽标和我自己的胶囊吗？** 可以，徽标和胶囊是两套独立的渲染，互不影响。

**subagent 会话里能用吗？** 和宿主行为一致：那里选择器显示为不可用。

## 开发

```bash
npm install
npm run build   # 把 src/ 拼成 lib/client.js（不需要打包器）
npm test        # 纯函数管线测试（node:test）
npm pack
```

源码是纯 ESM + `h()` 调用 —— `src/pipeline.js` 是纯数据变换，也是测试覆盖的部分；`src/client/` 放插槽相关代码。

## 许可

[MIT](./LICENSE)
