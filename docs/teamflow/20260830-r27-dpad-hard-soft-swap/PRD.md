<!-- meta: summary="移动端触控十字键上下位功能互换：上=软降、下=硬降，左右横移键与中心 ✛ 装饰不动，TOUCH_KEYS 六值契约零变化、触控=键盘回放器路径零逻辑改动" -->

# PRD · r27：十字键硬降/软降位置互换（上=软降、下=硬降）

**基线依赖**：docs/teamflow/20260829-r26-touchpad-keys-dock-skin（r26 确立的移动端触控区结构与两作用域（竖屏 S dock / 横屏侧轨）、键帽/皮肤/验证契约必须零回归；十字键布局基线源自 docs/teamflow/20260829-r24-touchpad-cross，历史文件夹永不修改）

**取代**：docs/teamflow/20260829-r24-touchpad-cross#AC-1 —— 十字键上下位功能分配互换（上=硬降、下=软降 → 上=软降、下=硬降）；左右横移键与中心 ✛ 装饰保持不动。

---

## 1. 背景与目标

**背景**：r24 起移动端触控区为掌机式布局：左十字方向键（上=硬降、左/右=横移、下=软降、中心 ✛ 装饰不可点）+ 右旋转簇，横屏侧轨同构。用户反馈：硬降在最上方「上面不如下面顺手」——硬降是高频终结性动作，放在手指自然搭放的下位更符合直觉。

**目标**：
1. 十字键上下位功能互换：**上位=软降、下位=硬降**；左右横移与中心 ✛ 装饰完全不改。
2. 换位仅体现在键位（data-action/aria-label/图标/文字标签整体互换），**功能契约零变化**：`.tkey[data-action] ↔ TOUCH_KEYS` 六值映射表逐字不变，触控=键盘回放器路径 0 逻辑改动。
3. 竖屏 S dock、横屏侧轨两个布局作用域同步互换；M/L 行式底栏键序保持现状。
4. 沿用既有红线：game.js / audio.js 0 diff、VERSION 不动、七套验证脚本全绿出口、交互/按压态/safe-area/多指守卫全部承继。

## 2. 用户故事与验收标准

### US-1 掌机直觉：硬降换到下位
作为移动端玩家，我希望十字键下位是硬降、上位是软降，让高频终结动作落在手指最自然的位置。

- **AC-1 [P0] 十字键位互换（两作用域同步）**：竖屏 S dock 与横屏侧轨两个布局作用域中，十字簇上位键语义改为**软降**（data-action=softDrop、aria-label=软降、图标▼、文字「软降」），下位键语义改为**硬降**（data-action=hardDrop、aria-label=硬降、图标⤓、文字「硬降」）；左/右横移键的 data-action、aria-label、图标、文字与 r26 完全一致（零改名零重映射），中心 ✛ 装饰保持 aria-hidden、pointer-events:none、无 data-action、无输入事件。验证：qa-e2e 对两作用域各断言 上=softDrop/下=hardDrop/左右=横移/center 无 data-action，与 r26 快照对比仅上下两键语义字段变化、其余零 diff。
- **AC-2 [P0] 功能映射零变化**：`.tkey[data-action]` ↔ `TOUCH_KEYS` 六值映射表（action 字面量、数量、顺序）与 r26 逐字一致；`TOUCH_KEYS` 常量及 `createTouchControls` 查询/绑定逻辑 0 行改动。互换只体现为 HTML 模板层上下两键的 data-action/aria-label/图标/文字标签整体互换（键帽语义跟随动作）。验证：ui.js 中 TOUCH_KEYS 相关代码 git diff 为零 + verify-ui 键位契约断言全绿。
- **AC-3 [P0] 触控=键盘回放器路径零逻辑改动**：点按互换后按键产生的 action 经回放器合成的键盘指令与互换前逐键等效——上=软降（长按 DAS/软降 repeat 复用既有机制）、下=硬降（落底锁定/计分/onSfx 事件序列一致）；键盘事件合成与分发代码 0 逻辑 diff；PAUSED/OVER 点击无副作用、触摸防滚动/缩放/选中、多指并发互不串扰等 r16 守卫全部承继。验证：qa-e2e 既有触屏仿真用例沿用 + git diff 审查。

