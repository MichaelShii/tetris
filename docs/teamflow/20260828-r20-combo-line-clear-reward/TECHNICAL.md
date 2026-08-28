# TECHNICAL — Combo 连消奖励（r20，重做实现 + 验收收口）

<!-- meta: summary="combo 以锁定为触点：连续清行链递增、清0行/restart 归零、hold/旋转/软硬降不断链、普通与 T-spin 可混链；计分=普通消行档位+T-spin 六档+comboBonus(50×combo×level)恰各一次、乘数取升级前 level、不进等级进度；链态为会话闭包变量不入持久化。实现仅 game.js + verify-game.cjs(§15) + qa-e2e-jsdom.cjs(L353/354/386 三处期望修正，链态推导 950/950/+500)，其余 0-diff 红线；VERSION 不变 v2.3.0，产品版本 v3.6 验收时登记。" -->

基线依赖：docs/teamflow/20260828-r20-combo-line-clear-reward/PRD.md（AC-1~12 与 §5 数值规格，本方案唯一依据）、docs/teamflow/20260828-r18（T-spin 判定/载荷/快照 additive 模式，§14 用例与 tspinSession/mk 工具可复用）、docs/teamflow/20260828-r19（语义基线，本需求取代其 #AC-12 指示器、续跑其验收收口）、docs/teamflow/20260828-r22-ready-preview-blank（当前主线 READY 预览与 e2e 断言基线）。取代：r19#AC-12（Combo 指示器 UI，移出验收归 P2）。

> 重写注记（本阶段单次写盘）：本文件为 r20 技术方案在 PRD 重写（收敛为纯引擎计分验收）后的完整版；全部代码锚点（L46/69/73/283/449/522/528/574/591/598/602/610/677/691/1145 等）已对照当前工作区 tree 复核一致，verify-game §14 工具链（mk/freshGame/fullRow/buildTSlot/lockTick/tspinSession/r18GapRow）与 qa-e2e 三处旧期望（L353=900、L354=900、L386=+200）均已核实，产出要点与 PRD 逐条对齐。

---

## 1. 范围与工程约束（继承 PRD §9，任务拆分 §8 照此执行）

| 项 | 约束 |
|---|---|
| 分支 | 保持 `feat/combo-line-clear-reward`（宿主已建，基于含 r22 合并的主线）；**不得新建/切换分支** |
| 未提交改动 | 仅保留未跟踪任务夹 `docs/teamflow/20260828-r20-combo-line-clear-reward/`（含 meta.json，runId=tf-mtcomxpq-heissu）；不清理 |
| P0 允许差分 | 仅 `game.js`、`scripts/verify-game.cjs`、`scripts/qa-e2e-jsdom.cjs` |
| 0-diff 红线 | `audio.js`、`ui.js`、`style.css`、`index.html`、持久化逻辑（persist.js）0 行 diff；verify-ui / verify-audio / verify-constants / assembly-check 全绿 |
| 版本 | 代码 VERSION 三模块一致**不变**（game.js v2.3.0）；产品版本 v3.6 于验收通过时登记 docs/teamflow/memory.md |
| 提交时机 | 遵循 r19 约定「feat/feature 不提交、验收后同批」——实现 + 任务夹产物验收通过后同批提交并合并 |
| 日志 | 命令输出写 `logs/teamflow/<runId>/`，不得散落项目根；契约文档仅写本任务夹 |
| 产物 | PRD（已入库）/TECHNICAL（本文件）/QA-REPORT/ACCEPTANCE 均写本夹，夹建后不可变、不归档不升版 |

**UI 分镜结论**：本需求零 UI 改动——combo 指示器已取代出验收范围（归 P2 另立需求）；ui.js/style.css/index.html 0-diff。前端仅消费引擎快照的新增 additive 字段（作为未来指示器数据源预留），本次不渲染、不改组件/页面结构。

## 2. 数据模型与状态

### 2.1 数值常量（单一事实来源 → game.js §1 常量区，同步 verify-game 断言）

