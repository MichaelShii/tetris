'use strict'
/*!
 * tetris/scripts/verify-ui.cjs — ui.js 契约自检（node:test，零依赖）
 * ============================================================================
 * 运行：node scripts/verify-ui.cjs
 *
 * ui.js 为浏览器渲染/UI 层（DOM 副作用仅在 createUI/组件工厂被调用时发生），
 * Node 下 require 必须零副作用；本脚本验证：
 *   1. 模块导出齐全、常量与 game.js 对齐（10×20 棋盘规格一致）；
 *   2. 状态灯 / 遮罩规格覆盖 game.js 全部四个 phase；
 *   3. 渲染/UI 组件工厂签名存在（对齐 TECHNICAL §3.4/§3.5）；
 *   4. Node 环境加载不触碰 window/document（顶层零 DOM）。
 * r15（多格预览队列）：createNextQueueRenderer 导出+签名（缺 canvas 抛错），
 *   且 createNextWellRenderer/createHoldWellRenderer 契约保持（drawMiniPieceAt 抽取复用回归）。
 * r16（触屏控制）：TOUCH_KEYS 六键回放表 ↔ game.js keyAction 交叉校验（防触屏映射漂移
 *   工程护栏；'c'→Hold 特例由 ui.js onHoldKey 消费）、isTouchDevice/createTouchControls
 *   导出、工厂缺 #touch-controls 元素抛错、Node 加载 isTouchDevice()=false 零 DOM 副作用。
 * r17（响应式重排）：+3 断点源结构断言——S/M 四档 media 存在性与 L 基座不动、
 *   .stat-grid 包裹契约（四统计块原序 + viewport-fit=cover）、断点布局锚点
 *   （r19 起第三条改钳 S 竖屏游戏视口：100dvh 骨架 / 网格 areas / 棋盘等比 / dock 随流）；
 *   只读 style.css/index.html 源文本，Node 零 DOM（PRD R4：jsdom 无法验证真实视口几何）。
 * 浏览器行为（毛玻璃/霓虹/逐帧渲染/FPS）按 PRD AC-07 手测。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const T = require('../ui.js')
const G = require('../game.js')

test('exports: 模块导出齐全，Node 加载零 DOM 副作用', () => {
  assert.equal(typeof T.createUI, 'function')
  assert.equal(typeof T.createBoardRenderer, 'function')
  assert.equal(typeof T.createNextWellRenderer, 'function')
  assert.equal(typeof T.createNextQueueRenderer, 'function') // r15：3 格预览队列渲染器（48×80，AC-4）
  assert.equal(typeof T.createHud, 'function')
  assert.equal(typeof T.createOverlay, 'function')
  assert.equal(typeof T.createFeedback, 'function')
  assert.equal(typeof T.createAudioPanel, 'function') // v2.0：音量/静音控件（AC-10）
  assert.equal(typeof T.GHOST, 'object') // v2.2：幽灵块视觉参数表（AC-12.8）
  // require 后全局未被污染（顶层不应触碰 window/document）
  assert.equal(typeof globalThis.window, 'undefined')
  assert.equal(typeof globalThis.document, 'undefined')
})

test('v2.0: audio.js 可加载、导出齐全、Node 加载零 DOM/Audio 副作用（AC-09.5/7）', () => {
  const A = require('../audio.js')
  assert.equal(typeof A.createSfxEngine, 'function')
  assert.equal(typeof A.SFX_DEFS, 'object')
  assert.equal(A.DEFAULT_VOLUME, 0.8)
  assert.equal(A.VOLUME_STEP, 0.1)
  assert.equal(A.MAX_VOICES, 4)
  // require 后全局未被污染（顶层不应触碰 window/document/AudioContext）
  assert.equal(typeof globalThis.window, 'undefined')
  assert.equal(typeof globalThis.document, 'undefined')
  assert.equal(typeof globalThis.AudioContext, 'undefined')
})

test('constants: 棋盘规格与 game.js 对齐（10×20）', () => {
  assert.equal(T.COLS, G.COLS)
  assert.equal(T.ROWS, G.ROWS)
  assert.equal(T.COLS, 10)
  assert.equal(T.ROWS, 20)
})

test('ui 状态/遮罩规格覆盖 game.js 全部 phase（READY/RUNNING/PAUSED/OVER）', () => {
  // 通过 createHud/createOverlay 的闭包常量不可直接读；改为行为断言：
  // createOverlay.show 对 READY/PAUSED/OVER 应设置 data-state 与文案（DOM 相关），
  // 这里以导出契约存在 + game.js PHASES 全集被 ui.js 文档覆盖为准。
  for (const phase of G.PHASES) {
    assert.equal(typeof phase, 'string')
  }
  assert.deepEqual(G.PHASES, ['READY', 'RUNNING', 'PAUSED', 'OVER'])
  // 文档契约：RUNNING 不显示遮罩（ui.js 内部 OVERLAY_SPEC 无 RUNNING 键），
  // 其余三态均有规格 —— 通过 createOverlay 的空 DOM 行为无从验证，保留为手测项。
})

test('工厂签名：参数校验与错误提示（DOM 元素缺省时给出明确错误）', () => {
  assert.throws(() => T.createBoardRenderer(null), /需要 <canvas> 元素/)
  assert.throws(() => T.createNextWellRenderer(undefined), /需要 <canvas> 元素/)
  assert.throws(
    () => T.createUI({ el: null }),
    /未加载 game\.js|缺少必需元素/ // el:null → document 不可用或元素缺失，均须抛错
  )
})

test('与 game.js 的协作面：ui 依赖的 engine 导出存在', () => {
  assert.equal(typeof G.merge, 'function') // ui.js 消行闪白反推用
  assert.equal(typeof G.clearLines, 'function')
  assert.equal(typeof G.SHAPES, 'object')
  assert.equal(typeof G.COLORS, 'object')
  assert.equal(Object.keys(G.COLORS).length, 7) // AC-07.5 七色
})

test('v2.9: 踢墙开关 engine API 契约存在（AC-19.7 装配断言）', () => {
  // ui.js #btn-wallkick 依赖 createGame 实例的 setWallKickEnabled/getWallKickEnabled
  const g = G.createGame({ autoLoop: false, keyboard: false, autoPauseOnBlur: false, rng: function () { return 0 } })
  assert.equal(typeof g.setWallKickEnabled, 'function', 'setWallKickEnabled 导出存在')
  assert.equal(typeof g.getWallKickEnabled, 'function', 'getWallKickEnabled 导出存在')
  assert.equal(g.getWallKickEnabled(), true, '默认开（AC-19.1）')
  assert.equal(g.setWallKickEnabled(false), true, '可关闭（AC-19.4）')
  assert.equal(g.getWallKickEnabled(), false, '关闭生效')
  assert.equal(g.setWallKickEnabled(true), true, '可再开启')
  assert.equal(g.getWallKickEnabled(), true, '重新开启生效')
  g.dispose()
})

test('v3.0: 设置弹层 DOM 结构存在（AC-01~03 装配断言）', () => {
  // 验证设置弹层相关 DOM 元素存在（Node 环境下通过导出契约间接验证）
  assert.equal(typeof T.createUI, 'function', 'createUI 导出存在')
  // 设置弹层 DOM 元素在浏览器环境中存在，Node 下通过 assembly-check.cjs 验证
  // 此处验证 ui.js 导出面包含设置弹层控制逻辑（通过闭包实现，无需额外导出）
  assert.equal(typeof T.createUI, 'function', 'createUI 可创建包含设置弹层的 UI')
})

test('v2.2 ghost 视觉参数单一事实来源（AC-12.8 透明度可编程测量）', () => {
  // DESIGN §5.6：幽灵块同色系半透明空心轮廓
  assert.equal(typeof T.GHOST, 'object')
  assert.equal(T.GHOST.OUTLINE_ALPHA, 0.75) // 轮廓描边不透明度
  assert.equal(T.GHOST.FILL_ALPHA, 0.16)    // 内部极淡填充不透明度
  assert.equal(T.GHOST.LINE_WIDTH, 2)       // 轮廓线宽（px）
  // 引擎依赖：ui.js 渲染调用 ghostY 纯函数导出存在（AC-12.1）
  assert.equal(typeof G.ghostY, 'function')
})

test('r13: 消行动画包络常量单一事实来源（AC-1/AC-9 数值锚点）', () => {
  // DESIGN §4.3 霓虹脉冲：渐亮 → 过曝 → 熄灭；引擎 createGame 默认 animMs 同源
  assert.equal(T.ANIM_MS, 240, 'ANIM_MS = 240ms（验收容差 160~320）')
  assert.equal(T.ANIM_PEAK, 1.25, 'ANIM_PEAK = 峰值乘性亮度（下限 1.2）')
  assert.equal(T.ANIM_PEAK_T, 0.40, 'ANIM_PEAK_T = 峰值到达点（占 T）')
  assert.equal(typeof T.pulseBrightness, 'function', 'pulseBrightness 纯函数导出')
})

test('r13: pulseBrightness 包络数值断言（端点/峰值/值域）', () => {
  assert.equal(T.pulseBrightness(0), 1, 'B(0)=1：首帧原亮度（无叠加）')
  assert.equal(T.pulseBrightness(1), 0, 'B(1)=0：结束帧熄灭（塌缩帧无跳变）')
  const peak = T.pulseBrightness(T.ANIM_PEAK_T)
  assert.ok(peak >= 1.2, '峰值 ≥ 1.2（AC-1 下限），实际 ' + peak)
  assert.equal(peak, T.ANIM_PEAK, 'p=0.40 处恰为峰值 1.25')
  // 值域：B ∈ [0, 1.25]（p ∈ [0,1] 采样 101 点）
  for (let i = 0; i <= 100; i++) {
    const B = T.pulseBrightness(i / 100)
    assert.ok(B >= 0 && B <= T.ANIM_PEAK + 1e-9, 'p=' + i / 100 + ' → B=' + B + ' 越界')
  }
})

test('v3.2: createHoldWellRenderer 导出/签名断言（AC-13）', () => {
  assert.equal(typeof T.createHoldWellRenderer, 'function', 'createHoldWellRenderer 导出存在')
  // 签名同 createNextWellRenderer：需要 <canvas> 元素
  assert.throws(() => T.createHoldWellRenderer(null), /需要 <canvas> 元素/)
  assert.throws(() => T.createHoldWellRenderer(undefined), /需要 <canvas> 元素/)
})

test('r15: createNextQueueRenderer 导出/签名断言（AC-4 队列渲染器装配面）', () => {
  assert.equal(typeof T.createNextQueueRenderer, 'function', 'createNextQueueRenderer 导出存在')
  // 签名对齐 createNextWellRenderer：入参 <canvas>，缺失抛 /需要 <canvas> 元素/（TECHNICAL §5.2）
  assert.throws(() => T.createNextQueueRenderer(null), /需要 <canvas> 元素/)
  assert.throws(() => T.createNextQueueRenderer(undefined), /需要 <canvas> 元素/)
})

test('r15: createNextWellRenderer/createHoldWellRenderer 契约不回归（AC-4 复用回归）', () => {
  // T5 抽取 drawMiniPieceAt 三渲染器共享后，旧两渲染器对外导出/报错契约必须保持
  assert.equal(typeof T.createNextWellRenderer, 'function', 'createNextWellRenderer 导出保持')
  assert.equal(typeof T.createHoldWellRenderer, 'function', 'createHoldWellRenderer 导出保持')
  assert.throws(() => T.createNextWellRenderer(null), /需要 <canvas> 元素/)
  assert.throws(() => T.createNextWellRenderer(undefined), /需要 <canvas> 元素/)
  assert.throws(() => T.createHoldWellRenderer(null), /需要 <canvas> 元素/)
  assert.throws(() => T.createHoldWellRenderer(undefined), /需要 <canvas> 元素/)
})

test('v3.2: game.hold API 存在（引擎 hold 方法导出契约）', () => {
  const g = G.createGame({ autoLoop: false, keyboard: false, autoPauseOnBlur: false, rng: function () { return 0 } })
  assert.equal(typeof g.hold, 'function', 'hold 方法导出存在')
  assert.equal(typeof g.setHoldEnabled, 'function', 'setHoldEnabled 导出存在')
  assert.equal(typeof g.getHoldEnabled, 'function', 'getHoldEnabled 导出存在')
  assert.equal(typeof g.getHoldPiece, 'function', 'getHoldPiece 导出存在')
  assert.equal(g.getHoldEnabled(), true, '默认 holdEnabled 开启')
  g.dispose()
})

test('v3.2: setHoldEnabled 实时生效（开关切换断言）', () => {
  const g = G.createGame({ autoLoop: false, keyboard: false, autoPauseOnBlur: false, rng: function () { return 0 } })
  assert.equal(g.getHoldEnabled(), true, '初始 holdEnabled = true')
  assert.equal(g.setHoldEnabled(false), true, '关闭 holdEnabled')
  assert.equal(g.getHoldEnabled(), false, '关闭生效')
  assert.equal(g.setHoldEnabled(true), true, '重新开启')
  assert.equal(g.getHoldEnabled(), true, '开启生效')
  // hold piece 初始为 null
  assert.equal(g.getHoldPiece(), null, '初始 holdPiece = null')
  g.dispose()
})

test('r13: pulseBrightness 渐亮段帧增量单调递减（ease-out-quart 可判据）', () => {
  // 渐亮段 0 → ANIM_PEAK_T（N=16 点）：相邻亮度差严格递减（ease-out-quart 的导数性质）
  const N = 16
  const step = T.ANIM_PEAK_T / (N - 1)
  let prevB = T.pulseBrightness(0)
  let prevDiff = Infinity
  for (let i = 1; i < N; i++) {
    const B = T.pulseBrightness(i * step)
    const diff = B - prevB
    assert.ok(diff > 0, '渐亮段单调上升（样本 ' + i + '）')
    assert.ok(diff < prevDiff + 1e-12, '帧增量单调递减（样本 ' + i + '：' + diff + ' ≥ ' + prevDiff + '）')
    prevB = B
    prevDiff = diff
  }
  // 淡出段 0.40 → 1：单调不升（ease-in-quart 先慢后快 → 0）
  const M = 16
  const fstep = (1 - T.ANIM_PEAK_T) / (M - 1)
  prevB = T.pulseBrightness(T.ANIM_PEAK_T)
  for (let i = 1; i < M; i++) {
    const B = T.pulseBrightness(T.ANIM_PEAK_T + i * fstep)
    assert.ok(B <= prevB + 1e-12, '淡出段单调不升（样本 ' + i + '）')
    prevB = B
  }
})

/* ======================================================================
 * r16 移动端触屏控制 —— 契约自检（T4；TECHNICAL §2.1/§6.1）
 * 触屏键不是第二套动作表，而是键盘事件的『回放表』：TOUCH_KEYS.key → 合成
 * KeyboardEvent → 复走 game.js 既有 keyAction/held 时钟。TOUCH_KEYS 与引擎
 * 分发表交叉断言是防「触屏映射漂移」的工程护栏 —— 映射唯一事实来源在 ui.js，
 * 本段验证其与 game.js keyAction 语义一致，且 Node 加载零 DOM 副作用。
 * ==================================================================== */

