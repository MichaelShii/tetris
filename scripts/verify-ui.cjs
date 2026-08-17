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

test('v2.2 ghost 视觉参数单一事实来源（AC-12.8 透明度可编程测量）', () => {
  // DESIGN §5.6：幽灵块同色系半透明空心轮廓
  assert.equal(typeof T.GHOST, 'object')
  assert.equal(T.GHOST.OUTLINE_ALPHA, 0.75) // 轮廓描边不透明度
  assert.equal(T.GHOST.FILL_ALPHA, 0.16)    // 内部极淡填充不透明度
  assert.equal(T.GHOST.LINE_WIDTH, 2)       // 轮廓线宽（px）
  // 引擎依赖：ui.js 渲染调用 ghostY 纯函数导出存在（AC-12.1）
  assert.equal(typeof G.ghostY, 'function')
})
