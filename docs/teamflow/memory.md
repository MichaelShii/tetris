# docs/teamflow/memory.md — 产品记忆（迭代历史与待办）

> 维护者：TeamFlow 研发流水线（产品经理每次迭代更新；AGENTS.md §5/§6 为精炼锚点，本文件为记忆落盘）。
> 本文件承载**新迭代需求与目标版本**等面向下一次研发的产品记忆；历史细节以 `docs/history/<版本>/` 快照追溯。

## 迭代历史（产品记忆）

| 版本 | 日期 | 需求 | 结果 |
|---|---|---|---|
| v1.0 | 2026-08-16 | 简易俄罗斯方块：闭环玩法、计分、难度升级、科技玻璃风格 | ✅ 交付完成；QA 功能验收通过 |
| v2.0 | 2026-08-16 | 音效系统（七类合成音效）+ 音量/静音控制（M 键 + 面板按钮），零外部音频文件 | ⚠️ 有条件通过；AC-01~10 可自动化项 100% 全绿，无 P0/P1/P2 缺陷；人工补测待完成 |
| v2.1 | 2026-08-16 | 暂停/继续快捷键：`P` 双向切换 + `空格` 暂停态继续 + GAME_OVER `空格` 重开；零 UI 视觉改动 | ⚠️ 有条件通过；AC-01~11 可自动化项 100% 全绿（47/19/6/装配/164），无 P0/P1/P2 缺陷；人工补测待完成 |
| **v2.2** | 2026-08-16 | 幽灵块（落点预览）：引擎新增纯函数落点计算（复用 `collides`、无踢墙、垂直直线）+ UI 半透明轮廓渲染（同色系、可辨识）；随移动/旋转/软降/自动下落实时刷新；**不改数值/状态机/keyAction/音效**；回归底线 AC-01~11 | ⚠️ 有条件通过（产品验收 2026-08-16）：AC-12 可自动化项 100% 通过（51/19/7/装配/177，独立复跑一致），与硬降落点偏差 0 格自动化断言；AC-01~11 回归全绿；无 P0/P1/P2 缺陷；1 项 P3 观察项 OBS-12-1（E-12-08 防御未实现，不阻断）；AC-12.11 幽灵块真机目测/双分辨率/复杂形状/相邻边界 4 项人工补测待完成（QA-REPORT §6） |
| **v2.3** | 2026-08-18 | 幽灵块辅助开关（AC-13）+ 修正计分规则（AC-14）：左侧信息面板新增科技玻璃风开关控件控制幽灵块显隐；移除硬降加分逻辑（`dropBonus` 每格 +1），仅保留消行计分；回归底线 AC-01~12 | ⚠️ 有条件通过（产品验收 2026-08-18）：AC-13、AC-14 可自动化项 100% 通过；AC-01~12 回归全绿（除 AC-14 明确改变的硬降加分断言外）；无 P0/P1/P2 缺陷；开关可访问性/计分规则人工补测待完成（QA-REPORT §6） |
| **v2.5** | 2026-08-18 | 背景音乐 BGM（AC-15，P0 本次交付项）：信息面板科技玻璃风 BGM 开关（默认关、会话内保持、可访问）+ Web Audio 实时合成循环旋律（BGM_DEFS 14 音/96bpm/triangle，独立 bgmVoices 池 + masterGain 汇入，零外部音频文件）；与音量/静音联动、自动播放合规、降级无声、dispose 无泄漏；关闭 README「已知取舍」P2 BGM 项 | ⚠️ 有条件通过（产品验收 2026-08-18，tf-mszkunr9-qs3o6u）：六套验证独立复跑全绿（**52/23/7/2/装配ALL/188**），AC-01~14 回归不加后门全绿；AC-15 可自动化项 100% 通过（含 BGM 契约 4 条 + QA 对抗 11/11）；无 P0/P1/P2 缺陷；登记 P3 观察项 OBS-BGM-1（BGM 开关 UI 点击未在 E2E/verify-ui 直接断言，非阻断）+ OBS-BGM-2（模块 VERSION 未升仍 2.3.0，验收裁定）；**遗留条件**：① TECHNICAL.md 未增补 BGM 契约章节（PRD §5.4/M3 要求落盘，文档缺口，见待办）② B1~B9 真人听感/视觉/读屏人工补测待完成（QA-REPORT §4） |
| **v2.6** | 2026-08-18 | 应用层持久化（tech 技术驱动改造，分支 `feat/persistence-localStorage2`，对照实验）：最高分本地持久化（AC-16）+ 音量/静音/幽灵/BGM 四设置刷新恢复（AC-10.5），`persist.js` UMD 层 + `verify-persist.cjs`；**不新增/不修改 PRD 功能 AC** | ❌ 打回→✅ 修复后通过（产品验收 2026-08-18，tf-mt317a5e-0iwvuy）：P1 缺陷 BUG-P1-1（createStorage 适配器 API 漂移）已修复（toStorageAdapter 归一化 + verify-persist 真实形状对抗用例 10→11 全绿），六套既有 + verify-persist 复跑全绿（52/23/7/2/装配ALL/188+11/11），AC-16/AC-10.5 真实浏览器路径有效 |
| **v2.8** | 2026-08-18 | 无踢墙旋转系统（AC-18，P1）：固定旋转逻辑为"单点旋转，无踢墙"——旋转碰撞时方块保持原位（x/y/rot 不变），不尝试任何踢墙偏移；返回 `reason: 'wall-kick-denied'` 区分语义。改动范围：game.js rotate 函数 reason 优化；verify-game.cjs 补旋转边界用例 | ✅ 通过（产品验收 2026-08-18，tf-mt5afdch-7xyajm）：七套验证全绿（58/23/7/1/ALL/11/188），AC-18 七项全部通过，AC-01~17 回归全绿，无 P0/P1/P2 缺陷；架构核验无偏离 |
| **v2.7** | 2026-08-18 | 7-bag 随机算法（AC-17，P2 增强）：替换均匀随机队列为标准 Tetris 7-bag 算法——每 7 块为一轮，先将全部 7 种方块放入袋中并洗牌，依次发完后再创建新袋，确保每 7 块中每种方块恰好出现一次。改动范围：game.js 中 createQueue 函数替换为 7-bag 实现；verify-game.cjs 补充 7-bag 算法契约用例（每袋包含全部 7 型、连续两袋无重）；qa-e2e-jsdom.cjs 修复 4 处 7-bag 兼容断言 | ✅ 通过（产品验收 2026-08-18，tf-mt417ope-hbxksi）：七套验证全绿（55/23/7/2/ALL/11/188），AC-17 六项全通过，AC-01~16 回归全绿，无 P0/P1/P2 缺陷；架构核验无偏离 |
| **v2.4** | 2026-08-18 | 引擎 `ghostY` 非法入参防御（OBS-12-1 关闭，P3 健壮性/文档-实现对齐）：`rot%4` 归一（负数归 0–3）、未知 `type` 回退原样、`piece===null` 防御，均不抛错、返回类型安全值；**不改合法路径/状态机/快捷键/音效/数值**；verify-game 断言 51→52（补 E-12-08 用例）；TECHNICAL §6.2 E-12-08 标注已实现、memory OBS-12-1 关闭 | ✅ 通过（产品验收 2026-08-18，tf-msytlok5-08oeu5）：六套验证独立复跑全绿（**52/19/7/装配/188**），AC-01~14 回归底线保持，无新增玩家可见功能；独立抽查 `ghostY` 实现与 PRD §2 AC-12.12 / TECHNICAL E-12-08 逐条吻合（null/undefined→-1、未知 type→piece.y、rot `((v%4)+4)%4` 负数归 0–3、均不抛错）；无 P0/P1/P2 缺陷；OBS-12-1 关闭；新登记 P3 观察项 OBS-12-2（NaN/小数/undefined rot 归一不收敛仍抛错，超本次整数 rot 验收范围，非阻断，建议归一前 Math.trunc/Number.isInteger） |
| **v2.2-tc**（tech） | 2026-08-16 | 工程自检脚本 `verify-constants.cjs`：断言三模块头部 `VERSION` 均 === `'2.2.0'` 且与 TECHNICAL §2.2 一致；仅新增测试脚本，**不改任何既有代码/行为/UI/AC** | ✅ 技术变更单关闭（产品验收 2026-08-16）：新脚本 2/2 绿 + 回归底线五套全绿（**51/19/7/装配/177**，v2.2 计数，非 47/19/6）；QA 负向对抗证明脚本真实区分力（false-green 防护）；无 P0/P1/P2 缺陷；1 项 P3 观察项 OBS-TC-1（changes.md §5 基数引 v2.1 旧计数 47/19/6，实际 51/19/7，文档口径待下次同步更正） |
| **v2.2-hotfix**（patch） | 2026-08-16 | 热修 README.md 第 37 行标点：`暂停 / 继续（双向切换）` → `暂停、继续（双向切换）`（斜杠改顿号，中文并列标点规范）；纯文档改动，零代码变更，不升版本号 | ✅ 交付完成（产品验收 2026-08-16）：assembly-check 全绿，AC-01~12 回归基线不受影响；无遗留问题 |
| **v2.2-hotfix-2**（patch，取消） | 2026-08-16 | 删除 README.md 第 37 行「暂停、继续」之间的全角空格（U+3000）；纯文档改动，零代码变更，不升版本号 | ✅ 通过（需求与实际不符，无需改动）（产品验收 2026-08-16，tf-msy4l38m-lr5fod）：三层 Unicode 验证确认全角空格不存在（U+3001 顿号正确）；assembly-check 全绿；AC-01~12 回归基线不受影响；已关闭需求（req-7），无代码变更 |
| **v2.2-hotfix-2**（patch，复核验收） | 2026-08-16 | 复核 README.md 第 37 行「暂停、继续」间全角空格（U+3000）是否存在 | 📝 需求不适用（产品验收 2026-08-16，复核 run）：逐码位核对确认该行 `暂停、继续` 间为 U+3001 顿号、全文 U+3000 计数 = 0，需求所指「多余全角空格」不存在；未做任何改动（不臆造）；关闭需求，无代码变更，不升版本号 |
| **v2.2-hotfix-2**（patch，最终复核验收） | 2026-08-16 | 最终复核 README.md 第 37 行「暂停、继续」间是否含全角空格（U+3000），对照确认单做验收 | 📝 需求不适用（产品验收 2026-08-16）：字节级核验该行 `暂停`(U+6682/U+505C)`、`(U+3001 顿号)`继续`(U+7EE7/U+7EED) 间**无 U+3000**，全文 U+3000 计数 = 0，与确认单结论一致（需求与实际不符，建议取消）；开发未臆造改动，QA assess 档跳过，五套基线保持全绿（assembly-check `ALL CHECKS PASSED`）；关闭需求，无代码变更，不升版本号 |

