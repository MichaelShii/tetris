# QA-REPORT — r34 全局统计持久化（docs/teamflow/20260904-r34-global-stats-persistence/）

- 分支：`feat/global-stats-persistence`（HEAD `edaf348`）
- 基线：r32-stats-panel + r33-lock-move-reset（增量扩展，无取代）
- 测试范围：persist.js / game.js / ui.js / index.html / style.css / 四个 verify 脚本 + assembly + qa-e2e；本需求全部改动面。
- 环境：Windows + Node v22；jsdom（本机/DSH harness）；无真实浏览器（模型无图像输入，视觉判定项列人工补测清单）。
- 日志：`logs/teamflow/tf-mtmmceke-az4irz/qa-r34-full-*.log` + `qa-r34-independent.log`

## 一、验证执行与结果

| 套件 | 命令 | 结果 |
|---|---|---|
| verify-persist | `node scripts/verify-persist.cjs` | ✅ 30/30 pass |
| verify-game | `node scripts/verify-game.cjs` | ✅ 157/157 pass |
| verify-ui | `node scripts/verify-ui.cjs` | ✅ 66/66 pass |
| verify-audio | `node scripts/verify-audio.cjs` | ✅ 24/24 pass（0 行 diff 红线） |
| verify-constants | `node scripts/verify-constants.cjs` | ✅ 2/2 pass（VERSION 三模块 2.3.0 未动） |
| assembly-check | `node scripts/assembly-check.cjs` | ✅ ALL CHECKS PASSED（新增 saveStats 契约 + 六锚点） |
| qa-e2e-jsdom | `node scripts/qa-e2e-jsdom.cjs` | ✅ 605/605 pass |
| **独立对抗抽查** | `node logs/teamflow/tf-mtmmceke-az4irz/qa-r34-independent.cjs` | ✅ **57/57 pass**（本节自建锚点，独立于 dev 用例） |

**红线复核（git diff 证据）**：audio.js / verify-audio.cjs / verify-constants.cjs **0 行**；四个 verify 脚本的 diff 中实际删除内容行 = 0（仅 4 个 `--- a/` 文件头），§r34 段纯追加、旧期望零改动；VERSION game/ui/audio 三模块一致 2.3.0，PAYLOAD_VERSION=1 未升。

## 二、独立对抗抽查要点（qa-r34-independent.cjs，57 项）

- **persist（A1–A8）**：旧载荷（无 stats）→ 四项全 0 且 highScore/settings 原值保留；坏 JSON → 清键回默认不 throw；stats 为非对象（字符串/数字/数组）→ 清洗全 0；负/NaN→0、浮点→floor；跨实例 roundtrip（模拟刷新）累加正确且不波及 highScore；**单键覆盖风险**（saveStats 后 saveHighScore/saveSettings，stats 均保留，verify-persist §r34 混合保留用例同向锁定）；空增量不写盘返回 true；dispose 后 false；内存降级静默成功。
- **game（B1–B7）**：READY 态 flush 不发、RUNNING 才发；watermark 差值算术（flush 500 + over 余量 500 = sessionTimeMs 1000 恒等，非重复累计）；**自然 OVER 入口①**（finishLock 出生碰撞，每行留洞防消行构造）恰 1 次入账，OVER 后 tick/lose 零重复；双 lose 幂等；restart 复位水印无跨局残留；暂停中 flush 不发、恢复后只计恢复段；无 onStats 回调（旧宿主）不 throw；快照无 stats/statsAccounted 字段（键集红线）。
- **ui（C1–C2）**：formatSessionTime 契约（`1:01:01` ≥1h 无前导零，与 r32 断言一致）；createGlobalStats 部分载荷差量写、变更闪动、dispose 清定时器、空载荷 no-op。
- **DOM 全链路（D1–D4）**：file:// 自动装配 `__tetris` 就绪无 jsdom 错误；初始镜像空库存全 0 + role=group + 5 行 .global-stat；真实装配（共享 storage 注入，绕 jsdom file:// 无 localStorage）：over 定格 → 面板镜像 3/1/00:01 → **刷新等价**（新 persist+新 UI 同 storage）读回 placed=3/games=1/timeMs=1000 且 UI 镜像恢复。

## 三、AC 覆盖结论

