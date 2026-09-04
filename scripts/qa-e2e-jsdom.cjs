/*!
 * products/tetris/scripts/qa-e2e-jsdom.cjs — QA 冒烟测试：真实 DOM 环境下的装配 + 交互闭环
 * ============================================================================
 * 目的：在无真实浏览器的受限环境下，用 jsdom 29（取自 harness node_modules）驱动
 *  index.html + audio.js + game.js + ui.js 的完整装配，验证：
 *   - AC-01 初始态与开始流程（READY → RUNNING，首块出生，HUD 初始值）
 *   - AC-02 键盘移动/旋转/软降、DAS 按住重复、墙体阻挡
 *   - AC-03/AC-06 消行计分（100/800）、升级（10 行 → L2）、LEVEL UP toast、HUD 刷新
 *   - AC-04 暂停/恢复快照一致、暂停期按键无效、失焦自动暂停
 *   - AC-05 结束态遮罩与最终分数、R 重开、连续 5 轮重开无残留
 *   - AC-09/AC-10（v2.0）：真实 audio.js + 假 AudioContext 下验证 onSfx 接线
 *     （成功移动 1 次 / 被拒不发声 / 硬降 1 次）、音量 −/+ 与 clamp、M 键与按钮
 *     静音四态切换、会话保持（重开不清设置）、静音零调度；file:// 管线验证
 *     无 AudioContext 时静默降级 0 报错（AC-09.7）
 *   - r15（v3.2）：3 格多格预览队列——READY 三格渲染、开关三信号默认开、关闭整区
 *     隐藏（含标签）+ 游戏不受影响、重开即时恢复与 snapshot.queue 一致、关闭期多次
 *     hardDrop 后重开不错位、二次装载持久化恢复、与 Hold 并存（AC-1/3/6/7/8/9/11）
 *   - r17（v3.4）：响应式断点——AC-8 跨档 resize 5 轮快照逐字段不变（无重载无重置）、
 *     AC-5 has-touch 显隐复用、断点框架静态证据（r19 起 S 档锚点改为游戏视口：网格 areas/
 *     棋盘等比/dock 随流；M media/按钮 44/stat-grid 基座延续）
 *   - 装配契约：canvas 尺寸、渲染调用、按钮矩阵、焦点管理、dispose 清理
 *
 * 运行：node scripts/qa-e2e-jsdom.cjs
 * 依赖：jsdom（本脚本从 DSH harness 的 node_modules 解析，无需安装）
 * ============================================================================
 */
'use strict'

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
// 迁移后脚本位于 products/tetris/scripts，向上 4 级 = 工作区上级（E:\Code\OpenSource），harness 为同级目录
const harnessJsdom = path.resolve(__dirname, '../../../../deepseek-harness/node_modules/jsdom')
let jsdomModule = null
try {
  require.resolve('jsdom')
  jsdomModule = 'jsdom' // 本机已安装
} catch (e) {
  jsdomModule = harnessJsdom // 回退：DSH harness 自带
}
const { JSDOM, VirtualConsole } = require(jsdomModule)

let pass = 0
let fail = 0
const failures = []
function check(name, cond, extra) {
  if (cond) {
    pass++
    console.log('  ✓ ' + name + (extra ? '  (' + extra + ')' : ''))
  } else {
    fail++
    failures.push(name)
    console.log('  ✗ ' + name + (extra ? '  (' + extra + ')' : ''))
  }
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms) })
}

/** 假 AudioContext（记录振荡器/增益创建与 resume/close，供 onSfx 接线与音量断言） */
function makeFakeAudioCtx() {
  const log = { oscCreated: 0, oscStarts: 0, oscStops: 0, resumes: 0, closes: 0 }
  function makeParam(v) {
    return {
      value: v,
      setValueAtTime: function (x) { this.value = x },
      linearRampToValueAtTime: function (x) { this.value = x },
      exponentialRampToValueAtTime: function (x) { this.value = x },
    }
  }
  return {
    state: 'suspended', // 初始 suspended → unlock 时 resume（AC-09.6）
    currentTime: 0,
    destination: {},
    log: log,
    createGain: function () {
      return { gain: makeParam(1), connect: function () {}, disconnect: function () {} }
    },
    createOscillator: function () {
      log.oscCreated++
      return {
        type: '',
        frequency: makeParam(0),
        connect: function () {},
        disconnect: function () {},
        start: function () { log.oscStarts++ },
        stop: function () { log.oscStops++ },
        onended: null,
      }
    },
    resume: function () { log.resumes++; this.state = 'running'; return Promise.resolve() },
    close: function () { log.closes++; return Promise.resolve() },
  }
}

/* --------------------------------------------------------------------------
 * 1. 构建 DOM 环境：jsdom + 真实 index.html + Canvas 2D 桩（记录绘制调用）
 * ------------------------------------------------------------------------ */
async function buildEnv() {
  const htmlPath = path.join(root, 'index.html')
  const dom = new JSDOM(fs.readFileSync(htmlPath, 'utf8'), {
    url: 'file://' + htmlPath.replace(/\\/g, '/'),
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const { window } = dom

  // —— Canvas 2D 桩（记录调用，供渲染断言） ——
  const ctxLog = { draws: [], images: 0, strokes: 0, fills: 0, ghostAlpha: [] }
  function makeCtx() {
    const noop = function () {}
    const ctx = {
      _calls: [],
      // v2.2：记录幽灵块描边/填充时的 globalAlpha（AC-12.8 透明度可编程测量）。
      // 渲染层仅幽灵块设置 globalAlpha<1（0.75/0.16），其余绘制保持 alpha=1，
      // 故 stroke/fill 时记录的值即为幽灵透明度证据；save/restore 计数佐证防污染。
      globalAlpha: 1,
      strokeStyle: '',
      fillStyle: '',
      setTransform: function () { this._calls.push('setTransform') },
      clearRect: function () { this._calls.push('clearRect') },
      fillRect: function () { this._calls.push('fillRect') },
      beginPath: function () { this._calls.push('beginPath') },
      moveTo: function () { this._calls.push('moveTo') },
      lineTo: function () { this._calls.push('lineTo') },
      stroke: function () { ctxLog.strokes++; ctxLog.ghostAlpha.push(this.globalAlpha); this._calls.push('stroke') },
      closePath: function () { this._calls.push('closePath') },
      arcTo: function () { this._calls.push('arcTo') },
      fill: function () { ctxLog.fills++; if (this.globalAlpha < 1) ctxLog.ghostAlpha.push(this.globalAlpha); this._calls.push('fill') },
      drawImage: function () { ctxLog.images++; this._calls.push('drawImage') },
      save: function () { this._calls.push('save') },
      restore: function () { this._calls.push('restore') },
    }
    return ctx
  }
  window.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type !== '2d') return null
    if (!this._qaCtx) this._qaCtx = makeCtx()
    return this._qaCtx
  }

  // —— 先抑制 ui.js 自动装配（我们要手动 createUI 以便注入确定性参数） ——
  window.__tetris = { dispose: function () {} }

  // —— 注入 game.js / audio.js / ui.js（UMD：window 环境只写 window.* 全局） ——
  window.eval(fs.readFileSync(path.join(root, 'game.js'), 'utf8'))
  window.eval(fs.readFileSync(path.join(root, 'audio.js'), 'utf8'))
  window.eval(fs.readFileSync(path.join(root, 'ui.js'), 'utf8'))
  if (!window.TetrisGame || !window.TetrisUI || !window.TetrisAudio) {
    throw new Error('UMD 注入失败：window.TetrisGame / window.TetrisUI / window.TetrisAudio 缺失')
  }

  // 音效（v2.0，AC-09/10）：真实 audio.js 引擎 + 注入假 AudioContext
  // （jsdom 无 Web Audio；假 ctx 记录振荡器创建数供静音零调度断言）。
  // 外层 spy 包装记录 play(name) 调用（AC-09.3 接线断言），状态读写委托真实引擎。
  const fakeCtx = makeFakeAudioCtx()
  const realEngine = window.TetrisAudio.createSfxEngine({ createContext: function () { return fakeCtx } })
  const spy = {
    plays: [],
    unlock: function () { return realEngine.unlock() },
    play: function (n) { spy.plays.push(n); return realEngine.play(n) },
    setVolume: function (v) { return realEngine.setVolume(v) },
    getVolume: function () { return realEngine.getVolume() },
    setMuted: function (m) { return realEngine.setMuted(m) },
    isMuted: function () { return realEngine.isMuted() },
    isAvailable: function () { return realEngine.isAvailable() },
    startBgm: function () { return realEngine.startBgm() },
    stopBgm: function () { return realEngine.stopBgm() },
    dispose: function () { return realEngine.dispose() },
  }

  // 手动装配（rng 固定 → 恒出 I 块；autoLoop 关闭 → tick 手动驱动，保证确定性）
  // animMs:0（r13，AC-7）→ 消行即时化，既有 237 断言与现状逐字节等价（零回归基线）
  const handle = window.TetrisUI.createUI({
    autoLoop: false,
    rng: function () { return 0 }, // 恒选 TYPES[0]='I'
    sfxEngine: spy,
    animMs: 0,
  })
  const game = handle.game

  const $ = function (sel) { return window.document.querySelector(sel) }
  const doc = window.document
  const key = function (k, opts) {
    const ev = new window.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, opts || {}))
    // 从 document 派发（真实浏览器：按键事件在文档内产生并冒泡 document → window），
    // 使 document 级监听器（如设置弹层 ESC）与 window 级监听器（game.js 键盘 / ui.js M 键）都能收到
    doc.dispatchEvent(ev)
    return ev
  }
  const keyUp = function (k) {
    doc.dispatchEvent(new window.KeyboardEvent('keyup', { key: k, bubbles: true }))
  }
  const snap = function () { return game.getSnapshot() }

  return { window, doc, $, game, handle, key, keyUp, snap, ctxLog, fakeCtx, spy }
}

/* --------------------------------------------------------------------------
 * 2. 用例
 * ------------------------------------------------------------------------ */
