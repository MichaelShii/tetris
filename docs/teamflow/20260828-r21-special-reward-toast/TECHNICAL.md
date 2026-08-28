# r21 特殊奖励 Toast 反馈 — 技术方案（TECHNICAL）

> 基线依赖：`docs/teamflow/20260828-r20-combo-line-clear-reward`（其 Combo 链/三轴计分/结算载荷语义不得回归；含 r18 T-spin 六档与 r22 主线基线行为）。
> 取代：`docs/teamflow/20260828-r19#AC-12`（Combo 指示器，r20 归 P2）——本需求以其「特殊奖励 Toast」形态落地，扩展覆盖 r18 T-spin。
> 上游：`PRD.md`（AC-1~12，P0=1,2,3,4,5,6,7,10,11,12；P1=8,9）→ `DESIGN.md`（双槽位/视觉/动效/清理规格）→ 本方案（实现契约）。
> 红线段（AC-10）：本期 P0 改动仅 `ui.js` / `style.css` / `index.html` / `scripts/verify-ui.cjs` / `scripts/qa-e2e-jsdom.cjs` 五个文件；`game.js` / `audio.js` / `persist.js` 及其余验证脚本 0 行 diff。

---

## 0. 前置核查结论（M1 收口；代码事实，非推测）

| 项目 | 核查结果 | 影响 |
|---|---|---|
| R1：`tspin` 是否已随载荷透出 | **是**。`game.js` lockFlow 将 `kind` 存入 `state.clearing.tspin`（g L614）；快照 `snapshot().tspin` 在 **clearing 动画期** 暴露 `'full'\|'mini'\|'none'`，非动画期恒 null（g L560，verify-game §14.5 已断言）。`combo`/`comboBonus` 同构（g L563-564，r20 AC-8 已验收） | **R1 关闭**。无需任何引擎扩展；0-diff 红线保持五件套。档位名文案可得（kind + clearing 行数） |
| 载荷生命周期 | 载荷仅在 `cleared>0 && animMs>0` 的 clearing 动画期（首帧起）非 null；`completeClearing` 在 `finishLock` 前清 `state.clearing` → **结算帧快照三字段已回 null**（g L626-628）。`cleared=0`（含 No-line T-spin）走即时路径 → 恒 null | Toast 不能在结算帧读取载荷，须在动画期**暂存**、结算帧**触发**（§4） |
| No-line T-spin | `T_SPIN_BONUS.full[0]=100`（No-line 有分！），但 `cleared=0` 不进 clearing → 快照 tspin/combo 恒 null（verify-game §14.5 L2116 断言 'No-line 不进 clearing → tspin 恒 null'） | No-line **天然不可见** → 不弹天然成立（AC-3「No-line 不弹」零成本满足）；本方案 UI 无从弹也无需弹 |
| 数值同源（AC-7） | 引擎计分唯一路径 `finishLock`（g L633-651）：`bonus = tspinBonus(tspin, cleared, state.level)`（乘数取升级前）、`comboBonusVal` 由 lockFlow 预计算（乘数取升级前 L602）；`tspinBonus`/`comboBonus` 均为**导出纯函数**（g L1213-1215） | Toast 数值 = 载荷直读（combo/comboBonus）+ 导出纯函数同参派生（tspin bonus），与引擎恒等（§5.3 证明） |
| 升级前 level 可得性 | clearing 动画期快照 `level` 尚未被 finishLock 更新（升级发生在结算帧）→ 动画期快照 level = 引擎乘数所用 level | UI 暂存动画期 level 即可得到与引擎一致的乘数 |
| LEVEL UP 触发位 | `onLevelUp` 在 finishLock 结算点回调（normal 路径 g L671；gameOver 路径 L662）→ 奖励 Toast 与 LEVEL UP **同点触发**（AC-6 时机一致） | 拼接同一结算帧（§4 时序） |
| animMs=0（reduced-motion / 主 E2E 环境） | createUI 解析 `animMs = opts.animMs ?? (prefersReducedMotion() ? 0 : 240)`（ui L1135）；animMs=0 → 引擎恒走即时路径 → **无 clearing 载荷** | **边界声明**：animMs=0 下奖励 Toast 不触发（§6.1）。ac-8 降级语义仅覆盖有载荷路径；CSS reduced-motion 镜像规则照常交付（防御） |
| 主 E2E 环境 | `qa-e2e-jsdom.cjs` 主 env `animMs:0`（L175）→ 主 env 永无载荷 → 旧断言行为零扰动（AC-11/R3） | r21 新 E2E 断言**全部**独立成段（animMs:240 env，仿 r13 段），**追加在文件末尾**（旧断言行号零扰动） |
| 六档 → 档位名映射所需数据 | `T_SPIN_BONUS = { full: [100,800,1200,1600], mini: [0,100,200,1600] }`（g L73-76）；kind + cleared 完全决定档位 | UI 本地展示映射表即可，零新引擎常量（§5.2） |
| 事件面（AC-12） | 引擎事件序列/onSfx 不新增不修改；Toast 仅 UI 层响应既有 `onSnapshot` | verify-game 事件序列断言 diff=0（§7.5） |