```js
// r20（PRD §5）：combo 递增奖励基数 = 50；comboBonus = BASE × combo × level
const COMBO_BONUS_BASE = 50
```
置于 `T_SPIN_BONUS`（game.js L73~76）之后、`LOCK_DELAY_MS` 之前；**不新增任何其他常量**（档位沿用 LINE_SCORES L69 / T_SPIN_BONUS，零改动）。

### 2.2 会话闭包链态（createGame 内，与 tspinPending 同层级）

```js
// r20（AC-1/2/9）：连续清行链计数——下一次清行锁定的 combo 索引 = 当前值，锁定后 +1；
// 任意锁定清 0 行（含 No-line T-spin）归 0；hold/旋转(含踢墙)/软降/硬降/重力 均不触碰；
// restart 新周期归 0。会话内存值，不入持久化（与 tspinPending 同生命周期、不同清窗来源）
let comboChain = 0
```
置于 `let tspinPending = false`（L522）之后。**无 getter/setter、无 _debug 扩展**——链态仅由「锁定是否清行」驱动，debug 设板/设块/设行数不影响链态（qa-e2e AC-06 依赖此性质：`setLines(9)` 不打断链，见 §6）。

### 2.3 clearing 载荷扩展（lockFlow 构造，类比 r18 tspin）

```js
state.clearing = { indices, elapsed, res, tspin, combo, comboBonus } // 新增 combo / comboBonus
```
其中 `combo` = 本次锁定的链内索引（lockFlow 时刻取 `comboChain` 现值，预递增），`comboBonus` = 本次锁定 combo 奖励增量（同刻按当前 level 计算）。两值随载荷跨动画期传递至 finishLock（与 r18「判定随载荷跨动画期传递」同构，杜绝重算漂移）。

### 2.4 快照 additive 字段（snapshot()，与 r18 `tspin` 同生命周期：仅 clearing 期非 null）

```js
// r20（AC-8）：combo 链内索引与本次 comboBonus 增量；仅 clearing 期非 null
combo:      state.clearing ? state.clearing.combo : null,
comboBonus: state.clearing ? state.clearing.comboBonus : null,
```
新增字段为 additive：非 clearing 期恒 null、不破坏既有消费方对比（r18 tspin 先例已验证该模式安全）。**combo 不入持久化**：persist.js 0-diff、不序列化链态；恢复对局为全新会话 → 链态=0，恢复得分后首次清行为 combo0（符合 AC-9）。

### 2.5 存储

零新增存储。链态为进程内会话变量；localStorage 快照字段不含 combo（persist.js 不动）。

## 3. 核心算法（锁定 → 判定 → 计分，单一时钟原子处理）

### 3.1 lockFlow（L574）判定时序（即时/动画两路径共享）

1. `merged = merge(...)`、`res = clearLines(merged)`（既有，不动）；
2. tspin 判定与窗口消费既有逻辑不动（L579~580）；
3. **新增（cleared>0 时才非零）**：
   ```js
   const comboIndex = res.cleared > 0 ? comboChain : 0
   const comboVal   = res.cleared > 0 ? comboBonus(comboIndex, state.level) : 0
   ```
   乘数取**升级前** state.level（此刻 level 尚未被 finishLock 更新，与 r18 tspinBonus 同点位）；cleared=0（含 No-line T-spin）→ comboIndex=0、comboVal=0；
4. 动画路径：`state.clearing = { indices, elapsed, res, tspin, combo: comboIndex, comboBonus: comboVal }`；即时路径改为 `finishLock(res.board, res.cleared, true, kind, comboIndex, comboVal)`；
5. `completeClearing`（L602）改传 `cl.combo, cl.comboBonus`。

### 3.2 finishLock（L610）计分单点（唯一累加处，防双份漂移）

