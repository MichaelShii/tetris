# r23 Back-to-back 奖励倍率 — 技术方案（TECHNICAL）

> 基线依赖：`docs/teamflow/20260828-r21-special-reward-toast`（`#reward-toast` 子系统 / buildRewardText / 合并序契约）与 `docs/teamflow/20260828-r20-combo-line-clear-reward`（加成轴与会话链约定：升级前 level、断链语义、restart 归零、不入持久化；含 r18 T-spin 判定主线 verify-game §14.5 锚定）。其既定行为不得回归。
> 无取代项（纯增量，PRD §1）；`B2B_BONUS_BASE` 数值规格以本方案 §3.1 与 PRD §5 双锚定。
> 上游：`PRD.md`（AC-1~11，P0=1~9；P1=10；P2=11）→ 本方案（实现契约）。无独立 DESIGN 阶段（PRD §8 里程碑未列）；视觉沿用 r21 DESIGN 契约（零新 token），AC-10 断言入 qa-e2e B 段。
> 改动面（5 文件 + 任务夹）：`game.js` / `ui.js` / `scripts/verify-game.cjs` / `scripts/verify-ui.cjs` / `scripts/qa-e2e-jsdom.cjs`。
> 0-diff 红线（PRD §9.4）：`audio.js` / `persist.js` **0 行**；`index.html` / `style.css` **0 行**（r21 槽位全量复用）；`scripts/verify-audio.cjs` / `verify-persist.cjs` / `verify-constants.cjs` / `assembly-check.cjs` **0 行**（VERSION 三模块不动，验收登记走 memory 文档层 v3.8）。
> 事件面：onSfx 事件序列 0 变化（PRD 非目标；audio 0 行约束）。

---

## 0. 前置核查结论（M1 收口；代码事实，非推测）

| 项目 | 核查结果 | 影响 |
|---|---|---|
| R1：资格判定上游（r18 kind）可用性 | `tspinKind` 经 `lockFlow` 存入 clearing 载荷 `state.clearing.tspin`（g L614），动画期快照 `s.tspin='full'\|'mini'\|'none'`、非动画期 null（g L560，verify-game §14.5 锚定）；`finishLock` 收参 `tspin`（g L633） | **R1 关闭**：资格判定 = 纯函数复用 kind + cleared，零新引擎判定，不触碰 r18 本体 |
| 链迁移唯一出口（E3 防双计数） | `comboChain` 仅在 `finishLock` 首行更新（g L637），lockFlow 只读不迁移（g L600-602 注释「预递增禁止」） | `b2bChain` 必须同一出口——lockFlow 只读当前值计算增量、迁移一律在 finishLock 首行（见 §4.1） |
| 升级前 level 可得性 | `finishLock` 内 `state.level` 在行数累加后才更新（g L645-647）；lockFlow 计算任一奖励增量时 level 均为「本次锁升级前」值（与 r20 comboBonus 同点位 g L601-602） | B2B 乘数直接复用该点位，同约定零校准 |
| 四轴叠加出口 | 计分唯一路径 `finishLock` g L643：`base + tspinBonus + comboBonusVal`；tspin 分不进 lines（g L640-641 注释） | 在既有行内并入 `+ b2bBonusVal`，同帧四轴恰各一次、不进 lines/level（AC-5） |
| 既有套件 B2B 触发射击面（AC-8「旧期望零改动」成立性） | **逐段审计结论：既有断言零行级改动可成立**——① verify-game §14.x 全部为**单锁** T-spin 会话（`clearRows=[1]` 表示单锁清 1 行，非多次锁定；§14.4 g4 的 `[1,2]` 是一次 Double 锁），fresh 会话首锁链 off → 无增量；② §15.x 多锁会话（§15.5 例2 / §15.6）的 4 行锁前必隔非资格锁（1/2 行）→链 off；③ §15.10 soak 注入 `n = 1 + (i % 3)` 恒 1~3 行、无 T-spin → **从未出现资格事件**，且其「逐锁增量累和」取实际 `score` 差值（g L2639）→ 天然 B2B 无关；④ qa-e2e 主 env r20 段（L353：1 行→4 行；L387：1~3 行）链均 off；⑤ r21 E2E 段 S7 的**两次连续 4 行锁**（stageLines(4)×2）虽触发第 2 次 B2B=400，但该段**不断言第 2 锁的绝对分值/文案**（仅断言第 3 锁 `'Combo ×2 +100'`，而第 3 锁 3 行不资格 → b2b=0 文案不变）→ 0 行级改动 | **AC-8 零改动非妥协而是可证成立**：既有场景全部「无 B2B 触发」或「触发但未被断言」；决策 D4 + §7.4 收口核验双保险 |
| Toast 三轴扩展可行性 | `buildRewardText`（ui L174-195）为导出纯函数、`pendingReward` 暂存结构（ui L1737-1743）取自 clearing 快照；`b2bBonus` 直读载荷即可与引擎恒等（同 comboBonus 机制，AC-9 同源） | 第三路载荷 = 载荷字段 + 暂存字段 + 文案轴三处追加，无新状态、无新 DOM（AC-9 槽位/时长/aria-live 全继承 r21） |
| 快照 additivite 扩展安全性 | `snapshot()` 既有 additivite 字段（tspin/combo/comboBonus）均为**字段级追加**；verify-game / qa-e2e 对快照全部是字段断言或 `JSON.stringify` 进失败文案，无整对象 deepEqual | `s.b2bChain`（连续布尔）与 `s.b2bBonus`（clearing 期）新增安全（D2） |
| VERSION / 持久化 | game.js VERSION='2.3.0'（g L46，三模块一致）；persist.js 零触点 | VERSION 不动（0-diff）；链态会话内存不入持久化（AC-7） |

---

## 1. 总体方案

