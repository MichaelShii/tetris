# r31 自定义按键（custom-keybindings）DESIGN

> 基线依赖：本任务夹 r31 确认单（裁定：需求与现状相符，但为跨模块功能级改动，非单点 hotfix；沿用 r30 同需求 failed 复判结论）。本设计为按键可配置配套的 UI/UX 决策，全部【新增·r31】/【修订·r31】标出；行为变化用【取代】标出并需 PRD AC 确认。

## 0. 设计结论速览

| # | 决策 | 结论 |
|---|---|---|
| D-1 | 绑定模型 | **单键制**：9 个可改动作各绑 1 个主键（一对一）；主键可改，重复/冲突禁止 |
| D-2 | 可改动作（9） | moveLeft / moveRight / softDrop / hardDrop / rotate / hold / togglePause / restart / mute |
| D-3 | 不可改（系统保留） | start（READY/OVER 的 开始/重开）、Escape（关弹层/取消录制/暂停兜底）、Tab（焦点）、Enter（开始/重开）、修饰键与 F 键等浏览器保留键 |
| D-4 | 输入分发 | 两级：①READY/OVER 系统阶段键（Enter/空格→start/restart，零回归）②绑定表（默认∪自定义，key→action）；held/DAS 键控随绑定键 |
| D-5 | 生效与持久化 | 捕获即时生效 + 即时写 persist（与既有设置一致）；settings.keybindings 纯增量字段，PAYLOAD_VERSION 不变 |
| D-6 | 触屏 | 触控键**不跟随**键盘绑定（动作级分发，视觉零变化）；`html.has-touch` 隐藏按键设置组（CSS 门控，与外观组同机制） |
| D-7 | 默认键收敛 | rotate X、hold Shift、Escape 暂停、OVER 空格重开 → 收敛/失效【取代·需 AC】 |

## 1. 模块与信息架构

单页应用（无路由），模块清单与本次变化：

| 模块 | 现状 | 本次变化 |
|---|---|---|
| 棋盘/HUD/信息面板/overlay 遮罩 | 既有 | 零变化 |
| 触屏操控区（.touchpad + 六 .tkey[data-action]） | 既有（r16/r26） | 零视觉变化；内部合成改动作级分发【修订·r31】 |
| **设置弹层（settings-modal）** | 音频/辅助/外观 三组 | **新增第 4 组「按键设置」**，位于外观组之后 |

IＡ（settings-modal 内，自上而下）：
`音频设置 → 辅助设置 → 外观（has-touch 门控显示） → 按键设置（has-touch 门控隐藏）`

按键组内部结构：9 行 `<label 动作名> + <keycap 按钮>` ＋ 组尾「恢复默认按键」按钮。一行一个可交互元素（keycap 即录制入口，不设独立录制按钮，避免冗余焦点）。

## 2. 线框描述

### 2.1 按键设置组【新增·r31】

```
┌─ .settings-group .settings-group--keys ─────────────┐
│ 按键设置                                            │
│ 左移      [ ← ]      ← .keybind-row：+.keycap 按钮    │
│ 右移      [ → ]                                     │
│ 软降      [ ↓ ]        (软降/左移/右移 按住=连降/DAS)    │
│ 硬降      [ 空格 ]                                  │
│ 旋转      [ ↑ ]                                    │
│ Hold      [ C ]                                    │
│ 暂停      [ P ]                                    │
│ 重新开始  [ R ]                                    │
│ 静音      [ M ]                                    │
│            [ 恢复默认按键 ]                          │
└────────────────────────────────────────────────────┘
```

- 行结构：`.keybind-row` = `span.stat__label`（动作名，与既有 ghost-control 同款标签）+ `button.keycap`（当前键名，mono 字）。
- keycap 点击即进入录制态（IDLE↔RECORDING 状态机见 §3.2）。
- 组容器 `role="group" aria-label="按键设置"`；每行不额外加语义角色（标签+按钮文本自足）。

### 2.2 组内状态【新增·r31】

- **录制态行**：`button.keycap.is-recording`，文案变「按下新键…」，primary 描边 + glow。
- **冲突态**：占用键与发起行两行 `button.keycap.is-conflict`（danger 描边 1.6s）+ 行内提示文案「与『右移』冲突，请换键」。
- **非法键态**：单行 `button.keycap.has-error`（danger 描边 1.6s）+ 文案「该键不可绑定」。
- **成功写入**：keycap 键名刷新，120ms success 描边淡出。
- 提示文案元素：`.keybind-row__msg`（`role="status" aria-live="polite"`，仅错误/冲突时出现）。

