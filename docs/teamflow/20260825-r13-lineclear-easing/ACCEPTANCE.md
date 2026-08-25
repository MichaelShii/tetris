# 产品验收报告（r13 · 消行动画缓动）

- **验收人**：产品经理（验收负责人）
- **验收对象**：分支 `feat/lineclear-easing`（基于含 `769a50c` 的 main，3 开发提交 + QA 报告 `541bd69`，工作树干净）
- **验收依据**：`docs/teamflow/20260825-r13-lineclear-easing/PRD.md`（AC-1~AC-10）；基线依赖 20260825-r12（弹层自动暂停协同）
- **取代声明核验**：「消行即时消除」时序（活文档 AC-03/E3）为行为变化点，PRD §1.2/§3 显式声明「取代」，无任务夹 AC 锚点可引用 —— 符合文档边界，未虚构引用

## 一、验收结论

**✅ 通过**

AC-1~AC-10 逐条成立；既有 AC-01~19 与 r12 弹层段 237 断言零回归；七套验证全绿（验收本人于最终提交态复跑确认：verify-game/verify-ui/verify-audio/verify-persist/verify-constants/assembly-check 退出码全 0，qa-e2e **248/248** PASS）。M3 架构门禁通过：clearing 子阶段按蓝图落为引擎唯一时钟/可变点，即时/动画双路径共享唯一 `finishLock`（无重复实现），ui 三分支分发（动画帧 / 完结帧抑制白闪取代点 / 既有白闪保留）结构完好，无既有结构损坏。

## 二、逐条验收表（AC-1 ~ AC-10）

| AC | 验收点（摘要） | 证据 | 结果 |
|---|---|---|---|
| AC-1 (P0) | 1~4 行同步亮度脉冲 1→1.25→0、ease-out-quart、T=240±80、cleared=0 零动画、未消除行静止 | game.js `animMs` 默认 240/非法兜底 240；ui `ANIM_MS=240 / ANIM_PEAK=1.25 / ANIM_PEAK_T=0.40` + `pulseBrightness`（渐亮增量单调递减，可数值断言）；verify-ui 12/12（端点/峰值/值域/单调性） | ✅ |
| AC-2 (P0) | 动画结束塌缩逐格等价（只平移时序、不改变几何） | `finishLock` 共享闭包唯一实现，`completeClearing` 完结帧执行原原子步（塌缩→计分→spawn）；verify-game ③/③b 完结棋盘=clearLines 逐格一致；对抗抽查 2/3 行等价 | ✅ |
| AC-3 (P0) | 计分/行数/等级/音效恰 1 次/7-bag 零副作用 | 双路径共享 `finishLock`（仅 clear 时机相异）；`sfx('clear')` 动画首帧恰 1 次（1~4 行均 1 次）；LEVEL UP 动画结束后触发；verify-game ③ 断言 clear 恰 1 次 + 升级次序 | ✅ |
| AC-4 (P0) | 动画期输入全忽略；P/空格/弹层暂停冻结进度并续播 | move/rotate/softDrop/hardDrop 动画期一律 `{ok:false, reason:'clearing'}`（不排队不发声）；暂停快照含 `animProgress` 定格→续播（ui PAUSED 冻结帧）；qa-e2e 新段 r12 弹层自动暂停协同续播 | ✅ |
| AC-5 (P0) | 下落时钟冻结（dt 不累计、无连降、不悄悄积压） | tick 动画期仅累计 `clearing.elapsed`，gravity/lockTimer 冻结；verify-game ⑤ 4×250 步进无连降 | ✅ |
| AC-6 (P1) | 出生碰撞 OVER 在动画结束后呈现、无残留亮度帧 | verify-game ⑦ 完结帧才 OVER + restart/lose 强制清空 `state.clearing`（防残留） | ✅ |
| AC-7 (P0) | reduced-motion/0ms 与即时基线逐点等价 | `animMs=0` 直走 `finishLock(board, cleared, true)` 即时路径；`prefersReducedMotion()`→0；verify-game ④ 0ms 与 240 步进逐点等价；即时路径白闪保留=现状等价 | ✅ |
| AC-8 (P1) | 仅 ≤4 行 Canvas alpha/亮度重绘、不动画 box-shadow、FPS≥55 | ui 动画帧每格 ≤2 基元（烘焙 sprite+白热叠加/整体渐隐）、静态遍历跳过动画行、无 DOM 逐帧更新；FPS 红线条目待人工补测 M5 | ✅* |
| AC-9 (P0) | animMs 构造参数（默认 240/0=立即/非法兜底）+ tick 差值时钟步进 + 用例组 + 七套出口 | `createGame({animMs})`（0 为正规配置）；verify-game 新增用例 ①~⑧（动画棋盘/输入拒绝/完结等价/0ms 等价/时钟冻结/暂停续播/OVER 顺序/默认值）；qa-e2e 新段 11 项（animMs:240 独立 createUI 绕过 jsdom 时序）；验收复跑七套全绿（74/23/12/11/2/ALL/248） | ✅ |
| AC-10 (P1) | clearing 子阶段不改对外 phase 枚举与 UMD 签名；快照附加字段播报 | 动画期 `getPhase()` 仍 RUNNING；快照 additive `clearedIndices/animProgress`（非动画期恒 null），既有消费方零感知；verify-constants 2/2（VERSION 未 bump，无重签名） | ✅ |