在 r20 加成轴与 r21 toast 子系统之上做**纯增量**：(a) 引擎新增**第四计分轴 `b2bBonus = B2B_BONUS_BASE × level`**（定值基数，资格 = Tetris 4 行 / T-Spin Full ≥1 行）+ **`b2bChain` 布尔会话链态**（复用 finishLock 唯一出口迁移）；(b) 结算载荷与快照新增 `b2bBonus` / `b2bChain`（addititive，生命周期对齐 combo）；(c) reward toast 扩展为 **T-Spin / Combo / B2B 三轴合并**（B2B 轴追加尾端，未触发时既有双轴文案逐字节零变化）。

数据流（纯增量，无新触发源、无新事件面、无新音效）：

```
引擎 lockFlow：kind(r18) + res.cleared → b2bQualifies() 判定资格；b2bBonus = b2bBonus(chainBefore, kind, cleared, level)
  → 增量随 clearing 载荷跨动画期传递（state.clearing.b2bBonus，杜绝重算漂移）
  → finishLock（唯一出口）：b2bChain 迁移（资格→on / 非资格→off）→ 四轴并入 score
快照：s.b2bChain（恒 boolean 会话态） / s.b2bBonus（clearing 期非 null，对齐 comboBonus）
UI onSnapshot：clearing 帧暂存 pendingReward（含 b2bBonus）→ 结算帧 buildRewardText 三轴合并 → #reward-toast
```

不改：r18 判定本体、r20 combo 链本体、audio.js / persist.js、LEVEL UP 与 r21 toast 既有行为（时长 1600ms / 替换 / OVER-restart 清空 / aria-live / reduced-motion 边界）、VERSION。

---

## 2. 数据模型与存储

### 2.1 存储
**零持久化**（persist.js 0 行 diff，AC-7）。链态为会话内存，刷新/重开天然清零；最高分等既有存储字段零变化。

### 2.2 引擎会话瞬态（game.js `createGame` 闭包内，与 comboChain 并列）

```js
// r23（AC-2/AC-7）：b2bChain 布尔会话链态——仅「锁定是否资格事件」驱动：
// 资格锁 → true；任意非资格消行 / 清 0 行（含 No-line T-spin）→ false；
// hold/旋转(含踢墙)/软硬降/重力不迁移（与 comboChain 同理，与 tspinPending 的「操作清窗」刻意分离）
// restart 归 false；初始 false；不入持久化
let b2bChain = false
```

### 2.3 clearing 载荷扩展（game.js `state.clearing`，g L614 同批）

```js
state.clearing = { indices, elapsed, res, tspin, combo, comboBonus, b2bBonus }
// b2bBonus：本次锁 B2B 增量（非资格 / 链 off → 0；资格且链 on → B2B_BONUS_BASE×level）
// 生命周期与 combo/comboBonus 完全一致：仅 cleared>0 && animMs>0 的动画期存在；
// animMs=0 即时路径与 cleared=0（含 No-line）→ 恒 null（不破坏既有消费方）
```

### 2.4 snapshot 契约扩展（game.js `snapshot()`，g L562-564 尾部追加、addititive）

| 字段 | clearing 期（animMs>0 且 cleared>0） | 其余时刻 |
|---|---|---|
| `s.b2bChain` | 恒 boolean（**当前会话链态**；动画期显示**本锁结算前**的值，结算帧后为新值） | 恒 boolean（false=off） |
| `s.b2bBonus` | 本次锁增量（≥0 数值；非资格/链 off → 0） | `null`（对齐 comboBonus 生命周期） |

`b2bChain` 连续暴露（区别于 combo 仅 clearing 期暴露）是 PRD AC-6 明示——供测试与后续 P2 指示器消费（AC-11 另立）；addititive 字段不影响既有消费方对比。

---

## 3. 接口 / API 设计

**无路由/网络、无新引擎事件**（单页零构建 file://）。新增均为：引擎导出纯函数 + 载荷/快照字段 + UI 文案轴，全部 Node 可单测。

### 3.1 game.js 常量与导出（数值单一事实来源，AC-4）

```js
// 常量区（g L79 COMBO_BONUS_BASE 之后）：
const B2B_BONUS_BASE = 400   // r23 定值基数，不随链长递增（区别于 combo）；PRD §5 单源

// 导出 +=（g L1183-1184 同批）：
B2B_BONUS_BASE, b2bQualifies, b2bBonus   // verify-game §16.0 与 qa-e2e 期望推导统一引用
```

### 3.2 引擎纯函数（game.js，tspinBonus/comboBonus 同构，Node 可单测）

```js
/** r23（AC-1）：B2B 资格判定，复用 r18 tspinKind 产物。
 * 资格 = ① cleared===4（Tetris；T 型实际至多 3 行，防御性涵盖，与 kind 无关）
 *        ② kind==='full' 且 cleared 1~3（T-Spin Full Single/Double/Triple）。
 * Mini（含 Mini 消行）、普通 1/2/3 行、cleared=0（含 No-line T-spin）→ false（AC-1/AC-2）。 */
function b2bQualifies(kind, cleared) {
  if (!(cleared >= 1)) return false
  if (cleared === 4) return true
  return kind === 'full'
}

/** r23（AC-3）：B2B 奖励 = B2B_BONUS_BASE × level；仅当「本次资格 且 chainOnBefore=true」→ 加分，否则 0。
 * level 取本次锁升级前 level（调用点 lockFlow 的 state.level）；防御：非有限数 / level<1 → 0（E6 同款）。 */
function b2bBonus(chainOnBefore, kind, cleared, level) {
  if (chainOnBefore !== true) return 0
  if (!b2bQualifies(kind, cleared)) return 0
  if (!(level >= 1)) return 0
  return B2B_BONUS_BASE * level
}
```

### 3.3 game.js 内部改动点（精确行位）