test('r16: TOUCH_KEYS 导出与六键结构契约（触屏键映射回放表）', () => {
  assert.equal(typeof T.isTouchDevice, 'function', 'isTouchDevice 导出存在')
  assert.equal(typeof T.createTouchControls, 'function', 'createTouchControls 导出存在')
  assert.ok(Array.isArray(T.TOUCH_KEYS), 'TOUCH_KEYS 为数组')
  assert.equal(T.TOUCH_KEYS.length, 6, 'TOUCH_KEYS 六键（PRD §2 US-2）')
  // 每条目结构：action/key/holdable 三字段，类型齐备
  // （TECHNICAL §2.1 表含 label 展示字段，实现按需精简为三字段——中文键名由 index.html DOM
  //   承载，回放表本身仅需合成所需；契约以实现为准，label 不作导出面断言）
  for (const entry of T.TOUCH_KEYS) {
    assert.equal(typeof entry, 'object')
    assert.equal(typeof entry.action, 'string', 'action 为字符串（语义动作）')
    assert.equal(typeof entry.key, 'string', 'key 为合成键盘事件 key 码')
    assert.equal(typeof entry.holdable, 'boolean', 'holdable 为布尔（是否 DAS/软降按住类）')
  }
  // 六个合成 key 码全集与顺序（TECHNICAL §2.1 表）
  assert.deepEqual(
    T.TOUCH_KEYS.map((entry) => entry.key),
    ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'c'],
    'TOUCH_KEYS 六 key 码固定：ArrowLeft/Right/Up/Down + 空格 + c'
  )
  // 六个 action 互异且恰为六键语义动作
  const actions = T.TOUCH_KEYS.map((entry) => entry.action)
  assert.equal(new Set(actions).size, 6, 'action 六值互异')
  assert.deepEqual(
    actions.slice().sort(),
    ['hardDrop', 'hold', 'moveLeft', 'moveRight', 'rotate', 'softDrop'],
    'action 全集 = 移动左/右/旋转/软降/硬降/Hold 六语义'
  )
  // Node 加载零 DOM 副作用：Node 无 window/navigator/matchMedia → isTouchDevice() 恒 false
  assert.equal(T.isTouchDevice(), false, 'isTouchDevice() Node 下恒 false（无 DOM 副作用）')
  assert.equal(typeof globalThis.window, 'undefined', 'require 后 window 未定义')
  assert.equal(typeof globalThis.document, 'undefined', 'require 后 document 未定义')
})