---

## 1. 总体方案

复用既有一级反馈子系统（`createFeedback` + `toast-in-out` keyframes + `--z-toast` + 单定时器替换模式），在 `#board-frame` 内新增**第二槽位 `#reward-toast`**（与 LEVEL UP 同族、纵向错位；双槽并存 = AC-6「同帧双信息不互删」的天然实现）。

数据流（纯展示、零新触发源、零新增计分路径）：

```
引擎 lockFlow（clearing 载荷 combo/comboBonus/tspin 附于动画期快照）
  → ui.js onSnapshot：动画帧暂存 pendingReward（首帧起，幂等覆写）
  → 结算帧（clearedIndices 由非 null → null）：
       若 phase==='OVER' → 清空（AC-6）
       否则 → buildRewardText(pendingReward) → 非空则 feedback.reward(text)
  → #reward-toast 文本 + 单定时器 1600ms 淡出；显示期内新触发替换；restart/OVER 清空
```

不改：引擎、音效、持久化、LEVEL UP 一切既有行为、qa-e2e 既有 367 断言、verify-game 事件序列。

---

## 2. 数据模型与存储

### 2.1 存储
**零持久化**（persist.js 0 行 diff，AC-7）。算奖励自跨局状态、无存档字段；刷新天然无残留。

### 2.2 UI 会话瞬态（ui.js `createUI` 闭包内新增，单一持有者）

```js
let pendingReward = null
// 结构（均取自 clearing 期快照，见 snapshot() 契约）：
// { tspin: 'full'|'mini'|'none'|null, combo: number|null, comboBonus: number|null,
//   cleared: number, level: number }
// 生命周期：clearing 动画帧置入（幂等覆写）→ 结算帧消费置 null → restart/OVER 置 null
```

`createFeedback` 内新增**第二独立定时器**（`rewardTimer`，与 LEVEL UP 的 `timer` 并存互不干扰）。

### 2.3 既有结算载荷（只读，g snapshot() 契约，r20/r18 已验收）
| 字段 | clearing 期（animMs>0 且 cleared>0） | 其余时刻 |
|---|---|---|
| `s.clearedIndices` | 非 null 数组（`s.animProgress` ∈ [0,1)） | null |
| `s.tspin` | `'full'\|'mini'\|'none'` | null |
| `s.combo` | 链内索引（≥0，首消=0） | null |
| `s.comboBonus` | 本次增量 `50×combo×level`（≥0；combo=0 → 0） | null |
| `s.level` | 升级前 level（结算帧才更新） | — |

---

## 3. 接口 / API 设计

**无新增引擎接口、无路由/网络**（单页零构建 `file://`）。新增/收敛均在 UI 契约，全部可 Node 单测或源扫描断言。

### 3.1 TetrisUI 新导出（ui.js 顶部常量区 + 底部导出）

```js
const TOAST_DURATION = 1600        // 奖励 Toast 时长 ms（AC-1/AC-6；verify-ui 断言 1200~2000）
const REWARD_JOIN = ' · '          // 多轴分隔符（PRD §4）
const T_SPIN_TIER_LABEL = {        // 展示档位名映射（零新引擎常量；kind+cleared → 展示名）
  'full:1': 'Single', 'full:2': 'Double', 'full:3': 'Triple',
  'mini:1': 'Mini',   'mini:2': 'Mini Double', 'mini:3': 'Triple',
}
// 导出 += { TOAST_DURATION, buildRewardText }
```

### 3.2 `buildRewardText(payload)` — 纯函数（新 UI API，Node 可单测）

```js
/** payload = { tspin, combo, comboBonus, cleared, level }（均取自 clearing 期快照）
 * 返回合并文案 string；全 0 → null（AC-5）。轴序：T-Spin 在前、Combo 在后（AC-4/DESIGN）。
 * 防御：comboBonus 非正数 / tspin 非全 mini|full / cleared<1 / level<1 → 跳过对应轴。 */
function buildRewardText(p) {
  const parts = []
  if (p && typeof p.comboBonus === 'number' && p.comboBonus > 0 && p.combo >= 1) {
    parts.push('Combo ×' + p.combo + ' +' + p.comboBonus)              // 'Combo ×2 +100'
  }
  if (p && (p.tspin === 'full' || p.tspin === 'mini') && typeof p.cleared === 'number' && p.cleared >= 1) {
    const b = TetrisGame.tspinBonus(p.tspin, p.cleared, p.level)        // 与引擎同函数同参数 → 恒等（§5.3）
    if (b > 0) {
      const label = T_SPIN_TIER_LABEL[p.tspin + ':' + p.cleared]        // 映射缺失 → 最小形态『T-Spin +bonus』（PRD 允许）
      parts.push('T-Spin' + (label ? ' ' + label : '') + ' +' + b)      // 'T-Spin Single +800'
    }
  }
  return parts.length > 0 ? parts.join(REWARD_JOIN) : null
}
```