| 位置 | 改动 |
|---|---|
| `snapshot()` g L564 后 | += `b2bChain: b2bChain`、`b2bBonus: state.clearing ? state.clearing.b2bBonus : null`（§2.4） |
| `lockFlow()` g L602 后 | `const b2bVal = b2bBonus(b2bChain, kind, res.cleared, state.level)`——**只读链值、不迁移**（E3）；乘数取升级前 level（同点位） |
| g L614 clearing 载荷 | += `b2bBonus: b2bVal` |
| g L621 即时路径 | `finishLock(res.board, res.cleared, true, kind, comboIndex, comboVal, b2bVal)` |
| `completeClearing()` g L628 | `finishLock(…, cl.combo, cl.comboBonus, cl.b2bBonus)`（载荷跨动画期传递） |
| `finishLock()` g L633 | 签名 += `b2bBonusVal`；首行（comboChain 更新后）：`b2bChain = b2bQualifies(tspin, cleared) ? true : false`（唯一出口）；计分行 g L643：`+= scoreForLines(…) + bonus + comboBonusVal + b2bBonusVal`（四轴恰各一次，B2B 不触碰 lines/level） |
| `restart()` g L718 后 | += `b2bChain = false`（会话归零；OVER 为终态，出口即 restart，与 combo 同构，见 D6） |

### 3.4 ui.js 改动点（第三路载荷，AC-9）

**① `buildRewardText(payload)`**（ui L174-195，尾部新增轴；既有两轴代码逐字不动）：

```js
// 轴序：T-Spin 在前 · Combo 在后 · B2B 末尾追加（r21 合并规则扩展为三轴，AC-9）；
// B2B 轴 = 载荷 b2bBonus 直读（引擎 finishLock 已累加同一值 → 与结算恒等，AC-9 同源）；
// 防御：b2bBonus 非正数 / 缺省 → 轴跳过 → 既有双轴文案零变化（AC-9）
if (p && typeof p.b2bBonus === 'number' && p.b2bBonus > 0) {
  parts.push('B2B +' + p.b2bBonus)   // 'B2B +400'
}
```

**② onSnapshot 暂存**（ui L1737-1743）：pendingReward 结构 += `b2bBonus: s.b2bBonus`。其余（结算帧触发 / OVER-restart 清空 / ①③ 分支 / r21 D-1 守卫）零改动。

### 3.5 未触碰面（0-diff 声明）

- `index.html` / `style.css`：`#reward-toast` 槽位、1600ms keyframes、reduced-motion 镜像、四档字号、aria-live=polite 全部由 r21 交付并仍被 verify-ui 源扫描锚定 → **0 行**（AC-10 零新 token 的承载）。
- `audio.js` / onSfx：无新事件、无新音效（B2B 奖励不发声，PRD 非目标）→ **0 行**，事件序列断言 diff=0。
- `persist.js`：链态不入持久化 → **0 行**。
- `game.js` 其余：r18 `tspinKind/tspinBonus`、r20 `comboChain/comboBonus`、LEVEL UP、重力/输入管线全部 0 行。

---

## 4. 状态管理与触发时序

### 4.1 链态机（AC-2，引擎唯一出口 finishLock 首行；与 comboChain 同触点但独立变量）

| 迁入事件 | b2bChain 新值 | 说明 |
|---|---|---|
| 资格锁（Tetris 4 行 / T-Spin Full ≥1 行） | `true` | 即使此前 off 也置 on（AC-2/AC-3：断链后首资格仅置链不加分） |
| 非资格消行（普通 1/2/3 行、T-Spin Mini 消行） | `false` | AC-2 |
| 清 0 行锁定（含 No-line T-spin、普通 0 行锁） | `false` | `b2bQualifies`（cleared>=1 门）天然覆盖；与 r20 断链语义一致 |
| hold / 旋转（含踢墙）/ 软降 / 硬降 / 重力 | 不变 | 非锁定触点不迁移（与 combo 同构） |
| restart / OVER 后 restart | `false` | restart 显式归零；OVER 为终态不可观察（D6） |

加分时机（AC-3）：仅「本次资格 **且** 结算前 `b2bChain=true`」→ 恰一次 `B2B_BONUS_BASE × 升级前 level`。链断后首资格锁只置链、不加分；定值基数不随链长递增（三连 Tetris 第 3 个仍 400×level，PRD §5）。

### 4.2 一次 B2B 结算时序（animMs:240 产品路径；与 r21 §4.2 同构）

```
lockFlow（L611-618）：资格判定 + 增量计算（链不迁移）→ clearing 首帧 emit →
    onSnapshot：暂存 pendingReward（含 b2bBonus；s.b2bChain 仍为结算前值）
动画期 tick×N：幂等覆写（PAUSED 冻结自然成立）
completeClearing → finishLock：
    ① 首行 b2bChain 迁移（资格→true / 非资格→false）
    ② 四轴并入 score（恰一次）；lines/level 由既有逻辑推进（b2b 不参与）
    ③ emit 结算帧（clearedIndices=null、s.b2bBonus=null、s.b2bChain=新值）
UI：结算帧 buildRewardText 三轴合并 → reward(text) → #reward-toast（与 onLevelUp 同位）
TOAST_DURATION=1600ms 到期淡出；显示期内新结算替换（不堆积）；restart/OVER 清空
```

### 4.3 双链并行（AC-7）

`comboChain` 与 `b2bChain` 为两个独立会话变量、同锁并存推进：任一资格锁同时递增 combo 链（若清行）并置 b2b 链 on；非资格消行同时断两链；restart 同时归零。无互斥、无耦合（§16.8 / qa-e2e B2 断言「同一 clearing 帧 combo 与 b2b 增量并存」）。**不做**通用链抽象（D7）。

---

## 5. 关键实现点与边界

### 5.1 数值同源证明（AC-4/AC-9）