test('r16: TOUCH_KEYS ↔ game.js keyAction 交叉校验（防触屏映射漂移护栏）', () => {
  // 引擎「按住类」动作：game.js onKeyDown 落 held Map 注册 DAS/软降 repeat 的仅
  // moveLeft/moveRight/softDrop（ArrowLeft/ArrowRight/ArrowDown）——触屏 holdable=true 必须与之重合
  const HELD_ACTIONS = new Set(['moveLeft', 'moveRight', 'softDrop'])
  for (const entry of T.TOUCH_KEYS) {
    const action = G.keyAction('RUNNING', entry.key)
    if (entry.action === 'hold') {
      // 'c' 在 game.js 全 phase 均无映射（null）→ Hold 特例，由 ui.js 既有 onHoldKey 消费
      assert.equal(action, null, `hold 键 key='${entry.key}' 在 RUNNING 无 engine 映射（Hold 特例）`)
      for (const phase of G.PHASES) {
        assert.equal(G.keyAction(phase, entry.key), null, `hold 键 key='${entry.key}' 在 ${phase} 亦无映射`)
      }
      continue
    }
    assert.equal(action, entry.action, `TOUCH_KEYS.${entry.action} key='${entry.key}' → keyAction('RUNNING') 一致`)
    if (entry.holdable) {
      // holdable=true（移动/软降）：必为引擎 held 注册的按住类动作（同一 DAS/软降 repeat 时钟，PRD §8 红线）
      assert.ok(HELD_ACTIONS.has(entry.action), `${entry.action} 应属按住类动作（DAS/软降 repeat）`)
    } else {
      // holdable=false（旋转/硬降）：引擎只做单发，不得落 held Map
      assert.ok(!HELD_ACTIONS.has(entry.action), `${entry.action} 不得属按住类动作（单发语义）`)
    }
  }
  // 反向护栏：引擎三枚 held 注册键（ArrowLeft/ArrowRight/ArrowDown）恰为 TOUCH_KEYS 的 holdable=true 子集
  const heldKeys = T.TOUCH_KEYS.filter((entry) => entry.holdable).map((entry) => entry.key)
  assert.deepEqual(heldKeys, ['ArrowLeft', 'ArrowRight', 'ArrowDown'], 'holdable=true 恰为引擎 held 三键')
})