文案模板（与 PRD §4 逐字一致）：`Combo ×N +bonus`；`T-Spin [档位名] +bonus`；多轴 ` · ` 分隔：`T-Spin Double +1200 · Combo ×2 +100`。

### 3.3 `createFeedback(els)` 扩展（ui.js，返回 `{ levelUp, reward, clearReward, dispose }`）

- `els` 新增可选键 `rewardToast`（DOM 节点或 falsy）：**请求兼容**——缺省时 `reward()` no-op、`dispose()`/`clearReward()` 仅处理既有槽，LEVEL UP 路径与返回键完全不变（AC-11 零回归）。
- `reward(text)`：与 `levelUp()` 同构的单定时器替换模式：
  `clearTimeout(rewardTimer) → textContent = text → hidden = false → 去 .is-showing → void offsetWidth 强制 reflow → 加 .is-showing → rewardTimer = setTimeout(…去类 hidden=true, TOAST_DURATION)`。
  只动 class/文本/定时器，无板框脉冲、无音效（AC-12）。
- `clearReward()`：`clearTimeout(rewardTimer) → 去 .is-showing → hidden = true`。
- `dispose()`：扩为「清 LEVEL UP 槽（既有行为原样）+ `clearReward()`」（DESIGN §3.3/8：OVER/restart 走既有 dispose 路径扩清双槽 0 残留）。

### 3.4 `createUI(options)` — 无签名变化

- 内部 `must('#reward-toast')` 取新节点（缺失即抛错，符合 DOM 契约惯例；index.html 同批交付）。
- `onSnapshot` 内部回调**前置追加**奖励驱动（§4），既有逻辑（renderAll/persist 写回/宿主旁路）原样保留。

---

## 4. 状态管理与触发时序

### 4.1 onSnapshot 驱动（追加在既有 `onSnapshot` 回调内、renderAll 之后）：

```js
// ① 动画期：暂存载荷（clearing 帧恒携带同一载荷，幂等覆写）
if (s.clearedIndices !== null) {
  pendingReward = { tspin: s.tspin, combo: s.combo, comboBonus: s.comboBonus,
                    cleared: s.clearedIndices.length, level: s.level }
} else if (pendingReward !== null) {
  // ② 结算帧（上次在动画、本次塌缩——pendingReward 非空即等价证明，无需 prevSnapshot）
  if (s.phase === 'OVER') {                    // AC-6：OVER 清空优先（终局反馈由遮罩承担，防闪现）
    pendingReward = null
    feedback.clearReward()
  } else {
    const text = buildRewardText(pendingReward)  // AC-5：null → 不弹
    pendingReward = null
    if (text !== null) feedback.reward(text)
  }
}
// ③ OVER / restart 清空（AC-6 0 残留：restart 结算帧必为 score=0&&lines=0&&RUNNING，无副作用覆盖首启）
if (s.phase === 'OVER' || (s.phase === 'RUNNING' && s.score === 0 && s.lines === 0)) {
  pendingReward = null
  feedback.clearReward()
}
```

### 4.2 一次奖励结算的完整时序（animMs:240 产品路径）

```
lockFlow（g L611-618）         clearing 首帧 emit → onSnapshot：创作暂存 pendingReward（s.tspin/combo/comboBonus/level 就位）
动画期 tick×N                  clearing 帧 → 幂等覆写（PAUSED 冻结自然成立：无帧即无覆写、无结算）
completeClearing（g L625-629)  finishLock：score/lines/level 落账 → emit（结算帧：clearedIndices=null、tag 三字段=null）→
                               UI ② 触发 buildRewardText → reward(text) → #reward-toast 显示
                               （同引擎调用栈随后 cb.onLevelUp → LEVEL UP 槽各自动画 → 双槽并存，AC-6/R2）
TOAST_DURATION=1600ms 后        rewardTimer 到期 → 去 is-showing + hidden（CSS 动画 12%/82%/100% 比例拉长，只动 opacity/transform）
显示期内新结算                  reward(text) 直接替换（clearTimeout+reflow 重启，不堆积）
restart / OVER 帧              clearReward() + pendingReward=null（0 残留）
```

### 4.3 状态机（奖励槽，与 DESIGN §3.3 对齐）

| 状态 | 进入 | 行为 |
|---|---|---|
| hidden | 默认 / 无奖励 / OVER / restart / 淡出完成 | `display:none`，0 残留 |
| showing | 结算帧 `buildRewardText` 非空 | 文本入 slot，动画 1600ms，独立 rewardTimer |
| replaced | showing 期内新结算文本 | clearTimeout → text → reflow → 重启动画（有替无积） |
| merged | 同帧 ≥2 轴有分 | `buildRewardText` 一次产出合并文本（AC-4） |
| suppressed | phase==='OVER' 的结算帧 / No-line / 全 0 / animMs=0 | 不弹 |

---

## 5. 关键实现点与边界

### 5.1 DOM 与样式交付（index.html / style.css）

**index.html**（`#board-frame` 内、`#feedback-toast` 之后，L78 下方）：
```html
<!-- 特殊奖励 Toast（r21/DESIGN §3；LEVEL UP 槽位后续追加，纵向错位不重叠） -->
<div id="reward-toast" role="status" aria-live="polite" hidden></div>
```