## 当前迭代记忆（v2.3，幽灵块开关 + 计分修正）

> **✅ 已交付（2026-08-18 产品验收 ⚠️ 有条件通过）**：AC-13、AC-14 可自动化项 100% 通过、AC-01~12 回归全绿（除 AC-14 明确改变的硬降加分断言外）、无 P0/P1/P2 缺陷；验收条件 = 下方「人工补测（v2.3 验收新增）」全部通过。

- **目标版本**：v2.3（进行中）
- **需求摘要**：幽灵块辅助开关（AC-13）+ 修正计分规则（AC-14）：左侧信息面板新增科技玻璃风开关控件控制幽灵块显隐；移除硬降加分逻辑（`dropBonus` 每格 +1），仅保留消行计分。
- **交付要点**：
  1. 幽灵块开关：左侧信息面板新增开关控件（科技玻璃风，遵循 DESIGN §5 token），开关状态与渲染联动（开启=显示，关闭=隐藏）；回合中切换即时生效（≤100ms）；会话内保持，刷新恢复默认（开启）；可选 P2 本地持久化。
  2. 计分修正：移除 `dropBonus` 函数（定义/调用/导出全部移除，game.js），硬降不加分；仅消行计分公式保持 §5 规格（1/2/3/4 行 = 100/300/500/800 × 等级）；软降不加分（保持不变）。
  3. 回归底线 **AC-01 ~ AC-12 全绿**（除 AC-14 明确改变的硬降加分断言外）。
  4. 同步更新：PRD §5 数值规格、verify-game.cjs（移除 dropBonus 相关用例）、qa-e2e-jsdom.cjs（硬降加分断言移除、硬降计分回归）、README/DESIGN/TECHNICAL 相关描述。

