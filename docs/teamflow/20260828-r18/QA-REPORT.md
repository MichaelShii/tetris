# QA-REPORT — r18 T-spin 检测与专属计分（Tetris v3.5）

## 结论（verdict first）

**验收就绪，未发现 P0/P1/P2 缺陷。** 七套全绿（verify-game 108/108、verify-audio 24、verify-ui 23、verify-constants 2、verify-persist 15、assembly ALL PASS、qa-e2e-jsdom 366/366）；0-diff 红线成立（git diff 仅 `game.js` + `scripts/verify-game.cjs` 两文件，audio/ui/style/index.html/persist 0 行）；对抗性抽查 5/5 通过；架构核查无 P1。登记 P3 观察 3 项（不阻塞）。产品 v3.5 登记与同批提交待验收执行。

## 一、范围与环境

- **改动面**：`game.js`（+90/−6：`T_SPIN_BONUS` 六档常量、`cornerSolid`/`tspinKind`/`tspinBonus` 纯函数、`tspinPending` 会话窗口 8 处接线、lockFlow 消行前插桩 + `finishLock(…, tspin)` 叠加、`snapshot.tspin` additive 字段、3 项导出）；`scripts/verify-game.cjs`（+511/−0，§14 纯新增）。
- **基线**：r17 响应式（七套基线）、r13 lockFlow/动画、r14 hold/触屏；分支 `feat/feature`；任务夹未跟踪（含 PRD/TECHNICAL/meta.json，QA-REPORT 为新写）。
- **环境**：沙箱禁 CDP 真浏览器 → 以 node:test 单测 + jsdom DOM E2E + 静态审计 + 对抗性 Node 抽查完成（全部沙箱合法）；输出日志集中 `logs/teamflow/tf-mtbvnx4o-0q8h9e/`。

## 二、执行命令与结果

| 套件 | 结果 |
|---|---|
| `node scripts/verify-game.cjs` | **108/108**（既有 71 + §14-1~14-8 共 37 段新用例全过，`_debug` 钩子为既有测试面） |
| `node scripts/verify-audio.cjs` | 24/24（audio.js 0 行 diff，音效契约零回归） |
| `node scripts/verify-ui.cjs` | 23/23（ui.js 0 行 diff） |
| `node scripts/verify-constants.cjs` | 2/2（EXPECTED_VERSION='2.3.0'，game/ui/audio 三模块一致；代码 VERSION 不升 ✓） |
| `node scripts/verify-persist.cjs` | 15/15（persist.js 0 行 diff） |
| `node scripts/assembly-check.cjs` | ALL CHECKS PASSED |
| `node scripts/qa-e2e-jsdom.cjs` | 366/366（含 r17 装配/触屏回归） |
| `node --check` ×5 文件 | 全部通过（结构语法） |
| 对抗抽查 `qa-r18-spotcheck.cjs` | **5/5 通过** |

## 三、验收项（AC）核查

| AC | 结论 | 依据 |
|---|---|---|
| AC-1 旋转最后动作+3×3四角≥3实→tspin | ✓ | §14.1 几何矩阵（0/1/2/3/4 实角×4 朝向）+ §14.2 4×3×2=24 组会话窗口（原地/左/右 kick × 正负） |
| AC-2 非 T 零误报 | ✓ | §14.1 六型负例 + §14.8b J 块 4 实角会话层双层防线，`tspinKind` 非 T 恒 none |
| AC-3 旋转后下落不判 | ✓ | §14.2b E3 软降触底/E4 硬降/E5 重力/E6 move + §14.8 严格判据（落「本可判 Mini」槽恒 100 非 200） |
| AC-4 0/1/2 实角或无旋转不判 | ✓ | §14.1 + §14.2b E7（无旋转巧合 3 实角不判）+ 2 实角负例 |
| AC-5 Full/Mini 划分 + ≥8 组权威样例 | ✓ | §14.7 F1~F8：TKI 经典=Full 900、下凹槽头朝上=Mini 200、四实角=Full、墙侧 kick=Full；与 PRD §3 具体判例（头朝上→底部两角+一侧角）逐例一致 |
| AC-6 六档分值 ×level 精确 | ✓ | §14.3 常量逐档断言 `full[100,800,1200,1600]/mini[0,100,200,1600]` + 会话 ×level1/2 + Mini 清 3 行=1600 |
| AC-7 叠加恰一次、普通路径不变 | ✓ | §14.4 Full Single=900=100+800；普通单/双消负例逐分基线一致（100/300×level） |
| AC-8 clear 恰 1 次、序列兼容、audio 0 行 | ✓ | §14.5 事件序列（动画路径首帧恰 1 次、No-line 无 clear）+ verify-audio 24 + audio.js 0 diff |
| AC-9 r13/r14/r15/持久化/PAUSED/OVER 零回归 | ✓ | §1~§13 既有断言全过 + verify-persist 15 + 抽查「旋转→PAUSED→RUNNING→锁定仍判」窗口存活（暂停非动作） |
| AC-10 50 局 soak | ✓ | §14.6 注入 T 旋转/移动/软硬降直至 OVER 无异常 |
| AC-11 T-spin 清行计入升级、加分不推等级 | ✓ | §14.4 升级同栈（levelLines:9 → 同栈升级）；bonus 不触 lines |
| AC-12 P1 徽标（可选） | 不适用 | T-SPIN 徽标未实现（P1 可选），不阻塞 P0；AC-13 出口不含 UI 改动 |
| AC-13 七套全绿 + 0-diff + v3.5 登记 | ✓* | 全绿见上表；`git diff --stat` 仅两文件；**v3.5 登记 memory.md 待验收入库同批执行（*需 host 按契约完成）** |