其余模块（棋盘/HUD/遮罩/触屏 dock/外观组）零变化。

## 3. 交互与动效

### 3.1 绑定额（D-1~D-4 落地）

| 动作 | 默认主键 | 现网键 | 说明 |
|---|---|---|---|
| moveLeft | ← ArrowLeft | ← | 不变，按住 DAS |
| moveRight | → ArrowRight | → | 不变，按住 DAS |
| softDrop | ↓ ArrowDown | ↓ | 不变，按住连降 |
| hardDrop | 空格 Space | 空格 | 不变 |
| rotate | ↑ ArrowUp | ↑ / X | 【取代】X 次键失效 |
| hold | C | c / C / Shift | 【取代】Shift 长按失效 |
| togglePause | P | p / Esc | 【取代】Esc 不再暂停（转系统键） |
| restart | R | r | 不变；OVER 阶段 Enter/空格重开语义归 start 系统键 |
| mute | M | m / M | 不变（大小写归一化同键） |

绑定规则：
- **可绑定键集**：单字符可打印键（字母/数字/标点，归一化小写存储）+ 四方向键 + 空格。其余（Tab、Enter、Escape、CapsLock、Shift/Ctrl/Alt/Meta、F1–F12、PrintScreen、NumLock、Insert、组合键）列入黑名单，捕获时拒绝并提示。
- **冲突检测**：9 动作之间 key 唯一（一对一）；新键已被其他动作占用 → 冲突，两行标红不写入。
- **输入分发两级**（【修订·r31】取代现行 phase×key 单表）：① READY/OVER：Enter/空格→start/restart（系统阶段键，既不随绑定也不拦截，零回归）；② 其余：key→action 按「默认表+自定义覆盖表」查，动作内自行按 phase 守卫（既有 start()/restart()/togglePause() 语义保留）。
- **held/DAS 键控【修订·r31】**：onKeyDown 按绑定键注册 held、onKeyUp 按同名键删除——「keyup 删不到 held 条目→DAS 卡死」陷阱（r31 裁定证据 1）随单键制+同键删除消除。
- **preventDefault 列表【修订·r31】**：随绑定键动态化（方向键/空格/可打印键一律拦截，防滚动与按钮聚焦二次激活，沿袭 E-11-03）。
- **mute/hold 接入绑定【修订·r31】**：现 ui.js 直读 `m/M`、`c/C/Shift` 的 window 监听改为走绑定表（按键映射的单一事实来源），hold 的 holdEnabled guard 保持。

### 3.2 录制状态机【新增·r31】

| 状态 | 触发 | 行为 |
|---|---|---|
| IDLE | 点击 keycap | 进 RECORDING；全局 keydown 捕获接管（停止传播，游戏键输入屏蔽——弹层打开期游戏仍在跑，防误触/误操作）；焦点留在 keycap |
| RECORDING | 合法无冲突键 | 写入绑定（临时生效 + 持久化），键名刷新，回 IDLE，焦点回 keycap |
| RECORDING | 非法键（黑名单） | 忽略不写，行内提示「该键不可绑定」，留 RECORDING |
| RECORDING | 冲突键 | 两行标红，行内提示「与『X』冲突，请换键」，留 RECORDING |
| RECORDING | Escape | 取消录制，键不变，回 IDLE，焦点回 keycap（不关弹层） |
| 任意 | 「恢复默认按键」 | 9 动作回默认键 + 持久化 + 组内键名刷新，即时无确认（误触成本低） |

### 3.3 动效清单【新增·r31】

| 时机 | 动效 | 实现 |
|---|---|---|
| 进入录制态 | keycap 描边转 primary + glow，120ms | `border-color/box-shadow` transition，ease-out |
| 写入成功 | keycap 刷新 + 120ms success 描边淡出 | transition 淡出 |
| 冲突/非法 | 描边转 danger + 行内文案，1.6s 后消失 | 复用 toast 时序（1.6s 值域）思想，静态不循环 |
| 恢复默认 | 无动画 | — |
| reduced-motion | 上述全部瞬时/静默 | 沿全局 §6 裁剪（`transition-duration:0.01ms`） |

