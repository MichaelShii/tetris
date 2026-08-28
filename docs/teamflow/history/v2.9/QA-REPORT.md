# QA-REPORT — Tetris v2.9 踢墙旋转开关系统

> 版本：v2.9 ｜ 分支：feat/v2.8-no-wallkick ｜ 基线：075fe71 ｜ 日期：本迭代
> 前置版本（v2.8）报告已归档：`docs/teamflow/history/v2.8/QA-REPORT.md`

## 1. 结论（先行）

✅ **v2.9 达到可验收标准。** 七套验证中六套全绿，`verify-constants` 1 例失败为**场外既有文档漂移（非本轮引入）**，详见 §4。AC-19 九项全部通过；AC-01~18 回归全绿；架构核验无 P1 缺陷。

| 验证套件 | 结果 | 说明 |
|---|---|---|
| `verify-game` | 65/65 ✅ | 基线 58 + 新增 7 项 AC-19（默认开/左命中/右命中/全败原位/关零偏移/实时生效/setter 钳制）；AC-18 三例已改开关关闭态断言 |
| `verify-audio` | 23/23 ✅ | 音效引擎回归 |
| `verify-ui` | 8/8 ✅ | 含 `#wallkick-control/#btn-wallkick` 必需元素契约 |
| `verify-persist` | 11/11 ✅ | 含 `wallKickEnabled` 布尔白名单持久化（AC-19.6） |
| `verify-constants` | 1/2 ⚠️ | §4 详细说明（场外既有） |
| `assembly-check` | ALL PASSED ✅ | 装配 + 自包含 + 顺序 + HUD 钩子 |
| `qa-e2e-jsdom` | 197/197 ✅ | 基线 188 + 新增 9 项开关切换/联动/装配默认开用例 |

## 2. 测试范围与环境

- **范围**：v2.9 踢墙旋转开关系统（AC-19）+ AC-01~18 回归底线 + 架构核验（M3 质量门禁）。
- **环境**：Node.js 单测 + jsdom DOM E2E + 静态代码审计 + 对抗性抽查。**沙箱禁止 CDP 浏览器实测**（像素/听感/真实时序/多浏览器/读屏不可自动测，已列入 §7 人工补测清单）。
- **日志**：`logs/teamflow/tf-mt85o5jj-60ypjq/qa-*.log`（game/audio/ui/persist/constants/assembly/e2e）。

## 3. AC-19 九项验收核对

| AC | 验收点 | 验证载体 | 结果 |
|---|---|---|---|
| AC-19.1 | 开关默认开（新会话/无存档）；setter 钳制布尔 | verify-game 65(`默认开`+`setter 钳制`)；e2e 716；persist 57 | ✅ |
| AC-19.2 | 开=碰撞按偏移表逐格尝试，命中→x/y 更新、rot 生效、旋转音效 | verify-game 514/533（左/右命中）；TECHNICAL §2.2 固定表 `[[-1,0],[1,0],[0,-1]]` | ✅ |
| AC-19.3 | 开但全部偏移失败→保持原位 `wall-kick-denied` | verify-game 551 | ✅ |
| AC-19.4 | 关=无踢墙（AC-18 语义，返回 `wall-kick-denied`） | verify-game 570 | ✅ |
| AC-19.5 | 开关实时生效（≤100ms）且引擎联动 | verify-game 586（切换即时）；e2e 719-726（点击双向联动） | ✅ |
| AC-19.6 | localStorage 持久化（键 `tetris.wallKickEnabled`，坏 JSON 回默认开） | verify-persist 71/122；ui.js 1071-1073 装配时序补同步 | ✅ |
| AC-19.7 | 信息面板科技玻璃风开关（对齐 AC-13/AC-15，可访问） | verify-ui + e2e 713-715（aria-pressed/aria-label 文案） | ✅ |
| AC-19.8 | 零副作用（状态/计分/音效/BGM/7-bag/幽灵块/布局不回归） | assembly + e2e 全绿；静态审计 | ✅ |
| AC-19.9 | 回归底线 AC-01~18 全绿 + 七套验证 | §1 全表 | ✅（除 §4 场外项） |

## 4. 架构核验（M3 质量门禁）