## 当前迭代记忆（v2.5，背景音乐 BGM）

> **✅ 已交付（2026-08-18 产品验收 ⚠️ 有条件通过，tf-mszkunr9-qs3o6u）**：六套验证独立复跑全绿（**52/23/7/2/装配ALL/188**），AC-01~14 回归不加后门全绿、AC-15 可自动化项 100% 通过（含 BGM 契约 4 条 + QA 独立对抗 11/11）、无 P0/P1/P2 缺陷；验收条件 = ① TECHNICAL.md 补 BGM 契约章节（PRD §5.4/M3 要求）② B1~B9 人工补测（QA-REPORT §4）通过。

- **目标版本**：v2.5（⚠️ 已验收·有条件）
- **产品验收结论（2026-08-18）**：独立复跑 verify-game 52/52、verify-audio 23/23（含 BGM 契约 4 条：默认关/启停+重开/dispose 无泄漏、独立 voice 池不受 SFX 并发上限、未解锁降级 0 报错、BGM_DEFS 合法）、verify-ui 7/7、verify-constants 2/2（VERSION '2.3.0' 三模块一致）、assembly-check ALL CHECKS PASSED（含 #btn-bgm/#bgm-control 装配钩子 + AC-08 自包含 + AC-09.5 0 音频文件）、qa-e2e-jsdom 188/188+file://（QA 口径）。独立代码审计确认 BGM 引擎（audio.js `BGM_DEFS`14 音/96bpm/triangle/peak 0.16、`startBgm/stopBgm/isBgmPlaying`、独立 `bgmVoices` 池 + `masterGain` 汇入）+ UI 开关（ui.js `#btn-bgm` click→startBgm/stopBgm、aria-pressed/aria-label 三信号、E9 防抢焦点、dispose 解绑）+ index.html 装配齐全自洽；README「已知取舍」P2 BGM 项已关闭。**无 P0/P1/P2 缺陷**。
- **遗留条件（验收有条件依据）**：① **TECHNICAL.md 未增补 BGM 契约章节**——PRD §5.4 明确要求「音阶/配速/织体参数由技术方案定义并落盘 TECHNICAL.md」、PRD §9.2 M3 亦列「TECHNICAL 增补 BGM 契约章节」，但 TECHNICAL.md 仍为 v2.3 且无 BGM 段，属**文档契约缺口**（BGM_DEFS 数值只在 audio.js，未落盘技术方案）；② **模块 VERSION 未升**（仍 '2.3.0'，OBS-BGM-2，行为新增是否升版由验收裁定为不阻断）；③ B1~B9 真人听感/视觉/读屏人工补测待完成（QA-REPORT §4）。
- **回归底线**：AC-01 ~ AC-15 为验收全集；AC-01~14 不加后门全绿 + AC-15 全绿 = 出口标准（已达成可自动化部分）。