- AC-1～AC-10 全部由七套脚本 + 独立抽查覆盖，全部通过（含 AC-2 单键增量/PAYLOAD_VERSION=1/saveStats 出口、AC-3 兼容降级、AC-4/5 幂等双入口、AC-6 刷新不丢 ≤1s 容差、AC-7 暂停不计、AC-8 面板结构与位置隔离断言、AC-9 红线、AC-10 七套全绿 + soak 无漂移（dev §4.1-9 确定性分片差值累计））。
- AC-11（P1 人工补测）→ 见下节人工补测清单，留产品验收。

## 四、人工补测清单（环境限制，非交付缺陷）

| 验收项 | 方法 | 工具 |
|---|---|---|
| 真机多标签/切后台补记时序（visibilitychange 双触发幂等） | 手机切后台 2–3s 回前台，观察全局时长仅 +1 段；再开新标签核对 | 真机（iOS Safari/Android Chrome） |
| 移动端清后台回收（页面被回收）卸载补记 | 游戏中切后台→从任务卡片划掉→重开 | 真机 |
| 进行中刷新不丢 | 游戏中刷新页面→全局时长恢复 | 任意浏览器手动 |
| 暂停不计时抽查 | 暂停挂机 1 分钟→恢复玩→OVER，全局增量不含暂停段 | 任意浏览器手动 |
| 仅含旧 highScore 存档升级迁移 | 清缓存→仅存旧载荷→刷新页面→四项从 0 起步、最高分保留 | DevTools localStorage 注入 |
| 长时间挂机时长精度 | 挂机 30 分钟看累计时长与墙钟偏差 | 任意浏览器 |
| 读屏朗读新增面板文本不刷屏 | 朗读模式游玩，确认全局统计文本节流播报 | 读屏软件（NVDA/VoiceOver） |
| 横屏双轨 / 竖屏 S 行式两组展示不叠压 | 双轨与行式底栏下确认 #global-stats 与棋盘/触控垫/系统按钮无遮挡（开发自报 S 竖屏棋盘高度 526→≈458px，需实机确认可玩性影响） | 真机横屏/竖屏 |

## 五、缺陷表

| 编号 | 严重级 | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| r34-Q1 | P3 | 架构/文档 | 核对 TECHNICAL.md §1.2「仅四处函数内新增」与 persist.js 实际 diff | 文档改动面描述与实际一致 | 实现另在 `saveHighScore`/`saveSettings` 的 merged 各补 1 行 `stats: current.stats`（单键顶端字段保全，防两入口整体写盘清掉已入账统计）——行为正确且已被 verify-persist §r34「混合保留」双向锁定，但 TECH §1.2 的「四处」范围表述遗漏这 2 处；dev 已在开发摘要披露该规范偏差 | AC-9（persist 仅增量红线） |

未发现 P0/P1/P2 缺陷。

## 六、架构轻量检查结论

- 无 injected blueprint JSON，按「蓝图缺席」模式核对：
- **重复实现**：存储封装唯一（persist.js createPersistence，ui/game/audio 均无 localStorage 直操作）；saveStats 累计唯一事实收敛 persist 层，UI 只读镜像零独立累计（AC-4）；事件出口 onStats 与既有 onSfx 同风格，无第二套入账通道。
- **抽象缺位**：createGlobalStats 与 createHud/createSessionStats 共享 ≤8 行 flash 小段非公共 helper——为不触碰既有组件的有意受控重复（r32 已接受同款理由，注释明示），非本次新增漂移。
- **结构健康**：快照键集零追加、onSfx 事件面零变化、audio 0 行、VERSION 三模块一致 2.3.0、dispose 对称清理（pagehide/beforeunload 注册侧与移除侧条件一致）、无 console/debugger/TODO 残留。
- 结论：架构符合增量扩展约束，唯一发现为上述 P3 文档范围表述偏差。

## 七、结论

**验收就绪（可流转产品验收）**：七套全绿（persist 30 / game 157 / ui 66 / audio 24 / constants 2 / assembly ALL / qa-e2e 605）+ 独立对抗抽查 57/57 零失败；红线复核通过（audio 0 行、verify 脚本旧期望零改动、VERSION 与 PAYLOAD_VERSION 未动）；AC-1～AC-10 脚本全覆盖通过。仅 1 项 P3 文档级偏差（TECH §1.2 范围描述），行为正确有测试锁定。AC-11 人工补测清单留产品验收（真机切后台/清后台/实机手感/读屏/FPS）。