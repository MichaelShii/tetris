# QA-REPORT — r27 十字键上下位硬软互换（D-pad hard/soft swap）

## 结论先行

**验收判定：通过（acceptance-ready，0 缺陷）** —— 七套验证脚本全绿（qa-e2e 474/474 含 11 项 §r27 新增）、红线 game.js/audio.js/persist.js/ui.js 0 diff、VERSION 三模块一致未动；双作用域（竖屏 S dock + 横屏侧轨）互换由单模板共享 DOM 构造保证，M/L 行式底栏视觉键序经基座 order 冻结回 r26（零变化）；未发现缺陷。

## 1. 范围与环境

- **需求**：r27 十字键上下位功能互换（上=软降 ▼、下=硬降 ⤓），取代 `20260829-r24-touchpad-cross#AC-1`；互换仅落 index.html 模板层上下键整按钮五字段（type/class/data-action/aria-label/图标/文字），TOUCH_KEYS 六值映射表与回放器 0 逻辑改动；左/右横移、中心 ✛ hub、右旋转簇、M/L 底栏均不动。
- **基线**：main 分支；改动文件恰 4 个（`M index.html` / `M style.css` / `M scripts/verify-ui.cjs` / `M scripts/qa-e2e-jsdom.cjs`）+ 本任务夹（??）；memory.md 未动。
- **环境**：Windows + Node（jsdom E2E 全量）；**模型无图像输入**——不做截图目测，采用源码 diff、脚本断言与对抗抽查；布局/视觉判定项列入 §6 人工补测清单。
- **日志**：`logs/teamflow/tf-mtfbv497-ocden1/qa-r27-*.log`、`qa-r27-seven-scripts.log`（无散落根目录）。

## 2. 七套验证脚本结果（全部 exit=0）

| 脚本 | 结果 | 说明 |
|---|---|---|
| verify-game.cjs | 130/130 | 引擎 0 行改动基线 |
| verify-audio.cjs | 24/24 | 音效 0 行改动基线 |
| verify-ui.cjs | **46/46** | 653/655、769/772 登记改写（注明取代 r24#AC-1）+ r27 段 2 项（order 规则精确匹配 / 唯一性防护） |
| verify-constants.cjs | 2/2 | VERSION 三模块一致 |
| verify-persist.cjs | 19/19 | persist 0 行改动基线 |
| assembly-check.cjs | ALL PASS | 装配 + 自包含 + 音频文件审计 |
| qa-e2e-jsdom.cjs | **474/474** | 含 §r27 新增 11 项；§r16/§r24/§r26 全部原有断言零回归 |

## 3. 独立对抗抽查（QA 人工核验，非脚本自证）

1. **互换落点核查**：index.html diff 仅 116-121 行——nth-child(1) 上键 `hardDrop/⤓/硬降` → `softDrop/▼/软降`，nth-child(4) 下键反向互换，整按钮五字段整体迁移；左/右/✛ hub 零改动。
2. **TOUCH_KEYS 单一事实来源**：ui.js §1062-1069 六值映射表（softDrop→ArrowDown、hardDrop→空格）未列入 diff；`createTouchControls` 按 `.tkey[data-action=…]` 查询（ui.js §1169），回放器锚定 data-action → 动作语义随键帽迁移，与物理位置无关（对照实测：softDrop 键 touch 单步 y+1、hardDrop 键 touch 触发锁定+音效，见 §4）。
3. **双作用域同步互换（AC-1）**：S 竖屏（style.css §1762-1765）与横屏侧轨（§1387-1390）均为 `:nth-child(1..4)→grid-area up/lf/rt/dn` 显式落位且未入 diff——互换后 nth-child(1)=softDrop 仍落 up（上）、nth-child(4)=hardDrop 仍落 dn（下），**视觉位置不变、语义互换**，两作用域同步由构造保证。
4. **M/L 行式底栏键序零变化（AC-5）**：基座新增 4 条 `[data-action]→order:1..4`（hardDrop/左/右/softDrop）冻结行式栏视觉键序回 r26；order 对 nth-child 显式 grid-area 落位无效 → 天然不作用于 S/横屏，无需媒体门控；verify-ui r27 段断言 `[data-action=` 选择器恰 4 条全落基座、两切片零残留。
5. **红线 0-diff 双证**：`git diff --stat game.js audio.js persist.js ui.js` 输出为空 + verify-constants 2/2；VERSION 三模块未动。
6. **登记改写闭环**：verify-ui 653/769 与 qa-e2e §r27 期望表同源（新源序 softDrop/moveLeft/moveRight/hardDrop），删除改动仅此两处登记改写（替换旧期望序），qa-e2e 为纯追加（+105 行）；注释均注明「取代 r24#AC-1（r27 §9 D-3）授权」。
7. **hub 复验**：span 无 data-action + aria-hidden=true；touchstart/touchend/click 三事件零合成 keydown、piece 不动、零新音效（r24 先例承继）。

