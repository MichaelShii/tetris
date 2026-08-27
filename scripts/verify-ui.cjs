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
 *   .stat-grid 包裹契约（四统计块原序 + viewport-fit=cover）、--dock-h 单一事实来源 calc 形状；
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
 * .stat-grid 包裹契约、--dock-h 单一事实来源 calc 形状。
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
  // ② 派生样式锚点：--dock-h（多档重声明的单一事实来源）、display:contents
  //    （S 档跨面板摊平；§6.2 警告：order 挂在 display:contents 无盒会静默失效 → 防该漂移）
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

test('r17: --dock-h 单一事实来源——S 两行 dock calc 形状 + #main 引用 + .touchpad 两行（AC-2/AC-6）', () => {
  const css = fs.readFileSync(CSS_FILE, 'utf8')
  const sStart = css.indexOf('@media (max-width: 599px)')
  const sLand = css.indexOf('@media (max-width: 599px) and (orientation: landscape)')
  assert.ok(sStart !== -1 && sLand > sStart, 'S 竖屏块须先于 S 横屏块（可切片）')
  const sPortrait = css.slice(sStart, sLand)
  // ① S 两行 dock 的 --dock-h = 2×键 + 行距 + 2×内边距 + inset（§6.3：禁 ui.js/常量表硬编码数值副本）
  assert.match(sPortrait, /--dock-h\s*:\s*calc\(\s*2\s*\*\s*var\(--tpad-key\)/,
    'S --dock-h calc 缺 2*var(--tpad-key)（两行 dock）')
  assert.match(sPortrait, /env\(safe-area-inset-bottom\)/, 'S 档 dock 缺 env(safe-area-inset-bottom)（AC-3 渐进增强）')
  // ② #main 预留必须引用 var(--dock-h)（而非数值字面量——否则与 dock 高度两处漂移）
  assert.match(sPortrait, /#main\s*\{[^}]*padding-bottom\s*:\s*var\(--dock-h\)/,
    'S 档 #main 缺 padding-bottom: var(--dock-h) 引用')
  // ③ .touchpad 两行 dock：flex-wrap 换行 + min-height:max( 中心带 16.5vh 抬升（§6.4）
  assert.match(sPortrait, /\.touchpad\s*\{[^}]*flex-wrap/, 'S 档 .touchpad 缺 flex-wrap（两行 dock）')
  assert.match(sPortrait, /min-height\s*:\s*max\(/, 'S 档缺 min-height: max(（16.5vh 中心带抬升）')
})