## 当前迭代记忆（v2.4，引擎 ghostY 入参防御 · OBS-12-1 关闭）

> **✅ 产品验收通过（2026-08-18，tf-msytlok5-08oeu5）**：P3 健壮性/文档-实现对齐（OBS-12-1 关闭），无新增玩家可见功能。

- **目标版本**：v2.4（✅ 已验收）
- **产品验收结论（2026-08-18）**：六套验证独立复跑全绿（**52/19/7/装配/188**），AC-01~14 回归底线保持；独立抽查 `game.js` `ghostY` 实现与 PRD AC-12.12 / TECHNICAL E-12-08 逐条吻合（`null/undefined→-1`、未知 `type`→`piece.y`、rot `((v%4)+4)%4` 负数归 0–3，均不抛错、不改合法路径）；**无 P0/P1/P2 缺陷**，OBS-12-1 关闭。新登记 **P3 观察项 OBS-12-2**（`rot=NaN/3.5/undefined` 时 `((rot%4)+4)%4` 归不到 0–3，索引 SHAPES[非整数] 为 undefined → collides 抛错；超出 E-12-08 已知整数 rot 验收范围，非阻断，建议归一前 `Math.trunc`/`Number.isInteger` 校验）。
- **需求摘要**：引擎 `ghostY(board, piece)` 非法入参防御补齐，关闭 OBS-12-1：`rot` 用 `%4` 归一并负数归一到 0–3（等价 `((rot%4)+4)%4`）、未知 `type` 回退原样（不抛错）、`piece === null` 返回类型安全值（不抛错）。
- **开发交付结论（2026-08-18）**：`game.js` `ghostY` 已加入参防御（`rot%4` 归一含负数归 0–3、未知 `type` 回退原样返回 `piece.y`、`piece === null`/`undefined` 返回哨兵 `-1`，均不抛错、不改合法路径）；verify-game 补 E-12-08 用例（**51 → 52**）全绿；**五套验证 + E2E 全绿（52/19/7/装配/188）**；TECHNICAL §6.2 E-12-08 标注已实现、OBS-12-1 已关闭；模块 `VERSION` 保持 v2.3.0 未升（本次行为不变，verify-constants 基线维持）。
- **回归底线**：**AC-01 ~ AC-14 全绿**；出口标准 = 六套验证全绿（verify-game 52 / verify-audio 19 / verify-ui 7 / verify-constants / assembly-check / qa-e2e-jsdom 188）。

