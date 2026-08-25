# 产品验收报告（r13 · 消行动画缓动）

- **验收人**：产品经理（验收负责人）
- **验收对象**：消行动画缓动交付（开发提交 bf57fd4/38a9305/4a888b9，QA 报告 541bd69；当前已合入 `main`，HEAD `a2fb00c`，工作树干净）
- **验收依据**：本夹 `PRD.md`（AC-1~AC-10 唯一验收依据）；基线依赖 20260825-r12（弹层自动暂停协同）
- **取代声明核验**：「消行即时消除」时序（活文档 AC-03/E3）为行为变化点，PRD §1.2/§3 显式声明「取代」，无任务夹 AC 锚点可引——符合 ADR-0008 文档边界，未虚构引用 ✅

## 一、验收结论

**✅ 通过**

AC-1~AC-10 逐条成立；最终提交态七套复跑全绿（验收本人复跑确认，退出码全 0）：verify-game **74/74**、verify-ui **12/12**、verify-audio **23/23**、verify-persist **11/11**、verify-constants **2/2**、assembly-check **ALL PASSED**、qa-e2e-jsdom **248/248**（237 基线零回归 + 11 新动画段）；M3 架构门禁通过，无返工项。

## 二、AC 逐条检查表

| AC | 验收点 | 证据 | 结果 |
|---|---|---|---|
| AC-1 P0 | 1~4 行同步脉冲、ease-out-quart 1→1.25→0、T=240±80、cleared=0 零动画、其余格静止 | `game.js` L517-520 满行才进 clearing（indices 全行）；`ui.js` L106-126 `ANIM_MS=240/ANIM_PEAK=1.25/ANIM_PEAK_T=0.40/pulseBrightness`；渲染仅遍历动画行 L381-383；verify-game ①、verify-ui 包络（端点/峰值/值域/单调性） | ✅ |
| AC-2 P0 | 动画结束塌缩逐格等价、只平移时序不改几何 | `lockFlow` 预计算 `clearLines` 结果复用（L513/534）；verify-game ③「完结=clearLines(merged) 逐格一致」+ 对抗抽查 2/3 行等价 | ✅ |
| AC-3 P0 | 计分/行数/等级/sfx 恰1次/7-bag 零副作用；LEVEL UP 动画后触发 | `finishLock` 双路径共享唯一实现（L537-549）；sfx('clear') 首帧（L521）与完结帧 `playClearSfx=false`（L534）互斥恰 1 次；verify-game ③/③b（升级次序） | ✅ |
| AC-4 P0 | 动画期输入全忽略；P/空格/弹层暂停冻结进度并续播 | 四输入统一 `reason:'clearing'` 守卫（L639/655/690/709）；pause 不清 clearing、tick 非 RUNNING 早退（L723）→ elapsed 冻结、续播从同帧继续；qa-e2e 新段含 r12 弹层协同续播 | ✅ |
| AC-5 P0 | 动画期下落时钟冻结，无连降/积压 | tick clearing 分支仅 `elapsed += dt`（L727-732），gravityAcc/lockTimer 零推进；verify-game ⑤ 4×250 无连降 | ✅ |
| AC-6 P1 | 出生碰撞 OVER 在动画完整播放后呈现，OVER 清动画状态 | OVER 判定在 `finishLock` spawnCollides（L555-564），仅经 `completeClearing` 达；`lose()` L770 / restart L609 清空 clearing；verify-game ⑦ | ✅ |
| AC-7 P0 | reduced-motion/animMs=0 与即时消除逐点等价 | `animMs>0` 门（L517）→ 0 直走即时 finishLock；`createUI` 显式 > matchMedia 降级 > 默认（L858-860）；verify-game ④（0ms 与 240 步进逐点等价）+ ⑧ | ✅ |
| AC-8 P1 | 仅≤4 行 Canvas alpha/亮度重绘、每格≤2 基元、不动画 box-shadow/filter、无 DOM 逐帧 | `ui.js` L380-404（烘焙 sprite + 白热叠加 / 整体渐隐）；style/index 零改动；动画期 piece=null 无活动块绘制；FPS≥55 实测留人工 M5（环境限制） | ✅* |
| AC-9 P0 | animMs 构造参数（默认240/0=即时）+ tick(dt) 步进；verify-game 用例组①~⑧；qa-e2e 新段；七套全绿 | `game.js` L469（含非法值兜底）/L722；`mk()` 工厂统一 animMs:0 保既有断言；qa-e2e buildEnv animMs:0 保 237 + 独立 `createUI(animMs:240)` 11 新段；验收复跑 74/23/12/11/2/ALL/248 全绿 | ✅ |
| AC-10 P1 | clearing 子阶段不改对外 phase 枚举与 UMD 签名；快照 additive 字段；暂停中途快照续播 | 动画期不改 `state.phase`（L517-524 仍 RUNNING）；快照附加 `clearedIndices/animProgress`（L482-483，非动画期恒 null）；无新方法/无重签名（verify-constants 2/2 绿，VERSION 未 bump） | ✅ |

*AC-8 的 FPS≥55 实测与 AC-1/AC-7 视觉观感为真实浏览器环境条目，列入人工补测 M1~M6（环境限制，非交付缺陷）。

## 三、M3 架构一致性门禁

- **Blueprint 符合性**：clearing 为引擎唯一时钟/可变点（进度仅 tick 推进，UI 无自有动画计时器）；`lockFlow` 拆分（L511-528）+ `finishLock` 即时/动画双路径**共享唯一实现**（L537-549，无重复维护面）；ui `renderAll` 三分支分发（L1237-1250：动画帧 / 完结帧抑制白闪=取代点 / 既有白闪保留=即时路径等价）逐一代码确认；装配顺序正确（createUI 于 createGame 调用点注入 animMs，L1262-1267）。
- **无重复实现 / 适配漂移**：快照字段 additive（既有消费方零感知）；UMD 契约与 VERSION 不变；audio/persist/style/index 零改动。
- **结论**：不偏离 blueprint、无结构损坏 → **无返工项**。

## 四、遗留与意见

- **QA-13-01（P3，已入 memory.md 待办）**：`game.js` animMs 默认(240)与 `ui.js` ANIM_MS(240) 无跨模块一致性断言；因 ui `createUI` 恒显式传 animMs（L860），风险已钳制；建议后续测试增强轮补跨模块常量断言。**不阻塞验收**。
- **人工补测 M1~M6（环境限制非缺陷，已并入 memory 待办「人工补测汇总」）**：M1 亮度观感（1~4 行同步/ease-out-quart）；M2 完结帧无「事后白闪」双重反馈；M3 动画中途暂停冻结续播；M4 reduced-motion DevTools 降级；M5 动画期 FPS≥55；M6 clear/levelUp/gameOver 真实发声次序。
- **意见**：动画期输入返回 `reason:'clearing'` 为内部枚举（UMD 签名不变、不重签名），TECHNICAL §2 已说明消费方约束，无虞。

## 五、结论

交付严格对齐 PRD AC-1~10 与 TECHNICAL blueprint：动画=纯视觉时延，数值/音效/状态序列零副作用，reduced-motion/0ms 与即时消除逐点等价，r12 弹层协同零回归，出口七套全绿。**验收通过。**

## 附：验收动作记录（本夹）

- 验收本人于最终提交态复跑七套（日志 `logs/teamflow/tf-mt8sdf2z-g6g49x/accept-*.log`），退出码全 0，qa-e2e 248/248 ALL PASSED。
- `memory.md` 本轮无改动：QA-13-01 已由 QA 阶段登记入待办，本需求未引入新约定/待办变更（动效规范沿用 DESIGN P4）。