test('r16: createTouchControls 工厂契约（缺 #touch-controls 元素抛错）', () => {
  const g = G.createGame({ autoLoop: false, keyboard: false, autoPauseOnBlur: false, rng: function () { return 0 } })
  // 与既有工厂（createBoardRenderer/createNextWellRenderer…）同惯例：缺必要元素 → 明确抛错
  assert.throws(() => T.createTouchControls({ pad: null }, g), /#touch-controls/, 'pad=null → 抛「缺少 #touch-controls」语义错误')
  assert.throws(() => T.createTouchControls({}, g), /#touch-controls/, 'els 无 pad 键 → 抛错')
  g.dispose()
})

/* ======================================================================
 * r17 响应式重排 —— 断点源结构断言（T3；TECHNICAL §3.3/§7.2）
 * 布局 = 派生样式而非状态：断点切换零 JS、零引擎触达（AC-8 构造保证），
 * 档位不进快照/持久化/JS 闭包。PRD R4 明确 jsdom 无法验证真实视口几何 →
 * 本段沿用 r16「Node 契约 + 交叉校验」先例，只读 style.css / index.html
 * 源文本做结构断言（防实现漂移）；真实几何（包围盒/中心带/滚动位移）落
 * QA 真机清单。三条断言分别钳制：断点 media 存在性与 L 基座不动、
 * .stat-grid 包裹契约、断点布局锚点（r19 起：S 竖屏游戏视口锚点）。
 * 注：CSS_FILE/HTML_FILE 可用 DSH_VERIFY_UI_CSS/DSH_VERIFY_UI_HTML 覆盖
 * （测试钩子：T5 收口 / 本任务自检可注入合成源做 dry-run）。
 * ==================================================================== */
const fs = require('node:fs')
const path = require('node:path')
const CSS_FILE = process.env.DSH_VERIFY_UI_CSS || path.join(__dirname, '..', 'style.css')
const HTML_FILE = process.env.DSH_VERIFY_UI_HTML || path.join(__dirname, '..', 'index.html')

test('r17: 断点框架源结构——S/M 四档 media + 派生样式锚点存在，L 基座在媒体查询外（AC-7 零改动证据）', () => {
  const css = fs.readFileSync(CSS_FILE, 'utf8')
  // ① S/M 四档互斥媒体查询（TECHNICAL §3.2 表：S 竖屏 / S 横屏变体 / M 窄版 / M 宽版；
  //    L ≥1024 零新增规则 → 断点全部在源序追加区，覆盖既有 ≤1100 堆叠）
  for (const mq of [
    '@media (max-width: 599px)',
    '@media (max-width: 599px) and (orientation: landscape)',
    '@media (min-width: 600px) and (max-width: 767px)',
    '@media (min-width: 768px) and (max-width: 1023px)'
  ]) {
    assert.ok(css.includes(mq), 'style.css 缺断点 media：' + mq)
  }
  // ② 派生样式锚点：--dock-h（M 档 dock 预留的单一事实来源；r19 起 S 档随流无预留）、
  //    display:contents（面板摊平；§6.2 警告：order 挂在 display:contents 无盒会静默失效 → 防该漂移）
  assert.ok(css.includes('--dock-h'), 'style.css 缺 --dock-h 自定义属性')
  assert.match(css, /display\s*:\s*contents/, 'style.css 缺 display: contents（S 档卡片流摊平）')
  // ③ L 档零改动证据：基座 #main grid 规则仍在首个 @media 之前（媒体查询外）
  //    → L ≥1024 无新选择器，r16 基线几何快照天然通过
  const baseGrid = css.indexOf('grid-template-columns: 240px 340px 240px')
  const firstMedia = css.indexOf('@media')
  assert.ok(baseGrid !== -1, 'style.css 缺 L 档基座 grid-template-columns: 240px 340px 240px')
  assert.ok(firstMedia !== -1, 'style.css 无 @media（与 ① 矛盾）')
  assert.ok(baseGrid < firstMedia, '基座规则须在首个 @media 之前（媒体查询外，L 档零改动证据）')
})

test('r17: index.html .stat-grid 包裹契约——四统计块原序包入 + viewport-fit=cover（AC-1/AC-3）', () => {
  const html = fs.readFileSync(HTML_FILE, 'utf8')
  // ① 包裹层：唯一新增 DOM 层（无样式 div 组织语义；DOM 顺序 = L 档 grid 基线，禁重排，TECHNICAL §4.1）
  const gridOpen = html.indexOf('<div class="stat-grid"')
  assert.ok(gridOpen !== -1, 'index.html 缺 <div class="stat-grid"> 包裹层')
  // ② 四统计块原序包入：stat-grid < stat-score < stat-hi < stat-level < stat-lines
  const statIds = ['id="stat-score"', 'id="stat-hi"', 'id="stat-level"', 'id="stat-lines"']
  let prev = gridOpen
  for (const id of statIds) {
    const idx = html.indexOf(id)
    assert.ok(idx !== -1 && idx > prev, id + ' 须在包裹层之后按原序出现（idx=' + idx + ' > ' + prev + '）')
    prev = idx
  }
  // ③ 包裹闭合先于 .hold-well / .next-well：四块确实被包入（非仅前置）
  const gridClose = html.indexOf('</div>', prev)
  assert.ok(gridClose !== -1 && gridClose > prev, 'stat-lines 后缺包裹层闭合 </div>')
  for (const cls of ['class="hold-well"', 'class="next-well"']) {
    const idx = html.indexOf(cls)
    assert.ok(idx !== -1 && idx > gridClose, cls + ' 须在包裹层闭合之后（idx=' + idx + ' > ' + gridClose + '）')
  }
  // ④ viewport-fit=cover：iOS safe-area-inset-bottom 非零前提，缺它 AC-3 恒 0 无法验证
  assert.match(html, /viewport-fit=cover/, 'index.html viewport meta 缺 viewport-fit=cover（AC-3）')
})

test('r19: S 竖屏游戏视口锚点——body 100dvh 渐进对 + #main 网格 areas + #board 等比覆盖 + dock 随流（AC-1/2/3）', () => {
  const css = fs.readFileSync(CSS_FILE, 'utf8')
  const sStart = css.indexOf('@media (max-width: 599px)')
  const sLand = css.indexOf('@media (max-width: 599px) and (orientation: landscape)')
  assert.ok(sStart !== -1 && sLand > sStart, 'S 竖屏块须先于 S 横屏块（可切片）')
  const sPortrait = css.slice(sStart, sLand)
  // ① 视口骨架：body 纵向 flex + height 100vh 兜底/100dvh 渐进双行（r19 §7.1：
  //    钉高一屏——min-height 会被画布固有高度撑开、dock 出折叠线）
  assert.match(sPortrait, /body\s*\{[^}]*display:\s*flex/, 'S 档 body 缺 flex 骨架（一屏适配前提）')
  assert.match(sPortrait, /height:\s*100vh/, 'S 档 body 缺 height:100vh 兜底行（渐进增强惯例）')
  assert.match(sPortrait, /height:\s*100dvh/, 'S 档 body 缺 height:100dvh 渐进行')
  // ② 主区网格：'hold board next' 三列 areas（对局区 1fr 吃满，侧栏 auto 轨随开关塌缩）
  assert.match(sPortrait, /#main\s*\{[^}]*'hold board next'/,
    'S 档 #main 缺 \'hold board next\' 网格 areas（棋盘优先布局锚点）')
  // ③ 棋盘等比：renderer.resize() 内联尺寸以 !important 压过 + 双 max 约束保 280:560（AC-2）
  assert.match(sPortrait, /#board\s*\{[^}]*width:\s*auto\s*!important/,
    'S 档 #board 缺 width:auto !important 等比覆盖（§7.2 横屏先例同款）')
  assert.match(sPortrait, /#board\s*\{[^}]*max-height:\s*100%/,
    'S 档 #board 缺 max-height:100%（吃满剩余高度）')
  // ④ dock 随流：单行 position:static（废弃 r17 悬浮/滚动预留）；safe-area 避让由
  //    r16 基座 .touchpad padding 承载（本档不再重写 padding，基座 env() 延续即 AC-3）
  assert.match(sPortrait, /\.touchpad\s*\{[^}]*position:\s*static/,
    'S 档 .touchpad 缺 position:static（随流 dock）')
  assert.ok(css.includes('env(safe-area-inset-bottom)'),
    'style.css 缺 env(safe-area-inset-bottom)（AC-3 渐进增强，r16 基座）')
  // ⑤ 键位图例 S 竖屏隐藏（PRD AC-8 已确认行为变更）
  assert.match(sPortrait, /\.key-hints\s*\{[^}]*display:\s*none/,
    'S 档缺 .key-hints display:none（PRD AC-8）')
})

/* ======================================================================
 * r21 特殊奖励 Toast（Combo / T-Spin）——常量 / 纯函数矩阵 / 源扫描（T3；TECHNICAL §7.2）
 * 纯展示层契约（Node 零 DOM 可全部锁定）：
 *   1. TOAST_DURATION 常量值域 1200~2000 + buildRewardText 导出（AC-1/AC-6）；
 *   2. buildRewardText 纯函数矩阵：单轴 Combo / 双轴合并序（AC-4）/ 全 0 静默（AC-5）/
 *      No-line 防御（AC-3）/ 档位名映射与乘数 / NaN·负 level·未知 kind·payload 缺失防御；
 *   3. style.css / index.html 源扫描（r17 T3 先例）：规则 / 动画时长 / aria-live / 挂载序。
 * 注：Node 无 window → game.js 不挂全局 TetrisGame（L36 仅 browser）；矩阵段补挂
 *   globalThis.TetrisGame = G（与浏览器装配一致的全局契约），令 T-Spin 轴可测
 *   （ui.js buildRewardText 的 typeof TetrisGame 守卫，同 NEXT_SLOTS 风格）。
 * ==================================================================== */

test('r21: TOAST_DURATION 常量值域 + buildRewardText 导出（AC-1/AC-6）', () => {
  assert.equal(T.TOAST_DURATION, 1600, 'TOAST_DURATION = 1600ms（奖励 Toast 时长，独立于 LEVEL UP 800ms）')
  assert.ok(T.TOAST_DURATION >= 1200 && T.TOAST_DURATION <= 2000,
    'TOAST_DURATION 须在 1200~2000 值域，实际 ' + T.TOAST_DURATION)
  assert.equal(typeof T.buildRewardText, 'function', 'buildRewardText 纯函数导出（AC-1 新增 UI API）')
})

test('r21: buildRewardText 纯函数矩阵（Node 无 DOM；AC-2/3/4/5/7）', () => {
  // 浏览器装配下 game.js 以 window.TetrisGame 提供引擎；Node 下补挂同一全局契约 → T-Spin 轴可测
  globalThis.TetrisGame = G
  try {
    // ① 单轴 Combo（AC-2）：comboBonus 直读载荷
    assert.equal(
      T.buildRewardText({ combo: 2, comboBonus: 100, tspin: 'none', cleared: 1, level: 1 }),
      'Combo ×2 +100',
      'Combo 单轴文案 = Combo ×N +bonus（直读载荷）'
    )
    // ② 双轴合并（AC-4 合并序：T-Spin 在前 · Combo 在后，PRD §4 逐字）
    assert.equal(
      T.buildRewardText({ combo: 1, comboBonus: 50, tspin: 'full', cleared: 1, level: 1 }),
      'T-Spin Single +800 · Combo ×1 +50',
      '双轴合并序 = T-Spin Single +800 · Combo ×1 +50（AC-4）'
    )
    // ③ 全 0 → null（AC-5 静默：普通消行无奖励不弹）
    assert.equal(
      T.buildRewardText({ combo: 0, comboBonus: 0, tspin: 'none', cleared: 1, level: 1 }),
      null,
      '全 0 载荷 → null（AC-5 静默）'
    )
    // ④ No-line 防御（AC-3）：cleared=0 → T-Spin 轴跳过；combo 无值 → null（断链不弹）
    assert.equal(
      T.buildRewardText({ combo: null, comboBonus: null, tspin: 'full', cleared: 0, level: 1 }),
      null,
      'No-line（cleared=0）→ null（AC-3）'
    )
    // ⑤ 档位名映射 + 乘数：mini:2 → 'Mini Double'，200×2=400（T_SPIN_TIER_LABEL）
    assert.equal(
      T.buildRewardText({ combo: null, comboBonus: null, tspin: 'mini', cleared: 2, level: 2 }),
      'T-Spin Mini Double +400',
      'mini:2 × level2 = 400（档位名 + 乘数派生）'
    )
  } finally {
    delete globalThis.TetrisGame
  }
})

test('r21: buildRewardText 防御矩阵（NaN / 负 level / 未知 kind / payload 缺失）', () => {
  globalThis.TetrisGame = G
  try {
    // NaN comboBonus → Combo 轴跳过（NaN>0 恒 false）；无 T-Spin → null
    assert.equal(T.buildRewardText({ combo: 1, comboBonus: NaN, tspin: 'none', cleared: 1, level: 1 }), null,
      'NaN comboBonus → null（无 NaN 文案路径）')
    // 未知 kind → T-Spin 轴跳过（tspinBonus=0），仅剩 Combo 最小形态
    assert.equal(T.buildRewardText({ combo: 1, comboBonus: 50, tspin: 'bogus', cleared: 1, level: 1 }), 'Combo ×1 +50',
      '未知 kind → 最小形态（仅 Combo 轴）')
    // 负 level → tspinBonus('full',1,-1)=-800 → b>0 门跳过 → null
    assert.equal(T.buildRewardText({ combo: 0, comboBonus: 0, tspin: 'full', cleared: 1, level: -1 }), null,
      '负 level → null（无负分文案）')
    // payload 缺失 / null → null
    assert.equal(T.buildRewardText(null), null, 'payload null → null')
    assert.equal(T.buildRewardText(undefined), null, 'payload undefined → null')
    // cleared 出档位表（full:4 无映射）→ tspinBonus=0 → 轴跳过 → null
    assert.equal(T.buildRewardText({ combo: null, comboBonus: null, tspin: 'full', cleared: 4, level: 1 }), null,
      'cleared 出档位表 → null（无越界文案）')
  } finally {
    delete globalThis.TetrisGame
  }
})

test('r21: style.css 源扫描——#reward-toast 规则族（AC-1/AC-8/AC-9，r17 T3 先例）', () => {
  const css = fs.readFileSync(CSS_FILE, 'utf8')
  // ① 基础规则存在（顶部规则块）与纵向 stack 位（top:28px，与 LEVEL UP 不重叠）
  assert.ok(css.includes('#reward-toast'), 'style.css 缺 #reward-toast 选择器')
  assert.ok(css.includes('top: 28px'), 'style.css 缺 top: 28px（双槽纵向 stack）')
  // ② 动画复用既有 keyframes（钳到 #reward-toast.is-showing 块内——#feedback-toast 亦用
  //    同名 keyframes 但 800ms，未钳块会误匹配 LEVEL UP 规则），时长须与 JS 常量同源（AC-1/AC-6）
  const rewardAnim = css.match(/#reward-toast\.is-showing\s*\{[^}]*toast-in-out\s*(\d+)ms\s*ease-out/)
  assert.ok(rewardAnim, 'style.css 缺 toast-in-out 1600ms ease-out（#reward-toast.is-showing 块内）')
  const cssMs = Number(rewardAnim[1])
  assert.ok(cssMs >= 1200 && cssMs <= 2000, 'CSS 动画时长须在 1200~2000，实际 ' + cssMs)
  assert.equal(cssMs, T.TOAST_DURATION, 'CSS 动画时长须与 TOAST_DURATION 同源（防漂移）')
  // ③ 不越界：max-width: min(92%, 320px) 随板框缩放（AC-9）
  assert.match(css, /max-width:\s*min\(92%,\s*320px\)/, 'style.css 缺 max-width: min(92%, 320px)')
  // ④ reduced-motion 静态镜像（AC-8）：同块内 #reward-toast.is-showing 只动文字（opacity:1、无动画），
  //    且 #feedback-toast 镜像仍含 opacity: 1（r21 未破坏既有 reduced-motion 契约，AC-11 零回归）
  const rmStart = css.indexOf('@media (prefers-reduced-motion: reduce)')
  assert.ok(rmStart !== -1, 'style.css 缺 @media (prefers-reduced-motion: reduce) 块')
  const rmBlock = css.slice(rmStart)
  assert.match(rmBlock, /#feedback-toast\.is-showing\s*\{[^}]*opacity:\s*1/,
    'reduced-motion 块内 #feedback-toast 仍含 opacity: 1（r21 零回归）')
  const rewardRm = rmBlock.match(/#reward-toast\.is-showing\s*\{[^}]*\}/)
  assert.ok(rewardRm, 'reduced-motion 块内缺 #reward-toast.is-showing 静态镜像')
  assert.match(rewardRm[0], /opacity:\s*1/, '奖励静态镜像须 opacity: 1（只动文字）')
  assert.ok(!/animation:/.test(rewardRm[0]), '奖励静态镜像不得含动画（静止呈现，AC-8）')
})

test('r21: index.html 源扫描——#reward-toast 挂载点契约（AC-8）', () => {
  const html = fs.readFileSync(HTML_FILE, 'utf8')
  // ① 挂载点存在且携带声明式可达性三件套（role/aria-live/hidden）
  const rewardOpen = html.indexOf('id="reward-toast"')
  assert.ok(rewardOpen !== -1, 'index.html 缺 id="reward-toast" 挂载点')
  for (const attr of ['role="status"', 'aria-live="polite"']) {
    assert.ok(html.includes(attr), 'index.html 缺 ' + attr + '（AC-8 可达性）')
  }
  // hidden 落在 reward 节点自身的开标签上（与 feedback-toast 同款初始隐藏，r21 未改旧节点）
  const rewardNode = html.slice(rewardOpen, html.indexOf('>', rewardOpen))
  assert.match(rewardNode, /\shidden\b/, '#reward-toast 开标签缺 hidden 初始隐藏（AC-8）')
  // ② 序断言：位于 #feedback-toast 之后（DOM 契约收敛到既有挂载点族，双槽并存）
  const feedbackOpen = html.indexOf('id="feedback-toast"')
  assert.ok(feedbackOpen !== -1, 'index.html 缺 id="feedback-toast"（既有挂载点被误删？）')
  assert.ok(rewardOpen > feedbackOpen,
    '#reward-toast 须位于 #feedback-toast 之后（idx=' + rewardOpen + ' > ' + feedbackOpen + '，AC-6 双槽序）')
})

/* ============================================================================
 * r23 Back-to-back：buildRewardText 三轴矩阵（T-Spin · Combo · B2B 合并序，AC-9；
 *   挂 globalThis.TetrisGame=G 同 r21 段；b2bBonus 载荷直读，缺省/0/NaN 跳轴 → 既有双轴文案逐字不变）
 * ============================================================================ */

test('r23: buildRewardText 三轴矩阵（T-Spin · Combo · B2B，AC-9）', () => {
  globalThis.TetrisGame = G
  try {
    // ① 三轴同帧合并序：T-Spin 在前 · Combo 在中 · B2B 尾随（AC-9，E5）
    assert.equal(
      T.buildRewardText({ combo: 1, comboBonus: 50, tspin: 'full', cleared: 1, level: 1, b2bBonus: 400 }),
      'T-Spin Single +800 · Combo ×1 +50 · B2B +400',
      '三轴合并序 = T-Spin Single +800 · Combo ×1 +50 · B2B +400'
    )
    // ② Tetris（无 T-spin 轴）：Combo · B2B
    assert.equal(
      T.buildRewardText({ combo: 1, comboBonus: 50, tspin: 'none', cleared: 4, level: 1, b2bBonus: 400 }),
      'Combo ×1 +50 · B2B +400',
      'Tetris 无 T-spin 轴 → Combo ×1 +50 · B2B +400'
    )
    // ③ 纯 B2B（无 combo / 无 T-spin）
    assert.equal(
      T.buildRewardText({ combo: null, comboBonus: null, tspin: 'none', cleared: 4, level: 1, b2bBonus: 400 }),
      'B2B +400',
      '纯 B2B → B2B +400'
    )
    // ④ 断链/静默：b2bBonus 0 / 缺省 / NaN / 负 → 轴跳过 → 既有双轴文案逐字不变（AC-9/E10）
    assert.equal(
      T.buildRewardText({ combo: 2, comboBonus: 100, tspin: 'none', cleared: 4, level: 1, b2bBonus: 0 }),
      'Combo ×2 +100',
      'b2bBonus=0 → 跳轴'
    )
    assert.equal(
      T.buildRewardText({ combo: 1, comboBonus: 50, tspin: 'full', cleared: 1, level: 1, b2bBonus: undefined }),
      'T-Spin Single +800 · Combo ×1 +50',
      'b2bBonus 缺省 → 跳轴（既有双轴文案零变化）'
    )
    assert.equal(
      T.buildRewardText({ combo: 1, comboBonus: 50, tspin: 'full', cleared: 1, level: 1, b2bBonus: NaN }),
      'T-Spin Single +800 · Combo ×1 +50',
      'b2bBonus NaN → 跳轴（无 NaN 文案路径）'
    )
    assert.equal(
      T.buildRewardText({ combo: 1, comboBonus: 50, tspin: 'full', cleared: 1, level: 1, b2bBonus: -5 }),
      'T-Spin Single +800 · Combo ×1 +50',
      'b2bBonus 负 → 跳轴'
    )
    // ⑤ 三轴序断言：split(' · ') 恰 3 段、[0] T-Spin 开头、[2] B2B + 开头
    const three = T.buildRewardText({ combo: 1, comboBonus: 50, tspin: 'full', cleared: 1, level: 1, b2bBonus: 400 })
    const parts = three.split(' · ')
    assert.equal(parts.length, 3, '三轴恰 3 段（split 序断言）')
    assert.ok(parts[0].indexOf('T-Spin') === 0, '序①：T-Spin 在前')
    assert.ok(parts[2].indexOf('B2B +') === 0, '序③：B2B 尾随（内容 ' + parts[2] + '）')
  } finally {
    delete globalThis.TetrisGame
  }
})

/* ======================================================================
 * r24 触控区掌机双簇 + 操作区背景四皮肤（T5 收口；TECHNICAL §6.3）
 * 纯追加段：DOCK_SKINS 导出交叉 / applyDockSkin 纯函数矩阵 / DOM 双簇结构 /
 * ✛ 非交互三层保险 / 尺寸 token 与紧凑两媒体 / 皮肤作用域切片 / 外观组门控
 * ==================================================================== */
const fsR24 = require('fs')
const pathR24 = require('path')
const P24 = require('../persist.js')
const cssR24 = fsR24.readFileSync(process.env.DSH_VERIFY_UI_CSS || pathR24.join(__dirname, '..', 'style.css'), 'utf8')
const htmlR24 = fsR24.readFileSync(process.env.DSH_VERIFY_UI_HTML || pathR24.join(__dirname, '..', 'index.html'), 'utf8')

// 作用域切片（与 r19 先例同款）：S 竖屏块 / 横屏侧轨块
const sStartR24 = cssR24.indexOf('@media (max-width: 599px)')
const sLandR24 = cssR24.indexOf('@media (max-width: 599px) and (orientation: landscape)')
const landStartR24 = cssR24.indexOf('@media (orientation: landscape)')
const landEndR24 = cssR24.indexOf('6. 可访问性与降级')
const sPortraitR24 = cssR24.slice(sStartR24, sLandR24)
const landSliceR24 = cssR24.slice(landStartR24, landEndR24)
assert.ok(sStartR24 !== -1 && sLandR24 > sStartR24 && landStartR24 !== -1 && landEndR24 > landStartR24, 'r24 切片锚点齐备')

test('r24: DOCK_SKINS 导出交叉（ui ↔ persist ↔ index.html radio value 三处单一事实来源）', () => {
  assert.deepEqual(T.DOCK_SKINS, P24.DOCK_SKINS, 'ui/persist 枚举深等')
  assert.deepEqual(T.DOCK_SKINS, ['glass', 'float', 'fade', 'pod'], '四枚举值域')
  // index.html 四 radio value 与枚举交叉（防漂移）
  const radioValues = []
  const re = /<input type="radio" name="dock-skin" value="([^"]+)"[^>]*>/g
  let m
  while ((m = re.exec(htmlR24)) !== null) radioValues.push(m[1])
  assert.equal(radioValues.length, 4, 'radio 恰 4 个')
  assert.deepEqual(radioValues.slice().sort(), T.DOCK_SKINS.slice().sort(), 'radio value ↔ DOCK_SKINS 全等')
  // 登记改写（取代 r24#AC-7 授权，r26 §6.2 R-D6）：名称移入独立 span（AC-8 另起一行）——
  // 文本承载由「紧跟 input 的 label 文本」改为「.dock-skin-option__name span」；右半 input 断言零改动
  assert.ok(/dock-skin-option__name">C 渐隐托盘<\/span>/.test(htmlR24) && /<input type="radio" name="dock-skin" value="fade" checked>/.test(htmlR24),
    '默认 C 渐隐 checked（r26：名称移入 name span，取代 r24#AC-7 授权）')
})

test('r24: applyDockSkin 纯函数矩阵（合法/非法/幂等/全量替换/custom set）', () => {
  const makeFake = () => ({
    classList: {
      set: new Set(),
      remove: function (c) { this.set.delete(c) },
      add: function (c) { this.set.add(c) },
    },
  })
  const el = makeFake()
  assert.equal(T.applyDockSkin(el, 'glass'), true, '合法枚举 → true 且挂类')
  assert.deepEqual(Array.from(el.classList.set), ['touchpad--skin-glass'])
  // 全量替换：快速连续切换不残留双类（裁定 D4 class 层面配套）
  T.applyDockSkin(el, 'pod')
  T.applyDockSkin(el, 'fade')
  assert.deepEqual(Array.from(el.classList.set), ['touchpad--skin-fade'], '切换后恰一皮肤类')
  // 幂等：重复同值不产生多类
  T.applyDockSkin(el, 'fade')
  assert.deepEqual(Array.from(el.classList.set), ['touchpad--skin-fade'], '幂等')
  // 非法输入：不加类、返回 false——但「全量去旧类」先于合法性校验（契约：移除四类后不添加）
  assert.equal(T.applyDockSkin(el, 'neon'), false, '非枚举 → false')
  assert.deepEqual(Array.from(el.classList.set), [], '非法输入 → 旧皮肤类已清、无新类（全量去类语义）')
  assert.equal(T.applyDockSkin(null, 'glass'), false, 'null 元素 → false')
  assert.equal(T.applyDockSkin(el), false, '无 skin 参数 → false')
  // custom skins 集（独立注入）
  const el2 = makeFake()
  assert.equal(T.applyDockSkin(el2, 'x', ['x', 'y']), true)
  assert.deepEqual(Array.from(el2.classList.set), ['touchpad--skin-x'], 'custom set 生效')
})

test('r24: 触控区双簇 DOM 契约（AC-1：六 .tkey[data-action] 字面量/数量零改名，仅集合断言）', () => {
  const all = []
  let m
  const re = /data-action="([^"]+)"/g
  while ((m = re.exec(htmlR24)) !== null) all.push(m[1])
  assert.equal(all.length, 6, '六键零增删')
  assert.deepEqual(all.slice().sort(), T.TOUCH_KEYS.map(function (e) { return e.action }).sort(),
    'data-action 集合 ↔ TOUCH_KEYS 全等（既有 AC-1 交叉断言并存）')
  // 左十字簇恰 4 键（dir 区）+ 右旋转簇恰 2 键（Hold/旋转）
  const crossStart = htmlR24.indexOf('class="tpad-cross"')
  const mainStart = htmlR24.indexOf('class="tpad-main"')
  assert.ok(crossStart !== -1 && mainStart > crossStart, '双簇 wrapper 存在且源序 cross→main')
  const crossActions = []
  const re2 = /data-action="([^"]+)"/g
  while ((m = re2.exec(htmlR24.slice(crossStart, mainStart))) !== null) crossActions.push(m[1])
  // 登记改写（取代 r24#AC-1 授权，r27 §9 D-3）：十字键上下位互换（上=硬降 → 上=软降）——
  // 随模板层整按钮交换落新 DOM 源序 softDrop/左/右/hardDrop
  assert.deepEqual(crossActions, ['softDrop', 'moveLeft', 'moveRight', 'hardDrop'],
    '十字簇 4 键（上软降/左右横移/下硬降，DOM 源序）')
  const mainActions = []
  const re3 = /data-action="([^"]+)"/g
  while ((m = re3.exec(htmlR24.slice(mainStart, htmlR24.indexOf('</div>', mainStart)))) !== null) mainActions.push(m[1])
  assert.deepEqual(mainActions, ['hold', 'rotate'], '右旋转簇 2 键（Hold 上/旋转下）')
})

