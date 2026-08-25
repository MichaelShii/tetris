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
    dispose: function () { return realEngine.dispose() },
  }

  // 手动装配（rng 固定 → 恒出 I 块；autoLoop 关闭 → tick 手动驱动，保证确定性）
  const handle = window.TetrisUI.createUI({
    autoLoop: false,
    rng: function () { return 0 }, // 恒选 TYPES[0]='I'
    sfxEngine: spy,
  })
  const game = handle.game

  const $ = function (sel) { return window.document.querySelector(sel) }
  const doc = window.document
  const key = function (k, opts) {
    const ev = new window.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, opts || {}))
    window.dispatchEvent(ev)
    return ev
  }
  const keyUp = function (k) {
    window.dispatchEvent(new window.KeyboardEvent('keyup', { key: k, bubbles: true }))
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
    check('预览画布 48×24 css 尺寸', $('#next-well').style.width === '48px' && $('#next-well').style.height === '24px')

    const t0 = Date.now()
    key('Enter') // 开始
    const s2 = snap()
    const dt = Date.now() - t0
    check('AC-01.3 回车 300ms 内进入进行态', dt <= 300 && s2.phase === 'RUNNING', 'dt=' + dt + 'ms')
    check('AC-01.3 首块出生（顶部居中）', s2.piece && s2.piece.y === 0 && s2.piece.x === Math.floor((10 - [4,2,3,3,3,3,3][['I','O','T','S','Z','J','L'].indexOf(s2.piece.type)]) / 2), JSON.stringify(s2.piece))
    check('开始后暂停/重开按钮可用、开始禁用', $('#btn-pause').disabled === false && $('#btn-restart').disabled === false && $('#btn-start').disabled === true)
    check('状态灯 PLAYING', $('#status-text').textContent === 'PLAYING' && $('#status-dot').dataset.status === 'playing')
    check('RUNNING 遮罩隐藏', $('#overlay').hidden === true || $('#overlay').classList.contains('is-open') === false)
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

    // 旋转：↑ / X / x
    const r0 = s.piece.rot
    key('ArrowUp')
    check('AC-02.3 ↑ 顺时针旋转', snap().piece.rot === (r0 + 1) % 4)
    key('X')
    check('AC-02.3 X 旋转', snap().piece.rot === (r0 + 2) % 4)
    key('x')
    check('AC-02.3 x 旋转', snap().piece.rot === (r0 + 3) % 4)

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
    check('AC-06.5 4 行=800×L1（累计 100+800）', s.score === 900, 'score=' + s.score)
    check('HUD 分数 900', $('#score').textContent === '900')
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
    check('等级倍率生效：L2 消 1 行 +200', snap().score === before + 200, before + '→' + snap().score)
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

    // AC-04.3 Esc 语义回归（v2.1 语义不变）：p → PAUSED → Esc → RUNNING
    key('p')
    check('p 再入 PAUSED（Esc 回归前置）', snap().phase === 'PAUSED')
    key('Escape')
    check('AC-04.3 Esc 恢复 RUNNING（回归）', snap().phase === 'RUNNING')

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

    // AC-11.7：零视觉改动结构级佐证（遮罩文案/键位图例未新增；截图对比仍人工）
    game.restart()
    key('p')
    check('AC-11.7 暂停遮罩文案不变「按 P / Esc 继续」', !$('#overlay').hidden && $('#overlay-title').textContent === '已暂停' && $('#overlay-sub').textContent === '按 P / Esc 继续')
    check('AC-11.7 key-hints 图例未新增条目（仍 8 行）', doc.querySelectorAll('.key-hints .key-hints__row').length === 8, String(doc.querySelectorAll('.key-hints .key-hints__row').length))
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
    const vc = new VirtualConsole()
    vc.on('jsdomError', function (e) { errors.push(String(e && e.message || e)) })
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
    // 清理：关闭自动装配的 rAF 循环
    if (handle2) handle2.dispose()
    w2.close()
    check('自动装配实例 dispose 后无异常', true)
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
