<!-- meta: summary="r27 技术方案：互换只落 index.html 模板层上下两键五字段（整按钮交换），ui.js TOUCH_KEYS 六值表与 createTouchControls 0 行改动；单模板三作用域（S dock/横屏侧轨由 CSS 重排共享 DOM）→ 两作用域同步由构造保证；M/L 行式底栏视觉键序经基座 4 条 order 规则冻结回 r26（S/横屏 nth-child 显式 grid-area 落位不受 order 影响）；verify-ui 653/769 两处键序断言登记改写（取代 r24#AC-1）+ 新 r27 段；qa-e2e §r27 十字簇五字段有序断言 + 共享 DOM 恒等断言；红线 game/audio/persist/ui.js 0 diff、VERSION 不动；T1∥T2→T3∥T4→T5，main 全绿同批提交" -->

# TECHNICAL.md · r27：十字键硬降/软降位置互换（上=软降、下=硬降）

**基线依赖**：docs/teamflow/20260829-r26-touchpad-keys-dock-skin（触控区结构/键帽质感/皮肤/验证契约零回归）
**取代**：docs/teamflow/20260829-r24-touchpad-cross#AC-1（十字键上下位功能分配：上=硬降/下=软降 → 上=软降/下=硬降）
**上层文档**：同夹 PRD.md（AC-1~AC-8）

---

## 1. 方案结论（一句话）

互换只落在 `index.html` 模板层上下两键的**五字段整体互换**（data-action/aria-label/图标/文字标签，整按钮交换）；`ui.js` 的 `TOUCH_KEYS` 六值映射表与 `createTouchControls` **0 行改动**；M/L 行式底栏的视觉键序经 `style.css` 基座 **4 条 order 规则**冻结回 r26（AC-5）；verify-ui 两处键序断言登记改写（注明取代 r24#AC-1）+ qa-e2e §r27 双作用域五字段断言；红线 game.js/audio.js/persist.js/ui.js 0 diff、VERSION 不动，七套脚本全绿出口，main 全绿同批提交（含本任务夹）。

## 2. 现状核查（先于设计的事实，行号锚点）

| # | 事实 | 证据与推论 |
|---|---|---|
| F1 | **单模板三作用域**：index.html 仅一份 `#touch-controls` 触控区模板（113–133 行，六 `.tkey[data-action]` + ✛ hub）；竖屏 S dock / 横屏侧轨 / M/L 行式底栏均由 CSS 重排**同一 DOM**（style.css 1313 横屏门控块、1610 内 S 竖屏块、1058 基座行式栏） | **AC-1「两作用域同步互换」由单模板构造保证**——模板改一处即三作用域同改，不存在「漏改一侧」；PRD 风险「两模板分散」在事实层面不成立 |
| F2 | **交叉簇落位为 nth-child 显式**：S 竖屏块 `.tpad-cross .tkey:nth-child(1..4) → grid-area up/lf/rt/dn`（1754–1757）；横屏侧轨块同构（1379–1382）；基座/M-L 为 flex 行按 DOM 源序显示（1058–1066） | 源序即网格槽位即行式栏显示序；显式 grid-area 放置不受 CSS `order` 影响（见 D-2） |
| F3 | **契约锚点**：ui.js `TOUCH_KEYS` 六值表（1062–1069）action 字面量 ↔ index.html `.tkey[data-action]` 六值一一对应；`createTouchControls`（1121+）按 data-action 定向 `querySelector` 绑定，**与键物理位置无关** | 键帽换位不影响回放器路径（AC-2/AC-3 由构造保证）；ui.js 0 diff 即可交付 |
| F4 | **断言热区（换位后必红的既有断言）**：verify-ui.cjs **653 行**（十字簇源序 `['hardDrop','moveLeft','moveRight','softDrop']`）与 **769 行**（左轨键序同值）；其余均为集合型（644/645、qa-e2e 1655–1660、2377–2379 排序去冗）或 data-action 锚定（qa-e2e `tp.*`/`btn()`，1374 起） | 仅 653/769 两处需登记改写（AC-7 正是为此设计），其余自动保持全绿 |
| F5 | **style.css 无任何 `[data-action]` 选择器**；M/L 媒体块（1954–1993）不触碰 `.touchpad`/`.tpad-cross` | order 冻结规则可安全落在基座区块，零既有断言冲突 |

## 3. 设计决策（裁定）