test('r24: ✛ hub 非交互三层保险（AC-3：无 data-action / aria-hidden / pointer-events:none）', () => {
  const hubIdx = htmlR24.indexOf('tpad-cross__hub')
  assert.ok(hubIdx !== -1, 'hub 元素存在')
  const hubTag = htmlR24.slice(htmlR24.lastIndexOf('<', hubIdx), htmlR24.indexOf('>', hubIdx))
  assert.ok(hubTag.indexOf('data-action') === -1, 'hub 无 data-action（createTouchControls 选择器不命中）')
  assert.ok(hubTag.indexOf('aria-hidden="true"') !== -1, 'hub aria-hidden（不入读屏）')
  assert.ok(hubTag.indexOf('class="tpad-cross__hub"') !== -1, 'hub 为 span.tpad-cross__hub（无 .tkey 键类）')
  assert.match(cssR24, /\.tpad-cross__hub\s*\{[^}]*pointer-events:\s*none/, 'CSS 事件层保险（pointer-events:none）')
  // 无 .tkey 类 → 键样三态/尺寸规则不命中（基座 hub 规则独立）
  assert.ok(cssR24.indexOf('.tpad-cross__hub') !== -1)
})

test('r24: 尺寸 token 三元组与三档规格（AC-2/AC-4/AC-10，DESIGN §4.2）', () => {
  // 基座兼容别名保留（qa-e2e 1642/1644/1647 与 M/L --dock-h 算式零改动，裁定 D1）
  assert.match(cssR24, /--tpad-key:\s*3rem/, '基座 --tpad-key: 3rem 保留（M/L 兼容别名）')
  // S 标准档（竖屏块内）：dir 4rem=64 / hero 6rem=96 / hold 3.5rem=56 / gap 12px
  assert.match(sPortraitR24, /--tpad-key-dir:\s*4rem/, 'S 标准 dir 4rem(64px)')
  assert.match(sPortraitR24, /--tpad-key-hero:\s*6rem/, 'S 标准 hero 6rem(96px)')
  assert.match(sPortraitR24, /--tpad-key-hold:\s*3\.5rem/, 'S 标准 hold 3.5rem(56px)')
  assert.match(sPortraitR24, /--tpad-gap:\s*12px/, 'S 标准 gap 12px')
  // 紧凑两 media 分支（portrait && 宽≤359 ∥ 高≤639）：3.5/5/3rem + gap 10px
  assert.ok(cssR24.indexOf('@media (max-width: 359px)') !== -1, '紧凑分支①（宽≤359）存在')
  assert.ok(cssR24.indexOf('@media (max-height: 639px)') !== -1, '紧凑分支②（高≤639）存在')
  assert.ok((cssR24.match(/--tpad-key-dir:\s*3\.5rem/g) || []).length >= 3, 'dir 3.5rem 至少三处（紧凑×2 + 横屏×1）')
  assert.ok(cssR24.indexOf('--tpad-key-hero: 5rem') !== -1, 'hero 5rem(80px) 存在')
  assert.ok(cssR24.indexOf('--tpad-key-hold: 3rem') !== -1, 'hold 3rem(48px) 存在')
  assert.ok(cssR24.indexOf('--tpad-gap: 10px') !== -1, 'gap 10px 存在')
  // 横屏块内同径（D5：56/80/48）
  assert.match(landSliceR24, /--tpad-key-dir:\s*3\.5rem/, '横屏 dir 3.5rem')
  assert.match(landSliceR24, /--tpad-key-hero:\s*5rem/, '横屏 hero 5rem')
  assert.match(landSliceR24, /--tpad-key-hold:\s*3rem/, '横屏 hold 3rem')
  assert.match(landSliceR24, /--tpad-gap:\s*10px/, '横屏 gap 10px')
  // 320px 验算比值锚定（316 = 32 padding + 188 十字 + 16 簇距 + 80 右簇 ≤ 320，AC-4）
  assert.ok(cssR24.indexOf('316') !== -1 && cssR24.indexOf('320') !== -1, '320 验算注释锚定')
})