## 四、架构核查（马 M3 质量门）

- **Blueprint（TECHNICAL.md meta）符合度**：`/game.js` 模块按 blueprint 落地完整——六档常量、三纯函数、窗口状态机、lockFlow 插桩、clearing 载荷、snapshot additive、导出；`/verify-game.cjs` §14 纯追加（git +511/−0 零删改）按依赖序挂 `game.js`；`/verify-constants.cjs` 零改动充当 0-diff 红线回归托盘 ✓。
- **重复实现**：未发现。tspinKind/tspinBonus 单一事实来源在 game.js，测试通过导出消费（无漂移副本）；audio/ui/persist 无平行逻辑。
- **抽象合理性**：几何纯函数与对局状态分离（`tspinKind(board,piece)` 零闭包依赖，Node 可单测）；窗口状态收口于闭包单点，8 处接线注释逐点标注 AC；沿用工厂+闭包，无 class 侵入。
- **结构完整性**：node --check 5 文件、assembly-check（装配/自包含/音频 0 文件）全过；VERSION 2.3.0 三模块一致（产品 v3.5 属文档版本，走 memory 登记，不与代码 VERSION 混淆——符合 r18 裁定）。

## 五、缺陷登记

**未发现 P0/P1/P2 缺陷。**

| 编号 | 严重级 | 功能模块 | 复现步骤 | 期望行为 | 实际行为 | 关联验收项 |
|---|---|---|---|---|---|---|
| D-1 | P3 | 文档（PRD §3） | 逐字执行 PRD 行「三实角含对角对→Full」 | 与「Mini=脚侧两角+头部侧一角」判例可同时成立 | 正方形任取 3 角必含一对对角，字面化将致 Mini 永不可达——TECH §3.2 已裁定「缺角在头部侧=Mini」取代并以 F1~F8 固化，实现与裁定及样例全一致；建议 PRD 留待下轮修订措辞 | AC-5 |
| D-2 | P3 | game.js（窗口） | 成功旋转（窗置位）→ 再次旋转被拒（wall-kick-denied）→ 不动作锁定 | 「最后动作是旋转」语义下可判；与 AC-3 字面（仅下落类动作失效）一致 | 两处 denied return 均不清窗 → 随后锁定仍判；与主流客户端「最后成功动作」语义一致，采用 code-inspection 确认；无专项用例，建议补测 | AC-1/3 |
| D-3 | P3 | snapshot | ui.js 消费 `snapshot.tspin` | （P1 徽标未实现时）无消费方 | additive 字段仅测试暴露，UI 无消费——符合 AC-12「未实现不阻塞」；待 P1 落地时补验证 | AC-12 |

## 六、人工补测清单（环境限制，非交付缺陷）

| # | 验收项 | 方法/工具 | 说明 |
|---|---|---|---|
| 1 | AC-1/AC-5 实机手感 | 真浏览器（Edge/Chrome）手动 TKI/下凹槽操作，观察判定与分值 | 沙箱禁 CDP 真浏览器，无法自动 |
| 2 | AC-8 真机音效 | 真浏览器聆听 clear 恰好 1 次（含 T-spin 消行） | 单测已证引擎序列，真机听觉待人工 |
| 3 | AC-10 soak 实况 | 真机 50 局连续游玩稳定性 | jsdom e2e 366 全过为近似覆盖 |
| 4 | AC-12 徽标（若后续 P1） | 触发 T-spin 观察 "T-SPIN!/Mini" ≤2s、与闪白共存 | 本迭代未实现，不适用 |
| 5 | 产品 v3.5 登记 | 验收阶段写 memory.md 版本 v3.5 | host 按契约同批提交时执行 |

## 七、结论

r18 T-spin 交付**验收就绪**：判定（三实角+旋转最后动作+Full/Mini 头部侧裁定）、六档计分（×level、叠加恰一次、Mini 清 3 行防漏分、No-line 仅加分不发 clear）、窗口状态机 8 处接线、事件/快照兼容性全部经既有+新增用例与对抗抽查验证；0-diff 红线、VERSION 一致性、分支约束均满足。P3 观察与人工清单见上，不构成阻塞。