### D-1 互换实现 = 模板层整按钮交换
将 index.html **118 行（上键，现 hardDrop/硬降/⤓/硬降）与 121 行（下键，现 softDrop/软降/▼/软降）两个 `<button>` 元素整体互换**（五字段随元素走，type/class 等其余属性亦随行）。结果 `.tpad-cross` 源序：`[softDrop, moveLeft, moveRight, hardDrop, hub]`（上=软降 ▼「软降」、下=硬降 ⤓「硬降」，nth-child 落位自动跟随 → S/横屏网格上/下位即互换后语义）。左右键、hub、右旋转簇、M/L 行式栏结构均逐字节不动。
- **为何整元素而非字段级互换**：五字段+class 随元素整体迁移，单处编辑、零字段错配面；与 F4 新源序断言（先写后验）天然一致。
- **为何不动 TOUCH_KEYS**：它按 `data-action` 字面量契约锚定（F3），换位不改变动作语义；任何改动都会击穿 AC-2/AC-7 红线。

### D-2 M/L 行式底栏冻结 = 基座 4 条 order 规则（AC-5 唯一可行路径）
因单模板共享（F1），源序互换必然改变行式栏 DOM 序；而 S/横屏为 nth-child 显式 grid-area 落位（F2）——**CSS Grid 显式放置不受 `order` 影响**。因此在基座行式栏作用域（媒体查询外，紧邻 1058–1066 块）追加：

```css
/* r27（AC-5 裁定 D-2）：M/L 行式底栏（及默认横排、≥600px 横屏门控行式栏）视觉键序冻结回 r26
   （硬降 左 右 软降）。S 竖屏/横屏侧轨为 nth-child 显式 grid-area 落位，order 对其无效，
   故本规则天然只作用于行式栏，无需媒体门控、零新作用域。 */
.touchpad .tpad-cross > .tkey[data-action="hardDrop"]  { order: 1; }
.touchpad .tpad-cross > .tkey[data-action="moveLeft"]  { order: 2; }
.touchpad .tpad-cross > .tkey[data-action="moveRight"] { order: 3; }
.touchpad .tpad-cross > .tkey[data-action="softDrop"]  { order: 4; }
```

- **作用域论证**：四条规则只影响 flex 行式栏（M/L portrait、M/L landscape ≥600px 门控栏、默认档）的显示顺序；S/横屏网格显式放置忽略 order；M/L 媒体块无 `.touchpad` 覆写（F5）→ 无门控需求。
- **红线合规**：不新增视觉 token、不新增交互行为（AC-4 承继）；style.css **不在** AC-6 红线清单（红线为 game.js/audio.js/persist.js + VERSION）。
- **替代方案否决**：CSS 换位（把 nth-child 映射 up/dn 对调）违背 PRD §8-1「互换只落在 HTML 模板层」，且改动两条媒体块既有规则、断言面更大——否决。

### D-3 断言登记改写（AC-7）
- verify-ui.cjs **653 行**：`['hardDrop','moveLeft','moveRight','softDrop']` → `['softDrop','moveLeft','moveRight','hardDrop']`，消息改「十字簇 4 键（上软降/左右横移/下硬降，DOM 源序）」并注明**取代 r24#AC-1 授权**。
- verify-ui.cjs **769 行**：左轨键序同步改新源序，消息改「左轨恰 4 键（软降/左/右/硬降）」同上注明。
- verify-ui **新增 r27 段**（纯追加）：基座 order 冻结结构性断言（4 条选择器+order 值存在性，沿 M/L 恒玻璃构造保证先例）。
- qa-e2e **§r27 纯追加段**（见 §9）。

### D-4 双作用域验证口径 = 共享 DOM 恒等断言
qa-e2e §r27 断言 `.rail--l > .tpad-cross === doc.querySelector('#touch-controls .tpad-cross')`（**同一元素树恒等**）——竖屏 S dock 与横屏侧轨一次断言双双覆盖；横屏轨盒结构/描边/皮肤挂点由 §r26 既有断言承继（2354–2386），零改动。

### D-5 读屏顺序口径（AC-8 与 M/L 折衷，接受项）
- S/横屏：DOM 源序=视觉序（上=软降先读、下=硬降后读）✓ 与 AC-8 一致。
- M/L 行式栏：视觉序冻结为 r26（硬降 左 右 软降），但 DOM 源序为互换后序（软降 左 右 硬降）→ 读屏顺序与视觉顺序**轻微分叉**；因逐键读出的是动作名（「软降」「硬降」…）语义无歧义，接受并列入人工抽查项（读屏用户行式栏场景为低频组合）。