- 引擎唯一累加点 = `finishLock` g L643（四轴）；`b2bVal` 由 lockFlow 以导出纯函数 `b2bBonus` 计算并**跨动画期传递**（r20 同构，杜绝重算漂移）——即时路径与动画完结帧共享同一参数值。
- 快照 `s.b2bBonus` = 载荷直读 → toast `buildRewardText` 直读同一值 → **UI 数值与结算恒等**（无第二条计分路径）。
- `B2B_BONUS_BASE=400` 单源 = game.js 顶部常量；verify-game §16.0、qa-e2e B 段期望推导引用 `T.B2B_BONUS_BASE`（AGENTS §4：数值改动必同步两处单测）。
- **PRD §5 表格口径澄清（登记文档事实）**：§5 样例表（如「连发 T-Spin Single 第 2 个起 = 800+400=1200」）为**主奖励轴 + B2B 轴**的增量示意（不含普通消行基分轴与 combo 轴）；实际逐轴结算以公式为准（T-Spin Single 总增量 = 100 基分 + 800 tspin + 400 b2b = 1300）。AC-4 锁定公式，表格不引入第二套数值。

### 5.2 边界清单

| # | 场景 | 行为 | 依据 |
|---|---|---|---|
| E1 | 断链后首资格锁（fresh 首 Tetris / 首 T-Spin Full） | 链 off→on，**b2bBonus=0**（仅置链不加分）；toast 无 B2B 轴 | AC-3 |
| E2 | 连发资格锁第 2 个起 | b2bBonus = BASE×level，恰一次；三连仍定值不递增 | AC-3/PRD §5 |
| E3 | No-line T-spin（full×0 行，有 100×L 分） | cleared=0 → 不资格 → 链 off；即时路径无载荷 → toast 天然不弹（r21 边界继承） | AC-2/AC-9 |
| E4 | T-Spin Mini 消行（Mini Single/Double/Triple） | 不资格 → 链 off；tspin 轴照弹（r21 行为不变） | AC-1/2 |
| E5 | 同帧三轴（T-Spin + Combo + B2B） | 1 根、` · ` 合并，序 T-Spin·Combo·B2B，各恰一次（文本唯一性=E2E 全串断言） | AC-9/R2 |
| E6 | 升级边界（乘数取升级前） | 锁发生瞬间 s.level 未更新 → BASE×升级前 level；结算帧后 level 才推进（b2b 不参与升级） | AC-3/AC-5/R4 |
| E7 | restart（含显示期）/ OVER 显示期 | 引擎链归 false；toast clearReward + pendingReward=null 0 残留（r21 语义继承） | AC-6/7 |
| E8 | 显示期内新奖励 | 单定时器替换不堆积（r21 reward() 不变） | AC-9 |
| E9 | animMs=0（reduced-motion / 主 E2E env） | 无 clearing 载荷 → B2B toast 不触发（r21 边界声明继承，验收人工项） | AC-10 |
| E10 | 防御 | b2bBonus(…) 非有限数/level<1 → 0；NaN 载荷 b2bBonus → 轴跳过（无 NaN 文案路径） | E6 同款 |
| E11 | 读屏 | 槽位 aria-live=polite + role=status 由 r21 继承，本轮不新增 DOM | AC-10 |
| E12 | 持久化 | 链态/增量绝不出现在 persist 任何字段（0 行 diff） | AC-7 |

### 5.3 既有行为零回归保证（AC-8）

- 主 E2E env（animMs:0）无载荷 → 奖励驱动分支零触发；`s.b2bChain` 为 addititive 字段，主 env 对快照无整对象断言（§0 审计表）。
- `buildRewardText` 对缺省/0 `b2bBonus` 跳轴 → verify-ui 既有矩阵（无 b2bBonus 字段）逐字不变。
- verify-game §14.x/§15.x 既有断言零行级改动（§0 审计表 + §7.4 收口核验）。
- onSfx 事件序列 0 变化（B2B 无配套音效，PRD 非目标）。

---

## 6. 决策记录

1. **D1 链迁移唯一出口 finishLock 首行**：与 comboChain 同构（E3 防双计数），lockFlow 只读链值算增量——动画期快照 `s.b2bChain` 显示结算前值、结算帧后为新值（语义自洽，§4.2）。
2. **D2 暴露形态**：`s.b2bChain` 连续布尔暴露（PRD AC-6 明示、P2 指示器消费面）；`s.b2bBonus` 生命周期完全对齐 `comboBonus`（仅 clearing 期非 null）——两字段 addititive，不破坏既有消费方。
3. **D3 toast 轴序 = T-Spin · Combo · B2B（B2B 追加尾端）**：未触发时既有双轴文案与合并序逐字节零变化（AC-9），三轴并存时有确定序（qa-e2e B5 全串断言）。
4. **D4 既有套件零改动成立（审计结论）**：§0 表逐段核对——既有场景「无 B2B 触发」或「触发但无分值/文案断言」（r21 S7 双 4 行锁）。零行级改动非妥协而是可证；§7.4 以 git diff + 复跑双保险。
5. **D5 乘数点位 = lockFlow 的 `state.level`**（升级前，与 r20 同点位）；升级边界（R4）以 §16.5 + qa-e2e 显式断言「结算帧前 level 乘数」锁定。
6. **D6 OVER 链归零 = restart 出口**：OVER 为终态（唯一出口 restart），链值在 OVER 态不可观察、restart 显式归 false——与 combo 完全一致，不增加 OVER 分支（保持单出口纯度）。
7. **D7 不做双链通用抽象**：combo（计数递增）与 b2b（布尔资格）语义/暴露形态不同，抽象反而引入适配层漂移；并列实现、各自测试段锁定契约。
8. **D8 `b2bQualifies(cleared===4)` 与 kind 无关**：Tetris 定义即 4 行清除（T 型实际至多 3 行），防御性涵盖任何 4 行清除；不引入「非 T-spin」额外门（避免对 r18 kind 语义的二次解释）。

---

## 7. 测试策略

### 7.1 验证矩阵（七套收口，AC-8/AC-14）