```js
function finishLock(board, cleared, playClearSfx, tspin, combo, comboBonusVal) {
  state.board = board
  comboChain = cleared > 0 ? comboChain + 1 : 0   // r20：链更新置于最前，全部出口必经（含 No-line/0 清行断链）
  const bonus = tspinBonus(tspin, cleared, state.level)          // r18 不变
  if (cleared > 0) {
    state.score += scoreForLines(cleared, state.level) + bonus + comboBonusVal  // 三轴恰各一次（AC-6）
    state.lines += cleared                                           // combo 不触碰 lines → 不进等级进度
    /* 升级判定/levelUp/sfx 逻辑不变 */
  } else if (bonus > 0) {
    state.score += bonus                                             // No-line T-spin：无 combo（comboVal=0，链已断）
  }
  /* spawn / 出生碰撞 / GAME_OVER 逻辑不变 */
}
```
要点：
- 链更新**无条件**置于函数首：0 清行锁定（AC-2 断链）、No-line T-spin（AC-2 断链）、正常清行（递增）全部走同一点，杜绝分支遗漏；
- `comboBonusVal` 由 lockFlow 随载荷传入（与 `tspin` 同模式），finishLock 不重算 → 载荷/快照/入账三处数值恒一致；
- 返回结构 `{ ok, locked, cleared, levelUp, gameOver }` **不变**（契约稳定，additive-only）；
- 出生碰撞路径（AC-9：OVER 后重开归零）不特殊处理——链在 finishLock 首行已更新，OVER 后不可锁定，restart 归零覆盖。

### 3.3 restart（L677）与周期清链

在 `tspinPending = false`（L691）同点位追加 `comboChain = 0`（r20：restart 新周期清链）。start/READY 初始即 0，无需额外处理。**move/hold/软降/硬降/rotate/重力路径零改动**（AC-3：不断链、不递增、不归零）——与 tspinPending 的「操作清窗」语义刻意分离，两者互不干扰（tspinPending 管"可否判 T-spin"，comboChain 管"链计数"）。

## 4. 契约设计（UMD，Node 可单测）

### 4.1 导出新增（game.js L1144~1155 导出块）

```js
COMBO_BONUS_BASE: COMBO_BONUS_BASE,   // 单一事实来源（verify-game §15.0 断言）
comboBonus:       comboBonus,         // 纯函数（如 tspinBonus）
```

### 4.2 纯函数

```js
/** r20（AC-5/7）：combo 递增奖励 = COMBO_BONUS_BASE × combo × level；combo=0 → 0；
 *  防御：非有限数/combo<0/level<1 → 0（与 tspinBonus 未知 kind 归 0 同风格） */
function comboBonus(combo, level) {
  if (!Number.isFinite(combo) || !Number.isFinite(level) || combo < 0 || level < 1) return 0
  return COMBO_BONUS_BASE * combo * level
}
```
数值表：`(0,1)=0、(1,1)=50、(2,1)=100、(3,1)=150、(3,2)=300、(5,3)=750`（verify-game §15.0 钉死，作为 qa-e2e 期望对齐的权威）。

### 4.3 事件/回调契约（AC-8，一律不新增）

- `onSnapshot`：快照含新增 additive `combo`/`comboBonus`（仅 clearing 期非 null，§2.4）；score 经 `snapshot.score` 透出（游戏无独立 onScore 回调，已核实，契约不含）；
- `onSfx`：clear 恰 1 次且为首帧（动画路径，r13/r18 既定）、hardDrop→clear→levelUp→gameOver 次序不变（E-SFX-04）；
- `onLevelUp`/`onGameOver`：签名不变；`onGameOver(score)` 总分 = 全部锁定得分增量之和（含全部 comboBonus，因每次锁定入账恰一次、天然成立——§15.7/§15.10 断言验证）。

## 5. 关键实现点与边界