## 4. 数据模型与存储（0 变更）

- **无新增持久化键**：persist.js 0 diff（PRD AC-6）；settings 包络/dockSkin/音量/BGM/幽灵/墙踢等全部不动。
- **无新的 DOM 数据属性**：`data-action` 六值映射表（F3）逐字不变；互换后各键 data-action 值仍在六值集合内。
- **无新运行时状态**：输入状态机、对局快照、VERSION 三模块全部承继。

## 5. 接口设计（零变化）与契约清单

本产品为 `file://` 静态自包含，**无路由/后端**；「接口」即 UMD 面与 DOM 契约，r27 全部零变化：

| 接口 | 契约 | r27 动作 |
|---|---|---|
| `TetrisUI.TOUCH_KEYS` | 六值映射表（action↔key↔holdable），字面量/数量/顺序与 r26 逐字一致 | **0 diff**（AC-2） |
| `TetrisUI.createTouchControls(els, game, opts?)` | `.tkey[data-action]` 定向绑定 → 合成 KeyboardEvent → window 键盘层 → game.js keyAction/held | **0 diff**（AC-3） |
| `.tkey[data-action]` ↔ TOUCH_KEYS | 六值一一对应（verify-ui 交叉断言防漂移） | 值不变，仅键帽归属位置互换（模板层） |
| `TetrisGame` / `TetrisAudio` / `VERSION` | 引擎/音效/版本契约 | **0 diff**、不升版（AC-6） |
| 输入状态机 | touchstart/end/cancel/tap、activeKeys Set、RUNNING 守卫、DAS/软降 repeat | 全部承继（AC-4/AC-3） |

## 6. 前端组件与页面拆分（无新组件）

概念模型：**单模板 × 三作用域**（CSS 重排）。r27 只改：
- index.html：`.tpad-cross` 内两键帽语义字段（D-1）——组件/元素/class 零增删；
- style.css：基座行式栏 4 条 order 规则（D-2）——零新选择器类别的规则新增。

无新 DOM 元素、无新组件、无新视觉 token；右旋转簇（Hold/旋转）、左右横移键、hub ✛、皮肤系统全部不动。

## 7. 状态管理（无新状态）

无新增全局/模块状态。触屏输入状态机（§5 表）全部承继 r16/r26：PAUSED/OVER 点击仅 preventDefault 零输入零音效（`isRunning` 守卫，ui.js 1150 起）、多指并发互不串扰（`activeKeys` Set，1127 起）、长按 DAS/软降 repeat 由既有时钟驱动。换位不改变任何状态迁移路径。

## 8. 关键实现点与边界用例（AC 映射）

| AC | 实现点 | 验证面 |
|---|---|---|
| AC-1 P0 | D-1 整按钮互换；左右键/hub 五字段逐字节不动（与 r26 快照仅上下两键语义字段变化） | qa-e2e §r27 五字段有序断言 + 共享 DOM 恒等断言（D-4） |
| AC-2 P0 | ui.js 0 diff；TOUCH_KEYS 六值逐字不变 | git diff 审查 + verify-ui 六值契约断言（224–249 行）全绿 |
| AC-3 P0 | 回放器 0 diff；互换后按键合成键盘指令逐键等效（上=ArrowDown 软降 repeat、下=空格硬降落底） | §r16 既有触屏仿真用例（1428–1660）沿用全绿 + git diff 审查 |
| AC-4 P0 | 交互/按压态/touch-action/safe-area/多指/过渡动效零改动（style.css 仅 §3 D-2 四条 order 规则） | verify-ui 交互断言全绿 + 人工真机补测承继 |
| AC-5 P0 | D-2 基座 order 冻结：M/L 行式栏视觉键序=r26（硬降 左 右 软降），键序/键序列/data-action 与 r26 完全一致 | verify-ui r27 新增段（order 规则结构性断言）+ 人工目测 |
| AC-6 P0 | game.js/audio.js/persist.js 0 diff、VERSION 不动、ui.js 0 diff | verify-game/audio/constants/persist 全绿 + git diff 审查 |
| AC-7 P0 | 653/769 登记改写（D-3）+ §r27 新增段；七套脚本全绿退出 | 七脚本退出码 0 |
| AC-8 P1 | 上下键 aria-label 互换（上=软降/下=硬降）、hub 不入读屏零事件（承继三层保险） | qa-e2e §r27 aria 断言 + 人工读屏抽查（含 D-5 折衷项） |

