<!-- meta: summary="r21 触控键仅真触屏设备显示（pointer:coarse 主指针判定，收窄 r16 全能力检测）+ 横屏右轨玻璃轨遮键 z-order 修复（r16 既有缺陷）" -->
基线依赖：r16（触控语义）/ r17（断点框架）；**取代：r16 的 has-touch 显隐判定语义**（全能力检测 → 主指针粗指针判定，用户裁定）

# r21 触控键设备门控收窄 + 右轨遮键修复 PRD

## 1. 背景与目标

用户 PC（鼠标键盘为主、带触屏数字器，`maxTouchPoints=10`）上出现 r16 触屏虚拟按键的横屏侧轨（左「左/右/旋转」、右「软降/硬降/Hold」），且**右轨三键被玻璃轨盖住呈空胶囊**（`::after` 为末位生成盒、绘制序在子元素之上，r16 既有缺陷，PC 复现 + z-index 前后对照实测）。用户裁定：触控键只在真触屏设备（主指针为粗指针）显示。

- **G1 门控收窄**：`has-touch` 判定改为 `matchMedia('(pointer: coarse)')`——手机/平板（主指针粗）显示；触屏笔记本/触屏显示器 PC（主指针为鼠标）不再显示，触屏能力本身不丢失（键鼠功能无损）。
- **G2 层级修复**：横屏侧轨三键加 `z-index:1`，恢复「键在玻璃轨之上」（r16 原设计意图）。
- **G3 零回归**：`opts.touch:true` 测试注入、`has-touch` 纯 CSS 显隐、六键语义与 r16 全部保持；七套脚本出口全绿（verify-constants 除外——其 1 失败系并行 docs 归档重命名 ENOENT，与本轮无关，见 r20 ACCEPTANCE）。

## 2. AC 清单

- **AC-1 [P0] 设备门控**：主指针 fine（含 `maxTouchPoints>0` 的触屏 PC）→ 无 `has-touch`、触控键不渲染（实测 PC 模拟 `coarse:false, maxTouchPoints:10 → display:none`）；主指针 coarse（手机/平板）→ 照常显示。
- **AC-2 [P0] 右轨键可见**：横屏侧轨右列「软降/硬降/Hold」不再被玻璃轨遮挡（844×390 实拍三键清晰）。
- **AC-3 [P0] 零回归**：Node/`jsdom` 下 `isTouchDevice()` 恒 false（既有断言不变）；`opts.touch:true` 注入路径不变；六键 data-action/键盘回放语义 0 改动；改动仅 `ui.js`（isTouchDevice 函数体）+ `style.css`（一行 z-index）。

## 3. 工程约束

- 版本号不升（D6 延续）；git 动作由需求提出人收口。
- 已知伴随观察（非本轮缺陷）：844×390 横屏手机命中 M 三列档内容溢出 = r17 待办 D2（memory.md 已登记）。
