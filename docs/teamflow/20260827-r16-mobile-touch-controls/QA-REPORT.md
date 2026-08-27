# QA-REPORT — r16 移动端触屏控制（Tetris v3.3）

> 任务夹：`docs/teamflow/20260827-r16-mobile-touch-controls/` · 分支 `feat/mobile-touch-controls` @ `9546d07` · 工作树干净（仅本任务夹未提交）
> 产品根：`products/tetris/` · 基线依赖：r15 多格预览队列（`docs/teamflow/20260827-r15-multi-grid-preview-queue`）

## 结论（先行）

**验收就绪，未发现 P0/P1/P2 缺陷。** 七套全绿：`97/24/20/2/15/ALL/354`（同比 r15 `97/24/17/2/15/ALL/294`：verify-ui 17→20、qa-e2e 294→354，均为 r16 新增断言，其余计数不变）；QA 独立对抗抽查 31/31 全过；AC-1~14 逐项通过；架构核查合规（蓝图落地、引擎零改动、零新速率常量、无重复实现）。登记 2 项 P3 观察（设计固有权衡/注释精度，均非阻塞）。

## 测试范围与环境

- **范围**：r16 六键触屏输入通道（`ui.js` TOUCH_KEYS/isTouchDevice/createTouchControls + createUI 接线）、触屏操控区 DOM（`index.html`）、样式（`style.css` 5.5 节）、契约自检（`verify-ui.cjs`）、E2E r16 段（`qa-e2e-jsdom.cjs` +60）及其零回归影响面。
- **环境限制（沙箱策略，非交付缺陷）**：禁止 CDP/真实浏览器（Playwright/Puppeteer/remote-debugging）；音频/像素/真实计时/双分辨率/屏幕阅读器/多点真机触控均不可自动验证 → 一律入「人工补测清单」。本报告全部自动结论基于 build/静态审计/DOM 级 jsdom E2E 与 Node 单测。

## 用例与结果（pass/fail/blocked）

### 七套验证脚本（全绿，日志 `logs/teamflow/tf-mtbp8o1b-cm72wz/qa-*.log`）

| 套件 | 结果 | 说明 |
|---|---|---|
| verify-game.cjs | ✅ 97/97 | r15 引擎基线零回归 |
| verify-audio.cjs | ✅ 24/24 | 音效引擎基线 |
| verify-ui.cjs | ✅ 20/20 | +3 个 r16 契约块（TOUCH_KEYS 结构 / ↔keyAction 交叉校验 / 工厂缺元素抛错 / Node 零 DOM 副作用） |
| verify-constants.cjs | ✅ 2/2 | VERSION 三模块一致 |
| verify-persist.cjs | ✅ 15/15 | 持久化基线 |
| assembly-check.cjs | ✅ ALL PASSED | 装配顺序/自包含/音频审计；file:// 自动装配 0 资源错误 |
| qa-e2e-jsdom.cjs | ✅ 354/354 | r15 基线 294 → r16 触屏段 +60（AC-1~14 全项 + file:// 段 +3） |

### AC 逐项（依据 E2E r16 段 57 断言 + QA 独立抽查 C1~C10）