边界用例：
- **PAUSED/OVER 点按互换后按键**：`isRunning` 守卫先于派发（ui.js 1176）→ 零副作用，行为与互换前一致（AC-3 承继）。
- **图标与动作脱节防错**：软降键必须同时携带 ▼+「软降」、硬降键 ⤓+「硬降」（D-1 整元素交换天然防错）——人工目测两项承继。
- **M/L 读屏分叉**：见 D-5，接受并留抽查。
- **多指并发**：左右横移+软降同按等 §r16 既有用例（1590–1598）沿用，天然覆盖互换后键位。

## 9. 测试策略

1. **登记改写（2 处，注明取代 r24#AC-1）**：verify-ui.cjs 653 / 769 → 新源序 `['softDrop','moveLeft','moveRight','hardDrop']`（D-3）。
2. **verify-ui 新增 r27 段**：基座 4 条 order 规则结构性断言（选择器+`order:1..4` 存在，正则锚定基座切片）。
3. **qa-e2e §r27 追加段**（纯追加，JS 运行时断言）：
   - 十字簇五字段有序断言（`.tpad-cross` 下四 `.tkey` 按源序逐一比对）：软降/「软降」/▼/软降 → 左移/「左移」/◀/左 → 右移/「右移」/▶/右 → 硬降/「硬降」/⤓/硬降（data-action/aria-label/图标/文字标签），左右两键五字段与 r26 期望字面全等；
   - 共享 DOM 恒等断言（`.rail--l > .tpad-cross === #touch-controls .tpad-cross`，D-4）；
   - hub 复验：无 data-action、`aria-hidden="true"`、点击零事件（沿既有 2307 起先例）。
4. **全绿出口**：七套脚本（verify-game / verify-audio / verify-ui / verify-persist / verify-constants / assembly-check / qa-e2e-jsdom）退出码 0 + git diff 审查（ui.js/game.js/audio.js/persist.js 0 行逻辑、VERSION 未动、style.css 仅 4 条 order 规则）。
5. **人工补测承继（真机）**：两作用域键位目测（S dock 上软降/下硬降、横屏侧轨同构）、按压三态、safe-area、多指并发、M/L 行式栏目测（硬降 左 右 软降）、读屏抽查（含 D-5）。

## 10. 任务拆分与 git 约束

| 任务 | 文件 | 依赖 | 要点 |
|---|---|---|---|
| T1 | `/index.html` | 独立 | D-1 整按钮互换（118↔121）+ 116–117 注释微调（「上下位语义：软降/硬降」）；左右/hub/右簇/M-L 零改动 |
| T2 | `/style.css` | 独立（与 T1 可并行：order 规则按 data-action 锚定，互换前后均命中） | D-2 基座 4 条 order 规则 + 注释（紧邻 1058–1066 块） |
| T3 | `/scripts/verify-ui.cjs` | T1/T2 语义 | 653/769 登记改写（取代 r24#AC-1）+ 新增 r27 order 冻结段 |
| T4 | `/scripts/qa-e2e-jsdom.cjs` | T1 语义 | §r27 追加段（五字段有序断言 + DOM 恒等 + hub 复验） |
| T5 | 收口 | T3/T4 | 七套脚本全绿 + git diff 审查（红线四文件 0 diff、VERSION 未动）+ 人工补测 + 提交 |

**git 约束（PRD §8-6 承继）**：分支 main、不新建分支；工作区未提交改动仅本任务夹本身（`?? docs/teamflow/20260830-r27-dpad-hard-soft-swap/`）；七套全绿后**代码与任务夹同批单 commit**（禁分散 commit），提交信息前缀 `feat: r27 十字键硬降/软降位置互换（上=软降、下=硬降）`。

## 11. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 断言漂移（高）：653/769 漏改即 AC-7 不成立 | 登记改写清单精确到行号（§9），改后跑 verify-ui 即红/绿互证 |
| 误触映射表（高）：实现时误改 TOUCH_KEYS/createTouchControls | ui.js 列 0 diff 红线，git diff 审查必检项（T5） |
| M/L order 冻结遗漏（中）：漏加规则则行式栏源序外显、AC-5 不成立 | T2 独立卡片 + verify-ui r27 段结构性断言兜底 |
| order 规则误写进 S/横屏网格块（低）：则因显式放置无效、形同虚设 | D-2 明确落点=基座（媒体查询外）1058–1066 之后；review 检查 |
| 键帽视觉与动作脱节（中）：只换 action 不换图标/文字 | D-1 整元素交换 + §r27 五字段断言 + 人工目测 |