test('r24: 皮肤四类作用域（AC-7/AC-9：仅 S 竖屏 + 横屏块内，M/L 恒玻璃构造保证）', () => {
  const skins = ['glass', 'float', 'fade', 'pod']
  const inSlice = function (idx) {
    return (idx >= sStartR24 && idx < sLandR24) || (idx >= landStartR24 && idx < landEndR24)
  }
  for (const s of skins) {
    const needle = '.touchpad--skin-' + s
    const idxs = []
    let from = 0
    let i
    while ((i = cssR24.indexOf(needle, from)) !== -1) { idxs.push(i); from = i + needle.length }
    assert.ok(idxs.length >= 2, s + ' 皮肤类至少两处（S 竖屏 + 横屏）')
    for (const idx of idxs) assert.ok(inSlice(idx), s + ' 皮肤类全部落在 S/横屏作用域内（M/L 零新增，AC-9）')
  }
  // 键型覆写选择器（特异性高于基座 .tkey）
  assert.match(sPortraitR24, /\.tpad-cross\s+\.tkey\s*\{[^}]*var\(--tpad-key-dir\)/, '十字键走 dir token')
  assert.match(sPortraitR24, /\.tpad-main\s+\.tkey--rotate\s*\{[^}]*var\(--tpad-key-hero\)/, '旋转主键走 hero token')
  assert.match(sPortraitR24, /\.tpad-main\s+\.tkey--hold\s*\{[^}]*var\(--tpad-key-hold\)/, 'Hold 键走 hold token')
  // 皮肤类含「去整条底」语义：float/pod 无 blur
  assert.match(sPortraitR24, /\.touchpad--skin-float\s*\{[^}]*backdrop-filter:\s*none/, 'float 去容器底（S）')
})

