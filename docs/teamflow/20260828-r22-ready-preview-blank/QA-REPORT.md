# r22 READY 态预览留白 QA 报告 + 验收（合并，小轮精简）

**测试对象**：`ui.js` 队列渲染按 phase 门控（READY → null 留白）+ e2e 断言改写
**测试手段**：七套 Node 脚本 + playwright-core 无头 Chrome 视觉对拍（READY/RUNNING 两态截图）

## 1. 实测（AC-1）

| 态 | #next-well 绘制 | 视觉 |
|---|---|---|
| READY（未开始） | fill = 0（e2e 断言 ✓） | 三槽留白，容器/标签保留 ✅ |
| RUNNING（开始后） | fill = 12（3 槽 × 4 格，e2e 断言 ✓） | 三格队列立即出现 ✅ |

行为说明（保留 r15 透明性）：队列仍在构造期生成，start 从同一队列弹出——预览所见即开局实打序列；restart 重建队列语义不变。

## 2. 回归（AC-2）

七套全绿：verify-game 108 / verify-audio 24 / verify-ui 23 / verify-persist 15 / verify-constants 2 / assembly ALL / qa-e2e **367/367**（用例 +1：READY 留白 + 开始后渲染两条替换原 READY 渲染一条；含 r15 开关关闭/restart 重绘/file:// 管线回归）。改动足迹：`ui.js`（门控一行 + 注释 2 处）+ `qa-e2e-jsdom.cjs`（断言改写 + 新增）。

## 3. 结论

**✅ 通过。** 取代 r15 AC-1「READY 亦渲染初始 3 格」（用户裁定），其余 r15 语义（3 格窗/空槽留白/开关显隐/48×80）零回归。