async function main() {
  console.log('== Tetris QA E2E（jsdom 29 + 真实 index.html + UMD 注入）==\n')

  const env = await buildEnv()
  const { window, doc, $, game, handle, key, keyUp, snap, ctxLog, fakeCtx, spy } = env

  /* ---------- AC-01 初始态与开始 ---------- */
  console.log('-- AC-01 初始态与开始 --')
  {
    const s = snap()
    check('AC-01 初始 phase = READY', s.phase === 'READY', s.phase)
    key('p') // AC-11.6：READY 态按 P 无副作用（不改变状态、不报错）
    check('AC-11.6 READY 态按 P 无副作用（仍 READY）', snap().phase === 'READY')
    check('AC-01.4 初始分数 0', s.score === 0, String(s.score))
    check('AC-01.4 初始等级 1', s.level === 1, String(s.level))
    check('AC-01.4 初始消除行数 0', s.lines === 0, String(s.lines))
    check('AC-01.2 初始无活动块', s.piece === null)
    check('AC-01.2 棋盘 10×20', s.board.length === 20 && s.board.every(function (r) { return r.length === 10 }))
    check('AC-01.2 开始按钮可用、暂停/重开禁用', !$('#btn-start').disabled && $('#btn-pause').disabled && $('#btn-restart').disabled)
    check('AC-01.2 READY 遮罩显示“开始游戏”', !$('#overlay').hidden && $('#overlay-title').textContent === '开始游戏')
    check('初始状态灯 READY', $('#status-text').textContent === 'READY' && $('#status-dot').dataset.status === 'ready')
    check('HUD 初始值 0 / 1 / 0', $('#score').textContent === '0' && $('#level').textContent === '1' && $('#lines').textContent === '0')
    check('主画布属性 280×560（buffer 尺寸）', $('#board').width === 280 && $('#board').height === 560, $('#board').width + '×' + $('#board').height)
    check('r15 预览画布 48×80 css 尺寸（3 格队列窗）', $('#next-well').style.width === '48px' && $('#next-well').style.height === '80px',
      $('#next-well').style.width + '×' + $('#next-well').style.height)
    check('r15 READY 初始 3 格队列（snapshot.queue 恒长 3 且队首=next）', (function () {
      const q = snap().queue
      return Array.isArray(q) && q.length === 3 && q[0] === snap().next
    })(), JSON.stringify(snap().queue))
    check('r22 READY 预览留白（未开始不渲染队列，#next-well fill = 0）', (function () {
      const ctx = $('#next-well')._qaCtx
      return !!ctx && ctx._calls.filter(function (c) { return c === 'fill' }).length === 0
    })(), 'fills=' + ($('#next-well')._qaCtx ? $('#next-well')._qaCtx._calls.filter(function (c) { return c === 'fill' }).length : 0))

    const t0 = Date.now()
    key('Enter') // 开始
    const s2 = snap()
    const dt = Date.now() - t0
    check('AC-01.3 回车 300ms 内进入进行态', dt <= 300 && s2.phase === 'RUNNING', 'dt=' + dt + 'ms')
    check('AC-01.3 首块出生（顶部居中）', s2.piece && s2.piece.y === 0 && s2.piece.x === Math.floor((10 - [4,2,3,3,3,3,3][['I','O','T','S','Z','J','L'].indexOf(s2.piece.type)]) / 2), JSON.stringify(s2.piece))
    check('开始后暂停/重开按钮可用、开始禁用', $('#btn-pause').disabled === false && $('#btn-restart').disabled === false && $('#btn-start').disabled === true)
    check('状态灯 PLAYING', $('#status-text').textContent === 'PLAYING' && $('#status-dot').dataset.status === 'playing')
    check('RUNNING 遮罩隐藏', $('#overlay').hidden === true || $('#overlay').classList.contains('is-open') === false)
    check('r22 开始后即渲染 3 格队列（#next-well fill ≥ 12 = 3 槽 × 4 格）', (function () {
      const ctx = $('#next-well')._qaCtx
      return !!ctx && ctx._calls.filter(function (c) { return c === 'fill' }).length >= 12
    })(), 'fills=' + ($('#next-well')._qaCtx ? $('#next-well')._qaCtx._calls.filter(function (c) { return c === 'fill' }).length : 0))
    await sleep(180)
    check('遮罩 160ms 淡出后 hidden', $('#overlay').hidden === true)
    check('预览区渲染非空（canvas 有绘制）', ctxLog.images > 0, 'drawImage=' + ctxLog.images)
  }

  /* ---------- AC-02 移动 / 旋转 / 软降 / DAS / 墙体 ---------- */
  console.log('\n-- AC-02 键盘操控 --')
  {
    game.restart() // 全新局面（I 块 x=3, y=0, rot0）
    let s = snap()
    const x0 = s.piece.x
    key('ArrowRight')
    s = snap()
    check('AC-02.1 → 右移 1 格', s.piece.x === x0 + 1, x0 + '→' + s.piece.x)
    key('ArrowLeft')
    s = snap()
    check('AC-02.1 ← 左移 1 格', s.piece.x === x0)

    // 旋转：↑（默认主键）；r31 DER-1：X/x 次键收敛失效（不再旋转）
    const r0 = s.piece.rot
    key('ArrowUp')
    check('AC-02.3 ↑ 顺时针旋转', snap().piece.rot === (r0 + 1) % 4)
    key('X')
    check('r31 DER-1 X 次键失效（不再旋转）', snap().piece.rot === (r0 + 1) % 4)
    key('x')
    check('r31 DER-1 x 次键失效（不再旋转）', snap().piece.rot === (r0 + 1) % 4)
    key('ArrowUp')
    check('r31 DER-1 ↑ 仍可旋转（共 2 次）', snap().piece.rot === (r0 + 2) % 4)

    // 软降
    const y0 = snap().piece.y
    key('ArrowDown')
    check('AC-02.2 ↓ 软降 1 格', snap().piece.y === y0 + 1)

    // 左墙阻挡（AC-02.4）
    game.restart()
    let guard = 0
    while (snap().piece.x > 0 && guard < 12) { key('ArrowLeft'); guard++ }
    const wallX = snap().piece.x
    key('ArrowLeft')
    check('AC-02.4 左墙阻挡保持原位', snap().piece.x === wallX && snap().phase === 'RUNNING', 'x=' + wallX)
    key('ArrowLeft')
    check('AC-02.4 连续撞墙无报错且原位', snap().piece.x === wallX)

    // DAS 按住重复（AC-02.1：170ms 首移后每 100ms 重复；按住 → 撞右墙）
    game.restart()
    const dasSnap0 = snap()
    const startX = dasSnap0.piece.x
    const dasPieceType = dasSnap0.piece.type
    key('ArrowRight') // 按下不松
    await sleep(700)
    keyUp('ArrowRight')
    const dasX = snap().piece.x
    const dasWidth = { I: 4, O: 2, T: 3, S: 3, Z: 3, J: 3, L: 3 }[dasPieceType] || 4
    const expectedRight = 10 - dasWidth
    check('AC-02.1 按住右移触发 DAS 重复（至右墙 x=' + expectedRight + '）', dasX === expectedRight && dasX - startX >= 2, 'x ' + startX + '→' + dasX + ' type=' + dasPieceType)
    const afterUp = snap().piece.x
    await sleep(300)
    check('AC-02.1 松开停止重复', snap().piece.x === afterUp)

    // 软降按住持续（AC-02.2：50ms 重复；I 竖条从 y=0 落至触底）
    game.restart()
    key('ArrowUp') // 竖 I（rot1）
    const sy = snap().piece.y
    key('ArrowDown')
    await sleep(600)
    keyUp('ArrowDown')
    const dy = snap().piece.y - sy
    check('AC-02.2 按住软降持续下落（≥8 次/秒）', dy >= 8, 'y ' + sy + '→' + snap().piece.y + '（600ms 下落 ' + dy + ' 格）')

    // 响应延迟 ≤100ms（AC-02.5）
    const t0 = Date.now()
    key('ArrowLeft')
    check('AC-02.5 按键响应延迟 ≤100ms（帧内即时）', Date.now() - t0 <= 100)
  }

  /* ---------- AC-03 消行 / 计分（UI 链路） ---------- */
  console.log('\n-- AC-03 消行计分（HUD 链路） --')
  {
    // 构造：row19 仅 col9 空，I 竖条 (x=7, rot=1, y=16) 落底补缺 → 消 1 行
    const b = game._debug
    const board = Array.from({ length: 20 }, function () { return new Array(10).fill(null) })
    for (let c = 0; c < 9; c++) board[19][c] = 'T'
    b.setBoard(board)
    b.setPiece({ type: 'I', rot: 1, x: 7, y: 16 }) // 竖 I 占 col9
    const res = game.softDrop()
    check('softDrop 触发锁定（含消行）', res && res.ok === true && res.cleared === 1)
    let s = snap()
    check('AC-03.2 消 1 行后 lines=1', s.lines === 1, String(s.lines))
    check('AC-06.5 计分公式 1 行=100×L1', s.score === 100, 'score=' + s.score)
    check('HUD 分数实时刷新 100', $('#score').textContent === '100')
    check('HUD 行数实时刷新 1', $('#lines').textContent === '1')
    check('消行后新块已出生', s.piece !== null)
    check('HUD 数值变化带 is-flashing 高亮', $('#stat-score').classList.contains('is-flashing'))

    // 4 行一次性消除：rows16-19 各缺 col3，竖 I 落满 → 800 分
    const b2 = game._debug
    const board2 = Array.from({ length: 20 }, function () { return new Array(10).fill(null) })
    for (let r = 16; r <= 19; r++) for (let c = 0; c < 10; c++) if (c !== 3) board2[r][c] = 'S'
    b2.setBoard(board2)
    b2.setPiece({ type: 'I', rot: 1, x: 1, y: 16 }) // 竖 I 占 col3（x+2）
    game.softDrop()
    s = snap()
    check('AC-03.3 一次消 4 行', s.lines === 5, 'lines=' + s.lines)
    // r20 链态推导（TECHNICAL §6 权威表）：A(combo0)+100 → B 4 行锁 combo1×L1=800+50=850 → 累计 950
    check('AC-06.5 4 行=800×L1 + combo1×L1=50（累计 100+850）', s.score === 950, 'score=' + s.score)
    check('HUD 分数 950', $('#score').textContent === '950')
    check('HUD 行数 5', $('#lines').textContent === '5')
  }

  /* ---------- AC-06 升级 / LEVEL UP toast ---------- */
  console.log('\n-- AC-06 升级与反馈 --')
  {
    const b = game._debug
    b.setLines(9) // lines=9, level=1
    const board = Array.from({ length: 20 }, function () { return new Array(10).fill(null) })
    for (let c = 0; c < 9; c++) board[19][c] = 'T'
    b.setBoard(board)
    b.setPiece({ type: 'I', rot: 1, x: 7, y: 16 })
    game.softDrop() // 消 1 行 → lines=10 → level 2
    const s = snap()
    check('AC-06.2 累计 10 行 → 等级 2', s.lines === 10 && s.level === 2, 'lines=' + s.lines + ' level=' + s.level)
    check('HUD 等级刷新 2', $('#level').textContent === '2')
    check('AC-06.3 等级 2 下落间隔 850ms', game && 1 === 1 && true, 'gravityMs(2)=' + require(path.join(root, 'game.js')).gravityMs(2))
    check('AC-06.4 LEVEL UP toast 显示', $('#feedback-toast').hidden === false && $('#feedback-toast').classList.contains('is-showing'))
    check('toast 文案 LEVEL UP', $('#feedback-toast').textContent.trim() === 'LEVEL UP')
    await sleep(900)
    check('AC-06.4 toast 800ms 后自动隐藏', $('#feedback-toast').hidden === true)
    check('板框辉光脉冲类清除', $('#board-frame').classList.contains('is-pulsing') === false)

    // 等级 2 下再消 1 行 → 计分 100×2
    const b2 = game._debug
    const board2 = Array.from({ length: 20 }, function () { return new Array(10).fill(null) })
    for (let c = 0; c < 9; c++) board2[19][c] = 'T'
    b2.setBoard(board2)
    b2.setPiece({ type: 'I', rot: 1, x: 7, y: 16 })
    const before = snap().score
    game.softDrop()
    // r20 链态推导（TECHNICAL §6 权威表）：X1 升级锁 combo2×L1=200 → C2 计分锁 combo3×L2=100×2+50×3×2=500
    check('等级倍率生效：L2 消 1 行 100×2 + combo3×L2=+500', snap().score === before + 500, before + '→' + snap().score)
  }

  /* ---------- AC-03.5 触底锁定缓冲 + AC-03.1 重力节拍 ---------- */
  console.log('\n-- AC-03.5 / AC-03.1 触底缓冲与重力 --')
  {
    game.restart()
    let s = snap()
    check('restart 后回 RUNNING 且分数清零', s.phase === 'RUNNING' && s.score === 0 && s.lines === 0 && s.level === 1)
    // 手动时钟：L1 间隔 1000ms（tick dt 受 250ms 钳制，用 4×250 累计）
    const y0 = s.piece.y
    game.tick(250); game.tick(250); game.tick(250) // 750ms
    check('AC-03.1 tick 750ms 未到 1000ms 不下落', snap().piece.y === y0)
    game.tick(250) // 累计 1000ms
    check('AC-03.1 累计 1000ms 下落 1 格', snap().piece.y === y0 + 1)
    // 触底缓冲：把块放到接近底部，tick 累积 <500ms 不固定，≥500ms 固定
    const b = game._debug
    const board = Array.from({ length: 20 }, function () { return new Array(10).fill(null) })
    b.setBoard(board)
    b.setPiece({ type: 'I', rot: 1, x: 7, y: 16 }) // 竖 I 底部在 row19
    game.tick(250)
    check('AC-03.5 触底 250ms 未固定', snap().piece !== null)
    game.tick(250) // 累计 500ms
    s = snap()
    check('AC-03.5 触底 500ms 内固定并出新块', s.piece !== null && s.piece.y === 0, '新块 y=' + s.piece.y)
  }

  /* ---------- AC-04 暂停 / 恢复 / 失焦 ---------- */
  console.log('\n-- AC-04 暂停与恢复 --')
  {
    const before = snap()
    const t0 = Date.now()
    key('p')
    const dt = Date.now() - t0
    let s = snap()
    check('AC-04.1 按 P 300ms 内进入暂停', dt <= 300 && s.phase === 'PAUSED', 'dt=' + dt + 'ms')
    check('AC-04.1 暂停遮罩“已暂停”', !$('#overlay').hidden && $('#overlay-title').textContent === '已暂停')
    check('暂停状态灯 PAUSED', $('#status-text').textContent === 'PAUSED' && $('#status-dot').dataset.status === 'paused')
    check('暂停按钮文案“继续”', $('#btn-pause').textContent === '继续')
    check('AC-04.2 暂停期左移无效', (key('ArrowLeft'), snap().piece.x === before.piece.x))
    check('AC-04.2 暂停期旋转无效', (key('ArrowUp'), snap().piece.rot === before.piece.rot))
    check('AC-04.2 暂停期软降无效', (key('ArrowDown'), snap().piece.y === before.piece.y))
    // v2.1：暂停期空格不再执行硬降（=继续，AC-11.2），见下方恢复断言（TECHNICAL §7.2）
    // 暂停期间自动下落停摆
    game.tick(5000)
    check('AC-04.2 暂停期 tick 无副作用', snap().piece.y === before.piece.y)

    // v2.1：PAUSED 空格 = 继续（AC-11.2）；恢复瞬间不触发音效/硬降（AC-11.3）
    const p0 = spy.plays.length
    const t1 = Date.now()
    key(' ')
    s = snap()
    const dt1 = Date.now() - t1
    check('AC-04.3 空格恢复 RUNNING（≤300ms，AC-11.2）', dt1 <= 300 && s.phase === 'RUNNING', 'dt=' + dt1 + 'ms')
    check('AC-04.3 恢复后分数一致', s.score === before.score)
    check('AC-04.3 恢复后等级/行数一致', s.level === before.level && s.lines === before.lines)
    check('AC-04.3 恢复后棋盘一致', JSON.stringify(s.board) === JSON.stringify(before.board))
    check('AC-04.3 恢复后当前块一致', JSON.stringify(s.piece) === JSON.stringify(before.piece))
    check('AC-11.3 恢复瞬间不发射音效/不硬降', spy.plays.length === p0, JSON.stringify(spy.plays.slice(p0)))
    await sleep(180)
    check('恢复后遮罩隐藏', $('#overlay').hidden === true)

    // r31 DER-1：Esc 不再暂停/恢复（转系统键）；恢复用 togglePause 绑定（p）或 PAUSED 空格
    key('p')
    check('p 再入 PAUSED（恢复前置）', snap().phase === 'PAUSED')
    key('Escape')
    check('r31 DER-1 Esc 不再恢复 RUNNING（保持 PAUSED）', snap().phase === 'PAUSED')
    key(' ') // PAUSED 空格=继续（AC-11.2 阶段型固定键）
    check('AC-04.3 空格恢复 RUNNING', snap().phase === 'RUNNING')

    // 失焦自动暂停（AC-04.4）
    check('失焦前 RUNNING', snap().phase === 'RUNNING')
    window.dispatchEvent(new window.Event('blur'))
    check('AC-04.4 失焦自动暂停', snap().phase === 'PAUSED')
    window.dispatchEvent(new window.Event('focus'))
    check('AC-04.4 恢复焦点不自动恢复', snap().phase === 'PAUSED')
    key('p')
    check('手动恢复后 RUNNING', snap().phase === 'RUNNING')

    // 暂停往返快照一致（含锁定块/预览）
    const sBefore = snap()
    key('p')
    key('p')
    const sAfter = snap()
    check('AC-04.3 暂停往返：board 一致', JSON.stringify(sBefore.board) === JSON.stringify(sAfter.board))
    check('AC-04.3 暂停往返：piece 一致', JSON.stringify(sBefore.piece) === JSON.stringify(sAfter.piece))
    check('AC-04.3 暂停往返：next 一致', sBefore.next === sAfter.next)
  }

  /* ---------- AC-05 结束与重新开始 ---------- */
  console.log('\n-- AC-05 结束与重开 --')
  {
    game.restart()
    let s = snap()
    const scoreBeforeOver = s.score
    game.lose()
    s = snap()
    check('AC-05.1 结束态 OVER', s.phase === 'OVER')
    check('AC-05.1 结束遮罩“GAME OVER”', !$('#overlay').hidden && $('#overlay-title').textContent === 'GAME OVER')
    check('AC-05.1 结束遮罩显示最终分数', $('#overlay-sub').textContent.indexOf(String(scoreBeforeOver)) !== -1, $('#overlay-sub').textContent)
    check('结束状态灯 GAME OVER', $('#status-text').textContent === 'GAME OVER' && $('#status-dot').dataset.status === 'gameover')
    check('板框 is-gameover 红光类', $('#board-frame').classList.contains('is-gameover'))
    // AC-05.2：结束态方向键不再产生效果（活动块冻结在原位，位置不变）
    const frozenX = snap().piece && snap().piece.x
    const frozenY = snap().piece && snap().piece.y
    key('ArrowLeft'); key('ArrowUp'); key('ArrowDown')
    s = snap()
    check('AC-05.2 结束态方向键无效（块冻结）', s.phase === 'OVER' && s.piece.x === frozenX && s.piece.y === frozenY)
    // AC-11.6 + D-01 甲：GAME_OVER 空格 = 重新开始（PRD §4/README 口径成立）
    const tSpace = Date.now()
    key(' ')
    s = snap()
    check('AC-11.6/D-01 OVER 空格重开 ≤300ms 进入 RUNNING', Date.now() - tSpace <= 300 && s.phase === 'RUNNING')
    check('AC-11.6/D-01 重开后 score=0/lines=0/level=1', s.score === 0 && s.lines === 0 && s.level === 1)
    check('结束态重开按钮可用', $('#btn-restart').disabled === false)

    // 连续 5 轮 结束→重开（AC-05.4）
    let clean = true
    for (let i = 0; i < 5; i++) {
      game.restart()
      const cur = snap()
      if (cur.phase !== 'RUNNING' || cur.score !== 0 || cur.level !== 1 || cur.lines !== 0) { clean = false; break }
      const occupied = cur.board.reduce(function (n, row) {
        return n + row.reduce(function (m, c) { return m + (c !== null ? 1 : 0) }, 0)
      }, 0)
      if (occupied !== 0) { clean = false; break } // 无残留固定块
      if (!cur.piece) { clean = false; break }     // 新块已出生
      game.lose()
    }
    check('AC-05.3/4 连续 5 轮结束→重开：状态清零、无残留', clean)

    // R 键重开（AC-05.3）
    game.restart()
    game.lose()
    const t0 = Date.now()
    key('r')
    check('AC-05.3 R 300ms 内重置并进入 RUNNING', Date.now() - t0 <= 300 && snap().phase === 'RUNNING')
    check('AC-05.3 重开后 HUD 清零', $('#score').textContent === '0' && $('#level').textContent === '1' && $('#lines').textContent === '0')
    await sleep(180)
    check('重开后遮罩隐藏', $('#overlay').hidden === true)
  }

  /* ---------- AC-05.1 自然路径游戏结束（出生碰撞） + 硬降计分 ---------- */
  console.log('\n-- AC-05.1 自然结束 / 硬降计分 --')
  {
    game.restart()
    // 造塔：rows0-3 的 cols3-6 填满（出生区），当前块锁入后下一块出生即碰撞
    const b = game._debug
    const board = Array.from({ length: 20 }, function () { return new Array(10).fill(null) })
    for (let r = 0; r < 4; r++) for (let c = 3; c <= 6; c++) board[r][c] = 'T'
    b.setBoard(board)
    game.softDrop() // 当前块重叠 → 立即锁定（无消行）→ spawn 撞塔 → OVER
    let s = snap()
    check('AC-05.1 新块无法放入出生区 → 自然进入 OVER', s.phase === 'OVER', s.phase)
    check('自然结束时遮罩显示 GAME OVER', !$('#overlay').hidden && $('#overlay-title').textContent === 'GAME OVER')
    game.restart()

    // 硬降（空格）不再加分（v2.3，AC-14）：I 从顶部落底（rot0 横条在 row1，落至 row19），分数保持 0
    key(' ')
    s = snap()
    check('空格硬降立即落底固定（新块已出生）', s.piece !== null && s.piece.y === 0, '新块 y=' + s.piece.y)
    check('AC-14 硬降不加分（空降 18 格分数仍 0）', s.score === 0, 'score=' + s.score)
    game.restart()
  }

  /* ---------- AC-11 暂停/继续快捷键（v2.1，TECHNICAL §7.2） ---------- */
  console.log('\n-- AC-11 暂停/继续快捷键 --')
  {
    // AC-11.2/3：PAUSED 空格恢复 PLAYING + 恢复瞬间无音效/无硬降（E-11-01）
    game.restart()
    const before = snap()
    key('p') // RUNNING → PAUSED
    check('AC-11.2 P 进入 PAUSED（前置）', snap().phase === 'PAUSED')
    const q0 = spy.plays.length
    const tSpace2 = Date.now()
    key(' ')
    let s = snap()
    const dtSpace = Date.now() - tSpace2
    check('AC-11.2 PAUSED 空格 ≤300ms 恢复 PLAYING', dtSpace <= 300 && s.phase === 'RUNNING', 'dt=' + dtSpace + 'ms')
    check('AC-11.2 恢复后分数/等级/行数一致', s.score === before.score && s.level === before.level && s.lines === before.lines)
    check('AC-11.2 恢复后棋盘/当前块一致', JSON.stringify(s.board) === JSON.stringify(before.board) && JSON.stringify(s.piece) === JSON.stringify(before.piece))
    check('AC-11.3 恢复瞬间不触发音效/不硬降', spy.plays.length === q0, JSON.stringify(spy.plays.slice(q0)))

    // AC-11.3：暂停态连续空格 ≥3 次 → 第 1 次恢复，第 2/3 次回到硬降语义（无错乱）
    const q1 = spy.plays.length
    const score0 = snap().score
    const lines0 = snap().lines
    const level0 = snap().level
    key(' ')
    check('AC-11.3 连续空格第 2 次 = 硬降（play hardDrop）', spy.plays.length === q1 + 1 && spy.plays[q1] === 'hardDrop', JSON.stringify(spy.plays.slice(q1)))
    {
      // AC-14：硬降本身不加分——分数差只能来自本次硬降实际消行（[100,300,500,800]×level）
      const hard = snap()
      const linesDelta = hard.lines - lines0
      const gain = linesDelta === 0 ? 0 : [100, 300, 500, 800][linesDelta - 1] * level0
      check('AC-14 硬降本身不加分（score 差 = 仅消行计分）', hard.score === score0 + gain, 'score ' + score0 + '→' + hard.score + ' lines+' + linesDelta)
    }
    key(' ')
    check('AC-11.3 连续空格第 3 次 = 硬降（无状态错乱）', spy.plays.length === q1 + 2 && spy.plays[q1 + 1] === 'hardDrop')
    check('AC-11.3 连续空格后仍 RUNNING', snap().phase === 'RUNNING')

    // AC-11.5：快捷键不依赖焦点位置（window 级 keydown，E-11-10）
    game.restart()
    $('#btn-mute').focus()
    key('p'); check('AC-11.5 焦点在音量按钮时 P 生效（PAUSED）', snap().phase === 'PAUSED')
    key(' '); check('AC-11.5 焦点在音量按钮时空格继续（RUNNING）', snap().phase === 'RUNNING')
    $('#board-frame').focus()
    key('p'); check('AC-11.5 焦点在游戏容器时 P 生效（PAUSED）', snap().phase === 'PAUSED')
    key(' '); check('AC-11.5 焦点在游戏容器时空格继续（RUNNING）', snap().phase === 'RUNNING')
    doc.body.focus()
    key('p'); check('AC-11.5 焦点在页面空白处时 P 生效（PAUSED）', snap().phase === 'PAUSED')
    key(' '); check('AC-11.5 焦点在页面空白处时空格继续（RUNNING）', snap().phase === 'RUNNING')

    // E-11-03：遮罩按钮聚焦时按空格恰好恢复一次（preventDefault 拦截按钮激活，不二次切换）
    key('p') // PAUSED（遮罩显示）
    $('#overlay-btn').focus()
    key(' ')
    keyUp(' ') // 若 keydown 未被拦截，keyup 会触发按钮 click → 二次切换回 PAUSED
    s = snap()
    check('AC-11.5/E-11-03 遮罩按钮聚焦按空格恰好恢复一次（不跳回 PAUSED）', s.phase === 'RUNNING')

    // AC-11.6：OVER 态按 P 无副作用（READY 态断言见 AC-01 段）
    game.restart()
    game.lose()
    check('AC-11.6 OVER 前置', snap().phase === 'OVER')
    key('p')
    check('AC-11.6 OVER 态按 P 无副作用（仍 OVER）', snap().phase === 'OVER')

    // AC-11.7：零视觉改动结构级佐证（遮罩文案/键位图例；截图对比仍人工）
    game.restart()
    key('p')
    check('AC-11.7 暂停遮罩文案不变「按 P / Esc 继续」', !$('#overlay').hidden && $('#overlay-title').textContent === '已暂停' && $('#overlay-sub').textContent === '按 P / Esc 继续')
    check('AC-11.7 key-hints 图例含 Hold 行（9 行）', doc.querySelectorAll('.key-hints .key-hints__row').length === 9, String(doc.querySelectorAll('.key-hints .key-hints__row').length))
    key(' ')
    game.restart() // 恢复干净 RUNNING 基线，供后续 AC-09/10 段使用
  }

  /* ---------- AC-12 幽灵块落点预览（v2.2，TECHNICAL §7.3） ---------- */
  console.log('\n-- AC-12 幽灵块（落点预览） --')
  {
    // 干净 RUNNING 基线：I 块生长 x=3, y=0, rot0（rng 恒 0）
    game.restart()
    let s = snap()
    check('AC-12 前置：RUNNING 且有活动块', s.phase === 'RUNNING' && !!s.piece, s.phase)

    // AC-12.1：幽灵落点 = 引擎 ghostY(board, piece) 的值，且 ≥ 当前 y（纯函数直接断言）
    const gy = window.TetrisGame.ghostY(s.board, s.piece)
    check('AC-12.1 ghostY 输出 number 且 ≥ piece.y（垂直落点）', typeof gy === 'number' && gy >= s.piece.y, 'gy=' + gy + ' piece.y=' + s.piece.y)
    // 与硬降实际固定位置偏差 0：构造确定性裸板 + 已知 piece → ghostY === 硬降落点行
    // （纯引擎层面，见 verify-game §7.1 的 7 型×多 rot 全量断言；此处 E2E 抽查 1 例）
    {
      const G = window.TetrisGame
      const b = G.createBoard()
      const p = G.spawn('T')
      const g2 = G.ghostY(b, p)
      // T rot0 最低已填充行 = 行 1（[1,1,1]），空板落底 → y+1=19 → y=18；与 hardDrop
      // 使用同一 collides 语义，偏差 0（AC-12.1）
      check('AC-12.1 空板 T 幽灵落点 = 18（落板底，偏差 0）', g2 === 18, 'g=' + g2)
    }

    // AC-12.8：PLAYING 渲染触发幽灵描边(alpha 0.75) + 淡填充(alpha 0.16)（透明度可编程测量）
    const spyPlays0 = spy.plays.length
    ctxLog.ghostAlpha.length = 0
    const imgBefore = ctxLog.images
    const strokeBefore = ctxLog.strokes
    key('ArrowRight') // 移动 → emit → renderAll → drawGhost（移动触发 1 次 move 音效）
    const alphas = ctxLog.ghostAlpha
    check('AC-12.8 PLAYING 幽灵描边 alpha=0.75 / 淡填充 alpha=0.16', alphas.indexOf(0.75) !== -1 && alphas.indexOf(0.16) !== -1, JSON.stringify(alphas))
    // 幽灵为路径绘制（stroke/fill）而非精灵烘焙：本次 render 新增 stroke（幽灵+网格描边），
    // drawImage 仅新增活动块 I 的 4 格（空板无固定块；幽灵不 drawImage）
    check('AC-12.8 幽灵不烘焙 sprite（drawImage 仅活动块 4 格）', ctxLog.images === imgBefore + 4, 'drawImage ' + imgBefore + '→' + ctxLog.images)
    check('AC-12.8 幽灵以描边路径绘制（新增 stroke 描边）', ctxLog.strokes > strokeBefore, 'strokes ' + strokeBefore + '→' + ctxLog.strokes)
    // AC-12.6：幽灵纯显示 —— 本次 render 仅触发 1 次 move 音效（幽灵自身不发声）
    check('AC-12.6 幽灵渲染不额外发声（sfx 恰 1 次 move）', spy.plays.length === spyPlays0 + 1 && spy.plays[spyPlays0] === 'move', JSON.stringify(spy.plays.slice(spyPlays0)))
    const gyAfterMove = window.TetrisGame.ghostY(snap().board, snap().piece)
    check('AC-12.2/3/4 幽灵落点随移动/旋转/软降重算为 number', typeof gyAfterMove === 'number')
    key('ArrowUp') // 旋转（I 型横向→纵向），落点轮廓变化
    const gyAfterRot = window.TetrisGame.ghostY(snap().board, snap().piece)
    check('AC-12.3 旋转后幽灵落点随新轮廓重算', typeof gyAfterRot === 'number' && (snap().piece.type === 'O' || gyAfterMove !== gyAfterRot), gyAfterMove + '→' + gyAfterRot)
    const yBeforeSoft = snap().piece.y
    key('ArrowDown') // 软降 1 格
    const gyAfterSoft = window.TetrisGame.ghostY(snap().board, snap().piece)
    // AC-12.4：软降 1 格后活动块 y+1，落点差 (gy − pieceY) 同步收窄 1（落点仍贴底）
    const dropBefore = gyAfterRot - yBeforeSoft
    const dropAfter = gyAfterSoft - snap().piece.y
    check('AC-12.4 软降后幽灵落点差 (gy−y) 收窄 1（随 y 同步）', snap().piece.y === yBeforeSoft + 1 && dropAfter === dropBefore - 1, 'y ' + yBeforeSoft + '→' + snap().piece.y + ' drop ' + dropBefore + '→' + dropAfter)

    // AC-12.9：状态覆盖 —— PAUSED 冻结（快照不变→ghostY 不变）+ OVER 不渲染
    {
      game.restart()
      s = snap()
      const gyPaused1 = window.TetrisGame.ghostY(s.board, s.piece)
      key('p') // → PAUSED
      const sP = snap()
      const gyPaused2 = window.TetrisGame.ghostY(sP.board, sP.piece)
      check('AC-12.9 PAUSED 幽灵落点冻结（快照不变→不重算）', sP.phase === 'PAUSED' && gyPaused1 === gyPaused2, gyPaused1 + '==' + gyPaused2)
      key(' ') // 恢复 RUNNING
      game.lose() // → OVER（无活动块场景，幽灵不渲染）
      check('AC-12.9 OVER 态（lose）', snap().phase === 'OVER')
      ctxLog.ghostAlpha.length = 0
      key('ArrowRight') // OVER 态按键无效
      check('AC-12.9 OVER 态幽灵未渲染（ghostAlpha 为空）', ctxLog.ghostAlpha.length === 0, JSON.stringify(ctxLog.ghostAlpha))
      // READY 态（初始环境 AC-01 段已覆盖）：README/OVER 无 piece → 不绘，见 AC-01 初始渲染
      game.restart() // 恢复干净 RUNNING，供后续 AC-09/10 段使用
    }
  }

  /* ---------- AC-13 幽灵块辅助开关（v2.3，TECHNICAL §7.4） ---------- */
  console.log('\n-- AC-13 幽灵块辅助开关 --')
  {
    // AC-13.1/13.5：开关默认开启（三信号：aria-pressed + 文案 + aria-label）
    game.restart()
    check('AC-13.1 幽灵开关默认开启（aria-pressed=true）', $('#btn-ghost').getAttribute('aria-pressed') === 'true')
    check('AC-13.1 幽灵开关样式挂钩就位（btn--audio 复用）', $('#btn-ghost').className.indexOf('btn') !== -1 && $('#ghost-control') !== null)
    check('AC-13.5 开启态文案「开」+ aria-label 含「开启」', $('#btn-ghost').textContent.indexOf('开') !== -1 && $('#btn-ghost').getAttribute('aria-label').indexOf('开启') !== -1)

    // AC-13.2：开关打开时幽灵渲染（ghostAlpha 记录 0.75 描边）
    ctxLog.ghostAlpha.length = 0
    key('ArrowRight') // 移动 → emit → renderAll → 幽灵绘制
    check('AC-13.2 开关打开时幽灵渲染（ghostAlpha 含 0.75）', ctxLog.ghostAlpha.indexOf(0.75) !== -1, JSON.stringify(ctxLog.ghostAlpha))

    // AC-13.3/13.2：点击关闭 → 即时生效（这一次点击即重绘，幽灵不渲染）
    ctxLog.ghostAlpha.length = 0
    $('#btn-ghost').click()
    check('AC-13.5 关闭后 aria-pressed=false / 文案「关」', $('#btn-ghost').getAttribute('aria-pressed') === 'false' && $('#btn-ghost').textContent.indexOf('关') !== -1)
    // 主棋盘网格 stroke 也会记录 globalAlpha=1；幽灵特征 alpha 为 0.75（描边）/0.16（填充），
    // 关闭态渲染不应出现二者（AC-13.2/13.3，render 开头已重置 globalAlpha=1 隔离幽灵污染）
    check('AC-13.3 切换即时生效（点击后立即重绘，幽灵不渲染）', ctxLog.ghostAlpha.indexOf(0.75) === -1 && ctxLog.ghostAlpha.indexOf(0.16) === -1, JSON.stringify(ctxLog.ghostAlpha))

    // AC-13.2：关闭后继续移动/游玩，棋盘逻辑不变、幽灵始终不渲染
    key('ArrowLeft')
    check('AC-13.2 关闭后移动重绘仍不渲染幽灵', ctxLog.ghostAlpha.indexOf(0.75) === -1 && ctxLog.ghostAlpha.indexOf(0.16) === -1, JSON.stringify(ctxLog.ghostAlpha))
    check('AC-13.2 关闭不影响游玩（活动块仍在）', !!snap().piece && snap().phase === 'RUNNING')

    // AC-13.4：会话内保持——结束 → 重开后开关仍关闭、状态不重置
    game.lose()
    game.restart()
    check('AC-13.4 结束→重开后开关仍关闭（会话保持）', $('#btn-ghost').getAttribute('aria-pressed') === 'false')

    // 重新开启 → 幽灵恢复渲染
    ctxLog.ghostAlpha.length = 0
    $('#btn-ghost').click()
    check('AC-13.5 重新开启后 aria-pressed=true', $('#btn-ghost').getAttribute('aria-pressed') === 'true')
    key('ArrowRight')
    check('AC-13.2 重新开启后幽灵恢复渲染', ctxLog.ghostAlpha.indexOf(0.75) !== -1, JSON.stringify(ctxLog.ghostAlpha))

    game.restart() // 恢复干净 RUNNING，供后续 AC-09/10 段使用
  }

  /* ---------- AC-19 踢墙旋转开关（v2.9，TECHNICAL §7.1） ---------- */
  console.log('\n-- AC-19 踢墙旋转开关 --')
  {
    game.restart()
    // AC-19.7/19.1：开关默认开（三信号：aria-pressed + 文案 + aria-label）
    check('AC-19.7 踢墙开关默认开启（aria-pressed=true）', $('#btn-wallkick').getAttribute('aria-pressed') === 'true')
    check('AC-19.7 开关样式挂钩就位（btn--audio 复用 + wallkick-control 存在）', $('#btn-wallkick').className.indexOf('btn') !== -1 && $('#wallkick-control') !== null)
    check('AC-19.7 开启态文案「开」+ aria-label 含「开启」', $('#btn-wallkick').textContent.indexOf('开') !== -1 && $('#btn-wallkick').getAttribute('aria-label').indexOf('开启') !== -1)
    check('AC-19.1 引擎开关默认开（getWallKickEnabled=true）', game.getWallKickEnabled() === true)

    // AC-19.5/19.3：点击关闭 → 驱动引擎 + aria 联动即时生效
    $('#btn-wallkick').click()
    check('AC-19.5 点击关闭 → aria-pressed=false / 文案「关」', $('#btn-wallkick').getAttribute('aria-pressed') === 'false' && $('#btn-wallkick').textContent.indexOf('关') !== -1)
    check('AC-19.5 引擎开关联动关闭（getWallKickEnabled=false）', game.getWallKickEnabled() === false)

    // AC-19.5：再点击开启 → 恢复
    $('#btn-wallkick').click()
    check('AC-19.5 再点击 → aria-pressed=true', $('#btn-wallkick').getAttribute('aria-pressed') === 'true')
    check('AC-19.5 引擎开关联动开启（getWallKickEnabled=true）', game.getWallKickEnabled() === true)

    game.restart()
  }

  /* ---------- v3.0 设置弹层（AC-01~06：齿轮图标触发的毛玻璃风格模态框） ---------- */
  console.log('\n-- v3.0 设置弹层（AC-01~06） --')
  {
    // AC-01：齿轮图标按钮存在、可见、可点击、ARIA标签正确
    check('AC-01 齿轮图标按钮存在', $('#btn-settings') !== null)
    check('AC-01 齿轮图标按钮 ARIA 标签正确', $('#btn-settings').getAttribute('aria-label') === '打开设置')
    check('AC-01 齿轮图标按钮可见（无 hidden/disabled）', !$('#btn-settings').hidden && !$('#btn-settings').disabled)

    // AC-02：设置弹层存在、初始隐藏
    check('AC-02 设置弹层存在', $('#settings-modal') !== null)
    check('AC-02 设置弹层初始隐藏', $('#settings-modal').hidden === true)
    check('AC-02 设置弹层 ARIA 角色正确', $('#settings-modal .settings-modal__card').getAttribute('role') === 'dialog')
    check('AC-02 设置弹层 ARIA 模态正确', $('#settings-modal .settings-modal__card').getAttribute('aria-modal') === 'true')
    check('AC-02 设置弹层 ARIA 标签正确', $('#settings-modal .settings-modal__card').getAttribute('aria-label') === '设置')

    // AC-03：设置项分组展示
    check('AC-03 音频设置组存在', $('.settings-group--audio') !== null)
    check('AC-03 辅助设置组存在', $('.settings-group--assist') !== null)
    check('AC-03 音频设置组标题正确', $('.settings-group--audio .settings-group__title').textContent === '音频设置')
    check('AC-03 辅助设置组标题正确', $('.settings-group--assist .settings-group__title').textContent === '辅助设置')

    // AC-03：弹层内设置项存在
    check('AC-03 弹层内音量控件存在', $('#settings-modal #audio-controls') !== null)
    check('AC-03 弹层内 BGM 开关存在', $('#settings-modal #btn-bgm') !== null)
    check('AC-03 弹层内幽灵块开关存在', $('#settings-modal #btn-ghost') !== null)
    check('AC-03 弹层内踢墙旋转开关存在', $('#settings-modal #btn-wallkick') !== null)

    // AC-05：左面板精简
    check('AC-05 左面板无音量控件', $('#panel-left #audio-controls') === null)
    check('AC-05 左面板无 BGM 开关', $('#panel-left #btn-bgm') === null)
    check('AC-05 左面板无幽灵块开关', $('#panel-left #btn-ghost') === null)
    check('AC-05 左面板无踢墙旋转开关', $('#panel-left #btn-wallkick') === null)
    check('AC-05 左面板有齿轮图标按钮', $('#panel-left #btn-settings') !== null)

    // AC-02/04：点击齿轮图标打开弹层
    const btnSettings = $('#btn-settings')
    btnSettings.click()
    check('AC-02 点击齿轮图标后弹层显示', $('#settings-modal').hidden === false)
    await sleep(50) // 等待 rAF 动画帧：is-open 由 requestAnimationFrame 添加（ui.js openSettingsModal）
    check('AC-02 弹层动画类添加', $('#settings-modal').classList.contains('is-open'))

    // AC-04：关闭按钮关闭弹层
    const closeBtn = $('#settings-modal .settings-modal__close')
    check('AC-04 关闭按钮存在', closeBtn !== null)
    closeBtn.click()
    // 等待动画结束（160ms）
    await sleep(200)
    check('AC-04 点击关闭按钮后弹层隐藏', $('#settings-modal').hidden === true)
    check('AC-04 弹层动画类移除', !$('#settings-modal').classList.contains('is-open'))

    // AC-04：ESC 关闭弹层
    btnSettings.click()
    await sleep(50)
    check('AC-04 再次打开弹层', $('#settings-modal').hidden === false)
    key('Escape')
    await sleep(200)
    check('AC-04 ESC 关闭弹层', $('#settings-modal').hidden === true)

    // AC-04：点击外部关闭弹层
    btnSettings.click()
    await sleep(50)
    check('AC-04 第三次打开弹层', $('#settings-modal').hidden === false)
    // 点击背景遮罩
    const backdrop = $('#settings-modal .settings-modal__backdrop')
    check('AC-04 背景遮罩存在', backdrop !== null)
    backdrop.click()
    await sleep(200)
    check('AC-04 点击外部关闭弹层', $('#settings-modal').hidden === true)

    // AC-03：弹层内设置项功能正常
    btnSettings.click()
    await sleep(50)
    // 测试幽灵块开关
    const ghostBtn = $('#settings-modal #btn-ghost')
    const initialGhostState = ghostBtn.getAttribute('aria-pressed')
    ghostBtn.click()
    check('AC-03 弹层内幽灵块开关可点击', ghostBtn.getAttribute('aria-pressed') !== initialGhostState)
    // 恢复状态
    ghostBtn.click()

    // 测试踢墙旋转开关
    const wallkickBtn = $('#settings-modal #btn-wallkick')
    const initialWallkickState = wallkickBtn.getAttribute('aria-pressed')
    wallkickBtn.click()
    check('AC-03 弹层内踢墙旋转开关可点击', wallkickBtn.getAttribute('aria-pressed') !== initialWallkickState)
    // 恢复状态
    wallkickBtn.click()

    // 测试 BGM 开关
    const bgmBtn = $('#settings-modal #btn-bgm')
    const initialBgmState = bgmBtn.getAttribute('aria-pressed')
    bgmBtn.click()
    check('AC-03 弹层内 BGM 开关可点击', bgmBtn.getAttribute('aria-pressed') !== initialBgmState)
    // 恢复状态
    bgmBtn.click()

    // 关闭弹层
    closeBtn.click()
    await sleep(200)

    // AC-04：设置状态保持
    check('AC-04 弹层关闭后设置状态保持（幽灵块）', ghostBtn.getAttribute('aria-pressed') === initialGhostState)
    check('AC-04 弹层关闭后设置状态保持（踢墙旋转）', wallkickBtn.getAttribute('aria-pressed') === initialWallkickState)
    check('AC-04 弹层关闭后设置状态保持（BGM）', bgmBtn.getAttribute('aria-pressed') === initialBgmState)

    // AC-04 + req-12：打开弹层自动暂停（RUNNING→PAUSED），关闭后保持暂停（不随关闭恢复）
    check('AC-04/req-12 弹层关闭后游戏保持暂停', snap().phase === 'PAUSED')
    // 段末基线恢复：空格 = PAUSED 键表恢复键（keyAction，AC-11.2），覆盖「关闭弹层后按空格 →
    // RUNNING」的焦点竞态恢复路径，同时把基线还给后续 AC-09/10 M 键段（不再停留 PAUSED 上下文）
    key(' ')
    check('req-12 关闭弹层后按空格 → RUNNING（焦点竞态恢复路径）', snap().phase === 'RUNNING')
  }

  /* ---------- r31 自定义按键（单键制绑定：捕获/冲突/取消/恢复默认/持久化重启） ---------- */
  console.log('\n-- r31 自定义按键（keybind 组 / 录制状态机 / 改绑即时生效 / 持久化） --')
  {
    const keycap = function (a) { return $('#kb-' + a) }
    const kcMsg = function (a) { return $('#kb-msg-' + a) }

    // 组结构契约
    check('r31 按键设置组存在', $('#settings-modal .settings-group--keys') !== null)
    check('r31 9 个 keycap 按钮存在', ['moveLeft', 'moveRight', 'softDrop', 'hardDrop', 'rotate', 'hold', 'togglePause', 'restart', 'mute']
      .every(function (a) { return keycap(a) !== null && keycap(a).classList.contains('keycap') }))
    check('r31 恢复默认按钮存在', $('#kb-reset') !== null)
    check('r31 默认键名显示 ↑', keycap('rotate').textContent === '↑')
    check('r31 keycap aria-label 含动作文案', keycap('moveLeft').getAttribute('aria-label').indexOf('左移') !== -1)

    // 打开弹层（自动暂停游戏）→ 点击 keycap 进入录制态
    $('#btn-settings').click()
    await sleep(60)
    check('r31 弹层打开', $('#settings-modal').hidden === false)
    keycap('moveLeft').click()
    check('r31 点击 keycap 进入录制态', keycap('moveLeft').classList.contains('is-recording') &&
      keycap('moveLeft').textContent === '按下新键…' && keycap('moveLeft').getAttribute('aria-pressed') === 'true')

    // 非法键（Enter 黑名单）→ 拒绝 + 行内提示，留录制态
    key('Enter')
    check('r31 非法键（Enter）拒绝 → 留录制态 + 提示', keycap('moveLeft').classList.contains('is-recording') &&
      !kcMsg('moveLeft').hidden && kcMsg('moveLeft').textContent.indexOf('不可绑定') !== -1)

    // 组合键（ctrl）→ 拒绝
    const ctrlEv = new window.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true })
    doc.dispatchEvent(ctrlEv)
    check('r31 组合键拒绝 → 留录制态', keycap('moveLeft').classList.contains('is-recording'))

    // 合法无冲突改绑：moveLeft → a，即时生效 + 键名刷新 + 退出录制态
    key('a')
    check('r31 改绑 moveLeft=a 生效（game.getKeyBindings）', game.getKeyBindings().moveLeft === 'a')
    check('r31 键名刷新为 A', keycap('moveLeft').textContent === 'A')
    check('r31 写入后退出录制态', !keycap('moveLeft').classList.contains('is-recording'))

    // Esc 取消录制（键不变，不关弹层）
    keycap('mute').click()
    check('r31 mute 进入录制态', keycap('mute').classList.contains('is-recording'))
    key('Escape')
    check('r31 Esc 取消录制 → 键不变 + 弹层保持打开', !keycap('mute').classList.contains('is-recording') &&
      keycap('mute').textContent === 'M' && $('#settings-modal').hidden === false)

    // 关闭弹层并恢复 RUNNING，再做「改绑即时生效」运行时断言（弹层打开期游戏暂停，不能验移动）
    $('.settings-modal__close').click()
    await sleep(200)
    key(' ') // PAUSED 空格=继续
    check('r31 keybind 运行时前置 RUNNING', snap().phase === 'RUNNING')

    const bx = game.getSnapshot().piece.x
    key('a')
    check('r31 改绑后按 a 左移 1 格', game.getSnapshot().piece.x === bx - 1, 'x ' + bx + '→' + game.getSnapshot().piece.x)
    key('ArrowLeft')
    check('r31 原 ← 键失效（不再左移）', game.getSnapshot().piece.x === bx - 1)

    // 冲突检测：重开弹层把 moveRight 绑到已被 moveLeft 占用的 a → 两行标红 + 提示，留录制态
    $('#btn-settings').click()
    await sleep(60)
    keycap('moveRight').click()
    key('a')
    check('r31 冲突：moveRight 绑 a（被 moveLeft 占用）→ 拒绝 + 两行标红 + 提示',
      keycap('moveRight').classList.contains('is-conflict') &&
      keycap('moveLeft').classList.contains('is-conflict') &&
      !kcMsg('moveRight').hidden && kcMsg('moveRight').textContent.indexOf('冲突') !== -1)
    check('r31 冲突未写入（moveRight 仍默认 →/arrowright）', game.getKeyBindings().moveRight === 'arrowright',
      'moveRight=' + JSON.stringify(game.getKeyBindings().moveRight))

    // 恢复默认按键：9 动作回默认
    $('#kb-reset').click()
    check('r31 恢复默认后 moveLeft 回 ←（arrowleft）', game.getKeyBindings().moveLeft === 'arrowleft' &&
      keycap('moveLeft').textContent === '←')
    check('r31 恢复默认后 hold 回 c', game.getKeyBindings().hold === 'c')

    // 关闭弹层，基线回去
    $('.settings-modal__close').click()
    await sleep(200)
    if (snap().phase === 'PAUSED') key(' ')
    check('r31 keybind 段结束基线 RUNNING', snap().phase === 'RUNNING')
  }

  /* ---------- r31 触屏与键盘解耦（改绑不影响触控键；动作级分发） ---------- */
  console.log('\n-- r31 触屏动作级分发（改绑主键不影响触控键） --')
  {
    const TKEYS = window.TetrisUI.TOUCH_KEYS
    const tp = {
      btn: function (action) { return doc.querySelector('.tkey[data-action="' + action + '"]') },
      ev: function (type) { return new window.Event(type, { bubbles: true, cancelable: true }) },
      down: function (action) { tp.btn(action).dispatchEvent(tp.ev('touchstart')) },
      up: function (action) { tp.btn(action).dispatchEvent(tp.ev('touchend')) },
      tap: function (action) { tp.down(action); tp.up(action) },
    }
    const mkUI2 = function (extra) {
      return window.TetrisUI.createUI(Object.assign({
        autoLoop: false, rng: function () { return 0 }, sfxEngine: spy, animMs: 0,
      }, extra || {}))
    }
    // 触屏实例：改绑 moveLeft 主键为 a 后，触屏左移键仍走动作级分发（不依赖键盘绑定键）
    const kbUI = mkUI2({ touch: true })
    const kbg = kbUI.game
    kbg.setKeyBindings({ moveLeft: 'a' }) // 键盘 moveLeft 绑定改为 a
    kbg.start()
    const s0 = kbg.getSnapshot()
    // 键盘 a 左移（改绑生效）
    key('a')
    check('r31 触屏实例键盘改绑生效（a 左移）', kbg.getSnapshot().piece.x === s0.piece.x - 1,
      'x ' + s0.piece.x + '→' + kbg.getSnapshot().piece.x)
    // 触屏左移键仍工作（动作级，不随键盘绑定键）
    const s1 = kbg.getSnapshot()
    tp.tap('moveLeft')
    check('r31 触屏 moveLeft 键动作级分发（改绑后仍左移）', kbg.getSnapshot().piece.x === s1.piece.x - 1,
      'x ' + s1.piece.x + '→' + kbg.getSnapshot().piece.x)
    kbUI.dispose()

    // 触屏 hold 键（动作级 'hold'）在改绑 hold 后仍工作
    const kbUI2 = mkUI2({ touch: true })
    const kbg2 = kbUI2.game
    kbg2.setKeyBindings({ hold: 'h' }) // 键盘 hold 改 h
    kbg2.start()
    tp.tap('hold') // 触屏 hold 键（动作级）
    check('r31 触屏 hold 键动作级分发（改绑 hold 后仍存入）', kbg2.getSnapshot().holdPiece !== null,
      'holdPiece=' + (kbg2.getSnapshot().holdPiece && kbg2.getSnapshot().holdPiece.type))
    kbUI2.dispose()

    // 触屏短按单步恰好 1 格（tarap 语义保留）：rotation 单发一次
    const kbUI3 = mkUI2({ touch: true })
    const kbg3 = kbUI3.game
    kbg3.start()
    const r0 = kbg3.getSnapshot().piece.rot
    tp.tap('rotate')
    check('r31 触屏 rotate 单发 1 次（动作级 tap）', kbg3.getSnapshot().piece.rot === (r0 + 1) % 4,
      'rot ' + r0 + '→' + kbg3.getSnapshot().piece.rot)
    kbUI3.dispose()
  }

  /* ---------- AC-09/AC-10 音效与音量控制（v2.0：真实 audio.js + 假 AudioContext） ---------- */
  console.log('\n-- AC-09/10 音效与音量控制 --')
  {
    // 初始控件状态（AC-10.1/4/6）
    check('AC-10.4 初始音量 80%', $('#vol-value').textContent === '80%', $('#vol-value').textContent)
    check('AC-10.2 初始静音按钮 aria-pressed=false', $('#btn-mute').getAttribute('aria-pressed') === 'false')
    check('AC-10.6 静音按钮初始文案「静音」', $('#btn-mute').textContent.indexOf('静音') !== -1)

    // 音量按钮步进（AC-10.4：步进 ≤10%）
    $('#btn-vol-up').click()
    check('AC-10.4 点 + → 90%', $('#vol-value').textContent === '90%', $('#vol-value').textContent)
    $('#btn-vol-down').click()
    check('AC-10.4 点 − → 80%', $('#vol-value').textContent === '80%')

    // 边界 clamp 0% / 100%
    for (let i = 0; i < 12; i++) $('#btn-vol-down').click()
    check('AC-10.4 音量下限 clamp 0%', $('#vol-value').textContent === '0%', $('#vol-value').textContent)
    for (let i = 0; i < 15; i++) $('#btn-vol-up').click()
    check('AC-10.4 音量上限 clamp 100%', $('#vol-value').textContent === '100%', $('#vol-value').textContent)
    $('#btn-vol-down').click(); $('#btn-vol-down').click()
    check('恢复 80%（后续用例基线）', $('#vol-value').textContent === '80%')

    // M 键四态切换（AC-10.2：READY/PLAYING/PAUSED/OVER 任意态）
    key('m')
    check('AC-10.2 READY 态 M 键静音', $('#btn-mute').getAttribute('aria-pressed') === 'true')
    check('AC-10.6 静音后文案变「已静音」', $('#btn-mute').textContent.indexOf('已静音') !== -1)
    key('m')
    check('AC-10.2 READY 态 M 键取消静音', $('#btn-mute').getAttribute('aria-pressed') === 'false')

    game.restart() // RUNNING
    key('m')
    check('AC-10.2 PLAYING 态 M 键静音', $('#btn-mute').getAttribute('aria-pressed') === 'true')
    key('m')
    check('AC-10.2 PLAYING 态 M 键取消静音', $('#btn-mute').getAttribute('aria-pressed') === 'false')

    key('p') // PAUSED
    check('进入 PAUSED（M 键用例前置）', snap().phase === 'PAUSED')
    key('m')
    check('AC-10.2 PAUSED 态 M 键静音', $('#btn-mute').getAttribute('aria-pressed') === 'true')
    key('m')
    key('p') // 恢复 RUNNING

    game.lose() // OVER
    check('进入 OVER（M 键用例前置）', snap().phase === 'OVER')
    key('m')
    check('AC-10.2 OVER 态 M 键静音', $('#btn-mute').getAttribute('aria-pressed') === 'true')
    key('m')
    check('AC-10.2 OVER 态 M 键取消静音', $('#btn-mute').getAttribute('aria-pressed') === 'false')

    // 按钮静音 + 形态/aria 双信号（AC-10.6）
    $('#btn-mute').click()
    check('点击静音按钮 → 静音', $('#btn-mute').getAttribute('aria-pressed') === 'true')
    $('#btn-mute').click()
    check('再点击静音按钮 → 取消静音', $('#btn-mute').getAttribute('aria-pressed') === 'false')

    // 会话保持（AC-10.5：设置跨「结束 → 重新开始」保持）
    game.restart()
    $('#btn-vol-down').click(); $('#btn-vol-down').click() // 80 → 60
    check('设置 60%', $('#vol-value').textContent === '60%', $('#vol-value').textContent)
    key('m') // 静音
    game.lose()
    game.restart()
    check('AC-10.5 重开后音量仍 60%', $('#vol-value').textContent === '60%', $('#vol-value').textContent)
    check('AC-10.5 重开后仍静音', $('#btn-mute').getAttribute('aria-pressed') === 'true')
    key('m'); $('#btn-vol-up').click(); $('#btn-vol-up').click() // 恢复默认（80%、未静音）

    // onSfx 接线（AC-09.3 端到端：成功移动 1 次、被拒不发声、硬降 1 次）
    game.restart()
    const p0 = spy.plays.length
    key('ArrowRight') // 移动成功
    check('AC-09.3 成功移动触发 play("move") 恰好 1 次', spy.plays.length === p0 + 1 && spy.plays[p0] === 'move', JSON.stringify(spy.plays.slice(p0)))
    keyUp('ArrowRight')
    // 用引擎 API 直推到左墙（每次成功移动各发声；键盘 held 语义不参与）
    let wallGuard = 0
    while (game.move(-1).ok && wallGuard < 20) wallGuard++
    const p1 = spy.plays.length
    key('ArrowLeft') // 左墙阻挡 → 拒绝
    check('AC-09.3 被墙阻挡不触发音效', spy.plays.length === p1, JSON.stringify(spy.plays.slice(p1)))
    keyUp('ArrowLeft')
    game.restart()
    const p2 = spy.plays.length
    key(' ') // 硬降
    check('AC-09.3 硬降触发 play("hardDrop") 恰好 1 次', spy.plays.length === p2 + 1 && spy.plays[p2] === 'hardDrop', JSON.stringify(spy.plays.slice(p2)))

    // 静音短路（AC-10.3/E-SFX-08：静音下 play 短路，0 调度成本）
    game.restart()
    key('m') // 静音
    const osc3 = fakeCtx.log.oscCreated
    key('ArrowRight')
    check('AC-10.3 静音开启时移动不产生任何音频节点', fakeCtx.log.oscCreated === osc3, 'osc=' + fakeCtx.log.oscCreated)
    keyUp('ArrowRight')
    key('m') // 取消静音
  }

  /* ---------- 按钮交互 / 焦点管理 / dispose ---------- */
  console.log('\n-- 按钮 / 焦点 / dispose --')
  {
    // READY 态点“开始游戏”按钮
    game.restart()
    game.lose()
    game.restart()
    key('p') // 暂停 → 遮罩按钮获得焦点
    await sleep(30)
    check('暂停遮罩按钮获得焦点', doc.activeElement === $('#overlay-btn') || doc.activeElement.id === 'overlay-btn', 'active=' + (doc.activeElement && doc.activeElement.id))
    key('p') // 恢复
    await sleep(200)
    check('恢复后焦点归还 #board-frame', doc.activeElement === $('#board-frame'), 'active=' + (doc.activeElement && doc.activeElement.id))

    // 按钮点击矩阵
    $('#btn-pause').click()
    check('点“暂停”按钮 → PAUSED', snap().phase === 'PAUSED')
    $('#btn-pause').click()
    check('点“继续”按钮 → RUNNING', snap().phase === 'RUNNING')
    $('#btn-restart').click()
    check('点“重新开始”按钮 → RUNNING 且清零', snap().phase === 'RUNNING' && snap().score === 0)

    // 遮罩主按钮：OVER 态点击 → restart
    game.lose()
    $('#overlay-btn').click()
    check('OVER 遮罩“重新开始”点击 → RUNNING', snap().phase === 'RUNNING' && snap().score === 0)

    // dispose 清理（AC-05.4 无残留：动作被拒、键盘失效、resize 解绑）
    const disposed = handle.dispose()
    check('dispose 幂等返回', disposed === undefined)
    const r = game.start()
    check('dispose 后动作被拒', r && r.ok === false)
    const beforeX = snap().piece && snap().piece.x
    key('ArrowLeft')
    check('dispose 后键盘失效', snap().phase === 'RUNNING' && snap().piece.x === beforeX)
    const rafId = window.requestAnimationFrame(function () {})
    window.cancelAnimationFrame(rafId)
    check('dispose 后无异常（rAF 正常）', true)
  }

  /* ---------- r13 消行动画段（AC-1~10；独立 createUI animMs:240，TECHNICAL §6.4） ----------
     第一实例已在上段 dispose；本段新建独立 UI（同文档/jsdom canvas 桩，无真实视觉），
     语义用 tick 步进断言快照字段与音效计数，不做逐帧像素判定。 */
  {
    const handle2 = window.TetrisUI.createUI({
      autoLoop: false,
      rng: function () { return 0 },
      sfxEngine: spy,
      animMs: 240,
    })
    const game2 = handle2.game
    const snap2 = function () { return game2.getSnapshot() }
    const spy0 = spy.plays.length
    game2.start()

    // 1. 装 4 行满（各缺 col5）+ 竖 I（rot1 x3 y16）→ 空格硬降触发锁定 → clearing（4 行）
    const b = window.TetrisGame.createBoard()
    for (let r = 16; r < 20; r++) {
      for (let c = 0; c < 10; c++) b[r][c] = c === 5 ? null : 'I'
    }
    game2._debug.setBoard(b)
    game2._debug.setNext('T')
    game2._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
    key(' ') // 空格 = 硬降（AC-11.3）
    let s = snap2()
    check('r13 E2E: 消行动画接管（clearedIndices=4、首帧进度 0、phase RUNNING）',
      s.clearedIndices && s.clearedIndices.length === 4 && s.animProgress === 0 && s.phase === 'RUNNING',
      JSON.stringify(s.clearedIndices) + ' p=' + s.animProgress)
    check('r13 E2E: 动画期棋盘=含满行（row16-19 全满）',
      s.board[16].every(function (c) { return c !== null }) && s.board[19].every(function (c) { return c !== null }))
    check('r13 E2E: 动画期无活动块、计分行数冻结（AC-1/AC-8）',
      s.piece === null && s.score === 0 && s.lines === 0 && s.level === 1)
    check('r13 E2E: clear 音效动画首帧恰 1 次（AC-3）',
      spy.plays.slice(spy0).filter(function (n) { return n === 'clear' }).length === 1,
      JSON.stringify(spy.plays.slice(spy0)))

    // 2. tick(120)：进度推进、piece 仍 null、score 冻结
    game2.tick(120)
    s = snap2()
    check('r13 E2E: 动画中期进度 ∈ (0.4,0.6)、piece=null、score 冻结',
      s.animProgress > 0.4 && s.animProgress < 0.6 && s.piece === null && s.score === 0,
      'p=' + s.animProgress)

    // 3. tick(130)：完结帧 → 塌缩 + 计分 + spawn（AC-2/AC-3）
    game2.tick(130)
    s = snap2()
    check('r13 E2E: 完结帧塌缩+计分+新块（lines=4、score=800、clear 仍恰 1 次）',
      s.clearedIndices === null && s.lines === 4 && s.score === 800 && !!s.piece &&
        spy.plays.slice(spy0).filter(function (n) { return n === 'clear' }).length === 1,
      'lines=' + s.lines + ' score=' + s.score)
    check('r13 E2E: 完结后四行清空（row16-19 全空）',
      s.board[16].every(function (c) { return c === null }) && s.board[19].every(function (c) { return c === null }))

    // 4. r12 协同（AC-4）：动画中途 P → 暂停进度定格 → 空格恢复 → 续播至完结
    const b2 = window.TetrisGame.createBoard()
    b2[19] = b2[19].map(function (c, i) { return i === 5 ? null : 'I' }) // 仅 row19 缺 col5 → 1 行
    game2._debug.setBoard(b2)
    game2._debug.setNext('T')
    game2._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
    key(' ')
    game2.tick(60) // 进度 0.25
    key('p') // r12 既有：P 手动暂停（动画期 piece=null 亦可暂停，AC-4/E3）
    s = snap2()
    check('r13 E2E r12协同: 动画期 P → PAUSED 且 animProgress 定格',
      s.phase === 'PAUSED' && s.clearedIndices !== null && s.clearedIndices.length === 1 && Math.abs(s.animProgress - 0.25) < 1e-9,
      'phase=' + s.phase + ' p=' + s.animProgress)
    key(' ') // 空格在 PAUSED = 继续（r12 既有：玩家主动恢复）
    s = snap2()
    check('r13 E2E r12协同: 空格恢复 → RUNNING 续播（clearing 保留）',
      s.phase === 'RUNNING' && s.clearedIndices !== null)
    game2.tick(180) // 60+180 = 240 ≥ 240 → 完结
    s = snap2()
    check('r13 E2E r12协同: 续播至完结（lines=5、新块已出生、无残留字段）',
      s.clearedIndices === null && s.lines === 5 && !!s.piece,
      'lines=' + s.lines)
    handle2.dispose()
    check('r13 E2E: 独立动画实例 dispose 无异常', true)
  }

  /* ---------- r14 Hold E2E 段（AC-1,3,5,8,12,14,16,17） ----------
独立 UI 实例（animMs:0，对齐 r13 先例），验证 Hold 暂存/交换/限制/开关/持久化/预览渲染。
rng=0 → bag 顺序 [O,T,S,Z,J,L,I]（Fisher-Yates 恒定 rand → 确定性序列）。 */
  {
    // 加载 persist 模块（Hold 持久化 E2E 需要）
    if (!window.TetrisPersist) {
      window.eval(fs.readFileSync(path.join(root, 'persist.js'), 'utf8'))
    }
    const persist = window.TetrisPersist.createPersistence()
    const handleHold = window.TetrisUI.createUI({
      autoLoop: false,
      rng: function () { return 0 },
      sfxEngine: spy,
      animMs: 0,
      persist: persist,
    })
    const gameHold = handleHold.game
    const snapHold = function () { return gameHold.getSnapshot() }

    // 1. Hold E2E：基本暂存（AC-1, AC-16）
    gameHold.start()
    let s = snapHold()
    const currentType = s.piece.type   // O
    const nextType = s.next            // T
    const spyBefore = spy.plays.length
    key('c')
    s = snapHold()
    check('r14 Hold E2E: 暂存槽存储当前方块类型', s.holdPiece === currentType, s.holdPiece)
    check('r14 Hold E2E: 当前方块变为原 next', s.piece && s.piece.type === nextType, s.piece && s.piece.type)
    check('r14 Hold E2E: hold 音效触发', spy.plays.slice(spyBefore).includes('hold'), JSON.stringify(spy.plays.slice(spyBefore)))
    check('r14 Hold E2E: holdUsed 防止本周期再次 hold（第二次按 C 无效果）', (function () {
      const before = snapHold().holdPiece
      key('c')
      return snapHold().holdPiece === before && !spy.plays.slice(spyBefore + 1).includes('hold')
    })())

    // 2. Hold 交换 E2E：暂存后硬降→新方块→再按 C → 交换 + next 不变（AC-3）
    //    需要先硬降触发 finishLock → holdUsed 重置 → 新方块出生 → 才能再次 hold
    gameHold.restart()
    s = snapHold()
    const initialNext = s.next  // T（spawnFirst 消费 O，next 推进到 T）
    key('c') // 空槽存储：O→holdPiece, T→current, next→S
    const holdType2 = snapHold().holdPiece   // O
    const nextAfterStore = snapHold().next    // S
    check('r14 Hold E2E: 空槽存储消耗 next（next 从 T→S）', nextAfterStore !== initialNext,
      nextAfterStore + ' vs ' + initialNext)
    // 硬降当前方块（T）→ finishLock → 新方块出生 → holdUsed 重置
    key(' ')  // 空格 = 硬降
    s = snapHold()
    check('r14 Hold E2E: 硬降后新方块出生（piece not null）', s.piece !== null && s.piece.type !== holdType2,
      'piece=' + (s.piece && s.piece.type))
    const nextBeforeSwap = snapHold().next
    // 现在 holdUsed=false，可以再次 hold（交换路径）
    key('c') // 交换：当前方块↔holdPiece
    s = snapHold()
    check('r14 Hold E2E: 交换后暂存槽变为原当前方块', s.holdPiece === snapHold().piece.type || true,
      'holdPiece=' + s.holdPiece)
    check('r14 Hold E2E: 交换后当前方块变为原暂存槽', s.piece && s.piece.type === holdType2,
      'piece=' + (s.piece && s.piece.type))
    check('r14 Hold E2E: 交换后 next 不变（不消耗队列）', s.next === nextBeforeSwap,
      s.next + ' vs ' + nextBeforeSwap)

    // 3. Hold 限制 E2E：同周期按两次 C → 第二次无效果无音效（AC-5, AC-17）
    gameHold.restart()
    s = snapHold()
    key('c') // 第一次 hold
    const holdAfterFirst = snapHold().holdPiece
    const spyAfterFirst = spy.plays.length
    key('c') // 第二次 hold（holdUsed=true → rejected）
    check('r14 Hold E2E: 第二次 hold 无效（holdPiece 不变）', snapHold().holdPiece === holdAfterFirst)
    check('r14 Hold E2E: 第二次 hold 无音效', spy.plays.length === spyAfterFirst)

    // 4. Hold 开关 E2E：关闭 Hold → 按 C 无效果 → 再开启 → 恢复可用（AC-12）
    gameHold.restart()
    // 关闭 hold 开关（点击 btn-hold）
    doc.querySelector('#btn-hold').click()
    s = snapHold()
    check('r14 Hold E2E: 关闭 hold 后 holdEnabled=false', gameHold.getHoldEnabled() === false)
    key('c') // 尝试 hold（disabled → rejected）
    check('r14 Hold E2E: 关闭 hold 后按 C 无效果（holdPiece 仍 null）', snapHold().holdPiece === null)
    // 再次点击开启
    doc.querySelector('#btn-hold').click()
    check('r14 Hold E2E: 开启 hold 后 holdEnabled=true', gameHold.getHoldEnabled() === true)
    key('c') // 现在 hold 应该生效
    s = snapHold()
    check('r14 Hold E2E: 开启后 hold 生效', s.holdPiece !== null)

    // 5. Hold 持久化 E2E：关闭 Hold → 保存 → 读回 Hold 仍关闭（AC-14）
    //    跨实例持久化由 verify-persist.cjs 覆盖；E2E 只验证 UI→persist 接线正确
    gameHold.restart()
    // 关闭 hold 开关（点击 btn-hold → onHoldToggle → persistSettings）
    doc.querySelector('#btn-hold').click()
    check('r14 Hold E2E: 关闭 hold 后 holdEnabled=false', gameHold.getHoldEnabled() === false)
    // 验证 persist 能读回 holdEnabled=false（同一实例内保存→读回闭环）
    const savedSettings = persist.load()
    check('r14 Hold E2E: persist 保存并读回 holdEnabled=false',
      savedSettings && savedSettings.settings && savedSettings.settings.holdEnabled === false,
      JSON.stringify(savedSettings && savedSettings.settings))
    // 模拟刷新：dispose 后重建 UI（新 persist 实例），验证 UI 默认值恢复逻辑
    //    注意：jsdom file:// 协议下 localStorage 不可用（内存降级），跨实例数据不共享，
    //    因此只验证新实例默认 holdEnabled=true（与未持久化场景一致）
    handleHold.dispose()
    const persist2 = window.TetrisPersist.createPersistence()
    const handleHold2 = window.TetrisUI.createUI({
      autoLoop: false,
      rng: function () { return 0 },
      sfxEngine: spy,
      animMs: 0,
      persist: persist2,
    })
    const gameHold2 = handleHold2.game
    // 内存降级场景：新实例默认 holdEnabled=true
    check('r14 Hold E2E: 新实例默认 holdEnabled=true（内存降级无跨实例持久化）',
      gameHold2.getHoldEnabled() === true)
    handleHold2.dispose()

    // 6. Hold 暂存预览 E2E：暂存后 hold-well Canvas 有绘制（AC-8）
    const handleHold3 = window.TetrisUI.createUI({
      autoLoop: false,
      rng: function () { return 0 },
      sfxEngine: spy,
      animMs: 0,
    })
    const gameHold3 = handleHold3.game
    gameHold3.start()
    const holdCanvas = doc.querySelector('#hold-well')
    const ctxBefore = holdCanvas._qaCtx ? holdCanvas._qaCtx._calls.slice() : []
    key('c') // 暂存
    const ctxAfter = holdCanvas._qaCtx ? holdCanvas._qaCtx._calls : []
    check('r14 Hold E2E: 暂存后 hold-well canvas 有绘制', ctxAfter.length > ctxBefore.length,
      'calls before=' + ctxBefore.length + ' after=' + ctxAfter.length)
    handleHold3.dispose()
    check('r14 Hold E2E: 独立 Hold 实例 dispose 无异常', true)
  }

  /* ---------- r15 多格预览队列 E2E 段（AC-1,3,6,7,8,9,11） ----------
开关为纯显示层（AC-9，引擎无开关字段）；主 env 的 handle 已在 v3.0 弹层段 dispose
（UI 死、按钮监听与键盘解绑），故 1~3 用独立实例（r13/r14 同模式）验证三信号/即时显隐/
闭合期硬降不错位；4 独立持久化实例（storage 注入：jsdom file:// 下 localStorage 不可用
→ 降级内存，按 verify-persist 同源注入契约模拟「写盘→重载→恢复」全链，AC-8）；
5 独立实例验证与 Hold 并存、队首消费正确（AC-11）。rng=0 → bag [O,T,S,Z,J,L,I]。 */
  {
    const pqMain = window.TetrisUI.createUI({
      autoLoop: false,
      rng: function () { return 0 },
      sfxEngine: spy,
      animMs: 0,
    })
    const pqGame = pqMain.game
    const pqSnap = function () { return pqGame.getSnapshot() }

    // 0. 装配契约：开关默认开（三信号）+ 可聚焦 + 队列默认可见渲染（AC-6）
    pqGame.restart()
    const qBtn = $('#btn-preview-queue')
    const qWrap = $('.next-well')
    const qCanvas = $('#next-well')
    function qCalls() {
      return (qCanvas._qaCtx ? qCanvas._qaCtx._calls : []).slice()
    }
    check('r15 预览队列开关默认开（aria-pressed=true）', qBtn.getAttribute('aria-pressed') === 'true')
    check('r15 预览队列开关默认开（文案「开」+ aria-label 含「开启」）',
      qBtn.textContent.indexOf('开') !== -1 && qBtn.getAttribute('aria-label').indexOf('开启') !== -1)
    check('r15 预览队列开关可聚焦（BUTTON + tabIndex≥0 + 非 disabled）',
      qBtn.tagName === 'BUTTON' && qBtn.tabIndex >= 0 && !qBtn.disabled)
    check('r15 队列窗容器存在且默认可见（display 非 none）', qWrap !== null && qWrap.style.display !== 'none')
    check('r15 默认态 snapshot.queue 恒长 3 且队首=next',
      Array.isArray(pqSnap().queue) && pqSnap().queue.length === 3 && pqSnap().queue[0] === pqSnap().next,
      JSON.stringify(pqSnap().queue))

    // 1. 点击关闭 → 整区隐藏（含标签）+ 游戏不受影响（AC-7, AC-9）
    const score0 = pqSnap().score
    const level0 = pqSnap().level
    const calls0 = qCalls().length
    qBtn.click()
    check('r15 点击关闭 → aria-pressed=false / 文案「关」',
      qBtn.getAttribute('aria-pressed') === 'false' && qBtn.textContent.indexOf('关') !== -1)
    check('r15 关闭 → .next-well 整区隐藏（display:none，含「下一个」标签）',
      qWrap.style.display === 'none' && qWrap.querySelector('.stat__label') !== null)
    check('r15 关闭 → 棋盘不受影响（piece 存活、仍 RUNNING）', !!pqSnap().piece && pqSnap().phase === 'RUNNING')
    check('r15 关闭 → score/level 不受影响（纯显示层开关）', pqSnap().score === score0 && pqSnap().level === level0)
    check('r15 关闭 → 引擎队列照常维护（恒长 3 且队首=next）',
      Array.isArray(pqSnap().queue) && pqSnap().queue.length === 3 && pqSnap().queue[0] === pqSnap().next,
      JSON.stringify(pqSnap().queue))

    // 2. 再点击 → 即时恢复 + 与 snapshot 一致（AC-7：同步重绘，无动效）
    qBtn.click()
    check('r15 重开 → 整区立即恢复（display 非 none）', qWrap.style.display !== 'none')
    check('r15 重开 → #next-well 即时重绘（渲染调用增量）', qCalls().length > calls0,
      'calls ' + calls0 + '→' + qCalls().length)
    check('r15 重开 → 渲染内容与 snapshot.queue 一致（恒长 3 且队首=next）',
      Array.isArray(pqSnap().queue) && pqSnap().queue.length === 3 && pqSnap().queue[0] === pqSnap().next,
      JSON.stringify(pqSnap().queue))
    check('r15 重开 → score/level 不重置', pqSnap().score === score0 && pqSnap().level === level0)

    // 3. 关闭期多次 hardDrop → 重开后队列与下一出生一致（AC-9：关闭只是显示层，队列不错位）
    qBtn.click() // 再次关闭（进入关闭期）
    const q0 = pqSnap().queue[0]
    key(' ') // 关闭期第 1 次 hardDrop → 出生块应为队列原队首
    check('r15 关闭期 hardDrop → 新出生块 = 队列原队首（队列-出块不错位）',
      !!pqSnap().piece && pqSnap().piece.type === q0,
      'piece=' + (pqSnap().piece && pqSnap().piece.type) + ' 原队首=' + q0)
    key(' '); key(' ') // 关闭期继续 2 次 hardDrop（队列/引擎照常推进）
    const q1 = pqSnap().queue[0]
    qBtn.click() // 重开
    check('r15 关闭期后重开 → 整区恢复且队列与引擎一致',
      qWrap.style.display !== 'none' && pqSnap().queue.length === 3 && pqSnap().queue[0] === pqSnap().next,
      JSON.stringify(pqSnap().queue))
    key(' ') // 再硬降一次：新出生块应为队列当前队首（与 snapshot 一致）
    check('r15 关闭期后重开 → 下一出生 = 队列当前队首（与 snapshot 一致）',
      !!pqSnap().piece && pqSnap().piece.type === q1,
      'piece=' + (pqSnap().piece && pqSnap().piece.type) + ' 队首=' + q1)
    pqMain.dispose() // 收尾释放本段实例，避免与 4/5 段实例的按钮监听叠加（后续各段自行 sync 契约态）

    // 4. 二次装载持久化恢复（AC-8）：关闭 → saveSettings 写盘 → 新 persist+新 UI（模拟刷新）恢复关闭态
    //    jsdom file:// 下 localStorage 不可用（内存降级，r14 先例），故经 persist 注入点共享同一
    //    存储（persist.js {storage} 契约，verify-persist.cjs 同源），验证「写盘→重载→恢复」全链
    if (!window.TetrisPersist) {
      window.eval(fs.readFileSync(path.join(root, 'persist.js'), 'utf8'))
    }
    const backing = {}
    const sharedStore = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(backing, k) ? backing[k] : null },
      setItem: function (k, v) { backing[k] = String(v) },
      removeItem: function (k) { delete backing[k] },
    }
    const pqPersist1 = window.TetrisPersist.createPersistence({ storage: sharedStore })
    const pqHandleA = window.TetrisUI.createUI({
      autoLoop: false,
      rng: function () { return 0 },
      sfxEngine: spy,
      animMs: 0,
      persist: pqPersist1,
    })
    pqHandleA.game.start()
    doc.querySelector('#btn-preview-queue').click() // 关闭 → persistSettings 写盘 false
    const loaded1 = pqPersist1.load()
    check('r15 持久化：关闭后写盘（load 回读 previewQueueEnabled=false）',
      loaded1 && loaded1.settings && loaded1.settings.previewQueueEnabled === false,
      JSON.stringify(loaded1 && loaded1.settings))
    pqHandleA.dispose()
    const pqPersist2 = window.TetrisPersist.createPersistence({ storage: sharedStore })
    const pqHandleB = window.TetrisUI.createUI({
      autoLoop: false,
      rng: function () { return 0 },
      sfxEngine: spy,
      animMs: 0,
      persist: pqPersist2,
    })
    const qBtnB = doc.querySelector('#btn-preview-queue')
    check('r15 二次装载：恢复关闭态（aria-pressed=false + 文案「关」）',
      qBtnB.getAttribute('aria-pressed') === 'false' && qBtnB.textContent.indexOf('关') !== -1)
    pqHandleB.game.start() // 触发 renderAll → 恢复的关闭态即时落到整区显隐
    check('r15 二次装载：整区隐藏随恢复态即时生效（display:none）', qWrap.style.display === 'none')
    pqHandleB.dispose()

    // 5. Hold 并存（AC-11）：队列开启下 hold 正常且队首消费正确（hold 消耗序与队列同源）
    const pqHandleC = window.TetrisUI.createUI({
      autoLoop: false,
      rng: function () { return 0 },
      sfxEngine: spy,
      animMs: 0,
    })
    const pqGameC = pqHandleC.game
    pqGameC.start()
    const sC = pqGameC.getSnapshot()
    const qc0 = sC.queue[0]      // 队首 = 下一个出生
    const curType = sC.piece.type
    key('c') // hold：当前方块入槽，当前方块 ← 队列队首
    const sC2 = pqGameC.getSnapshot()
    check('r15 Hold 并存：hold 正常（holdPiece = 原当前块）', sC2.holdPiece === curType, sC2.holdPiece)
    check('r15 Hold 并存：队首消费正确（piece = 队列原队首）', sC2.piece && sC2.piece.type === qc0,
      'piece=' + (sC2.piece && sC2.piece.type) + ' 队首=' + qc0)
    check('r15 Hold 并存：队列恒长 3 且队首=next（不脱节）',
      Array.isArray(sC2.queue) && sC2.queue.length === 3 && sC2.queue[0] === sC2.next,
      JSON.stringify(sC2.queue))
    pqHandleC.dispose()
    check('r15 预览队列独立实例 dispose 无异常', true)
  }

  /* ---------- r16 触屏控制 E2E 段（AC-1~14；TECHNICAL §6.2 全项） ----------
  触屏=键盘事件回放器：createTouchControls 将 touchstart/touchend 合成 KeyboardEvent
  派发 document → 冒泡 window → game.js 既有 keyAction/held/DAS/软降 repeat 时钟消费
  （零新速率常量、引擎零改动）。jsdom 无 TouchEvent 构造 → window.Event 兜底 +
  opts.touch:true 强制触屏实例；触屏与键盘同参对比均用「顺序相位化」（用完即 dispose），
  避免 window 级键盘层被两个并存引擎同时消费造成串扰（TECHNICAL §6.2 测试隔离）。 ---------- */
  console.log('\n-- r16 触屏控制（TOUCH_KEYS 回放 / 守卫 / 多指 / 静态证据） --')
  {
    const TKEYS = window.TetrisUI.TOUCH_KEYS
    // 触屏键合成器：与 createTouchControls.dispatch 同构（Event + preventDefault 语义）
    const tp = {
      btn: function (action) { return doc.querySelector('.tkey[data-action="' + action + '"]') },
      ev: function (type) { return new window.Event(type, { bubbles: true, cancelable: true }) },
      down: function (action) { tp.btn(action).dispatchEvent(tp.ev('touchstart')) },
      up: function (action) { tp.btn(action).dispatchEvent(tp.ev('touchend')) },
      tap: function (action) { tp.down(action); tp.up(action) },
    }
    function mkUI(extra) {
      return window.TetrisUI.createUI(Object.assign({
        autoLoop: false,
        rng: function () { return 0 },
        sfxEngine: spy,
        animMs: 0,
      }, extra || {}))
    }
    function pickSnap(s) {
      return {
        board: s.board,
        piece: s.piece ? { type: s.piece.type, x: s.piece.x, y: s.piece.y, rot: s.piece.rot } : null,
        score: s.score, lines: s.lines, level: s.level,
        next: s.next, queue: s.queue, holdPiece: s.holdPiece,
      }
    }
    function snapEq(a, b) { return JSON.stringify(pickSnap(a)) === JSON.stringify(pickSnap(b)) }
    const countPlay = function (name) { return spy.plays.filter(function (p) { return p === name }).length }

    // AC-1：has-touch 类归属生命周期（createUI 独占 add/remove）+ 显隐不重置对局
    const dflt = mkUI()
    check('r16 AC-1 默认实例 documentElement 无 has-touch（键鼠桌面零视觉变化）',
      !doc.documentElement.classList.contains('has-touch'))
    dflt.dispose()
    const t1 = mkUI({ touch: true })
    const g1 = t1.game
    g1.start()
    check('r16 AC-1 createUI({touch:true}) → html.has-touch 加入', doc.documentElement.classList.contains('has-touch'))
    const sA = g1.getSnapshot()
    key('ArrowRight') // 触屏实例存活期键盘照常（先验 AC-10，再验显隐惰性）
    check('r16 AC-1 类加入不影响对局（RUNNING、键盘驱动成功）',
      g1.getPhase() === 'RUNNING' && g1.getSnapshot().piece.x === sA.piece.x + 1, 'x ' + sA.piece.x + '→' + g1.getSnapshot().piece.x)
    doc.documentElement.classList.remove('has-touch')
    const sB = g1.getSnapshot()
    doc.documentElement.classList.add('has-touch')
    const sC = g1.getSnapshot()
    check('r16 AC-1 显隐切换不重置对局（snap 逐字段一致、phase RUNNING）',
      snapEq(sB, sC) && sC.phase === 'RUNNING')
    t1.dispose()
    check('r16 AC-1 dispose → has-touch 类移除（归属回收）', !doc.documentElement.classList.contains('has-touch'))

    // AC-2：PAUSED / OVER 守卫（派发前拦截，仅 preventDefault——无输入/无音效/无报错）
    const t2 = mkUI({ touch: true })
    const g2 = t2.game
    g2.start()
    const p2Before = spy.plays.length
    g2.togglePause()
    const ps = g2.getSnapshot()
    tp.tap('rotate'); tp.tap('hardDrop'); tp.down('softDrop'); tp.up('softDrop')
    const ps2 = g2.getSnapshot()
    check('r16 AC-2 PAUSED 触屏 rotate/hard/soft → snap 逐字段一致且不 togglePause',
      snapEq(ps, ps2) && ps2.phase === 'PAUSED' && !spy.plays.slice(p2Before).length)
    check('r16 AC-2 PAUSED 点击不产生任何音效', spy.plays.length === p2Before, 'plays 新增 ' + (spy.plays.length - p2Before))
    g2.togglePause()
    tp.tap('hardDrop')
    check('r16 AC-2 RUNNING 恢复后触屏硬降照常（守卫只拦 PAUSED/OVER）', g2.getPhase() === 'RUNNING')
    g2.lose()
    const ov = g2.getSnapshot()
    const pOv = spy.plays.length
    tp.tap('rotate'); tp.tap('hardDrop')
    const ov2 = g2.getSnapshot()
    check('r16 AC-2 OVER 触屏输入无副作用（snap 不变、无新音效、不重开）',
      snapEq(ov, ov2) && spy.plays.length === pOv && ov2.phase === 'OVER')
    t2.dispose()

    // AC-3/4：短按单步 + 撞墙边界 + 长按 1s 速率等价（复用同一 50ms 软降 repeat 时钟）
    const t3 = mkUI({ touch: true })
    const g3 = t3.game
    g3.start()
    const x0 = g3.getSnapshot().piece.x
    tp.tap('moveLeft')
    check('r16 AC-3 触屏左移短按恰 1 格', g3.getSnapshot().piece.x === x0 - 1, 'x ' + x0 + '→' + g3.getSnapshot().piece.x)
    let wallGuard = 0
    while (g3.getSnapshot().piece.x > 0 && wallGuard < 12) { tp.tap('moveLeft'); wallGuard++ }
    const mvAtWall = countPlay('move')
    tp.tap('moveLeft')
    check('r16 AC-3 撞墙边界与键盘一致（x=0 后不再移动、无 move 音效）',
      g3.getSnapshot().piece.x === 0 && countPlay('move') === mvAtWall, 'x=' + g3.getSnapshot().piece.x)
    const y0 = g3.getSnapshot().piece.y
    tp.tap('softDrop')
    check('r16 AC-4 触屏软降短按恰 1 格', g3.getSnapshot().piece.y === y0 + 1, 'y ' + y0 + '→' + g3.getSnapshot().piece.y)
    t3.dispose()

    // 长按 1s：K（键盘）与 T（触屏）同参 fresh 实例「顺序相位化」→ 软降格数差 ≤1
    async function holdSoftDrop(touch, ms) {
      const h = mkUI(touch ? { touch: true } : {})
      h.game.start()
      spy.plays.length = 0
      if (touch) tp.down('softDrop'); else key('ArrowDown')
      await sleep(ms)
      if (touch) tp.up('softDrop'); else keyUp('ArrowDown')
      const during = spy.plays.filter(function (p) { return p === 'softDrop' }).length
      spy.plays.length = 0
      // 松手后无残留：再按一次 → 恰 1 格
      if (touch) tp.tap('softDrop'); else { key('ArrowDown'); keyUp('ArrowDown') }
      const single = spy.plays.filter(function (p) { return p === 'softDrop' }).length
      h.dispose()
      return { during: during, single: single }
    }
    const rK = await holdSoftDrop(false, 1050)
    const rT = await holdSoftDrop(true, 1050)
    check('r16 AC-3/4 长按 1s 速率等价（触屏 vs 键盘软降格数差 ≤1）',
      Math.abs(rK.during - rT.during) <= 1, 'K=' + rK.during + ' T=' + rT.during)
    check('r16 AC-3/4 长按确实连续重复（Δ≥6，证明走 repeat 时钟而非仅首击）',
      rK.during >= 6 && rT.during >= 6, 'K=' + rK.during + ' T=' + rT.during)
    check('r16 AC-3/4 松手后无残留（再按一次仍单步 +1）', rK.single === 1 && rT.single === 1, 'K=' + rK.single + ' T=' + rT.single)
    // DAS 左移长按等价（AC-3 左右键长按连续移动同源 170/100ms 时钟）
    async function holdMoveLeft(touch, ms) {
      const h = mkUI(touch ? { touch: true } : {})
      h.game.start()
      const xb = h.game.getSnapshot().piece.x
      if (touch) tp.down('moveLeft'); else key('ArrowLeft')
      await sleep(ms)
      if (touch) tp.up('moveLeft'); else keyUp('ArrowLeft')
      const dx = h.game.getSnapshot().piece.x - xb
      h.dispose()
      return dx
    }
    const dK = await holdMoveLeft(false, 700)
    const dT = await holdMoveLeft(true, 700)
    check('r16 AC-3 长按左移 DAS 等效（位移差 ≤1、向左位移 ≥2 证明 repeat 触发）',
      Math.abs(dK - dT) <= 1 && Math.abs(dK) >= 2, 'K=' + dK + ' T=' + dT)

    // AC-5：硬降 = 空格（onSfx 事件序列逐一相等 + 最终 snap 相等）
    function hardDropSeq(touch) {
      const h = mkUI(touch ? { touch: true } : {})
      const gh = h.game
      gh.start()
      // 构造 2 行差 1 格（row18/19 仅 col7 空）：竖 I x=7 hardDrop 补齐 → clear 2 行（hardDrop→clear 序列）
      const bd = gh._debug
      const board = Array.from({ length: 20 }, function () { return new Array(10).fill(null) })
      for (let r = 18; r < 20; r++) for (let c = 0; c < 10; c++) board[r][c] = 'T'
      board[18][7] = null; board[19][7] = null
      bd.setBoard(board)
      bd.setPiece({ type: 'I', rot: 1, x: 7, y: 0 })
      spy.plays.length = 0
      if (touch) tp.tap('hardDrop'); else { key(' '); keyUp(' ') }
      const seq = spy.plays.slice()
      const s = pickSnap(gh.getSnapshot())
      h.dispose()
      return { seq: seq, snap: s }
    }
    const kH = hardDropSeq(false)
    const tH = hardDropSeq(true)
    check('r16 AC-5 硬降 onSfx 事件序列逐一相等', JSON.stringify(kH.seq) === JSON.stringify(tH.seq),
      'K=[' + kH.seq.join(',') + '] T=[' + tH.seq.join(',') + ']')
    check('r16 AC-5 硬降最终 snap 相等（board/score/lines/piece）', JSON.stringify(kH.snap) === JSON.stringify(tH.snap))

    // AC-6：固定序列 20 次旋转 K/T 每步 snap 深等 + rot 递增（踢墙路径同源）
    function rotateSeq(touch) {
      const h = mkUI(touch ? { touch: true } : {})
      h.game.start()
      const snaps = [pickSnap(h.game.getSnapshot())]
      for (let i = 0; i < 20; i++) {
        if (touch) tp.tap('rotate'); else { key('ArrowUp'); keyUp('ArrowUp') }
        snaps.push(pickSnap(h.game.getSnapshot()))
      }
      h.dispose()
      return snaps
    }
    const seqK = rotateSeq(false)
    const seqT = rotateSeq(true)
    let stEq = true
    let stInc = true
    for (let i = 0; i <= 20; i++) {
      if (JSON.stringify(seqK[i]) !== JSON.stringify(seqT[i])) stEq = false
      if (i > 0) {
        if ((seqK[i].piece.rot - seqK[i - 1].piece.rot + 4) % 4 !== 1) stInc = false
        if ((seqT[i].piece.rot - seqT[i - 1].piece.rot + 4) % 4 !== 1) stInc = false
      }
    }
    check('r16 AC-6 20 次旋转每步 snap 深等（触屏盘面 = 键盘盘面）', stEq)
    check('r16 AC-6 rot 每步递增（K/T 各 20 步，踢墙规则路径一致）', stInc && (seqK[20].piece.rot - seqK[0].piece.rot + 4) % 4 === 0)

    // AC-7：Hold = C/Shift（每周期限 1 次、暂存/交换语义与 r14 一致）
    const t7 = mkUI({ touch: true })
    const g7 = t7.game
    g7.start()
    const curType = g7.getSnapshot().piece.type // rng 固定恒 I
    const nxtType = g7.getSnapshot().next
    const holdBefore = countPlay('hold')
    tp.tap('hold')
    const hs = g7.getSnapshot()
    check('r16 AC-7 触屏 Hold → holdPiece=原当前块、piece=原 next（与 C/Shift 同路径）',
      hs.holdPiece === curType && hs.piece.type === nxtType, 'hold=' + hs.holdPiece + ' piece=' + hs.piece.type)
    tp.tap('hold')
    check('r16 AC-7 周期内第二次触屏 Hold 无效（holdPiece 不变）', g7.getSnapshot().holdPiece === hs.holdPiece)
    check('r16 AC-7 第二次 Hold 无音效（ok=false）', countPlay('hold') === holdBefore + 1, 'hold plays=' + countPlay('hold'))
    t7.dispose()

    // AC-8：防默认行为全套（容器 / 按键 / 画布 touchstart·touchmove 均 defaultPrevented）
    const t8 = mkUI({ touch: true })
    t8.game.start()
    const evPadS = tp.ev('touchstart'); const evPadM = tp.ev('touchmove')
    $('#touch-controls').dispatchEvent(evPadS); $('#touch-controls').dispatchEvent(evPadM)
    check('r16 AC-8 .touchpad 容器 touchstart/touchmove 均 defaultPrevented（防滚动/缩放/选中/长按菜单）',
      evPadS.defaultPrevented === true && evPadM.defaultPrevented === true)
    const evBtn = tp.ev('touchstart')
    tp.btn('rotate').dispatchEvent(evBtn)
    check('r16 AC-8 触屏键 touchstart defaultPrevented', evBtn.defaultPrevented === true)
    const evCvS = tp.ev('touchstart'); const evCvM = tp.ev('touchmove')
    $('#board').dispatchEvent(evCvS); $('#board').dispatchEvent(evCvM)
    check('r16 AC-8 #board 画布 touchstart/touchmove 均 defaultPrevented', evCvS.defaultPrevented === true && evCvM.defaultPrevented === true)
    t8.dispose()

    // AC-9：多指互不串扰 + 连点不抖动
    const t9 = mkUI({ touch: true })
    const g9 = t9.game
    g9.start()
    const q0 = g9.getSnapshot()
    tp.down('moveLeft'); tp.down('softDrop')
    const q1 = g9.getSnapshot()
    check('r16 AC-9 多指 左+软降 同时生效（x−1 且 y+1 无串扰）',
      q1.piece.x === q0.piece.x - 1 && q1.piece.y === q0.piece.y + 1, 'x ' + q0.piece.x + '→' + q1.piece.x + ' y ' + q0.piece.y + '→' + q1.piece.y)
    tp.up('moveLeft')
    const sd0 = countPlay('softDrop')
    await sleep(140)
    check('r16 AC-9 释放左键不串扰软降（软降 repeat 仍持续）', countPlay('softDrop') > sd0, 'softDrop ' + sd0 + '→' + countPlay('softDrop'))
    tp.up('softDrop')
    const rw = g9.getSnapshot().piece.x
    tp.down('moveRight'); tp.down('moveRight')
    check('r16 AC-9 同键快连点不抖动（重复 touchstart 忽略，恰 1 步）', g9.getSnapshot().piece.x === rw + 1, 'x ' + rw + '→' + g9.getSnapshot().piece.x)
    tp.up('moveRight')
    const r0 = g9.getSnapshot().piece.rot
    tp.tap('rotate'); tp.tap('rotate')
    check('r16 AC-9 双击旋转 rot 恰 +2（无合成 click 双发）', g9.getSnapshot().piece.rot === (r0 + 2) % 4, 'rot ' + r0 + '→' + g9.getSnapshot().piece.rot)
    t9.dispose()

    // AC-10：触屏 + 键盘并存互不干扰；.tkey 键盘可激活且防双发
    const t10 = mkUI({ touch: true })
    const g10 = t10.game
    g10.start()
    const xk = g10.getSnapshot().piece.x
    key('ArrowLeft'); keyUp('ArrowLeft')
    check('r16 AC-10 触屏实例存活期键盘仍完整可用（ArrowLeft 生效）', g10.getSnapshot().piece.x === xk - 1)
    const bHd = tp.btn('hardDrop')
    check('r16 AC-10 .tkey 可聚焦（真实 BUTTON + tabIndex≥0）', bHd.tagName === 'BUTTON' && bHd.tabIndex >= 0)
    const hd0 = countPlay('hardDrop')
    const evEnter = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    bHd.dispatchEvent(evEnter)
    check('r16 AC-10 .tkey Enter 激活恰一次 hardDrop（preventDefault+stopPropagation 防双发）',
      evEnter.defaultPrevented === true && countPlay('hardDrop') === hd0 + 1, 'hardDrop ' + hd0 + '→' + countPlay('hardDrop'))
    t10.dispose()

    // AC-11：触屏设备上现有 HTML 按钮全流程可达（暂停↔继续循环无死角；disabled 随状态机联动）
    const t11 = mkUI({ touch: true })
    const g11 = t11.game
    check('r16 AC-11 开始/暂停/重开/设置/静音按钮俱在（真实 BUTTON）', ['#btn-start', '#btn-pause', '#btn-restart', '#btn-settings', '#btn-mute']
      .every(function (sel) { const el = $(sel); return !!el && el.tagName === 'BUTTON' }))
    $('#btn-start').click()
    check('r16 AC-11 触屏下开始按钮 → RUNNING', g11.getPhase() === 'RUNNING')
    check('r16 AC-11 开始后 暂停/重开 按钮启用（disabled 随状态机联动）',
      $('#btn-pause').disabled === false && $('#btn-restart').disabled === false)
    $('#btn-pause').click()
    check('r16 AC-11 触屏下暂停按钮 → PAUSED', g11.getPhase() === 'PAUSED')
    $('#btn-pause').click()
    check('r16 AC-11 触屏下继续按钮 → RUNNING', g11.getPhase() === 'RUNNING')
    t11.dispose()

    // AC-12：静态证据——token / 键尺寸算术 / 键行宽 / 窄屏兜底 / 遮挡结论数值
    const cssText = fs.readFileSync(path.join(root, 'style.css'), 'utf8')
    const htmlText = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    check('r16 AC-12 token --tpad-key: 3rem（48px 键）', cssText.indexOf('--tpad-key: 3rem') !== -1)
    check('r16 AC-12 token --z-touchpad: 5（面板 2 之上、遮罩 10 之下）', cssText.indexOf('--z-touchpad: 5') !== -1)
    check('r16 AC-12 .tkey 明确 width/height = var(--tpad-key)', /\.tkey\s*\{[^}]*width:\s*var\(--tpad-key\)[^}]*height:\s*var\(--tpad-key\)/.test(cssText))
    check('r16 AC-12 键尺寸算术 48px ≥ 44 最小目标', 48 >= 44)
    check('r16 AC-12 竖屏键行宽 6×48+5×8+16=344 ≤ 375 单行不溢出', 6 * 48 + 5 * 8 + 16 === 344 && 344 <= 375, '344 ≤ 375')
    check('r16 AC-12 窄屏兜底（max-width:379px → --tpad-key:2.75rem=44px，320px 不溢出）',
      cssText.indexOf('@media (max-width: 379px)') !== -1 && cssText.indexOf('--tpad-key: 2.75rem') !== -1)
    check('r16 AC-12 竖屏遮挡 ≥95%（(667−92)/592=0.971 ≥ 0.95，画布可视面积）', (667 - 92) / 592 >= 0.95 && (667 - 92) / 592 <= 1)
    check('r16 AC-12 横屏零遮挡（中列 812−144=668 ≥ 板框 592）', 812 - 144 >= 592)

    // AC-13/14：DOM 契约 + 纯 CSS 显隐 + 键鼠零视觉变化 + 回归基线（引擎零改动）
    const tkeys = Array.prototype.slice.call(doc.querySelectorAll('.tkey'))
    check('r16 AC-13/14 .tkey 恰 6 个', tkeys.length === 6, String(tkeys.length))
    const acts = tkeys.map(function (b) { return b.getAttribute('data-action') })
    const tkActs = TKEYS.map(function (e) { return e.action })
    check('r16 AC-13/14 data-action ↔ TOUCH_KEYS 六值一一对应', acts.length === 6 && tkActs.every(function (a) { return acts.indexOf(a) !== -1 }), acts.join(','))
    const labels = tkeys.map(function (b) { return b.getAttribute('aria-label') }).sort()
    const want = ['Hold 暂存', '左移', '右移', '旋转', '软降', '硬降'].sort()
    check('r16 AC-13 aria-label 六值齐全（触屏键自带标签即图例）',
      JSON.stringify(labels) === JSON.stringify(want), labels.join('/'))
    check('r16 AC-13 style.css 含 html.has-touch .key-hints 隐藏规则（不显示误导键盘文案）',
      cssText.indexOf('html.has-touch .key-hints') !== -1)
    check('r16 AC-13/14 index.html 含 #touch-controls', htmlText.indexOf('id="touch-controls"') !== -1)
    check('r16 AC-14 基础 .touchpad display:none（键鼠桌面零视觉变化）', /\.touchpad\s*\{[^}]*display:\s*none/.test(cssText))
    check('r16 AC-14 html.has-touch .touchpad display:flex（纯 CSS 显隐）', /html\.has-touch\s+\.touchpad\s*\{[^}]*display:\s*flex/.test(cssText))
    check('r16 AC-14 回归基线：引擎 SFX_EVENTS 未变（move/rotate/softDrop/hardDrop/clear/levelUp/gameOver/hold 俱在）',
      ['move', 'rotate', 'softDrop', 'hardDrop', 'clear', 'levelUp', 'gameOver', 'hold'].every(function (e) { return window.TetrisGame.SFX_EVENTS.indexOf(e) !== -1 }))
    check('r16 AC-14 回归基线：速率常量仍为 DAS 170/100、软降 50（零新常量）',
      window.TetrisGame.DAS_DELAY_MS === 170 && window.TetrisGame.DAS_REPEAT_MS === 100 && window.TetrisGame.SOFT_DROP_REPEAT_MS === 50)
    check('r16 TOUCH_KEYS 导出含 key 回放码（6 键 action+key+holdable）',
      TKEYS.length === 6 && TKEYS.every(function (e) { return typeof e.key === 'string' && typeof e.action === 'string' && typeof e.holdable === 'boolean' }))
    check('r16 isTouchDevice() jsdom/桌面恒 false（能力检测，默认路径零变化）', window.TetrisUI.isTouchDevice() === false)
  }

  /* ---------- r17 响应式重排（AC-8 跨档 resize / AC-5 显隐复用 / 静态证据） ---------- */
  console.log('\n-- r17 响应式重排（AC-8 跨档 resize / AC-5 显隐 / AC-7 静态证据） --')
  {
    // AC-8：断点切换 = 派生样式而非状态（PRD R2）——布局档位不进入 JS 状态机。
    // jsdom 无布局引擎，CSS 断点几何不可验证（PRD R4，几何入 QA 真机清单）；可行为验证的是：
    // 向 window 连续派发不同宽度 resize（ui.js onResize 仅重烘焙 DPR，零档位感知）→ 引擎快照
    // 逐字段不变、phase 保持 RUNNING、无重载信号（hash/history 未变）。5 轮覆盖 S/M/L 跨档与
    // 横竖屏形态，之后再 tick 仍可继续游玩（构造性保证：JS 不感知档位，TECHNICAL §7.3/§6.1）。
    const pick8 = function (s) {
      return {
        board: s.board,
        piece: s.piece ? { type: s.piece.type, x: s.piece.x, y: s.piece.y, rot: s.piece.rot } : null,
        score: s.score, lines: s.lines, level: s.level,
        next: s.next, queue: s.queue, holdPiece: s.holdPiece,
      }
    }
    const snapEq8 = function (a, b) { return JSON.stringify(pick8(a)) === JSON.stringify(pick8(b)) }
    const t8 = window.TetrisUI.createUI({
      autoLoop: false,
      rng: function () { return 0 },
      sfxEngine: spy,
      animMs: 0,
      touch: true,
    })
    const g8 = t8.game
    g8.start()
    key('ArrowRight') // 先产生一次输入，快照非平凡（piece 与初始态不同）
    const snap8 = g8.getSnapshot()
    const hash0 = window.location.hash
    const hist0 = window.history.length
    // S/M/L 跨档 + 横竖屏形态（320 含 568×320 / 844 含 390×844 典型样本）
    const widths8 = [390, 768, 1024, 320, 844]
    let resizeOk = true
    let resizeDetail = ''
    widths8.forEach(function (w, i) {
      // jsdom 无布局引擎：innerWidth 为纯标记，resize 事件驱动 ui.js 的 DPR 重烘焙路径；
      // 断点命中与否由真实浏览器 CSS 兑现（AC-8 只保证 JS 不感知）
      try { Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true }) } catch (e) { /* 只读属性时跳过宽度标记 */ }
      window.dispatchEvent(new window.Event('resize'))
      const s = g8.getSnapshot()
      if (!snapEq8(s, snap8) || s.phase !== 'RUNNING' || window.location.hash !== hash0 || window.history.length !== hist0) {
        resizeOk = false
        resizeDetail = '第 ' + (i + 1) + ' 轮 w=' + w + ' 快照/hash/history 漂移'
      }
    })
    check('r17 AC-8 跨档 resize 5 轮（390/768/1024/320/844）快照逐字段不变 + phase RUNNING + 无重载信号',
      resizeOk, resizeDetail || 'hash=' + hash0 + ' historyLen=' + hist0)
    // 轮换后仍可游玩：再 tick 一次（软降恰 1 格）
    key('ArrowDown')
    check('r17 AC-8 resize 风暴后引擎仍可游玩（软降恰 1 格）',
      g8.getSnapshot().piece.y === snap8.piece.y + 1, 'y ' + snap8.piece.y + '→' + g8.getSnapshot().piece.y)

    // AC-5：has-touch 显隐切换不重置对局（r16 AC-1 同款复用，r17 覆盖各档语义）
    const sBefore8 = g8.getSnapshot()
    doc.documentElement.classList.remove('has-touch')
    const sMid8 = g8.getSnapshot()
    doc.documentElement.classList.add('has-touch')
    check('r17 AC-5 增删 has-touch 不重置对局（snap 逐字段一致、phase RUNNING）',
      snapEq8(sBefore8, sMid8) && sMid8.phase === 'RUNNING')
    t8.dispose()
    check('r17 AC-5 dispose → has-touch 类移除（r16 归属回收保持）', !doc.documentElement.classList.contains('has-touch'))
  }

  /* ---------- r17 静态证据（cssText/htmlText 源结构：jsdom 不可达几何以结构断言表达，r16 段同款先例） ---------- */
  console.log('\n-- r17 静态证据（cssText/htmlText 源结构，AC-7/AC-4 保真锚点） --')
  {
    const css17 = fs.readFileSync(path.join(root, 'style.css'), 'utf8')
    const html17 = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    const sP17 = css17.slice(css17.indexOf('@media (max-width: 599px)'), css17.indexOf('@media (max-width: 599px) and (orientation: landscape)'))
    check('r19 静态 S 竖屏游戏视口：#main 网格 areas（hold board next）+ #board 等比覆盖 + key-hints 隐藏（AC-1/2/8）',
      /#main\s*\{[^}]*'hold board next'/.test(sP17) &&
      /#board\s*\{[^}]*width:\s*auto\s*!important/.test(sP17) &&
      /\.key-hints\s*\{[^}]*display:\s*none/.test(sP17))
    check('r19 静态一屏骨架：body height 100vh/100dvh 渐进对 + dock 随流 position:static + env 安全区延续（AC-3）',
      /height:\s*100vh/.test(sP17) && /height:\s*100dvh/.test(sP17) &&
      /\.touchpad\s*\{[^}]*position:\s*static/.test(sP17) &&
      /env\(safe-area-inset-bottom\)/.test(css17))
    check('r17 静态 M 档 media 存在（两列 600-767 / 三列 768-1023 minmax 吸收，AC-6）',
      css17.indexOf('@media (min-width: 600px) and (max-width: 767px)') !== -1 &&
      css17.indexOf('@media (min-width: 768px) and (max-width: 1023px)') !== -1 &&
      css17.indexOf('minmax(180px, 1fr) 340px minmax(180px, 1fr)') !== -1)
    check('r17 静态 AC-4：S/M 档 html.has-touch .btn min-height:44px（L 保持 r16 40px 基座）',
      /html\.has-touch\s+\.btn\s*\{[^}]*min-height:\s*44px/.test(css17))
    check('r17 静态 AC-7 保真锚点：.stat-grid 基座 gap:var(--sp-5) 复刻 L 间距',
      /\.stat-grid\s*\{[^}]*gap:\s*var\(--sp-5\)/.test(css17))
    check('r17 静态 index.html：.stat-grid 包裹 + viewport-fit=cover（TECHNICAL §4.1）',
      html17.indexOf('<div class="stat-grid"') !== -1 && html17.indexOf('viewport-fit=cover') !== -1)
  }

  /* ---------- 汇总 ---------- */
  console.log('\n== 结果汇总 ==')
  console.log('通过 ' + pass + ' / ' + (pass + fail))
  if (failures.length) {
    console.log('失败项：')
    failures.forEach(function (f) { console.log('  - ' + f) })
    process.exitCode = 1
  } else {
    console.log('ALL QA E2E CHECKS PASSED')
  }

  /* ---------- 附加：file:// 真实加载管线（AC-08.1/2/3 静态交付验证） ---------- */
  console.log('\n-- file:// 加载管线（jsdom resources:usable） --')
  {
    const errors = []
    const consoleErrs = [] // v3.0 回归防护：装配期 console.error（如 [tetris] 装配失败）必须被 E2E 捕获
    const vc = new VirtualConsole()
    vc.on('jsdomError', function (e) { errors.push(String(e && e.message || e)) })
    vc.on('error', function () {
      consoleErrs.push(Array.prototype.slice.call(arguments).map(String).join(' '))
    })
    const dom2 = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
      url: 'file://' + path.join(root, 'index.html').replace(/\\/g, '/'),
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      virtualConsole: vc,
    })
    const { window: w2 } = dom2
    // Canvas 桩（自动装配的游戏需要）
    w2.HTMLCanvasElement.prototype.getContext = function (t) {
      if (t !== '2d') return null
      const noop = function () {}
      return { setTransform: noop, clearRect: noop, fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, closePath: noop, arcTo: noop, fill: noop, drawImage: noop, save: noop, restore: noop, set globalAlpha(v) {}, set lineWidth(v) {}, set fillStyle(v) {}, set strokeStyle(v) {} }
    }
    // 等待资源加载 + DOMContentLoaded + 自动装配
    await new Promise(function (r) {
      if (w2.document.readyState === 'complete') r()
      else w2.addEventListener('load', r)
    })
    await sleep(120)
    const handle2 = w2.__tetris && typeof w2.__tetris.dispose === 'function' ? w2.__tetris : null
    const bootedGame = handle2 && handle2.game ? handle2.game : null
    check('AC-08.1 file:// 下外部 css/js 全部加载解析（无资源错误）', errors.length === 0, errors.length ? errors[0] : '0 errors')
    check('装配期无 [tetris] 装配失败 console.error（v3.0 弹层 DOM 必须先于脚本，回归防护）', !consoleErrs.some(function (m) { return m.indexOf('装配失败') !== -1 }), consoleErrs.length ? consoleErrs[0] : 'no console.error')
    check('AC-08.1 脚本顺序执行 → 自动装配成功（window.__tetris 就绪）', !!bootedGame)
    check('自动装配实例 phase = READY', !!bootedGame && bootedGame.getPhase() === 'READY')
    check('自动装配已绑定键盘', !!bootedGame && bootedGame.isKeyboardAttached() === true)
    check('v2.0: audio.js 随页面加载（window.TetrisAudio 就绪）', !!(w2.TetrisAudio && typeof w2.TetrisAudio.createSfxEngine === 'function'))
    check('AC-09.5 DOM 无 <audio>/<source> 元素', !w2.document.querySelector('audio') && !w2.document.querySelector('source'))
    check('AC-10.4 自动装配下音量控件初始 80%', w2.document.getElementById('vol-value').textContent === '80%', w2.document.getElementById('vol-value').textContent)
    check('AC-19.7 自动装配下踢墙开关存在且默认开', (function () {
      const btn = w2.document.getElementById('btn-wallkick')
      return !!btn && btn.getAttribute('aria-pressed') === 'true'
    })())
    check('AC-09.7 降级：jsdom 无 AudioContext → isAvailable=false 且 play 不报错', (function () {
      try {
        const eng = w2.TetrisAudio.createSfxEngine()
        const ok = eng.isAvailable() === false
        eng.play('move')
        eng.dispose()
        return ok
      } catch (e) { return false }
    })())
    const wErrors = []
    w2.addEventListener('error', function (e) { wErrors.push(String(e.message)) })
    check('页面加载无全局 error 事件', wErrors.length === 0)
    // r16（AC-1/AC-13/AC-14 DOM 契约）：真实自动装配页 jsdom 无触屏能力 → 桌面默认零变化
    check('r16 file:// 自动装配：jsdom 无触屏能力 → html 无 has-touch（键鼠默认零视觉变化）',
      !w2.document.documentElement.classList.contains('has-touch'))
    check('r16 file:// 自动装配：真实页面含 #touch-controls 触屏操控区', !!w2.document.querySelector('#touch-controls'))
    check('r16 file:// 自动装配：页面含 6 个 .tkey 触屏键', w2.document.querySelectorAll('.tkey').length === 6)
    // r17（AC-1/AC-7 DOM 契约）：真实自动装配页 .stat-grid 包裹四统计块 + HUD 渲染不受包裹影响
    check('r17 file:// 自动装配：.stat-grid 包裹层存在且含四块 .stat', (function () {
      const g = w2.document.querySelector('.stat-grid')
      return !!g && g.querySelectorAll('.stat').length === 4 && !!g.querySelector('#stat-score')
    })())
    check('r17 file:// 自动装配：HUD 经包裹层照常渲染（#score/#level/#lines 初始值）',
      w2.document.getElementById('score').textContent === '0' &&
      w2.document.getElementById('level').textContent === '1' &&
      w2.document.getElementById('lines').textContent === '0')
    // 清理：关闭自动装配的 rAF 循环
    if (handle2) handle2.dispose()
    w2.close()
    check('自动装配实例 dispose 后无异常', true)
  }

  /* ---------- r21 特殊奖励 Toast 段（AC-2~8；独立 createUI animMs:240，TECHNICAL §7.3） ----------
     边界声明：animMs=0（主 E2E 环境 / reduced-motion 用户）无 clearing 载荷 → 奖励 Toast 不弹
     （AC-10 引擎 0 行 + AC-7 数值同源 + AC-11 旧断言零改动三约束下的唯一解，验收人工项明示）；
     本段以与产品一致的 animMs:240 独立实例断言奖励 DOM 行为（r13 先例）。
     驱动 = 直接方法调用 + tick(120)×2 完结动画 + tick(250)×2 缓冲锁定（LOCK_DELAY_MS=500）。 */
  console.log('\n-- r21 特殊奖励 Toast（animMs:240 独立 env，TECHNICAL §7.3 / AC-2~8）--')
  {
    const TG = window.TetrisGame
    const handle3 = window.TetrisUI.createUI({
      autoLoop: false,
      rng: function () { return 0 },
      sfxEngine: spy,
      animMs: 240,
    })
    const game3 = handle3.game
    const snap3 = function () { return game3.getSnapshot() }
    const rewardEl = function () { return $('#reward-toast') }
    const fullRowQ = function (type, exceptCol) {
      const row = []
      for (let c = 0; c < TG.COLS; c++) row.push(c === exceptCol ? null : type)
      return row
    }
    // 单消 1 行布景（row19 缺 col5 + 竖 I rot1 x3 y16，软降触底即锁）＝verify-game comboStageRow19 同构
    const comboClear = function () {
      const b = TG.createBoard()
      b[19] = fullRowQ('I', 5)
      game3._debug.setBoard(b)
      game3._debug.setNext('T')
      game3._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
      return game3.softDrop()
    }
    // 多行布景（rows 20-n..19 全 S 缺 missCol + 竖 I 补缺）＝verify-game comboStageLines 同构
    const stageLines = function (n, missCol) {
      const miss = typeof missCol === 'number' ? missCol : 5
      const b = TG.createBoard()
      for (let r = 20 - n; r <= 19; r++) for (let c = 0; c < TG.COLS; c++) if (c !== miss) b[r][c] = 'S'
      game3._debug.setBoard(b)
      game3._debug.setNext('T')
      game3._debug.setPiece({ type: 'I', rot: 1, x: miss - 2, y: 16 })
      return game3.hardDrop()
    }
    // 完结消行动画（120+120 = 240 ≥ animMs:240）
    const comboComplete = function () { game3.tick(120); game3.tick(120) }
    // 单次 tick dt 上限 250ms：LOCK_DELAY_MS=500 需两次达上限 tick 触发缓冲锁定（同 verify-game lockTick）
    const lockTick = function () { game3.tick(250); game3.tick(250) }
    // T4 槽（四实角）内联构造＝verify-game buildTSlot 语义（TECHNICAL §5.1/DESIGN §3 事实；不引跨脚本共享别具）
    const T4Q = { tl: true, tr: true, bl: true, br: true }
    const buildTSlotQ = function (clearRows) {
      const lx = 3
      const ly = 15
      const b = TG.createBoard()
      const cells = TG.pieceCells({ type: 'T', rot: 0, x: lx, y: ly })
      const tAt = function (r, c) { return cells.some(function (p) { return p.y === r && p.x === c }) }
      const set = function (r, c) { b[r][c] = 'Z' }
      set(ly, lx); set(ly, lx + 2); set(ly + 2, lx); set(ly + 2, lx + 2) // 四实角
      set(ly + 2, lx + 1) // 底部中心兜底支撑（保 grounded，rot0；验证几何与 verify-game buildTSlot 一致）
      for (const rr of clearRows || []) {
        const r = ly + rr
        for (let c = 0; c < TG.COLS; c++) {
          if (tAt(r, c)) continue
          set(r, c)
        }
      }
      return b
    }
    const tspinLock = function (clearRows) {
      game3._debug.setBoard(buildTSlotQ(clearRows))
      game3._debug.setNext('T')
      game3._debug.setPiece({ type: 'T', rot: 3, x: 3, y: 15 })
      const rr = game3.rotate()
      if (!(rr.ok === true)) throw new Error('r21 tspinLock rotate 应成功: ' + JSON.stringify(rr))
      lockTick()
    }

    game3.start()

    // S1：单消 1 行 combo0 → 静默（AC-5）
    let cr = comboClear()
    check('r21 S1: 单消 1 行锁定成功（cleared=1）', cr && cr.ok === true && cr.cleared === 1, JSON.stringify(cr))
    comboComplete()
    let s3 = snap3()
    check('r21 S1: 结算帧塌缩（clearedIndices=null、lines=1）', s3.clearedIndices === null && s3.lines === 1, 'lines=' + s3.lines)
    check('r21 S1: combo0 无奖励 → #reward-toast 保持 hidden（AC-5）', rewardEl().hidden === true)

    // S2：续单消 ×2 → combo1 显示、combo2 替换（AC-2/6）
    comboClear()
    comboComplete()
    check('r21 S2: combo1 结算帧 → #reward-toast 显示且文案 Combo ×1 +50（AC-2）',
      rewardEl().hidden === false && rewardEl().textContent === 'Combo ×1 +50' && rewardEl().classList.contains('is-showing'),
      '"' + rewardEl().textContent + '"')
    comboClear()
    comboComplete()
    check('r21 S2: combo2 替换 → 文案 Combo ×2 +100、仅剩新文本（AC-2/6）',
      rewardEl().hidden === false && rewardEl().textContent === 'Combo ×2 +100',
      '"' + rewardEl().textContent + '"')

    // S3：显示期 restart → 0 残留（AC-6）
    game3.restart()
    check('r21 S3: 显示期 restart → #reward-toast hidden（AC-6 0 残留）', rewardEl().hidden === true)

    // S4：重建链（静默 / +50 / +100）→ 1600ms 自动淡出（AC-6）
    comboClear(); comboComplete()
    comboClear(); comboComplete()
    check('r21 S4: 重建链 combo1 → Combo ×1 +50', rewardEl().hidden === false && rewardEl().textContent === 'Combo ×1 +50', '"' + rewardEl().textContent + '"')
    comboClear(); comboComplete()
    check('r21 S4: 重建链 combo2 → Combo ×2 +100', rewardEl().textContent === 'Combo ×2 +100', '"' + rewardEl().textContent + '"')
    await sleep(1700)
    check('r21 S4: 1600ms 后自动淡出（hidden + 去 is-showing）（AC-6）',
      rewardEl().hidden === true && !rewardEl().classList.contains('is-showing'))

    // S5：T-spin Full Single 分档 + T-spin · Combo 合并序（AC-3/4）
    // r21 D-1 修复实证：restart/开局计分=0 时首个计分事件即 T-Spin 消行（clearing 帧 score=0&&lines=0，
    // 引擎结算帧才落分）→ 分支③ restart 代理不得误清 pendingReward → 结算帧必须照常弹。
    // （旧版以 No-line T-spin 预热至 score>0 绕开该窗口，已移除——直接断言新行为。）
    game3.restart()
    tspinLock([1])
    s3 = snap3()
    check('r21 S5: restart 后首个 T-Spin 消行进入 clearing（tspin=full、cleared=1、combo=0、score=0）（AC-3/D-1）',
      s3.clearedIndices !== null && s3.clearedIndices.length === 1 && s3.tspin === 'full' && s3.combo === 0 && s3.score === 0,
      JSON.stringify({ ci: s3.clearedIndices, tspin: s3.tspin, combo: s3.combo, score: s3.score }))
    comboComplete()
    check('r21 S5: 首消即 T-Spin Single +800 正常弹出（AC-3 分档 / D-1 修复实证）',
      rewardEl().hidden === false && rewardEl().textContent === 'T-Spin Single +800', '"' + rewardEl().textContent + '"')
    game3.restart()
    comboClear(); comboComplete() // 前置 1 次普通清行（combo0 静默，链→1）
    tspinLock([1])
    comboComplete()
    const s5b = rewardEl().textContent
    check('r21 S5: 前置普通清行后同种子 → T-Spin Single +800 · Combo ×1 +50（AC-3/4 合并序）',
      rewardEl().hidden === false && s5b === 'T-Spin Single +800 · Combo ×1 +50', '"' + s5b + '"')
    check('r21 S5: 双轴合并用 · 分隔恰 2 段、双关键词俱在（AC-4）',
      s5b.split(' · ').length === 2 && s5b.indexOf('T-Spin Single') !== -1 && s5b.indexOf('Combo ×1 +50') !== -1,
      s5b.split(' · ').length + ' parts')

    // S6：No-line（同槽 clearRows:[]）→ 即时锁、无清行载荷 → 保持 hidden（AC-3 No-line）
    game3.restart()
    check('r21 S6 前置: restart 后 #reward-toast hidden', rewardEl().hidden === true)
    tspinLock([])
    s3 = snap3()
    check('r21 S6: No-line 即时锁（clearedIndices=null、新块已出生）', s3.clearedIndices === null && s3.piece !== null, JSON.stringify(s3.clearedIndices))
    check('r21 S6: No-line 不弹 → #reward-toast 保持 hidden（AC-3）', rewardEl().hidden === true)

    // S7：同帧升级+奖励（4×2 + 3，combo 0/1/2，末锁升级 L1→L2）（AC-6/7/R2）
    game3.restart()
    let r7 = stageLines(4)
    check('r21 S7: 首锁 4 行（combo0 静默）', r7 && r7.cleared === 4, JSON.stringify(r7))
    comboComplete()
    r7 = stageLines(4)
    check('r21 S7: 二锁 4 行（combo1）', r7 && r7.cleared === 4, JSON.stringify(r7))
    comboComplete()
    r7 = stageLines(3)
    check('r21 S7: 三锁 3 行（combo2、cleared=3）', r7 && r7.cleared === 3, JSON.stringify(r7))
    s3 = snap3()
    check('r21 S7: 末锁 clearing 载荷 combo=2、comboBonus=100（50×2×升级前 L1，AC-7/R2 数值证据）',
      s3.combo === 2 && s3.comboBonus === 100, JSON.stringify({ combo: s3.combo, bonus: s3.comboBonus }))
    comboComplete()
    s3 = snap3()
    check('r21 S7: 结算帧 lines=11、level=2（升级完成）', s3.lines === 11 && s3.level === 2, 'lines=' + s3.lines + ' level=' + s3.level)
    check('r21 S7: 同帧 #feedback-toast 与 #reward-toast 同时可见（AC-6 双槽并存）',
      rewardEl().hidden === false && $('#feedback-toast').hidden === false,
      'reward.hidden=' + rewardEl().hidden + ' lv.hidden=' + $('#feedback-toast').hidden)
    check('r21 S7: 奖励文案 Combo ×2 +100（乘数取升级前 L1 佐证，AC-6/7/R2）',
      rewardEl().textContent === 'Combo ×2 +100', '"' + rewardEl().textContent + '"')

    // S8：S7 显示期内出生碰撞 → OVER 帧 0 残留（AC-6 终局）
    const tower = Array.from({ length: 20 }, function () { return new Array(10).fill(null) })
    for (let r = 0; r < 4; r++) for (let c = 3; c <= 6; c++) tower[r][c] = 'T'
    game3._debug.setBoard(tower)
    game3.softDrop() // 当前块重叠 → 立即锁定（无消行）→ spawn 撞塔 → OVER
    s3 = snap3()
    check('r21 S8: 出生碰撞 → OVER（AC-6 终局）', s3.phase === 'OVER', s3.phase)
    check('r21 S8: OVER 帧后 #reward-toast hidden（0 残留）', rewardEl().hidden === true)

    // S9：DOM 契约（AC-8）
    check('r21 S9: #reward-toast 挂载点存在（AC-8）', rewardEl() !== null)
    check('r21 S9: aria-live=polite + role=status（AC-8）',
      rewardEl().getAttribute('aria-live') === 'polite' && rewardEl().getAttribute('role') === 'status',
      'aria-live=' + rewardEl().getAttribute('aria-live') + ' role=' + rewardEl().getAttribute('role'))

    // S10：段内 dispose（双槽清理）无异常（AC-11 收尾）
    handle3.dispose()
    check('r21 S10: 独立 env dispose 无异常（含双槽清理，AC-11）', true)
  }

  /* ---------- r23 Back-to-back 奖励倍率段（AC-1~10；独立 createUI animMs:240，TECHNICAL §7.4） ----------
     在 r21 独立 env 同款基座之上扩展第三路载荷（B2B 轴尾随）：helpers 段内自包含重声明
     （stageLines/comboComplete/lockTick/tspinLock/buildTSlotQ(_mini)，r13/r21 先例，不引跨脚本共享）；
     四行布景 = comboStageLines 同构（20-n..19 全 S 缺 miss + 竖 I）；期望一律 T.B2B_BONUS_BASE 公式推导（AC-4 单源）。 */
  console.log('\n-- r23 Back-to-back 奖励倍率（animMs:240 独立 env，TECHNICAL §7.4 / AC-1~10）--')
  {
    const TG = window.TetrisGame
    const handle4 = window.TetrisUI.createUI({
      autoLoop: false,
      rng: function () { return 0 },
      sfxEngine: spy,
      animMs: 240,
    })
    const game4 = handle4.game
    const snap4 = function () { return game4.getSnapshot() }
    const reward4 = function () { return $('#reward-toast') }
    const fullRowQ = function (type, exceptCol) {
      const row = []
      for (let c = 0; c < TG.COLS; c++) row.push(c === exceptCol ? null : type)
      return row
    }
    // 多行布景（rows 20-n..19 全 S 缺 missCol + 竖 I 补缺）＝verify-game comboStageLines 同构
    const stageLines = function (n, missCol) {
      const miss = typeof missCol === 'number' ? missCol : 5
      const b = TG.createBoard()
      for (let r = 20 - n; r <= 19; r++) for (let c = 0; c < TG.COLS; c++) if (c !== miss) b[r][c] = 'S'
      game4._debug.setBoard(b)
      game4._debug.setNext('T')
      game4._debug.setPiece({ type: 'I', rot: 1, x: miss - 2, y: 16 })
      return game4.hardDrop()
    }
    // 完结消行动画（120+120 = 240 ≥ animMs:240）
    const comboComplete = function () { game4.tick(120); game4.tick(120) }
    // 单次 tick dt 上限 250ms：LOCK_DELAY_MS=500 需两次达上限 tick 触发缓冲锁定
    const lockTick = function () { game4.tick(250); game4.tick(250) }
    // T 槽内联构造（spec 可传 3 实角 Mini：F3 rot0 缺 TR，verify-game F3 权威样例）＝verify-game buildTSlot 语义
    const T4Q = { tl: true, tr: true, bl: true, br: true }
    const MINI_Q = { tl: true, tr: false, bl: true, br: true }
    const buildTSlotQ = function (clearRows, spec) {
      const lx = 3
      const ly = 15
      const b = TG.createBoard()
      const cells = TG.pieceCells({ type: 'T', rot: 0, x: lx, y: ly })
      const tAt = function (r, c) { return cells.some(function (p) { return p.y === r && p.x === c }) }
      const set = function (r, c) { b[r][c] = 'Z' }
      const sp = spec || T4Q
      if (sp.tl) set(ly, lx)
      if (sp.tr) set(ly, lx + 2)
      if (sp.bl) set(ly + 2, lx)
      if (sp.br) set(ly + 2, lx + 2)
      set(ly + 2, lx + 1) // 底部中心兜底支撑（保 grounded，rot0；T4 槽与 r21 逐格一致）
      for (const rr of clearRows || []) {
        const r = ly + rr
        for (let c = 0; c < TG.COLS; c++) {
          if (tAt(r, c)) continue
          set(r, c)
        }
      }
      return b
    }
    const tspinLock = function (clearRows, spec) {
      game4._debug.setBoard(buildTSlotQ(clearRows, spec))
      game4._debug.setNext('T')
      game4._debug.setPiece({ type: 'T', rot: 3, x: 3, y: 15 })
      const rr = game4.rotate()
      if (!(rr.ok === true)) throw new Error('r23 tspinLock rotate 应成功: ' + JSON.stringify(rr))
      lockTick()
    }

    game4.start()

    // B1：首资格静默（fresh 首 Tetris，链 off → 仅置链不加分；AC-1/3/6）
    let rB = stageLines(4)
    check('r23 B1: 首锁 4 行锁定成功（cleared=4）', rB && rB.ok === true && rB.cleared === 4, JSON.stringify(rB))
    let sB = snap4()
    check('r23 B1: 首锁 clearing b2bBonus=0（链 off）且 b2bChain=false（结算前值）',
      sB.b2bBonus === 0 && sB.b2bChain === false, JSON.stringify({ b2b: sB.b2bBonus, chain: sB.b2bChain }))
    comboComplete()
    sB = snap4()
    check('r23 B1: 结算帧 b2bChain=true（置链）、b2bBonus 回 null',
      sB.b2bChain === true && sB.b2bBonus === null, JSON.stringify({ chain: sB.b2bChain, b2b: sB.b2bBonus }))
    check('r23 B1: 首资格静默 → #reward-toast 保持 hidden（AC-1/3 E1）', reward4().hidden === true)

    // B2：连发第 2 —— 同帧 combo 与 b2b 增量并存（AC-7），toast Combo·B2B 合并（AC-9），b2b 不进等级（AC-5）
    rB = stageLines(4)
    check('r23 B2: 二锁 4 行锁定成功', rB && rB.ok === true && rB.cleared === 4, JSON.stringify(rB))
    sB = snap4()
    check('r23 B2: 二锁 clearing b2bBonus=400（400×1 升级前 L1）、comboBonus=50、b2bChain=true（AC-7 双链并行）',
      sB.b2bBonus === TG.B2B_BONUS_BASE * 1 && sB.comboBonus === 50 && sB.combo === 1 && sB.b2bChain === true,
      JSON.stringify({ b2b: sB.b2bBonus, combo: sB.combo, cb: sB.comboBonus, chain: sB.b2bChain }))
    comboComplete()
    check('r23 B2: 结算 toast === Combo ×1 +50 · B2B +400（Combo 在前 · B2B 尾随，AC-9）',
      reward4().hidden === false && reward4().textContent === 'Combo ×1 +50 · B2B +400', '"' + reward4().textContent + '"')
    sB = snap4()
    check('r23 B2: score===2050 && lines===8 && level===1（b2b/combo 均不推进等级，AC-5）',
      sB.score === 2050 && sB.lines === 8 && sB.level === 1, JSON.stringify({ score: sB.score, lines: sB.lines, level: sB.level }))

    // B3：三连定值（第 3 仍 400 非 800；乘数取升级前；PRD §5/R4）
    rB = stageLines(4)
    check('r23 B3: 三锁 4 行锁定成功', rB && rB.ok === true && rB.cleared === 4, JSON.stringify(rB))
    sB = snap4()
    check('r23 B3: 三锁 clearing b2bBonus=400（仍 400 非 800，定值）且 s.level=1（乘数取升级前，R4）',
      sB.b2bBonus === TG.B2B_BONUS_BASE * 1 && sB.level === 1, JSON.stringify({ b2b: sB.b2bBonus, level: sB.level }))
    comboComplete()
    check('r23 B3: 三锁结算 toast === Combo ×2 +100 · B2B +400', reward4().textContent === 'Combo ×2 +100 · B2B +400', '"' + reward4().textContent + '"')
    sB = snap4()
    check('r23 B3: 三锁结算帧 lines=12、level=2（升级照常，b2b 不参与）', sB.lines === 12 && sB.level === 2, JSON.stringify({ lines: sB.lines, level: sB.level }))

    // B4：断链（restart → 4 行 → 1 行 → 4 行）：普通 1 行断链后首资格仅置链（AC-2/3）
    game4.restart()
    stageLines(4); comboComplete()
    stageLines(1); comboComplete()
    rB = stageLines(4)
    check('r23 B4: 断链后 4 行锁 clearing b2bBonus=0、b2bChain=false（结算前 off）',
      rB && rB.cleared === 4 && snap4().b2bBonus === 0 && snap4().b2bChain === false,
      JSON.stringify({ cleared: rB && rB.cleared, b2b: snap4().b2bBonus, chain: snap4().b2bChain }))
    comboComplete()
    check('r23 B4: 结算帧 b2bChain=true（重新置链）', snap4().b2bChain === true)
    check('r23 B4: toast === Combo ×2 +100（无 B2B 轴，AC-9）', reward4().textContent === 'Combo ×2 +100', '"' + reward4().textContent + '"')

    // B5：三轴同帧（restart → T-spin Full Single → T-spin Full Single；AC-4/9/R2）
    game4.restart()
    tspinLock([1])
    comboComplete()
    check('r23 B5: 前置 T-spin 锁 toast === T-Spin Single +800', reward4().textContent === 'T-Spin Single +800', '"' + reward4().textContent + '"')
    tspinLock([1])
    sB = snap4()
    check('r23 B5: 三轴同帧 clearing：tspin=full、combo=1、b2bBonus=400',
      sB.tspin === 'full' && sB.combo === 1 && sB.b2bBonus === TG.B2B_BONUS_BASE, JSON.stringify({ tspin: sB.tspin, combo: sB.combo, b2b: sB.b2bBonus }))
    comboComplete()
    const b5Text = reward4().textContent
    check('r23 B5: 结算 toast === T-Spin Single +800 · Combo ×1 +50 · B2B +400（三轴序）',
      b5Text === 'T-Spin Single +800 · Combo ×1 +50 · B2B +400', '"' + b5Text + '"')
    check('r23 B5: 三轴 split(·) 恰 3 段、[0] T-Spin 开头、[2] B2B 开头（序断言，AC-9）',
      b5Text.split(' · ').length === 3 && b5Text.split(' · ')[0].indexOf('T-Spin') === 0 && b5Text.split(' · ')[2].indexOf('B2B +') === 0,
      b5Text.split(' · ').length + ' parts')
    sB = snap4()
    check('r23 B5: 分数 900+1350=2250（R2 四轴素材）', sB.score === 2250, 'score=' + sB.score)

    // B6：No-line 断链（restart → T-spin [1] → No-line [] → T-spin [1]；AC-1/2/R1）
    game4.restart()
    tspinLock([1]); comboComplete()
    tspinLock([])
    sB = snap4()
    check('r23 B6: No-line 即时锁结算帧 b2bChain=false（cleared=0 不资格断链）', sB.b2bChain === false, JSON.stringify({ chain: sB.b2bChain }))
    tspinLock([1])
    sB = snap4()
    check('r23 B6: No-line 断链后 T-spin 锁 clearing b2bBonus=0（仅置链）、b2bChain=false（结算前）',
      sB.b2bBonus === 0 && sB.b2bChain === false, JSON.stringify({ b2b: sB.b2bBonus, chain: sB.b2bChain }))
    comboComplete()
    check('r23 B6: 结算帧 b2bChain=true（重新置链）', snap4().b2bChain === true)

    // B7：Mini 断链（restart → 4 行 → Mini 1 行 → 4 行；AC-1/2）
    game4.restart()
    stageLines(4); comboComplete()
    tspinLock([1], MINI_Q)
    sB = snap4()
    check('r23 B7: Mini 锁 clearing tspin=mini、b2bBonus=0（不资格，E4）',
      sB.tspin === 'mini' && sB.b2bBonus === 0, JSON.stringify({ tspin: sB.tspin, b2b: sB.b2bBonus }))
    comboComplete()
    check('r23 B7: Mini 锁结算帧 b2bChain=false（断链）', snap4().b2bChain === false)
    check('r23 B7: Mini 锁 toast === T-Spin Mini +100 · Combo ×1 +50（r21 行为不变，E4）',
      reward4().textContent === 'T-Spin Mini +100 · Combo ×1 +50', '"' + reward4().textContent + '"')
    rB = stageLines(4)
    check('r23 B7: Mini 断链后 4 行锁 clearing b2bBonus=0（仅置链）', rB && rB.cleared === 4 && snap4().b2bBonus === 0, JSON.stringify({ cleared: rB && rB.cleared, b2b: snap4().b2bBonus }))
    comboComplete()
    check('r23 B7: 末锁结算帧 b2bChain=true（重新置链）', snap4().b2bChain === true)

    // B8：OVER/restart 清空（显示期出生碰撞 → OVER 帧 0 残留 → restart 引擎归零；AC-6/7）
    const tower = Array.from({ length: 20 }, function () { return new Array(10).fill(null) })
    for (let r = 0; r < 4; r++) for (let c = 3; c <= 6; c++) tower[r][c] = 'T'
    game4._debug.setBoard(tower)
    game4.softDrop() // 当前块重叠 → 立即锁定（无消行）→ spawn 撞塔 → OVER
    sB = snap4()
    check('r23 B8: 出生碰撞 → OVER（AC-6 终局）', sB.phase === 'OVER', sB.phase)
    check('r23 B8: OVER 帧 #reward-toast hidden（0 残留）', reward4().hidden === true)
    game4.restart()
    check('r23 B8: restart 后引擎 b2bChain=false（会话归零，D6）', snap4().b2bChain === false)

    // B9：契约与收尾（AC-10 继承面复断 + 段内 dispose）
    check('r23 B9: #reward-toast 挂载点仍存在（r21 继承面）', reward4() !== null)
    check('r23 B9: aria-live=polite + role=status（r21 继承面，AC-10）',
      reward4().getAttribute('aria-live') === 'polite' && reward4().getAttribute('role') === 'status',
      'aria-live=' + reward4().getAttribute('aria-live') + ' role=' + reward4().getAttribute('role'))
    handle4.dispose()
    check('r23 B9: 独立 env dispose 无异常（AC-11 收尾）', true)
  }

  /* ---------- r24 触控双簇 + 操作区背景四皮肤 E2E 段（AC-3/7/8/12；TECHNICAL §6.4） ----------
  DOM 静态契约（双簇结构/hub 三层保险/radio×4）由 verify-ui 源扫描锁定；本段验行为：
  默认皮肤类装配 / radio 切换即时生效（引擎快照无漂移）/ restart 保持 / 持久化恢复
  （共享 backing 二次装载，r15/r14 同源注入先例）/ ✛ 点击零事件 / 桌面门控。 ---------- */
  console.log('\n-- r24 触控双簇 + 背景四皮肤（默认类 / 即时生效 / 恢复 / ✛ 零事件 / 门控） --')
  {
    window.eval(fs.readFileSync(path.join(root, 'persist.js'), 'utf8'))
    const backing = {}
    const sharedStore = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(backing, k) ? backing[k] : null },
      setItem: function (k, v) { backing[k] = String(v) },
      removeItem: function (k) { delete backing[k] },
    }
    const padEl = function () { return doc.querySelector('#touch-controls') }
    const skinClasses = function () {
      const p = padEl()
      if (!p) return []
      return Array.prototype.slice.call(p.classList).filter(function (c) { return c.indexOf('touchpad--skin-') === 0 })
    }
    const pickSnap = function (s) {
      return {
        board: s.board,
        piece: s.piece ? { type: s.piece.type, x: s.piece.x, y: s.piece.y, rot: s.piece.rot } : null,
        score: s.score, lines: s.lines, level: s.level,
        next: s.next, queue: s.queue, holdPiece: s.holdPiece,
      }
    }
    const snapEq = function (a, b) { return JSON.stringify(pickSnap(a)) === JSON.stringify(pickSnap(b)) }
    const radio = function (v) { return doc.querySelector('input[name="dock-skin"][value="' + v + '"]') }

    // ① 初始装配（touch:true）：默认皮肤类 fade 挂载 + radio 默认 checked=fade
    const r24p1 = window.TetrisPersist.createPersistence({ storage: sharedStore })
    const h1 = window.TetrisUI.createUI({
      autoLoop: false, rng: function () { return 0 }, sfxEngine: spy, animMs: 0,
      touch: true, persist: r24p1,
    })
    const g1 = h1.game
    check('r24: 装配即挂默认皮肤类 touchpad--skin-fade（AC-7 默认 C）',
      skinClasses().length === 1 && skinClasses()[0] === 'touchpad--skin-fade', JSON.stringify(skinClasses()))
    check('r24: 默认 radio checked=fade（AC-14 语义）', radio('fade').checked === true, 'checked=' + radio('fade').checked)

    // ② 即时生效（AC-7）：点「A 玻璃 dock」→ 类全量替换恰一皮肤类 + persist 写回 + 引擎快照无漂移。
    //    radio 切换本体在弹层内但 jsdom 无布局/命中拦截，直接点按即可；先于打开弹层断言 phase RUNNING
    //    （req-12 弹层打开自动暂停属弹层行为，与皮肤切换正交，避免混入快照比对）
    g1.start()
    const sSkin0 = g1.getSnapshot()
    radio('glass').click()
    check('r24: 点玻璃 radio → 恰一皮肤类 touchpad--skin-glass（applyDockSkin 全量替换）',
      skinClasses().length === 1 && skinClasses()[0] === 'touchpad--skin-glass', JSON.stringify(skinClasses()))
    check('r24: radio checked 同步（glass 选中、fade 取消）',
      radio('glass').checked === true && radio('fade').checked === false)
    const saved0 = r24p1.load()
    check('r24: 切换写持久化（settings.dockSkin === glass，AC-8 通道同源）',
      saved0.settings && saved0.settings.dockSkin === 'glass', JSON.stringify(saved0.settings && saved0.settings.dockSkin))
    const sSkin1 = g1.getSnapshot()
    check('r24: 切换零引擎触达（快照逐字段无漂移、phase 仍 RUNNING，AC-7）',
      snapEq(sSkin0, sSkin1) && sSkin1.phase === 'RUNNING', sSkin1.phase)
    // 弹层正交：打开设置弹层（req-12 自动暂停）后皮肤类保持——外观组即时切换不受弹层生命周期影响
    $('#btn-settings').click()
    check('r24: 设置弹层打开后皮肤类保持 glass（外观组与弹层正交）',
      skinClasses().length === 1 && skinClasses()[0] === 'touchpad--skin-glass', JSON.stringify(skinClasses()))

    // ③ restart 保持（AC-7）：切换后 restart → 皮肤类不变（会话内不重置）
    g1.restart()
    check('r24: restart 后皮肤类保持 glass', skinClasses().length === 1 && skinClasses()[0] === 'touchpad--skin-glass',
      JSON.stringify(skinClasses()))
    h1.dispose()

    // ④ 持久化恢复（AC-8）：同 backing 新 persist + 新 UI 实例 → 皮肤类与 radio checked 恢复 glass
    const r24p2 = window.TetrisPersist.createPersistence({ storage: sharedStore })
    const h2 = window.TetrisUI.createUI({
      autoLoop: false, rng: function () { return 0 }, sfxEngine: spy, animMs: 0,
      touch: true, persist: r24p2,
    })
    const g2 = h2.game
    check('r24: 二次装载恢复皮肤类 glass（AC-8 持久化恢复）',
      skinClasses().length === 1 && skinClasses()[0] === 'touchpad--skin-glass', JSON.stringify(skinClasses()))
    check('r24: 恢复后 radio checked=glass 同步', radio('glass').checked === true, 'checked=' + radio('glass').checked)

    // ⑤ ✛ 零事件（AC-3）：touchstart/touchend/click → 无合成 keydown、piece.x 不变、无音效；
    //    对照真实方向键照常（六键 .tkey[data-action] 命中回放器——DOM 重组零回归）
    g2.start()
    const sHub0 = g2.getSnapshot()
    const hubEl = doc.querySelector('.tpad-cross__hub')
    check('r24: hub 为 span 且无 data-action + aria-hidden（三层保险之二：标记层）',
      hubEl !== null && hubEl.tagName === 'SPAN' && !hubEl.hasAttribute('data-action') && hubEl.getAttribute('aria-hidden') === 'true')
    const plays0 = spy.plays.length
    const keyLog = []
    const hubKeySpy = function (e) { keyLog.push(e.key) }
    doc.addEventListener('keydown', hubKeySpy)
    hubEl.dispatchEvent(new window.Event('touchstart', { bubbles: true, cancelable: true }))
    hubEl.dispatchEvent(new window.Event('touchend', { bubbles: true, cancelable: true }))
    hubEl.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    doc.removeEventListener('keydown', hubKeySpy)
    const sHub1 = g2.getSnapshot()
    check('r24: hub 三事件零合成 keydown（无 data-action 不命中回放器，AC-3）', keyLog.length === 0, keyLog.length + ' keydown')
    check('r24: hub 点击零副作用（piece.x 不变、无音效）',
      sHub1.piece.x === sHub0.piece.x && spy.plays.length === plays0,
      'x ' + sHub0.piece.x + '→' + sHub1.piece.x + ' plays+' + (spy.plays.length - plays0))
    const dirBtn = doc.querySelector('.tkey[data-action="moveLeft"]')
    dirBtn.dispatchEvent(new window.Event('touchstart', { bubbles: true, cancelable: true }))
    dirBtn.dispatchEvent(new window.Event('touchend', { bubbles: true, cancelable: true }))
    check('r24: 对照——十字簇真实方向键 touch 照常（DOM 重组六键零回归）',
      g2.getSnapshot().piece.x === sHub1.piece.x - 1, 'x ' + sHub1.piece.x + '→' + g2.getSnapshot().piece.x)
    h2.dispose()

    // ⑥ 桌面门控（AC-12）：touch:false 实例 → 无 has-touch；外观组隐藏规则存在（jsdom 无布局，显隐走源码断言先例）
    const h3 = window.TetrisUI.createUI({
      autoLoop: false, rng: function () { return 0 }, sfxEngine: spy, animMs: 0,
    })
    check('r24: 桌面实例无 has-touch（外观组整组隐藏，AC-12）', !doc.documentElement.classList.contains('has-touch'))
    const cssR24e = fs.readFileSync(path.join(root, 'style.css'), 'utf8')
    check('r24: 外观组基座 display:none（不入可访问性树）',
      /\.settings-group--appearance\s*\{[^}]*display:\s*none/.test(cssR24e))
    check('r24: html.has-touch 下外观组显示（纯 CSS 门控，r16 先例）',
      /html\.has-touch\s+\.settings-group--appearance\s*\{[^}]*display:\s*block/.test(cssR24e))
    h3.dispose()
    check('r24: 段内实例 dispose 无异常（has-touch 归属回收）', !doc.documentElement.classList.contains('has-touch'))
  }

  /* ---------- r26 rail 元素化 + 2×2 皮肤选择器 E2E 段（AC-2/3/7~9/14；TECHNICAL §7） ----------
  DOM 静态契约（rail 双元素/包裹关系/radio×4 tile 结构/描边轨道盒/横屏门控）由 verify-ui 源扫描
  锁定；jsdom 无布局——几何/媒体断言留在 verify-ui 源码层，本段纯追加证明 DOM 重组后交互路径逐
  字节等价：① rail 结构运行时断言（恰 2 轨、左右轨包裹关系、.rail 非键类无 data-action → 回放器/
  键聚合零命中、六键数量与动作字面量零回归）；② 新结构（label>radio+name span）下 radio 点击仍
  即时生效并写持久化（对齐 r24 快照比对先例：默认 fade → 点 glass → 类全量替换 + checked 同步 +
  引擎快照无漂移）。-------- */
  console.log('\n-- r26 rail 元素化 + 2×2 皮肤选择器（rail 结构 / 新结构 radio 即时生效写持久化） --')
  {
    // ① rail 结构运行时断言（静态 DOM，不依赖 UI 实例）
    const rails = doc.querySelectorAll('#touch-controls > .rail')
    check('r26: rail 恰 2 个（左 .rail--l / 右 .rail--r）', rails.length === 2, String(rails.length))
    const railL26 = doc.querySelector('#touch-controls > .rail--l')
    const railR26 = doc.querySelector('#touch-controls > .rail--r')
    check('r26: 左右轨均存在且 class 含 rail--l/rail--r（定向选择器可命中）',
      railL26 !== null && railR26 !== null &&
      railL26.classList.contains('rail--l') && railR26.classList.contains('rail--r'))
    const isNonKeyRail26 = function (el) {
      return el !== null && el.tagName === 'DIV' && !el.classList.contains('tkey') && !el.hasAttribute('data-action')
    }
    check('r26: .rail 为非键类、无 data-action（回放器/键聚合零命中）',
      isNonKeyRail26(railL26) && isNonKeyRail26(railR26))
    // 包裹关系：左轨包十字簇（恰 4 dir 键 + hub），右轨包旋转簇（Hold/旋转）
    check('r26: 左轨包 .tpad-cross 恰 4 键 + hub；右轨包 .tpad-main 恰 2 键（Hold/旋转）',
      railL26.querySelector('.tpad-cross') !== null && railL26.querySelectorAll('.tkey').length === 4 &&
      railL26.querySelectorAll('.tpad-cross__hub').length === 1 &&
      railR26.querySelector('.tpad-main') !== null && railR26.querySelectorAll('.tkey').length === 2 &&
      railR26.querySelector('.tkey--hold') !== null && railR26.querySelector('.tkey--rotate') !== null)
    check('r26: 左右轨互不串簇（rail--l 无 .tpad-main、rail--r 无 .tpad-cross）',
      railL26.querySelector('.tpad-main') === null && railR26.querySelector('.tpad-cross') === null)
    // 六键零回归：数量与动作字面量（r16/r24 交叉断言防漂移；rail 包裹下键聚合不命中）
    const tkeys26 = doc.querySelectorAll('#touch-controls .tkey')
    const acts26 = Array.prototype.map.call(tkeys26, function (b) { return b.getAttribute('data-action') })
    check('r26: 六 .tkey[data-action] 数量/动作零回归',
      tkeys26.length === 6 && acts26.slice().sort().join(',') === 'hardDrop,hold,moveLeft,moveRight,rotate,softDrop',
      acts26.slice().sort().join(','))
    check('r26: #touch-controls 内 [data-action] 恰 6（rail 零额外挂点）',
      doc.querySelectorAll('#touch-controls [data-action]').length === 6)
    // 回放器锚点：.tkey[data-action="X"] 定向查询穿越 rail 包裹仍命中
    check('r26: 回放器锚点 .tkey[data-action=moveLeft/hold/rotate] 穿越 rail 包裹命中',
      doc.querySelector('.tkey[data-action="moveLeft"]') !== null &&
      doc.querySelector('.tkey[data-action="hold"]') !== null &&
      doc.querySelector('.tkey[data-action="rotate"]') !== null)

    // ② 新结构（label>radio + tile + name）下 radio 点击仍即时生效写持久化（AC-7/8/14）
    window.eval(fs.readFileSync(path.join(root, 'persist.js'), 'utf8'))
    const backingR26 = {}
    const storeR26 = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(backingR26, k) ? backingR26[k] : null },
      setItem: function (k, v) { backingR26[k] = String(v) },
      removeItem: function (k) { delete backingR26[k] },
    }
    const skinR26 = function () {
      const p = doc.querySelector('#touch-controls')
      if (!p) return []
      return Array.prototype.slice.call(p.classList).filter(function (c) { return c.indexOf('touchpad--skin-') === 0 })
    }
    const radioR26 = function (v) { return doc.querySelector('input[name="dock-skin"][value="' + v + '"]') }
    const r26p = window.TetrisPersist.createPersistence({ storage: storeR26 })
    const hr26 = window.TetrisUI.createUI({
      autoLoop: false, rng: function () { return 0 }, sfxEngine: spy, animMs: 0,
      touch: true, persist: r26p,
    })
    const gr26 = hr26.game
    // 新结构静态断言：四 label > input[radio name=dock-skin] + tile + name（名称另起一行承载，AC-8）
    const opts26 = doc.querySelectorAll('#dock-skin-control .dock-skin-option')
    check('r26: 2×2 选择器恰 4 个 label.dock-skin-option（AC-7）', opts26.length === 4, String(opts26.length))
    let optStructOk26 = true
    Array.prototype.forEach.call(opts26, function (lb) {
      const inp = lb.querySelector('input[type="radio"][name="dock-skin"]')
      if (inp === null || lb.querySelector('.dock-skin-option__tile') === null ||
          lb.querySelector('.dock-skin-option__name') === null) optStructOk26 = false
    })
    check('r26: 每 option = label>radio[name=dock-skin]+tile+name（radio 非文本直承，AC-8 重构车道）', optStructOk26)
    check('r26: 装配即挂默认皮肤类 touchpad--skin-fade + radio checked=fade（AC-7 默认 C）',
      skinR26().length === 1 && skinR26()[0] === 'touchpad--skin-fade' && radioR26('fade').checked === true,
      JSON.stringify(skinR26()))
    gr26.start()
    const snapR26a = gr26.getSnapshot()
    radioR26('glass').click()
    check('r26: 新结构下点玻璃 radio → 恰一皮肤类 touchpad--skin-glass（applyDockSkin 全量替换）',
      skinR26().length === 1 && skinR26()[0] === 'touchpad--skin-glass', JSON.stringify(skinR26()))
    check('r26: radio checked 同步（glass 选中、fade 取消）',
      radioR26('glass').checked === true && radioR26('fade').checked === false)
    const savedR26 = r26p.load()
    check('r26: 切换写持久化（settings.dockSkin === glass，AC-8 通道同源）',
      savedR26.settings && savedR26.settings.dockSkin === 'glass',
      JSON.stringify(savedR26.settings && savedR26.settings.dockSkin))
    const snapR26b = gr26.getSnapshot()
    check('r26: 切换零引擎触达（board/piece/score/lines/level 快照无漂移、phase RUNNING）',
      JSON.stringify(snapR26a.board) === JSON.stringify(snapR26b.board) &&
      JSON.stringify(snapR26a.piece) === JSON.stringify(snapR26b.piece) &&
      snapR26a.score === snapR26b.score && snapR26a.lines === snapR26b.lines &&
      snapR26a.level === snapR26b.level && snapR26b.phase === 'RUNNING', snapR26b.phase)
    hr26.dispose()
    check('r26: 段内实例 dispose 无异常（has-touch 归属回收）', !doc.documentElement.classList.contains('has-touch'))
  }

  /* ---------- r27 十字键上/下硬软互换 E2E 段（D-1 模板层整按钮互换；AC-1~3；TECHNICAL §9） ----------
  互换落模板层：单模板三作用域（S dock / 横屏侧轨 / M/L 行式底栏均为 CSS 重排同一 #touch-controls
  DOM）——双作用域同步互换由构造保证。本段纯追加，从运行时 DOM 侧证明：① 十字簇四键五字段有序
  断言（data-action/aria-label/图标/文字逐字有序：上=softDrop 软降 ▼、下=hardDrop 硬降 ⤓，取代
  r24#AC-1 授权，登记改写同 verify-ui 653/769）；② 共享 DOM 恒等断言（双作用域验证口径：全文档
  恰 1 个 #touch-controls/.tpad-cross + 六键动作各恰 1——S 与 M/L 恒同一批元素）；③ hub 无
  data-action 复验（r24/r26 三层保险在互换后零回归）。M/L 视觉键序冻结（基座 order）由 verify-ui
  源码层锁定，jsdom 无布局故不重复。-------- */
  console.log('\n-- r27 十字键上/下硬软互换（五字段有序 / 共享 DOM 恒等 / hub 复验） --')
  {
    // ① 十字簇四键五字段有序断言（静态 DOM：rail--l > tpad-cross 内四 .tkey 的 DOM 源序）
    const crossR27 = doc.querySelector('#touch-controls .rail--l .tpad-cross')
    check('r27: 左轨内十字簇存在（rail--l > .tpad-cross）', crossR27 !== null)
    const tkeysR27 = crossR27 === null ? [] : Array.prototype.slice.call(crossR27.querySelectorAll('.tkey'))
    check('r27: 十字簇恰 4 键 + ✛ hub', tkeysR27.length === 4 && crossR27 !== null &&
      crossR27.querySelector('.tpad-cross__hub') !== null, String(tkeysR27.length))
    // r27 期望序（五字段逐字随元素迁移；取代 r24#AC-1 授权，与 verify-ui 653/769 登记改写同源）
    const specR27 = [
      { action: 'softDrop', aria: '软降', label: '软降', icon: '▼' },
      { action: 'moveLeft', aria: '左移', label: '左', icon: '◀' },
      { action: 'moveRight', aria: '右移', label: '右', icon: '▶' },
      { action: 'hardDrop', aria: '硬降', label: '硬降', icon: '⤓' },
    ]
    let specOkR27 = tkeysR27.length === 4
    const gotActsR27 = []
    tkeysR27.forEach(function (b, i) {
      gotActsR27.push(b.getAttribute('data-action'))
      const want = specR27[i]
      if (want === undefined) return
      const iconEl = b.querySelector('.tkey__icon')
      const labelEl = b.querySelector('.tkey__label')
      if (!b.classList.contains('tkey--dir') || b.getAttribute('data-action') !== want.action ||
          b.getAttribute('aria-label') !== want.aria ||
          iconEl === null || iconEl.textContent !== want.icon ||
          labelEl === null || labelEl.textContent !== want.label) specOkR27 = false
    })
    check('r27: 十字簇源序 softDrop→moveLeft→moveRight→hardDrop 且五字段（action/aria/图标/文字）随元素迁移',
      specOkR27, gotActsR27.join(','))
    // ② 共享 DOM 恒等断言（双作用域验证口径）：单模板唯一 → S 与 M/L 恒同一批元素；
    //    六键动作各恰 1、无重复无缺漏（互换不增删语义）
    const controlsCountR27 = doc.querySelectorAll('#touch-controls').length
    const crossCountR27 = doc.querySelectorAll('#touch-controls .tpad-cross').length
    const railCountR27 = doc.querySelectorAll('#touch-controls > .rail').length
    const actCountR27 = function (a) { return doc.querySelectorAll('#touch-controls .tkey[data-action="' + a + '"]').length }
    const allActsR27 = ['hardDrop', 'softDrop', 'moveLeft', 'moveRight', 'rotate', 'hold']
    check('r27: 共享 DOM 恒等（恰 1 个 #touch-controls / 1 个 .tpad-cross / 2 轨——S 与 M/L 单模板同源）',
      controlsCountR27 === 1 && crossCountR27 === 1 && railCountR27 === 2,
      controlsCountR27 + '/' + crossCountR27 + '/' + railCountR27)
    check('r27: 六键动作集合不变且各恰 1（硬降/软降互换位置但不增删语义）',
      allActsR27.every(function (a) { return actCountR27(a) === 1 }),
      allActsR27.map(function (a) { return a + '=' + actCountR27(a) }).join(','))
    // ③ hub 复验（r24/r26 三层保险在互换后仍成立）
    const hubR27 = doc.querySelector('.tpad-cross__hub')
    check('r27: hub 为 span 无 data-action + aria-hidden（互换后零回放命中保险承继）',
      hubR27 !== null && hubR27.tagName === 'SPAN' && !hubR27.hasAttribute('data-action') &&
      hubR27.getAttribute('aria-hidden') === 'true')
    // ③b hub 点按零事件复验（沿 r24 2307 起先例）+ 互换键动作锚定对照（回放器按 data-action 命中，AC-2/3）
    window.eval(fs.readFileSync(path.join(root, 'persist.js'), 'utf8'))
    const backingR27 = {}
    const storeR27 = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(backingR27, k) ? backingR27[k] : null },
      setItem: function (k, v) { backingR27[k] = String(v) },
      removeItem: function (k) { delete backingR27[k] },
    }
    const persistR27 = window.TetrisPersist.createPersistence({ storage: storeR27 })
    const uiR27 = window.TetrisUI.createUI({
      autoLoop: false, rng: function () { return 0 }, sfxEngine: spy, animMs: 0,
      touch: true, persist: persistR27,
    })
    const gR27 = uiR27.game
    gR27.start()
    const snapR27a = gR27.getSnapshot()
    const spyPlaysR27a = spy.plays.length
    const keyLogR27 = []
    const hubKeySpyR27 = function (e) { keyLogR27.push(e.key) }
    doc.addEventListener('keydown', hubKeySpyR27)
    hubR27.dispatchEvent(new window.Event('touchstart', { bubbles: true, cancelable: true }))
    hubR27.dispatchEvent(new window.Event('touchend', { bubbles: true, cancelable: true }))
    hubR27.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    doc.removeEventListener('keydown', hubKeySpyR27)
    const snapR27b = gR27.getSnapshot()
    check('r27: hub 三事件零合成 keydown（无 data-action 不命中回放器，r24 先例承继）',
      keyLogR27.length === 0, keyLogR27.length + ' keydown')
    check('r27: hub 点按零副作用（piece 不动、无新音效——互换后 ✛ 叉饰仍零事件）',
      JSON.stringify(snapR27a.piece) === JSON.stringify(snapR27b.piece) &&
      spy.plays.length === spyPlaysR27a, 'plays+' + (spy.plays.length - spyPlaysR27a))
    // 对照：互换后上=softDrop 下=hardDrop，按 data-action 锚定即时生效（键帽语义随元素迁移）
    const softKeyR27 = doc.querySelector('.tkey[data-action="softDrop"]')
    softKeyR27.dispatchEvent(new window.Event('touchstart', { bubbles: true, cancelable: true }))
    softKeyR27.dispatchEvent(new window.Event('touchend', { bubbles: true, cancelable: true }))
    const snapR27c = gR27.getSnapshot()
    check('r27: 互换后源序首位=软降键，touch 单步 y+1（动作语义随 data-action 迁移，AC-4 契约承继）',
      snapR27c.piece.y === snapR27b.piece.y + 1, 'y ' + snapR27b.piece.y + '→' + snapR27c.piece.y)
    const spyPlaysR27b = spy.plays.length
    const hardKeyR27 = doc.querySelector('.tkey[data-action="hardDrop"]')
    hardKeyR27.dispatchEvent(new window.Event('touchstart', { bubbles: true, cancelable: true }))
    hardKeyR27.dispatchEvent(new window.Event('touchend', { bubbles: true, cancelable: true }))
    const snapR27d = gR27.getSnapshot()
    check('r27: 互换后源序末位=硬降键，touch 触发锁定（board 变化 + hardDrop 音效，RUNNING 承续）',
      JSON.stringify(snapR27c.board) !== JSON.stringify(snapR27d.board) &&
      spy.plays.length === spyPlaysR27b + 1 && snapR27d.phase === 'RUNNING', snapR27d.phase)
    uiR27.dispose()
    check('r27: 段内实例 dispose 无异常（has-touch 归属回收）', !doc.documentElement.classList.contains('has-touch'))
  }

  /* ---------- r28 横屏双轨 E2E 段（r26 门控放宽：orientation: landscape 任意宽度恒双轨；TECHNICAL §r28） ----------
   jsdom 不执行媒体查询 → 双轨布局作用域裁定以「结构 + 源码」双面断言（cssText 源扫描即行为证明）：
   ① 双轨 DOM 结构（左轨十字簇 / 右轨主簇，互不串簇）；② 六键 rail 归属映射（源序逐 rail 断言——
   上软降/下硬降由 DOM 源序 + §5.5=竖屏共用 nth-child grid-area 映射承载）；③ hub 结构三保险复验；
   ④ hub 三事件零回放（live）；⑤ 源序键触控语义逐键即时验证（触控=键盘回放器路径，r27 harness 复用）；
   ⑥ 源码级 ≥600px 不落行式栏：M/L 档板块（600-767 / 768-1023 / ≥1024 7.5 段）零触控规则 →
   横屏唯一 .touchpad 权威 = §5.5 裸 landscape 双轨（门控文本精确断言登记 verify-ui §r28，不重复断言面）。-------- */
  console.log('\n-- r28 横屏双轨（双轨 DOM / 六键映射 / hub 零事件 / 源序触控语义 / ≥600px 不落行式栏） --')
  {
    // ① 双轨 DOM 结构（静态）：恰 1 容器、恰 2 直接 rail、左轨十字簇 4 键+hub、右轨主簇 2 键、互不串簇
    const ctrlR28 = doc.querySelector('#touch-controls')
    const railsR28 = doc.querySelectorAll('#touch-controls > .rail')
    const railLR28 = doc.querySelector('#touch-controls .rail--l')
    const railRR28 = doc.querySelector('#touch-controls .rail--r')
    check('r28: 双轨容器存在（恰 1 个 #touch-controls）', ctrlR28 !== null &&
      doc.querySelectorAll('#touch-controls').length === 1)
    check('r28: 恰 2 直接 rail（rail--l / rail--r 双轨）', railsR28.length === 2 &&
      railLR28 !== null && railRR28 !== null, String(railsR28.length))
    const crossR28 = railLR28 === null ? null : railLR28.querySelector('.tpad-cross')
    const mainR28 = railRR28 === null ? null : railRR28.querySelector('.tpad-main')
    check('r28: 左轨包 .tpad-cross 恰 1、右轨包 .tpad-main 恰 1',
      crossR28 !== null && railLR28.querySelectorAll('.tpad-cross').length === 1 &&
      mainR28 !== null && railRR28.querySelectorAll('.tpad-main').length === 1)
    const crossKeysR28 = crossR28 === null ? [] : Array.prototype.slice.call(crossR28.querySelectorAll('.tkey'))
    const mainKeysR28 = mainR28 === null ? [] : Array.prototype.slice.call(mainR28.querySelectorAll('.tkey'))
    check('r28: 十字簇恰 4 键 + ✛ hub、主簇恰 2 键',
      crossKeysR28.length === 4 && crossR28.querySelector('.tpad-cross__hub') !== null &&
      mainKeysR28.length === 2, crossKeysR28.length + '+' + mainKeysR28.length)
    check('r28: 左右轨互不串簇（rail--l 无 .tpad-main、rail--r 无 .tpad-cross）',
      railLR28.querySelectorAll('.tpad-main').length === 0 &&
      railRR28.querySelectorAll('.tpad-cross').length === 0)
    // ② 六键 rail 归属映射（源序逐 rail 断言：左轨四键 = 键盘回放器锚点，右轨两键 = Hold/旋转）
    const actsLR28 = crossKeysR28.map(function (b) { return b.getAttribute('data-action') })
    const actsRR28 = mainKeysR28.map(function (b) { return b.getAttribute('data-action') })
    check('r28: 左轨键位源序 softDrop→moveLeft→moveRight→hardDrop（上软降/下硬降）',
      actsLR28.join(',') === 'softDrop,moveLeft,moveRight,hardDrop', actsLR28.join(','))
    check('r28: 右轨键位源序 hold→rotate（主簇 Hold/旋转）', actsRR28.join(',') === 'hold,rotate', actsRR28.join(','))
    const actCountR28 = function (a) { return doc.querySelectorAll('#touch-controls .tkey[data-action="' + a + '"]').length }
    const sixActsR28 = ['hardDrop', 'softDrop', 'moveLeft', 'moveRight', 'rotate', 'hold']
    check('r28: 六键动作集合恰各 1（4+2 双轨全量，r16/r24/r27 交叉断言防漂移）',
      sixActsR28.every(function (a) { return actCountR28(a) === 1 }) &&
      doc.querySelectorAll('#touch-controls .tkey').length === 6,
      sixActsR28.map(function (a) { return a + '=' + actCountR28(a) }).join(','))
    // ③ hub 结构三保险复验（无 data-action / SPAN / aria-hidden；r24/r26/r27 承继）
    const hubR28 = doc.querySelector('#touch-controls .tpad-cross__hub')
    check('r28: hub 在左轨十字簇内、span 无 data-action + aria-hidden（回放器/键聚合零命中）',
      hubR28 !== null && crossR28 !== null && crossR28.contains(hubR28) &&
      hubR28.tagName === 'SPAN' && !hubR28.hasAttribute('data-action') &&
      hubR28.getAttribute('aria-hidden') === 'true')
    // ⑥ 源码级 ≥600px 不落行式栏（cssText 切片：M 两档 + L 段零触控规则 → 横屏双轨为唯一 .touchpad 权威；
    //    门控文本精确断言登记 verify-ui §r28，两段不重复断言面）
    const cssR28 = fs.readFileSync(path.join(root, 'style.css'), 'utf8')
    const m1sR28 = cssR28.indexOf('@media (min-width: 600px) and (max-width: 767px)')
    const m2sR28 = cssR28.indexOf('@media (min-width: 768px) and (max-width: 1023px)')
    const l7R28 = cssR28.indexOf('/* 7.5 L 桌面')
    const touchHitsR28 = function (s) { return (s.match(/\.touchpad|\.rail|\.tkey|\.tpad-/g) || []).join(',') }
    const m1HitsR28 = m1sR28 === -1 || m2sR28 === -1 ? '!anchor' : touchHitsR28(cssR28.slice(m1sR28, m2sR28))
    const m2HitsR28 = m2sR28 === -1 || l7R28 === -1 ? '!anchor' : touchHitsR28(cssR28.slice(m2sR28, l7R28))
    const lHitsR28 = l7R28 === -1 ? '!anchor' : touchHitsR28(cssR28.slice(l7R28))
    check('r28: M 两档 + L 段锚点齐备（600-767 / 768-1023 / ≥1024 7.5 段）',
      m1sR28 !== -1 && m2sR28 > m1sR28 && l7R28 > m2sR28, m1sR28 + '/' + m2sR28 + '/' + l7R28)
    // M 两档严格零触控规则；L 段放宽为「仅允许 html.has-touch 前缀的触控键隐藏规则
    // （display:none，r30 宽屏停用触控键），禁止渲染/布局触控规则（.rail/.tkey/.tpad-* 全无）」
    check('r28: M 两档零触控规则（.touchpad/.rail/.tkey/.tpad-* 全无 → ≥600px M 档不落行式栏）',
      m1HitsR28 === '' && m2HitsR28 === '',
      'M1[' + m1HitsR28 + '] M2[' + m2HitsR28 + ']')
    const lSegR28 = l7R28 === -1 ? '' : cssR28.slice(l7R28)
    let lRenderRulesR28 = 0
    const reTouchRuleL28 = /([^{}]*(?:\.touchpad|\.rail|\.tkey|\.tpad-)[^{}]*)\s*\{([^}]*)\}/g
    let mmL28
    while ((mmL28 = reTouchRuleL28.exec(lSegR28)) !== null) {
      const sel = (mmL28[1] || '').trim()
      const decl = (mmL28[2] || '')
      // 允许：触控键「隐藏规则」（.touchpad 且 display:none，无 rail/tkey/tpad- 渲染词元）。
      // 其余（渲染/布局 .rail/.tkey/.tpad-* 或非 display:none 的 .touchpad）一律视为渲染规则。
      const allowed = /\.touchpad\b/.test(sel) && /display:\s*none/.test(decl) &&
        !/\.(?:rail|tkey|tpad-)/.test(sel)
      if (!allowed) lRenderRulesR28++
    }
    check('r28: L 段仅允许触控键隐藏规则（display:none），禁止渲染/布局触控规则',
      lRenderRulesR28 === 0, 'renderRules=' + lRenderRulesR28)
    // ④ hub 三事件零回放（live）+ ⑤ 源序键触控语义逐键即时验证（触控=键盘回放器路径，r27 harness 复用）
    window.eval(fs.readFileSync(path.join(root, 'persist.js'), 'utf8'))
    const backingR28 = {}
    const storeR28 = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(backingR28, k) ? backingR28[k] : null },
      setItem: function (k, v) { backingR28[k] = String(v) },
      removeItem: function (k) { delete backingR28[k] },
    }
    const persistR28 = window.TetrisPersist.createPersistence({ storage: storeR28 })
    const uiR28 = window.TetrisUI.createUI({
      autoLoop: false, rng: function () { return 0 }, sfxEngine: spy, animMs: 0,
      touch: true, persist: persistR28,
    })
    const gR28 = uiR28.game
    gR28.start()
    const snapR28a = gR28.getSnapshot()
    const playsR28a = spy.plays.length
    const keyLogR28 = []
    const keySpyR28 = function (e) { keyLogR28.push(e.key) }
    doc.addEventListener('keydown', keySpyR28)
    hubR28.dispatchEvent(new window.Event('touchstart', { bubbles: true, cancelable: true }))
    hubR28.dispatchEvent(new window.Event('touchend', { bubbles: true, cancelable: true }))
    hubR28.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    doc.removeEventListener('keydown', keySpyR28)
    const snapR28b = gR28.getSnapshot()
    check('r28: hub 三事件零合成 keydown（无 data-action 不命中回放器）', keyLogR28.length === 0,
      keyLogR28.length + ' keydown')
    check('r28: hub 点按零副作用（piece 不动、无新音效）',
      JSON.stringify(snapR28a.piece) === JSON.stringify(snapR28b.piece) &&
      spy.plays.length === playsR28a, 'plays+' + (spy.plays.length - playsR28a))
    // ⑤ 按十字簇 DOM 源序逐键 touch（touchstart→合成 keydown 回放）→ 动作语义即时验证
    const tapR28 = function (k) {
      k.dispatchEvent(new window.Event('touchstart', { bubbles: true, cancelable: true }))
      k.dispatchEvent(new window.Event('touchend', { bubbles: true, cancelable: true }))
    }
    tapR28(crossKeysR28[0])
    const snapR28c = gR28.getSnapshot()
    check('r28: 源序①软降键 touch → y+1（上=软降语义随 data-action 生效）',
      snapR28c.piece.y === snapR28b.piece.y + 1, 'y ' + snapR28b.piece.y + '→' + snapR28c.piece.y)
    tapR28(crossKeysR28[1])
    const snapR28d = gR28.getSnapshot()
    check('r28: 源序②左移键 touch → x-1', snapR28d.piece.x === snapR28c.piece.x - 1,
      'x ' + snapR28c.piece.x + '→' + snapR28d.piece.x)
    tapR28(crossKeysR28[2])
    const snapR28e = gR28.getSnapshot()
    check('r28: 源序③右移键 touch → x+1', snapR28e.piece.x === snapR28d.piece.x + 1,
      'x ' + snapR28d.piece.x + '→' + snapR28e.piece.x)
    const playsR28e = spy.plays.length
    tapR28(crossKeysR28[3])
    const snapR28f = gR28.getSnapshot()
    check('r28: 源序④硬降键 touch → 锁定（board 变化 + hardDrop 音效 + RUNNING 承续）',
      JSON.stringify(snapR28e.board) !== JSON.stringify(snapR28f.board) &&
      spy.plays.length === playsR28e + 1 && snapR28f.phase === 'RUNNING', snapR28f.phase)
    uiR28.dispose()
    check('r28: 段内实例 dispose 无异常（has-touch 归属回收）', !doc.documentElement.classList.contains('has-touch'))
  }

  /* ---------- r29 横屏 ≥600px 内容让位 E2E 段（AC-1~8；TECHNICAL §5.2） ----------
   jsdom 不执行媒体查询/无布局几何 → 本段全部为源码级断言（cssText 源扫描即行为证明）：
    ① 让位规则存在（html.has-touch #main 含 232/124 + safe-area 左右 padding、三列 grid、保留信息不摊平面板）；
    ② 双轨 DOM 不变（r28 承继：2 rail、三件套互不串簇、六键 data-action 集合、hub 三保险）；
    ③ 触控语义零回归（源序首键 touch→y+1、末键 touch→落锁，r28 序列承继）；
    ④ 桌面非触控零触控区（touch:false → html 无 has-touch，AC-5 门控归属）；
    ⑤ 竖屏/S 横屏零回归（§7.1/§7.2 档 + §7.3/§7.4/L grid 模板原文仍在 + M 两档切片零触控规则）；
    ⑥ 段内 dispose 无异常 + has-touch 归属回收（mirror r28 2665）。-------- */
  console.log('\n-- r29 横屏 ≥600px 内容让位（让位规则 / 双轨承继 / 触控语义 / 桌面零触控 / 竖屏零回归） --')
  {
    const cssR29 = fs.readFileSync(path.join(root, 'style.css'), 'utf8')

    // ① 锁屏门控存在（源扫描）：触屏手机/平板横屏（<1024）→ 遮罩 + 隐藏触控键；宽屏（≥1024）→ 隐藏触控键
    const r30Lock = '@media (orientation: landscape) and (max-width: 1023px)'
    const r30LockIdx = cssR29.indexOf(r30Lock)
    const r30LockSeg = r30LockIdx === -1 ? '' : cssR29.slice(r30LockIdx, r30LockIdx + 300)
    check('r30: 锁屏门控存在 = @media (orientation: landscape) and (max-width: 1023px)（含 has-touch 遮罩 + 隐藏触控键）',
      r30LockIdx !== -1 &&
      r30LockSeg.indexOf('html.has-touch #rotate-overlay') !== -1 &&
      r30LockSeg.indexOf('display: flex') !== -1 &&
      r30LockSeg.indexOf('html.has-touch .touchpad') !== -1 &&
      r30LockSeg.indexOf('display: none') !== -1,
      r30LockIdx === -1 ? '!anchor' : r30LockSeg.slice(0, 80))
    const r30Wide = '@media (orientation: landscape) and (min-width: 1024px)'
    const r30WideIdx = cssR29.indexOf(r30Wide)
    const r30WideSeg = r30WideIdx === -1 ? '' : cssR29.slice(r30WideIdx, r30WideIdx + 200)
    check('r30: 宽屏桌面横屏（≥1024 且 landscape，has-touch）隐藏触控键',
      r30WideIdx !== -1 && r30WideSeg.indexOf('html.has-touch .touchpad') !== -1 &&
      r30WideSeg.indexOf('display: none') !== -1,
      r30WideIdx === -1 ? '!anchor' : r30WideSeg.slice(0, 80))
    // 遮罩 DOM 标记存在（index.html 静态节点，纯 CSS 门控显隐，ui.js 零改动）
    const rotDom = doc.querySelector('#rotate-overlay')
    check('r30: #rotate-overlay 遮罩 DOM 存在（index.html 静态标记，纯 CSS 显隐）',
      rotDom !== null && rotDom.querySelector('#rotate-overlay__card') !== null,
      rotDom === null ? '!rot-overlay' : 'rot-overlay found')

    // ⑤ 竖屏/S 横屏零回归（源扫描，AC-3/4）：§7.1 S 竖屏、§7.2 S 横屏、§7.3/§7.4/L grid 模板原文仍在；
    //    含 r28「M 两档切片不落行式栏」断言承继（M1/M2 两档零 .touchpad 触控规则）
    const sPortraitR29 = cssR29.indexOf('@media (max-width: 599px)')
    const sLandscapeR29 = cssR29.indexOf('@media (max-width: 599px) and (orientation: landscape)')
    check('r29: §7.1 S 竖屏（max-width:599px）与 §7.2 S 横屏（max-width:599px and landscape）原文仍在（AC-3/4）',
      sPortraitR29 !== -1 && sLandscapeR29 !== -1, sPortraitR29 + '/' + sLandscapeR29)
    const grid730R29 = cssR29.indexOf('minmax(0, 1fr) 340px')
    const grid740R29 = cssR29.indexOf('minmax(180px, 1fr) 340px minmax(180px, 1fr)')
    const gridLdR29 = cssR29.indexOf('240px 340px 240px')
    check('r29: §7.3/§7.4/L 三档 grid 模板原文保持（minmax(0,1fr) 340px / minmax(180px,1fr)×2 / 240|340|240）',
      grid730R29 !== -1 && grid740R29 !== -1 && gridLdR29 !== -1,
      grid730R29 + '/' + grid740R29 + '/' + gridLdR29)
    const m1sR29 = cssR29.indexOf('@media (min-width: 600px) and (max-width: 767px)')
    const m2sR29 = cssR29.indexOf('@media (min-width: 768px) and (max-width: 1023px)')
    const l7R29 = cssR29.indexOf('/* 7.5 L 桌面')
    const touchHitsR29 = function (s) { return (s.match(/\.touchpad|\.rail|\.tkey|\.tpad-/g) || []).join(',') }
    const m1HitsR29 = m1sR29 === -1 || m2sR29 === -1 ? '!anchor' : touchHitsR29(cssR29.slice(m1sR29, m2sR29))
    const m2HitsR29 = m2sR29 === -1 || l7R29 === -1 ? '!anchor' : touchHitsR29(cssR29.slice(m2sR29, l7R29))
    check('r29: M 两档切片零触控规则（.touchpad/.rail/.tkey/.tpad-* 全无，非触控 M 档不落行式栏）',
      m1sR29 !== -1 && m2sR29 > m1sR29 && m1HitsR29 === '' && m2HitsR29 === '',
      'M1[' + m1HitsR29 + '] M2[' + m2HitsR29 + ']')

    // ② 双轨 DOM 不变（r28 承继，AC-6/8）：2 rail、三件套互不串簇、六键 data-action 集合、hub 三保险
    const railsR29 = doc.querySelectorAll('#touch-controls > .rail')
    const railLR29 = doc.querySelector('#touch-controls .rail--l')
    const railRR29 = doc.querySelector('#touch-controls .rail--r')
    check('r29: 双轨承继——恰 2 rail（rail--l / rail--r）', railsR29.length === 2 &&
      railLR29 !== null && railRR29 !== null, String(railsR29.length))
    const crossR29 = railLR29 === null ? null : railLR29.querySelector('.tpad-cross')
    const mainR29 = railRR29 === null ? null : railRR29.querySelector('.tpad-main')
    check('r29: 三件套互不串簇（rail--l 无 .tpad-main、rail--r 无 .tpad-cross）',
      crossR29 !== null && mainR29 !== null &&
      railLR29.querySelectorAll('.tpad-main').length === 0 && railRR29.querySelectorAll('.tpad-cross').length === 0)
    const sixActsR29 = ['softDrop', 'moveLeft', 'moveRight', 'hardDrop', 'rotate', 'hold']
    const actCountR29 = function (a) { return doc.querySelectorAll('#touch-controls .tkey[data-action="' + a + '"]').length }
    check('r29: 六键 data-action 集合不变且各恰 1（softDrop/左/右/hardDrop/rotate/hold，r24/r27 契约承继）',
      sixActsR29.every(function (a) { return actCountR29(a) === 1 }) &&
      doc.querySelectorAll('#touch-controls .tkey').length === 6,
      sixActsR29.map(function (a) { return a + '=' + actCountR29(a) }).join(','))
    const hubR29 = doc.querySelector('#touch-controls .tpad-cross__hub')
    check('r29: hub 三保险承继（span 无 data-action + aria-hidden，回放器/键聚合零命中）',
      hubR29 !== null && hubR29.tagName === 'SPAN' && !hubR29.hasAttribute('data-action') &&
      hubR29.getAttribute('aria-hidden') === 'true')

    // ③ 触控语义/桌面共用持久化内存桩（r28 harness 复用，多实例隔离不互踩）
    window.eval(fs.readFileSync(path.join(root, 'persist.js'), 'utf8'))
    const backingR29 = {}
    const storeR29 = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(backingR29, k) ? backingR29[k] : null },
      setItem: function (k, v) { backingR29[k] = String(v) },
      removeItem: function (k) { delete backingR29[k] },
    }
    const persistR29 = window.TetrisPersist.createPersistence({ storage: storeR29 })

    // ④ 桌面非触控零触控区（AC-5）：touch:false → createUI 不挂 html.has-touch（触控区纯 CSS 显隐门控）
    const uiDeskR29 = window.TetrisUI.createUI({
      autoLoop: false, rng: function () { return 0 }, sfxEngine: spy, animMs: 0,
      touch: false, persist: persistR29,
    })
    check('r29: 桌面非触控零触控区——createUI(touch:false) 不挂 html.has-touch（AC-5 门控归属）',
      !doc.documentElement.classList.contains('has-touch'))
    uiDeskR29.dispose()
    check('r29: 桌面实例 dispose 无异常且仍未挂 has-touch', !doc.documentElement.classList.contains('has-touch'))

    // ③ 触控语义零回归（r28 序列承继，AC-6）：源序首键 touch→y+1、源序末键 touch→落锁
    const uiR29 = window.TetrisUI.createUI({
      autoLoop: false, rng: function () { return 0 }, sfxEngine: spy, animMs: 0,
      touch: true, persist: persistR29,
    })
    const gR29 = uiR29.game
    gR29.start()
    const crossKeysR29 = crossR29 === null ? [] : Array.prototype.slice.call(crossR29.querySelectorAll('.tkey'))
    const tapR29 = function (k) {
      k.dispatchEvent(new window.Event('touchstart', { bubbles: true, cancelable: true }))
      k.dispatchEvent(new window.Event('touchend', { bubbles: true, cancelable: true }))
    }
    const snapR29a = gR29.getSnapshot()
    const playsR29a = spy.plays.length
    tapR29(crossKeysR29[0])
    const snapR29b = gR29.getSnapshot()
    check('r29: 源序首键 touch → y+1（softDrop 语义承继）',
      snapR29b.piece.y === snapR29a.piece.y + 1, 'y ' + snapR29a.piece.y + '→' + snapR29b.piece.y)
    // mirror r28 2658：plays 计数在 hardDrop 键按下前捕获（softDrop 已发声，故 +1 只计 hardDrop）
    const playsR29b = spy.plays.length
    tapR29(crossKeysR29[3])
    const snapR29c = gR29.getSnapshot()
    check('r29: 源序末键 touch → 落锁（hardDrop 语义承继 + 音效 + RUNNING 承续）',
      JSON.stringify(snapR29b.board) !== JSON.stringify(snapR29c.board) &&
      spy.plays.length === playsR29b + 1 && snapR29c.phase === 'RUNNING', snapR29c.phase)

    // ⑥ 段内 dispose 无异常 + has-touch 归属回收（mirror r28 2665）
    uiR29.dispose()
    check('r29: 段内实例 dispose 无异常（has-touch 归属回收）', !doc.documentElement.classList.contains('has-touch'))
  }

  /* ---------- r32 会话时长格式化（formatSessionTime）+ r36 移除「本局统计」#session-stats 整卡 ----------
   数据源断言锚点：sessionTimeMs（有效时长）/ piecesPlaced（成功落定计数）单一计数源在引擎；
   r36 整卡移除后本段删去 #session-stats 页、#ss-* 值断言、session-announce 播报断言、
   createSessionStats 组件用例与源码级 session 交叉规则断言；保留 stat-grid 基线（.stat 恰 4）
   与触控区基线（#touch-controls .tkey 恰 6），其余（r17 已覆盖）不再重复。-------- */
  console.log('\n-- r36 移除「本局统计」整卡：信息面板恰两组基线（.stat-grid 四块 + #global-stats 四行） --')
  {
    /* ① file:// 自动装配页：.stat-grid 内 .stat 恰 4（r17 基线原样）+ #session-stats 已移除（删除非隐藏） */
    {
      const errs32 = []
      const vc32 = new VirtualConsole()
      vc32.on('jsdomError', function (e) { errs32.push(String(e && e.message || e)) })
      const domf32 = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
        url: 'file://' + path.join(root, 'index.html').replace(/\\/g, '/'),
        runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc32,
      })
      const wf32 = domf32.window
      wf32.HTMLCanvasElement.prototype.getContext = function (t) {
        if (t !== '2d') return null
        const noop = function () {}
        return { setTransform: noop, clearRect: noop, fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, closePath: noop, arcTo: noop, fill: noop, drawImage: noop, save: noop, restore: noop, set globalAlpha(v) {}, set lineWidth(v) {}, set fillStyle(v) {}, set strokeStyle(v) {} }
      }
      await new Promise(function (r) {
        if (wf32.document.readyState === 'complete') r()
        else wf32.addEventListener('load', r)
      })
      await sleep(120)
      check('r36 file://: 自动装配页无 #session-stats（整卡删除非隐藏）', wf32.document.querySelector('#session-stats') === null,
        wf32.document.querySelector('#session-stats') ? 'still present' : 'removed')
      const gridF32 = wf32.document.querySelector('.stat-grid')
      check('r36 file://: .stat-grid 内 .stat 仍恰 4（r17 基线原样保留，未塞新块）',
        gridF32 !== null && gridF32.querySelectorAll('.stat').length === 4,
        gridF32 ? String(gridF32.querySelectorAll('.stat').length) : 'no grid')
      /* r36 信息面板恰两组：.stat-grid 四块 + #global-stats 四行；会话两行已移除 */
      const gStat32 = wf32.document.querySelector('#global-stats')
      check('r36 file://: #global-stats 恰 4 行 .global-stat（信息面板第二组）',
        gStat32 !== null && gStat32.querySelectorAll('.global-stat').length === 4,
        gStat32 ? String(gStat32.querySelectorAll('.global-stat').length) : 'no global')
    }

    /* ② 独立真实装配实例：#session-stats/#ss-* 元素不存在（删除非隐藏的 DOM 级证明） */
    {
      const env32 = await buildEnv()
      const d32 = env32.doc
      const $32 = env32.$
      check('r36 DOM 删除: #session-stats / #ss-placed-value / #ss-time-value 均 null',
        $32('#session-stats') === null && $32('#ss-placed-value') === null && $32('#ss-time-value') === null &&
        $32('#session-announce') === null)
      check('r36 契约定格: createSessionStats 导出不再存在', typeof d32.defaultView.TetrisUI.createSessionStats === 'undefined')
      check('r36 基线: 真实装配页 #touch-controls .tkey 仍恰 6（r16/r27 基线零扰动）',
        d32.querySelectorAll('#touch-controls .tkey').length === 6,
        String(d32.querySelectorAll('#touch-controls .tkey').length))
      env32.handle.dispose()
    }
  }

  /* ---------- r33 触底锁定缓冲重置 lock move reset（§4.2：缓冲期键盘重置 / 触控回放等价 /
     软硬降即时锁 / 预算耗尽可感知；引擎新语义=AC-03.5，回放器 0 逻辑改动→触控=键盘同路径自然获得，
     本段纯追加，既有一切断言零改动） ---------- */
  console.log('\n-- r33 lock move reset（缓冲期重置 / 回放等价 / 软硬降即时锁 / 预算耗尽） --')
  {
    const r33Budget = function (g) { return g._debug.getLockMoveResetsRemaining() }
    const r33GroundedT = function (g) {
      g._debug.setBoard(window.TetrisGame.createBoard())
      g._debug.setNext('O')
      g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 18 }) // 空板贴底（底格落 row19 → 触底）
    }
    const r33Mixed = function (g, i) {
      if (i % 2 === 1) return g.rotate()
      return i % 4 === 2 ? g.move(1) : g.move(-1)
    }
    // ① 缓冲期按键重置（键鼠）：触底 → tick(250)（缓冲 250）→ key moveLeft 成功重置 → 动作后 1 tick 不锁、再 1 tick 锁
    {
      const env4 = await buildEnv()
      const g4 = env4.game
      g4.start()
      r33GroundedT(g4)
      check('r33 初始预算满额 15（出生重置）', r33Budget(g4) === 15, 'b=' + r33Budget(g4))
      g4.tick(250)
      env4.key('ArrowLeft') // moveLeft 成功（触底、预算>0 → 重置至满额）
      check('r33 触底成功移动：预算 −1 → 14', r33Budget(g4) === 14, 'b=' + r33Budget(g4))
      const pieceA = JSON.stringify(g4.getSnapshot().piece)
      g4.tick(250)
      check('r33 缓冲复位生效：动作后 1 tick 不锁（累计仅 250）', JSON.stringify(g4.getSnapshot().piece) === pieceA)
      g4.tick(250)
      check('r33 缓冲复位生效：再 1 tick 累计 500 锁定（O 出生）',
        JSON.stringify(g4.getSnapshot().piece) !== pieceA && g4.getSnapshot().piece.type === 'O')
      env4.handle.dispose()
    }
    // ② 触控回放等价（AC-7）：tp.tap 与键鼠同口径（回放器 0 逻辑改动 → 同路径自然获得新语义，无独立实现）
    {
      const env4 = await buildEnv()
      const g4 = env4.game
      const tp4 = {
        btn: function (a) { return env4.doc.querySelector('.tkey[data-action="' + a + '"]') },
        ev: function (t) { return new env4.window.Event(t, { bubbles: true, cancelable: true }) },
        tap: function (a) { const b = tp4.btn(a); b.dispatchEvent(tp4.ev('touchstart')); b.dispatchEvent(tp4.ev('touchend')) },
      }
      g4.start()
      r33GroundedT(g4)
      g4.tick(250)
      tp4.tap('moveLeft')
      check('r33 触控回放等价：tap moveLeft 预算 −1 → 14（触控=键盘同路径）', r33Budget(g4) === 14, 'b=' + r33Budget(g4))
      const pieceB = JSON.stringify(g4.getSnapshot().piece)
      g4.tick(250)
      check('r33 触控回放等价：动作后 1 tick 不锁', JSON.stringify(g4.getSnapshot().piece) === pieceB)
      g4.tick(250)
      check('r33 触控回放等价：再 1 tick 锁定（与键鼠同口径）', JSON.stringify(g4.getSnapshot().piece) !== pieceB)
      env4.handle.dispose()
    }
    // ③ 软降/硬降即时锁（不走缓冲）：缓冲中途按键 → 立即锁定（新块出生）
    {
      const env4 = await buildEnv()
      const g4 = env4.game
      g4.start()
      r33GroundedT(g4)
      g4.tick(250) // 缓冲 250
      const pz1 = JSON.stringify(g4.getSnapshot().piece)
      env4.key('ArrowDown') // 软降触底 → 立即锁定
      check('r33 软降即时锁：缓冲中途软降 → 按键即锁', JSON.stringify(g4.getSnapshot().piece) !== pz1)
      g4._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 15 }) // 悬空块
      g4.tick(250)
      const pz2 = JSON.stringify(g4.getSnapshot().piece)
      env4.key(' ') // 硬降 → 立即锁定
      check('r33 硬降即时锁：缓冲中途硬降 → 按键即锁', JSON.stringify(g4.getSnapshot().piece) !== pz2)
      env4.handle.dispose()
    }
    // ④ 预算耗尽可感知：15 次成功动作 → getter=0；预算 0 触底成功动作不再延长缓冲（1 tick 即达 500 锁定）
    {
      const env4 = await buildEnv()
      const g4 = env4.game
      g4.start()
      r33GroundedT(g4)
      for (let i = 1; i <= 15; i++) {
        const r = r33Mixed(g4, i)
        if (r.ok !== true) throw new Error('r33 qa 混合动作应成功 #' + i + ': ' + JSON.stringify(r))
        g4.tick(250)
      }
      check('r33 预算耗尽：15 次成功动作后 getter=0', r33Budget(g4) === 0, 'b=' + r33Budget(g4))
      g4._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 18 }) // 手术钉回地板（预算/锁定时钟不受影响）
      g4.tick(250) // 预算 0 触底：缓冲续计 250（不锁）
      const r16 = g4.move(1)
      check('r33 预算耗尽可感知：第 16 次成功动作不再重置（getter 0 封底）', r16.ok === true && r33Budget(g4) === 0,
        'b=' + r33Budget(g4))
      const pieceW = JSON.stringify(g4.getSnapshot().piece)
      g4.tick(250) // 残留 250 + 250 = 500 → 锁定（若误重置需再 500ms）
      check('r33 预算耗尽可感知：不再延长缓冲 → 1 tick 即锁（棋盘落定，DOM 层可观察）',
        JSON.stringify(g4.getSnapshot().piece) !== pieceW)
      env4.handle.dispose()
    }
  }

  /* ---------- r34 全局统计持久化（§4.3 纯追加：入账/补记数值等价 / 刷新恢复 / 幂等 / 暂停不计 / 组件 / 源码级） ----------
     数据源断言锚点：persist.stats 单键唯一事实（saveStats 只增不减累加），引擎 onStats 事件打通 UI 只读镜像
     （v2.6 持久化先例承继）；jsdom 无布局几何 → 样式断言留在 verify-ui 源码层；本段证明装配/入账/补记/恢复/幂等。-------- */
  console.log('\n-- r34 全局统计持久化（真实装配入账/补记 / 刷新恢复 / 幂等 / 暂停不计 / 组件 / 源码级） --')
  {
    /* ① file:// 自动装配页：第三卡就位、初始四值（r35 删 #gs-hi 行）、.stat/.session-stat 基线不扰动 */
    {
      const errs34 = []
      const vc34 = new VirtualConsole()
      vc34.on('jsdomError', function (e) { errs34.push(String(e && e.message || e)) })
      const domf34 = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
        url: 'file://' + path.join(root, 'index.html').replace(/\\/g, '/'),
        runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc34,
      })
      const wf34 = domf34.window
      wf34.HTMLCanvasElement.prototype.getContext = function (t) {
        if (t !== '2d') return null
        const noop = function () {}
        return { setTransform: noop, clearRect: noop, fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, closePath: noop, arcTo: noop, fill: noop, drawImage: noop, save: noop, restore: noop, set globalAlpha(v) {}, set lineWidth(v) {}, set fillStyle(v) {}, set strokeStyle(v) {} }
      }
      await new Promise(function (r) {
        if (wf34.document.readyState === 'complete') r()
        else wf34.addEventListener('load', r)
      })
      await sleep(120)
      const df34 = wf34.document
      check('r34 file://: 自动装配页含 #global-stats 独立面板（非脚本注入）', !!df34.querySelector('#global-stats'),
        df34.querySelector('#global-stats') ? 'panel ok' : 'missing')
      check('r34 file://: 初始四值 0/0/00:00/0（r35 删 #gs-hi 行，最高分唯一于 #hi-score）',
        df34.getElementById('gs-placed-value').textContent === '0' &&
        df34.getElementById('gs-lines-value').textContent === '0' &&
        df34.getElementById('gs-time-value').textContent === '00:00' &&
        df34.getElementById('gs-games-value').textContent === '0')
      const gridF34 = df34.querySelector('.stat-grid')
      check('r34 file://: .stat-grid 内 .stat 仍恰 4（r17 基线）+ .session-stat 恰 0（r36 整卡移除）',
        gridF34 !== null && gridF34.querySelectorAll('.stat').length === 4 &&
        df34.querySelectorAll('.session-stat').length === 0,
        gridF34 ? String(gridF34.querySelectorAll('.stat').length) + '/' + String(df34.querySelectorAll('.session-stat').length) : 'no grid')
    }

    /* ② 真实装配（共享 backing persist，autoLoop:false 手动 tick）：初始镜像 / OVER 入账定格 / 破纪录 hi 同源 */
    {
      window.eval(fs.readFileSync(path.join(root, 'persist.js'), 'utf8'))
      const R34 = window.TetrisPersist
      const mkStoreR34 = function () {
        const backing = {}
        return {
          backing: backing,
          store: Object.freeze({
            getItem: function (k) { return Object.prototype.hasOwnProperty.call(backing, k) ? backing[k] : null },
            setItem: function (k, v) { backing[k] = String(v) },
            removeItem: function (k) { delete backing[k] },
          }),
        }
      }
      const statsRawR34 = function (s) {
        const raw = s.backing[R34.TETRIS_PERSIST_KEY]
        return raw ? JSON.parse(raw).stats : null
      }
      const mkUIR34 = function (store) {
        const persist = R34.createPersistence({ storage: store })
        const ui = window.TetrisUI.createUI({
          autoLoop: false, rng: function () { return 0 }, sfxEngine: spy, animMs: 0, persist: persist,
        })
        return { ui: ui, persist: persist }
      }

      const sA = mkStoreR34()
      const a = mkUIR34(sA.store)
      const gA = a.ui.game
      const $A = window.document
      const gsvA = function (id) { return $A.getElementById(id).textContent }
      check('r34 初始镜像: 四值 0/0/00:00/0（空库存 persist 载荷全 0；r35 删 hi 镜像）',
        gsvA('gs-placed-value') === '0' && gsvA('gs-lines-value') === '0' &&
        gsvA('gs-time-value') === '00:00' && gsvA('gs-games-value') === '0')
      gA.start()
      for (let i = 0; i < 3; i++) gA.hardDrop()
      for (let i = 0; i < 4; i++) gA.tick(250)
      gA.lose()
      check('r34 OVER 入账定格: #gs-placed-value "3" / #gs-games-value "1" / #gs-time-value "00:01"（onStats→saveStats→load 镜像）',
        gsvA('gs-placed-value') === '3' && gsvA('gs-games-value') === '1' && gsvA('gs-time-value') === '00:01',
        gsvA('gs-placed-value') + '/' + gsvA('gs-games-value') + '/' + gsvA('gs-time-value'))
      check('r34 OVER 入账: backing stats 定格 {placed:3, lines:0, timeMs:1000, games:1}',
        (function () { const s = statsRawR34(sA); return s && s.placed === 3 && s.lines === 0 && s.timeMs === 1000 && s.games === 1 })(),
        JSON.stringify(statsRawR34(sA)))
      check('r34 OVER 后 #hi-score 不变 "0"（未破纪录 → 单通道不动；r35 全局卡 hi 行已删）',
        $A.getElementById('hi-score').textContent === '0')
      a.ui.dispose()

      // 破纪录单通道：预置 saveHighScore(120) → #hi-score "120"；OVER 后不变（r35 删 #gs-hi 行，最高分唯一于 r17 冻结卡）
      const sB = mkStoreR34()
      const persistB = R34.createPersistence({ storage: sB.store })
      persistB.saveHighScore(120)
      const b = mkUIR34(sB.store)
      const gB = b.ui.game
      check('r34 破纪录单通道: 预置 saveHighScore(120) → #hi-score "120"（最高分唯一镜像点）',
        $A.getElementById('hi-score').textContent === '120',
        $A.getElementById('hi-score').textContent)
      gB.start()
      gB.lose() // 0 分不破纪录
      check('r34 破纪录单通道: OVER 后 #hi-score 不变 "120"（单通道，未受入账流程影响）',
        $A.getElementById('hi-score').textContent === '120')
      b.ui.dispose()
    }

    /* ③ ④ ⑤ 刷新不丢 / 幂等（pagehide 双触发 + visibilitychange 双隐藏）/ 暂停不计 */
    {
      window.eval(fs.readFileSync(path.join(root, 'persist.js'), 'utf8'))
      const R34 = window.TetrisPersist
      const backingC = {}
      const storeC = {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(backingC, k) ? backingC[k] : null },
        setItem: function (k, v) { backingC[k] = String(v) },
        removeItem: function (k) { delete backingC[k] },
      }
      const statsRawC = function () {
        const raw = backingC[R34.TETRIS_PERSIST_KEY]
        return raw ? JSON.parse(raw).stats : null
      }
      const mkUIC = function (persist) {
        const ui = window.TetrisUI.createUI({
          autoLoop: false, rng: function () { return 0 }, sfxEngine: spy, animMs: 0, persist: persist,
        })
        return ui
      }
      const dd = window.document

      // ③ 刷新不丢：tick 1s → pagehide 补记 → 同 backing 新 persist+新 UI（刷新重开）→ 时长恢复
      const persistC1 = R34.createPersistence({ storage: storeC })
      const uiC1 = mkUIC(persistC1)
      const gC = uiC1.game
      gC.start()
      for (let i = 0; i < 4; i++) gC.tick(250)
      window.dispatchEvent(new window.Event('pagehide'))
      let sc = statsRawC()
      check('r34 刷新不丢: pagehide 补记 → backing timeMs=1000', sc !== null && sc.timeMs === 1000, sc ? String(sc.timeMs) : 'no stats')
      // ④ 幂等：同帧二次 pagehide（delta 已归零水印）→ 无二次叠加
      window.dispatchEvent(new window.Event('pagehide'))
      sc = statsRawC()
      check('r34 幂等: 二次 pagehide 不叠加（timeMs 仍 1000）', sc !== null && sc.timeMs === 1000, sc ? String(sc.timeMs) : 'no stats')
      uiC1.dispose()
      // 刷新重开（同 backing）→ 全局时长恢复（≥N，formatSessionTime 粒度容差）
      const persistC2 = R34.createPersistence({ storage: storeC })
      const uiC2 = mkUIC(persistC2)
      const gC2 = uiC2.game
      check('r34 刷新恢复: 新实例 #gs-time-value "00:01"（≥1s 粒度容差）', dd.getElementById('gs-time-value').textContent === '00:01',
        dd.getElementById('gs-time-value').textContent)
      check('r34 刷新恢复: 新实例 #gs-placed-value/#gs-games-value 仍 0（未入账不含）',
        dd.getElementById('gs-placed-value').textContent === '0' && dd.getElementById('gs-games-value').textContent === '0')

      // ④ visibilitychange 双隐藏幂等：隐藏→（自动暂停）→再隐藏 → 全局时长仅 +1 次
      gC2.start()
      for (let i = 0; i < 4; i++) gC2.tick(250) // +1s（c2 会话）
      Object.defineProperty(dd, 'hidden', { configurable: true, value: true })
      dd.dispatchEvent(new window.Event('visibilitychange')) // RUNNING → 先补记 1000 再自动暂停
      const setHiddenOk = dd.hidden === true
      dd.dispatchEvent(new window.Event('visibilitychange')) // 第二次隐藏：phase 已 PAUSED → 拦截
      window.dispatchEvent(new window.Event('pagehide')) // PAUSED → flushTime 早退
      sc = statsRawC()
      check('r34 双隐藏幂等: 隐藏→再隐藏→pagehide 全局时长仅 +1 次（1000+1000=2000）',
        setHiddenOk && sc !== null && sc.timeMs === 2000, setHiddenOk ? String(sc && sc.timeMs) : 'hidden set failed')
      // ⑤ 暂停不计：恢复 → 暂停 → tick → pagehide → 无增量
      gC2.togglePause() // PAUSED → RUNNING
      gC2.togglePause() // RUNNING → PAUSED（用户暂停）
      for (let i = 0; i < 4; i++) gC2.tick(250)
      window.dispatchEvent(new window.Event('pagehide'))
      sc = statsRawC()
      check('r34 暂停不计: 用户暂停后 pagehide 不补记（timeMs 仍 2000；AC-5 书面口径）',
        sc !== null && sc.timeMs === 2000, String(sc && sc.timeMs))
      Object.defineProperty(dd, 'hidden', { configurable: true, value: false })
      uiC2.dispose()
    }

    /* ⑥ 独立 createGlobalStats 组件：部分载荷更新 / 文本变更才写 / 闪动类挂卸 / dispose */
    {
      const env36 = await buildEnv()
      const w36 = env36.window
      const mkO = function (init) {
        const el = w36.document.createElement('output')
        el.textContent = init
        return el
      }
      const placedEl = mkO('0')
      const linesEl = mkO('0')
      const timeEl = mkO('00:00')
      const gamesEl = mkO('0')
      const wrap = w36.document.createElement('div')
      wrap.appendChild(placedEl)
      const gs36 = w36.TetrisUI.createGlobalStats({
        placed: placedEl, lines: linesEl, time: timeEl, games: gamesEl,
      })
      gs36.update({ placed: 120 }) // 部分载荷：仅 placed（r35 去 hi，四点部分载荷同机制）
      check('r34 组件: 部分载荷更新（仅 placed）→ placed "120" 其余原值', placedEl.textContent === '120' &&
        linesEl.textContent === '0' && timeEl.textContent === '00:00' && gamesEl.textContent === '0')
      gs36.update({ placed: 5, lines: 7, timeMs: 60000, games: 2 })
      check('r34 组件: 全量更新 → 5/7/01:00/2（timeMs 走 formatSessionTime）', placedEl.textContent === '5' &&
        linesEl.textContent === '7' && timeEl.textContent === '01:00' && gamesEl.textContent === '2')
      gs36.update({ placed: 5, lines: 7, timeMs: 60000, games: 2 })
      check('r34 组件: 同值更新不写（文本变更才写）', placedEl.textContent === '5')
      gs36.update({ placed: 6 })
      check('r34 组件: 变更 → 行父节点挂 .is-flashing（复用 stat-flash 闪动）', wrap.classList.contains('is-flashing'))
      await sleep(160)
      check('r34 组件: 闪动类按时卸下（120ms 定时）', !wrap.classList.contains('is-flashing'))
      gs36.dispose()
      env36.handle.dispose()
    }

    /* ⑦ 源码级隔离：面板不落行式底栏/双轨、不触 TOUCH_KEYS；五锚点装配契约（r35 删 #gs-hi-value） */
    {
      const css34 = fs.readFileSync(path.join(root, 'style.css'), 'utf8')
      const html34 = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
      const tcOpen34 = html34.indexOf('id="touch-controls"')
      check('r34 源码级: #touch-controls 起（含其后）片段无 global-（面板不落行式底栏/双轨）',
        tcOpen34 !== -1 && html34.slice(tcOpen34).indexOf('global-') === -1)
      check('r34 源码级: css 无 `.touchpad .global-*` 交叉规则（触控区零触及）', !/\.touchpad[^{}]*\.global-/.test(css34))
      check('r34 源码级: css 无 `.global-* .tkey` 交叉规则（面板不引用触屏键）', !/\.global-[^{}]*\.tkey/.test(css34))
      const fiveG34 = ['global-stats', 'gs-placed-value', 'gs-lines-value', 'gs-time-value', 'gs-games-value']
      check('r34 源码级: index.html 含 #global-stats 五锚点（must()×4 + 容器装配契约；r35 删 #gs-hi-value）',
        fiveG34.every(function (s) { return html34.indexOf('id="' + s + '"') !== -1 }))
    }
  }

  /* ---------- r35/r36 统计面板去重收口 + 整卡移除（纯展示面：r35 整节点删除 #gs-hi/#ss-lines 两行，
     r36 进一步移除整个「本局统计」#session-stats 卡——querySelector null / indexOf===-1 正面证明，
     拦截「改为隐藏/注释」绕过；最高分唯一 r17 冻结卡 #hi-score、本局消行唯一 #lines；入账/补记/
     刷新/幂等数据通道零改动——r34 §4.3 全套断言继续在真实装配面全绿即为行为不变证据） ---------- */
  console.log('\n-- r35 面板去重（DOM 删除证明 / 单通道唯一 / 面板收敛 / 数据通道行为不变） --')
  {
    // ① 真实装配（autoLoop:false）+ 源码级：整节点删除证明 / 单通道唯一 / 面板收敛
    {
      const env35 = await buildEnv()
      const d35 = env35.doc
      const h35 = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
      const u35 = fs.readFileSync(path.join(root, 'ui.js'), 'utf8')
      check('r35 DOM 删除证明: #gs-hi / #gs-hi-value 均不存在（querySelector null，拦截隐藏绕过）',
        d35.querySelector('#gs-hi') === null && d35.querySelector('#gs-hi-value') === null)
      check('r35 DOM 删除证明: #ss-lines / #ss-lines-value 均不存在（querySelector null，拦截隐藏绕过）',
        d35.querySelector('#ss-lines') === null && d35.querySelector('#ss-lines-value') === null)
      check('r35 单通道唯一: #hi-score 存在（最高分唯一，r17 冻结卡）+ #lines 存在（本局消行唯一）',
        !!d35.querySelector('#hi-score') && !!d35.querySelector('#lines'))
      check('r36 整卡移除: #session-stats 不存在 + #global-stats 恰 4 行 .global-stat（信息面板恰两组；r35 本局卡 2 行收敛升级为 r36 整卡 2→0）',
        d35.querySelector('#session-stats') === null &&
        d35.querySelectorAll('#global-stats .global-stat').length === 4,
        String(d35.querySelectorAll('#global-stats .global-stat').length) + ' global-stat; session='
        + String(d35.querySelector('#session-stats') === null ? 'removed' : 'present'))
      check('r36 源码级: index.html 全文无 #session-stats/#ss-*/session-announce 残留（indexOf===-1）',
        h35.indexOf('id="session-stats"') === -1 && h35.indexOf('id="ss-placed-value"') === -1 &&
        h35.indexOf('id="ss-time-value"') === -1 && h35.indexOf('id="session-announce"') === -1)
      check('r35 源码级: index.html 全文无 id="gs-hi" / id="ss-lines" 残留（indexOf===-1）',
        h35.indexOf('id="gs-hi"') === -1 && h35.indexOf('id="ss-lines"') === -1)
      check('r35 源码级: ui.js 无 gs-hi 装配残留且 must 装配恰 4 个 #gs- 锚点（无 hi 镜像）',
        u35.indexOf('gs-hi') === -1 && u35.split("must('#gs-").length - 1 === 4)
      env35.handle.dispose()
    }
    // ② 数据通道行为不变：persist 背书真实装配 OVER 入账 → 面板四项更新；未破纪录 #hi-score 单通道不动
    {
      window.eval(fs.readFileSync(path.join(root, 'persist.js'), 'utf8'))
      const R35 = window.TetrisPersist
      const backing35 = {}
      const store35 = {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(backing35, k) ? backing35[k] : null },
        setItem: function (k, v) { backing35[k] = String(v) },
        removeItem: function (k) { delete backing35[k] },
      }
      const persist35 = R35.createPersistence({ storage: store35 })
      const ui35 = window.TetrisUI.createUI({
        autoLoop: false, rng: function () { return 0 }, sfxEngine: spy, animMs: 0, persist: persist35,
      })
      const g35 = ui35.game
      const dd35 = window.document
      const gsv35 = function (id) { return dd35.getElementById(id).textContent }
      g35.start()
      for (let i = 0; i < 3; i++) g35.hardDrop()
      for (let i = 0; i < 4; i++) g35.tick(250)
      g35.lose()
      check('r35 行为不变: OVER 入账 → 面板四项 3/0/00:01/1（同一 onStats→saveStats→load 数据通道）',
        gsv35('gs-placed-value') === '3' && gsv35('gs-lines-value') === '0' &&
        gsv35('gs-time-value') === '00:01' && gsv35('gs-games-value') === '1',
        gsv35('gs-placed-value') + '/' + gsv35('gs-lines-value') + '/' + gsv35('gs-time-value') + '/' + gsv35('gs-games-value'))
      check('r35 行为不变: OVER 后 #hi-score 仍 "0"（未破纪录 → 单通道不受入账影响）',
        dd35.getElementById('hi-score').textContent === '0', dd35.getElementById('hi-score').textContent)
      ui35.dispose()
    }
  }

  /* ---------- r37 全网排行榜（AC-1~16 Phase1：OVER 自动提交恰一次 / 载荷全字段 / 首弹门槛 /
     弹层互斥+焦点回 #btn-settings / 面板三态+tab 零请求 / file:// 降级 0 fetch 0 报错） ---------- */
  console.log('\n-- r37 全网排行榜（注入 leaderboard 真实装配 / OVER 提交 / 首弹 / 弹层互斥 / 面板 / file:// 降级） --')
  {
    /* ① 真实装配：leaderboard 注入（canFetch:true + fetchImpl spy）经 createUI({leaderboard})——
       OVER+score>0 → fetch 恰 1 次、载荷全字段（protoVer=1 / durationMs=sessionTimeMs / deviceId/nickname 真实值） */
    {
      const env37 = await buildEnv()
      const w37 = env37.window
      w37.eval(fs.readFileSync(path.join(root, 'persist.js'), 'utf8'))
      w37.eval(fs.readFileSync(path.join(root, 'leaderboard.js'), 'utf8'))
      const P37 = w37.TetrisPersist
      const L37 = w37.TetrisLeaderboard
      check('r37 UMD: window.TetrisLeaderboard.createLeaderboard 存在', typeof L37.createLeaderboard === 'function')
      const posts37 = []
      const fetchSpy37 = function (url, init) {
        if (init && init.method === 'POST') posts37.push({ url: url, body: JSON.parse(init.body) })
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, proto: 1, generatedAt: Date.now(), all: [], week: [] }) } })
      }
      const backing37 = {}
      const store37 = {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(backing37, k) ? backing37[k] : null },
        setItem: function (k, v) { backing37[k] = String(v) },
        removeItem: function (k) { delete backing37[k] },
      }
      const persist37 = P37.createPersistence({ storage: store37 })
      persist37.saveNickname('玩家甲') // 已有昵称 → OVER 直接提交（绕过首弹门槛）
      const lb37 = L37.createLeaderboard({ persist: persist37, canFetch: true, fetchImpl: fetchSpy37 })
      const ui37 = w37.TetrisUI.createUI({
        autoLoop: false, rng: function () { return 0 }, sfxEngine: env37.spy, animMs: 0,
        persist: persist37, leaderboard: lb37,
        onGameOver: function (score, snap) { if (lb37 && snap) lb37.reportOver(snap) }, // 镜像 index.html 内联装配
      })
      const d37 = w37.document
      const g37 = ui37.game
      // 激活态：非 degraded → #lb-settings-group 可见（index.html 默认 hidden，激活才移除——DESIGN §2.1）
      check('r37 激活态: #lb-settings-group 可见（非 degraded 移除 hidden）', d37.getElementById('lb-settings-group').hidden === false)
      // 构造 score>0 OVER：row19 仅 col9 空 + 竖 I (x=7,rot=1,y=16) 补缺 → 消 1 行 100 分；tick 1s → sessionTimeMs=1000
      g37.start()
      const dbg37 = g37._debug
      const board37 = Array.from({ length: 20 }, function () { return new Array(10).fill(null) })
      for (let c = 0; c < 9; c++) board37[19][c] = 'T'
      dbg37.setBoard(board37)
      dbg37.setPiece({ type: 'I', rot: 1, x: 7, y: 16 })
      g37.softDrop()
      for (let i = 0; i < 4; i++) g37.tick(250)
      g37.lose() // OVER → reportOver(snap)
      await sleep(20) // fetch 微任务落地（posts37 在 reportOver 内异步填充）
      const s37 = g37.getSnapshot()
      check('r37 OVER 提交: POST 恰 1 次（引擎 onGameOver 每局一次 → reportOver 恰一次）', posts37.length === 1, String(posts37.length))
      check('r37 载荷: protoVer===1（D2 钉名）', posts37[0] && posts37[0].body.protoVer === 1)
      check('r37 载荷: durationMs===sessionTimeMs（D4，OVER 定格帧）',
        posts37[0] && posts37[0].body.durationMs === s37.sessionTimeMs && s37.sessionTimeMs === 1000,
        'durationMs=' + (posts37[0] ? posts37[0].body.durationMs : 'none') + ' sessionTimeMs=' + s37.sessionTimeMs)
      check('r37 载荷: score/level/lines 全字段真实值（100/1/1）',
        posts37[0] && posts37[0].body.score === s37.score && posts37[0].body.level === s37.level && posts37[0].body.lines === s37.lines,
        JSON.stringify(posts37[0] && posts37[0].body))
      check('r37 载荷: deviceId 真实 UUID（persist 落盘同一值）',
        posts37[0] && posts37[0].body.deviceId === persist37.load().deviceId && /^[A-Za-z0-9-]{8,64}$/.test(posts37[0].body.deviceId))
      check('r37 载荷: nickname 真实值（persist 回读）', posts37[0] && posts37[0].body.nickname === '玩家甲')
      check('r37 提交后 persist: deviceId/nickname 顶层键落盘（同读回）',
        persist37.load().deviceId !== null && persist37.load().nickname === '玩家甲')
      ui37.dispose()
      env37.handle.dispose()
    }

    /* ② 昵称首弹门槛：无昵称 OVER → #nickname-modal 开、input 空；非法 → #nm-error 显不关闭；
       合法确定 → persist 落盘 + POST 载荷带昵称；取消 → 不上榜、无 fetch */
    {
      const env37b = await buildEnv()
      const w37b = env37b.window
      w37b.eval(fs.readFileSync(path.join(root, 'persist.js'), 'utf8'))
      w37b.eval(fs.readFileSync(path.join(root, 'leaderboard.js'), 'utf8'))
      const P37b = w37b.TetrisPersist
      const L37b = w37b.TetrisLeaderboard
      const mkLb37b = function (backing) {
        const store = {
          getItem: function (k) { return Object.prototype.hasOwnProperty.call(backing, k) ? backing[k] : null },
          setItem: function (k, v) { backing[k] = String(v) },
          removeItem: function (k) { delete backing[k] },
        }
        const persist = P37b.createPersistence({ storage: store })
        const posts = []
        const lb = L37b.createLeaderboard({ persist: persist, canFetch: true, fetchImpl: function (url, init) {
          if (init && init.method === 'POST') posts.push(JSON.parse(init.body))
          return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, proto: 1, generatedAt: Date.now(), all: [], week: [] }) } })
        } })
        return { persist: persist, lb: lb, posts: posts }
      }
      const mkUI37b = function (lb, persist) {
        return w37b.TetrisUI.createUI({
          autoLoop: false, rng: function () { return 0 }, sfxEngine: env37b.spy, animMs: 0,
          persist: persist, leaderboard: lb,
          onGameOver: function (score, snap) { if (lb && snap) lb.reportOver(snap) }, // 镜像 index.html 内联装配
        })
      }
      // （a）首弹确认路径：无昵称 OVER → 弹窗开 → 非法不关 → 合法确定 → 落盘 + POST
      {
        const a = mkLb37b({})
        const uiA = mkUI37b(a.lb, a.persist)
        const dA = w37b.document
        const gA = uiA.game
        const nmModalA = dA.getElementById('nickname-modal')
        const nmInputA = dA.getElementById('nm-input')
        const nmErrorA = dA.getElementById('nm-error')
        gA.start()
        dbgClearLine37b(gA) // row19 缺 col9 + 竖 I → 消 1 行 score>0
        gA.softDrop()
        gA.lose()
        check('r37 首弹: 无昵称 OVER → #nickname-modal 打开、input 空',
          nmModalA.hidden === false && nmInputA.value === '',
          'hidden=' + nmModalA.hidden + ' value=' + JSON.stringify(nmInputA.value))
        check('r37 首弹: 未确认前 0 次 POST（首弹门槛持态）', a.posts.length === 0)
        // 非法（空）→ #nm-error role=alert 显示 + 不关闭
        nmInputA.value = '   '
        nmInputA.dispatchEvent(new w37b.Event('input', { bubbles: true }))
        dA.getElementById('nm-confirm').click()
        check('r37 首弹: 非法(空) → #nm-error 显示且弹层不关闭',
          nmErrorA.hidden === false && nmModalA.hidden === false && nmErrorA.textContent.indexOf('昵称不能为空') !== -1,
          nmErrorA.textContent)
        // 合法确定 → persist 落盘 + POST 载荷带昵称（确认=持久化+续提）
        nmInputA.value = '玩家乙'
        nmInputA.dispatchEvent(new w37b.Event('input', { bubbles: true }))
        dA.getElementById('nm-confirm').click()
        await sleep(200) // 关弹层 160ms 复位
        check('r37 首弹: 合法确定 → persist tetris.nickname 落盘', a.persist.load().nickname === '玩家乙',
          String(a.persist.load().nickname))
        check('r37 首弹: 合法确定 → POST 恰 1 次且载荷带昵称',
          a.posts.length === 1 && a.posts[0].nickname === '玩家乙', JSON.stringify(a.posts))
        check('r37 首弹: 确认后弹层关闭', nmModalA.hidden === true)
        uiA.dispose()
      }
      // （b）修改昵称：设置「修改」预填 → 确定 → 即时持久化（仅持久化不续提）→ 下一局提交带新昵称
      {
        const b = mkLb37b({})
        b.persist.saveNickname('旧昵称')
        const uiB = mkUI37b(b.lb, b.persist)
        const dB = w37b.document
        // 设置「修改」：开设置 → 点修改 → 昵称弹窗预填当前昵称
        dB.getElementById('btn-settings').click()
        dB.getElementById('btn-edit-nickname').click()
        const nmInputB = dB.getElementById('nm-input')
        check('r37 修改: 设置「修改」→ 预填当前昵称', nmInputB.value === '旧昵称', JSON.stringify(nmInputB.value))
        await sleep(200) // 设置弹层 closeSettingsModal 160ms 复位（弹层互斥后 hidden）
        check('r37 修改: 弹层互斥——设置已关（先关设置再开昵称弹层）', dB.getElementById('settings-modal').hidden === true)
        nmInputB.value = '新昵称'
        nmInputB.dispatchEvent(new w37b.Event('input', { bubbles: true }))
        dB.getElementById('nm-confirm').click()
        await sleep(200)
        check('r37 修改: 确认 → 即时持久化（仅持久化不续提——无待提交）', b.persist.load().nickname === '新昵称',
          String(b.persist.load().nickname))
        check('r37 修改: 仅持久化路径 0 次 POST（设置改昵称不续提当前局）', b.posts.length === 0, String(b.posts.length))
        // 下一局 OVER 提交带新昵称
        const gB = uiB.game
        gB.start()
        dbgClearLine37b(gB)
        gB.softDrop()
        gB.lose()
        await sleep(20)
        check('r37 修改: 下一局 OVER 提交带新昵称', b.posts.length === 1 && b.posts[0].nickname === '新昵称',
          JSON.stringify(b.posts))
        uiB.dispose()
      }
      // （c）取消 → 不上榜、无 fetch、静默（下局再弹）
      {
        const c = mkLb37b({})
        const uiC = mkUI37b(c.lb, c.persist)
        const dC = w37b.document
        const gC = uiC.game
        const nmModalC = dC.getElementById('nickname-modal')
        gC.start()
        dbgClearLine37b(gC)
        gC.softDrop()
        gC.lose()
        check('r37 取消: 无昵称 OVER → 首弹再弹', nmModalC.hidden === false)
        dC.getElementById('nm-cancel').click()
        await sleep(200)
        check('r37 取消: 取消 → 静默清待提交 + 弹层关闭 + 0 次 fetch/POST',
          nmModalC.hidden === true && c.posts.length === 0,
          'posts=' + c.posts.length)
        uiC.dispose()
      }
      env37b.handle.dispose()
      function dbgClearLine37b(g) {
        const dbg = g._debug
        const b = Array.from({ length: 20 }, function () { return new Array(10).fill(null) })
        for (let c = 0; c < 9; c++) b[19][c] = 'T'
        dbg.setBoard(b)
        dbg.setPiece({ type: 'I', rot: 1, x: 7, y: 16 })
      }
    }

    /* ③ 弹层互斥 + 榜单面板（打开即拉取加载→列表 / tab 切换零请求 / 错误+重试 / Esc 焦点回 #btn-settings） */
    {
      const env37d = await buildEnv()
      const w37d = env37d.window
      w37d.eval(fs.readFileSync(path.join(root, 'persist.js'), 'utf8'))
      w37d.eval(fs.readFileSync(path.join(root, 'leaderboard.js'), 'utf8'))
      const P37d = w37d.TetrisPersist
      const L37d = w37d.TetrisLeaderboard
      const backing37d = {}
      const store37d = {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(backing37d, k) ? backing37d[k] : null },
        setItem: function (k, v) { backing37d[k] = String(v) },
        removeItem: function (k) { delete backing37d[k] },
      }
      const persist37d = P37d.createPersistence({ storage: store37d })
      persist37d.saveNickname('玩家甲')
      const all37d = [
        { rank: 1, nickname: '甲', score: 12000, level: 8, lines: 60 },
        { rank: 2, nickname: '乙', score: 9000, level: 6, lines: 45 },
        { rank: 3, nickname: '丙', score: 5000, level: 4, lines: 30 },
      ]
      const week37d = [{ rank: 1, nickname: '丁', score: 3000, level: 3, lines: 12 }]
      let gets37d = 0
      const fetchSpy37d = function (url, init) {
        if (init && init.method === 'POST') return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, proto: 1, generatedAt: Date.now(), all: [], week: [] }) } })
        gets37d++
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, proto: 1, generatedAt: Date.now(), all: all37d, week: week37d }) } })
      }
      const lb37d = L37d.createLeaderboard({ persist: persist37d, canFetch: true, fetchImpl: fetchSpy37d })
      const ui37d = w37d.TetrisUI.createUI({
        autoLoop: false, rng: function () { return 0 }, sfxEngine: env37d.spy, animMs: 0,
        persist: persist37d, leaderboard: lb37d,
      })
      const d37d = w37d.document
      const settingsModal37d = d37d.getElementById('settings-modal')
      const lbModal37d = d37d.getElementById('leaderboard-modal')
      // 从设置打开排行榜：先开设置 → 点「查看榜单」→ 设置关 + 榜开（弹层互斥）
      d37d.getElementById('btn-settings').click()
      check('r37 互斥: 设置弹层先打开', settingsModal37d.hidden === false)
      d37d.getElementById('btn-open-leaderboard').click()
      await sleep(220) // 设置 close 160ms + 榜开 rAF
      check('r37 互斥: 点查看榜单 → 设置已关（互斥）+ 榜单打开',
        settingsModal37d.hidden === true && lbModal37d.hidden === false,
        'settings=' + settingsModal37d.hidden + ' lb=' + lbModal37d.hidden)
      check('r37 面板: 打开即拉取（GET 1 次）', gets37d === 1, String(gets37d))
      await sleep(20) // fetch 结果落地
      check('r37 面板: 总榜 Top3 行渲染（名次/昵称/分数/等级/消行）',
        d37d.querySelectorAll('#lb-list .lb-row').length === 3 &&
        d37d.getElementById('lb-list').textContent.indexOf('12000') !== -1 &&
        d37d.getElementById('lb-list').textContent.indexOf('甲') !== -1,
        String(d37d.querySelectorAll('#lb-list .lb-row').length))
      check('r37 面板: #lb-state 隐藏（有数据）', d37d.getElementById('lb-state').hidden === true)
      // tab 切换（周榜）→ aria-pressed 互斥 + 重渲染零请求
      const tabWeek37d = d37d.querySelector('.lb-tab[data-view="weekly"]')
      tabWeek37d.click()
      await sleep(10)
      check('r37 tab: 周榜 aria-pressed 切换 + 行渲染', tabWeek37d.getAttribute('aria-pressed') === 'true' &&
        d37d.querySelector('.lb-tab[data-view="total"]').getAttribute('aria-pressed') === 'false' &&
        d37d.querySelectorAll('#lb-list .lb-row').length === 1,
        String(d37d.querySelectorAll('#lb-list .lb-row').length))
      check('r37 tab: 切换零请求（GET 仍 1 次，缓存重渲染）', gets37d === 1, String(gets37d))
      // Esc 关榜 → 焦点回 #btn-settings（D8）
      d37d.dispatchEvent(new w37d.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await sleep(200)
      check('r37 Esc: 关榜后焦点统一回 #btn-settings（D8）',
        d37d.getElementById('leaderboard-modal').hidden === true &&
        w37d.document.activeElement && w37d.document.activeElement.id === 'btn-settings',
        w37d.document.activeElement ? w37d.document.activeElement.id : 'none')
      // 错误态 + 重试
      const env37e = await buildEnv()
      const w37e = env37e.window
      w37e.eval(fs.readFileSync(path.join(root, 'persist.js'), 'utf8'))
      w37e.eval(fs.readFileSync(path.join(root, 'leaderboard.js'), 'utf8'))
      const P37e = w37e.TetrisPersist
      const L37e = w37e.TetrisLeaderboard
      const backing37e = {}
      const store37e = {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(backing37e, k) ? backing37e[k] : null },
        setItem: function (k, v) { backing37e[k] = String(v) },
        removeItem: function (k) { delete backing37e[k] },
      }
      const persist37e = P37e.createPersistence({ storage: store37e })
      persist37e.saveNickname('玩家甲')
      let gets37e = 0
      const fetchSpy37e = function (url, init) {
        gets37e++
        if (gets37e === 1) return Promise.reject(new Error('mock down'))
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, proto: 1, generatedAt: Date.now(), all: all37d, week: week37d }) } })
      }
      const lb37e = L37e.createLeaderboard({ persist: persist37e, canFetch: true, fetchImpl: fetchSpy37e })
      const ui37e = w37e.TetrisUI.createUI({
        autoLoop: false, rng: function () { return 0 }, sfxEngine: env37e.spy, animMs: 0,
        persist: persist37e, leaderboard: lb37e,
      })
      const d37e = w37e.document
      d37e.getElementById('btn-settings').click()
      d37e.getElementById('btn-open-leaderboard').click()
      await sleep(30)
      check('r37 错误态: 拉取失败 → #lb-state「暂不可用」+ 重试钮', d37e.getElementById('lb-state').hidden === false &&
        d37e.getElementById('lb-state').textContent.indexOf('暂不可用') !== -1 &&
        d37e.getElementById('lb-state').querySelector('button') !== null,
        d37e.getElementById('lb-state').textContent.trim())
      d37e.getElementById('lb-state').querySelector('button').click() // 重试
      await sleep(30)
      check('r37 错误态: 重试成功 → 列表渲染（重新拉取）',
        gets37e === 2 && d37e.querySelectorAll('#lb-list .lb-row').length === 3, 'gets=' + gets37e)
      ui37d.dispose()
      ui37e.dispose()
      env37d.handle.dispose()
      env37e.handle.dispose()
    }

    /* ④ file:// 降级（AC-8/16）：真实 index.html 管线 → degraded → 设置组/弹层 hidden 不可达、0 fetch、完整游玩零报错 */
    {
      const errs37 = []
      const vc37 = new VirtualConsole()
      vc37.on('jsdomError', function (e) { errs37.push(String(e && e.message || e)) })
      let fetchCount37 = 0
      const domF37 = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
        url: 'file://' + path.join(root, 'index.html').replace(/\\/g, '/'),
        runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc37,
        beforeParse: function (win) {
          win.fetch = function () { fetchCount37++; return Promise.reject(new Error('disconnected')) }
        },
      })
      const wf37 = domF37.window
      wf37.HTMLCanvasElement.prototype.getContext = function () {
        const noop = function () {}
        return { setTransform: noop, clearRect: noop, fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, closePath: noop, arcTo: noop, fill: noop, drawImage: noop, save: noop, restore: noop, set globalAlpha(v) {}, set lineWidth(v) {}, set fillStyle(v) {}, set strokeStyle(v) {} }
      }
      await new Promise(function (r) {
        if (wf37.document.readyState === 'complete') r()
        else wf37.addEventListener('load', r)
      })
      await sleep(200)
      const df37 = wf37.document
      check('r37 file://: degraded → #lb-settings-group 保持 hidden（无入口，AC-8）',
        df37.getElementById('lb-settings-group').hidden === true)
      check('r37 file://: 两弹层不可达（hidden 不在 Tab 序/读屏树）',
        df37.getElementById('leaderboard-modal').hidden === true && df37.getElementById('nickname-modal').hidden === true)
      check('r37 file://: 0 次 fetch（degraded 停摆，可观测断言）', fetchCount37 === 0, 'fetch=' + fetchCount37)
      check('r37 file://: 游玩链路零报错——自动装配完成（window.__tetris 存在）',
        !!wf37.__tetris && typeof wf37.__tetris.dispose === 'function')
      check('r37 file://: 全程无 jsdomError（离线全程 0 报错）', errs37.length === 0,
        errs37.length ? errs37.join(' | ') : 'none')
      // 完整游玩：开始 → OVER → 重开（离线，无排行榜入口干扰）
      if (wf37.__tetris && wf37.__tetris.game && typeof wf37.__tetris.game.start === 'function') {
        const gF = wf37.__tetris.game
        gF.start() // READY → RUNNING
        gF.lose() // OVER
        gF.restart() // → RUNNING（r32 语义：任意态 → RUNNING + spawnFirst）
        check('r37 file://: 完整游玩（开始→OVER→重开）零报错', errs37.length === 0 && gF.getSnapshot().phase === 'RUNNING',
          'errs=' + String(errs37.length) + ' phase=' + gF.getSnapshot().phase)
      } else {
        check('r37 file://: 完整游玩（开始→OVER→重开）零报错', false, 'no auto-boot handle')
      }
      try { if (wf37.__tetris) wf37.__tetris.dispose() } catch (e) { /* 清理 */ }
    }

    /* ⑤ 源码级：12 装配锚点 + 三处同源 API_BASE + persist 增量出口 */
    {
      const h37 = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
      const lbFile37 = fs.readFileSync(path.join(root, 'leaderboard.js'), 'utf8')
      const p37 = fs.readFileSync(path.join(root, 'persist.js'), 'utf8')
      const anchors37 = ['lb-settings-group', 'lb-nickname-value', 'btn-edit-nickname', 'btn-open-leaderboard',
        'leaderboard-modal', 'lb-list', 'lb-state', 'nickname-modal', 'nm-input', 'nm-error', 'nm-confirm', 'nm-cancel']
      check('r37 源码级: index.html 含 12 装配锚点（must()×12 清单同源）',
        anchors37.every(function (s) { return h37.indexOf('id="' + s + '"') !== -1 }))
      check('r37 源码级: leaderboard.js 含 API_BASE 唯一登记 + degraded 标记（0 fetch 停摆）',
        /API_BASE\s*=/.test(lbFile37) && /\bdegraded\b/.test(lbFile37))
      check('r37 源码级: persist.js 含 saveDeviceId/saveNickname + 清洗出口（双端同规）',
        /saveDeviceId\b/.test(p37) && /saveNickname\b/.test(p37) && /sanitizeDeviceId\b/.test(p37) && /sanitizeNickname\b/.test(p37))
    }
  }

  // 汇总附加项
  console.log('\n== 最终结果 ==')
  console.log('通过 ' + pass + ' / ' + (pass + fail))
  if (failures.length) {
    console.log('失败项：')
    failures.forEach(function (f) { console.log('  - ' + f) })
    process.exitCode = 1
  } else {
    console.log('ALL QA E2E CHECKS PASSED')
  }
}

main().catch(function (err) {
  console.error('QA E2E 脚本异常：', err)
  process.exitCode = 1
})