## 待办（下一批，不含本期）

> **🔴 v2.6 验收打回项（P1 缺陷 BUG-P1-1，新增 2026-08-18 产品验收，tf-mt317a5e-0iwvuy）→ ✅ 已修复并复验通过（2026-08-18）**：`persist.js` `createStorage` 适配器 API 漂移——探测用 `window.localStorage.setItem/getItem/removeItem`（探针成功→`available=true`），返回适配器却调用 `store.set/store.get/store.remove`（原生 localStorage **无此三法**，内存 Map 风格）→ 真实浏览器每次读写抛 `TypeError` 被 try/catch 静默吞掉、因 `available=true` 不降级内存 → 持久化完全静默失效（`saveHighScore` 不落地、reload 最高分/四设置全丢）。**已修复**：`persist.js` 新增 `toStorageAdapter` 归一化（`getItem/setItem/removeItem` 形状与 `get/set/remove` 形状统一映射到内部 `get/set/remove` 面），`createStorage` 命中本地存储后经归一化接入、`createPersistence` 注入的存储同样归一化；`verify-persist.cjs` 补真实 Web Storage 形状对抗用例（仅 `getItem/setItem/removeItem`，无 `set/get/remove`，10→11 全绿），杜绝单测与真实适配形态不一致再现。复跑六套既有 + verify-persist 全绿（**52/23/7/2/装配ALL/188 + 11/11**），AC-16/AC-10.5 真实浏览器路径有效。

> **⚠️ v2.5 验收有条件项（新增 2026-08-18 产品验收，tf-mszkunr9-qs3o6u）**：
> 1. **TECHNICAL.md 补 BGM 契约章节（文档缺口，非阻断）**：PRD §5.4 要求 BGM「音阶/配速/织体参数由技术方案定义并落盘 `docs/teamflow/technical/TECHNICAL.md`」，但当前 TECHNICAL.md 仍为 v2.3、无 BGM 段。需将 BGM_DEFS 契约（bpm 96 / triangle / peak 0.16 / 14 音符 C 大调序列 / lookahead 调度 / 独立 bgmVoices 池 / masterGain 汇入 / 音量·静音联动 / startBgm/stopBgm/isBgmPlaying / dispose 无泄漏）落盘供追溯，并升 TECHNICAL 版本标注 v2.5。
> 2. **模块 VERSION 升版裁定（OBS-BGM-2，非阻断）**：BGM 为 v2.5 行为新增但三模块 VERSION 仍 '2.3.0'。验收裁定不阻断本次交付；是否统一升为 '2.5.0' 以对齐 PRD 版本由产品经理在下一文档动作一并决定（verify-constants 三模块一致基线不变）。
> 3. **BGM 人工补测 B1~B9（环境限制非缺陷）**：开启 ≤500ms 可闻（AC-15.3）、循环连续 ≥60s（AC-15.5）、关闭 ≤300ms 无拖尾（AC-15.4）、音量/静音联动听测（AC-15.8/15.9）、自动播放合规 Console 0（AC-15.10）、双分辨率无错位（AC-15.1）、开关读屏可访问（AC-15.14）、状态保持/刷新重置（AC-15.13）、性能 FPS≥55（AC-15.12），见 QA-REPORT §4。

> **✅ 文档标点热修已交付（产品验收 2026-08-16 ✅ 通过）**：README.md 第 37 行 `暂停 / 继续` → `暂停、继续`（斜杠改顿号），assembly-check 全绿，零代码改动。已关闭。
> **✅ 文档全角空格热修已关闭（产品验收 2026-08-16 ✅ 通过，需求与实际不符）**：README.md 第 37 行「暂停、继续」之间无全角空格（U+3000），仅含 U+3001 顿号；三层 Unicode 验证确认，assembly-check 全绿，零代码改动。需求 req-7 已关闭（tf-msy4l38m-lr5fod）。
> **🔁 文档全角空格热修复核验收（产品验收 2026-08-16 📝 需求不适用，复核 run）**：逐码位核对 README 第 37 行（`暂U+6682 停U+505C 、U+3001 继U+7EE7 续U+7EED`）+ 全文 U+3000 计数 = 0，确认「多余全角空格」不存在；开发未做改动（不臆造），QA 独立档跳过；关闭需求，无代码变更。
> **🔁 最终复核验收（产品验收 2026-08-16 📝 需求不适用，最终复核 run）**：对照确认单字节级复验（该行 `、`=U+3001、全文 U+3000=0），结论与此前一致——需求与实际不符，无需改动；开发/QA/验收均未臆造改动，五套基线全绿；需求正式关闭，关闭项不再列入待办。