| # | 边界 | 处理 |
|---|---|---|
| E1 | 乘数取升级前 level | lockFlow 计算 comboBonus 时 level 未更新；与 r18「乘数取升级前 state.level」一致；跨级锁（如 qa-e2e X1 锁）comboBonus 按旧级计 |
| E2 | 动画路径载荷 | combo/comboBonus 随 clearing 载荷传递，finishLock 直接使用，不重算；动画期 snapshot 暴露两字段；完结帧原子步执行 |
| E3 | 链更新唯一出口 | finishLock 首行无条件执行；0 清行/No-line 断链、清行递增、出生碰撞路径均必经，无分支遗漏面；禁止在 lockFlow 预增（会与 finishLock 双计数） |
| E4 | debug setter 不断链 | 不新增 _debug.combo 之类；setBoard/setPiece/setLines 触不到 comboChain（qa-e2e AC-06 链态依赖此：setLines(9) 只改行数不改链） |
| E5 | restart/OVER | restart 归零；OVER 后不可锁定、由 restart 覆盖；恢复对局（持久化）为新会话链态=0 |
| E6 | 防御 | comboBonus 纯函数对非有限数/负值/level<1 归 0；comboChain 恒非负整数（仅 ++/归零），无 NaN 路径 |
| E7 | additive 字段生命周期 | 与 r18 tspin 完全同构（仅 clearing 非 null），非 clearing 期消费方对比零影响 |
| E8 | 混链 | 链计数不感知类型：普通消行与 T-spin 消行锁定同走 comboChain（AC-4）|
| E9 | 动画期输入拒绝 | clearing 期输入一律拒绝（L720 既有守卫），动画期内无第二次锁定 → 载荷携带的 combo 索引与应用时 comboChain 无竞态 |

## 6. qa-e2e 三处期望修正（L353/354/386，链态推导·权威）

现 e2e 场景自 L310 restart 后共 4 次清行锁定（每次 softDrop 恰 1 次锁定，L310 前 AC-02 软降落空板为 0 清行锁、恰为断链铺垫故 A 从 combo0 起），逐锁推导如下——**先推导后改值，禁止照抄**；以 verify-game §15.5 公式样例为权威对齐：

| 锁 | 场景 | 消行 | 链索引 | level | 增量推导 | 累计 |
|---|---|---|---|---|---|---|
| A | AC-03 首锁（L334）| 1 | combo0 | L1 | 100×1 + 0 = 100 | 100 |
| B | AC-03 二锁（L350）| 4 | combo1 | L1 | 800×1 + 50×1×1 = 850 | **950** |
| X1 | AC-06 升级锁（L367，setLines(9) 后）| 1 | combo2 | L1(升级前) | 100×1 + 50×2×1 = 200 | 1150 |
| C2 | AC-06 计分锁（L385，「等级 2 下再消 1 行」）| 1 | combo3 | L2 | 100×2 + 50×3×2 = **500** | 1650 |

修正（仅 3 处断言值，行号以现文件为准；可同步更新 check label 文案防陈旧）：

- **L353** `s.score === 900` → `s.score === 950`（B 锁 combo1：累计 100+850；label「AC-06.5 4 行=800×L1（累计 100+800）」建议同步为含 combo 语义）；
- **L354** `$('#score').textContent === '900'` → `'950'`（HUD 总分同步）；
- **L386** `snap().score === before + 200` → `snap().score === before + 500`（C2 锁 combo3×L2；此时 `before`=1150，after=1650；label「L2 消 1 行 +200」→「+500」）。

**结构约束**：AC-06 块的双锁结构（L367 升级锁 X1 + L385 计分锁 C2）**必须保留**——去掉 X1 会使 C2 退化为 combo2×L1=+200，测试即失去「L2 倍率 × combo」语义（这正是 PRD 风险条款所指的链态陷阱）。链态推导表写入 QA-REPORT 供复验；若发现其他 ≥2 次清行锁定的断言位置（预期无），一律按公式重推导并记录，只改期望值、不改引擎语义。

## 7. 测试策略

### 7.1 七套验证命令（产品根下，输出日志写 logs/teamflow/<runId>/）

```
node scripts/verify-game.cjs      # 引擎（含新增 §15；既有 §14 r18 段不改）
node scripts/verify-audio.cjs     # 0-diff，全绿即证
node scripts/verify-ui.cjs        # 0-diff
node scripts/verify-constants.cjs # VERSION 三模块一致（不变）
node scripts/assembly-check.cjs   # 装配 + 自包含审计
node scripts/qa-e2e-jsdom.cjs     # DOM E2E（含三处期望修正）
```

