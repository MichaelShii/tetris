# 技术变更单（v2.6 持久化层 · 应用层态从零实现）— products/tetris

- 变更单版本：v2.6-tc-1
- 状态：**✅ 已交付并验收通过（2026-08-18）**；QA 独立复跑 §5 全表全绿，P1 缺陷 BUG-P1-1（`toStorageAdapter` 归一化修复，commit `f508f2e`）已关闭，产品负责人已按 §4/§5 关闭并同步 memory（req-4/task-4 均 accepted）。
- 变更单位置：`docs/teamflow/technical/changes-persist.md`（本文件）；实现契约见下方 §3。
- 关联文档：`PRD.md`（v2.6 增量，AC-16 最高分持久化 + AC-10.5 音量/静音持久化，本单为技术驱动改造、**不新增/不修改 PRD 功能 AC 文本**）、`TECHNICAL.md`（§3 模块契约 UMD 对齐）、`AGENTS.md`（§4 工程约定）。
- 性质：**技术驱动改造（tech）**，新增**应用层持久化基础设施**（localStorage + 内存降级），仅带来极少量用户可见的"刷新后状态恢复"行为（详见 §4）。
- 严格对照实验：本实现**基于 main @ 774abca 基线 + 需求规格从零编写，不查看/不复制/不引用旧分支 `feat/persistence-localStorage*` 及历史残留文件**（如 `.tmp-zst/persist-backup/` 不得参考）。

---

## 1. 改造背景与目标（一句话）

在纯 JS / 零构建 / 零依赖 / `file://` 双击即玩的 Tetris 上新增统一的**应用层持久化层**（`window.TetrisPersist` UMD），把单游最高分（只增不减）与用户设置（音量/静音/幽灵开关/BGM 开关）在刷新/重开后恢复，并在存储不可用（隐私模式 / 受限 file:// / 无 localStorage）时优雅降级为内存存储，全程零依赖、零抛错、零游戏影响。

## 2. 影响范围

| 面 | 影响 |
|---|---|
| **新增文件** | `persist.js`（持久化层，UMD 双导出 `window.TetrisPersist` + `module.exports`）；`scripts/verify-persist.cjs`（node:test 自检）；`docs/teamflow/technical/changes-persist.md`（本单） |
| **接入改动** | `index.html`（`<script src="./persist.js">` 于 `ui.js` 前引入 + 装配根 `createUI` 传入持久化读写）；`ui.js` `createUI`（`TetrisPersist` 可选依赖：启动恢复 setting + 写回 highScore、设置变更时写回） |
| **审计改动** | `scripts/assembly-check.cjs`（导出面增 persist、脚本列表增 persist.js、DOM 增 #hi-score 钩子回读）；`scripts/verify-constants.cjs`（`EXPECTED_VERSION` 校验收口，见 §5） |
| **不改** | `game.js`/`audio.js` 逻辑（最高分以快照 `score` 为准由 UI 层读回写）；状态机/计分/音效/数值公式；`style.css` 视觉（沿用既有 HUD DOM） |
| **文档** | 本单 + `TECHNICAL.md` 修订记录补一行 + `memory.md` 记录本次改造 |

> ⚠️ **边界**：本单为 tech 改造，**不升级/不改写 PRD.md 的功能 AC**（AC-16/AC-10.5 由既有的 PRD v2.6 增量管理）；技术方案落地必须与 PRD 存储键 `tetris.highScore/volume/muted` 及（settings 组）`tetris.ghostEnabled/tetris.bgmEnabled` 对齐，键冲突归 PRD 管辖。

## 3. 技术方案要点（改动思路）

- **`persist.js` 分层设计（对齐 game/audio/ui 既有契约）**：
  - 工厂函数 + 闭包：`createStorage(opts?)` → `{ get, set, remove, dispose, available }`；容器选择顺序 = `localStorage`（能力探测 `try { test set/remove } catch→false`）→ 内存 `Map` 兜底。`available === false` 时 `get/set` 全部走内存，**永不 throw**。
  - 适配器层：`createPersistence(opts?)` → `{ load() → {highScore, settings} , saveHighScore(n), saveSettings(s) , dispose() }`；内部以带版本 `TETRIS_PERSIST_KEY`（如 `'tetris.persist.v1'`）单键 JSON 承载，读写包 `try/catch`，坏 JSON → 清键回默认（不抛错）。
  - 纯函数 `sanitize(value, schema)` **可单测**：对 `highScore` 做 `Math.max(0, Math.floor(+v))` 安全归一、对四设置做布尔白名单（`v === true/false` 否则回默认值），杜绝脏数据注入游戏。
- **读写接入（index.html + ui.js）**：
  - `index.html`：`persist.js` 置于 `audio.js` 前（最顶层，独立性最强）；装配根 `window.TetrisUI.createUI({ persist: window.TetrisPersistence?.createPersistence() })`，`persist` 缺失时 `createUI` 内部不启用持久化（游戏完全不受影响，向后兼容）。
  - `ui.js` `createUI`：① 启动时 `persist.load()` 恢复四设置（音量/静音交给 `audio.js` 既有 setter、幽灵/BGM 开关赋初值），并回填 HUD 最高分；② 监听 `onSnapshot`，比对 `s.score > persistedHighScore` 时写回（**只增不减**，等价单游/多游最高值）；③ 四设置任一变更 → `persist.saveSettings(...)`；④ `dispose()` 链上 `persist.dispose()`（纯内存侧清理，不留定时器/监听泄漏）。
