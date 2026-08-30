# 产品验收报告 — r27 十字键上下位硬软互换

## 结论

**✅ 通过（可合入）** —— AC-1~8 全部成立；M3 架构质量闸通过（无 blueprint、无重复实现/漂移、无结构破坏）；七套脚本独立复跑全绿。

## 一、验收依据与独立复验

- 文档：本任务夹 PRD（AC-1~8，P0×7/P1×1）、TECHNICAL §9（D-1~D-5）、QA-REPORT（0 缺陷结论）。
- 独立复验（验收当次实跑，日志 `logs/teamflow/tf-mtfbv497-ocden1/accept-r27-*.log`）：verify-game 130 / verify-audio 24 / verify-ui 46（含 r27 段 2 项）/ verify-persist 19 / verify-constants 2 / assembly-check ALL PASSED / qa-e2e-jsdom **474/474**（含 §r27 11 项）——七脚本全部 exit=0。
- 工作树核验：`git status` 恰 4 个改动文件（index.html / style.css / scripts/verify-ui.cjs / scripts/qa-e2e-jsdom.cjs）+ 本任务夹；**ui.js / game.js / audio.js / persist.js 0 diff**（不在改动清单）。

## 二、逐条 AC 核验表

| AC | 判定 | 证据（本次验收核验） |
|---|---|---|
| AC-1 [P0] 十字键位互换（两作用域同步） | ✅ | index.html diff：118 行上键整按钮 hardDrop→**softDrop ▼ 软降**、122 行下键反向；左/右（120/121）与 hub 零改动；双作用域同源于单模板共享 DOM（qa-e2e §r27 恒等断言 1×#touch-controls / 1×.tpad-cross / 2 轨），S/横屏 nth-child grid-area 落位样式零改动 → 同步互换 |
| AC-2 [P0] 功能映射零变化 | ✅ | ui.js TOUCH_KEYS 六值表（§1062-1067 softDrop→ArrowDown / hardDrop→空格）0 diff；createTouchControls 按 `.tkey[data-action]` 锚定 → 键帽语义随元素迁移；verify-ui 键位契约全绿 |
| AC-3 [P0] 回放器路径零逻辑改动 | ✅ | 回放合成代码 0 diff；§r27 运行时：软降键 touch → piece y+1、硬降键 → board 变化 + hardDrop 音效 + RUNNING 承续、hub 三事件零 keydown 零副作用；§r16 触屏仿真用例零改动 |
| AC-4 [P0] 交互/按压态/safe-area/多指承继 | ✅ | style.css 仅 +8 行（4 条 order 规则+注释），零新 token、零交互改动；按压三态/touch-action/safe-area/多指守卫承继；人工补测项承继 |
| AC-5 [P0] M/L 行式底栏键序保持现状 | ✅ | 基座 4 条 `[data-action]→order:1..4`（hardDrop/左/右/softDrop）冻结 M/L 视觉键序回 r26；order 对 S/横屏显式 grid-area 落位无效 → 天然只作用行式栏零门控；verify-ui r27 段断言选择器+顺序值+落点+唯一性（[data-action= 恰 4 条、S/横屏切片零残留）；既有 M/L 断言零改动（qa-e2e 纯追加 +105 行） |
| AC-6 [P0] 红线零回归 | ✅ | game/audio/persist 0 diff；VERSION 三模块一致未动（verify-constants 2/2 + diff 双证）；本轮复跑 verify-game 130 / verify-audio 24 / verify-persist 19 全绿 |
| AC-7 [P0] 验证脚本全绿出口 | ✅ | 登记改写闭环：verify-ui 653→655 / 769→772 两处键序断言更新为新源序并注明「取代 r24#AC-1 授权」（r27 §9 D-3）；qa-e2e §r27 纯追加且期望表同源；七脚本复跑 exit=0 |
| AC-8 [P1] 可访问性持续 | ✅ | 互换后 aria-label：上=「软降」/下=「硬降」语义正确；✛ hub aria-hidden + 无 data-action + 运行时零事件；D-5 读屏顺序观察项见遗留 |

## 三、M3 架构质量检查

- **blueprint**：本上下文未注入 blueprint JSON → 模块抽取不适用（模板层互换类需求），无偏离项。
- **无重复实现 / 适配漂移**：触控键定义仍仅 TOUCH_KEYS（ui.js）+ data-action 模板两处单一事实来源；style.css 新增 `[data-action=` 选择器恰 4 条且唯一性防护断言锁定（F5 演变）；S/横屏共享单模板 DOM 无适配分叉；hub 三层保险（无 data-action / aria-hidden / pointer-events:none）承继。
- **结构完整性**：左右横移、中心 ✛、右旋转簇、M/L 底栏零改动；无应抽未抽、无结构性破坏。
- **接受项（非缺陷）**：D-5 —— M/L 行式栏视觉序（order 冻结=硬降/左/右/软降）与 DOM 源序（softDrop/左/右/hardDrop）分叉，读屏顺序与视觉序轻微不一致，属「M/L 视觉序零变化」裁定取舍，QA 与 verify-ui 注释已记录。

## 四、遗留与建议

1. **人工补测清单**（环境限制——验收模型无图像输入，非交付缺陷）：S 竖屏十字键位感（上软降/下硬降）、横屏侧轨语义、M/L 行式栏视觉键序目测、读屏顺序（确认 D-5 可接受）、safe-area/多指/FPS 无回归。
2. **Host 收口**：main 同批单提交（4 改动文件 + 本任务夹），沿用 r26 惯例；提交前无需额外返工。
3. **memory.md**：本次为既有契约内键位语义互换，无新约定/技术决策、已知待办不变 → 不更新。

<!-- state -->{"phase":"acceptance","verdict":"accepted","summary":"r27 产品验收通过（✅ 可合入）：AC-1~8 全部成立；七套脚本独立复跑全绿（game 130/audio 24/ui 46/persist 19/constants 2/assembly ALL/qa-e2e 474 含 §r27 11 项）；git 核验恰 4 改动文件+任务夹、ui/game/audio/persist 0 diff、VERSION 未动；互换落 index.html 118/122 整按钮五字段（上=softDrop▼软降/下=hardDrop⤓硬降），TOUCH_KEYS 与回放器 0 逻辑改动，S/横屏双作用域由共享 DOM 构造同步互换，M/L 视觉序经基座 order:1..4 冻结回 r26；登记改写 653/769 注明取代 r24#AC-1 且与 qa-e2e §r27 同源；M3 无 blueprint/无重复实现/无漂移（[data-action= 恰 4 条唯一性防护）；D-5 读屏序分叉为接受项；人工补测 5 项留真机；建议 host 在 main 同批单提交（代码+任务夹）；memory.md 不更新（无新约定）","memory":["r27 验收通过（accepted）：AC-1~8 全过、七套全绿出口（验收独立复跑 qa-e2e 474/474），红线四文件 0 diff、VERSION 未动","登记改写闭环成立：verify-ui 653/769 新源序 softDrop/左/右/hardDrop + 取代 r24#AC-1 授权注记，qa-e2e §r27 同源纯追加；M/L 视觉序=order 冻结 hardDrop:1/左:2/右:3/softDrop:4","D-5 接受项：M/L 视觉序与 DOM 源序分叉→读屏序轻微不一致，人工读屏抽查确认；人工补测清单（S/横屏/M-L 视觉序/读屏/safe-area-多指-FPS）留真机","收口动作：host 在 main 同批单提交（index.html/style.css/verify-ui.cjs/qa-e2e-jsdom.cjs + docs/teamflow/20260830-r27-dpad-hard-soft-swap/）；ACCEPTANCE.md 已写入任务夹，memory.md 未动（无新约定）"]}<!-- /state -->