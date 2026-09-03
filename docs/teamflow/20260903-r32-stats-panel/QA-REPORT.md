# r32 统计面板 · QA-REPORT

> 需求：新增对局统计面板（已放置方块数 / 消行总数 / 游戏时长 三项会话指标）
> 任务夹：`docs/teamflow/20260903-r32-stats-panel/`（PRD 基线依赖 r31，纯新增无取代）
> 分支：`feat/stats-panel`；QA 执行于本工作树（7 文件 insertions-only，未提交）

## 结论（先行）

**验收就绪（acceptance-ready）**。功能测试、红线复核、架构检查、独立对抗抽查全通过；
七套验证全绿（verify-game 140 / verify-audio 24 / verify-ui 63 / verify-constants 2 /
verify-persist 23 / assembly ALL / qa-e2e **569**），独立对抗抽查 40/40（自有锚点）。
仅 1 处 P3：TECHNICAL.md §4.2 格式矩阵笔误（文档级，无行为影响）。
读屏播报、真机时长容差、横屏双轨目测等留「人工补测清单」验收（环境限制，非交付缺陷）。

## 范围与环境

- 功能范围：AC-1~AC-15（P0 13 条 / P1 AC-14 / P2 AC-15）；红线 audio/persist 0 行、VERSION 一致、旧断言零改动。
- 环境：Node（无浏览器/无图像输入）；file:// 装配与 DOM 数值经 jsdom 验证；几何/真机/读屏项列入工清单。
- 日志：`logs/teamflow/tf-mtlo4wye-pj9bfv/qa-r32-suites.log`、`qc-r32-independent.log`。

## 用例与结果

### 1. 七套验证（全部通过）
| 套件 | 结果 | 覆盖 |
|---|---|---|
| verify-game.cjs | 140 pass / 0 fail | 含 §r32 9 项（初始化、混合落定计数、非落定零计数、T-spin/No-line 计 1、消行同源 18、时长 tick≤250ms 确定性+暂停停表+OVER 定格、归零、事件面、快照键集） |
| verify-audio.cjs | 24 pass / 0 fail | 音效引擎回归 |
| verify-ui.cjs | 63 pass / 0 fail | 含 §r32 4 项（DOM 节点契约、位置隔离、formatSessionTime 矩阵、CSS 源扫描） |
| verify-constants.cjs | 2 pass / 0 fail | VERSION 三模块一致 **2.3.0**（未升级，AC-11 合规） |
| verify-persist.cjs | 23 pass / 0 fail | 持久化回归 |
| assembly-check.cjs | ALL CHECKS PASSED | 装配/自包含/音频审计；§6 顺序契约无回归 |
| qa-e2e-jsdom.cjs | **569 / 569** | 含 §r32 34 项（file:// 自动装配面板+初始值、数值等价、消行同源 `#ss-lines ≡ #lines`、10s 防刷屏零播报、独立组件写入计数、归零/停表/定格 DOM、源码级不落行式栏/不触 TOUCH_KEYS） |

### 2. 独立对抗抽查（qc-r32-independent.cjs，自有锚点 40/40）
- **计数语义（AC-2）**：硬降×3→3；move/rotate/hold 不计数；软降触底立即锁定 +1；自然锁定 500ms 恰 +1（250ms 未锁定不计数）；tick 不落定不计数。
- **时长确定性（AC-4）**：tick(250)×4→1000；暂停期偶数大 dt 停表；恢复续计→1250；OVER 定格；restart 三值归零。
- **格式锚点**：formatSessionTime 17 例矩阵（0/499/999/1000/59999/60000/3599999/3600000/3725000/3661000/负数/NaN/Infinity/'12'/undefined/null）全对。
- **防刷屏（AC-14）**：READY 零写；READY→RUNNING 首跳变恰 +1「计时开始」；30 次同态刷新零增量；→PAUSED/→RUNNING/→OVER 各恰 +1 含时长文案；同态 OVER 零增量；值仅变更时写。
- **DOM/源码级（AC-6/7/14）**：stat-grid 闭合 < #session-stats < .hold-well；.stat-grid 内恰 4 个 `.stat`（r17 冻结）；面板内无 .stat/.tkey/data-action；`#ss-time-value` 无 aria-live；`#session-announce` role=status+polite；@keyframes 声明仍恰 4；S 档 order:12 就位；竖屏 areas 含 `'session session session'` 且保留 `'hold board next'`；r32 段无 .touchpad/.tkey 交叉。
- **事件面（AC-9/10）**：硬降落定 sfx 恰 1（hardDrop）；计时 1s 零新增 sfx。