**style.css**（零新 token，全部沿用既有）：
```css
/* 基础：与 #feedback-toast 同族胶囊（§0 事实），仅三处差异：top/时长/换行 */
#reward-toast {
  position: absolute; top: 28px; left: 50%; transform: translateX(-50%);
  z-index: var(--z-toast);                          /* 20，与 LEVEL UP 同层 */
  padding: var(--sp-2) var(--sp-5); border-radius: 999px;
  background: var(--accent); color: rgba(16, 15, 22, 0.92);
  font-size: var(--fs-md); font-weight: 700; letter-spacing: 0.12em;
  max-width: min(92%, 320px);                       /* AC-9：随板框缩放、不越界 */
  white-space: normal; text-align: center;          /* 技术细化：长文案换行入胶囊，替代 nowrap 横向溢出（严守「不越界出框」） */
  box-shadow: var(--glow-accent); opacity: 0; pointer-events: none;
}
#reward-toast[hidden] { display: none; }
#reward-toast.is-showing { animation: toast-in-out 1600ms ease-out; }  /* 复用既有 keyframes，不新建；只动 opacity/transform */
/* reduced-motion 静态镜像（一条新规则，不改既有 #feedback-toast 那一条；AC-8） */
@media (prefers-reduced-motion: reduce) { #reward-toast.is-showing { opacity: 1; } }
/* r17/r19 四档断点内：S 横 fs-sm、S 竖 fs-xs（追加于既有 @media 块内，L/M 用基座 fs-md） */
```
- 动效红线：`box-shadow/backdrop-filter/filter` 不参与动画（静态值合法）；无板框 `.is-pulsing`（LEVEL UP 专属，AC-12）。
- `top:28px` 与 LEVEL UP `-12px` 纵向 stack（DESIGN 定；避开棋盘中央/Hold/Next/分数区）。

### 5.2 档位名映射（展示层，仅 ui.js）

`full:1→Single(800) / full:2→Double(1200) / full:3→Triple(1600) / mini:1→Mini(100) / mini:2→Mini Double(200) / mini:3→Triple(1600)`（数值来自 `T_SPIN_BONUS`，g L73-76；映射缺失 → 无档位名最小形态，PRD 允许）。`cleared=0`（No-line）在 §4.1 → `buildRewardText` 直接跳过（`cleared>=1` 门），与 AC-3/引擎即时路径语义一致。

### 5.3 数值同源证明（AC-2/3/7）

- Combo 轴：`comboBonus` **直读载荷**（引擎唯一出口 finishLock 已累加同一值，g L643）。
- T-Spin 轴：UI 以 `TetrisGame.tspinBonus(kind, cleared, level)` 派生——与引擎 `finishLock` 调用**同函数、同参数**（kind=载荷 tspin、cleared=clearedIndices.length、level=动画期快照=升级前 level），得数与引擎累加值恒等。无第二条计分路径，不进等级进度，不入持久化（AC-7）。
- E2E 断言料一律用公式推导值（§7.3），杜绝抄引擎实现。

### 5.4 边界清单

| # | 场景 | 行为 | 依据 |
|---|---|---|---|
| E1 | 普通单消、combo=0 且非 T-spin | 不弹（buildRewardText=null） | AC-5 |
| E2 | No-line T-spin（full×0 行，有 100×L 分） | 不弹——无 clearing 载荷不可见；`cleared>=1` 防御 | AC-3 |
| E3 | 同帧 T-spin+combo 均有分 | 1 根、` · ` 合并、各一次（文本唯一性=E2E 全串相等断言） | AC-4 |
| E4 | 显示期内新奖励 | 替换不堆积（独立 rewardTimer） | AC-6 |
| E5 | 与 LEVEL UP 同帧 | 双槽各自动画/定时器，互不删除（DOM 双节点断言） | AC-6/R2 |
| E6 | OVER 结算帧 | 抑制（防闪现）+ 清空 0 残留 | AC-6 |
| E7 | restart（含显示期） | clearReward + pendingReward=null，0 残留、无跨局 | AC-6/7 |
| E8 | 动画期内 PAUSED→恢复 | 冻结/续播自然成立（无帧无覆写，结算帧后弹） | AC-6 |
| E9 | animMs=0（reduced-motion / 主 E2E env） | **不触发**（无载荷）。CSS 镜像规则照常交付（防御） | §6.1 |
| E10 | 多轴文本超长（S 竖） | `max-width:min(92%,320px)` + normal 换行 + fs-xs 降级，永不越界出框、全轴信息可见（不省略号截断） | AC-9/R6 |
| E11 | 读屏 | `role=status` + `aria-live=polite`（奖励高频不打断；LEVEL UP assertive 零改动） | AC-8 |
| E12 | 无持久化/无跨局 | 刷新重开天然无残留 | AC-7 |

### 5.5 既有行为零回归保证