| AC | 级别 | 结果 | 证据要点 |
|---|---|---|---|
| AC-1 显隐按设备 | P0 | ✅ | default 无类 → `{touch:true}` 加入 → dispose 回收；显隐前/后 snap 逐字段不变（不重置对局）；file:// 非触屏不加类 |
| AC-2 PAUSED/OVER 无副作用 | P1 | ✅ | 触屏 touch 与 **click 双路径**（C3）：READY/PAUSED/OVER 下六键零输入、零音效、不 togglePause、不重开 |
| AC-3 左右等效 | P0 | ✅ | 短按单格、撞墙边界一致；长按 1s 位移差 ≤1 且 DAS 700ms 差 ≤1 |
| AC-4 软降等效 | P0 | ✅ | 短按单格；**QA 独立复测（C8）**：触屏 vs 键盘 600ms 位移差 ≤1 且 ≥8（走引擎 SOFT_DROP_REPEAT_MS=50 时钟，非首击） |
| AC-5 硬降=空格 | P0 | ✅ | 2 行差 1 格构造下 K/T `onSfx` 序列 `['hardDrop','clear']` 逐一相等 + snap 相等 |
| AC-6 旋转 20 次一致 | P0 | ✅ | 固定序列打桩 20 次旋转每步 snap 深等、rot 每步 +1（模 4） |
| AC-7 Hold 每周期 1 次 | P0 | ✅ | 与 C/Shift 同路径；周期内二次无效且无 hold 音效 |
| AC-8 防默认行为 | P0 | ✅ | `.touchpad`/`.tkey`/`#board` canvas touchstart·touchmove 均 defaultPrevented；CSS `touch-action:none`/`user-select`/tap-highlight（真机手势行为入人工补测） |
| AC-9 多指/连点 | P0 | ✅ | 左+软降同刻生效、释放左键软降 repeat 持续；**QA 独立复测（C6）**：同键双触（无 touchend）恰 1 步去重、松开可再触发；（C7）touchcancel 释放 + 可重新触发 |
| AC-10 触屏与键盘并存 | P0 | ✅ | 触屏实例存活期键盘照常；`.tkey` 可聚焦；**QA 独立复测**：聚焦硬降键物理 Space 恰 1 次（preventDefault+stopPropagation 防双发，C4）、Enter 激活次数精确（C5）；同键交错边界见「缺陷与观察」#1 |
| AC-11 现有按钮全流程 | P0 | ✅ | 真 click 开始→RUNNING、暂停↔继续、disabled 随状态机 |
| AC-12 布局/可点击 | P1 | ✅ | 静态算术：`--tpad-key:3rem`=48≥44、键行 6×48+5×8+16=344≤375、379px 兜底 44px、遮挡 (667−92)/592≥0.95、横屏 668≥592（真机视口渲染入人工补测） |
| AC-13 图例不误导 | P0 | ✅ | `html.has-touch .key-hints{display:none}` 规则存在 + `.key-hints` DOM 在位 |
| AC-14 七套全绿零回归 | P0 | ✅ | 97/24/20/2/15/ALL/354；game.js/audio.js/persist.js 本提交 0 行 diff；桌面键鼠默认无 `has-touch` → `.touchpad` `display:none` 零视觉变化 |

### 缺陷与观察（格式：缺陷跟踪表）

| 编号 | 严重级(P0/P1/P2/P3) | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| D1 | P3（观察，非阻塞） | 触屏/键盘输入 | 触屏按住软降键不松，另一手指/键盘按一次物理 `↓` 再松开 | 触屏按住的长按 repeat 应持续至松手（AC-10「互不干扰」） | 物理 `↓` 的 keyup 清除 game.js `held['ArrowDown']` 共享槽 → 触屏按住的 repeat 被冲掉（C9 双向证实：触屏 touchend 也会冲掉键盘按住） | AC-9 / AC-10 |
| D2 | P3（注释精度） | ui.js | 读 ui.js L1181/L1768 注释「归属计数」 | 注释与实现一致（计数语义） | 实现为单 boolean 归属：双实例 `{touch:true}` 并发时 dispose 一侧 → `has-touch` 移除、另侧存活实例视觉闪失；真实应用单例（`window.__tetris`）不可达 | AC-1 |

> D1 定性说明：触屏=「键盘事件回放器」设计（合成与实体键相同 key 码、共享同一 held/repeat 时钟）是 PRD §8 的逐键等效承诺，**同键交错互扰是其直接且必要的推论**——修掉需引入 per-channel held（破坏逐键等效、违反零新常量红线）。仅在同键冗余输入交错时触发，各通道单独使用完全正常、状态不损坏、全部松手即自愈。建议：按设计接受并写入 memory，或后续迭代另行权衡；不改动本交付。
> D2 建议：注释改为「布尔归属，谁加谁删」即可，不涉逻辑改动。

### 架构核查（M3 质量门）

- **蓝图落地**：TECHNICAL.md `<!-- blueprint -->` 五模块（index.html DOM 契约 / style.css 2 token+规则 / ui.js 输入通道 / verify-ui 契约自检 / qa-e2e r16 段）全部实现，assemblyOrder T1→T5 一致，依赖关系符合（ui.js→index.html+game.js；verify-ui→ui.js+game.js）。
- **引擎零改动**：`git diff 9546d07^ 9546d07 -- game.js audio.js persist.js` = 0 行（PRD §8 红线守）。零新速率常量：ui.js 五个 `_MS` 常量均为既有 UI 动画计时，本提交未新增任何 `_MS`（git diff 验证）。
- **无重复实现**：触屏能力检测/触摸监听/`has-touch` 管理全仓唯一实现点（grep `ontouchstart|maxTouchPoints|has-touch|touchstart` 仅命中 ui.js）；未发现 abstraction 该抽未抽或既有结构破坏。
- **已登记偏差（均有证据、非缺陷）**：① `isTouchDevice` 叠加 `window.ontouchstart !== null` 判别——jsdom 事件处理属性初值 null vs 浏览器 undefined（jsdom#2429），满足蓝图「jsdom 恒 false」意图；② TECHNICAL §2.1 `label` 字段未进 TOUCH_KEYS 实现（三字段为准，中文键名由 DOM 承载），verify-ui 已按实现断言。

