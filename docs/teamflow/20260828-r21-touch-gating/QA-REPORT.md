# r21 触控键门控收窄 + 右轨遮键修复 QA 报告 + 验收（合并，小轮精简）

**测试对象**：`ui.js isTouchDevice()` 语义收窄（`(pointer: coarse)` 主指针判定）+ `style.css` 横屏侧轨键 `z-index:1`
**测试手段**：playwright-core + 系统 Chrome 无头，三场景实测 + 七套脚本

## 1. 设备门控实测（AC-1）

| 场景 | 指针媒体 | maxTouchPoints | has-touch | 触控键 |
|---|---|---|---|---|
| 触屏笔记本 PC（鼠标主指针，用户机型形态） | fine | 10 | **无** | **不渲染**（display:none）✅ |
| 手机/平板（粗指针） | coarse | — | 有 | 渲染 ✅ |
| 纯键鼠桌面 | fine | 0 | 无 | 不渲染 ✅（r16 原语义保持） |

修复前对照：旧判定 `maxTouchPoints>0` 即 true → 触屏 PC 出现触控键（用户截图即此形态）。

## 2. 右轨遮键修复实测（AC-2）

- 844×390 横屏（粗指针）实拍：右轨「软降/硬降/Hold」三键清晰可见 ✅（修复前为空玻璃胶囊，PC 复现 + z-index 前后对照截图确认根因 = `::after` 绘制序在子元素之上）。
- 左轨「左/右/旋转」不受影响 ✅。

## 3. 回归（AC-3）

| 套件 | 结果 |
|---|---|
| verify-game / verify-audio / verify-ui / verify-persist | 108 / 24 / 23 / 15 全绿 |
| assembly-check / qa-e2e-jsdom | ALL / **366/366** 全绿（含 r16 has-touch 显隐、`opts.touch:true` 注入、jsdom 恒 false 断言） |
| verify-constants | 1 失败 = **并行 docs 归档重命名 ENOENT**（`technical/TECHNICAL.md` → `history/v2.9/`，用户进行中操作），与本轮无关；六套涉及本轮改动的断言全绿 |

改动足迹：`ui.js`（isTouchDevice 函数体 + 注释）+ `style.css`（横屏键 z-index 一行）；`index.html`/`game.js`/`audio.js`/`persist.js` 0 diff。

## 4. 伴随观察（非本轮缺陷，已登记）

844×390 横屏手机命中 M 三列档（≥768 无横屏感知），顶部内容纵向溢出——即 memory.md 待办 r19-D2（r17 既有），待 M 档矮视口变体专项处理。

## 5. 结论

**✅ 通过。** 门控语义按用户裁定收窄，右轨缺陷修复，r16 触控功能语义（注入/显隐机制/六键回放）零回归。