- 主 E2E 环境 animMs=0：`pendingReward` 恒 null → ②③ 分支零触发 → DOM 零变化（R3）；LEVEL UP 槽与断言零改动。
- `createFeedback` 返回键新增不删旧；`levelUp()` 代码路径不动。
- qa-e2e 新断言全部追加于文件尾新段，既有 367 断言行级零改动（AC-11）。
- 事件面：无新 sfx/事件；onSfx 序列 diff=0（AC-12，verify-game 覆盖）。

---

## 6. 决策记录

1. **R1 关闭（tspin 已透出）**：维持 PRD AC-10 默认五文件红线；不动引擎。
2. **触发位 = 结算帧（clearedIndices 非 null → null 迁移）**：与 LEVEL UP（onLevelUp 结算点）同位（AC-6）；用 `pendingReward` 非空作 clearing 证明，**不复用** renderAll 的 `justFinished`（保持奖励驱动唯一依赖载荷生命周期，杜绝双实现漂移）。
3. **animMs=0 边界声明（新增决策，向验收明示）**：reduced-motion（createUI 走 `prefersReducedMotion()→0`）与主 E2E 环境无 clearing 载荷 → 奖励 Toast 不弹。这是 0-diff 红线（AC-10）+ 数值同源（AC-7）+ 旧期望零改动（AC-11，verify-game 不在红名单）三者共同约束下的唯一可行解；若验收裁定必须覆盖，属**另立需求**（需最小扩展引擎即时路径 additite 载荷 + verify-game 追加断言 + 重声明红线清单，DESIGN 文案模板已双态兼容不阻塞）。
4. **展示档位名照表产出**（kind+cleared 齐备才精确），PRD「不强制」条款作兜底。
5. **`#reward-toast` 用 `white-space:normal`**：DESIGN §5「极端长文案撑近全宽不越界」的技术细化（换行入胶囊优于横向溢出）。

---

## 7. 测试策略

### 7.1 验证矩阵（七套收口，AC-11）

| 套件 | 状态 | 说明 |
|---|---|---|
| `node scripts/verify-game.cjs` | **0 diff** | 事件序列 119 断言、§14 T-spin 11 组、§15 combo 11 组原样全绿 |
| `node scripts/verify-audio.cjs` | **0 diff** | 24 断言原样 |
| `node scripts/verify-ui.cjs` | 仅追加（红名单） | 见 §7.2 |
| `node scripts/verify-constants.cjs` | **0 diff** | VERSION 三模块一致（本期不升版；验收登记新版本时三模块同步再跑） |
| `node scripts/assembly-check.cjs` | **0 diff** | ALL 通过 + 自包含/音频审计 |
| `node scripts/qa-e2e-jsdom.cjs` | 仅追加（红名单） | 既有 367 零改动 + r21 新段（§7.3） |
| soak | 复跑 | verify-game §15.10 50 局 + qa-e2e r21 段连跑 2 遍防抖动；UI 层无状态 → 无总分漂移 |

### 7.2 verify-ui.cjs 新增（追加新测试段，不改既有断言）

1. **常量**：`T.TOAST_DURATION === 1600`（`>= 1200 && <= 2000` 值域，AC-1）；导出存在 `T.buildRewardText`（AC-1「新增 UI API」）。
2. **buildRewardText 纯函数矩阵**（Node 无 DOM）：
   - `{combo:2, comboBonus:100, tspin:'none', cleared:1, level:1}` → `'Combo ×2 +100'`；
   - `{combo:1, comboBonus:50, tspin:'full', cleared:1, level:1}` → `'T-Spin Single +800 · Combo ×1 +50'`（AC-4 合并序）；
   - `{combo:0, comboBonus:0, tspin:'none', cleared:1, level:1}` → `null`（AC-5 全 0）；
   - `{combo:null, comboBonus:null, tspin:'full', cleared:0, level:1}` → `null`（No-line 防御，AC-3）；
   - `{combo:null, comboBonus:null, tspin:'mini', cleared:2, level:2}` → `'T-Spin Mini Double +400'`（100×2×2=400，档位名+乘数）；
   - 防御：NaN/负 level/未知 kind → null 或最小形态。
3. **源扫描**（沿 r17 T3 模式）：style.css 含 `#reward-toast`、`top: 28px`、`toast-in-out 1600ms ease-out`（动画时长值域 1200~2000 的 CSS 侧佐证）、`max-width: min(92%, 320px)`、reduced-motion 镜像规则存在且 `#feedback-toast` 那条仍含 `opacity: 1`；index.html 含 `id="reward-toast"`、`aria-live="polite"`、`role="status"`、`hidden`，且位于 `feedback-toast` 之后（序断言）。（AC-1/8/9）

### 7.3 qa-e2e-jsdom.cjs 追加（**文件末尾新段**，仿 r13 独立 env 模式）

新段：`createUI({ autoLoop:false, rng:0, sfxEngine:spy, animMs:240 })`（主 env 不动），`game3.start()`，驱动 = 直接方法调用 + `game3.tick(240)` 完结动画 + `lockTick = tick(250)×2`（LOCK_DELAY_MS=500，同 verify-game L1818）；Toast 定时器为真实 setTimeout → 淡出断言用 `sleep(1700)`（1900 > 1600，±容差确定性，R4）。断言料一律公式推导：

