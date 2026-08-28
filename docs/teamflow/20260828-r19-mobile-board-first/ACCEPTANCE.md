# r19 移动端棋盘优先一屏适配 验收报告（产品经理 · 最终验收）

**验收对象：** r19 S 竖屏「棋盘优先、一屏适配」重写（取代 r17 的 S 竖屏卡片流规格；S 横屏变体/M/L 三档承继）
**基线依赖：** r17（断点框架）｜r16（触控语义 AC-1~14 不得回归）
**验收人：** 产品经理（acceptance lead，本轮由需求提出人确认方向 A 与细化设计后流水线代拟，最终签字权在需求提出人）
**验收对象文件：** style.css / scripts/verify-ui.cjs / scripts/qa-e2e-jsdom.cjs / docs/teamflow/memory.md + 任务夹（index.html / ui.js / game.js / audio.js / persist.js 0 diff）

## 结论（先行）

**✅ 通过（accepted，待需求提出人过目截图后正式合入）。** 七套脚本独立重跑全绿：verify-game **108** / verify-audio **24** / verify-ui **23** / verify-persist **15** / verify-constants **2** / assembly-check **ALL** / qa-e2e-jsdom **366/366**（与 r18 基线完全一致，断言等量替换）。竖屏四档（320/375/390/430）真实渲染实测：**零滚动零溢出、棋盘精确 1:2 吃满剩余高、全部区块首屏可见、dock 单行随流**；横屏子变体与 r17 基线逐字段一致（stash 对照）；对局态触控链路实拍通过。无 P0/P1/P2 缺陷；P3 登记 4 项（D1/D2 为 r17 既有顺带核实、D3 设计权衡、D4 继承）不阻塞。

## 验收证据

| 项 | 实测 |
|---|---|
| 七套脚本重跑 | 108/24/23/15/2/ALL/366，exit 全 0 |
| git 足迹 | 改动 = style.css + verify-ui.cjs + qa-e2e-jsdom.cjs + 本任务夹 + memory.md；**index.html/ui.js/game.js/audio.js/persist.js 0 diff**；VERSION 不升（D6 裁定延续） |
| 竖屏真值 | 四档 scroll==inner；棋盘 124/179/194/234 宽均精确 1:2；dock 视口内 y=507/606/779/867；统计/控制/设置钮全部首屏可达（QA-REPORT §2 表） |
| 横屏保真 | 568×320 与 r17 基线 stash 对照逐字段一致；§7.2/§7.3/§7.4/L 基线 0 行 diff |
| 视口对拍 | 四档视口 READY 态 + 对局态实拍（375×667 触控操作链路）逐项通过；截图为过程产物未入库，量化证据以本表及 QA-REPORT §2 真值表为准 |

## 逐 AC 核对表

| AC | 判 | 依据 |
|---|---|---|
| AC-1 一屏零滚动、全区块首屏 [P0] | ✅ | 四档 scroll==inner 实测；body 钉高 100dvh + #main flex 收缩；QA 截图 |
| AC-2 棋盘 1:2 等比吃满、最大视觉主体 [P0] | ✅ | 双 max + auto !important 覆盖（§7.2 先例）；四档画布精确 1:2；棋盘面积 > 任一其他区块 |
| AC-3 dock 单行随流、≥44px、键距≥8、safe-area [P0] | ✅ | position:static 单行实测（320 档 44px+8 恰容）；env 避让由 r16 基座承载；verify-ui 静态断言 ✓ |
| AC-4 统计单行 ≥16px、控制/设置首屏可达 [P0] | ✅ | 数值 18px；设置钮 92×44 右上；控制钮行 44px（触屏）；遮罩按钮随棋盘天然可见 |
| AC-5 侧栏竖排零渲染改动 [P0] | ✅ | ui.js 0 diff；48×80 e2e 断言沿用通过；开关关闭轨道塌缩（auto 轨） |
| AC-6 其余档零回归 [P0] | ✅ | 0 行 diff + 横屏 stash 逐字段对照一致 |
| AC-7 跨档切换不丢状态 [P0] | ✅ | e2e resize 5 轮快照逐字段不变（JS 零档位感知构造保证，承继 r17 AC-8） |
| AC-8 键位图例 S 竖屏隐藏 [P1] | ✅ | 静态断言 + 截图；已确认行为变更 |
| AC-9 零回归出口 [P0] | ✅ | 七套全绿；0 diff 清单见上 |

## 遗留（不阻塞，随 memory.md 待办）

- D1/D2（r17 既有）：S 横屏变体溢出校准、M 档矮视口变体——真机补测时一并裁决。
- D3（权衡）：宽屏手机棋盘 width-bound 留白；如需进一步放大棋盘，走「Next 队列顶部横排」专项（ui.js 双模式 + L 档重基线，需单独排期）。
- 真机补测沿用 r16 R1~R10 + r17 清单 + 本轮 100dvh 动态工具栏项。

## 判定

**✅ 通过（accepted）。** 全部改动未提交（无 TeamFlow runId，git 动作由需求提出人收口裁定；建议提交信息：`feat(Tetris r19): 移动端棋盘优先一屏适配 - S 竖屏游戏视口重写…`）。

<!-- state -->{"phase":"acceptance","summary":"r19 移动端棋盘优先一屏适配验收通过（accepted，待需求提出人过目截图）：七套全绿 108/24/23/15/2/ALL/366 与 r18 基线一致；竖屏四档真实渲染零滚动零溢出、棋盘精确 1:2、dock 单行随流、全区块首屏可达；横屏子变体 stash 对照与 r17 逐字段一致；ui.js/index.html/game/audio/persist 0 diff；P3×4 不阻塞（D1/D2 r17 既有、D3 设计权衡、D4 继承）；git 未提交留需求提出人收口。","memory":["ACCEPTANCE.md 已单次写入 docs/teamflow/20260828-r19-mobile-board-first/（判定=✅ 通过 accepted）","验收证据：七套 108/24/23/15/2/ALL/366；竖屏 320/375/390/430 scroll==inner、棋盘 124/179/194/234 宽精确 1:2；横屏 568×320 stash 对照逐字段一致","0 diff 红线：index.html/ui.js/game.js/audio.js/persist.js；VERSION 不升（D6 延续）","遗留：D1 横屏变体溢出校准（r17 D2 同族）/D2 M 档矮视口变体/D3 宽屏棋盘 width-bound 留白权衡/D4 M 档 --dock-h 断言（继承 r17 D3）；真机补测沿用既有清单 + 100dvh 动态工具栏"],"extra":{"verdict":"accepted","done":true}}<!-- /state -->