### US-2 换位不动其他布局
作为移动端玩家，我希望换位后除了十字上下之外什么都别变。

- **AC-4 [P0] 交互/按压态/safe-area/多指承继**：按压三态（scale 0.94 等）、touch-action:none、safe-area 贴边、多指并发、过渡动效等交互层与 r26 完全一致——本迭代不新增不删除任何交互行为与视觉 token，仅键位语义变化。验证：verify-ui 交互断言全绿 + 人工真机补测项承继（目测两作用域键位/按压态/safe-area/多指）。
- **AC-5 [P0] M/L 行式底栏键序保持现状**：竖屏 M/L 布局行式底栏的键序列、键序、data-action 与 r26 完全一致，不随本次互换改变。验证：qa-e2e / verify-ui 中 M/L 底栏断言零变化全绿。
- **AC-6 [P0] 红线零回归**：game.js / audio.js 0 diff；VERSION 三模块一致且不升版；persist.js 0 diff（本需求不涉及任何持久化键）。验证：verify-game / verify-audio / verify-constants / verify-persist 全绿 + git diff 审查。
- **AC-7 [P0] 验证脚本全绿出口**：verify-ui / qa-e2e 中涉及十字键位顺序与语义的断言同步更新至互换后语义（登记改写处注明取代 r24#AC-1 授权），且七套脚本（verify-game / verify-audio / verify-ui / verify-persist / verify-constants / assembly-check / qa-e2e-jsdom）全部全绿退出；qa-e2e §r27 新增断言覆盖两作用域键位互换。验证：七脚本执行退出码 0。
- **AC-8 [P1] 可访问性持续**：互换后上下键 aria-label 语义正确（上=「软降」、下=「硬降」），✛ 装饰不入读屏、不产生任何输入/回放事件，读屏顺序与键位语义对应。验证：qa-e2e 读屏断言 + 人工读屏抽查承继。

## 3. 范围与非目标

**范围内**：十字键上下位功能互换（两作用域）；上下键键帽语义（data-action/aria-label/图标/文字）整体互换；verify-ui / qa-e2e 相关断言同步；七套验证全绿。

**非目标**：不改 TOUCH_KEYS 六值映射表与回放器逻辑（AC-2/AC-3）；不改左右横移键、中心 ✛ 装饰、右旋转簇（Hold/旋转）；不改 M/L 行式底栏键序；不改任何键尺寸/间距/皮肤/背景方案；不改引擎数值、音效、持久化键；不升 VERSION；不新增视觉 token 或交互行为。

## 4. 交互流程摘要

1. 竖屏 S dock 与横屏侧轨的十字簇仅互换上下位键帽语义，其余键位物理位置与视觉零变化。
2. 用户点按十字上位键 → data-action=softDrop → 回放器合成软降键盘指令 → 既有 soft drop repeat 路径；点按下位键 → data-action=hardDrop → 硬降落底锁定/计分/onSfx 序列。
3. 按压三态、touch-action、safe-area、多指并发守卫均沿用 r26，无新增路径；M/L 底栏与桌面行为零变化。

## 5. 优先级

- **P0**：AC-1 ~ AC-7（换位正确性、契约零变化、两作用域同步、断言同步、红线回归、全绿出口）。
- **P1**：AC-8（读屏语义，随 AC-1 同步实现，测试兜底）。

## 6. 依赖与风险

**依赖**：基线依赖 r26 任务夹（触控区结构/皮肤/验证契约），十字键位原始规格依赖 r24#AC-1；无外部依赖；需要 index.html 触屏模板与 verify-ui / qa-e2e 两脚本的协同改动。

**风险**：
- **断言漂移（高）**：verify-ui / qa-e2e 中以上下键序（text/顺序）为锚的既有断言，换位后必然红——必须作为登记改写同步更新（参照 r26 惯例 verify-ui 唯一 1 处登记改写并注明取代来源），漏改即 AC-7 不成立。
- **误触映射表（高）**：若实现时误改 TOUCH_KEYS 或 createTouchControls 查询逻辑，将违反 AC-2/AC-3 红线——列为 git diff 审查必检项。
- **侧轨漏改（中）**：横屏侧轨与 S dock 十字分散于两模板，漏改一侧即违反 AC-1——qa-e2e 双作用域断言兜底。
- **键帽视觉与动作脱节（中）**：若只换 data-action 不换图标/aria-label/文字，将出现「上位显示硬降图标却执行软降」——AC-1 明确规定五字段整体互换、人工目测复核。