### 3. 红线复核（全部通过）
- `audio.js` / `persist.js` / `docs/teamflow/memory.md` / `AGENTS.md`：**0 行 diff**（git diff 仅 7 文件，均为 insertions-only：game +22 / ui +118 / index +18 / style +33 / verify-game +150 / verify-ui +81 / qa-e2e +173）。
- engine 行为 0 变化：game.js 纯追加闭包计数 + 快照两字段；无删除、无既有函数返回值/状态迁移改动。
- 旧断言零改动：r24~r31 期望全部原样通过；新增断言纯追加。

## 架构检查（M3 质量门）

- **蓝图核对（通过）**：TECHNICAL.md `<!-- blueprint -->` 7 模块（game.js / index.html / style.css / ui.js / 三验证脚本）与装配序 1~7 全部与交付一致，无偏差——game.js 恰在 lockFlow 唯一收口 +1、tick RUNNING 唯一累计、start/restart 归零、快照附两字段；index.html 挂载点位于 stat-grid 后 hold-well 前；style.css 文末四组追加；ui.js formatSessionTime/createSessionStats + must() 接线；三脚本 §r32 纯追加。
- **重复实现**：仅发现 1 处受控重复——`flash()` 小段（约 8 行）在 createHud 与 createSessionStats 各存一份。经查为 **blueprint 明示的有意取舍**（TECHNICAL L150「不抽公共 helper——避免触碰既有 createHud，接受 8 行内重复」），且受 e2e/断言钳制、两处均复用 HUD_FLASH_MS=120 与既有 stat-flash 关键帧。判非缺陷（受控且文档化，重构单另议）。
- **抽象缺失/结构破损**：未发现。新增导出与既有 createHud/buildRewardText 同构；无注入蓝图以外的架构漂移。

## 缺陷

| 编号 | 严重级(P0/P1/P2/P3) | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| D-1 | P3 | 文档（任务夹 TECHNICAL.md §4.2） | 阅读 verify-ui 断言矩阵行 `1000→'01:00'` | 与同文档 L206 及参考实现/断言一致：1000ms=1s → `'00:01'` | 矩阵误写 `'01:00'`；实现与全部断言均按 `'00:01'`，无行为影响 | AC-13 |

除 D-1 外**未发现缺陷**。

## 人工补测清单（环境限制，非交付缺陷）

| # | 验收项 | 方法与标准 | 工具 |
|---|---|---|---|
| M1 | 真机竖屏面板实时性与棋盘可玩性 | 375×667 / 320×568 实测：计数/时长随对局刷新，棋盘不遮档 | 真机浏览器 |
| M2 | 暂停/切后台时长停表、OVER 定格、重开归零 | 暂停与切后台各 ≥10s 后恢复：秒数不跳；OVER 冻结；Restart 回 00:00 | 真机 + 肉眼 |
| M3 | 横屏双轨/宽屏形态 | 触屏横屏出锁屏遮罩（r30 语义）；≥1024 平板横屏走面板布局，左轨 212px 内不叠压；竖屏行式栏六键一排不受扰 | 真机/desktop 视口 |
| M4 | 读屏播报防刷屏 | 屏幕阅读器：新局/暂停/继续/OVER 各播报一次，每秒时长不刷屏 | 读屏软件（NVDA/VoiceOver） |
| M5 | FPS/时长容差 | 长局 FPS 无感掉帧；对局 60s±1s 偏差 ≤1s | DevTools FPS / 秒表 |
| M6 | 闪动动效 | `.is-flashing` 数值闪动与既有 HUD 一致、reduced-motion 下关闭 | 肉眼/自查 |

## 结论

七套验证 + 独立对抗抽查全绿；红线（audio/persist/memory 0 行、VERSION 2.3.0、旧断言零改动、onSfx 事件面不变）全部守住；架构蓝图零偏差、无新增架构风险。
**判定：功能验收就绪**，可进入产品验收（人工补测 M1~M6 留接受侧）；验收通过后按 r28/r31 先例由宿主单 commit（代码 + 任务夹文档同批）。