---

<!-- blueprint -->{"summary":"r27 是模板层键位语义互换 + M/L 行式栏 order 冻结的纯装配迭代：六键映射表与回放器零逻辑改动；index.html 上下两键整按钮互换即两作用域同步（单模板共享），style.css 基座 4 条 order 规则冻结 M/L 行序；断言两处登记改写 + 双作用域/冻结项新增","modules":{"/index.html":{"responsibility":"触控区单模板六键；r27 上下两键整按钮互换（五字段随元素迁移），源序变 softDrop/moveLeft/moveRight/hardDrop，左右/hub/右簇零改动","dependsOn":[],"assemblyOrder":1,"why":"单模板三作用域（S/横屏/M-L 均为 CSS 重排同一 DOM）——换位落模板层即 AC-1 两作用域同步由构造保证；回放器按 data-action 锚定（F3）不受物理位置影响，故 AC-2/AC-3 零逻辑改动"},"/style.css":{"responsibility":"基座（媒体查询外）.tpad-cross 行式栏作用域新增 4 条 order 规则，M/L（及默认/≥600px 横屏门控栏）视觉键序冻结回 r26（硬降 左 右 软降），AC-5","dependsOn":["/index.html"],"assemblyOrder":2,"why":"S/横屏交叉簇为 nth-child 显式 grid-area 落位（F2），CSS order 对显式放置无效 → 冻结规则天然只作用于行式栏，无需作用域门控；零新 token/交互（AC-4），style.css 不在 AC-6 红线"},"/ui.js":{"responsibility":"0 diff 红线：TOUCH_KEYS 六值映射表与 createTouchControls 逐字不动，契约锚点承继","dependsOn":[],"assemblyOrder":0,"why":"动作↔键码契约按 data-action 字面量锚定，键帽换位不改变动作语义与合成路径（AC-2/AC-3）；任何逻辑改动都会击穿红线上限"},"/persist.js":{"responsibility":"0 diff 红线：无新增持久化键、settings 包络不动，AC-6","dependsOn":[],"assemblyOrder":0,"why":"本需求不涉及存储；再触碰即违反 AC-6"},"/game.js":{"responsibility":"0 diff 红线：引擎数值/状态机/onSfx 事件序列不动，AC-6","dependsOn":[],"assemblyOrder":0,"why":"纯 UI 语义互换，引擎零触达"},"/audio.js":{"responsibility":"0 diff 红线：SFX_DEFS/事件面不动，AC-6","dependsOn":[],"assemblyOrder":0,"why":"纯 UI 语义互换，音效零触达"},"/scripts/verify-ui.cjs":{"responsibility":"653/769 键序断言登记改写（取代 r24#AC-1）+ 新增 r27 段（基座 order 冻结结构性断言），其余契约断言零改动","dependsOn":["/index.html","/style.css"],"assemblyOrder":3,"why":"源码扫描型断言与模板/CSS 同源锁死（F4 先例）；登记改写集中 2 处并注明取代来源，保持可追溯"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"§r27 纯追加段：十字簇五字段有序断言、共享 DOM 恒等断言（双作用域验证口径）、hub 无 data-action 复验；§r16/§r26 既有用例零改动","dependsOn":["/index.html"],"assemblyOrder":4,"why":"jsdom 运行时 DOM 断言补充 verify-ui 的源码扫描盲区（aria/图标/文字/恒等），纯追加零回归既有断言"}},"duplications":["六值映射表三处同源（ui.js TOUCH_KEYS / index.html data-action / verify-ui 交叉断言）——本次保持逐字不变，防漂移护栏沿用","data-action 同时是回放器锚点与 CSS order 选择器锚点：若未来再改键序必须同改 verify-ui 顺序断言 + qa-e2e §r27 期望表（登记改写惯例）","M/L 视觉序（order 冻结）与 DOM 源序分叉是已知折衷（D-5），读屏顺序与视觉顺序在 M/L 行式栏轻微不一致——已记录为接受项"],"tasks":[{"title":"T1 index.html 上下键整按钮互换（五字段整体迁移）","files":["/index.html"],"spec":"118↔121 两 <button> 元素整体互换：上=softDrop/软降/▼/软降、下=hardDrop/硬降/⤓/硬降；左右/hub/右簇/M-L 零改动；116-117 注释微调"},{"title":"T2 style.css 基座 order 冻结（AC-5）","files":["/style.css"],"spec":"媒体查询外 .tpad-cross 行式栏后追加 4 条 order 规则（hardDrop:1/moveLeft:2/moveRight:3/softDrop:4）+ 注释；S/横屏显式 grid 落位不受影响"},{"title":"T3 verify-ui.cjs 登记改写 + r27 段","files":["/scripts/verify-ui.cjs"],"spec":"653/769 有序断言改 ['softDrop','moveLeft','moveRight','hardDrop'] 并注明取代 r24#AC-1；新增基座 order 规则结构性断言"},{"title":"T4 qa-e2e-jsdom.cjs §r27 追加段","files":["/scripts/qa-e2e-jsdom.cjs"],"spec":"十字簇五字段有序断言 + .rail--l .tpad-cross 与全局恒等断言 + hub 零事件复验；既有用例零改动"},{"title":"T5 全量验证收口 + 同批提交","files":["/index.html","/style.css","/scripts/verify-ui.cjs","/scripts/qa-e2e-jsdom.cjs"],"spec":"七套脚本全绿退出、git diff 审查（ui/game/audio/persist 0 行逻辑、VERSION 未动）、main 全绿同批单 commit 含本任务夹"}]}<!-- /blueprint -->