- **P2 增强**（本期未做）：~~7-bag 随机~~ → **v2.7 进行中（PRD 已交付，待开发实现）**；最高分本地持久化（v2.6 已交付，见上方当前迭代记忆）；触屏操作、音量/静音本地持久化、消行动画缓动。（~~幽灵块（落点预览）~~ → **v2.2 已交付**；~~背景音乐（BGM）~~ → **v2.5 已交付，见上方当前迭代记忆**）
- **人工补测（v2.2 验收新增，QA-REPORT §6，环境限制非缺陷）**：幽灵块在暗色玻璃基调下可辨识度（透明度 0.16/0.75、线宽 2、色相）；旋转后复杂形状（I/S/Z）落点目测；1920×1080 与 1366×768 双分辨率无错位；与其他块体相邻时边界可辨识；刷新及时性/FPS≥55（AC-12.8/12.11）。
- **人工补测（v2.3 验收新增，QA-REPORT §6，环境限制非缺陷）**：幽灵块开关可访问性（Tab 聚焦、aria-label、状态不只靠颜色）；硬降计分规则正确性（硬降不加分、消行计分符合公式）；开关回合中切换即时生效（≤100ms）；开关状态会话内保持、刷新恢复默认。
- **人工补测**（v2.1/v2.0 遗留，QA-REPORT §6）：快捷键时序、音效听感/时序/性能、自动播放、双分辨率布局、离线多浏览器、读屏等项待完成。
- **测试增强（P3 建议）**：E2E 补 AC-09.6 显式断言（首次交互后 AudioContext `resume` 调用次数 = 1）；`#btn-mute` 静音态 `aria-label` 动态切换为「取消静音」。
- **OBS-12-1（P3，文档-实现对齐）→ ✅ 已关闭 2026-08-18（v2.4）**：TECHNICAL §6.2 E-12-08 描述的 `ghostY` 非法入参防御已在 `game.js` 实现（`rot%4` 归一含负数归 0–3、未知 `type` 回退原样返回 `piece.y`、`piece === null` 返回哨兵 `-1`，均不抛错）；verify-game 补 E-12-08 用例（51→52）全绿；TECHNICAL §6.2 标注已实现（AC-12.12）。
- **OBS-12-2（P3 观察，新增 2026-08-18 产品验收，非阻断）**：`ghostY(board, {type:'I', rot: NaN/3.5/undefined})` 时 `((rot%4)+4)%4` 归一不收敛（对 NaN/小数/undefined 归不到 0–3），索引 `SHAPES[type][非整数]` 为 `undefined` → `collides` 抛 `Cannot read properties of undefined`。**超出 E-12-08/AC-12.12 已知整数 rot（-1/4/5/100）验收范围**，合法流程 `rot` 恒整数 0–3，不构成 P0/P1/P2 缺陷。建议下一健壮性迭代在归一前追加 `Math.trunc`/`Number.isInteger` 校验（P3 可选）。
- **OBS-TC-1（P3，文档口径偏差，✅ 已关闭 2026-08-18）**：`changes.md` §8 维护记录 + `AGENTS.md` §4 已更正为 **51/19/7/装配/188**（v2.3 计数：game 51、ui 7、E2E 主 178 + file:// 10）；v2.2-tc 历史快照表（§5）为已验收存档，保留原口径不作改动。
- **OBS-无（v2.3.1 视觉微调，2026-08-18）**：方块辉光收敛（`shadowBlur` 10→5、光晕浓度 0.55），DESIGN §5.2/版本升 v2.3.1；无遗留待办，AC-07 仍满足。

## 当前迭代记忆（v2.6 持久化层 · tech 技术变更单）