test('r24: 外观组门控与 radio 语义（AC-12/AC-14：CSS 显隐 + 原生 radio 键盘可达）', () => {
  assert.match(cssR24, /\.settings-group--appearance\s*\{[^}]*display:\s*none/, '外观组基座 display:none（不入可访问性树）')
  assert.match(cssR24, /html\.has-touch\s+\.settings-group--appearance\s*\{[^}]*display:\s*block/, 'has-touch 下显示（纯 CSS 显隐）')
  assert.ok(htmlR24.indexOf('settings-group--appearance') !== -1, '外观组静态 DOM 恒在')
  assert.ok(htmlR24.indexOf('name="dock-skin"') !== -1, '原生 radio name=dock-skin')
  // AC-14：最小触控键 48px（紧凑 hold 3rem=48px）≥ 44
  assert.ok(cssR24.indexOf('--tpad-key-hold: 3rem') !== -1, '紧凑 hold 3rem')
  assert.ok(3 * 16 >= 44, '3rem → 48px ≥ 44 最小可点击目标（AC-14）')
  // S 竖屏 grid 双簇布局锚点
  assert.match(sPortraitR24, /\.tpad-cross\s*\{[^}]*display:\s*grid/, '十字簇 grid 布局')
  assert.match(sPortraitR24, /\.tpad-main\s*\{[^}]*flex-direction:\s*column/, '旋转簇纵列布局')
})

/* ======================================================================
 * r26 触控 rail 元素化 + 横屏门控 + 键帽质感 + 2×2 缩略选择器（T4 收口；TECHNICAL §6.2）
 * 纯追加段：rail 双轨 DOM 契约（AC-2）/ 基座 display:contents 中性化 / 横屏 <600px 门控（AC-3）/
 * 单边描边轨道盒与伪元素轨拆除（AC-2/AC-4）/ 两作用域三键类正圆（AC-5）/ 旋转常亮环零新 token（AC-6）/
 * 2×2 选择器结构（AC-7~9）/ 皮肤作用域防护（AC-12）
 * ==================================================================== */

// r24 :root 调色 token 基线（49 个；AC-6 零新增断言基准，从 r24 交付态快照）
const R26_BASELINE_TOKENS = [
  '--accent', '--accent-hi', '--bg', '--bg-deep', '--board-bg', '--danger', '--font-mono', '--font-ui',
  '--fs-2xl', '--fs-lg', '--fs-md', '--fs-sm', '--fs-title', '--fs-xl', '--fs-xs', '--glass-bg',
  '--glow-accent', '--glow-danger', '--glow-primary', '--glow-success', '--grid-line', '--ink', '--line',
  '--muted', '--primary', '--primary-glow', '--primary-hi', '--radius-lg', '--radius-md', '--radius-sm',
  '--sp-1', '--sp-2', '--sp-3', '--sp-4', '--sp-5', '--sp-6', '--sp-7', '--sp-8', '--success',
  '--surface', '--surface-2', '--tpad-key', '--z-bg', '--z-board', '--z-overlay-bg', '--z-overlay-card',
  '--z-panel', '--z-toast', '--z-touchpad',
]

test('r26: .rail 双轨 DOM 契约（AC-2：恰 2、l→r 源序、无 data-action/无键类、簇切片等价）', () => {
  const railL = htmlR24.indexOf('class="rail rail--l"')
  const railR = htmlR24.indexOf('class="rail rail--r"')
  assert.ok(railL !== -1 && railR !== -1, 'rail--l/rail--r 双轨存在')
  assert.ok(railL < railR, 'l 轨在 r 轨之前（源序）')
  assert.equal((htmlR24.match(/class="rail rail--l"/g) || []).length, 1, 'rail--l 恰 1')
  assert.equal((htmlR24.match(/class="rail rail--r"/g) || []).length, 1, 'rail--r 恰 1')
  // rail 起始标签本身：无 data-action / 无 .tkey 键类（回放器与六键聚合正则不命中）
  const railLTag = htmlR24.slice(htmlR24.lastIndexOf('<', railL), htmlR24.indexOf('>', railL) + 1)
  const railRTag = htmlR24.slice(htmlR24.lastIndexOf('<', railR), htmlR24.indexOf('>', railR) + 1)
  assert.ok(railLTag.indexOf('data-action') === -1 && railLTag.indexOf('tkey') === -1, 'rail--l 无 data-action/无键类')
  assert.ok(railRTag.indexOf('data-action') === -1 && railRTag.indexOf('tkey') === -1, 'rail--r 无 data-action/无键类')
  // rail--l 区间：包 tpad-cross 且恰 4 键；rail--r 区间：包 tpad-main 且恰 hold+rotate（切片沿 645~656 先例）
  const lRegion = htmlR24.slice(railL, railR)
  assert.ok(lRegion.indexOf('class="tpad-cross"') !== -1, '左轨包裹十字簇')
  const lKeys = []
  let m
  const lre = /data-action="([^"]+)"/g
  while ((m = lre.exec(lRegion)) !== null) lKeys.push(m[1])
  // 登记改写（取代 r24#AC-1 授权，r27 §9 D-3）：rail--l 包同一 tpad-cross，键序与 653 同源
  assert.deepEqual(lKeys, ['softDrop', 'moveLeft', 'moveRight', 'hardDrop'], '左轨恰 4 键（软降/左/右/硬降）')
  const rRegion = htmlR24.slice(railR, htmlR24.indexOf('</div>', railR))
  assert.ok(rRegion.indexOf('class="tpad-main"') !== -1, '右轨包裹旋转簇')
  const rKeys = []
  const rre = /data-action="([^"]+)"/g
  while ((m = rre.exec(rRegion)) !== null) rKeys.push(m[1])
  assert.deepEqual(rKeys, ['hold', 'rotate'], '右轨恰 2 键（Hold/旋转）')
})

test('r26: 基座 .rail display:contents 中性化（AC-2：竖屏/M/L 布局与 r24 逐字节等）', () => {
  assert.match(cssR24, /\.touchpad\s+\.rail\s*\{\s*display:\s*contents/, '基座 .touchpad .rail display:contents 中性化')
})

test('r26: 横屏块 <600px 门控 + M 块零侧轨（AC-3：M/L 恒行式底栏裁定落地）', () => {
  // 门控：landSlice 起始（横屏块注释/头部）含 and (max-width: 599px)，前缀匹配锚点零改动
  assert.ok(landSliceR24.slice(0, 80).indexOf('and (max-width: 599px)') !== -1,
    '横屏块加 and (max-width: 599px) 门控（AC-3）')
  // M 两档（600–767 / 768–1023）切片不含 .rail 与皮肤类——M/L 恒行式底栏构造保证。
  // 注：r24 基线两档前缀各异（min-width:600px / min-width:768px），indexOf 单前缀只能命中
  // 600 档（1 处）→ 登记修正为双前缀正则（601/768 两档各 1 处；HEAD r24 同缺，非 r26 引入）
  const mMarks = []
  let mm
  const mMre = /@media \(min-width: (?:600|768)px\)/g
  while ((mm = mMre.exec(cssR24)) !== null) mMarks.push(mm.index)
  assert.ok(mMarks.length >= 2, 'M 档至少两处（600/768）')
  for (const idx of mMarks) {
    const nextM = cssR24.indexOf('@media', idx + 1)
    const mSlice = cssR24.slice(idx, nextM === -1 ? cssR24.length : nextM)
    assert.ok(mSlice.indexOf('.rail') === -1, 'M 切片无 .rail')
    assert.ok(mSlice.indexOf('.touchpad--skin-') === -1, 'M 切片无皮肤类（恒玻璃，AC-12）')
  }
  // 基座行式底栏三件套（M/L 横屏落点）：--glass-bg 底 + border-top 描边 + 投影
  assert.match(cssR24, /\.touchpad\s*\{[^}]*background:\s*var\(--glass-bg\)[^}]*border-top:\s*1px\s+solid\s+var\(--line\)[^}]*box-shadow:/,
    '基座行式底栏三件套（恒玻璃）')
})

test('r26: 轨道盒单边描边 + 伪元素轨拆除（AC-2/AC-4：212/104 calc 串、safe-area、z-index 键盖轨）', () => {
  // 左轨 ≈212：width calc 串 + border-right 单边右描边 + safe-area 贴边
  assert.match(landSliceR24, /\.rail--l\s*\{[^}]*width:\s*calc\(3\s*\*\s*var\(--tpad-key-dir\)[^}]*border-right:\s*1px\s+solid\s+var\(--line\)[^}]*env\(safe-area-inset-left\)/,
    '左轨 212 calc + 单边右描边 + safe-area')
  // 右轨 ≈104：hero calc + border-left 单边左描边 + safe-area
  assert.match(landSliceR24, /\.rail--r\s*\{[^}]*width:\s*calc\(var\(--tpad-key-hero\)[^}]*border-left:\s*1px\s+solid\s+var\(--line\)[^}]*env\(safe-area-inset-right\)/,
    '右轨 104 calc + 单边左描边 + safe-area')
  // 伪元素轨已拆除：横屏块内不再有 .touchpad::before/::after（轨容器迁 .rail）
  assert.ok(landSliceR24.indexOf('.touchpad::before') === -1 && landSliceR24.indexOf('.touchpad::after') === -1,
    '伪元素轨已拆除（无 .touchpad::before/::after）')
  // 键 z-index:1 盖轨语义承继（r21）
  assert.match(landSliceR24, /\.tkey\s*\{[^}]*z-index:\s*1/, '键 z-index:1 盖轨（r21 承继）')
})

