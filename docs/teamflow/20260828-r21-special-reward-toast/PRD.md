<!-- meta: summary="为 Combo 连消奖励与 T-spin 奖励触发提供即时 Toast 反馈，让特殊奖励触发可被感知；纯展示层、复用既有 toast 组件，不改计分与引擎" -->
基线依赖：docs/teamflow/20260828-r20-combo-line-clear-reward（其 Combo 连消链/三轴计分/结算载荷语义不得回归；含 r18 T-spin 六档与 r22 主线基线行为）
取代：docs/teamflow/20260828-r19#AC-12（P1 Combo 指示器 UI——r20 已归 P2 另立需求）：本需求以「特殊奖励 Toast」形态落地该指示，并扩展覆盖 r18 T-spin 奖励触发。

# PRD：特殊奖励 Toast 反馈（r21）

## 1. 背景与目标

- **问题**：r18 T-spin 奖励与 r20 Combo 连消奖励已上线，但触发瞬间玩家无任何视觉/文案反馈——「这种特殊奖励机制触发了我都感觉不出来」。奖励机制存在感缺失，削弱正反馈与上手理解。
- **根因**：r20 将 r19#AC-12 指示器 UI 移出验收归 P2 另立（引擎仅预留 `combo/comboBonus` additive 载荷字段作为未来指示器数据源，未渲染）；T-spin 奖励同样只有计分变化，无即时提示。
- **目标**：在特殊奖励（Combo 连消奖励、T-spin 奖励）触发的瞬间，提供即时、可读、不打扰的 Toast 提示；**纯展示层改动**——不改任何计分/连消链/事件/持久化语义。

## 2. 用户故事与验收映射

- **US-1（Combo 感知）**：作为玩家，我连续消行触发 Combo 连消奖励时，能立即看到 Toast 提示连消档位与奖励分。→ AC-2、AC-6
- **US-2（T-spin 感知）**：作为玩家，我 T-spin 消行拿到奖励时，能看到明确的「T-Spin」提示。→ AC-3、AC-6
- **US-3（多轴不丢信息）**：作为玩家，同一次消行同时触发多轴奖励时，所有奖励信息都能看到，互不覆盖丢失。→ AC-4
- **US-4（不打扰）**：Toast 自动消失、不遮挡棋盘与关键面板、不打断操作；普通无奖励消行不弹。→ AC-5、AC-6、AC-9
- **US-5（可信）**：Toast 里的连消/分数与实际结算一致，且不影响存档、重开与刷新。→ AC-7
- **US-6（可访问与合规）**：Toast 信息可被读屏感知、不依赖纯颜色，视觉符合产品风格与动效红线。→ AC-8、AC-9
- **US-7（工程）**：纯展示、零回归。→ AC-10、AC-11、AC-12

## 3. 验收标准（AC-1~12）