*AC-8 FPS≥55 与 AC-1/AC-7 视觉观感为真实浏览器环境条目，列入人工补测 M1~M6（环境限制，非交付缺陷）。

## 三、M3 架构一致性检查（质量门禁）

- **蓝图符合度**：clearing 子阶段为引擎唯一时钟/可变点（tick 单点推进 `clearing.elapsed`）；即时/动画两路径共享唯一 `finishLock` 闭包——**无重复实现**（消行逻辑只有一份，仅 clear 时机参数相异）；ui 三分支分发含「完结帧 `justFinished` 抑制事后白闪」取代点，与蓝图意图一致。
- **既有结构完整**：即时路径（cleared=0 / animMs=0）与现状逐点等价（既有白闪保留）；装配顺序（createUI 置于装配脚本前、透传 animMs）与 UMD 导出契约（`ANIM_*` 常量 + `pulseBrightness` 附加导出，无重签名）未破坏既有消费方。
- **结论依据**：非仅凭「验证全绿」——结构断言由代码证据（finishLock/clearing/tick/三分支逐一确认）+ QA 架构轻检（M3 门禁）双确认。未发现 duplicated implementation / adapter drift。

## 四、遗留与意见

- **QA-13-01（P3 观察）**：game.js `animMs` 默认 240 与 ui.js `ANIM_MS=240` 无跨模块一致性断言（对比 VERSION 有 verify-constants）。因 ui `createUI` 恒显式传 animMs，风险已钳制；已登记 memory.md 已知待办，建议后续测试增强轮统一补跨模块常量一致性断言。**不影响本次通过。**
- **人工补测清单 M1~M6**（环境限制非缺陷，与 memory.md「人工补测汇总」待办合并执行）：M1 亮度脉冲观感（1~4 行同步）；M2 完结帧无「事后白闪」双重反馈；M3 动画中途 P/空格/Esc/弹层暂停冻结续播；M4 reduced-motion DevTools 模拟降级；M5 FPS≥55（DevTools Performance）；M6 clear/levelUp/gameOver 真实发声次序。
- **意见**：动效规格沿用 DESIGN P4 既有约定、无新技术栈，memory.md 不需要新增约定行，本次仅登记 QA-13-01 待办条目。本需求为真实功能改动（即时消除→动画时序），dev/QA 均有实质产出，**不适用「📝 需求不适用」判定**。

<!-- state -->{"phase":"acceptance","summary":"r13 验收通过（accepted）：AC-1~AC-10 逐条成立，七套复跑全绿(74/23/12/11/2/ALL/248，qa-e2e 248/248 含 237 基线零回归+11 新段)，M3 架构门禁通过（clearing 唯一时钟/finishLock 双路径共享无重复实现/ui 三分支白闪取代点），取代声明(活文档 AC-03/E3 即时时序)合规；遗留=QA-13-01 P3 跨模块 animMs 一致性断言(已入 memory 待办)+人工补测 M1~M6(环境限制非缺陷)；ACCEPTANCE.md 已写入任务夹","verdict":"accepted","extra":{"done":true}}<!-- /state -->