| 段 | 场景（种子） | 断言（AC） |
|---|---|---|
| S1 | 单消 1 行（row19 缺 col5 + I 竖 x3 y16，softDrop）combo0 | `#reward-toast` hidden（AC-5 静默） |
| S2 | 续单消 ×2（combo1→`'Combo ×1 +50'`；combo2→替换为 `'Combo ×2 +100'`）（AC-2 官方种子：L1 链 0→1→2） | 文本全串相等 + 显示；替换后仅剩新文本（AC-2/6） |
| S3 | S2 后 `game3.restart()`（显示期） | hidden（AC-6 restart 0 残留） |
| S4 | 重建链：A 单消（静默）→ `'Combo ×1 +50'` → `'Combo ×2 +100'` → `sleep(1700)` | 淡出 hidden（AC-6 1600ms） |
| S5 | T-spin Full Single（`T4 槽 {rot:3→0 inplace, lx3, ly15, clearRows:[1]}` + rotate + lockTick → clearing → tick(240)）前置无链 | `'T-Spin Single +800'`（AC-3 分档）+ 前置 1 次普通清行后同种子 → `'T-Spin Single +800 · Combo ×1 +50'` 且 `split(' · ').length===2`、双关键词俱在（AC-3/4） |
| S6 | No-line（同槽 clearRows:[]，旋转 + lockTick） | immediate 锁 → `#reward-toast` 保持 hidden（AC-3 No-line） |
| S7 | 同帧升级+奖励：4 行×2 + 3 行（lines 4/8/11，combo 0/1/2，末锁升级 L1→L2） | 结算帧 `#feedback-toast` 与 `#reward-toast` **同时** visible；奖励 `'Combo ×2 +100'`（50×2×升级前 L1=100，乘数取升级前佐证，AC-6/7/R2） |
| S8 | OVER：S7 显示期内构造出生碰撞（满层板 + 无消行锁） | OVER 帧后 `#reward-toast` hidden（AC-6 终局 0 残留） |
| S9 | DOM 契约：`#reward-toast` 存在，`aria-live='polite'`、`role='status'` | AC-8 |
| S10 | 段内 `handle3.dispose()`（含双槽清理） | 无异常（AC-11 收尾） |

> T4 槽板卡在 qa-e2e 内联构造（四个角格 + clearRows 填行，语义同 verify-game `buildTSlot`，见 §5.1/DESIGN §3 事实）；不再引入跨脚本共享别具（避组件化测试依赖）。

### 7.4 0-diff 红线核验（M4 收口命令）
`git diff --stat` 仅 5 文件 + 任务夹；`git diff game.js audio.js persist.js scripts/verify-game.cjs scripts/verify-audio.cjs scripts/verify-constants.cjs scripts/assembly-check.cjs` 为空；`verify-game` 事件序列断言 diff=0（AC-10/11/12）。

---

## 8. 任务拆分（无流水线派发任务，自建并行清单；文件边界互斥 → 可并行）

| 任务 | 文件（互斥边界） | 内容与验收点 | 依赖 |
|---|---|---|---|
| **T1 实现（ui.js）** | `/ui.js` | ① 顶部常量 `TOAST_DURATION=1600`、`REWARD_JOIN`、`T_SPIN_TIER_LABEL`；② `buildRewardText` 纯函数 + 底部导出（§3.1/3.2）；③ `createFeedback` 扩 `reward(text)`/`clearReward()`/dispose 双槽（§3.3；缺 `rewardToast` 时 no-op，既有键零变化）；④ `createUI` `must('#reward-toast')` + onSnapshot 奖励驱动（§4.1）。验收：verify-ui 新段绿（T3）+ qa-e2e S1~S10 绿（T4）；LEVEL UP 行为与断言零改动 | 无（契约已定） |
| **T2 实现（style.css + index.html）** | `/style.css`, `/index.html` | index.html `#board-frame` 内追加 `#reward-toast`（§5.1）；style.css 基础规则 + 1600ms 动画 + hidden + reduced-motion 镜像 + 四档字号降级（S 横 fs-sm / S 竖 fs-xs，追加于既有 @media 块）。验收：verify-ui 源扫描绿（T3）；手测 S/M/L 四档可见不越界 | T1 契约（常量值域），可并行 |
| **T3 测试（verify-ui.cjs）** | `/scripts/verify-ui.cjs` | §7.2 全部：常量/纯函数矩阵/源扫描。验收：本套件绿 + 既有断言零改动 | T1/T2 落地后跑通（可先行写好） |
| **T4 测试（qa-e2e-jsdom.cjs）** | `/scripts/qa-e2e-jsdom.cjs` | §7.3 S1~S10 新段追加文件尾。验收：段内全绿 + 既有 367 断言零行级改动 + 主 env 行为零变化 | T1+T2 落地后跑通 |

**并行编排**：T1 ∥ T2（互斥文件）→ T3（依赖契约，可与 T1 并行编写）→ T4（需 T1/T2 完成）→ **收口**：七套全绿复跑 + `git diff --stat` 红名单核验 + VERSION 三模块一致（verify-constants）。