| AC | 描述 | 级别 | 可测断言要点 |
|---|---|---|---|
| AC-1 | 复用既有 toast 子系统：特殊奖励 Toast 由 ui.js 既有 toast 组件/槽位承载（沿用 `--z-toast`、DOM 层动效规范），不新建孤立组件；新增接口/常量收敛到 UI 契约 | P0 | verify-ui 断言新增 UI API 与常量 `TOAST_DURATION`（值域 1200~2000ms）存在；无新增引擎接口 |
| AC-2 | Combo 触发：消行结算 combo≥1（comboBonus>0）→ 弹 Toast，文案含连消索引与奖励分，两值与同帧结算载荷一致 | P0 | qa-e2e 断言文本如 `Combo ×2 +100`；种子：L1 链 0→1→2，第 3 次消行（combo=2, level=1）→ `+100`（50×2×1） |
| AC-3 | T-Spin 触发：T-spin 有分档（六档任一）消行 → 弹 Toast 含「T-Spin」与奖励分，数值与载荷一致；No-line T-spin（0 分、仅断链）不弹 | P0 | qa-e2e 断言文本含 `T-Spin` 与对应分；No-line 场景断言 0 新增 Toast 节点 |
| AC-4 | 单帧合并：同一次消行结算多轴有分（普通+T-spin+combo 任一 ≥2）→ 合并为 1 根 Toast，所有有分轴信息各呈现一次、无轴丢弃；普通消行分本身不在必显范围 | P0 | qa-e2e 断言该帧恰好 1 根 Toast 节点，文本含全部有分轴关键词与数值 |
| AC-5 | 静默规则：结算奖励全 0（普通消行且 combo=0 且非 T-spin）→ 不弹特殊奖励 Toast；既有 LEVEL UP Toast 等反馈不受影响 | P0 | qa-e2e 断言语义；既有 LEVEL UP 断言零改动 |
| AC-6 | 时效与清理：Toast 显示 `TOAST_DURATION` 后自动淡出；显示期内新触发替换旧 Toast（不堆积）；消行动画结束后、计分同点出现（与 LEVEL UP 触发时机一致）；OVER/restart 后 0 残留；与 LEVEL UP 同帧时两者信息均可感知（不互删，共存机制由技术方案定） | P0 | jsdom 假时钟断言淡出时刻（±容差）；OVER/restart 后 DOM 无残留节点；同帧升级+奖励双信息可断言 |
| AC-7 | 数值可信与会话隔离：Toast 数值只读自结算同一数据源（引擎快照 additive 字段，r20 已预留），零新增计分路径、不进等级进度、不入持久化（persist 0-diff）；Toast 为纯展示、无跨局状态（刷新无残留、restart 归零） | P0 | persist/存档相关验证 0-diff；刷新/restart 断言 |
| AC-8 | 可访问性：Toast 容器 `aria-live="polite"`；信息以文本为主、不依赖纯颜色；`prefers-reduced-motion` 下降级为瞬时显示（沿用 DESIGN） | P1 | DOM 断言 aria-live 属性；reduced-motion 断言 |
| AC-9 | 视觉规范：符合 DESIGN token（玻璃/霓虹胶囊、ease-out-quart；只动 opacity/transform，不动画 box-shadow/backdrop-filter/filter，FPS 红线）；位置不遮挡棋盘中央与 Hold/Next/分数区，r17 四档布局下可见、resize 不越界 | P1 | 样式类断言 + resize/布局档人工与 jsdom 辅证 |
| AC-10 | 0-diff 红线：P0 改动默认仅 `ui.js` / `style.css` / `index.html` / `scripts/verify-ui.cjs` / `scripts/qa-e2e-jsdom.cjs`；engine（`game.js`/`audio.js`）0 行 diff | P0 | git diff 文件清单断言；若技术方案核实 tspin 字段未透出、需最小扩展引擎载荷，则必须明示新红线文件清单后再动 |
| AC-11 | 零回归：七套验证全绿（verify-game 事件序列 119、verify-audio 24、verify-ui 既有 23+新增、verify-constants 2、assembly-check ALL、qa-e2e 既有 367 断言**零改动**）；随机 50 局 soak 总分无漂移；T-spin 六档与 combo 链逐值不变 | P0 | 七套命令全绿 + qa-e2e 旧期望零 diff + soak 复核 |
| AC-12 | 事件面不变：onSfx/事件触发次数与顺序零变化（verify-game 事件序列 diff=0）；Toast 仅由 UI 层响应既有事件/快照，不新增触发源 | P0 | verify-game 事件序列 diff=0 |

优先级汇总：**P0 = AC-1,2,3,4,5,6,7,10,11,12**（核心感知与工程红线）；**P1 = AC-8,9**（可访问性细节与视觉打磨）。

## 4. 数值规格（新增）

- `TOAST_DURATION = 1600ms`（常量，单一事实来源在 `ui.js` 顶部，verify-ui 断言值域 1200~2000ms）——与既有 LEVEL UP Toast（800ms±200）同族不同时长，奖励信息量更大。
- 文案模板（数值一律取自结算载荷，AC-7）：
  - Combo：`Combo ×N +bonus`（N=连消索引，bonus=comboBonus）
  - T-Spin：`T-Spin +bonus`（bonus=T-spin 奖励分；若载荷含档位名可含于文案如 `T-Spin Single +1200`，不强制）
  - 多轴合并：以 ` · ` 分隔各轴，如 `T-Spin Double +1200 · Combo ×2 +100`
- 无其他新增数值；Toast 仅展示引擎既有数值。

## 5. 范围与非目标

- **范围内**：Combo Toast、T-Spin Toast、单帧合并规则、时效/替换/清理、aria-live、DESIGN token 合规、测试（verify-ui + qa-e2e 新场景）、0-diff UI-only 红线。
- **非目标**：断链（combo 归零）警示 Toast（P2 候选）；B2B / Perfect Clear 奖励（引擎未实现）；普通消行的任何 Toast；飘分/数字滚动动画（P2 候选）；多语言文案；Toast 时长用户配置化（常量即可）；改造既有 LEVEL UP Toast 机制（保持其行为零回归）；移动端触觉/震动反馈。

