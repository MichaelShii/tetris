# 产品验收报告（v2.7 · 7-bag 随机算法）

- **验收负责人**：产品经理
- **验收日期**：2026-08-18
- **验收 run**：tf-mt417ope-hbxksi
- **交付物版本**：v2.7（7-bag 随机算法，AC-17）

---

## 验收结论

### ✅ 通过

v2.7（7-bag 随机算法）**通过产品验收**。七套验证全绿（55/23/7/2/ALL/11/188），AC-17 六项验收标准全部通过，AC-01~16 回归全绿。架构无缺陷，变更面极小（仅 `game.js` `createQueue` 函数内部实现替换），零副作用。无 P0/P1/P2 缺陷。

---

## 逐条核对

### AC-17（7-bag 随机算法，v2.7 新增）

| 编号 | 验收标准 | 结果 | 依据 |
|---|---|---|---|
| AC-17.1 | 每袋完整性：每 7 块包含全部 7 种方块各恰好 1 次 | ✅ 通过 | verify-game 100 袋循环断言，100/100 全部完整 |
| AC-17.2 | 袋内随机排列：不同局/不同袋顺序可不同 | ✅ 通过 | verify-game 10 袋断言 ≥2 种不同排列 + 7000 块大样本分布均匀（偏差 <15%） |
| AC-17.3 | 连续两袋无重叠顺序 | ✅ 通过 | verify-game 断言 bag1 ≠ bag2 + bag3 首块合法 |
| AC-17.4 | 接口兼容：`createQueue(rng)` 签名/返回结构不变 | ✅ 通过 | verify-game 注入 rng 确定性测试 + peek 不消耗 + next 袋空补新 |
| AC-17.5 | 零副作用：不改其他模块 | ✅ 通过 | audio/ui/persist/HTML/CSS grep 无 7-bag/shuffle/bag 关键词；仅 game.js 第 283~328 行变更 |
| AC-17.6 | 回归底线：AC-01~16 全绿 + 六套验证全绿 | ✅ 通过 | qa-e2e-jsdom 188/188 + 六套验证全绿 |

### 回归验证（AC-01~16）

| 验证套件 | 结果 | 备注 |
|---|---|---|
| verify-game | **55/55 ✅** | 含 4 项 7-bag 专用用例 |
| verify-audio | **23/23 ✅** | |
| verify-ui | **7/7 ✅** | |
| verify-constants | **2/2 ✅** | VERSION 2.3.0 三模块一致 |
| assembly-check | **ALL PASSED ✅** | 导出面/选择器/CSS/脚本序/自包含/音频审计 |
| verify-persist | **11/11 ✅** | 含 BUG-P1-1 真实 Storage 形状对抗 |
| qa-e2e-jsdom | **188/188 ✅** | AC-01~17 + file:// 管线 |

### 架构一致性核验（M3 质量门禁）

| 检查项 | 结论 |
|---|---|
| 模块边界 | ✅ 7-bag 完全封装在 `createQueue` 闭包内，bag/idx 不泄露 |
| 接口契约 | ✅ `createQueue(rng) → { peek(), next() }` 签名/语义不变 |
| 数值单一事实源 | ✅ TYPES 常量复用，无重复定义 |
| 依赖方向 | ✅ game.js 不依赖 audio/ui/persist，7-bag 为纯内部实现 |
| 重复实现 | ✅ 无。bag 生命周期管理无重复路径 |
| 破坏既有结构 | ✅ 无。状态机/计分/碰撞/消行/幽灵块逻辑零改动 |
| dispose 清理 | ✅ 7-bag 闭包无订阅/定时器/资源，无需 dispose |

**架构判定：无偏离蓝图、无重复实现、无破坏既有结构。通过。**

---

## 意见与遗留事项

### 遗留人工补测（环境限制，非交付缺陷）

| 序号 | 验收项 | 验证方法 |
|---|---|---|
| 1 | 听感：7-bag 不导致音效异常 | 游戏 30 分钟，听音效/BGM 无杂音/断裂 |
| 2 | 像素：首块出生位置正确（I/O/T/S/Z/J/L 居中） | Chrome/Edge 检查 |
| 3 | 时序：DAS 170ms + 触底 500ms 不因 7-bag 偏移 | 真实浏览器 |
| 4 | 双分辨率：1920×1080 / 1366×766 无错位 | Chrome 响应式 |
| 5 | 离线：file:// 双击 index.html 即玩 | 桌面文件管理器 |
| 6 | 多浏览器：Chrome/Edge/Firefox/Safari | 四浏览器最新版 |
| 7 | 无障碍：Tab 键导航、屏幕阅读器 | NVDA/VoiceOver |

### 遗留待办（非本次阻断项）

1. **TECHNICAL.md 补 BGM 契约章节**（v2.5 遗留，非阻断）：PRD §5.4 要求 BGM 参数落盘 TECHNICAL.md，当前仍无 BGM 段。
2. **模块 VERSION 升版裁定**（v2.5 遗留，非阻断）：三模块 VERSION 仍 '2.3.0'，是否升为 '2.7.0' 由产品经理在下一文档动作一并决定。
3. **BGM 人工补测 B1~B9**（v2.5 遗留，环境限制）：听感/视觉/读屏等项待完成。

---

## 交付确认

| 交付物 | 状态 |
|---|---|
| game.js（createQueue 7-bag 替换） | ✅ 已实现 |
| scripts/verify-game.cjs（7-bag 契约用例） | ✅ 已实现 |
| scripts/qa-e2e-jsdom.cjs（7-bag 兼容修复） | ✅ 已实现 |
| docs/teamflow/prd/PRD.md（v2.7） | ✅ 已更新 |
| docs/teamflow/technical/TECHNICAL.md（v2.7） | ✅ 已更新 |
| docs/teamflow/qa/QA-REPORT.md（v2.7） | ✅ 已更新 |
| docs/teamflow/memory.md | ✅ 已更新 |
| docs/teamflow/history/v2.7/（QA 报告归档） | ✅ 已归档 |

<!-- state -->{"phase":"acceptance","summary":"v2.7（7-bag 随机算法）产品验收通过。七套验证全绿（55/23/7/2/ALL/11/188），AC-17 六项验收标准全部通过（每袋完整性/袋内随机排列/连续两袋无重叠/接口兼容/零副作用/回归底线），AC-01~16 回归全绿。架构无缺陷：7-bag 完全封装在 createQueue 闭包内，接口签名不变，零重复实现，零破坏既有结构。变更面极小仅 game.js createQueue 函数内部实现替换。无 P0/P1/P2 缺陷。遗留人工补测 7 项（环境限制）+ 待办 3 项（非阻断）。verdict: accepted","version":"v2.7","memory":["v2.7 产品验收通过：七套验证 55/23/7/2/ALL/11/188，AC-17 六项全通过，AC-01~16 回归全绿","架构核验：无偏离蓝图/无重复实现/无破坏既有结构，7-bag 封装在 createQueue 闭包内","变更面：仅 game.js createQueue 函数内部实现替换，audio/ui/persist/HTML/CSS 零改动","遗留：人工补测 7 项（环境限制）+ 待办 3 项（BGM契约/VERSION升版/BGM补测，非阻断）","交付物确认：game.js/verify-game.cjs/qa-e2e-jsdom.cjs/PRD.md/TECHNICAL.md/QA-REPORT.md/memory.md/history 全部已更新"]}<!-- /state -->