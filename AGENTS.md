# 项目记忆 (AGENTS.md) — dsh-model-picker-control

给以后在这个仓库里干活的 agent(和未来的我)。README 面向用户,这里只记**不看代码就会踩的坑**和约定。

## 这是什么

DSH 客户端插件:接管输入框的模型选择器(`conversation.input.model`,priority -1 盖住宿主),统一改名 / 分区 / 排序 / 隐藏 / 胶囊,并让 `/model` 弹窗跟着一致。
宿主半(`lib/index.js`,只有我们自己的服务端部分,不改宿主代码)做两件事:把配置持久化到本插件那一行的 `config.picker`;文件夹接力(逻辑在 `src/relay.js`,可用假依赖测试,状态存 `<DSH_HOME>/state/dsh-model-picker-control.json`)。

## 命令

```bash
npm run build    # 拼接 src/ -> lib/client.js(无 bundler)
npm test         # 纯 pipeline 测试(node:test)
npm pack         # 产出 dsh-model-picker-control-<version>.tgz
```

## ⚠️ 最大的坑:改完不重新安装,重启 DSH 没有任何变化

DSH **不加载本目录**。它加载的是 profile 里安装的副本:

- profile 根目录:`~/.dsh/profiles/desktop`
- 依赖写死在 `~/.dsh/profiles/desktop/package.json`,指向本目录产出的 **tgz**,例如
  `"dsh-model-picker-control": "file:D:/CodeField/dsh-model-picker-control/dsh-model-picker-control-0.4.8.tgz"`
- 实际加载的文件:`~/.dsh/profiles/desktop/node_modules/dsh-model-picker-control/lib/client.js`

所以只改 `src/` 和 `lib/` 再重启 = 白改。完整流程:

1. 改 `package.json` 的 `version`(不能复用同一个 tgz 名,否则 pnpm 走缓存不更新)
2. `npm pack`
3. 改 profile 的 `package.json` 指向新 tgz(改前先备份 `package.json` 与 `pnpm-lock.yaml`)
4. `cd ~/.dsh/profiles/desktop && pnpm install`
5. 重启 DSH

验证是否真的装上了:`grep -c "<某个新字符串>" ~/.dsh/profiles/desktop/node_modules/dsh-model-picker-control/lib/client.js`,非 0 才算成功。**不要**只看 `npm run build` 成功就宣布完成。

## 代码约定

- `src/pipeline.js` 必须是**纯函数、不碰 DOM / React**,可被 `node --test` 直接覆盖。新的显示逻辑(排序、隐藏、分区、颜色计算)都放这里,并补测试。
- `src/client/*.js` 由 `scripts/build.mjs` 拼进**同一个函数作用域**,所以文件之间直接共享顶层符号;**不要写 `import`**,`export` 会在构建时被 strip。新增文件必须登记进 `build.mjs` 的 `files` 顺序里(注意依赖顺序:`preview.js` 在 `settings.js` 之前)。
- 用户可见字符串必须**同时**加 `src/client/messages.js` 的 zh 和 en 两份。
- 样式统一 `mpc-` 前缀(避免和宿主冲突),颜色优先用宿主的 `--dsw-alias-*` CSS 变量,别写死。
- 文件用 **LF**(`.gitattributes` 已强制 `eol=lf`);`lib/` 与 `*.tgz` 在 `.gitignore` 里,不要提交。
- 想确认宿主的真实行为,去读宿主 checkout:`D:\Program Files\DeepSeek Harness\resources\app.asar\dsh\`(picker 是宿主 `ModelSelect` 的移植,改交互时对照着看)。

## 验证

- 纯逻辑:`npm test` 全绿。
- 构建产物至少跑一次 `node --check lib/client.js`(括号不配对是这里最常见的手误)。
- UI / 交互(拖拽、折叠、取色器、slot 是否被接管)**无法单测**,必须装进 DSH 重启后人工看一眼。

## 发布

版本号 → README 中英双语同步(功能描述别只改一边)→ 需要时更新 `docs/` 截图 → `git tag -a vX.Y.Z`。tag 只打本地还是 push 由用户决定,别自作主张 push。