**工程约束（git，源自 PRD §9，逐字携带）**：
- 分支：`feat/special-reward-toast`（当前已在）；全程保持本分支实现与提交，不并入其他分支。
- 未提交改动：`?? docs/teamflow/20260828-r21-special-reward-toast/`（本需求任务夹）属预期产物，**保留不动、随实现同批提交**；其余文件保持干净，不做 stash/clean。
- 提交：实现 + 本任务夹（PRD/TECHNICAL）同批；验收后登记 memory 产品版本（现 v3.6 → 验收时定，三模块 VERSION 同步后 verify-constants 复跑）→ 同批提交、不污染主分支。
- 产物落盘：本方案已写入 `docs/teamflow/20260828-r21-special-reward-toast/TECHNICAL.md`（夹不可变）；后续 QA/ACCEPTANCE 同夹；命令输出日志去 `logs/teamflow/<runId>/`；不写 host `docs/<role>/`。

---

## 9. 风险与缓解（增量）

| 风险 | 级别 | 缓解 |
|---|---|---|
| R1 tspin 透出 | **已关闭**（§0 核查） | verify-game §14.5 既有断言 + §7.4 红线核验双保险 |
| animMs=0 无 Toast（新增边界） | 中 | §6.3 决策记录：0-diff/同源/旧期望三项约束下的唯一解；验收人工项明示；另立需求路径已备 |
| R2 LEVEL UP 同帧覆盖 | 低 | 双槽独立定时器 + E2E S7 双节点断言 |
| R3 既有 367 断言被新 DOM 影响 | 低 | 独立挂载点 + 主 env animMs=0 零载荷 + 新段文件尾追加 |
| R4 定时器断言抖动 | 低 | 真实 setTimeout + sleep(1700)>1600 确定性（±容差） |
| R6 S 竖屏遮挡/越界 | 低 | max-width 92% + normal 换行 + fs-xs（E10） |

---

