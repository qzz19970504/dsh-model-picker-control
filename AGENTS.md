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

1. 改 `package.json` 的 `version`(不能复用同一个 tgz 名,否则 pnpm 走缓存不更新)。**验证阶段用 `X.Y.Z-dev.N`**,别把正式版本号一路上推,规则见文末「发布」
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

**三个动作各管一件事,别混在一起:**

| 动作 | 什么时候做 | 规矩 |
| --- | --- | --- |
| `git commit` | 随时,每个小改动一个 | 版本号改动拆进独立的 `release:` commit,别混进功能 commit |
| `git tag` | 只在 `npm publish` 成功的同一时刻 | 一个 tag = 一个 npm 版本,两边数量永远相等 |
| `npm publish` | 攒一批用户能感知的改动之后 | 见下面「什么时候发一个版本」 |

### 开发中(不发布):用预发布号

本地安装必须换 tgz 名(pnpm 靠文件名认缓存),但**别为每次验证 bump 正式版本号**:

```bash
npm version 0.4.9-dev.1 --no-git-tag-version   # 或手改 package.json
npm pack                                       # dsh-model-picker-control-0.4.9-dev.1.tgz
# 改 profile package.json 指向新 tgz → pnpm install → 重启 DSH 看效果
```

验证阶段**不打 tag、不发 npm**。再改一轮就 `dev.2`、`dev.3`。dev 版本永远不进 npm,也不单独打 tag;正式发版时把它们收进 `X.Y.Z`。

### 什么时候发一个版本

满足任一条就发,不是改一个像素发一次:

- 攒够一个「用户能感知的改动包」(几个小 fix,或一个完整功能)
- 修了会让用户踩坑的 bug(比如接力不触发、设置丢失),当天发

反例:0.4.3 → 0.4.8 半天六个版本号,其中三个打了 tag、两个发了 npm,用户视角毫无区别,自己事后也分不清。

### 发布清单(一次做完,顺序别换)

1. 版本号去掉 `-dev.N`,定为 `X.Y.Z`
2. 更新 `CHANGELOG.md`(还没有就先创建,从 0.4.0 起补)与 README 中英双语(描述别只改一边),需要时更新 `docs/` 截图
3. `npm test` 全绿 + `node --check lib/client.js` + 装进 DSH 真机看一眼 UI
4. `npm publish --otp=<6 位>`(账号有 2FA),`npm view dsh-model-picker-control version` 确认
5. `git tag -a vX.Y.Z -m "..."` + `git push origin main --tags`

**tag 只能出现在第 4 步成功之后。没发布过就不打 tag,发布过就一定有 tag。** 之前的混乱正是:一会儿给验证版打了 tag(0.4.5 / 0.4.7 / 0.4.8),一会儿没打(0.3.0–0.3.2、0.4.0、0.4.1、0.4.3、0.4.4、0.4.6)。

### 版本号语义

- 新交互 / 新功能 → minor(`0.4` → `0.5`)
- 修 bug / 调样式 → patch(`0.4.8` → `0.4.9`)
- 预发布验证 → `-dev.N`,发布时去掉

npm 上的版本**不可覆盖**:发错了只能 `npm deprecate` 旧版再发新 patch。push / 打 tag 与否由用户决定,别自作主张 push。