- **降级语义**：存储不可用（隐私/受限 file:///jsdom 无 storage）时 `available=false` → 内存存储，会话内读写正常、刷新自然清空、游戏与既有逻辑零差异（AC-16 存储不可用 / 损坏键两条降级）。
- **测试**：新增 `verify-persist.cjs`（node:test，零依赖）覆盖：键读写往返、`available=false` 降级、损坏 JSON 清键回默认、设置/最高分 sanitize 边界（负数/NaN/非布尔/超界）、**只增不减**语义、`dispose` 后不再写；装配审计同步校验 `persist.js` 在脚本序、导出面、HUD 钩子齐全。

## 4. 行为兼容性影响（有无用户可见变化）

- **用户可见变化（轻微，属预期 out-of-scope 显式声明）**：
  1. 刷新页面后 **HUD 最高分恢复**为历史最高（此前刷新归零）——AC-16 目标行为；
  2. 刷新页面后 **音量/静音/幽灵开关/BGM 开关**保持会话值（此前重置默认）——AC-10.5/四设置目标行为；
  3. 存储不可用时**行为等同于旧版**（刷新不恢复），无可见异常、无报错。
- **不改的用户可见面**：游戏玩法/计分/等级/音效/BGM/快捷键/面板布局/视觉 token **完全不变**；不在既有 DATEs 之外新增任何控件、不改任何通过验收的既有 AC 语义。
- **PRD AC**：本单**不新增/不修改 PRD.md 功能 AC**；用户可见变化由既有 PRD v2.6 增量（AC-16 / AC-10.5）负责验收，本单只是落地其技术面。
- **版本号**：三模块 `VERSION` 是否升 `'2.6.0'` 由本厂改动交付时统一裁定（沿用 OBS-BGM-2 模式），`verify-constants` 期望值随之同步；本单不强制升版。

## 5. 回归与验证方案

| 项 | 命令（产品根下） | 预期 |
|---|---|---|
| 新脚本 | `node scripts/verify-persist.cjs` | 全绿（键往返/降级/损坏/只增/sanitize/dispose） |
| 回归底线 | `node scripts/verify-game.cjs` | 52 项全绿（**不加后门**，剔除最高分持久化相关的既有断言保持原样） |
| 回归底线 | `node scripts/verify-audio.cjs` | 23 项全绿 |
| 回归底线 | `node scripts/verify-ui.cjs` | 7 项全绿（仅当持久化接入使既有断言计数变化时同步 +n 并说明） |
| 回归底线 | `node scripts/verify-constants.cjs` | 2/2 绿（EXPECTED_VERSION 与三模块一致；若升 2.6.0 同步） |
| 回归底线 | `node scripts/assembly-check.cjs` | ALL CHECKS PASSED（含 persist.js 装配/导出/自包含） |
| 回归底线 | `node scripts/qa-e2e-jsdom.cjs`（需 jsdom） | 188 项全绿 |

- **出口标准**：六套既有验证全绿（52/23/7/2/装配ALL/188）+ 新增 verify-persist 全绿 + assembly-check 含 persist 自包含审计。
- QA 独立复跑上表**全部命令**作为验收口径；并对存储不可用分支（jsdom 无 storage / 显式 `available=false`）做对抗验证（证明持久化确实降级而非误伤游戏）。

## 6. 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| localStorage 值损坏 / 版本升级键冲突 | 脏数据注入游戏或读旧结构 | 单键带版本 + `sanitize` 白名单归一 + 坏 JSON 清键回默认；PRD 管辖键名防冲突 |
| 隐私模式 / 受限 file:// 无存储 | 写时抛 SecurityError | 能力探测 `available` 前置，`set/get` 全包 try/catch，降级内存 `Map`，绝不 throw |
| 持久化读/写时序干扰游戏主循环 | 帧内卡顿或竞态 | 读写均同步小对象、仅在 onSnapshot 变更点与设置变更点阻塞一次；无定时器往返 |
| 破坏既有六套验证 | 回归 | persist 层**纯新增** + `createUI` 可选依赖（缺省不启用），既有用例不改语义、逐一复跑 |
| 对照实验污染（误引旧实现） | 违背 hard 约束 | 实现基于 main 基线 + 本单规格从零编写；`git diff` 仅新增 persist 相关文件与声明接入点，禁止 `cat` 旧分支文件 |

- **回滚**：删除 `persist.js` 与 `verify-persist.cjs`、把 `index.html`/`ui.js`/`assembly-check.cjs` 中声明接入点回退（`persist` 可选依赖保证缺失即等效旧版）即可完全还原，游戏零影响；文档同步项为纯文本可一键撤销。

## 7. 动手清单（开发口径）

- [ ] 仅新增 `persist.js`（UMD 双导出）+ `scripts/verify-persist.cjs`；`index.html`/`ui.js`/`assembly-check.cjs` 按 §3 声明接入（可选依赖，缺省不启用）。
- [ ] 六套既有验证 + 新 verify-persist 全绿（§5 表）；存储不可用降级分支对抗通过。
- [ ] 向 `TECHNICAL.md` 修订记录补 v2.6 一行 + 本单同步 memory；完成后交 QA 验收并关闭。
