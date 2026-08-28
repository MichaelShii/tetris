# r20 滚动条深色化 验收报告（小修复轮 · 精简归档，格式仿 r10）

**验收对象：** PC 端设置弹层滚动条白色（亮色 UA 默认样式）与深色主题不符 —— v3.0 设置弹层起既有视觉缺陷，非 r19 引入
**验收人：** 需求提出人（已提供真实浏览器截图确认修复效果）
**改动文件：** 仅 `style.css`（+15 行）；`index.html` / `ui.js` / `game.js` / `audio.js` / `persist.js` 0 diff

## 需求与实现（合并小节，改动过小不另立 DESIGN/TECHNICAL）

- **根因**：滚动容器 `.settings-modal__card`（v3.0 起 `overflow-y:auto`）未声明文档配色方案，UA 按亮色文档渲染经典滚动条（白轨白箭头）；根滚动条（矮视口整页滚动）同源。
- **修复**：① `html { color-scheme: dark }` —— 根因层，UA 滚动条/表单控件按深色渲染，页内滚动容器与根滚动条一并覆盖（Chromium 81+/Firefox 96+，旧内核整行忽略同旧版）；② 弹层滚动条细化 `scrollbar-width: thin` + `scrollbar-color`（标准属性，Firefox 全版本 + Chromium 121+ 主路径）+ `::-webkit-scrollbar` 旧 Chromium 兜底，拇指 = --muted(#9a9aac)@55%、轨道透明、悬停提亮 --muted，色值复用既有 token 无新增色板。
- **验收标准**：AC-1 弹层滚动条与深色主题协调（无白轨）；AC-2 滚动可供性保留（拇指可辨）；AC-3 零回归（七套脚本、桌面/移动各档渲染不受 color-scheme 影响——全部控件为自定义样式）。

## 验收证据

| 项 | 实测 |
|---|---|
| 需求提出人真实浏览器截图 | 弹层滚动条已呈深色（暗轨 + 中性灰拇指 + 深色箭头），与毛玻璃卡协调 ✅（AC-1） |
| computed style（无头 Chrome 1280×800） | `colorScheme: "dark"`、卡 `scrollbarColor: oklch(0.3 0.015 270/0.55)→rgba(154,154,172,.55)`、`scrollbarWidth: "thin"` ✅（AC-2） |
| 七套脚本 | verify-game 108 / verify-audio 24 / verify-ui 23 / verify-persist 15 / assembly ALL / e2e 366 全绿；**verify-constants 1 失败为并行进行中的 docs 归档重命名所致**（`technical/TECHNICAL.md` → `history/v2.9/` 已暂存未提交，脚本读旧路径 ENOENT），与本修复无关（该脚本不读 style.css），待重命名收口时同步脚本路径 |
| 0 diff | 五代码文件均不在 diff |

## 判定

**✅ 通过（accepted）。** 与 r19 改动同批未提交，git 动作由需求提出人收口（建议提交信息：`fix(Tetris r20): 滚动条深色化 - color-scheme:dark + 弹层滚动条细化`）。

<!-- state -->{"phase":"acceptance","summary":"r20 滚动条深色化验收通过（accepted）：color-scheme:dark 根因修复 + 弹层滚动条细化（thin/--muted@55%），需求提出人真实截图确认；六套全绿，verify-constants 1 失败系并行 docs 归档重命名（TECHNICAL.md→history/v2.9/）所致与本修复无关；style.css +15 行，五代码文件 0 diff。","memory":["r20 小修复轮：精简任务夹（仿 r10 仅 ACCEPTANCE+meta）","verify-constants 失败根因=用户并行暂存的 docs 重命名（technical/TECHNICAL.md 移入 history/v2.9/），待收口时同步脚本路径或裁定断言口径"],"extra":{"verdict":"accepted","done":true}}<!-- /state -->