全部 ≤160ms 反馈、提示 1.6s 自隐——符合设计原则 P4「动效服务于节奏 ≤800ms，ease-out，reduced-motion 降级」。

## 4. 视觉规格

### 4.1 Token 复用（零新增 token）

全部复用既有 tokens，不新增 `--` 变量（与 r29「零新增 token」惯例一致）：`--surface-2`（keycap 底）、`--ink/--muted`（文字）、`--primary/--accent/--danger/--success`（状态）、`--line`（行分隔）、`--glass-bg`（组沿用弹层玻璃）、`--font-mono`（键名）、`--font-ui`（动作名）、`--fs-md`、`--sp-2/3/4`、`--radius-sm/md`、`--glow-primary`、动效 160ms ease-out。

### 4.2 组件规格

- `.settings-group--keys`：与既有 `.settings-group` 同构（__title + __content）；组尾「恢复默认按键」用 `.btn--secondary`（复用科技玻璃按钮）。
- `.keycap`（button）：基座对齐 `.btn--secondary`，覆盖 `font-family: var(--font-mono)`、`min-width: 88px`、`text-transform: none`；键名文本用可见字符（←→↑↓ / 空格 / 大写字母），不依赖 shape 字符防读屏丢失。
- `.keybind-row`：`display:flex; justify-content:space-between; align-items:center;` padding `var(--sp-2) 0`，下边框 `1px solid var(--line)`（末行无）。

### 4.3 状态样式表

| 状态 | 类 | 样式 |
|---|---|---|
| 默认 | `.keycap` | surface-2 底 + `--line` 描边 + `--ink` 键名 |
| 录制中 | `.keycap.is-recording` | `--primary` 描边 + `--glow-primary`，文案「按下新键…」 |
| 冲突 | `.keycap.is-conflict` | `--danger` 描边 + `--glow-danger`（两行同时） |
| 非法 | `.keycap.has-error` | `--danger` 描边 |
| 成功 | `.keycap.is-saved`（120ms 过渡态） | `--success` 描边淡出 |
| 焦点 | `.keycap:focus-visible` | `2px solid var(--accent)` 焦点环（既有规范，全站一致） |

### 4.4 触屏门控

`html.has-touch .settings-group--keys { display:none }`——与外观组 `html.has-touch .settings-group--appearance { display:block }` 相反逻辑、同机制（纯 CSS，既有先例）。理由：触控键固定动作表面、不跟随键盘绑定，按键设置在纯触屏设备无操作对象。

## 5. 可访问性

- 组容器 `role="group" aria-label="按键设置"`；keycap 按钮可见文本即键名，`aria-label` 动态：默认「左移，当前键 ← 左方向」/ 录制中「左移，录制中：按下新键，或按 Esc 取消」；录制态 `aria-pressed="true"`（参照既有 aria-pressed 三信号开关模式）。
- 冲突/非法提示：行内 `role="status" aria-live="polite"`，随事件即时播报，1.6s 自隐。
- 焦点：keycap 在弹层焦点陷阱内正常 Tab 遍历（既有 focusTrapHandler 复用）；进入录制不抢焦点；Escape 优先级：录制态=取消录制 → 常态=关闭弹层（在弹层 keydown 处理器内先判录制态）。
- `:focus-visible` 焦点环 2px `--accent` 全站既有规范沿用。
- 触屏设备隐藏按键组（§4.4）——键盘绑定仅键盘场景呈现。
- reduced-motion：录制/冲突动效全部静默（全局 §6 裁剪已覆盖）。
- 屏幕阅读器：键名一律可见文本（←→↑↓ 属 Unicode 箭头字符可读，空格显示「空格」二字）。

## 6. 改动面与契约（TECH 细化，此处只给意图）

