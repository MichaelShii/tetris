# ACCEPTANCE — r18 T-spin 检测与专属计分（Tetris v3.5）

## 验收结论（先行）

**✅ 通过（accepted）**。AC-1~13 全部达成（AC-12 为 P1 可选 → 不适用）；未发现 P0/P1/P2 缺陷；七套全绿由本验收独立复跑确认；0-diff 红线成立；VERSION 三模块一致；产品版本 v3.5 随本验收登记 memory.md；分支 feat/feature 保持既定状态、未提交（提交时机 = 本批入库，host 同批执行）。

## 验收范围与独立复证

- 产物夹：`docs/teamflow/20260828-r18/`（PRD / TECHNICAL / QA-REPORT / 本 ACCEPTANCE 均已落盘）
- 基线声明：依赖 r17（响应式 AC-1~13 不回归）+ r13 lockFlow + prd §5 计分基线（100/300/500/800×level）；`取代：无`
- **独立复跑七套**（验收现场执行，日志 `logs/teamflow/tf-mtbvnx4o-0q8h9e/acc-*.log`）：verify-game **108/108**（fail 0）、qa-e2e-jsdom **366/366**、verify-audio / verify-ui / verify-constants / verify-persist / assembly-check 均 EXIT=0
- git 证据：分支 `feat/feature`；`git diff --stat` 仅 `game.js`(+90/−6) 与 `scripts/verify-game.cjs`(+511/−0) 两文件，audio/ui/style/index.html/persist 0 行 diff；r18 任务夹为未跟踪目录未触碰

## AC 逐条核对

| AC | 判定 | 依据 |
|---|---|---|
| AC-1 旋转最后动作+3×3 四角≥3 实→tspin | ✅ | §14.1 几何矩阵（0/1/2/3(F/M)/4 × 4 朝向）+ §14.2 4×3×2=24 组会话窗口（原地/左/右 kick×正负） |
| AC-2 非 T 零误报 | ✅ | §14.1 六型负例 + §14.8b J 块 4 实角会话层双层防线（tspinKind 非 T 恒 none） |
| AC-3 旋转后下落（软/硬/重力）不判 | ✅ | §14.2b E3~E6 + §14.8 严格判据（落「本可判 Mini」槽恒 100 非 200） |
| AC-4 0/1/2 实角/无旋转不判 | ✅ | §14.1 + §14.2b E7（无旋转巧合 3 实角不判） |
| AC-5 Full/Mini 划分+≥8 组权威样例 | ✅ | §14.7 F1~F8（TKI=Full 900、下凹槽=Mini 200、四实角=Full、墙侧 kick=Full） |
| AC-6 六档分值×level 精确 | ✅ | §14.3 常量逐档（full[100,800,1200,1600]/mini[0,100,200,1600]）+ 会话×L1/L2 + Mini 清 3 行=1600 防漏分 |
| AC-7 叠加恰一次、普通路径不变 | ✅ | §14.4 Full Single=900=100+800；普通单/双消逐分基线一致 |
| AC-8 clear 恰 1 次、audio 0 行 | ✅ | §14.5 事件序列（动画首帧恰 1 次、No-line 无 clear）+ verify-audio 24 + audio.js 0 diff |
| AC-9 r13/r14/r15/持久化/PAUSED/OVER 零回归 | ✅ | 既有 §1~§13 全过 + verify-persist 15 + 暂停期窗口存活抽查 |
| AC-10 50 局随机对局稳定 | ✅ | §14.6 注入旋转/移动/软硬降直至 OVER 无异常 |
| AC-11 清行计入升级、加分不推等级 | ✅ | §14.4 升级同栈、bonus 不触 lines、lose 总分含加分 |
| AC-12 P1 徽标 | 📝 不适用 | 未实现（P1 可选），不阻塞 P0 出口 |
| AC-13 七套全绿+0-diff+v3.5 登记 | ✅ | 复跑全绿 + git diff 仅两文件 + VERSION 2.3.0 一致；v3.5 本次登记 memory.md |

## 架构质量门（M3）

- 本会话未注入 blueprint JSON → 以 QA §四架构核查 + 现场代码抽查为准：模块按 meta 落地、verify-game.cjs 纯追加依依赖序、无抽象缺失。
- **单一事实来源确认**：T-spin 逻辑仅存在于 `game.js`（T_SPIN_BONUS 六档常量 + cornerSolid/tspinKind/tspinBonus 纯函数 + tspinPending 会话窗口 8 处接线 + lockFlow 消行插桩 + clearing.tspin 载荷 + finishLock 叠加恰一次 + snapshot.tspin additive 字段 + 三导出）；verify-game.cjs 仅经导出消费，**无重复实现、无结构破坏**（普通消行路径零改动）。
- VERSION 2.3.0 三模块一致（verify-constants 硬断言绿，代码头不升沿 r16/r17 先例）；node --check 静态审计 QA 已过。

## 缺陷登记（沿用 QA，P0/P1/P2 无）

- **D-1（P3/文档）**：PRD §3「三实角含对角对→Full」字面与 Mini 判例矛盾（任取 3 角必含对角对，字面化将致 Mini 不可达）；TECH §3.2「缺角在头部侧=Mini」裁定已取代，实现与裁定及 F1~F8 全一致 → 留待下轮修 PRD 措辞。
- **D-2（P3/用例）**：成功旋转后再旋转被拒（kick denied）不清窗 → 后续锁定仍判；与 AC-3 字面一致、code-inspection 确认无误报风险，缺专项用例建议补测。
- **D-3（P3/消费方）**：snapshot.tspin 无 UI 消费方（P1 徽标未实现），符合 AC-12。

## 意见与遗留

- AC-12 未实现不阻塞；后续实现按 PRD M4 补 verify-ui 断言。
- 人工补测清单（环境限制、非交付缺陷）：真机 TKI/下凹槽判定手感与分值（AC-1/5）、真机 clear 音效恰 1 次（AC-8）、真机 50 局 soak（AC-10）——并入人工补测汇总待真机环境。
- P3 观察已同步 `memory.md` 已知待办；v3.5 已登记迭代索引。
- 提交时机：本验收不提交；host 验收后同批提交（game.js + verify-game.cjs + r18 任务夹 + memory.md）。

**验收结论：✅ 通过 —— 交付满足 PRD 全部 P0 验收标准与出口硬门槛，可入库。**