<!-- blueprint -->{"summary":"纯展示层：复用 LEVEL UP toast 子系统开第二槽位 #reward-toast，UI 在 clearing 动画期暂存引擎已透出的 combo/comboBonus/tspin 载荷、结算帧经导出纯函数 buildRewardText 合并文案后单定时器展示；引擎/音效/持久化 0 行 diff，红名单仅 ui.js/style.css/index.html/verify-ui.cjs/qa-e2e-jsdom.cjs 五件", "modules":{"/ui.js":{"responsibility":"TOAST_DURATION/REWARD_JOIN/T_SPIN_TIER_LABEL 常量 + buildRewardText 纯函数（新 UI API）+ createFeedback 扩 reward/clearReward（独立 rewardTimer）+ createUI onSnapshot 奖励驱动（pendingReward 暂存→结算帧触发→OVER/restart 清空）","dependsOn":["/game.js（tspinBonus 导出纯函数、clearing 载荷快照）"],"assemblyOrder":3,"why":"唯一需要消费结算载荷的 DOM 层：奖励判定/文案/槽位全部收敛在既有一级反馈子系统内（AC-1 不新建孤立组件），数值经导出纯函数与引擎恒等（AC-7）"},"/style.css":{"responsibility":"#reward-toast 基础规则（top:28px 胶囊同族、max-width:min(92%,320px)、normal 换行）+ .is-showing 1600ms 复用 keyframes + reduced-motion 静态镜像 + 四档字号降级","dependsOn":[],"assemblyOrder":1,"why":"视觉零新 token 沿用既定 DESIGN token（r13/r17 惯例）；长文案换行入胶囊而非横向溢出，严守不越界"},"/index.html":{"responsibility":"#board-frame 内 #feedback-toast 之后追加 #reward-toast 挂载点（role=status aria-live=polite hidden）","dependsOn":[],"assemblyOrder":1,"why":"DOM 契约收敛到既有挂载点族；独立节点避免污染既有选择器（R3），双槽并存即 AC-6 同帧可感知的载体"},"/scripts/verify-ui.cjs":{"responsibility":"+断言：TOAST_DURATION 值域 1200~2000、buildRewardText 纯函数矩阵（合并/静默/No-line 防御）、style.css/index.html 源扫描（规则/时长/aria-live/序）","dependsOn":["/ui.js"],"assemblyOrder":2,"why":"Node 无 DOM 即可锁 UI 契约（沿 T1/r17 源扫描先例），是本需求验收的数值与契约证据链"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"文件末尾追加 animMs:240 独立 env 新段 S1~S10：AC-2/3/4/5/6/7/8 的 DOM 断言（链种子/合并文本/No-line/同帧双槽/OVER-restart 清空/aria-live）","dependsOn":["/index.html","/ui.js","/style.css"],"assemblyOrder":4,"why":"主 env animMs=0 无载荷，奖励 DOM 行为只能在与产品一致的 animMs:240 环境断言（r13 先例）；追加文件尾保证既有 367 断言零行级改动（AC-11）"},"duplications":["#reward-toast 基础规则与 #feedback-toast 高度同构——有意同族（AC-1 复用子系统），非抽象沉淀对象；以注释锚定三处受控差异（top/时长/换行）","结算帧识别 = pendingReward 非空，与 renderAll 的 justFinished 派生（prevSnapshot.clearedIndices）平行——有意分源：奖励驱动只依赖载荷生命周期，避免与其共享派生逻辑造成耦合漂移（qa-e2e S 段与 r13 段交叉覆盖两者）","T4 槽测试板卡在 verify-game（buildTSlot）与 qa-e2e 各有一份内联构造——测试夹具级重复，为避免跨脚本共享引入组件化测试依赖而有意保留；几何语义以 §14/§15 为锚"]},"tasks":[{"title":"T1 实现 ui.js：常量+buildRewardText+createFeedback reward/clearReward+createUI 驱动","files":["/ui.js"],"spec":"§3/§4 契约：奖励 Toast 纯展示驱动，LEVEL UP 行为零改动，导出 TOAST_DURATION 与 buildRewardText"},{"title":"T2 实现 style.css + index.html：#reward-toast 挂载点与样式","files":["/style.css","/index.html"],"spec":"§5.1：双槽位并存、1600ms 复用 keyframes、reduced-motion 镜像、四档字号；零新 token"},{"title":"T3 verify-ui.cjs 追加：常量/纯函数/源扫描断言","files":["/scripts/verify-ui.cjs"],"spec":"§7.2 全量；既有断言零改动"},{"title":"T4 qa-e2e-jsdom.cjs 追加：animMs:240 新段 S1~S10","files":["/scripts/qa-e2e-jsdom.cjs"],"spec":"§7.3 种子与断言料；既有 367 断言零行级改动；收口七套全绿+红线核验"}]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"r21 技术方案收口（单次写入任务夹）：M1 核查关闭 R1——tspin 已随 clearing 期载荷透出（g L560/614，verify-game §14.5 锚定），No-line 走即时路径载荷恒 null；0-diff 红线保持五件套，engine/persist/其余脚本 0 行。方案=复用 LEVEL UP toast 子系统开第二槽位 #reward-toast（index.html 挂载点 aria-live=polite + style.css top:28px/1600ms 复用 keyframes/reduced-motion 镜像/四档字号，零新 token）；ui.js 新增 TOAST_DURATION=1600、buildRewardText 纯函数（comboBonus 直读+tspinBonus 导出纯函数同参派生=恒等，AC-7）、createFeedback 扩 reward/clearReward（独立 rewardTimer，缺槽 no-op 向后兼容）、createUI onSnapshot 驱动（clearing 帧暂存 pendingReward → 结算帧 buildRewardText→reward(); OVER/restart 清空）。边界声明：animMs=0（reduced-motion/主 E2E）无载荷→不弹，0-diff+同源+旧期望三约束下唯一解，验收人工项明示。E2E 新段全部追加文件尾（animMs:240 env，S1~S10 种子公式推导），既有 367 断言零行级改动。任务 T1/T2 并行→T3→T4→七套收口；分支 feat/special-reward-toast 保持，任务夹同批提交，验收登记 v3.6→下一版","memory":["R1 关闭：tspin/combo/comboBonus 已随 clearing 期快照透出（g L560-564/L614）；No-line（cleared=0）即时路径恒 null → 天然不弹（AC-3）；引擎 0 行 diff 成立","奖励 Toast 触发位=结算帧（clearedIndices 非 null→null 迁移，pendingReward 非空作证明），与 LEVEL UP 同位（AC-6）；数值=comboBonus 直读 + TetrisGame.tspinBonus(kind,cleared,level) 同参派生恒等（AC-7）","边界声明（新增）：animMs=0（reduced-motion）无 clearing 载荷 → 奖励 Toast 不弹；0-diff 红线+数值同源+旧期望零改动三约束下的唯一解，验收人工项；若需覆盖须另立需求","ui.js 契约：TOAST_DURATION=1600（1200~2000 值域）+ buildRewardText 纯函数（T-Spin 前 Combo 后、' · ' 分隔、全 0/No-line→null、档位名映射表 T_SPIN_TIER_LABEL）；createFeedback 扩 reward/clearReward（独立 rewardTimer，els.rewardToast 缺失 no-op 向后兼容）","style.css 三处受控差异（top:28px / toast-in-out 1600ms / white-space:normal 换行防越界）复用既定 keyframes 与 token；reduced-motion 镜像一条新规则","qa-e2e 新段全部追加文件尾（animMs:240 独立 env，仿 r13），主 env animMs=0 零扰动；断言料公式推导（S2 'Combo ×2 +100'、S5 'T-Spin Single +800 · Combo ×1 +50'、S7 同帧双槽 'Combo ×2 +100' 乘数取升级前 L1）","测试：verify-ui 新段（常量/纯函数矩阵/源扫描）+ qa-e2e S1~S10；七套收口+soak 复跑；git diff 红名单核验 5 文件+任务夹；分支 feat/special-reward-toast；任务夹同批提交；验收登记 memory v3.6→下一版"]}<!-- /state -->