| 文件 | 变化 |
|---|---|
| index.html | settings-modal 内外观组之后新增 `.settings-group--keys`（9 行 keycap + 恢复默认按钮，静态 DOM + id 注册，遵守「装配期同步查找」约束） |
| style.css | 组/行/keycap/状态类 + `has-touch` 门控 + ≤160ms 动效 |
| game.js | keyAction 参数化（两级分发：系统阶段键表 + key→action 绑定表）；onKeyDown/onKeyUp held 按绑定键（keyup 同名删除）；preventDefault 随绑定；暴露默认键表与 `setKeyBindings`（或 createGame 注入） |
| ui.js | 键盘分发层读绑定表（含 mute/hold 并入）；触屏合成改动作级分发（TOUCH_KEYS 保留为触屏回放表，与键盘绑定解耦）；按键组装配：捕获/校验（黑名单+冲突）/即时生效/持久化/恢复默认；键名显示表（normalize→label） |
| persist.js | `DEFAULT_KEYBINDINGS` + `settings.keybindings` sanitize（9 动作白名单 × 合法键集合，非法回退默认）；PAYLOAD_VERSION 不变（纯增量）；启动 load() 注入 game |
| scripts/verify-game.cjs | keyAction 表断言改写为两级分发 + 绑定覆盖用例 |
| scripts/verify-ui.cjs | TOUCH_KEYS↔动作交叉断言改造；按键组 DOM/状态契约新断言 |
| scripts/qa-e2e-jsdom.cjs | key() 派发参数化（绑定键）+ 改绑/冲突/取消/恢复默认/持久化重启 e2e |
| VERSION | 不动（升版由 PRD/AC 定） |

**需 PRD AC 确认的【取代】项**：① rotate 次键 X 失效；② hold 次键 Shift 失效；③ Escape 不再暂停（保留关弹层/取消录制）；④ OVER 阶段空格重开收敛至 Enter。若 AC 反对某项，备选 B 方案：动作支持「保留键列表」（UI 仅主键可改，次键永久生效），改动面收缩但 held/冲突规则需放宽，作为降级路径。

**回归面**：9 动作×改绑×相位矩阵；held keyup 同名释放（DAS 卡死回归）；触屏与键盘解耦；持久化重启恢复；黑名单/冲突/Esc 取消路径——QA 报告需逐项覆盖（本次为功能级改动，patch 模式跑不全，与 r31 裁定一致）。

<!-- state -->{"phase":"design","summary":"r31 按键设置 DESIGN：单键制（9 可改动作一对一主键：moveLeft/moveRight/softDrop/hardDrop/rotate/hold/togglePause/restart/mute），两级输入分发（READY/OVER 系统阶段键零回归 + key→action 绑定表），held 按绑定键同键删除消除 DAS 卡死陷阱，mute/hold 并入绑定，触屏不跟随（动作级分发+has-touch 隐藏按键组），捕获状态机 IDLE↔RECORDING（黑名单/冲突/Esc 取消），即时生效+persist keybindings 纯增量（PAYLOAD_VERSION 不变），零新增 token、≤160ms 动效、1.6s 提示自隐、reduced-motion 静默，keycap 按钮 aria-pressed/aria-live 焦点陷阱复用；行为变化 X/Shift/Escape 暂停/OVER 空格重开 以【取代】标出需 AC 确认（备选 B 多键制降级）；VERSION 不动","memory":["绑定模型=单键制 9 动作一对一；两级输入分发保留 READY/OVER 空格/Enter 开始重开语义零回归","held 陷阱解法=onKeyDown 按绑定键注册 + onKeyUp 同名删除；preventDefault 列表随绑定动态化","触屏=动作级分发不依赖键码，键盘改绑不影响触控键；has-touch 门控隐藏按键设置组（与外观组同机制反向）","捕获状态机：点击 keycap 进 RECORDING→合法无冲突写入/黑名单拒绝并提示/冲突两行标红/Esc 取消不关弹层；录制期屏蔽游戏键输入","持久化=settings.keybindings 9 动作白名单 sanitize 非法回退默认，PAYLOAD_VERSION 不变；VERSION 不动","视觉=零新增 token，复用 surface-2/mono/danger/success/glow/160ms ease-out/1.6s 提示自隐/reduced-motion 静默；focus-visible accent 2px","【取代】需 AC：rotate X、hold Shift、Escape 暂停、OVER 空格重开→Enter；备选 B 多键制降级","改动面：index.html 组 DOM、style.css 门控+状态、game.js keyAction 两级+held 键控、ui.js 捕获/校验/键名表+触屏动作分发、persist keybindings、verify-game/verify-ui/qa-e2e 断言改写"]}<!-- /state -->