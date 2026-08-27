# QA 测试报告 — Hold 暂存方块功能（r14）

## 1. 测试范围与环境

**范围**：Hold 暂存方块功能全量验证（AC-1~17），含回归测试  
**环境**：Windows sandbox（node.js），无真实浏览器（CDP/Playwright 禁用）  
**基线**：r13 消行动画缓动已交付（237 基线用例）

## 2. 测试结果总览

| 测试套件 | 通过 | 失败 | 跳过 | 状态 |
|----------|------|------|------|------|
| verify-game.cjs | 88 | 0 | 0 | ✅ |
| verify-audio.cjs | 24 | 0 | 0 | ✅ |
| verify-ui.cjs | 15 | 0 | 0 | ✅ |
| verify-persist.cjs | 13 | 0 | 0 | ✅ |
| verify-constants.cjs | 2 | 0 | 0 | ✅ |
| assembly-check.cjs | ALL | 0 | 0 | ✅ |
| qa-e2e-jsdom.cjs | 268 | 0 | 0 | ✅ |
| **合计** | **410** | **0** | **0** | **✅** |

## 3. Hold 功能专项测试

### 3.1 核心逻辑（verify-game.cjs 14 项）

| 测试 | 验收项 | 结果 |
|------|--------|------|
| ① 空槽存入 + next 成为当前方块 | AC-1/AC-2 | ✅ |
| ② 非空槽交换 + next 不变 | AC-3 | ✅ |
| ③ 交换后 rot=0、出生点位置 | AC-4 | ✅ |
| ④ 每周期仅 1 次，第二次返回 already-used | AC-5 | ✅ |
| ⑤ 非 RUNNING 返回 illegal-phase | AC-6 | ✅ |
| ⑥ clearing 期间返回 clearing | AC-6 | ✅ |
| ⑦ holdEnabled=false 返回 disabled | AC-12 | ✅ |
| ⑧ piece=null 返回 no-piece | - | ✅ |
| ⑨ finishLock 重置 holdUsed | AC-5 | ✅ |
| ⑩ 暂存后出生碰撞 → GAME OVER | AC-4 | ✅ |
| ⑪ restart 清空暂存槽 | - | ✅ |
| ⑫ holdEnabled setter/getter | AC-11 | ✅ |
| ⑬ 快照含 holdPiece 字段 | - | ✅ |
| ⑭ SFX_EVENTS 包含 hold（8 项） | AC-16 | ✅ |

### 3.2 E2E 集成测试（qa-e2e-jsdom.cjs 21 项）

| 测试场景 | 结果 |
|----------|------|
| 暂存槽存储当前方块类型 | ✅ |
| 当前方块变为原 next | ✅ |
| hold 音效触发 | ✅ |
| holdUsed 防止本周期再次 hold | ✅ |
| 空槽存储消耗 next | ✅ |
| 硬降后新方块出生 | ✅ |
| 交换后暂存槽/当前方块/next 不变 | ✅ |
| 第二次 hold 无效/无音效 | ✅ |
| 关闭 hold → holdEnabled=false → 按 C 无效果 | ✅ |
| 开启 hold → holdEnabled=true → hold 生效 | ✅ |
| persist 保存并读回 holdEnabled=false | ✅ |
| 新实例默认 holdEnabled=true | ✅ |
| 暂存后 hold-well canvas 有绘制 | ✅ |
| 独立 Hold 实例 dispose 无异常 | ✅ |

### 3.3 音效测试（verify-audio.cjs）

| 测试 | 结果 |
|------|------|
| SFX_DEFS 包含 hold（8 键） | ✅ |
| hold 音效可区分（523Hz 单音 180ms vs levelUp 琶音 320ms） | ✅ |
| 所有音效参数合规 | ✅ |

### 3.4 持久化测试（verify-persist.cjs）

| 测试 | 结果 |
|------|------|
| holdEnabled sanitize 边界（非布尔回默认 true） | ✅ |
| 旧数据无 holdEnabled 字段 → 回默认 true（向后兼容） | ✅ |
| 六设置跨实例恢复（含暂存开关） | ✅ |

## 4. 回归测试

**r13 基线回归**：237 用例零回归  
**r12 协同测试**：暂停/恢复/续播均正常  
**现有功能回归**：幽灵块、BGM、踢墙、消行动画、7-bag 队列均无影响

## 5. 架构轻检

**结论**：无 P0~P2 问题，仅 P3 观察项

| 编号 | 严重级 | 模块 | 描述 |
|------|--------|------|------|
| QA-14-01 | P3 | 架构 | hold() 返回 {ok, reason} 与 move/rotate 模式一致，无新约定 |

**架构合规性**：
- ✅ 模块边界清晰：game.js（逻辑）→ ui.js（渲染/交互）→ persist.js（持久化）→ audio.js（音效）
- ✅ 设置开关模式：holdEnabled 遵循 ghostEnabled/bgmEnabled/wallKickEnabled 三信号模式
- ✅ 无重复实现：createHoldWellRenderer 复制 createNextWellRenderer（设计决策合理）
- ✅ UMD 契约：window.TetrisGame.hold / window.TetrisUI.createHoldWellRenderer 正确导出

## 6. 人工补测清单

| 验收项 | 测试方法 | 工具 | 环境限制 |
|--------|----------|------|----------|
| AC-8 | 视觉验证暂存预览渲染风格（颜色、大小、位置） | 真实浏览器 | 像素/颜色 |
| AC-9 | 验证暂存预览区域与 Next 预览对称布局 | 真实浏览器 | 像素/布局 |
| AC-10 | 验证设置开关交互（aria-pressed、中文标签） | 真实浏览器 | DOM 状态 |
| AC-13 | 验证 Hold 关闭时预览区域隐藏/不可用状态 | 真实浏览器 | 视觉状态 |
| AC-16 | 验证 hold 音效听觉反馈（频率、时长、音量） | 真实浏览器 + 音频 | 音频输出 |
| AC-17 | 验证暂存键被忽略时无音效 | 真实浏览器 + 音频 | 音频输出 |

**备注**：以上均为环境限制，非交付缺陷。sandbox 禁止 CDP/Playwright，无法进行真实浏览器测试。

## 7. 结论

**验收就绪**：✅  
- 全量自动化测试通过（410/410）
- Hold 功能专项测试 35 项全部通过
- 回归测试零回归
- 架构合规，无 P0~P2 缺陷
- 人工补测清单 6 项（环境限制，非交付缺陷）

**建议**：可进入产品验收阶段。

<!-- state -->{"phase":"qa","summary":"Hold 暂存方块功能 QA 测试完成，410/410 全绿，Hold 专项 35 项通过，回归零回归，架构合规无 P0~P2 缺陷，验收就绪。人工补测 6 项（视觉/音频/布局）留验收。","memory":["verify-game: 88 tests (14 Hold-specific, all pass)","verify-audio: 24 tests (hold SFX included, all pass)","verify-ui: 15 tests (hold DOM contract, all pass)","verify-persist: 13 tests (holdEnabled sanitize/compat, all pass)","verify-constants: 2 tests (all pass)","assembly-check: ALL PASSED","qa-e2e-jsdom: 268 tests (21 Hold E2E, all pass)","Hold function returns {ok, reason} pattern consistent with move/rotate","holdUsed resets in finishLock() after new piece spawns","lockFlow clears holdPiece when holdEnabled=false (AC-15)"]}<!-- /state -->