## 6. 交互流程

锁定清行 → 消行动画结束 → finishLock 单点结算（普通/T-spin/combo 三轴恰各一次，r20 语义）→ 结算载荷经事件/快照透出（combo/comboBonus 已预留；tspin 字段待技术方案核实）→ UI 层在既有事件回调中判定有分奖励轴 → 合并文案 → 单根 Toast（复用 toast 组件）→ `TOAST_DURATION` 后淡出；显示期内新触发替换；OVER/restart 清空；与 LEVEL UP 同帧按 AC-6 共存。

## 7. 优先级与里程碑

- **P0**：AC-1~7、AC-10~12 —— 本轮交付。
- **P1**：AC-8、AC-9 —— 本轮交付（可最后收口）。
- **P2（后续，非本需求）**：断链警示 Toast、飘分动画、Toast 配置化。
- **M1 技术方案**：核实 tspin 载荷是否已透出（决定 0-diff 边界）、Toast 槽位/数据结构/与 LEVEL UP 共存机制、测试矩阵。
- **M2 实现**：`ui.js` Toast 渲染 + `style.css` token 化样式 + `index.html` 挂载点（复用既有 toast 槽）。
- **M3 测试**：verify-ui 新契约（TOAST_DURATION/接口）、qa-e2e 新场景（AC-2~6 断言）、七套收口全绿。
- **M4 验收**：独立复跑 + 人工补测（动画实看/读屏/移动端四档布局）→ 登记 memory 产品版本（当前 v3.6 → 验收时定）→ 同批提交。

## 8. 依赖与风险

- **依赖**：r20 结算载荷（`combo`/`comboBonus` additive 字段，已预留为指示器数据源）；r18 T-spin 判定/载荷/快照 additive 模式；既有 LEVEL UP Toast 组件与 DESIGN token；r17 布局档。
- **R1（高）tspin 字段未随载荷透出** → 需最小扩展引擎事件 → 破坏 0-diff 红线。缓解：M1 先核实（代码/单测），确需扩展则技术方案明示新红线文件清单（AC-10）。
- **R2（中）与 LEVEL UP Toast 同帧冲突/覆盖** → 缓解：AC-6 行为约束（双信息均可感知），共存机制技术方案定，验收以 DOM 断言为准。
- **R3（中）qa-e2e 既有 367 断言被新 DOM 影响** → 缓解：Toast 独立挂载点、不侵入既有选择器、旧期望零改动（AC-11）。
- **R4（中）jsdom 定时器/动画断言稳定性** → 可注入时钟 + 确定性时长断言（±容差）。
- **R5（低）aria-live 读屏表现差异** → P1，人工补测。
- **R6（低）移动端视口遮挡** → r17 四档断言 + 人工补测（AC-9）。

## 9. 工程约束

- **分支**：`feat/special-reward-toast`（当前已在此分支，基于含 r20 合并 791f330 的主线）；保持在本分支实现与提交，不并入其他分支。
- **现有未提交改动**：1 处未跟踪 `?? docs/teamflow/20260828-r21-special-reward-toast/` —— 本需求任务夹，属预期产物，保留并随实现同批提交；其余文件保持干净，不做 stash/clean。
- **产物落盘**：全部写入 `docs/teamflow/20260828-r21-special-reward-toast/`（PRD/TECHNICAL/QA-REPORT/ACCEPTANCE），夹不可变、不归档不升版；命令输出日志去 `logs/teamflow/<runId>/`；不写 host 侧 `docs/<role>/`。
- **0-diff 红线**：P0 默认仅 `ui.js`/`style.css`/`index.html`/`scripts/verify-ui.cjs`/`scripts/qa-e2e-jsdom.cjs` 可改动；`game.js`/`audio.js` 0 行 diff；如需扩展引擎载荷，技术方案必须明示并重声明红线文件清单（AC-10）。
- **沿用惯例**：VERSION 三模块一致（verify-constants）；验收通过后登记 memory 产品版本；验收后同批提交、不污染主分支；代码零构建、自包含、`file://` 可用（assembly-check 覆盖）。

## 10. 产品语义（一句话）

特殊奖励要「看得见」：Combo 与 T-Spin 触发的瞬间用一根不打扰的 Toast 把奖励表达出来——纯展示，不碰任何计分与引擎。