| 套件 | 状态 | 说明 |
|---|---|---|
| `node scripts/verify-game.cjs` | 仅追加（红名单） | 新增 §16 r23 套件（§16.0~§16.10）；既有 §14/§15 断言零行级改动 |
| `node scripts/verify-ui.cjs` | 仅追加（红名单） | buildRewardText B2B 轴矩阵 + 缺省/防御（既有矩阵零改动） |
| `node scripts/qa-e2e-jsdom.cjs` | 仅追加（红名单） | **文件尾**新增 animMs:240 独立 env B1~B9；既有断言零行级改动 |
| `node scripts/verify-audio.cjs` / `verify-persist.cjs` / `verify-constants.cjs` / `assembly-check.cjs` | **0 diff** | VERSION 三模块不动；自包含/音频审计照常 |
| soak | 复跑 | verify-game §16.10（B2B 感知）+ 既有 §15.10（自动兼容，§0 审计）+ qa-e2e 新段连跑 2 遍防抖动 |
| 0-diff 核验（§7.4） | 收口命令 | `git diff --stat` 仅 5 代码文件 + 任务夹 |

### 7.2 verify-game.cjs 新增 §16（文件尾追加，仿 §15 结构）

| 段 | 场景（种子公式） | 断言（AC） |
|---|---|---|
| §16.0 | 常量/导出 | `T.B2B_BONUS_BASE===400`；`b2bQualifies` 矩阵（4 行→true 与 kind 无关；full:1/2/3→true；mini:1/2/3→false；普通 1/2/3 行→false；cleared 0 任意 kind→false）；`b2bBonus` 数值表（chain off→0；不资格→0；400×1/×2）+ 防御（NaN/level<1/负 →0） | AC-1/4/E6 |
| §16.1 | 链递增：`comboStageLines(g,4)` ×2（fresh 首锁即 4 行） | 首锁 clearing `s.b2bBonus===0`（链 off）、结算帧 `s.b2bChain===true`；二锁 clearing `s.b2bBonus===400`（`T.B2B_BONUS_BASE×1`）；分数：800 → 800+(800+400)=2000；lines=8、level=1（b2b 不进等级） | AC-2/3/5 |
| §16.2 | 断链：4 行 → `comboStageLines(g,1)` → 4 行；No-line 断链（T4 槽 `clearRows:[]` 即时锁 → 4 行）；Mini 断链（mini 槽消 1 行 → 4 行） | 断链后 4 行锁 `s.b2bBonus===0`、结算帧 `s.b2bChain===true`（重新置链）；No-line/Mini 锁结算帧 `s.b2bChain===false` | AC-2/R1 |
| §16.3 | 操作无关：4 行（链 on）→ rotate/move/softDrop（不锁定）→ 4 行 | 二锁 `s.b2bBonus===400`（操作不迁移链） | AC-2 |
| §16.4 | 混链：4 行 → T-Spin Full Single → 4 行；T-Spin Full Double → 普通 1 行 → T-Spin Full Single | 全资格链第 2/3 锁均 400；普通 1 行断链后 T-spin 锁 b2b=0 | AC-1/2 |
| §16.5 | 公式样例（权威，qa-e2e 对齐基准）：PRD §5 六行逐步 + L2 乘数 + **升级边界（R4）** | 单 Tetris=800；连发第 2 增量 1200；单 T-Spin Single=900；连发第 2 增量 900+400=1300；连发 T-Spin Double 第 2 增量 1500+400=1900；三连第 3 仍 1200 增量；`setLines(12)` → 400×2=800；`setLines(9)` 后 4 行锁 clearing `s.level===1 && s.b2bBonus===400`、结算帧 lines=13/level=2（乘数取升级前实证） | AC-3/4/R4/D5 |
| §16.6 | 四轴叠加恰一次 + 等级进度：4 行（combo0 链 on）→ T-Spin Full Single（combo1 链 on） | 二锁增量 = 基分 100 + tspin 800 + combo 50 + b2b 400 = **1350**；总分 800+1350=2150；lines=5、level=1（b2b/combo 均不推进） | AC-5/R2 |
| §16.7 | 载荷/事件：clearing 期 `s.b2bBonus/s.b2bChain` 暴露、完结帧 b2bBonus 回 null / b2bChain 保真；clear 恰 1 次且首帧；`onGameOver` 总分 = 逐锁增量之和（含 b2b） | 事件序列与既有同构（hardDrop→clear…，无新 sfx）；`lose()` 总分含全部 b2b 增量 | AC-6/非目标：onSfx 0 变化 |
| §16.8 | 会话隔离：restart 后首锁 `s.b2bChain===false`、b2bBonus=0；OVER→restart 同；非 clearing 期 `s.b2bBonus` 恒 null；双链并行（4 行→4 行：二锁 clearing 同时 `combo===1 && comboBonus===50 && b2bBonus===400`） | AC-6/7 |
| §16.9 | 零回归：孤立单消 1/2/3/4 行 ×L1/L2 逐值 = r18/r20 基线（fresh 会话 b2b 恒 0 增量）；既有 §14/§15 复跑 | AC-8 |
| §16.10 | B2B 感知 soak：50 局确定性注入（n 周期 `3→4→4→2…` 构造相邻 4 行对 + rotate/move/soft 混合），逐锁增量累和（实际 score 差值）== `onGameOver` 总分；无 NaN/负分/异常 | AC-8/14 |

### 7.3 verify-ui.cjs 新增（追加新测试段，不改既有矩阵）