## 7. 里程碑建议

- **M1 换位实现**：index.html 中 S dock 与横屏侧轨两作用域的上下键 data-action/aria-label/图标/文字标签整体互换；左右横移、中心 ✛、右旋转簇、M/L 底栏零改动。
- **M2 断言同步**：verify-ui / qa-e2e 涉及十字键位顺序与语义的断言更新为互换后语义（登记改写注明取代 r24#AC-1），qa-e2e 增补 §r27 双作用域断言。
- **M3 全量验证**：七套脚本全绿退出；git diff 审查 game.js/audio.js/VERSION/ui.js/persist.js 0 行逻辑改动。
- **M4 人工补测 + 交付**：真机目测两作用域键位/按压态/safe-area/多指/读屏；main 全绿同批提交（含本任务夹全部产物）。

## 8. 工程约束（原文承继）

1. **互换后功能映射零变化**：触屏键位互换后功能映射（`.tkey[data-action]` ↔ `TOUCH_KEYS` 六值）零变化、触控=键盘回放器路径零逻辑改动——互换只落在 HTML 模板层上下键语义字段（AC-2/AC-3）。
2. **两作用域同步互换**：竖屏 S dock、横屏侧轨两个布局作用域的十字键位同步互换（AC-1）。
3. **M/L 行式底栏键序保持现状**（AC-5）。
4. **断言同步**：verify-ui / qa-e2e 中涉及十字键位顺序的断言同步更新至全绿（AC-7）。
5. **红线承继**：约束沿用现有红线——game.js / audio.js 0 diff、VERSION 不动、七套验证脚本全绿出口、交互/按压态/safe-area/多指守卫全部承继（AC-4/AC-6）。
6. **分支与工作区处理**：当前分支 main；未提交改动仅为本任务夹本身（`?? docs/teamflow/20260830-r27-dpad-hard-soft-swap/`，即本需求产物夹，非游离改动）——沿用产品迭代惯例在 main 上实施并随交付同批提交（历史参考 r26「main 全绿同批提交」）；不另行指定建分支动作。

---

<!-- state -->{"phase":"prd","summary":"r27 PRD 已交付：十字键上下位功能互换（上=硬降/下=软降 → 上=软降/下=硬降），取代 r24#AC-1；互换仅落 index.html 模板层上下键五字段（data-action/aria-label/图标/文字）整体互换，TOUCH_KEYS 六值映射表与回放器 0 逻辑改动，左右横移/中心✛/右旋转簇/M-L 底栏全不动；竖屏 S dock 与横屏侧轨两作用域同步互换；AC-1~8（P0×7/P1×1），verify-ui/qa-e2e 十字键位断言登记改写至全绿，七套脚本全绿出口；红线 game.js/audio.js 0 diff、VERSION 不动、persist.js 0 diff、交互/按压态/safe-area/多指守卫全承继；main 工作区仅任务夹未提交随交付同批提交；memory.md 未动（无新约定）","memory":["r27 触控区十字键换位规格：上位=软降(softDrop/▼/「软降」)、下位=硬降(hardDrop/⤓/「硬降」)，左右横移与中心✛装饰不动，右旋转簇/M-L底栏不动","取代 r24#AC-1 十字上下位分配；互换=HTML模板层上下键 data-action/aria-label/图标/文字标签整体互换，TOUCH_KEYS 六值映射表与 createTouchControls/回放器路径 0 逻辑改动(AC-2/AC-3)","两作用域（竖屏 S dock + 横屏侧轨）键位同步互换；M/L 行式底栏键序保持现状；verify-ui 键序断言登记改写（注明取代 r24#AC-1）+ qa-e2e §r27 双作用域断言","红线：game.js/audio.js 0 diff、VERSION 不动、persist.js 0 diff、七套验证脚本（verify-game/audio/ui/persist/constants/assembly/qa-e2e-jsdom）全绿出口、交互/按压态/safe-area/多指守卫承继，main 同批提交含任务夹"]}<!-- /state -->