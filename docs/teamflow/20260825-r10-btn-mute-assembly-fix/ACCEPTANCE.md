# 验收报告 — r10 btn-mute 装配修复（热修确认 · patch 模式）

- **任务夹**：`docs/teamflow/20260825-r10-btn-mute-assembly-fix/`（req-10 / runId tf-mt8kxyef-29ruxt / mode=patch）
- **验收人**：产品经理（验收负责人）　**日期**：2026-08-25
- **核验方式**：代码走查（ui.js/index.html）+ 七套验证独立复跑 + pre-fix 对照组日志对照

## 1. 验收结论

- **结论：📝 需求不适用（原始需求症状不可复现，按验收规则 3 不标 ✅）；确认单建议调整后的热修目标（修复弹层重复事件绑定）经独立核验 ✅ 验收通过，交付确认。**
- 原始需求「前端控制台报装配失败：缺少必需元素 #btn-mute」经确认单逐项核对与实际不符：`must()` 基于 `root.querySelector`，`createUI({persist})` 以 `root=document` 装配，能命中隐藏弹层内元素，该错误在当前工作树**不可复现**，assembly-check 实测 exit 0 → 按规则 3 判定**需求不适用**。
- 确认单建议调整后的目标缺陷（v3.0 弹层内「重复事件绑定」双触发）已开发交付，六套+装配全绿、e2e 3 项双触发失败消除、无回归、架构一致 → 调整后范围**验收通过**。

## 2. 逐条核对表

| # | 核对项（来源） | 核实依据（代码核验 / 独立复跑） | 结果 |
|---|---|---|---|
| 1 | 原始需求：装配中断报『缺少必需元素 #btn-mute』 | `must()` 用 document.querySelector（root=document）；#btn-mute 等仍在 #settings-modal 内 → 不抛错；assembly-check exit 0 | ✔ 确认单判定正确 → 需求不适用 |
| 2 | 确认单：不得臆造/删除 must('#btn-mute') 等必需校验 | ui.js L842-845 / 882 / 908 / 931 必需校验原样保留 | ✔ |
| 3 | 确认单 §3：音频三键/BGM/踢墙统一单一触发路径，杜绝双触发 | mute/vol± 仅 createAudioPanel 直绑（L747-749）；bgm/wallkick 仅直绑（L926/950）；ghost 恢复直绑（L901）；委托（L1059-1072）仅剩 close/backdrop 结构分支，无任何控件 id 分支 | ✔ |
| 4 | dev T1：backdrop 单次绑定（消除每次 open 追加的累积监听） | openSettingsModal（L961-981）不再追加监听，由委托统一处理 | ✔ |
| 5 | dev T1：弹层事件命名化 + dispose 对称解绑 | onSettingsBtnClick / onSettingsModalClick / ghost / bgm / wallkick 具名；dispose L1266-1274 全部对称移除 | ✔ |
| 6 | dev T1：三开关补 mousedown guard（E9 防空格/回车误触发） | 音频三键 guards（L752-756）+ 开关 guard 并入直绑区，dispose 统一清理 | ✔ |
| 7 | dev T1：修正 L1249 误导注释 | 注释已与代码一致（六控件直绑、委托仅 close/backdrop） | ✔ |
| 8 | 回归：v2.9 AC-19 / v3.0 AC-01~06 不回归 | 独立复跑七套（见 §3）：单测×4 + 装配全 exit 0；qa-e2e 230/235 | ✔ |
| 9 | 架构一致性（M3 质量门禁） | 见 §4 | ✔ 无打回项 |

## 3. 回归验证（独立复跑 · 日志 logs/teamflow/tf-mt8kxyef-29ruxt/acceptance-verify.log）

- verify-game / verify-audio / verify-ui / verify-constants：**exit 0**（0 skipped / 0 todo）
- assembly-check：**ALL CHECKS PASSED，exit 0**
- qa-e2e-jsdom：**230/235**；残余 5 项 = AC-02 弹层 is-open 添加、AC-04 is-open 移除、AC-04 ESC 关闭、AC-03 弹层内 BGM 点击、AC-04 关闭后游戏状态保持
- **修复效果归属**：pre-fix 对照组（qa-e2e-prefix.log）227/235（8 失败）→ 修复后 230/235（5 失败），消除的恰为 3 项**双触发**失败：AC-19.5 点击关闭 aria-pressed、AC-19.5 引擎联动、AC-03 弹层内踢墙开关 → 证实修复有效
- **残余 5 项**经对照组证实先于本修复存在（修复前后双向均红）、与事件绑定无关，为既有测试桩/时序缺口：
  ① AC-02/04 is-open 动画类：jsdom rAF 异步回调 vs 同步断言（迟到 rAF 给已关闭弹层补加类）；
  ② AC-04 ESC：测试向 window 派发、监听在 document，事件路径不达；
  ③ AC-03 BGM：e2e spy 未代理 startBgm/stopBgm → TypeError；
  ④ AC-04 状态保持：断言口径问题（代码核验：open/close 弹层无任何暂停/恢复调用，游戏状态自然保持）。

## 4. 架构一致性核验（M3 质量门禁）

- **遵循蓝图**：实现完整遵循确认单 §3 修复点与 dev T1 六项——“去委托之一”采用去委托 id 分支、保留直绑，六设置控件全部收敛为单一触发路径，等于把 v3.0 的混合绑定统一回团队「工厂闭包 + 单绑 + dispose」模式，属**结构性收敛**而非偏离。
- **无重复实现**：每控件恰好一个 click 绑定；委托仅保留结构性职责（close/backdrop）。
- **无适配器漂移 / 无破坏既有结构**：game.js / audio.js / persist.js / index.html / style.css / scripts 零改动（r10 唯一改动 ui.js）；must() 必需校验、AC-13/14/19 三信号镜像、焦点陷阱复用 #overlay 模式均保持。
- **补强与团队约定一致**（AGENTS.md §4 dispose() 统一清理）：具名 handler 对称解绑、backdrop 单次绑定为既有泄漏治理补强。
- **判定**：架构符合，**无打回项**。

## 5. 意见与遗留事项（收口清单）

1. 【QA 轮收口】qa-e2e 残余 5 项 harness 缺口（§3）由 QA 改脚本收口（spy 补 startBgm/stopBgm、ESC 派发至 document、rAF 等待、状态保持断言核对）；已登记 memory.md 待办。
2. 【人工补测】弹层内开关可访问性/听觉（BGM 起停）与 v3.0 AC-6/7 并列入人工补测清单（真实浏览器环境）。
3. 【过程备注】任务夹内仅 meta.json；本 patch 的 PRD 等同体（确认单）/TECHNICAL/QA 报告均在流水线上下文交付、未另行落盘——patch 模式可接受，后续建议将确认单快照写入夹内以符 ADR-0008「夹内收口」约定。
4. 【版本提交】r9+r10 合计 10 处未提交改动（index.html / style.css / ui.js / scripts×4 / memory.md），待 v3.0 正式发布时统一提交；verify-constants 存量版本漂移项沿用既有待办。

## 6. 判定汇总

- M3 质量门禁：**无架构打回项**。
- 原始需求：**📝 需求不适用**（症状不可复现，规则 3）。
- 调整后热修目标：**✅ 验收通过**（六套+装配全绿、3 项双触发失败消除、无回归、架构一致）。
- **整体：交付确认，verdict=accepted**；遗留按 §5 收口（QA harness 缺口为唯一需后续动作项）。