**buildRewardText 三轴矩阵**（挂 `globalThis.TetrisGame=G` 后）：
- `{combo:1, comboBonus:50, tspin:'full', cleared:1, level:1, b2bBonus:400}` → `'T-Spin Single +800 · Combo ×1 +50 · B2B +400'`（三轴合并序，AC-9）；
- `{combo:1, comboBonus:50, tspin:'none', cleared:4, level:1, b2bBonus:400}` → `'Combo ×1 +50 · B2B +400'`（Tetris 无 T-spin 轴）；
- `{combo:null, comboBonus:null, tspin:'none', cleared:4, level:1, b2bBonus:400}` → `'B2B +400'`（纯 B2B）；
- 断链/静默：`{…, b2bBonus:0}`、`{…, b2bBonus:undefined}`、`{…, b2bBonus:NaN}` → 无 B2B 轴（既有文案逐字不变，AC-9）；
- 三轴 `split(' · ').length===3` 且 `[0]` 以 `'T-Spin'` 开头、`[2]` 以 `'B2B +'` 开头（序断言）。

### 7.4 qa-e2e-jsdom.cjs 新增（**文件末尾新段**，仿 r21 段独立 env）

`createUI({ autoLoop:false, rng:0, sfxEngine:spy, animMs:240 })`（主 env animMs:0 不动）；段内自包含重声明 helpers（`stageLines/comboComplete/lockTick/tspinLock/buildTSlotQ(_mini)`，r13/r21 先例，不引跨脚本共享）；四行布景 = r20 `comboStageLines` 同构（20-n..19 全 S 缺 miss + 竖 I）。断言料一律公式推导：

| 段 | 场景（种子） | 断言（AC） |
|---|---|---|
| B1 | 首资格静默：`stageLines(4)` → clearing → tick(240)×2 | clearing `s.b2bBonus===0 && s.b2bChain===false`；结算帧 `s.b2bChain===true`、`s.b2bBonus===null`；`#reward-toast` hidden（分数 800，未断言分值） | AC-1/3/6 |
| B2 | 连发第 2：`stageLines(4)` ×2 | 二锁 clearing `s.b2bBonus===400 && s.comboBonus===50 && s.b2bChain===true`；结算 toast `=== 'Combo ×1 +50 · B2B +400'`；`score===2050 && lines===8 && level===1`（b2b 不进等级） | AC-3/5/9 |
| B3 | 三连定值：`stageLines(4)` ×3 | 三锁 clearing `s.b2bBonus===400`（仍 400 非 800，定值）；toast `'Combo ×2 +100 · B2B +400'`；三锁 clearing `s.level===1`（乘数取升级前，结算后 level=2） | AC-3/PRD §5/R4 |
| B4 | 断链：restart → 4 行 → 1 行 → 4 行 | 末锁 clearing `s.b2bBonus===0 && s.b2bChain===false`；结算帧 `s.b2bChain===true`（重新置链）；toast `'Combo ×2 +100'`（无 B2B 轴） | AC-2 |
| B5 | 三轴同帧：restart → T-spin Full Single（链 on）→ T-spin Full Single | 二锁 toast `=== 'T-Spin Single +800 · Combo ×1 +50 · B2B +400'` 且 `split(' · ').length===3`、序 T-Spin→Combo→B2B；分数 900+1350=2250（R2 四轴素材） | AC-4/9/R2 |
| B6 | No-line 断链：restart → tspinLock([1]) → tspinLock([]) → tspinLock([1]) | 末锁 clearing `s.b2bBonus===0`（No-line 断链）；结算帧 `s.b2bChain===false`（置链后） | AC-1/2/R1 |
| B7 | Mini 断链：restart → 4 行 → tspinLock mini 槽 [1] → 4 行 | Mini 锁结算帧 `s.b2bChain===false`；末锁 clearing `s.b2bBonus===0` | AC-1/2 |
| B8 | OVER/restart 清空：B2 显示期构造出生碰撞（r21 S8 塔式）→ OVER → restart | OVER 帧 `#reward-toast` hidden；restart 后 `s.b2bChain===false`（引擎归零） | AC-6/7 |
| B9 | 契约与收尾：槽位 aria-live/role 复断（r21 继承面）+ 段内 `dispose()` | 无异常（AC-10/11） | AC-10 |

### 7.4 0-diff 红线核验（收口命令）

`git diff --stat` 仅 `game.js ui.js scripts/verify-game.cjs scripts/verify-ui.cjs scripts/qa-e2e-jsdom.cjs` + 任务夹；`git diff audio.js persist.js index.html style.css scripts/verify-audio.cjs scripts/verify-persist.cjs scripts/verify-constants.cjs scripts/assembly-check.cjs` 为空；既有 §14/§15/主 env/r21 段断言 diff=0（AC-8/AC-14）；VERSION 三模块一致（verify-constants 0-diff）。

---

## 8. 任务拆分（PRD §8 M 里程碑对齐；文件边界互斥 → 可并行）

| 任务 | 文件（互斥边界） | 内容与验收点 | 依赖 |
|---|---|---|---|
| **T1 引擎 + 引擎测试** | `/game.js`, `/scripts/verify-game.cjs` | game.js：`B2B_BONUS_BASE` 常量 + `b2bQualifies/b2bBonus` 纯函数 + 导出（§3.1/3.2）；`b2bChain` 会话态 + snapshot 两字段（§2.4）；lockFlow 增量计算 + clearing 载荷 + 两路径传递（§3.3）；finishLock 链迁移 + 四轴计分（§4.1）；restart 归零。verify-game：§16.0~§16.10 文件尾追加。验收：本套件绿 + 既有断言零行级改动 | 无（契约已定） |
| **T2 toast 合并 + UI 测试** | `/ui.js`, `/scripts/verify-ui.cjs` | ui.js：`buildRewardText` B2B 轴（尾部追加，§3.4①）+ pendingReward 暂存增 `b2bBonus`（§3.4②）；既有双轴/触发/清空逻辑零改动。verify-ui：B2B 矩阵 + 防御追加（文件尾）。验收：本套件绿 + 既有矩阵零改动 | T1 载荷契约（可并行编写） |
| **T3 E2E 追加段** | `/scripts/qa-e2e-jsdom.cjs` | 文件尾新增 animMs:240 独立 env B1~B9（§7.4）。验收：段内全绿 + 既有断言零行级改动 + 主 env 行为零变化 | T1+T2 落地后跑通 |