> **✅ 产品验收通过（2026-08-18，tf-mt317a5e-0iwvuy，P1 打回后人工修复复验）**：P1 缺陷 BUG-P1-1——`persist.js` `createStorage` 适配器 API 漂移（探测 `setItem/getItem/removeItem`、读写 `store.set/get/remove`，真实浏览器读写被静默吞掉）在人工修复后关闭：`toStorageAdapter` 归一化 + verify-persist 真实形状对抗用例（10→11 全绿），六套既有 + verify-persist 复跑全绿。详见上方「待办」关闭项与 `docs/teamflow/qa/QA-REPORT.md`。

- **目标版本**：v2.6（进行中）
- **变更单性质**：技术驱动改造（tech），对齐 PRD v2.6 增量（AC-16 最高分持久化 + AC-10.5 音量/静音持久化），**不新增/不修改 PRD 功能 AC**。
- **实现要点（T1~T6，按蓝图装配序）**：新增 `persist.js`（UMD `window.TetrisPersist` + `module.exports`，工厂 + 闭包；`createStorage` 做 localStorage 能力探测 try/set/remove→catch→available=false，失败/损坏 → 内存 `Map` 优雅降级、绝不 throw；`createPersistence().load/saveHighScore/saveSettings/dispose`，单键带版本 JSON 承载、坏 JSON 清键回默认；纯函数 `sanitize(value,schema)` 对 highScore `Math.max(0,floor(+v))`、四设置布尔白名单）；`scripts/verify-persist.cjs`（node:test：键往返/available=false 降级/坏 JSON 清键/highScore+四设置 sanitize 边界/只增不减/dispose 后不写）；`index.html` 在 audio.js 前加 `<script src="./persist.js">`、内联装配改 `createUI({ persist: window.TetrisPersist?.createPersistence() })`（persist 缺失即旧版、向后兼容）；`ui.js` createUI 以可选 persist 依赖接入——启动 `persist.load()` 恢复四设置并回填 HUD 最高分、onSnapshot 只增不减写回 highScore、设置变更 saveSettings、dispose 链加 persist.dispose()（持久化仅旁观，不新增第三设置变更入口，settings 状态仍在 ui.js 闭包 + audioPanel.sync）；`scripts/assembly-check.cjs` 增 persist 导出面/脚本序/自包含/HUD 最高分钩子；`scripts/verify-constants.cjs` 若三模块升 '2.6.0' 则同步 EXPECTED_VERSION（OBS-BGM-2 遗留一次性裁定）；TECHNICAL 修订记录补 v2.6 一行。
- **用户可见变化（显式声明）**：刷新后 HUD 最高分恢复（只增不减）+ 音量/静音/幽灵/BGM 四设置恢复；存储不可用时行为等同旧版。
- **退出标准**：六套既有验证全绿（52/23/7/2/装配ALL/188，不加后门）+ 新增 verify-persist 全绿 + assembly-check 含 persist 自包含。
- **关键风险**：持久化能力探测/sanitize 收敛 persist.js 单一事实来源（ui.js 只消费 load/save*，杜绝直接 setItem/getItem）；存储键对齐变更单（`tetris.highScore/volume/muted/ghostEnabled/bgmEnabled`），AC-16/AC-10.5 由 PRD v2.6 增量管理、dev 不臆造 PRD AC；VERSION 漂移（OBS-BGM-2 遗留，三模块仍 2.3.0）升 '2.6.0' 需三模块 + verify-constants 一次同步。
- **变更单位置**：`docs/teamflow/technical/changes-persist.md`。

## 当前迭代记忆（v2.7，7-bag 随机算法）

> **✅ 产品验收通过（2026-08-18，tf-mt417ope-hbxksi）**：七套验证全绿（55/23/7/2/ALL/11/188），AC-17 六项验收标准全部通过，AC-01~16 回归全绿，无 P0/P1/P2 缺陷；架构核验无偏离蓝图/无重复实现/无破坏既有结构。