### 人工补测清单（环境限制，非交付缺陷）

| # | 验收项 | 方法/工具 | 备注 |
|---|---|---|---|
| R1 | AC-1 真机能力检测 | iOS Safari/Android Chrome/触屏笔记本/纯桌面各 1 台真机打开 `index.html` | has-touch 显隐是否按设备正确 |
| R2 | AC-8 真机防默认 | 真机滑动/捏合/双击/长按棋盘与触屏区 | 滚动位移=0px、无缩放、无长按菜单、无选中 |
| R3 | AC-12 真机布局 | 375×667 / 812×375 / 320px 窄屏视口截图审查 | 底栏/侧轨渲染、遮挡 ≥95%、键 ≥44px 可点、无溢出 |
| R4 | AC-12 安全区 | 刘海屏/底部横条设备横竖屏 | `env(safe-area-inset-*)` 渲染 |
| R5 | AC-9 真实多指 | 真机两指同时按不同键、同键快速连点 | 各键生效、无抖动 |
| R6 | AC-3/4 长按手感 | 真机长按左/软降 1s 数格 | 与键盘同速率感知 |
| R7 | AC-10 混合设备 | 触屏笔记本触控+鼠标/键盘并用 | 触屏键显示且键鼠完整可用 |
| R8 | AC-14 桌面零变化 | 桌面浏览器（无触屏）对比 r15 视觉 | 触屏控件不可见、布局不变 |
| R9 | 音效听感 | 真机按键触发各键音效 | 与键盘同源 |
| R10 | D1 真机复验 | 真机外接键盘同键交错 | 确认接受为设计约束 |

## 结论

- 本交付**功能验收通过**：七套全绿（97/24/20/2/15/ALL/354）、AC-1~14 逐项满足、QA 独立对抗抽查 31/31、架构合规；无 P0/P1/P2 缺陷，2 项 P3 观察（D1 设计固有、D2 注释精度）不阻塞验收。
- 环境受限项（真机检测/手势/视觉/计时/多指/听感）入人工补测 R1~R10，请按清单在真机复核后完成验收。

<!-- state -->{"phase":"qa","summary":"r16 QA 完成：验收就绪，未发现 P0/P1/P2 缺陷。七套全绿 97/24/20/2/15/ALL/354（r15 基线 294→354，verify-ui 17→20，其余计数不变）与开发声明逐项一致；QA 独立对抗抽查 31/31（含跨通道同键互扰 D1 双向实证、click 路径 AC-2 三态、Space 防双发、Enter 激活、同键双触去重、touchcancel、600ms 长按引擎时钟差≤1、dispose 无残留）；AC-1~14 全过；架构核查合规（蓝图五模块落地、game.js/audio.js/persist.js 0 行 diff、零新速率常量、触屏实现全仓唯一）；D1(P3 触屏与键盘同键交错共享 held 槽互扰=逐键等效设计必要推论)与 D2(P3 归属注释精度)登记为观察不阻塞；真机补测 R1~R10（检测/手势/布局/安全区/多指/听感）入人工补测清单。QA-REPORT.md 已写任务夹","memory":["r16 QA 通过：七套 97/24/20/2/15/ALL/354 全绿，独立对抗 31/31，AC-1~14 全过，无 P0/P1/P2","发现 2 项 P3 观察：D1 触屏与键盘同键交错（共享 game.js held 槽，任一通道 keyup 冲掉另一通道 repeat；逐键等效设计必要推论，建议接受入 memory）；D2 has-touch 注释称'归属计数'实为 boolean（单例下不可达）","架构合规证据：blueprint 五模块全落地；game/audio/persist 0 行 diff；ui.js 无新增 _MS 常量；触屏代码全仓唯一实现点","QA 独立抽查脚本 logs/teamflow/tf-mtbp8o1b-cm72wz/qc-r16-independent.cjs（31 断言 C1~C10，jsdom 取自 harness node_modules，可复用）","真机补测 R1~R10 已列 QA-REPORT 人工补测清单：能力检测/防默认/布局 375x667·812x375·320/安全区/多指/长按手感/混合设备/桌面零变化/听感/D1 复验"],"extra":{"verifyScripts":["scripts/verify-game.cjs","scripts/verify-audio.cjs","scripts/verify-ui.cjs","scripts/verify-constants.cjs","scripts/verify-persist.cjs","scripts/assembly-check.cjs","scripts/qa-e2e-jsdom.cjs","logs/teamflow/tf-mtbp8o1b-cm72wz/qc-r16-independent.cjs"]}}<!-- /state -->