### 7.2 verify-game §15（Combo 用例段，仿 §14 结构：工具复用 mk()/freshGame()/fullRow()/buildTSlot()/lockTick()/tspinSession()）

| 编号 | 用例 | 对应 AC |
|---|---|---|
| §15.0 | 常量/导出：COMBO_BONUS_BASE=50；comboBonus 数值表 (0,1)=0/(1,1)=50/(3,1)=150/(3,2)=300/(5,3)=750；防御 NaN/负值/level<1 → 0 | AC-5 |
| §15.1 | 链递增：固定种子连续 4 次清 1 行锁定（_debug 设板+竖 I 软降）→ 逐锁链索引 0→1→2→3（animMs:240 经 clearing 期 snapshot.combo 断言） | AC-1 |
| §15.2 | 断链：清行 → 0 清行锁定 → 清行，末次索引回 0；**No-line T-spin**（buildTSlot T4 clearRows=[] → full×0 行）断链 | AC-2 |
| §15.3 | 操作无关：链进行中依次插入 hold / rotate（含踢墙）/ 软降 / 硬降 → 下一清行锁定索引仍连续（0→1）| AC-3 |
| §15.4 | 混链：普通 1 行 → T-spin Full 1 行 → 普通 1 行 = 链 0→1→2（AC-4 样例）| AC-4 |
| §15.5 | 公式样例（权威，qa-e2e 对齐基准）：L1 combo0 消1行=100；L1 combo3 消4行=950；L2 combo3 消1行=500；L2 combo1 消1行=300；T-spin Full single combo1×L1=800+50=850 | AC-5/6/7 |
| §15.6 | 三轴叠加恰一次 + 等级进度：连续 4 次消行总 lines=Σcleared、level=levelForLines(lines)，comboBonus 未追加行数/等级 | AC-6 |
| §15.7 | 载荷/事件：clearing 期 snapshot.combo/comboBonus 暴露、完结后回 null；clear 恰 1 次且首帧；hardDrop→clear→levelUp 次序不变；onGameOver 总分=逐锁增量之和 | AC-8 |
| §15.8 | 会话隔离：restart 后首次清行 combo0（bonus 0）；OVER→restart 同；非 clearing 期快照 combo 恒 null | AC-9 |
| §15.9 | 零回归：孤立单消 1/2/3/4 行 ×L1/L2 逐值=r18（combo0 → 0 增量）；T-spin 六档经既有 §14 全量复跑（不改读）| AC-10 |
| §15.10 | soak：50 局确定性注入混合动作（旋转/移动/软硬降/多次清行 0~4 行）每局 ≥50 锁定 → 无 NaN/负分/无异常；逐锁增量累和 == onGameOver 总分（任意抽样局）| AC-11 |

### 7.3 回归策略

- 既有断言零回归原则：r18 之前全部计分断言均发生于**单锁会话**（combo0 → 增量 0 → 逐值不变），预期零改动；若有未预见的同会话二次清行断言变红，按公式重推导并以七套全绿为收口（只改期望值，不改引擎语义）；
- 0-diff 核查：`git diff --stat` 确认仅三文件差分；verify-ui/audio/constants/assembly 全绿即证红线；
- 收口顺序：T1/T2/T3 并行落地 → 七套全绿 → QA 复验（QA-REPORT）→ 验收（ACCEPTANCE、登记 v3.6 至 memory.md）→ 同批提交并合并。

## 8. 任务拆分（文件边界不相交 → 可并行；工程约束见 §1，必须逐条落实）