- **职责划分**：引擎（game.js `rotate()` 三态分支 + `WALL_KICK_OFFSETS` 固定表 + `setWallKickEnabled/getWallKickEnabled`）｜持久化（persist.js `DEFAULT_SETTINGS` 增 `wallKickEnabled:true`，readState/encode 三处同步）｜UI（ui.js `#btn-wallkick` 三信号开关，index.html/style.css 装配）。模块边界清晰，符合蓝图。
- **无重复实现**：踢墙逻辑唯一实现于 `game.js rotate()`；设置唯一事实源在 `persist.js DEFAULT_SETTINGS`；UI 开关复用 `btn--audio`/aria-pressed 既有模式（零新增 token），无漂移。全仓引用 wallKick 的文件恰为工程面预期（4 源码 + 5 测试脚本），未见冗余。
- **幽灵块风险（PRD 提示项）已闭合**：`ghostY` 为渲染期纯函数（game.js:229），由 `state.piece` 实况推导，踢墙改变 x/y 后下一帧 ghost 自动跟随，无陈旧幽灵。
- **装配时序已封闭**：ui.js 1073 在 createGame 后补一次引擎同步，防「UI 显示已恢复值、引擎仍默认开」漂移（AC-19.6）。
- 未发现破坏既有结构、该抽象未抽象、多套实现漂移等 P1 架构问题。

## 5. 缺陷清单

| 编号 | 严重级 | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| QA-DEF-001 | P3 | 回归脚本/文档同步（**场外既有，非本轮引入**） | `node scripts/verify-constants.cjs` | 全绿 | 1 例失败：脚本 `EXPECTED_VERSION='2.3.0'` 断言 TECHNICAL §2.2 记录 2.3.0，但 tech 阶段已将 §2.2 重写为 v2.9 踢墙偏移表，不再含 2.3.0。`git show 075fe71` 已证基线该 §2.2 亦不含 2.3.0（基线即「既有数据模型 v2.7 沿用」），属**长期陈旧漂移**非本次交付引入 | AC-19.9 回归底线 |

除上表外，**未发现其他缺陷**。

## 6. 对抗性抽查亮点

- 开关关闭态下 AC-18 语义精确保持（零偏移、`wall-kick-denied`、无音效——verify-game 570 断言）。
- 踢墙命中仅旋转成功才发 `sfx('rotate')`，失败不发音效（game.js:636/621 均在成功分支）。
- `rotate()` 在 `illegal-phase`（非 RUNNING/disposed）短路返回 `wall-kick-denied` 之外的 `illegal-phase`，未污染开关语义。
- setter `enabled === true` 严格钳制，与注入 `opts.wallKickEnabled !== false` 的宽松默认语义共存，两路径均被单测覆盖，行为确定。

## 7. 人工补测清单（环境限制，非交付缺陷）

| 验收项 | 验收标准 | 验证方法/工具 | 备注 |
|---|---|---|---|
| AC-19.7 视觉 | 信息面板开关呈科技玻璃风、与 BGM 开关视觉一致 | 浏览器打开 `index.html`，目视对比 `#btn-wallkick` 与 `#btn-bgm` | 需真实浏览器像素 |
| AC-19.2/AC-19.4 听感 | 踢墙命中播放旋转音效、失败不播放 | 真人试玩：靠墙旋转听音效 | 需真实音频 |
| AC-19.6 跨会话 | 刷新后开关态保持、坏 localStorage 回默认 | 浏览器 DevTools 置 `tetris.wallKickEnabled` 及坏值后刷新 | 需真实浏览器 localStorage |
| AC-19.5 真实时序 | 点击到引擎生效 ≤100ms 体感无卡顿 | 真人操作节奏 | 需真实时序 |
| 离线/file:// 多浏览器 | 开关功能在 Chrome/Edge/Firefox 下一致 | 分别双击 index.html 测试 | 需多浏览器 |
| AC-19.7 读屏 | 开关可被读屏识别为「踢墙旋转开关」切换 | 屏幕阅读器（NVDA/VoiceOver）逐 TAB | 需读屏环境 |

---
*QA 报告由 TeamFlow 流水线 QA 阶段生成，正文精炼，细节落盘 `logs/teamflow/tf-mt85o5jj-60ypjq/`。*