## 4. 用例覆盖（AC 对照）

| AC | 内容 | 结果 |
|---|---|---|
| AC-1 | 双作用域（S dock + 横屏侧轨）同步互换 | PASS（§3.3 构造保证 + qa-e2e「恰 1 个 #touch-controls/1 个 .tpad-cross/2 轨」恒等断言） |
| AC-2 | 互换落模板层、TOUCH_KEYS/回放器 0 逻辑改动 | PASS（§3.1/§3.2 + 红线 0 diff） |
| AC-3 | 左/右/中心/右旋转簇/M-L 底栏不动 | PASS（diff 仅上下两键；M/L 视觉序 order 冻结回 r26） |
| AC-4 | verify-ui/qa-e2e 键序断言登记改写（取代 r24#AC-1）至全绿 | PASS（§3.6，46/46 + 474/474） |
| AC-5 | M/L 视觉键序零变化（order 冻结） | PASS（§3.4） |
| AC-6 | 红线 game/audio 0 diff、VERSION 不动、persist 0 diff | PASS（§3.5） |
| AC-7 | 七套脚本全绿出口 | PASS（§2） |
| AC-8 | 交互/按压态/safe-area/多指守卫承继 | PASS（style.css 仅 +8 行基座 order 块；touch-action/`:active`/safe-area 原位未动） |

## 5. 缺陷

**未发现缺陷。**

已知**接受项**（非缺陷，dev 已记录 D-5）：M/L 行式栏视觉键序（order 冻结=r26 硬降/左/右/软降）与 DOM 源序（softDrop/左/右/hardDrop）分叉 → 读屏顺序与视觉序在行式栏轻微不一致。系满足「M/L 视觉序零变化」的裁定取舍，已在 verify-ui 注释与 §6 人工清单注明。

## 6. 人工补测清单（环境限制，非交付缺陷）

| 项 | 验收标准 | 方法/工具 |
|---|---|---|
| S 竖屏十字键手感 | 键位视觉位置不变；上键按压触发软降、下键触发硬降 | 真机/浏览器触控模拟目测 + 操作 |
| 横屏侧轨十字键 | 同 S：上=软降/下=硬降，与设计稿一致 | 真机横屏目测 |
| M/L 行式底栏视觉键序 | 视觉仍为 硬降 左 右 软降（order 冻结生效） | 真机目测（jsdom 无布局，已由 verify-ui 源码层断言覆盖） |
| 读屏顺序（D-5 接受项） | 知晓行式栏读屏序为 软降/左/右/硬降 与视觉序分叉，确认可接受 | 屏幕阅读器（TalkBack/VoiceOver）抽查 |
| safe-area / 多指 / FPS | 承继 r26 无回归 | 真机多指快按 + 帧率观察 |

## 7. 架构核验（M3 质量门）

- 本轮无 blueprint JSON 注入（模板层互换类需求不涉模块抽取），无需蓝核对账。
- **重复实现**：触控键定义仍仅两处单一事实来源（ui.js TOUCH_KEYS 回放表 + index.html data-action 模板），无漂移副本；order 冻结规则经唯一性防护断言（恰 4 条、全落基座）无重复锚点。
- **抽象应抽未抽**：互换落模板层五字段整体迁移，零逻辑复制；回放器 data-action 锚定路径复用，未引入第二套处理逻辑。
- **结构性破坏**：无；四红线文件 0 diff，新增代码全部聚在验证脚本与模板/CSS 局部。
- **观察项（非缺陷）**：pod ::before 双作用域系 r24 承继观察项，本轮未触碰。

## 8. 结论

r27 交付符合 PRD 全部 AC-1~8：互换语义、双作用域同步、M/L 视觉序冻结、登记改写闭环、红线 0-diff 均成立，七套脚本全绿零回归。**产品验收可进入**；验收后由 host 按惯例在 main 同批单提交（4 改动文件 + 本任务夹）。