| 任务 | 文件 | 职责 | 验收点 |
|---|---|---|---|
| T1 引擎实现 | `game.js` | §2 常量/链态/载荷/快照字段 + §3 判定/计分/restart + §4 导出纯函数；不动其余路径 | 六点：常量表、链递增 0→3、断链(含 No-line)、四操作不断链、三轴恰一次、restart 归零 |
| T2 单元用例 | `scripts/verify-game.cjs` | 追加 §15.0~15.10（复用既有工具，不改既有断言）| node scripts/verify-game.cjs 全绿（含既有 §14）|
| T3 e2e 收口 | `scripts/qa-e2e-jsdom.cjs` | 按 §6 链态推导修正 L353/354/386 三处断言值（保留双锁结构、同步更新 label 文案）| node scripts/qa-e2e-jsdom.cjs 全绿 |
| T4 收口验证 | 三文件 + 全仓 | 七套验证全绿 + `git diff --stat` 仅三文件差分 + VERSION 一致 | AC-12 全绿；0-diff 红线成立 |

顺序：T1|T2|T3 并行（契约已在本方案钉死，T2/T3 可先按 §6/§7.2 编写断言）→ T4 收口。**git 约束（继承 PRD §9，T1~T4 全程遵守）**：保持 `feat/combo-line-clear-reward` 分支、不新建/切换；只保留未跟踪任务夹、不清理；实现与任务夹产物**验收通过后同批提交并合并**，期间不提前提交；日志写 `logs/teamflow/<runId>/`；VERSION 三模块一致不变。