- **目标版本**：v2.7（✅ 已验收）
- **需求摘要**：7-bag 随机算法（AC-17，P2 增强）——替换均匀随机队列为标准 Tetris 7-bag 算法：每 7 块为一轮（"袋"），先将全部 7 种方块（I/O/T/S/Z/J/L）放入袋中并用 Fisher-Yates 洗牌随机排列，依次发完后再创建新袋，确保每 7 块中每种方块恰好出现一次、避免连续出现相同方块。
- **交付结论（P-1.1 + P-1.2 + P-2）**：
  1. **P-1.1 game.js createQueue 替换为 7-bag 实现**：`shuffle(newBag)` 辅助函数 + `bag`/`idx` 闭包状态 + `peek` 延迟创建 + `next` 袋空补新袋；保留 `rng` 可注入接口；接口签名 `createQueue(rng)` 不变，返回 `{ peek(), next() }` 结构不变，调用方（`start`/`restart`）零改动。
  2. **P-1.2 verify-game.cjs 补充 7-bag 契约用例**：每袋包含全部7 型各 1 次（bagCompleteness）、袋内随机排列（bagShuffle）、连续两袋无重叠顺序（consecutiveBagsNonOverlap）+ 调整既有 createQueue 用例。
  3. **P-2 回归验收**：七套验证全绿（verify-game 55/55、verify-audio 23/23、verify-ui 7/7、verify-constants 2/2、assembly-check ALL PASSED、verify-persist 11/11、qa-e2e-jsdom 188/188）；AC-01~17 回归全绿。
- **QA E2E 兼容修复（P-2 附带）**：`qa-e2e-jsdom.cjs` 修复 4 处 7-bag 兼容断言——AC-01.3 首块出生不再硬编码 'I' 型（改为按实际类型计算居中 x）；AC-02.1 DAS 右墙位置按实际块宽计算（I→6、O→8、3 宽→7）；消行后新块出生不再断言 `type === 'I'`；AC-12.3 旋转幽灵落点跳过 O 型（旋转不变形）。
- **用户可见变化（显式声明）**：方块出现顺序从均匀随机变为 7-bag 算法——玩家感知：不再连续出现相同方块，方块分布更公平。
- **退出标准**：七套验证全绿（55/23/7/2/ALL/11/188）+ AC-01~17 回归全绿 = ✅ 已达成。
- **产品验收结论（2026-08-18）**：七套验证全绿，AC-17 六项全通过，AC-01~16 回归全绿；架构核验无 P1 缺陷（模块边界/接口契约/数值单一事实源/依赖方向/重复实现/破坏既有结构/dispose 清理均通过）；无 P0/P1/P2 缺陷；遗留人工补测 7 项（环境限制）+ 待办 3 项（BGM 契约/VERSION 升版/BGM 补测，非阻断）。
- **关键风险**：变更面仅 `createQueue` 函数内部实现，不触碰其他模块；Fisher-Yates 洗牌实现需标准算法 + 确定性 `rng` 注入测试验证（verify-game 7-bag 契约已覆盖）。

## 当前迭代记忆（v2.8，无踢墙旋转系统）

> **✅ 已交付（2026-08-18 产品验收通过，tf-mt5afdch-7xyajm）**：七套验证全绿（58/23/7/1/ALL/11/188），AC-18 七项全部通过，AC-01~17 回归全绿，无 P0/P1/P2 缺陷；架构核验无偏离。

- **目标版本**：v2.8（✅ 已验收）
- **需求摘要**：无踢墙旋转系统（AC-18，P1）——固定旋转逻辑为"单点旋转，无踢墙"：旋转碰撞时方块保持原位（x/y/rot 不变），不尝试左移/右移/上移等踢墙偏移；返回 `reason: 'wall-kick-denied'` 区分语义。
- **交付要点**：
  1. **rotate reason 优化**：`game.js` rotate 函数碰撞返回 `reason: 'wall-kick-denied'`（替代原 `'blocked'`），显式声明无踢墙行为。
  2. **verify-game 旋转边界用例**：补旋转碰撞保持原位（x/y/rot 不变）、左墙/右墙/已固定方块旋转碰撞用例。
  3. **回归底线 AC-01 ~ AC-17 全绿**，七套验证全绿。
- **用户可见变化（显式声明）**：旋转碰撞时方块保持原位，不尝试踢墙偏移——玩家感知：旋转行为更简单可预测（无"突然滑移"）。
- **退出标准**：七套验证全绿 + AC-01~18 回归全绿 = ✅ 已达成。
- **关键风险**：变更面极小（仅 reason 字段 + 测试用例），回归风险低。
- **技术方案已交付**：`docs/teamflow/technical/TECHNICAL.md` 已更新为 v2.8 版本，包含接口契约、实现要点、测试策略与任务拆分。
- **QA 复核通过**：七套验证全绿，AC-18 七项全部通过，无缺陷，达到可验收标准。