**并行编排**：T1 →（T2 ∥ T3 编写）→ T2/T3 随 T1 落地联调 → **收口**：七套全绿复跑 + `git diff` 红名单核验（§7.4）+ soak 复跑（§16.10 + 既有 §15.10）。

**工程约束（git，源自 PRD §9，逐字携带）**：
- 分支：`feat/back-to-back-multiplier`（当前所在，保持）——开发全程不切换、不 rebase 主分支；基线 = 当前 HEAD（5029cb5）。
- 未提交改动：`?? docs/teamflow/20260829-r23-back-to-back-multiplier/`（本需求任务夹）属预期产物，**保留不动、不得 stash/删除/移动**；本 TECH 及后续 QA-REPORT/ACCEPTANCE 全部写入该夹。
- 提交：实现 + 任务夹全部文档**同批提交**至本分支（r21 先例）；先执行提交再写验收类说明。**B2B_BONUS_BASE 改动必须同步 verify-game §16.0 与 qa-e2e B 段期望**（AGENTS §4 单一事实来源）。
- 验收登记：验收通过后向 `docs/teamflow/memory.md` 迭代索引登记 r23 一行（下一版 v3.8，以验收时 memory 现行为准顺延）；不触发 memory 约定层修改（PRD §9.6）——本需求不引入新团队约定/技术栈决策。
- 产物落盘：命令输出日志去 `logs/teamflow/<runId>/`；不写 host `docs/<role>/`；AGENTS.md 不动。

---

## 9. 风险与缓解（增量）

| 风险 | 级别 | 缓解 |
|---|---|---|
| R1 Mini/Full 边界误判错触发 B2B | 中 | 资格纯函数仅消费 r18 产物 kind（F1~F8 / §14 锚定不可回归）；§16.2/B6/B7 以 No-line、Mini 断链用例显式钉死边界；D8 防御性 `cleared===4` 门 |
| R2 四轴叠加总分口径回归 | 中 | 计分单出口 finishLock 单行叠加（E3 防双计）；§16.6/B5 种子断言四轴增量 1350 与累和；onGameOver 总分=逐锁增量之和（§16.7） |
| R3 三轴合并文案 1600ms 可读性 | 低 | 槽位 max-width:min(92%,320px) + normal 换行 + 四档字号（r21 已交付）；P1 人工补测项（视觉/动效，环境限制） |
| R4 升级边界等级乘数 | 低 | §16.5（setLines(9) 场景断言结算前 level=1 × 乘数 400）与 B3（三锁 clearing s.level===1）显式锁定；与 combo 同校准 |
| R5 既有断言被新载荷/快照字段影响 | 低 | §0 审计表（零改动成立性）+ addititive 字段 + 主 env animMs=0 零载荷 + 新段文件尾追加；§7.4 收口核验 |
| R6 b2b 增量跨动画期漂移 | 低 | 增量在 lockFlow 计算一次、随载荷传递（r20 同构，杜绝重算）；finishLock 直接累加参数值不做二次推导 |

---