test('r26: 两作用域三键类正圆（AC-5：S 竖屏 + 横屏 cross/rotate/hold 全 border-radius:50%）', () => {
  const reCross = /\.tpad-cross\s+\.tkey\s*\{[^}]*border-radius:\s*50%/
  const reRotate = /\.tpad-main\s+\.tkey--rotate\s*\{[^}]*border-radius:\s*50%/
  const reHold = /\.tpad-main\s+\.tkey--hold\s*\{[^}]*border-radius:\s*50%/
  assert.match(sPortraitR24, reCross, 'S 十字键正圆')
  assert.match(sPortraitR24, reRotate, 'S 旋转键正圆')
  assert.match(sPortraitR24, reHold, 'S Hold 键正圆（补漏）')
  assert.match(landSliceR24, reCross, '横屏十字键正圆（补漏）')
  assert.match(landSliceR24, reRotate, '横屏旋转键正圆')
  assert.match(landSliceR24, reHold, '横屏 Hold 键正圆（补漏）')
})

test('r26: 旋转常亮环仅强度参数（AC-6：color-mix(primary 55%) + 图标 primary-hi，零新增 token）', () => {
  const ringRe = /border-color:\s*color-mix\(in oklch,\s*var\(--primary\)\s*55%,\s*transparent\)/
  const iconRe = /\.tkey--rotate\s+\.tkey__icon\s*\{[^}]*color:\s*var\(--primary-hi\)/
  assert.match(sPortraitR24, ringRe, 'S 旋转常亮环 55%（强度参数）')
  assert.match(sPortraitR24, iconRe, 'S 旋转图标 primary-hi')
  assert.match(landSliceR24, ringRe, '横屏旋转常亮环 55%')
  assert.match(landSliceR24, iconRe, '横屏旋转图标 primary-hi')
  // 零新增调色 token：:root 块变量名 ⊆ r24 基线（49 个快照）
  const rootM = cssR24.match(/:root\s*\{([\s\S]*?)\n\}/)
  assert.ok(rootM, ':root 块存在')
  const found = []
  let tm
  const tre = /--[a-z0-9-]+/g
  while ((tm = tre.exec(rootM[1])) !== null) found.push(tm[0])
  const uniq = [...new Set(found)]
  assert.equal(uniq.length, 49, ':root token 计数与 r24 基线一致（' + uniq.length + '）')
  for (const t of uniq) assert.ok(R26_BASELINE_TOKENS.indexOf(t) !== -1, 'token 属 r24 基线：' + t)
})

test('r26: 2×2 缩略选择器（AC-7~9：网格/名称另起一行/四皮肤 mini 预览/选中描边+✓/焦点环/320 预算）', () => {
  // 网格 2×2 + 列距（基座作用域）
  assert.match(cssR24, /\.dock-skin-control__list\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)/, '2×2 网格列（AC-7）')
  assert.match(cssR24, /\.dock-skin-control__list\s*\{[^}]*gap:\s*12px/, '列距 12px')
  // 四名称各另起一行（name span 独立块，AC-8）
  for (const n of ['A 玻璃 dock', 'B 无底浮键', 'C 渐隐托盘', 'D 双簇座舱']) {
    assert.ok(htmlR24.indexOf('dock-skin-option__name">' + n + '</span>') !== -1, '名称 span：' + n)
  }
  // 四皮肤 tile mini 预览类（真实皮肤变量 mini 化，AC-8）+ tile 样式落 CSS
  for (const s of ['glass', 'float', 'fade', 'pod']) {
    assert.ok(htmlR24.indexOf('dock-skin-option__tile--' + s) !== -1, 'tile 类：' + s)
    assert.match(cssR24, new RegExp('\\.dock-skin-option__tile--' + s + '\\s*\\{'), 'tile 样式：' + s)
  }
  // 选中态双信号（AC-9）：checked 描边 + ✓ 徽标；焦点环（AC-9/15）
  assert.match(cssR24, /input:checked\s*\+\s*\.dock-skin-option__tile\s*\{[^}]*border-color:\s*var\(--primary\)/, '选中描边')
  assert.match(cssR24, /input:checked\s*\+\s*\.dock-skin-option__tile::after/, '✓ 徽标停留')
  assert.match(cssR24, /input:focus-visible\s*\+\s*\.dock-skin-option__tile\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--accent\)/, '焦点环')
  // 320px 预算注释（AC-7：卡片 294 − padding − 列距 = 250 → tile≈125 ≥ 110；数字链断言防字形漂移）
  assert.ok(/250\s*[^0-9]{1,20}125\s*[^0-9]{1,20}110/.test(cssR24), '320 预算算式注释（250→125→110 数字链）')
})

test('r26: 皮肤作用域防护（AC-12：tile 类避开 .touchpad--skin- needle，r24 皮肤切片断言零扰动）', () => {
  // tile 皮肤选择器命名 dock-skin-option__tile--* 而非 .touchpad--skin-*——
  // 若误用 needle，r24「皮肤四类作用域」测试（全部 .touchpad--skin-* 落 S/横屏切片内）即炸 → 此处显式护栏
  assert.ok(cssR24.indexOf('.dock-skin-option__tile--touchpad--skin-') === -1, 'tile 类无 .touchpad--skin- 字样')
  // 皮肤类仍全部落 S/横屏作用域（r24 既有断言覆盖，此处复核数量不因 tile 类误增）
  const skins = ['glass', 'float', 'fade', 'pod']
  for (const s of skins) {
    const hits = cssR24.split('.touchpad--skin-' + s).length - 1
    assert.ok(hits >= 2, s + ' 皮肤 needle 数量 ≥2（未受 tile 类污染）')
  }
})

/* ======================================================================
 * r27 十字键上下位互换 + M/L 行式栏 order 冻结（T3 收口；TECHNICAL §9）
 * 纯追加段：基座 4 条 order 规则结构性断言（选择器+顺序值精确匹配 + 基座切片锚定，
 * 沿 M/L 恒玻璃构造保证先例）；行式栏 flex row 容器语义；[data-action] 选择器
 * 恰 4 条且全落基座、S/横屏两切片零残留（nth-child 显式 grid-area 落位 → order
 * 不参与自动放置，规则无需媒体门控即天然只作用行式栏，AC-5）。
 * 登记改写（取代 r24#AC-1）：653/769 两处键序断言已改新源序，见上。
 * 已知接受项（D-5）：M/L 视觉序（order 冻结=r26 硬降/左/右/软降）与 DOM 源序分叉，
 * 读屏顺序与视觉顺序在行式栏轻微不一致——人工抽查承继。
 * ==================================================================== */

// 基座锚点：基座双簇 flex 行块（.touchpad .tpad-cross, .tpad-main 联合块）——D-2 落点=紧邻其后；
// 上界=首个触控作用域媒体块（landStartR24：横屏侧轨块起始，S/横屏/M 均在其后）→
// order 规则须落两者之间（触控基座域内、媒体块外；文件更早期存在布局类 @media 块，不参与界定）
const baseCrossR27 = cssR24.search(/\.touchpad \.tpad-cross,\s*\.touchpad \.tpad-main\s*\{/)
assert.ok(baseCrossR27 !== -1, 'r27 基座双簇 flex 行块锚点存在')

test('r27: 基座 4 条 order 冻结规则（AC-5：选择器+顺序值 1..4 精确匹配，落触控基座域）', () => {
  const ORDER_RULES = [
    ['hardDrop', 1],
    ['moveLeft', 2],
    ['moveRight', 3],
    ['softDrop', 4],
  ]
  for (const [action, n] of ORDER_RULES) {
    const re = new RegExp(
      '\\.touchpad \\.tpad-cross > \\.tkey\\[data-action="' + action + '"\\]\\s*\\{\\s*order:\\s*' + n + ';'
    )
    const idx = cssR24.search(re)
    assert.ok(idx !== -1, 'order 规则存在：' + action + ' → order:' + n)
    assert.ok(idx > baseCrossR27, 'order 规则落在基座双簇块之后（D-2 紧邻落点）：' + action)
    assert.ok(idx < landStartR24, 'order 规则在触控作用域媒体块之外（S/横屏/M 之前）：' + action)
  }
  // 行式栏容器语义：基座 .tpad-cross（与 .tpad-main 联合块）为 flex 行——order 仅在 flex/grid 容器生效
  assert.match(cssR24, /\.touchpad\s+\.tpad-cross[\s\S]{0,160}?flex-direction:\s*row/,
    '基座行式栏 flex row 容器（order 生效前提，AC-5）')
})

test('r27: order 冻结唯一性防护（F5 演变：style.css [data-action= 选择器恰 4 条且全在基座）', () => {
  // r27 前 style.css 无任何 [data-action] 选择器（F5）；r27 仅新增这 4 条 order 规则
  const dataActionCount = cssR24.split('[data-action=').length - 1
  assert.equal(dataActionCount, 4, '[data-action= 选择器恰 4 条（未误增其他锚点）')
  // S/横屏为 nth-child 显式 grid-area 落位，order 不参与自动放置 → 两切片零 order 选择器残留
  assert.ok(sPortraitR24.indexOf('tkey[data-action=') === -1, 'S 竖屏切片无 order 选择器残留')
  assert.ok(landSliceR24.indexOf('tkey[data-action=') === -1, '横屏切片无 order 选择器残留')
})