---

<!-- state -->{"phase":"tech","summary":"r27 技术方案已写入任务夹：互换=index.html 模板层上下两键整按钮互换（上=softDrop/软降/▼、下=hardDrop/硬降/⤓），ui.js TOUCH_KEYS 六值表与 createTouchControls 0 行改动；单模板三作用域（S dock/横屏侧轨/M-L 均 CSS 重排同一 DOM）→ AC-1 两作用域同步由构造保证（+rail 共享 DOM 恒等断言）；M/L 行式底栏视觉键序冻结=基座 4 条 order 规则（S/横屏 nth-child 显式 grid-area 放置不受 order 影响，天然只作用于行式栏，落点=1058-1066 之后，AC-5）；verify-ui 653/769 两处键序断言登记改写（取代 r24#AC-1）+ 新 r27 段（order 冻结结构性断言）；qa-e2e §r27 追加五字段有序断言+DOM 恒等+hub 复验；红线 game/audio/persist/ui.js 0 diff、VERSION 不动、style.css 不在红线允许 4 条规则；D-5 接受 M/L 读屏顺序与视觉序分叉；任务 T1∥T2→T3∥T4→T5，main 全绿同批单 commit 含任务夹","memory":["r27 TECH 定稿：互换=模板层上下键整按钮交换（D-1），源序变 softDrop/left/right/hardDrop；回放器按 data-action 锚定（F3）→ AC-2/AC-3 零逻辑改动，ui.js 0 diff","单模板三作用域事实（F1）：index.html 仅一份 #touch-controls，S/横屏/M-L 均为 CSS 重排；交叉簇落位为 nth-child 显式 grid-area（F2：1754-1757/1379-1382）——AC-1 两作用域同步由构造保证、qa-e2e §r27 用 rail--l .tpad-cross 与全局恒等断言覆盖","M/L 冻结裁定 D-2：基座（媒体查询外）追加 4 条 order 规则 hardDrop:1/moveLeft:2/moveRight:3/softDrop:4，显式 grid 放置不受 order 影响→天然只作用于行式栏；style.css 不在 AC-6 红线清单，零新 token/交互","登记改写清单（D-3）：verify-ui.cjs 653/769 → ['softDrop','moveLeft','moveRight','hardDrop'] 注明取代 r24#AC-1；verify-ui 新 r27 段=order 冻结结构性断言；qa-e2e §r27 纯追加（五字段有序断言+DOM 恒等+hub 复验）","D-5 折衷：M/L 行式栏视觉序冻结（r26）而 DOM 源序为互换后序→读屏顺序与视觉序轻微分叉，逐键动作名无歧义，列入人工抽查","任务拆分：T1 index.html ∥ T2 style.css（order 按 data-action 锚定可并行）→ T3 verify-ui ∥ T4 qa-e2e → T5 七套全绿+git diff 审查（ui/game/audio/persist 0 行逻辑、VERSION 未动）+ main 同批单 commit 含任务夹；禁分散 commit"]}<!-- /state -->