<!-- blueprint -->{"summary":"纯增量第四计分轴：引擎复用 finishLock 唯一出口做 b2bChain 布尔链态迁移与四轴叠加（B2B_BONUS_BASE=400×升级前 level，资格=Tetris4行/T-Spin Full≥1行），载荷/快照 addititive 透出 b2bBonus+b2bChain；UI 仅 buildRewardText 尾部追加 B2B 轴并暂存载荷字段，zero 新 DOM/token/事件面；红名单 5 文件（game/ui/verify-game/verify-ui/qa-e2e），audio/persist/index.html/style.css 0 行，既有断言零行级改动可证", "modules":{"/game.js":{"responsibility":"B2B_BONUS_BASE=400 常量、b2bQualifies/b2bBonus 纯函数、b2bChain 会话链态（finishLock 唯一出口迁移）、lockFlow 增量预计算+clearing 载荷 b2bBonus、快照 b2bChain/b2bBonus、四轴叠加计分、restart 归零、导出","dependsOn":[],"assemblyOrder":1,"why":"计分与链态唯一事实源——单一出口（E3 防双计数）+升级前 level 点位（同 combo）+纯函数导出（Node 单测与 toast 同源），是 r20 combo 的同构扩展而非新机制"},"/ui.js":{"responsibility":"buildRewardText 尾部追加 B2B 轴（载荷直读='B2B +N'，缺省/0/NaN 跳轴）+ pendingReward 暂存结构增 b2bBonus；触发/替换/清空/时序零改动","dependsOn":["/game.js（clearing 载荷快照 s.b2bBonus）"],"assemblyOrder":3,"why":"第三路载荷在既有 r21 子系统内追加一行轴+一字段——复用槽位/rewardTimer/合并序/aria-live，零新 DOM/状态/token（AC-9）；数值直读载荷与引擎恒等（AC-9 同源）"},"/scripts/verify-game.cjs":{"responsibility":"文件尾追加 §16.0~§16.10：常量/资格矩阵/链机（增/断/操作无关/混链）/PRD§5 样例+L2+升级边界/四轴叠加/载荷事件/会话隔离/零回归/B2B 感知 soak","dependsOn":["/game.js"],"assemblyOrder":2,"why":"AC-1~8 引擎证据链，Node 无 DOM 锁数值/链态机（r20 §15 同构先例）；既有 §14/§15 零改动（§0 审计可证）"},"/scripts/verify-ui.cjs":{"responsibility":"buildRewardText 三轴矩阵（合并序 split 断言/纯 B2B/断链静默/NaN 防御）文件尾追加，既有矩阵零改动","dependsOn":["/ui.js"],"assemblyOrder":2,"why":"Node 无 DOM 锁 UI 文案契约（r21 §7.2 先例）；缺省载荷矩阵即 AC-9『未触发文案零变化』的证据链"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"文件尾追加 animMs:240 独立 env B1~B9：首资格静默/连发/三连定值/断链/三轴同帧/No-line/Mini 断链/OVER-restart 清空/契约 dispose","dependsOn":["/index.html","/game.js","/ui.js"],"assemblyOrder":4,"why":"主 env animMs=0 无载荷，奖励 DOM 行为只能在产品一致 env 断言（r13/r21 先例）；文件尾追加保既有断言零行级改动（AC-8）"},"duplications":["buildRewardText 文案轴与 finishLock 计分轴平行——有意同源分离（文案序 T-Spin·Combo·B2B ≠ 计分累加序），以全串断言而非共享代码防漂移","b2bChain 与 comboChain 双链并列——有意不抽取通用链抽象（布尔资格 vs 计数递增，语义/暴露形态不同），抽象反而引入适配层漂移（决策 D7）","qa-e2e 各段内联 helpers（stageLines/tspinLock/buildTSlotQ）跨段重复——r13/r20/r21 既有惯例的有意隔离（段内自包含、不引跨脚本共享），防测试组件化耦合","snapshot b2bBonus 生命周期与 comboBonus 完全对齐（clearing 期非 null）——同一载荷生命周期约定复用，零新约定；既有快照消费方无整对象断言，addititive 安全"]}<!-- /blueprint -->

---

<!-- state -->{"phase":"tech","summary":"r23 技术方案收口（单次写入任务夹）：第四计分轴方案 B 落地契约——引擎 game.js：B2B_BONUS_BASE=400 常量、b2bQualifies(cleared===4 或 kind==='full'&&cleared>=1)/b2bBonus(chainOnBefore&&资格)×level 纯函数导出、b2bChain 布尔会话态在 finishLock 首行唯一出口迁移（资格→true/非资格消行/0行/No-line/Mini→false/restart 归零）、lockFlow 只读链值预计算增量随 clearing 载荷跨动画期传递、快照 addititive 增 b2bChain(恒布尔)+b2bBonus(clearing 期非 null 对齐 comboBonus)、finishLock 四轴叠加不及时 lines/level；UI ui.js：buildRewardText 尾部追加 B2B 轴（'B2B +N' 直读载荷同源，缺省/0/NaN 跳轴→既有双轴文案零变化）+ pendingReward 增 b2bBonus；index.html/style.css/audio/persist 0 行。关键裁定：D1 链迁移单出口（E3）、D2 暴露形态（chain 连续/bonus 对齐 combo）、D3 轴序 T-Spin·Combo·B2B、D4 既有断言零行级改动可证（§0 审计：既有会话均无连续资格锁，r21 S7 双 4 行锁触发但无分值/文案断言，§15.10 累和取实际差值天然兼容）、D5 乘数=lockFlow 升级前 level、D6 OVER 归零=restart 出口、D8 资格防御性 cleared===4；PRD§5 表格口径澄清（主奖励轴+B2B 示意，实际以公式为准）。测试：verify-game §16.0~16.10、verify-ui 三轴矩阵、qa-e2e B1~B9 均文件尾纯追加；七套收口+soak 复跑；分支 feat/back-to-back-multiplier 保持，代码与任务夹同批提交，验收登记 memory v3.8","memory":["B2B 资格判定=b2bQualifies(kind,cleared)：cleared===4（Tetris，与 kind 无关防御）或 kind==='full'&&cleared 1~3；Mini/普通 1-3 行/cleared=0（No-line）不资格；判定复用 r18 产物，零新判定","b2bChain 布尔会话态迁移唯一出口=finishLock 首行（E3 防双计数）：资格→true；非资格消行/0 行/No-line/Mini→false；hold/旋转/软硬降不迁移；restart 归零（OVER 为终态出口即 restart，与 combo 同构）；lockFlow 只读链值算增量，随 clearing 载荷跨动画期传递（杜绝重算漂移）","加分条件=本次资格且结算前链 on：b2bBonus=B2B_BONUS_BASE(400)×升级前 level（lockFlow 的 state.level 点位，与 combo 同）；断链后首资格只置链不加分；定值不随链长递增；四轴在 finishLock 单行叠加恰各一次、不进 lines/level","快照 addititive：s.b2bChain 恒布尔连续暴露（AC-6 明示）；s.b2bBonus clearing 期非 null（对齐 comboBonus 生命周期），animMs=0 无载荷→天然静默（r21 边界继承）","toast 三轴序=T-Spin·Combo·B2B（B2B 尾部追加，未触发缺省/0/NaN 跳轴→既有双轴文案逐字节零变化，AC-9）；数值=载荷 b2bBonus 直读与引擎恒等；零新 DOM/状态/token（r21 槽位全量复用，style.css/index.html 0 行）","既有断言零行级改动可证（§0 审计表）：verify-game §14 全单锁、§15 多锁 4 行前必隔非资格锁、§15.10 soak n=1~3 且累和取实际差值；qa-e2e r21 S7 双 4 行触发 b2b 但无分值/文案断言→不受影响；主 env animMs=0 零载荷","测试：verify-game §16.0~16.10（含 R4 升级边界 setLines(9) 场景、四轴 1350 种子、B2B 感知 soak）、verify-ui 三轴矩阵、qa-e2e B1~B9 全文件尾追加；七套收口+git diff 红名单核验（5 文件+任务夹）","PRD§5 表格为『主奖励轴+B2B』增量示意（T-Spin Single 实际增量=100+800+400=1300），实际以公式+AC-4 单源为准；已在 TECH 登记文档事实","0-diff：audio.js/persist.js/index.html/style.css/verify-audio/verify-persist/verify-constants/assembly-check 0 行；B2B_BONUS_BASE 改动须同步 verify-game §16.0 与 qa-e2e B 段；分支 feat/back-to-back-multiplier 保持、任务夹同批提交、验收登记 memory v3.8"}<!-- /state -->