<!-- blueprint -->{"summary":"combo 以会话闭包链计数 + finishLock 单点计分实现，完全复用 r18 tspin 的「判定随载荷跨动画期传递 / additive 快照字段」模式，三文件差分其余 0-diff","modules":{"/game.js":{"responsibility":"combo 链语义与计分：常量 COMBO_BONUS_BASE、纯函数 comboBonus、会话链计数 comboChain、lockFlow 判定与 clearing 载荷扩展、finishLock 三轴恰一次累加与链更新、快照 additive combo/comboBonus、restart 清链","dependsOn":[],"assemblyOrder":1,"why":"引擎是唯一可变状态持有者：链态如 tspinPending 为闭包变量（会话内存、不入持久化）；计分在 finishLock 单点累加，与 r18 tspinBonus 同点位，杜绝双份维护漂移；additive 字段生命周期对齐 r18 tspin（仅 clearing 非 null）不破坏既有消费方"},"/scripts/verify-game.cjs":{"responsibility":"§15 combo 用例段（常量/纯函数数值表、链递增、断链含 No-line、四操作不断链、混链、公式样例、三轴与等级进度、载荷事件、会话隔离、零回归、50 局 soak）","dependsOn":["/game.js"],"assemblyOrder":2,"why":"与既有 §14 r18 段同构：纯函数导出 Node 直测、会话经 mk()/freshGame() 工厂确定性构造；公式样例为 qa-e2e 期望对齐的权威基准"},"/scripts/qa-e2e-jsdom.cjs":{"responsibility":"三处旧两轴消分期望随 combo 轴修正（L353 900→950、L354 HUD 900→950、L386 +200→+500），链态推导表文档化进断言注释","dependsOn":["/game.js"],"assemblyOrder":3,"why":"DOM 装配级最终回归；期望值按场景实际链态由公式推导（PRD AC-12 条款），AC-06 双锁结构必须保留以维持 combo3×L2 语义，防链态陷阱"},"duplications":["无新增模块/无存储抽象需提取；风险点在计分路径重复——comboBonus 只允许在 lockFlow 计算一次并随载荷传入 finishLock，禁止在 scoreForLines/clearing 路径另算；链更新只有 finishLock 首行一处，禁止在 lockFlow 预增造成动画期双计数"],"tasks":[{"title":"T1 引擎实现（game.js）","files":["/game.js"],"spec":"常量+纯函数+链态+lockFlow 载荷+finishLock 三轴累加与链更新+快照 additive+restart 清链；不动 move/hold/软硬降/rotate/重力路径"},{"title":"T2 单元用例段（verify-game §15）","files":["/scripts/verify-game.cjs"],"spec":"§15.0~15.10 共 11 组用例，既有断言零改动"},{"title":"T3 e2e 三处期望修正","files":["/scripts/qa-e2e-jsdom.cjs"],"spec":"L353/354/386 按链态推导表改 950/950/+500，保留双锁结构、更新 label"},{"title":"T4 七套全绿收口","files":["/game.js","/scripts/verify-game.cjs","/scripts/qa-e2e-jsdom.cjs"],"spec":"七套验证全绿+0-diff 红线+VERSION 一致，验收后同批提交并合并（feat/combo-line-clear-reward 不提前提交）"}]}<!-- /blueprint -->

<!-- state -->{"phase":"tech","summary":"r20 TECHNICAL 完整版单次写入任务夹（重写校验：全部代码锚点与 verify-game §14 工具、qa-e2e 三处旧期望已对照当前 tree 复核一致）：combo 链=会话闭包 comboChain（锁定触点、清0行/No-line/restart 归零、四操作不断链、可混链），comboBonus=50×combo×level 乘数取升级前 level；计分仅 finishLock 单点三轴恰一次，随 clearing 载荷传 combo/comboBonus（类比 r18 tspin），快照 additive combo/comboBonus 仅 clearing 非 null；导出 COMBO_BONUS_BASE+comboBonus 纯函数；实现仅 game.js+verify-game §15（11 组用例）+qa-e2e L353/354/386 三处修正（链态推导 950/950/+500：A combo0→B combo1→X1 combo2→C2 combo3×L2，AC-06 双锁结构必须保留）；T1|T2|T3 并行→T4 七套收口；0-diff 红线/VERSION 不变/验收登记 v3.6 继承 PRD §9。","memory":["r20 TECHNICAL 已单次完整写入 docs/teamflow/20260828-r20-combo-line-clear-reward/TECHNICAL.md（重写版，含重写注记）","combo 语义定稿：comboChain 闭包变量、lockFlow 判定+finishLock 单点累加、载荷/快照 additive 对齐 r18 tspin 模式（E3/E9 防双计数与竞态）","qa-e2e 链态推导权威表：L353 950(100+850)、L354 HUD 950、L386 +500(combo3×L2)；AC-06 双锁结构为维持链态必须保留","引擎/单元/e2e 三文件并行，契约已钉死；七套全绿+VERSION 不变+v3.6 验收登记为收口；git 约束：feat/combo-line-clear-reward 验收后同批提交"],"extra":{"verifyScripts":["node scripts/verify-game.cjs","node scripts/verify-audio.cjs","node scripts/verify-ui.cjs","node scripts/verify-constants.cjs","node scripts/assembly-check.cjs","node scripts/qa-e2e-jsdom.cjs"],"modules":{"/game.js":"combo 链语义与计分（COMBO_BONUS_BASE/comboBonus 纯函数/comboChain 闭包/clearing 载荷扩展/快照 additive combo+comboBonus/finishLock 单点三轴累加+链更新/restart 清链）","/scripts/verify-game.cjs":"§15.0~15.10 combo 用例段（链/断链/操作/混链/公式/三轴/事件/隔离/回归/soak）","/scripts/qa-e2e-jsdom.cjs":"L353/354/386 三处期望修正（950/950/+500，链态推导注释化，双锁结构保留）"}},"acIndex":{"AC-1":"链递增 0→1→2→3（§15.1）","AC-2":"清0行/No-line 断链（§15.2）","AC-3":"hold/旋转(含踢墙)/软硬降不断链（§15.3）","AC-4":"普通与 T-spin 混链（§15.4）","AC-5":"comboBonus=50×combo×level（§15.0/15.5）","AC-6":"三轴恰一次不推等级进度（§15.6）","AC-7":"L2 combo3 消1行=500/L1 combo3 消4行=950（§15.5）","AC-8":"载荷/快照 additive+事件序列+onGameOver 总分（§15.7）","AC-9":"restart/OVER 归零、不入持久化（§15.8）","AC-10":"孤立单消与 r18 逐值一致（§15.9+§14 复跑）","AC-11":"50 局 soak 总分一致（§15.10）","AC-12":"七套全绿+三处期望修正+0-diff+VERSION 一致（T4）"}}<!-- /state -->