# TECHNICAL — r36 移除整个「本局统计」块（#session-stats 卡）

基线依赖：docs/teamflow/20260904-r35（全局卡 4 行、本局卡 2 行、全局四项单键持久化不回归）
取代：docs/teamflow/20260903-r32-stats-panel#AC-1/#AC-2/#AC-4；r35 对 r32#AC-3 的删行（3→2）升级为 r36 整卡移除（2→0）

## 0. 结论（一句话）

信息面板从三组收敛为**两组**：「对局统计」`#stat-grid`（恰 4 块）与「全局统计」`#global-stats`（恰 4 行）；
删除整个「本局统计」`#session-stats` 卡（含 `.session-stat` 两行 + `session-announce` 播报 + `createSessionStats`
组件及全部接线）；全局统计单键持久化、stat-grid HUD、红线（game/audio/persist 0 行）与 VERSION 逐字不变。

## 1. 改动面（5 文件，94+/373−）

| 文件 | 改动 | 说明 |
|---|---|---|
| `index.html` | 删 `#session-stats` 块（节点 52-66 原）+ 更新 r34 注释 | 整卡删除（非隐藏）；`#session-stats`/`.session-stat`/`#ss-*`/`session-announce` 字符不在文中 |
| `ui.js` | 删 `createSessionStats` 组件 + 全部接线 | 保留 `formatSessionTime`（供全局统计累计时长复用）；删创建/渲染/dispose/导出；更新 DOM 契约注释 |
| `style.css` | 删 r32 session 规则块 + r34 S 竖屏 `#main` areas 去 session 行 | `.session-stats`/`.session-stat` 类 0 残留；`#main` areas 由 5 行收敛为 4 行（stats/global/controls/hold-board-next） |
| `scripts/verify-ui.cjs` | 删 r32 `#session-stats`/`.session-stat` 断言；改写 r34 位置隔离与 style 扫描；r35 会话断言升级为 r36 整卡删除证明 | 保留 `formatSessionTime` 纯函数矩阵、stat-grid/global-stats 断言、卡化列表、`'hold board next'`/`'global global global'`/order:13 |
| `scripts/qa-e2e-jsdom.cjs` | 删 r32 会话面板数值/防刷屏/组件用例；改 r34/r35 面板收敛断言 | 保留 stat-grid 基线 `.stat 恰 4`、触控区 `.tkey 恰 6`、global-stats 四行、持久化数据通道断言 |
| `scripts/assembly-check.cjs` | 0 改动 | 选择器清单本无 session 锚点（仅 r34 global-stats 五锚点）；AC-5 已天然满足 |

**红线文件（0 行 diff）**：`game.js`、`audio.js`、`persist.js`、`verify-game.cjs`、`verify-audio.cjs`、`verify-persist.cjs`、`verify-constants.cjs`。

## 2. ui.js 组件接线清除（AC-2 源码级）

`createSessionStats` 及其全部消费点删除，`ui.js` 无 `sessionStats`/`createSessionStats`/`#ss-`/`session-announce` 残留（仅 3c 块头保留一条说明性注释）。保留：
- `formatSessionTime`（`createGlobalStats` L1453 复用，`T.formatSessionTime` 导出不删）
- `createGlobalStats` 及 must×4、update 分支、load 镜像、破纪录、`onStats` 读回、dispose、导出（`api.createGlobalStats`）

## 3. style.css 布局收敛

R32 `session-stats` 独立卡规则块（含 `.is-flashing`、S 档 order:12、S 竖屏 `'session session session'` 行、S 横屏卡化）整体删除。
R34 全局统计块保持，仅其 S 竖屏 `#main` areas 覆写去掉 `'session'` 行：
```
grid-template-rows: auto auto auto minmax(0, 1fr)
grid-template-areas:
  'stats stats stats'
  'global global global'
  'controls controls controls'
  'hold board next'
```
并保留 `.global-stats { order: 13; }`（r36 移除 session order:12 后仍在其后）。零新增 token/@keyframes。

## 4. 断言改写要点（verify-ui / qa-e2e）

- `#session-stats` 相关断言：删除（verify-ui §r32 节点契约/位置隔离、qa-e2e 数值/防刷屏/组件用例）。
- r34/r35 `.session-stat 恰 2` 计数断言：改为「恰 0」（整卡移除）；面板收敛断言改写为 `#session-stats === null` + `#global-stats 恰 4 行`。
- 保留断言逐字不动：`.stat 恰 4`、`#stat-score/#hi-score/#stat-level/#stat-lines` 命中、`#hi-score`/`#lines` 单通道、global-stats 四行与初值 0/0/00:00/0、`@keyframes` 四基线、卡化列表行、order:13。

## 5. 验证（七套全绿）

`node scripts/verify-game.cjs` → 157 pass（0 diff）
`node scripts/verify-audio.cjs` → 24 pass（0 diff）
`node scripts/verify-persist.cjs` → 30 pass（0 diff）
`node scripts/verify-constants.cjs` → 2 pass（0 diff）
`node scripts/verify-ui.cjs` → 66 pass
`node scripts/assembly-check.cjs` → ALL CHECKS PASSED
`node scripts/qa-e2e-jsdom.cjs` → 587/587 pass

## 6. 风险与人工核对（移交 QA/验收）

- R3 跨档位布局：删卡后信息面板仅两组；S 竖屏 `#main` 4 行 mini-grid，`#board` 高度较 r34 回落（-1 行 ≈ 少 68px 挤占），需真机目检（AC-11）。
- R4 读屏：「本局统计」播报（session-announce）消失；本局实时信息由 stat-grid（分数/最高分/等级/消除行数）完整承担，累计数据在「全局统计」——AC-11 读屏复核。
