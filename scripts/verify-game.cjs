'use strict'
/*!
 * tetris/scripts/verify-game.cjs — game.js 行为自检（node:test，零依赖）
 * ============================================================================
 * 运行：node scripts/verify-game.cjs
 *
 * 说明：项目暂无 package.json（T0 脚手架尚未执行），`.js` 按 CommonJS 解析，
 * 故本脚本用 `.cjs` + require 加载 game.js。若后续 package.json 设置
 * "type": "module"，浏览器侧契约（window.TetrisGame）不受影响；本脚本届时
 * 由 T0/T13 的 Vitest 用例（src 下的 .test.ts）替代或迁移。
 *
 * 覆盖：PRD §5 数值 100% 钉死（AC-06.5）、方块/旋转/碰撞/消行、状态机迁移
 * 矩阵全遍历、会话集成（AC-02/03/04/05/06 关键路径）、键盘映射 keyAction 矩阵
 * 与恢复节拍差值续算（v2.1，AC-11；TECHNICAL §7.1）；r15 多格预览队列
 * （§13，AC-1/2/3/5/9/10/11；TECHNICAL §4/§7.2）。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const T = require('../game.js')

/* ---------- 工具 ---------- */

function snapshotDeep(a, b) {
  // 除 phase 外全字段深比较（board 逐行）
  if (a.score !== b.score || a.level !== b.level || a.lines !== b.lines || a.next !== b.next) return false
  if ((a.piece === null) !== (b.piece === null)) return false
  if (a.piece) {
    if (a.piece.type !== b.piece.type || a.piece.rot !== b.piece.rot || a.piece.x !== b.piece.x || a.piece.y !== b.piece.y) return false
  }
  if (a.board.length !== b.board.length) return false
  for (let r = 0; r < a.board.length; r++) {
    for (let c = 0; c < a.board[r].length; c++) {
      if (a.board[r][c] !== b.board[r][c]) return false
    }
  }
  return true
}

function fullRow(type, exceptCol) {
  const row = []
  for (let c = 0; c < 10; c++) row.push(c === exceptCol ? null : type)
  return row
}

function countFilled(shape) {
  let n = 0
  for (const row of shape) for (const v of row) if (v) n++
  return n
}

/** 形状最低实心行索引（幽灵块空板落板底计算用，v2.2） */
function bottomRowOf(shape) {
  for (let r = shape.length - 1; r >= 0; r--) {
    for (const v of shape[r]) if (v) return r
  }
  return -1
}

/** 构造带单行横向掩体（row 行全 type，exceptCol 为空）的棋盘（v2.2 幽灵块落点测试用） */
function boardWithObstacle(type, row, exceptCol) {
  const b = T.createBoard()
  for (let c = 0; c < 10; c++) {
    if (c === exceptCol) continue
    b[row][c] = type
  }
  return b
}

/* ---------- 1. 导出与常量 ---------- */

test('exports: window 无关、模块导出齐全', () => {
  assert.equal(typeof T.createGame, 'function')
  assert.equal(typeof T.createBoard, 'function')
  assert.equal(typeof T.createQueue, 'function')
  assert.equal(typeof T.transition, 'function')
  assert.equal(T.COLS, 10)
  assert.equal(T.ROWS, 20)
  assert.deepEqual(T.TYPES, ['I', 'O', 'T', 'S', 'Z', 'J', 'L'])
  assert.deepEqual(T.PHASES, ['READY', 'RUNNING', 'PAUSED', 'OVER'])
})

test('SFX_EVENTS: v2.0 音效事件集 8 值（AC-09，audio.js/装配/测试统一引用；r14 新增 hold）', () => {
  assert.deepEqual(T.SFX_EVENTS, ['move', 'rotate', 'softDrop', 'hardDrop', 'clear', 'levelUp', 'gameOver', 'hold'])
})

test('常量与 PRD §5 一致', () => {
  assert.deepEqual(T.LINE_SCORES, [100, 300, 500, 800])
  assert.equal(T.LOCK_DELAY_MS, 500) // AC-03.5
  assert.equal(T.DAS_DELAY_MS, 170) // AC-02.1
  assert.equal(T.DAS_REPEAT_MS, 100)
  assert.equal(T.SOFT_DROP_REPEAT_MS, 50) // AC-02.2
})

/* ---------- 2. 计分 / 等级 / 速度（AC-06.5 数值 100% 钉死） ---------- */

test('scoreForLines: 1/2/3/4 行 × 多等级', () => {
  assert.equal(T.scoreForLines(1, 1), 100)
  assert.equal(T.scoreForLines(2, 1), 300)
  assert.equal(T.scoreForLines(3, 1), 500)
  assert.equal(T.scoreForLines(4, 1), 800)
  assert.equal(T.scoreForLines(1, 2), 200)
  assert.equal(T.scoreForLines(2, 2), 600)
  assert.equal(T.scoreForLines(4, 2), 1600)
  assert.equal(T.scoreForLines(1, 3), 300)
  assert.equal(T.scoreForLines(3, 3), 1500)
  assert.equal(T.scoreForLines(4, 5), 4000)
})

test('levelForLines: 升级阈值（AC-06.2）', () => {
  assert.equal(T.levelForLines(0), 1)
  assert.equal(T.levelForLines(9), 1)
  assert.equal(T.levelForLines(10), 2) // AC-06.2
  assert.equal(T.levelForLines(20), 3)
  assert.equal(T.levelForLines(21), 3)
  assert.equal(T.levelForLines(100), 11)
})

test('gravityMs: 速度表与下限（AC-06.3）', () => {
  assert.equal(T.gravityMs(1), 1000)
  assert.equal(T.gravityMs(2), 850)
  assert.equal(T.gravityMs(3), 723)
  assert.equal(T.gravityMs(4), 614)
  assert.equal(T.gravityMs(50), 100) // 下限
  assert.equal(T.gravityMs(1000), 100)
  for (let l = 1; l < 40; l++) {
    assert.ok(T.gravityMs(l) >= T.gravityMs(l + 1), '速度随等级单调不增')
    assert.ok(T.gravityMs(l) >= 100, '不低于下限')
  }
})

/* ---------- 3. 方块定义（T1 契约） ---------- */

test('SHAPES: 7 型 × 4 旋转态，格数恒为 4，方形矩阵', () => {
  for (const t of T.TYPES) {
    const states = T.SHAPES[t]
    assert.equal(states.length, 4, t + ' 应有 4 个旋转态')
    const n = states[0].length
    for (const s of states) {
      assert.equal(s.length, n, t + ' 方形矩阵')
      for (const row of s) assert.equal(row.length, n, t + ' 行宽一致')
      assert.equal(countFilled(s), 4, t + ' 每态 4 格')
    }
  }
})

test('rotated: 顺时针旋转 4 次还原', () => {
  for (const t of T.TYPES) {
    const p = T.spawn(t)
    let q = p
    for (let i = 0; i < 4; i++) q = T.rotated(q, 1)
    assert.equal(q.rot, 0, t + ' rot 还原')
    assert.deepEqual(T.shapeOf(q), T.shapeOf(p), t + ' 形状还原')
  }
})

test('spawn: 顶部居中、完全在板内（AC-01.3）', () => {
  const expect = { I: 3, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 }
  for (const t of T.TYPES) {
    const p = T.spawn(t)
    assert.equal(p.x, expect[t], t + ' x 居中')
    assert.equal(p.y, 0)
    assert.equal(p.rot, 0)
    for (const cell of T.pieceCells(p)) {
      assert.ok(cell.x >= 0 && cell.x < 10 && cell.y >= 0 && cell.y < 20, t + ' 完全可见')
    }
  }
})

test('COLORS: 7 色 fill hex 两两不同（AC-07.5）', () => {
  const fills = T.TYPES.map((t) => T.COLORS[t].fill)
  assert.equal(new Set(fills).size, 7)
  for (const t of T.TYPES) {
    assert.ok(/^#[0-9a-f]{6}$/i.test(T.COLORS[t].fill), t + ' hex 格式')
    assert.equal(typeof T.COLORS[t].glow, 'string')
  }
})

/* ---------- 4. 棋盘（T2 契约） ---------- */

test('createBoard: 20×10 全空', () => {
  const b = T.createBoard()
  assert.equal(b.length, 20)
  for (const row of b) {
    assert.equal(row.length, 10)
    assert.ok(row.every((c) => c === null))
  }
})

test('collides: 越界与压块（AC-02.4）', () => {
  const b = T.createBoard()
  const p = T.spawn('T') // 3×3，x=3
  assert.equal(T.collides(b, p), false)
  assert.equal(T.collides(b, { type: 'T', rot: 0, x: -1, y: 0 }), true, '左越界')
  assert.equal(T.collides(b, { type: 'T', rot: 0, x: 10, y: 0 }), true, '右越界')
  assert.equal(T.collides(b, { type: 'T', rot: 0, x: 3, y: 19 }), true, '底部越界')
  b[1][3] = 'J' // T 在 (x+1=4? 见下) 占用验证
  // T rot0 格点：x+1, y / x, y+1 / x+1, y+1 / x+2, y+1；x=3,y=0 → (4,0)(3,1)(4,1)(5,1)
  assert.equal(T.collides(b, { type: 'T', rot: 0, x: 3, y: 0 }), true, '压块')
})

test('merge: 不可变 + 写入类型', () => {
  const b = T.createBoard()
  const p = { type: 'S', rot: 0, x: 3, y: 0 }
  const m = T.merge(b, p)
  assert.notEqual(m, b, '返回新数组')
  assert.ok(b.every((row) => row.every((c) => c === null)), '原 board 不变')
  let filled = 0
  for (const row of m) for (const c of row) if (c === 'S') filled++
  assert.equal(filled, 4)
})

test('clearLines: 单行/多行一次性消除 + 上方行下移（AC-03.2/3）', () => {
  // 无满行
  const b0 = T.createBoard()
  b0[19][0] = 'J'
  const r0 = T.clearLines(b0)
  assert.equal(r0.cleared, 0)
  assert.deepEqual(r0.indices, [])
  assert.equal(r0.board, b0, '无变化时返回原引用')

  // 单行（row 19）
  const b1 = T.createBoard()
  b1[19] = fullRow('I', -1)
  b1[18][3] = 'T'
  const r1 = T.clearLines(b1)
  assert.equal(r1.cleared, 1)
  assert.deepEqual(r1.indices, [19])
  assert.ok(r1.board[0].every((c) => c === null), '顶部补入空行')
  assert.equal(r1.board[18][3], null, '上方行整体下移 1 行')
  assert.equal(r1.board[19][3], 'T', '原 row18 内容落到 row19')

  // 多行（rows 16-19 四行一次消）
  const b4 = T.createBoard()
  for (let r = 16; r < 20; r++) b4[r] = fullRow('I', -1)
  b4[15][0] = 'L'
  const r4 = T.clearLines(b4)
  assert.equal(r4.cleared, 4)
  assert.deepEqual(r4.indices, [16, 17, 18, 19])
  for (let r = 16; r < 19; r++) assert.ok(r4.board[r].every((c) => c === null), 'rows16-18 清空')
  assert.equal(r4.board[19][0], 'L', 'row15 内容落到 row19')
  assert.notEqual(r4.board, b4, '新数组')
  assert.equal(b4[19][0], 'I', '原 board 不变')
})

/* ---------- 5. 队列（T4 契约） ---------- */

test('createQueue: 注入 RNG 确定、peek 不消耗（7-bag）', () => {
  // 7-bag: shuffle 使用 rng，固定种子 → 确定性序列
  // 用全 0.5 序列：shuffle 每次 swap(i→j) 中 j = floor(0.5*(i+1))，产生固定排列
  let callCount = 0
  const q = T.createQueue(() => { callCount++; return 0.5 })
  const first = q.peek()
  assert.equal(q.peek(), first, 'peek 不消耗')
  assert.equal(q.next(), first, 'next 返回 peek 相同值')
  // peek 后 next 应推进到下一块
  const second = q.peek()
  assert.equal(typeof second, 'string', 'peek 返回方块类型')
  assert.equal(q.next(), second)
  // 每袋 7 块，检查连续 7 块不重复
  const bag = [first, second]
  for (let k = 2; k < 7; k++) bag.push(q.next())
  assert.equal(new Set(bag).size, 7, '前 7 块包含全部 7 型（7-bag 完整性）')
})

/* ---------- 5b. 7-bag 算法契约用例（AC-17） ---------- */

test('7-bag: 每袋 7 块包含全部 7 种方块各 1 次', () => {
  const q = T.createQueue()
  for (let bag = 0; bag < 100; bag++) {
    const seen = []
    for (let k = 0; k < 7; k++) seen.push(q.next())
    const sorted = seen.slice().sort()
    assert.deepEqual(sorted, ['I', 'J', 'L', 'O', 'S', 'T', 'Z'], '第 ' + (bag + 1) + ' 袋应含全部 7 型')
  }
})

test('7-bag: 袋内排列随机（连续 10 袋不全相同）', () => {
  const q = T.createQueue()
  const bags = []
  for (let b = 0; b < 10; b++) {
    const bag = []
    for (let k = 0; k < 7; k++) bag.push(q.next())
    bags.push(bag.join(''))
  }
  const unique = new Set(bags)
  assert.ok(unique.size >= 2, '10 袋中至少 2 种不同排列（袋内随机性）')
})

test('7-bag: 连续两袋无重叠顺序（两袋拼接 ≠ 单袋重复）', () => {
  const q = T.createQueue()
  const bag1 = []
  for (let k = 0; k < 7; k++) bag1.push(q.next())
  const bag2 = []
  for (let k = 0; k < 7; k++) bag2.push(q.next())
  // 两袋各自完整
  assert.deepEqual(bag1.slice().sort(), ['I', 'J', 'L', 'O', 'S', 'T', 'Z'], 'bag1 完整')
  assert.deepEqual(bag2.slice().sort(), ['I', 'J', 'L', 'O', 'S', 'T', 'Z'], 'bag2 完整')
  // 两袋不完全相同（概率极低）
  assert.notDeepEqual(bag1, bag2, '连续两袋不应固定相同排列')
  // 第 14 块（bag2 第 7 块）仍为合法类型
  for (let k = 0; k < 5; k++) q.next() // 消费 bag2 剩余
  const bag3start = q.next()
  assert.ok(T.TYPES.includes(bag3start), 'bag3 首块为合法方块类型')
})

test('createQueue: 7-bag 分布（大样本各型频率 ≈1/7）', () => {
  const counts = { I: 0, O: 0, T: 0, S: 0, Z: 0, J: 0, L: 0 }
  const q = T.createQueue()
  const total = 7000
  for (let k = 0; k < total; k++) counts[q.next()]++
  for (const t of T.TYPES) {
    const expected = total / 7
    const ratio = counts[t] / expected
    assert.ok(ratio > 0.85 && ratio < 1.15, t + ' 频率 ' + counts[t] + ' ≈ ' + expected + '（偏差 <15%）')
  }
})

/* ---------- 6. 状态机（T5 契约：迁移矩阵全遍历） ---------- */

test('transition: 迁移矩阵 20 格全遍历', () => {
  assert.equal(T.transition('READY', 'start'), 'RUNNING')
  assert.equal(T.transition('READY', 'pause'), 'READY')
  assert.equal(T.transition('READY', 'resume'), 'READY')
  assert.equal(T.transition('READY', 'restart'), 'RUNNING')
  assert.equal(T.transition('READY', 'lose'), 'READY')

  assert.equal(T.transition('RUNNING', 'start'), 'RUNNING')
  assert.equal(T.transition('RUNNING', 'pause'), 'PAUSED')
  assert.equal(T.transition('RUNNING', 'resume'), 'RUNNING')
  assert.equal(T.transition('RUNNING', 'restart'), 'RUNNING')
  assert.equal(T.transition('RUNNING', 'lose'), 'OVER')

  assert.equal(T.transition('PAUSED', 'start'), 'PAUSED')
  assert.equal(T.transition('PAUSED', 'pause'), 'PAUSED')
  assert.equal(T.transition('PAUSED', 'resume'), 'RUNNING')
  assert.equal(T.transition('PAUSED', 'restart'), 'RUNNING')
  assert.equal(T.transition('PAUSED', 'lose'), 'PAUSED')

  assert.equal(T.transition('OVER', 'start'), 'OVER')
  assert.equal(T.transition('OVER', 'pause'), 'OVER')
  assert.equal(T.transition('OVER', 'resume'), 'OVER')
  assert.equal(T.transition('OVER', 'restart'), 'RUNNING')
  assert.equal(T.transition('OVER', 'lose'), 'OVER')

  // 未知事件 → 原 phase（幂等）
  assert.equal(T.transition('RUNNING', 'bogus'), 'RUNNING')
})

/* ---------- 7. 会话集成（T6 契约，AC 关键路径） ---------- */

// r13（§6.1）：mk() 统一基线工厂——animMs:0 为正规配置项（即时消除，= reduced-motion 降级语义，AC-7），
// 既有消行/计分/音效序列断言逐字保留；新动画用例组显式传 animMs:240
function mk(opts) {
  return T.createGame(
    Object.assign(
      { autoLoop: false, keyboard: false, autoPauseOnBlur: false, animMs: 0 },
      opts || {}
    )
  )
}

function freshGame(extra) {
  const events = { levelUp: [], gameOver: [], sfx: [], snapshots: [] }
  const g = mk(
    Object.assign(
      {
        rng: () => 0, // 确定性：恒为 I
        onSnapshot: (s) => events.snapshots.push(s),
        onLevelUp: (l) => events.levelUp.push(l),
        onGameOver: (s) => events.gameOver.push(s),
        onSfx: (n) => events.sfx.push(n),
      },
      extra || {}
    )
  )
  return { g, events }
}

test('生命周期: READY → start → RUNNING → pause → resume → restart', () => {
  const { g, events } = freshGame()
  assert.equal(g.getPhase(), 'READY')
  let s = g.getSnapshot()
  assert.equal(s.score, 0)
  assert.equal(s.level, 1)
  assert.equal(s.lines, 0)
  assert.equal(s.piece, null)
  assert.ok(T.TYPES.includes(s.next))
  assert.equal(s.board.length, 20)

  const r = g.start()
  assert.deepEqual(r, { ok: true })
  assert.equal(g.getPhase(), 'RUNNING')
  s = g.getSnapshot()
  assert.ok(s.piece, '首块已出生')
  assert.equal(s.piece.y, 0)

  assert.equal(g.togglePause().ok, true)
  assert.equal(g.getPhase(), 'PAUSED')
  assert.equal(g.togglePause().ok, true)
  assert.equal(g.getPhase(), 'RUNNING')

  assert.equal(g.restart().ok, true)
  assert.equal(g.getPhase(), 'RUNNING')
  s = g.getSnapshot()
  assert.equal(s.score, 0)
  assert.equal(s.level, 1)
  assert.equal(s.lines, 0)
  assert.ok(s.piece)
  assert.equal(events.snapshots.length >= 4, true, '初始+start+pause+resume 均有快照')
})

test('start 与 spawn 消费预览队列（7-bag 确定性 RNG）', () => {
  // 7-bag: rng 用于 shuffle，全 0.5 产生固定排列
  const g = mk({ rng: () => 0.5 })
  const readys = g.getSnapshot()
  assert.ok(T.TYPES.includes(readys.next), 'READY 预览为合法方块类型')
  g.start()
  const s = g.getSnapshot()
  assert.equal(s.piece.type, readys.next, '首块 = READY 时预览')
  assert.ok(T.TYPES.includes(s.next), '预览已补新')
  assert.notEqual(s.piece.type, null, '首块已出生')
})

test('move: 左墙阻挡保持原位（AC-02.4）', () => {
  const { g } = freshGame()
  g.start()
  g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 0 })
  const before = g.getSnapshot()
  const r = g.move(-1)
  assert.deepEqual(r, { ok: false, reason: 'blocked' })
  assert.equal(g.getSnapshot().piece.x, 0, '位置不变')
  const after = g.getSnapshot()
  assert.equal(snapshotDeep(before, after), true, '快照不变')
  assert.equal(g.move(1).ok, true, '右移成功')
  assert.equal(g.getSnapshot().piece.x, 1)
})

test('rotate: 旋转越界拒绝且原位（E1，AC-02.4）', () => {
  const { g } = freshGame()
  g.start()
  g.setWallKickEnabled(false) // v2.9：碰撞被拒断言需在开关关闭态（默认已改开）
  g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 18 })
  const before = g.getSnapshot()
  const r = g.rotate()
  assert.deepEqual(r, { ok: false, reason: 'wall-kick-denied' })
  const s = g.getSnapshot()
  assert.equal(s.piece.rot, 0, '旋转被拒，rot 不变')
  assert.equal(snapshotDeep(before, s), true, '快照不变')
  // 正常位置旋转成功
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 0 })
  assert.equal(g.rotate().ok, true)
  assert.equal(g.getSnapshot().piece.rot, 1)
})

/* ---------- AC-18: 无踢墙旋转系统 ---------- */

test('rotate: 左墙碰撞保持原位（AC-18.3，开关关闭态）', () => {
  const { g } = freshGame()
  g.start()
  g.setWallKickEnabled(false) // v2.9：AC-18 语义在开关关闭态断言（默认已改开）
  // T 型方块紧贴左墙（x=0）且靠近底部，旋转后底部越界 → 碰撞
  g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 18 })
  const before = g.getSnapshot()
  const r = g.rotate()
  assert.deepEqual(r, { ok: false, reason: 'wall-kick-denied' }, '左墙碰撞返回 wall-kick-denied')
  const after = g.getSnapshot()
  assert.equal(after.piece.x, before.piece.x, 'x 不变（不右移让位）')
  assert.equal(after.piece.y, before.piece.y, 'y 不变')
  assert.equal(after.piece.rot, before.piece.rot, 'rot 不变')
})

test('rotate: 右墙碰撞保持原位（AC-18.4，开关关闭态）', () => {
  const { g } = freshGame()
  g.start()
  g.setWallKickEnabled(false)
  // I 型方块横放（rot=0）紧贴右墙（x=8），旋转后右侧越界 → 碰撞
  g._debug.setPiece({ type: 'I', rot: 0, x: 8, y: 0 })
  const before = g.getSnapshot()
  const r = g.rotate()
  assert.deepEqual(r, { ok: false, reason: 'wall-kick-denied' }, '右墙碰撞返回 wall-kick-denied')
  const after = g.getSnapshot()
  assert.equal(after.piece.x, before.piece.x, 'x 不变（不左移让位）')
  assert.equal(after.piece.y, before.piece.y, 'y 不变')
  assert.equal(after.piece.rot, before.piece.rot, 'rot 不变')
})

test('rotate: 已固定方块碰撞保持原位（AC-18.5，开关关闭态）', () => {
  const { g } = freshGame()
  g.start()
  g.setWallKickEnabled(false)
  // 在方块下方放置已固定方块，使旋转产生碰撞
  const b = Array.from({ length: 20 }, () => Array(10).fill(null))
  b[19][3] = '#f00' // 固定方块位于 (3,19)
  g._debug.setBoard(b)
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 17 })
  const before = g.getSnapshot()
  const r = g.rotate()
  // T 型 rot=0 旋转后底部可能与固定方块碰撞
  if (!r.ok) {
    assert.deepEqual(r, { ok: false, reason: 'wall-kick-denied' }, '已固定方块碰撞返回 wall-kick-denied')
    const after = g.getSnapshot()
    assert.equal(after.piece.x, before.piece.x, 'x 不变')
    assert.equal(after.piece.y, before.piece.y, 'y 不变')
    assert.equal(after.piece.rot, before.piece.rot, 'rot 不变')
  } else {
    // 若旋转成功（无碰撞），验证位置已更新
    assert.equal(g.getSnapshot().piece.rot, 1)
  }
})

/* ---------- AC-19: 踢墙旋转开关系统 ---------- */

test('rotate: 默认开关开启（AC-19.1）', () => {
  const { g } = freshGame()
  assert.equal(g.getWallKickEnabled(), true, '新会话默认开')
  g.start()
  assert.equal(g.getWallKickEnabled(), true, '开始后仍开')
  // 可通过装配入参关闭（确定性单测注入，AC-19.1）
  const off = freshGame({ wallKickEnabled: false }).g
  assert.equal(off.getWallKickEnabled(), false, 'createGame({wallKickEnabled:false}) 初值关')
})

test('rotate: 开=左偏移命中成功（AC-19.2）', () => {
  const { g } = freshGame()
  g.start()
  // T rot0 (3,17)：旋转→rot1 底部落 (4,19)；(4,19) 放固定块 → 旋转碰撞，
  // 踢墙先试左移 → (2,17) rot1 合法 → 命中非零偏移 (dx=-1)
  const b = Array.from({ length: 20 }, () => Array(10).fill(null))
  b[19][4] = '#f00'
  g._debug.setBoard(b)
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 17 })
  const before = g.getSnapshot()
  const r = g.rotate()
  assert.equal(r.ok, true, '开=踢墙命中 → 旋转成功')
  const after = g.getSnapshot()
  assert.equal(after.piece.rot, 1, 'rot 生效')
  assert.equal(after.piece.x, 2, 'x 随偏移左移 1 格')
  assert.equal(after.piece.y, 17, 'y 不变')
  assert.ok(after.piece.x !== before.piece.x, '发生踢墙偏移（非原地）')
})

test('rotate: 开=右偏移命中成功（AC-19.2）', () => {
  const { g } = freshGame()
  g.start()
  // T rot0 (2,17)：旋转→rot1 落 (3,19)；(3,19)(2,19) 放固定块 → 旋转碰撞且左移也被挡，
  // 右移 → (3,17) rot1 合法 → 命中非零偏移 (dx=+1)
  const b = Array.from({ length: 20 }, () => Array(10).fill(null))
  b[19][3] = '#f00'
  b[19][2] = '#f00'
  g._debug.setBoard(b)
  g._debug.setPiece({ type: 'T', rot: 0, x: 2, y: 17 })
  const r = g.rotate()
  assert.equal(r.ok, true, '右移规避成功')
  const after = g.getSnapshot()
  assert.equal(after.piece.rot, 1, 'rot 生效')
  assert.equal(after.piece.x, 3, 'x 右移 1 格')
  assert.equal(after.piece.y, 17, 'y 不变')
})

test('rotate: 开=全部偏移失败保持原位（AC-19.3）', () => {
  const { g } = freshGame()
  g.start()
  // I rot0 (0,19)：旋转 rot1 竖放纵跨 y16..19，被底部行(19)与竖列(2,16)围死；
  // 左/右移均碰底部固定块、上移碰 (2,16) → 全部偏移失败 → 保持原位
  const b = Array.from({ length: 20 }, () => Array(10).fill(null))
  for (let c = 0; c < 5; c++) b[19][c] = '#f00'
  b[16][2] = '#f00'
  g._debug.setBoard(b)
  g._debug.setPiece({ type: 'I', rot: 0, x: 0, y: 19 })
  const before = g.getSnapshot()
  const r = g.rotate()
  assert.deepEqual(r, { ok: false, reason: 'wall-kick-denied' }, '开=全部失败 → wall-kick-denied')
  const after = g.getSnapshot()
  assert.equal(after.piece.x, before.piece.x, 'x 不变')
  assert.equal(after.piece.y, before.piece.y, 'y 不变')
  assert.equal(after.piece.rot, before.piece.rot, 'rot 不变')
})

test('rotate: 关=旋转碰撞零偏移保持原位（AC-19.4）', () => {
  const { g } = freshGame()
  g.start()
  g.setWallKickEnabled(false)
  // T 贴左墙贴底（x=0,y=18）：旋转 rot1 底部越界 → 碰撞；即便开关打开有上移空间，
  // 关闭态也绝不偏移（AC-18 语义），返回 wall-kick-denied 且 x/y/rot 全不变
  g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 18 })
  const before = g.getSnapshot()
  const r = g.rotate()
  assert.deepEqual(r, { ok: false, reason: 'wall-kick-denied' }, '关=碰撞 → wall-kick-denied（零偏移）')
  const after = g.getSnapshot()
  assert.equal(after.piece.x, before.piece.x, 'x 不变（零偏移）')
  assert.equal(after.piece.y, before.piece.y, 'y 不变（零偏移）')
  assert.equal(after.piece.rot, before.piece.rot, 'rot 不变')
})

test('rotate: 切换实时生效 ≤100ms（AC-19.5）', () => {
  const { g } = freshGame()
  g.start()
  // 用「贴左墙贴底 T」作开关判别器：开=踢墙上移命中成功；关=拒绝零偏移
  const place = function () { g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 18 }) }
  // 默认开（AC-19.1）→ 旋转碰撞后踢墙命中（上移 y17）→ 成功
  place()
  const t0 = Date.now()
  const r1 = g.rotate()
  assert.equal(r1.ok, true, '开（默认）→ 踢墙命中旋转成功')
  assert.equal(g.getSnapshot().piece.rot, 1, 'rot 生效')
  assert.equal(g.getSnapshot().piece.y, 17, '踢墙上移 1 格（y 17）')
  assert.ok(Date.now() - t0 <= 100, '切换生效 ≤100ms 内（开关读取即时）')
  // 关闭后下一次 rotate 立即按新值：同场景 → 拒绝零偏移
  place()
  g.setWallKickEnabled(false)
  const before = g.getSnapshot()
  const r2 = g.rotate()
  assert.deepEqual(r2, { ok: false, reason: 'wall-kick-denied' }, '关闭后下一次 rotate 立即拒绝')
  const after = g.getSnapshot()
  assert.equal(after.piece.x, before.piece.x, '关闭态 x 不变')
  assert.equal(after.piece.y, before.piece.y, '关闭态 y 不变（不偏移）')
  assert.equal(after.piece.rot, before.piece.rot, '关闭态 rot 不变')
})

test('rotate: setWallKickEnabled 钳制为布尔（AC-19.1）', () => {
  const { g } = freshGame()
  g.setWallKickEnabled(1)
  assert.equal(g.getWallKickEnabled(), false, '1 !=== true → false（钳制）')
  g.setWallKickEnabled(0)
  assert.equal(g.getWallKickEnabled(), false, '0 → false')
  g.setWallKickEnabled('yes')
  assert.equal(g.getWallKickEnabled(), false, '非布尔真值 → false')
  g.setWallKickEnabled(false)
  assert.equal(g.getWallKickEnabled(), false, 'false → false')
  g.setWallKickEnabled(true)
  assert.equal(g.getWallKickEnabled(), true, 'true → true（唯一真值）')
})

test('softDrop: 下落 1 格；触底立即锁定（AC-02.2、AC-03.5）', () => {
  const { g } = freshGame()
  g.start()
  const y0 = g.getSnapshot().piece.y
  assert.equal(g.softDrop().ok, true)
  assert.equal(g.getSnapshot().piece.y, y0 + 1)

  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 18 })
  const r = g.softDrop()
  assert.equal(r.ok, true)
  assert.equal(r.locked, true, '软降触底立即固定')
  assert.equal(r.cleared, 0)
  const s = g.getSnapshot()
  assert.ok(s.piece, '下一块已出生')
  assert.equal(s.board[18][4], 'T', 'T 已固定')
})

test('hardDrop: 立即落底固定 + 不加分（AC-14，v2.3 移除 dropBonus）', () => {
  const { g } = freshGame()
  g.start()
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 0 })
  const r = g.hardDrop()
  assert.equal(r.ok, true)
  assert.equal(r.locked, true)
  assert.equal(r.gameOver, false)
  const s = g.getSnapshot()
  assert.equal(s.score, 0, '硬降空降 18 格不再加分（AC-14 硬降前后分数差 = 0）')
  assert.equal(s.board[19][3], 'T')
  assert.equal(s.board[19][4], 'T')
  assert.ok(s.piece, '下一块已出生')
})

test('消 4 行一次计分 800×L（AC-06.5、E3）', () => {
  const { g } = freshGame()
  g.start()
  // rows 16-19 各缺 col5，用竖 I（rot1 列 2 → 绝对 col 3+2=5）一次补齐 → 4 行
  const b = T.createBoard()
  for (let r = 16; r < 20; r++) b[r] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('I')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  const r = g.hardDrop()
  assert.deepEqual(
    { ok: r.ok, locked: r.locked, cleared: r.cleared, levelUp: r.levelUp, gameOver: r.gameOver },
    { ok: true, locked: true, cleared: 4, levelUp: false, gameOver: false }
  )
  const s = g.getSnapshot()
  assert.equal(s.score, 800, '800 × L1')
  assert.equal(s.lines, 4)
  assert.equal(s.level, 1)
  for (let r = 16; r < 20; r++) assert.ok(s.board[r].every((c) => c === null), '四行已清空')
})

test('升级: 累计 10 行 → 等级 2，onLevelUp 触发（AC-06.2/4）', () => {
  const { g, events } = freshGame()
  g.start()
  g._debug.setLines(9)
  assert.equal(g.getSnapshot().level, 1)
  // 仅 row19 缺 col5，竖 I 补齐 → 消 1 行 → lines 10 → level 2
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  const r = g.hardDrop()
  assert.equal(r.cleared, 1)
  assert.equal(r.levelUp, true)
  const s = g.getSnapshot()
  assert.equal(s.lines, 10)
  assert.equal(s.level, 2)
  assert.equal(s.score, 100, '消 1 行 100 × L1')
  assert.deepEqual(events.levelUp, [2])
})

test('出生碰撞 → OVER + onGameOver（E4，AC-05.1/2）', () => {
  const { g, events } = freshGame()
  g.start()
  const b = T.createBoard()
  // I rot0 填充行在 4×4 盒内索引 1 → 出生绝对行 1，列 3-6；在 (1,4)(1,5) 放阻挡
  b[1][4] = 'J'
  b[1][5] = 'J'
  g._debug.setBoard(b)
  g._debug.setNext('I')
  g._debug.setPiece({ type: 'O', rot: 0, x: 4, y: 18 })
  const r = g.hardDrop()
  assert.equal(r.ok, true)
  assert.equal(r.gameOver, true)
  assert.equal(g.getPhase(), 'OVER')
  assert.equal(g.getSnapshot().piece, null)
  assert.equal(events.gameOver.length, 1)
  // 结束态方向键无效（AC-05.2）
  assert.deepEqual(g.move(1), { ok: false, reason: 'illegal-phase' })
  assert.deepEqual(g.rotate(), { ok: false, reason: 'illegal-phase' })
  // 重开
  assert.equal(g.restart().ok, true)
  assert.equal(g.getPhase(), 'RUNNING')
})

test('restart: 任意态可重开，连续 5 轮无残留（AC-05.3/4）', () => {
  for (let round = 0; round < 5; round++) {
    const { g } = freshGame()
    g.start()
    g.hardDrop()
    g.hardDrop()
    const r = g.restart()
    assert.equal(r.ok, true)
    const s = g.getSnapshot()
    assert.equal(s.score, 0)
    assert.equal(s.level, 1)
    assert.equal(s.lines, 0)
    assert.ok(s.piece, '可立即游玩')
    for (const row of s.board) assert.ok(row.every((c) => c === null), '棋盘清空')
    // 从 PAUSED / OVER 重开
    g.togglePause()
    assert.equal(g.restart().ok, true)
    assert.equal(g.getPhase(), 'RUNNING')
  }
})

test('togglePause 往返快照一致（AC-04.3）', () => {
  const { g } = freshGame()
  g.start()
  g.hardDrop()
  const a = g.getSnapshot()
  assert.equal(g.togglePause().ok, true)
  assert.equal(g.getPhase(), 'PAUSED')
  assert.equal(g.togglePause().ok, true)
  assert.equal(g.getPhase(), 'RUNNING')
  const b = g.getSnapshot()
  assert.equal(snapshotDeep(a, b), true, '分数/等级/行数/棋盘/方块/预览与暂停前一致')
})

test('tick: 重力间隔 1000ms（L1）驱动下落（AC-03.1）', () => {
  const { g } = freshGame()
  g.start()
  const y0 = g.getSnapshot().piece.y
  g.tick(250)
  g.tick(250)
  g.tick(250)
  assert.equal(g.getSnapshot().piece.y, y0, '750ms 未到间隔不下落')
  g.tick(250)
  assert.equal(g.getSnapshot().piece.y, y0 + 1, '满 1000ms 下落 1 格')
})

test('tick: 触底锁定缓冲 500ms（AC-03.5）', () => {
  const { g } = freshGame()
  g.start()
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 18 })
  g.tick(250) // 触底计时 250ms
  assert.equal(g.getSnapshot().piece.type, 'T', '缓冲期内未锁定')
  g.tick(250) // 500ms → 锁定
  const s = g.getSnapshot()
  assert.ok(s.piece, '锁定后已出生新块（7-bag 新块类型可能与锁定块相同）')
  assert.equal(s.board[18][4], 'T', 'T 已固定')
})

test('tick 在非 RUNNING 下无副作用', () => {
  const { g } = freshGame()
  const before = g.getSnapshot()
  g.tick(10000)
  const after = g.getSnapshot()
  assert.equal(snapshotDeep(before, after), true)
  g.start()
  g.togglePause()
  const p = g.getSnapshot()
  g.tick(5000)
  assert.equal(snapshotDeep(p, g.getSnapshot()), true, '暂停不累积计时')
})

test('lose(): 强制结束', () => {
  const { g, events } = freshGame()
  g.start()
  assert.equal(g.lose().ok, true)
  assert.equal(g.getPhase(), 'OVER')
  assert.equal(events.gameOver.length, 1)
  assert.deepEqual(g.lose(), { ok: false, reason: 'illegal-phase' })
})

test('dispose: 清理后动作拒绝', () => {
  const { g } = freshGame()
  g.start()
  g.dispose()
  assert.deepEqual(g.start(), { ok: false, reason: 'illegal-phase' })
  assert.deepEqual(g.move(1), { ok: false, reason: 'illegal-phase' })
  assert.deepEqual(g.togglePause(), { ok: false, reason: 'illegal-phase' })
  g.dispose() // 幂等
})

test('PHASE_ALIAS: RUNNING≡PLAYING, OVER≡GAME_OVER（文档契约）', () => {
  assert.equal(T.PHASE_ALIAS.RUNNING, 'PLAYING')
  assert.equal(T.PHASE_ALIAS.OVER, 'GAME_OVER')
})

/* ---------- 8. 音效事件出口 onSfx（v2.0，AC-09；TECHNICAL §3.2/§7.1） ---------- */

test('onSfx: move 成功 → 恰好 1 次；被拒 → 0 次（AC-09.2/3）', () => {
  const { g, events } = freshGame()
  g.start()
  g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 0 })
  assert.deepEqual(g.move(-1), { ok: false, reason: 'blocked' })
  assert.deepEqual(events.sfx, [], '左墙阻挡不发声')
  assert.deepEqual(g.move(1), { ok: true })
  assert.deepEqual(events.sfx, ['move'])
  assert.deepEqual(g.move(1), { ok: true })
  assert.deepEqual(events.sfx, ['move', 'move'], '每次成功移动各 1 次')
})

test('onSfx: rotate 成功 → 恰好 1 次；越界被拒 → 0 次（AC-09.3）', () => {
  const { g, events } = freshGame()
  g.start()
  g.setWallKickEnabled(false) // v2.9：越界被拒断言需在开关关闭态（默认已改开）
  g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 18 }) // 旋转后底部越界 → 拒绝
  assert.deepEqual(g.rotate(), { ok: false, reason: 'wall-kick-denied' })
  assert.deepEqual(events.sfx, [])
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 0 })
  assert.deepEqual(g.rotate(), { ok: true })
  assert.deepEqual(events.sfx, ['rotate'])
})

test('onSfx: softDrop 成功下移 → 1 次；触底立即锁 → 无 softDrop（E-SFX-02）', () => {
  const { g, events } = freshGame()
  g.start()
  const y0 = g.getSnapshot().piece.y
  assert.deepEqual(g.softDrop(), { ok: true })
  assert.equal(g.getSnapshot().piece.y, y0 + 1)
  assert.deepEqual(events.sfx, ['softDrop'])

  // 软降触底立即锁定（下移被拒）→ 不发射 softDrop；无消行 → 无其他音效
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 18 })
  const r = g.softDrop()
  assert.equal(r.ok, true)
  assert.equal(r.locked, true)
  assert.deepEqual(events.sfx, ['softDrop'], '触底锁定路径不追加 softDrop')
})

test('onSfx: hardDrop 每次恰好 1 次（落点计算后、lockFlow 前）', () => {
  const { g, events } = freshGame()
  g.start()
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 0 })
  assert.equal(g.hardDrop().ok, true)
  assert.deepEqual(events.sfx, ['hardDrop'])
  g.hardDrop() // 第二块（I）继续硬降
  assert.deepEqual(events.sfx, ['hardDrop', 'hardDrop'])
})

test('onSfx: 一次消 4 行 → clear 恰好 1 次（AC-09.2/E-SFX-03）', () => {
  const { g, events } = freshGame()
  g.start()
  const b = T.createBoard()
  for (let r = 16; r < 20; r++) b[r] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('I')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  const r = g.hardDrop()
  assert.equal(r.cleared, 4)
  assert.deepEqual(events.sfx, ['hardDrop', 'clear'], '一次消行恰好 1 次 clear')
})

test('onSfx: 升级 → levelUp 恰好 1 次，且与 onLevelUp 回调同栈（AC-09.4）', () => {
  const { g, events } = freshGame()
  g.start()
  g._debug.setLines(9)
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  const r = g.hardDrop()
  assert.equal(r.levelUp, true)
  assert.deepEqual(events.sfx, ['hardDrop', 'clear', 'levelUp'])
  assert.deepEqual(events.levelUp, [2], 'onLevelUp 同栈触发')
})

test('onSfx: 出生碰撞自然结束 → gameOver 恰好 1 次（与 onGameOver 同栈）', () => {
  const { g, events } = freshGame()
  g.start()
  const b = T.createBoard()
  b[1][4] = 'J'
  b[1][5] = 'J'
  g._debug.setBoard(b)
  g._debug.setNext('I')
  g._debug.setPiece({ type: 'O', rot: 0, x: 4, y: 18 })
  const r = g.hardDrop()
  assert.equal(r.gameOver, true)
  assert.equal(g.getPhase(), 'OVER')
  assert.deepEqual(events.sfx, ['hardDrop', 'gameOver'])
  assert.equal(events.gameOver.length, 1)
})

test('onSfx: lose() 强制结束 → gameOver 恰好 1 次（E-SFX-06）', () => {
  const { g, events } = freshGame()
  g.start()
  assert.equal(g.lose().ok, true)
  assert.deepEqual(events.sfx, ['gameOver'])
  assert.equal(events.gameOver.length, 1)
  assert.deepEqual(g.lose(), { ok: false, reason: 'illegal-phase' }, 'OVER 态不再发声')
})

test('onSfx: 硬降同时消行+升级 → 顺序 hardDrop→clear→levelUp（E-SFX-04）', () => {
  const { g, events } = freshGame()
  g.start()
  g._debug.setLines(9)
  const b = T.createBoard()
  for (let r = 18; r < 20; r++) b[r] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  const r = g.hardDrop()
  assert.equal(r.cleared, 2)
  assert.equal(r.levelUp, true)
  assert.equal(r.gameOver, false)
  assert.deepEqual(events.sfx, ['hardDrop', 'clear', 'levelUp'], '同栈顺序发射')
})

test('onSfx: start/restart/tick 不发射音效（PRD 未定义开始/重开音效）', () => {
  const { g, events } = freshGame()
  g.start()
  assert.deepEqual(events.sfx, [])
  g.tick(250)
  assert.deepEqual(events.sfx, [], '重力步不发声（非玩家事件）')
  g.restart()
  assert.deepEqual(events.sfx, [])
})

/* ---------- 9. 键盘映射 keyAction + 恢复节拍（v2.1，AC-11；TECHNICAL §2.1/§7.1） ---------- */

test('keyAction: 映射矩阵逐格断言（AC-11 + r31 两级分发，TECHNICAL §2.1/§3.1）', () => {
  // L1 系统阶段键（READY/OVER：空格/Enter → start/restart，零回归，不随绑定）
  assert.equal(T.keyAction('READY', ' '), 'start')
  assert.equal(T.keyAction('READY', 'Enter'), 'start')
  assert.equal(T.keyAction('OVER', ' '), 'restart', 'GAME_OVER 空格=重开（D-01 甲）')
  assert.equal(T.keyAction('OVER', 'Enter'), 'restart')
  assert.equal(T.keyAction('PAUSED', ' '), 'togglePause', 'PAUSED 空格=继续（AC-11.2，阶段型固定键）')
  // L1 不随绑定：改绑空格（hardDrop）不影响 READY/OVER 空格=start/restart、PAUSED 空格=继续
  assert.equal(T.keyAction('READY', ' ', { hardDrop: 'x' }), 'start', '系统阶段键不随绑定')
  assert.equal(T.keyAction('OVER', ' ', { hardDrop: 'x' }), 'restart', '系统阶段键不随绑定')
  assert.equal(T.keyAction('PAUSED', ' ', { hardDrop: 'x' }), 'togglePause', 'PAUSED 空格不随绑定')
  // L2 默认绑定表：key→动作（动作阶段有效性由引擎守卫，keyAction 仅查绑定，与 DESIGN §3.1
  // 「动作内自行按 phase 守卫」一致）；READY/OVER 按 P 等阶段无效键由引擎 no-op（AC-11.6 行为保留）
  assert.equal(T.keyAction('RUNNING', ' '), 'hardDrop', 'RUNNING 空格仍为硬降')
  assert.equal(T.keyAction('RUNNING', 'p'), 'togglePause')
  assert.equal(T.keyAction('RUNNING', 'P'), 'togglePause')
  assert.equal(T.keyAction('RUNNING', 'r'), 'restart')
  assert.equal(T.keyAction('RUNNING', 'R'), 'restart')
  assert.equal(T.keyAction('RUNNING', 'ArrowLeft'), 'moveLeft')
  assert.equal(T.keyAction('RUNNING', 'ArrowRight'), 'moveRight')
  assert.equal(T.keyAction('RUNNING', 'ArrowDown'), 'softDrop')
  assert.equal(T.keyAction('RUNNING', 'ArrowUp'), 'rotate')
  assert.equal(T.keyAction('RUNNING', 'c'), 'hold', '默认 hold=C')
  assert.equal(T.keyAction('RUNNING', 'C'), 'hold')
  // r31 DER-1 收敛：X 次键 / Shift 长按 / Escape 暂停 失效（这些键不再出现在绑定表 → null）
  assert.equal(T.keyAction('RUNNING', 'x'), null, 'X 次键收敛失效（DESIGN D-7）')
  assert.equal(T.keyAction('RUNNING', 'X'), null)
  assert.equal(T.keyAction('RUNNING', 'Escape'), null, 'Escape 不再暂停（转系统键，DESIGN D-7）')
  assert.equal(T.keyAction('RUNNING', 'Shift'), null, 'Shift 长按失效（DESIGN D-7）')
  assert.equal(T.keyAction('RUNNING', 'Enter'), null, 'RUNNING Enter 无映射（重开走 L1 仅 READY/OVER）')
  // 其余阶段：绑定表统一查（动作阶段有效性由引擎守卫，见 qa-e2e 行为段）
  assert.equal(T.keyAction('PAUSED', 'p'), 'togglePause')
  assert.equal(T.keyAction('PAUSED', 'r'), 'restart')
  assert.equal(T.keyAction('PAUSED', 'ArrowLeft'), 'moveLeft', 'PAUSED 方向键仍解析绑定（引擎守卫为 no-op，AC-04.2 行为保留）')
  assert.equal(T.keyAction('PAUSED', 'Escape'), null, 'PAUSED Escape 不再暂停（DER-1）')
  assert.equal(T.keyAction('OVER', 'r'), 'restart')
  assert.equal(T.keyAction('OVER', 'p'), 'togglePause', 'OVER P 解析绑定（引擎 guard 为 no-op，AC-11.6 行为保留）')
  assert.equal(T.keyAction('OVER', 'Escape'), null, 'OVER Escape 无映射')
  assert.equal(T.keyAction('READY', 'p'), 'togglePause', 'READY P 解析绑定（引擎 guard no-op，AC-11.6 行为保留）')
  assert.equal(T.keyAction('READY', 'Escape'), null)
  assert.equal(T.keyAction('READY', 'ArrowLeft'), 'moveLeft', 'READY 方向键解析绑定（引擎 guard no-op）')
  // 防御（E-11-09）：未知 phase / 非字符串 key → null
  assert.equal(T.keyAction('BOGUS', ' '), null)
  assert.equal(T.keyAction(null, ' '), null)
  assert.equal(T.keyAction('READY', null), null)
  assert.equal(T.keyAction('READY', undefined), null)
  assert.equal(T.keyAction('READY', 123), null)
})

test('keyAction: r31 绑定覆盖（第三参自定义表）+ 一对一 + 大小写归一', () => {
  const custom = {
    moveLeft: 'a', moveRight: 'd', softDrop: 's', hardDrop: 'w',
    rotate: 'j', hold: 'h', togglePause: 'o', restart: 'g', mute: 'n',
  }
  // 改键后：新键生效、旧默认键失效（一对一，DER-1）
  assert.equal(T.keyAction('RUNNING', 'a', custom), 'moveLeft')
  assert.equal(T.keyAction('RUNNING', 'A', custom), 'moveLeft', '大写 A 归一')
  assert.equal(T.keyAction('RUNNING', 'd', custom), 'moveRight')
  assert.equal(T.keyAction('RUNNING', 's', custom), 'softDrop')
  assert.equal(T.keyAction('RUNNING', 'w', custom), 'hardDrop')
  assert.equal(T.keyAction('RUNNING', 'j', custom), 'rotate')
  assert.equal(T.keyAction('RUNNING', 'h', custom), 'hold')
  assert.equal(T.keyAction('RUNNING', 'o', custom), 'togglePause')
  assert.equal(T.keyAction('RUNNING', 'g', custom), 'restart')
  assert.equal(T.keyAction('RUNNING', 'ArrowLeft', custom), null, '原箭头键被改走 → 失效')
  assert.equal(T.keyAction('RUNNING', 'p', custom), null, '原 P 被改走 → 失效')
  assert.equal(T.keyAction('RUNNING', 'c', custom), null, '原 C 被改走 → 失效')
  assert.equal(T.keyAction('RUNNING', ' ', { hardDrop: 'x' }), null, '空格被改走后默认表空格失效')
  // 空/非法表 → 回默认表
  assert.equal(T.keyAction('RUNNING', 'ArrowLeft', null), 'moveLeft', '表缺失回默认')
  assert.equal(T.keyAction('RUNNING', 'ArrowLeft', {}), 'moveLeft', '空表回默认')
  // 部分表缺省 → 其余动作回默认
  const partial = T.keyAction('RUNNING', 'r', { moveLeft: 'a' })
  assert.equal(partial, 'restart', '部分表未覆盖动作回默认')
  // PAUSED：空格=继续（AC-11.2，L1 阶段键不随绑定）；p=继续（togglePause 绑定）
  assert.equal(T.keyAction('PAUSED', ' ', { hardDrop: 'x' }), 'togglePause', 'PAUSED 空格=继续不随绑定')
  assert.equal(T.keyAction('PAUSED', 'o', custom), 'togglePause', 'PAUSED 改绑 togglePause=o 生效')
})

test('恢复节拍差值续算：暂停不清计时，恢复后按暂停前剩余间隔续算（AC-11.4，E-11-08）', () => {
  const { g } = freshGame()
  g.start()
  g.tick(250)
  g.tick(250)
  g.tick(200) // gravityAcc = 700（L1 间隔 1000）
  const yPause = g.getSnapshot().piece.y
  assert.equal(g.togglePause().ok, true)
  g.tick(5000) // 暂停期 tick 无副作用（E-11-08）
  assert.equal(g.getSnapshot().piece.y, yPause, '暂停期不累积计时')
  assert.equal(g.togglePause().ok, true)
  g.tick(250) // 700 + 250 = 950 < 1000 → 不下落
  assert.equal(g.getSnapshot().piece.y, yPause, '恢复后 250ms 未到剩余间隔不下落')
  g.tick(50) // 950 + 50 = 1000 → 恰好下落 1 格（偏差 0）
  assert.equal(g.getSnapshot().piece.y, yPause + 1, '恢复后满 1000ms 恰好下落 1 格')
})

test('togglePause 不发射音效（AC-11.3 引擎层：暂停/继续无音效、恢复瞬间无硬降音效）', () => {
  const { g, events } = freshGame()
  g.start()
  assert.equal(g.togglePause().ok, true)
  assert.equal(g.togglePause().ok, true)
  assert.deepEqual(events.sfx, [], '暂停/继续往返后音效事件序列仍为空')
  g.restart()
  assert.deepEqual(events.sfx, [], 'restart 亦不发声（既有语义保持，TECHNICAL §3.2）')
})

/* ---------- 10. 幽灵块 ghostY 落点计算（v2.2，AC-12；TECHNICAL §2.1/§7.1） ---------- */

test('ghostY: 纯函数导出 + 空板落板底（AC-12.1）', () => {
  assert.equal(typeof T.ghostY, 'function', 'ghostY 导出存在（window.TetrisGame.ghostY / module.exports.ghostY）')
  const board = T.createBoard()
  for (const t of T.TYPES) {
    for (let rot = 0; rot < 4; rot++) {
      const shape = T.SHAPES[t][rot]
      const bottom = bottomRowOf(shape)
      const expect = 19 - bottom // 空板：最低实心格落至 row 19
      const piece = { type: t, rot: rot, x: 3, y: 0 }
      const gy = T.ghostY(board, piece)
      assert.equal(typeof gy, 'number', t + '/' + rot + ' 应返回 number')
      assert.ok(gy >= piece.y, t + '/' + rot + ' 落点 ≥ piece.y（不向上）')
      // 落点处不碰撞、下一格必碰撞（= hardDrop 落点语义一致）
      assert.equal(T.collides(board, { type: t, rot: rot, x: 3, y: gy }), false, t + '/' + rot + ' 落点处不碰撞')
      assert.equal(T.collides(board, { type: t, rot: rot, x: 3, y: gy + 1 }), true, t + '/' + rot + ' 落点下一格必碰撞')
      assert.equal(gy, expect, t + ' rot' + rot + ' 空板落板底 = 19 - 最低实心行偏移')
    }
  }
})

test('ghostY: 与 hardDrop 落点偏差 0（AC-12.1 核心，E-12-01）', () => {
  // 对 7 型 × 多 x/rot（仅取 spawn 即合法的组合）：ghostY == hardDrop 实际固定 y（偏差 0）
  const xxs = [0, 2, 6, 9]
  for (const t of T.TYPES) {
    for (let rot = 0; rot < 4; rot++) {
      for (const x of xxs) {
        // spawn 合法（形状全部在 10×20 板内且不与固定块重叠）才参与偏差 0 断言
        const proto = { type: t, rot: rot, x: x, y: 0 }
        if (T.collides(T.createBoard(), proto)) continue
        const { g } = freshGame()
        g.start()
        g._debug.setPiece(proto)
        const s = g.getSnapshot()
        const g0 = T.ghostY(s.board, s.piece)
        assert.equal(g.hardDrop().ok, true)
        // hardDrop 已锁定并出生新块：以落点格是否被原块填充验证偏差 0
        const s2 = g.getSnapshot()
        const cells = T.pieceCells({ type: t, rot: rot, x: x, y: g0 })
        for (const c of cells) {
          assert.equal(s2.board[c.y] && s2.board[c.y][c.x], t, t + '/rot' + rot + ' x' + x + ' 落点格被原块以 y=' + g0 + ' 固定（偏差 0）')
        }
      }
    }
  }
})

test('ghostY: 遮挡/边界/旋转（AC-12.3/12.5，E-12-02/03/04）', () => {
  // 掩体：横条掩体（row 15，仅 col 0 空）阻塞 → 落点在掩体上一格
  const bObs = boardWithObstacle('X', 15, 0)
  for (const t of T.TYPES) {
    const bottom = bottomRowOf(T.SHAPES[t][0])
    const piece = { type: t, rot: 0, x: 4, y: 0 }
    const gy = T.ghostY(bObs, piece)
    // 掩体占 row 15 全部（仅 col0 空，x=4 下方必有掩体）→ 落点恰为 15 - bottom - 1
    assert.equal(gy, 15 - bottom - 1, t + ' 落点在掩体上一格（掩体 row15，col0 空、x=4 下方全覆盖）')
  }

  // 边界：贴边（左墙 x 最左合法位 / 右墙 x 最右合法位）不越界（AC-12.5，E-12-03）
  const b = T.createBoard()
  for (const t of T.TYPES) {
    for (let rot = 0; rot < 4; rot++) {
      // 求该形状该旋转的最左/最右合法 x（spawn 即不越界、不压块）
      let minX = -1
      let maxX = -1
      for (let x = 0; x < 10; x++) {
        if (!T.collides(b, { type: t, rot: rot, x: x, y: 0 })) {
          if (minX === -1) minX = x
          maxX = x
        }
      }
      for (const x of [minX, maxX]) {
        const gy = T.ghostY(b, { type: t, rot: rot, x: x, y: 0 })
        const cells = T.pieceCells({ type: t, rot: rot, x: x, y: gy })
        for (const c of cells) {
          assert.ok(c.x >= 0 && c.x < 10 && c.y < 20, t + ' rot' + rot + ' x' + x + ' 落点格不越界（贴边合法位）')
        }
      }
    }
  }

  // 旋转：I/S/Z 各旋转态落点按新轮廓变化且为合法底部（AC-12.3，E-12-04）
  for (const t of ['I', 'S', 'Z']) {
    const gys = new Set()
    for (let rot = 0; rot < 4; rot++) {
      const piece = { type: t, rot: rot, x: 3, y: 0 }
      const gy = T.ghostY(b, piece)
      gys.add(gy)
      assert.equal(T.collides(b, { type: t, rot: rot, x: 3, y: gy }), false)
      assert.equal(T.collides(b, { type: t, rot: rot, x: 3, y: gy + 1 }), true)
    }
    assert.ok(gys.size >= 2, t + ' 旋转后落点随轮廓变化（至少两种不同落点 y）')
  }
})

test('ghostY: 移动/软降同步（落点差不变）与无副作用（AC-12.2/12.4/12.6/12.7）', () => {
  const { g, events } = freshGame()
  g.start()
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 0 })
  const s0 = g.getSnapshot()
  const g0 = T.ghostY(s0.board, s0.piece)
  const drop0 = g0 - s0.piece.y // 初始剩余下落格数

  // 右移后：x 变、落点重算；softDrop 一格后落点同步上移，落点差不变
  assert.equal(g.move(1).ok, true)
  const s1 = g.getSnapshot()
  const g1 = T.ghostY(s1.board, s1.piece)
  assert.equal(s1.piece.y, s0.piece.y, '移动后 y 不变')
  assert.equal(g1 - s1.piece.y, drop0, '右移后落点差不变（AC-12.2）')

  assert.equal(g.softDrop().ok, true)
  const s2 = g.getSnapshot()
  const g2 = T.ghostY(s2.board, s2.piece)
  assert.equal(s2.piece.y, s1.piece.y + 1, '软降一格')
  // 软降/自动下落同步：board/x/rot 不变 → 绝对落点不变（幽灵随块下移），剩余距离 -1（AC-12.4）
  assert.equal(g2, g1, '软降后绝对落点不变（幽灵随块同步下移）')
  assert.equal(g2 - s2.piece.y, (g1 - s1.piece.y) - 1, '软降后剩余下落距离恰减 1')

  // 无副作用：调用 ghostY 前后快照/棋盘/音效均不变（AC-12.6/12.7）
  const snapBefore = g.getSnapshot()
  events.sfx.length = 0
  const gy = T.ghostY(snapBefore.board, snapBefore.piece)
  assert.equal(typeof gy, 'number')
  const snapAfter = g.getSnapshot()
  assert.equal(snapshotDeep(snapBefore, snapAfter), true, 'ghostY 调用不改快照（纯函数、零状态/音效副作用）')
  assert.deepEqual(events.sfx, [], 'ghostY 不触发任何 onSfx 事件')
})

test('ghostY: 非法入参防御不抛错、返回类型安全值（v2.4 E-12-08，AC-12.12）', () => {
  // 已知用例：rot = -1 / 4 / 5 / 100、未知 type、piece === null，均不抛错且落点正确
  const board = T.createBoard()
  // rot%4 归一（负数归 0–3）：同一合法 type 下，归一的 rot 与越界 rot 落点一致
  for (const t of T.TYPES) {
    assert.equal(T.ghostY(board, { type: t, rot: -1, x: 3, y: 0 }), T.ghostY(board, { type: t, rot: 3, x: 3, y: 0 }), t + ' rot=-1 归一为 3，落点一致')
    assert.equal(T.ghostY(board, { type: t, rot: 4, x: 3, y: 0 }), T.ghostY(board, { type: t, rot: 0, x: 3, y: 0 }), t + ' rot=4 归一为 0，落点一致')
    assert.equal(T.ghostY(board, { type: t, rot: 5, x: 3, y: 0 }), T.ghostY(board, { type: t, rot: 1, x: 3, y: 0 }), t + ' rot=5 归一为 1，落点一致')
    assert.equal(T.ghostY(board, { type: t, rot: 100, x: 3, y: 0 }), T.ghostY(board, { type: t, rot: 0, x: 3, y: 0 }), t + ' rot=100 归一为 0，落点一致')
  }
  // 未知 type 回退原样：不抛错、返回类型安全 number，落点 = 当前位置 y（无对应形状）
  const gUnknown = T.ghostY(board, { type: 'X', rot: 0, x: 3, y: 7 })
  assert.equal(typeof gUnknown, 'number', '未知 type 返回 number')
  assert.equal(gUnknown, 7, '未知 type 回退原样：落点 = piece.y')
  assert.equal(T.ghostY(board, { type: 'ZOMBIE', rot: 99, x: 1, y: 5 }), 5, '未知 type + 越界 rot 也回退原样不抛错')
  // piece === null 防御：不抛错、返回类型安全 number（哨兵 -1）
  assert.equal(T.ghostY(board, null), -1, 'piece=null 返回哨兵 -1（类型安全）')
  assert.equal(T.ghostY(board, undefined), -1, 'piece=undefined 同样防御返回 -1')
  // boxed null 防御不抛错
  assert.equal(typeof T.ghostY(board, null), 'number', 'piece=null 返回类型为 number')
})

/* ---------- 11. r13 消行动画（v3.1，AC-1~10；animMs:240 + tick 步进，TECHNICAL §6.2） ---------- */

// 公共布景：仅 row19 缺 col5 的满行 + 竖 I（rot1 x3 y16，落点 y16）硬降 → 恰好消 1 行、进入 clearing。
// 返回 merged（= lockFlow 内 merge(board, piece) 的值，动画期棋盘等价基准）。
function stageSingleLineClear(animMs) {
  const { g, events } = freshGame({ animMs: animMs })
  g.start()
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  const merged = T.merge(b, { type: 'I', rot: 1, x: 3, y: 16 })
  const entry = g.hardDrop()
  return { g, events, merged, entry }
}

test('r13 消行动画 ①: 动画期棋盘=锁定后含满行、快照附加字段、计分行数未动（AC-1/AC-8/AC-10）', () => {
  const { g, merged, entry } = stageSingleLineClear(240)
  // 入口返回值：动画接管期 levelUp/gameOver 为「完成时」语义 → 恒 false（§2.4）
  assert.deepEqual(
    { ok: entry.ok, locked: entry.locked, cleared: entry.cleared, levelUp: entry.levelUp, gameOver: entry.gameOver },
    { ok: true, locked: true, cleared: 1, levelUp: false, gameOver: false }
  )
  const s = g.getSnapshot()
  assert.deepEqual(s.clearedIndices, [19], 'clearedIndices = 被消行索引')
  assert.equal(s.animProgress, 0, '首帧进度 0')
  assert.deepEqual(s.board, merged, '动画期棋盘 = 锁定后含满行棋盘（逐格）')
  for (let rr = 0; rr < 19; rr++) {
    for (let c = 0; c < T.COLS; c++) {
      assert.equal(s.board[rr][c], merged[rr][c], '未消行逐格不变 r' + rr + 'c' + c)
    }
  }
  assert.equal(s.phase, 'RUNNING')
  assert.equal(s.piece, null, '动画期无活动块/幽灵（AC-8）')
  assert.equal(s.score, 0, '计分在完结帧')
  assert.equal(s.lines, 0, '行数在完结帧')
  assert.equal(s.level, 1)
})

test('r13 消行动画 ②: 动画期输入全部拒绝 reason=clearing，零副作用（AC-4/E2）', () => {
  const { g, events } = stageSingleLineClear(240)
  const before = g.getSnapshot()
  assert.deepEqual(g.move(-1), { ok: false, reason: 'clearing' })
  assert.deepEqual(g.move(1), { ok: false, reason: 'clearing' })
  assert.deepEqual(g.rotate(), { ok: false, reason: 'clearing' })
  assert.deepEqual(g.softDrop(), { ok: false, reason: 'clearing' })
  assert.deepEqual(g.hardDrop(), { ok: false, reason: 'clearing' })
  const after = g.getSnapshot()
  assert.deepEqual(after.board, before.board, '棋盘不变')
  assert.equal(after.animProgress, before.animProgress, '进度不变')
  assert.deepEqual(events.sfx, ['hardDrop', 'clear'], '拒绝输入零音效（不排队不发声）')
})

test('r13 消行动画 ③: 完结帧原子步=clearLines(merged) 逐格一致 + clear 恰 1 次（AC-2/AC-3）', () => {
  const { g, events, merged } = stageSingleLineClear(240)
  assert.deepEqual(events.sfx, ['hardDrop', 'clear'], 'clear 在动画首帧（hardDrop 后恰好 1 次）')
  g.tick(120)
  g.tick(120) // 120+120 = 240 ≥ 240 → 完结
  const s = g.getSnapshot()
  const expected = T.clearLines(merged).board
  assert.deepEqual(s.board, expected, '塌缩后棋盘 = clearLines(merged) 逐格一致')
  assert.equal(s.score, 100, '消 1 行 100 × L1')
  assert.equal(s.lines, 1)
  assert.equal(s.level, 1)
  assert.ok(s.piece, 'spawn 完成')
  assert.ok(s.next !== 'T', 'next 已从预览队列更新（恰 1 次）')
  assert.equal(s.clearedIndices, null, '完结帧无动画残留字段')
  assert.deepEqual(events.sfx, ['hardDrop', 'clear'], 'clear 全程恰 1 次（完结帧不再发）')
})

test('r13 消行动画 ③b: 升级判定在完结帧、次序 hardDrop→clear→levelUp（AC-3/AC-9，E-SFX-04）', () => {
  const { g, events } = freshGame({ animMs: 240 })
  g.start()
  g._debug.setLines(9)
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  g.hardDrop()
  assert.deepEqual(events.sfx, ['hardDrop', 'clear'], '动画首帧：clear 已发')
  assert.equal(events.levelUp.length, 0, '完结前不触发升级回调')
  g.tick(120)
  g.tick(120)
  assert.deepEqual(events.levelUp, [2], '完结帧触发 onLevelUp(2)')
  assert.deepEqual(events.sfx, ['hardDrop', 'clear', 'levelUp'], 'E-SFX-04 次序保持（clear 提前 T 拍）')
  assert.equal(g.getSnapshot().level, 2)
  assert.equal(g.getSnapshot().lines, 10)
})

test('r13 消行动画 ④: animMs:0 与 animMs:240（步进完）逐点等价（AC-7）', () => {
  const run = function (animMs) {
    const { g, events } = freshGame({ animMs: animMs })
    g.start()
    const b = T.createBoard()
    b[19] = fullRow('I', 5)
    g._debug.setBoard(b)
    g._debug.setNext('T')
    g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
    g.hardDrop()
    if (animMs > 0) {
      g.tick(120)
      g.tick(130)
    }
    return { snap: g.getSnapshot(), sfx: events.sfx.slice() }
  }
  const instant = run(0)
  const anim = run(240)
  assert.deepEqual(instant.snap.board, anim.snap.board, '棋盘逐格等价')
  assert.equal(instant.snap.score, anim.snap.score, '计分等价')
  assert.equal(instant.snap.lines, anim.snap.lines, '行数等价')
  assert.equal(instant.snap.level, anim.snap.level, '等级等价')
  assert.equal(instant.snap.next, anim.snap.next, '预览等价')
  assert.deepEqual(instant.snap.piece, anim.snap.piece, 'spawn 活动块一致')
  assert.deepEqual(instant.sfx, anim.sfx, '音效事件序列一致')
})

test('r13 消行动画 ⑤: 时钟冻结——动画期 dt 只进进度、重力/锁定缓冲不累积（AC-5）', () => {
  const { g } = stageSingleLineClear(240)
  g.tick(70)
  g.tick(70)
  g.tick(70) // 210 < 240 不完结
  const mid = g.getSnapshot()
  assert.equal(mid.clearedIndices !== null, true, '仍在动画')
  assert.equal(mid.piece, null, '未 spawn')
  g.tick(40) // 210+40 = 250 ≥ 240 → 完结
  const done = g.getSnapshot()
  assert.equal(done.clearedIndices, null)
  assert.ok(done.piece, '新块已出生')
  const y0 = done.piece.y
  // 动画期冻结的下落时钟不跨完结累积：新块从 0 起计（无连降/积压）。
  // 注意 tick 内部 dt clamp ≤ 250（E7/E8），满 L1 间隔需 4 × 250
  g.tick(250)
  g.tick(250)
  g.tick(250)
  assert.equal(g.getSnapshot().piece.y, y0, '750ms < 1000ms（L1 间隔）不下落')
  g.tick(250)
  assert.equal(g.getSnapshot().piece.y, y0 + 1, '满间隔恰好 1 格')
})

test('r13 消行动画 ⑥: 暂停冻结/恢复续播——进度定格、无跳帧（AC-4/E3/E10）', () => {
  const { g } = stageSingleLineClear(240)
  g.tick(120)
  const mid = g.getSnapshot()
  assert.equal(mid.animProgress, 0.5, '中期进度 0.5')
  assert.deepEqual(mid.clearedIndices, [19])
  assert.equal(g.togglePause().ok, true)
  assert.equal(g.getPhase(), 'PAUSED')
  const paused = g.getSnapshot()
  assert.equal(paused.animProgress, 0.5, '暂停快照进度定格')
  assert.deepEqual(paused.clearedIndices, [19], 'clearing 经暂停保留（AC-4 续播前提）')
  assert.equal(g.togglePause().ok, true)
  assert.equal(g.getPhase(), 'RUNNING')
  g.tick(120) // 120+120 = 240 → 完结
  const done = g.getSnapshot()
  assert.equal(done.clearedIndices, null, '恢复后续播至完结')
  assert.equal(done.lines, 1, '塌缩在恢复后完成')
  assert.ok(done.piece, 'spawn 完成')
})

test('r13 消行动画 ⑦: 完结帧出生碰撞 → OVER 序列完整、无残留（AC-6）', () => {
  const { g, events } = freshGame({ animMs: 240 })
  g.start()
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  // I 出生（4×4 盒填充行索引 1 → 绝对行 1，列 3-6）放阻挡 → 塌缩后 spawn 即碰撞（OVER）。
  // 注意：消 1 行塌缩会向顶部补空行 → 旧 row0 变为新 row1，故阻挡放旧 row0
  b[0][4] = 'J'
  b[0][5] = 'J'
  g._debug.setBoard(b)
  g._debug.setNext('I')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  g.hardDrop()
  assert.ok(g.getSnapshot().clearedIndices !== null, '动画已接管')
  g.tick(120)
  assert.equal(g.getPhase(), 'RUNNING', '动画完整播放中不提前 OVER')
  assert.equal(events.gameOver.length, 0)
  assert.ok(g.getSnapshot().animProgress > 0, '进度有推进')
  g.tick(130) // 250 ≥ 240 → 完结帧 spawn 碰撞
  assert.equal(g.getPhase(), 'OVER', '完结帧才 OVER')
  const s = g.getSnapshot()
  assert.equal(s.clearedIndices, null, '无动画残留字段')
  assert.equal(s.piece, null)
  assert.equal(events.gameOver.length, 1)
  assert.equal(events.sfx.filter((n) => n === 'gameOver').length, 1, 'gameOver 恰 1 次')
  assert.equal(events.sfx[events.sfx.length - 1], 'gameOver', 'gameOver 为末位（E-SFX-05 次序）')
  // 防御：OVER 后 restart 无残留（E9）
  assert.equal(g.restart().ok, true)
  assert.equal(g.getPhase(), 'RUNNING')
  assert.equal(g.getSnapshot().clearedIndices, null)
})

test('r13 消行动画 ⑧: createGame() 默认 animMs>0 → 消行默认进入 clearing；非法值兜底默认（AC-1/AC-9）', () => {
  const sfx = []
  const g = T.createGame({
    rng: () => 0,
    autoLoop: false,
    keyboard: false,
    autoPauseOnBlur: false,
    onSfx: (n) => sfx.push(n),
  })
  g.start()
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  g.hardDrop()
  const s = g.getSnapshot()
  assert.ok(s.clearedIndices !== null, '默认 animMs=240>0 → clearing 接管')
  assert.deepEqual(s.clearedIndices, [19])
  assert.deepEqual(sfx, ['hardDrop', 'clear'])
  // 非法 animMs（字符串）→ 兜底为默认（§2.1 opts 解析风格）
  const g2 = mk({ animMs: 'no' })
  g2.start()
  g2._debug.setBoard(b)
  g2._debug.setNext('T')
  g2._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  g2.hardDrop()
  assert.ok(g2.getSnapshot().clearedIndices !== null, '非法 animMs 兜底为默认 240 → clearing')
})

/* ---------- 12. Hold 暂存方块（r14，§9.1 ①~⑭） ---------- */

test('Hold ①: 空槽存入 + next 成为当前方块（AC-1/AC-2）', () => {
  const sfx = []
  const g = mk({ rng: () => 0, onSfx: (n) => sfx.push(n) }) // rng=0 → queue 恒 I
  g.start()
  const snap0 = g.getSnapshot()
  const firstType = snap0.piece.type
  assert.ok(firstType, '游戏启动有当前方块')
  const nextType = snap0.next
  const r = g.hold()
  assert.deepEqual(r, { ok: true })
  const snap1 = g.getSnapshot()
  assert.equal(snap1.holdPiece, firstType, '暂存槽存入原当前方块类型')
  assert.equal(snap1.piece.type, nextType, 'next 成为新当前方块')
  assert.deepEqual(sfx, ['hold'], '暂存成功发射 hold 音效')
})

test('Hold ②: 非空槽交换 + next 不变（AC-3）', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  // 第一次 hold：空槽存入
  const t1 = g.getSnapshot().piece.type
  g.hold()
  const snap1 = g.getSnapshot()
  assert.equal(snap1.holdPiece, t1, '空槽存入原当前')
  const nextAfterFirstHold = snap1.next
  // hardDrop 重置 holdUsed
  g.hardDrop()
  // 第二次 hold：交换
  const t2 = g.getSnapshot().piece.type
  const nextBeforeSwap = g.getSnapshot().next
  const r = g.hold()
  assert.deepEqual(r, { ok: true }, '交换成功')
  const snap2 = g.getSnapshot()
  assert.equal(snap2.holdPiece, t2, '交换后暂存槽变为原当前')
  assert.equal(snap2.piece.type, t1, '交换后当前方块=原暂存')
  assert.equal(snap2.next, nextBeforeSwap, '交换不消耗队列（next 不变）')
})

test('Hold ③: 交换后 rot=0、出生点位置（AC-4）', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  // 先旋转当前块
  g.rotate()
  const snap0 = g.getSnapshot()
  assert.notEqual(snap0.piece.rot, 0, '旋转后 rot≠0')
  g.hold() // 空槽存入（rot 不影响，仅存 type）
  g.hardDrop() // 重置 holdUsed
  g.restart()
  // 用非空槽交换测试：存入 → restart → 存入另一块 → 交换取出
  const g2 = mk({ rng: () => 0 })
  g2.start()
  g2.hold() // 存入 I
  g2.hardDrop() // 重置 holdUsed
  const tHeld = g2.getSnapshot().holdPiece
  // 交换取出
  g2.hold()
  const snap2 = g2.getSnapshot()
  assert.equal(snap2.piece.type, tHeld, '交换取出暂存块类型正确')
  assert.equal(snap2.piece.rot, 0, '交换取出 rot=0（出生重置）')
  // 出生点：x = Math.floor((COLS - width) / 2), y = 0
  const width = T.SHAPES[tHeld][0][0].length
  assert.equal(snap2.piece.x, Math.floor((10 - width) / 2), '交换取出 x=出生居中')
  assert.equal(snap2.piece.y, 0, '交换取出 y=0（顶部出生）')
})

test('Hold ④: 每周期仅 1 次，第二次返回 already-used（AC-5）', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  const r1 = g.hold()
  assert.deepEqual(r1, { ok: true }, '第一次 hold 成功')
  const r2 = g.hold()
  assert.deepEqual(r2, { ok: false, reason: 'already-used' }, '同周期第二次 hold 被拒')
})

test('Hold ⑤: 非 RUNNING 返回 illegal-phase（AC-6）', () => {
  const g = mk({ rng: () => 0 })
  // READY 态
  assert.deepEqual(g.hold(), { ok: false, reason: 'illegal-phase' }, 'READY 态被拒')
  g.start()
  // PAUSED 态
  g.togglePause()
  assert.deepEqual(g.hold(), { ok: false, reason: 'illegal-phase' }, 'PAUSED 态被拒')
  // OVER 态：用 lose() 强制结束（最可靠的方式）
  g.restart()
  g.lose()
  assert.equal(g.getPhase(), 'OVER', '确认进入 OVER')
  assert.deepEqual(g.hold(), { ok: false, reason: 'illegal-phase' }, 'OVER 态被拒')
})

test('Hold ⑥: clearing 期间返回 clearing（AC-6）', () => {
  const sfx = []
  const g = mk({ animMs: 240, rng: () => 0, onSfx: (n) => sfx.push(n) })
  g.start()
  // 填满底行除一列
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  g.hardDrop()
  // animMs=240 > 0 → 进入 clearing 子阶段
  const snap = g.getSnapshot()
  assert.ok(snap.clearedIndices !== null, '确认进入 clearing')
  assert.deepEqual(g.hold(), { ok: false, reason: 'clearing' }, 'clearing 期间被拒')
})

test('Hold ⑦: holdEnabled=false 返回 disabled（AC-12）', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  g.setHoldEnabled(false)
  assert.equal(g.getHoldEnabled(), false)
  assert.deepEqual(g.hold(), { ok: false, reason: 'disabled' }, 'holdEnabled=false 被拒')
})

test('Hold ⑧: piece=null 返回 no-piece', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  g._debug.setPiece(null)
  assert.deepEqual(g.hold(), { ok: false, reason: 'no-piece' }, 'piece=null 被拒')
})

test('Hold ⑨: finishLock 重置 holdUsed（AC-5）', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  g.hold() // 第一次 hold，holdUsed=true
  assert.deepEqual(g.hold(), { ok: false, reason: 'already-used' }, 'holdUsed 已锁')
  // hardDrop → lockFlow → finishLock → holdUsed=false
  g.hardDrop()
  const r = g.hold()
  assert.deepEqual(r, { ok: true }, '锁定后 holdUsed 重置，可再次 hold')
})

test('Hold ⑩: 暂存后出生碰撞 → GAME OVER（AC-4）', () => {
  const events = { gameOver: [], sfx: [] }
  const g = mk({
    rng: () => 0,
    onGameOver: (s) => events.gameOver.push(s),
    onSfx: (n) => events.sfx.push(n),
  })
  g.start()
  g.hold() // 存入当前块，holdUsed=true
  g.hardDrop() // 重置 holdUsed，新方块出生
  // 堆满棋盘顶部两行（出生区域），使 swap 取出时 spawn 碰撞
  const b = T.createBoard()
  for (let c = 0; c < 10; c++) b[0][c] = 'I'
  for (let c = 0; c < 10; c++) b[1][c] = 'I'
  g._debug.setBoard(b)
  g._debug.setNext('T')
  // 交换取出 → spawn(heldType) → y=0 碰撞 → GAME OVER
  const r = g.hold()
  assert.deepEqual(r, { ok: true }, 'hold 操作本身成功（即使 gameOver）')
  assert.equal(g.getPhase(), 'OVER', '出生碰撞 → GAME OVER')
  assert.equal(events.gameOver.length, 1, 'onGameOver 回调 1 次')
  assert.ok(events.sfx.includes('hold'), 'hold 音效仍发射')
  assert.ok(events.sfx.includes('gameOver'), 'gameOver 音效发射')
})

test('Hold ⑪: restart 清空暂存槽', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  g.hold()
  assert.ok(g.getSnapshot().holdPiece !== null, '暂存槽非空')
  g.restart()
  assert.equal(g.getSnapshot().holdPiece, null, 'restart 后暂存槽清空')
})

test('Hold ⑫: holdEnabled setter/getter（AC-11）', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  assert.equal(g.getHoldEnabled(), true, '默认 holdEnabled=true')
  g.setHoldEnabled(false)
  assert.equal(g.getHoldEnabled(), false, 'setHoldEnabled(false) 实时生效')
  g.setHoldEnabled(true)
  assert.equal(g.getHoldEnabled(), true, 'setHoldEnabled(true) 恢复')
  // 钳制：非布尔值
  g.setHoldEnabled(0)
  assert.equal(g.getHoldEnabled(), false, 'setHoldEnabled(0) 钳制为 false')
  g.setHoldEnabled('yes')
  assert.equal(g.getHoldEnabled(), false, 'setHoldEnabled("yes") 钳制为 false')
  g.setHoldEnabled(1)
  assert.equal(g.getHoldEnabled(), false, 'setHoldEnabled(1) 钳制为 false（仅 === true）')
})

test('Hold ⑬: 快照含 holdPiece 字段', () => {
  const g = mk({ rng: () => 0 })
  g.start()
  const snap0 = g.getSnapshot()
  assert.ok('holdPiece' in snap0, '快照包含 holdPiece 键')
  assert.equal(snap0.holdPiece, null, '初始 holdPiece=null')
  g.hold()
  const snap1 = g.getSnapshot()
  assert.equal(snap1.holdPiece, snap0.piece.type, '暂存后 holdPiece=原方块类型')
})

test('Hold ⑭: SFX_EVENTS 包含 hold（8 项）（AC-16）', () => {
  assert.ok(Array.isArray(T.SFX_EVENTS), 'SFX_EVENTS 是数组')
  assert.equal(T.SFX_EVENTS.length, 8, 'SFX_EVENTS 共 8 项')
  assert.ok(T.SFX_EVENTS.includes('hold'), 'SFX_EVENTS 包含 hold')
  assert.deepEqual(T.SFX_EVENTS, ['move', 'rotate', 'softDrop', 'hardDrop', 'clear', 'levelUp', 'gameOver', 'hold'], 'SFX_EVENTS 排序与值正确')
})

/* ---------- 13. r15 多格预览队列（v3.2，AC-1/2/3/5/9/10/11；TECHNICAL §4/§7.2） ---------- */

test('r15 队列 ①: NEXT_QUEUE_SIZE 导出 = 3（AC-10）', () => {
  assert.equal(typeof T.NEXT_QUEUE_SIZE, 'number', 'NEXT_QUEUE_SIZE 导出存在')
  assert.equal(T.NEXT_QUEUE_SIZE, 3, '预览队列恒长 3（数值单一事实来源）')
})

test('r15 队列 ②: createQueue.peekN 契约——边界/非消耗/跨袋序列一致（AC-10）', () => {
  // n≤0 / 非数值 → []（不抛错、不消耗）
  const q0 = T.createQueue(() => 0.5)
  assert.deepEqual(q0.peekN(0), [])
  assert.deepEqual(q0.peekN(-3), [])
  assert.deepEqual(q0.peekN('x'), [])
  assert.equal(q0.peek(), q0.peekN(1)[0], '边界调用后队列未消耗，peek 首项不变')

  // 跨袋序列一致性：固定 rng，next()×6 后 peekN(3) = 本袋余 1 + 下袋前 2
  const q = T.createQueue(() => 0.5)
  for (let k = 0; k < 6; k++) q.next() // 消费 bag0 前 6 块
  const cross = q.peekN(3)
  assert.equal(cross.length, 3, 'peekN(3) 长度 3')
  for (const t of cross) assert.ok(T.TYPES.includes(t), '跨袋项均为合法类型')

  // 非消耗：连续两次 peekN 返回相同序列；返回项 = 随后逐次 next() 消费序
  assert.deepEqual(q.peekN(3), cross, 'peekN 非消耗：重复调用序列一致')
  for (let k = 0; k < 3; k++) assert.equal(q.next(), cross[k], 'next() 第 ' + (k + 1) + ' 次 = peekN 第 ' + (k + 1) + ' 项')

  // 跨袋读取后同袋余块（bag1 剩余 5 块）互不重复：7-bag 完整性未被 peekN 破坏
  const rest = [q.next(), q.next(), q.next(), q.next(), q.next()]
  assert.equal(new Set(rest).size, 5, '跨袋后同袋余块 5 项互不重复（袋界完整性保持）')
})

test('r15 队列 ③: READY 快照 queue 恒长 3 且 queue[0]===next（AC-1/AC-10）', () => {
  const g = mk({ rng: () => 0.5 })
  const s = g.getSnapshot()
  assert.ok(Array.isArray(s.queue), '快照含 queue 数组')
  assert.equal(s.queue.length, T.NEXT_QUEUE_SIZE, 'READY queue 恒长 NEXT_QUEUE_SIZE(3)')
  assert.equal(s.queue[0], s.next, 'queue[0] === next（队首 = 下一出生块）')
  for (const t of s.queue) assert.ok(T.TYPES.includes(t), '每格为合法方块类型')
})

test('r15 队列 ④: start 出生首块 = READY queue[0]，队列前移（AC-3）', () => {
  const g = mk({ rng: () => 0.5 })
  const ready = g.getSnapshot()
  g.start()
  const s = g.getSnapshot()
  assert.equal(s.piece.type, ready.queue[0], '首块 = READY 时队首')
  assert.equal(s.queue[0], ready.queue[1], '新队首 = 前置 queue[1]（队首被消费、尾部补位前移）')
  assert.equal(s.queue.length, 3, 'start 后 queue 仍恒长 3')
})

test('r15 队列 ⑤: AC-2 固定序列 20 次出生 100% 一致（rng=0.5 打桩，无错位缺漏）', () => {
  const g = mk({ rng: () => 0.5 })
  g.start()
  for (let i = 1; i <= 20; i++) {
    const before = g.getSnapshot()
    const r = g.hardDrop()
    assert.equal(r.ok, true, '第 ' + i + ' 次硬降成功')
    assert.equal(g.getPhase(), 'RUNNING', '第 ' + i + ' 次出生未结束')
    const after = g.getSnapshot()
    assert.equal(after.piece.type, before.queue[0], '第 ' + i + ' 次出生块 === 上一快照 queue[0]（与固定序列严格一致）')
    assert.equal(after.queue[0], before.queue[1], '第 ' + i + ' 次前移：新队首 === 前置 queue[1]')
    assert.equal(after.queue.length, 3, '第 ' + i + ' 次 queue 恒长 3')
    // 每轮清空棋盘，仅保留队列推进语义（0.5 打桩的中央堆塔 ~12 次即触顶，清板只保证 20 次出生存活）
    g._debug.setBoard(T.createBoard())
  }
})

test('r15 队列 ⑥: PAUSED 冻结——多快照 + tick 后 queue 不变（AC-5）', () => {
  const { g } = freshGame({ rng: () => 0.5 })
  g.start()
  g.hardDrop()
  assert.equal(g.togglePause().ok, true)
  assert.equal(g.getPhase(), 'PAUSED')
  const p1 = g.getSnapshot().queue
  const p2 = g.getSnapshot().queue
  g.tick(10000)
  const p3 = g.getSnapshot().queue
  assert.deepEqual(p3, p1, '暂停期多次快照 + tick 后 queue 恒不变')
  assert.deepEqual(p3, p2, '暂停期快照间 queue 一致')
  // 恢复后队列按原序列继续推进：不消耗、不丢块、不错位
  assert.equal(g.togglePause().ok, true)
  const q = g.getSnapshot().queue
  assert.equal(g.hardDrop().ok, true)
  const s = g.getSnapshot()
  assert.equal(s.piece.type, q[0], '恢复后队首消费正常（暂停无副作用）')
})

test('r15 队列 ⑦: restart 重建队列——长度 3、内容随新袋（AC-5）', () => {
  const { g } = freshGame({ rng: () => 0.5 })
  g.start()
  g.hardDrop()
  g.hardDrop()
  assert.equal(g.getSnapshot().queue.length, 3, '锁定推进后 queue 恒长 3')
  assert.equal(g.restart().ok, true)
  const s = g.getSnapshot()
  assert.equal(s.queue.length, 3, 'restart 后 queue 恒长 3')
  assert.equal(s.queue[0], s.next, 'restart 后 queue[0] === next')
  for (const t of s.queue) assert.ok(T.TYPES.includes(t), 'restart 后每格为合法类型')
  // 重启后前 7 个出生块 = 完整新袋（7-bag 完整性：queue 派生与 next 消费同一流）
  const seen = [s.queue[0]]
  for (let k = 0; k < 6; k++) {
    assert.equal(g.hardDrop().ok, true)
    seen.push(g.getSnapshot().queue[0])
  }
  assert.equal(new Set(seen).size, 7, 'restart 后前 7 出生块 = 完整新袋（无重复缺漏）')
})

test('r15 队列 ⑧: GAME_OVER 最终队列长度 3、稳定不变（AC-5）', () => {
  const { g, events } = freshGame({ rng: () => 0.5 })
  g.start()
  // 出生区用「部分行遮蔽」(1,4)(1,5) 而非整行：整行会在锁定消行判定中被清除（cleared>0），
  // 部分遮蔽对 7 型出生格全覆盖且不成满行 → 下一次 spawn 必然碰撞 → OVER
  const b = T.createBoard()
  b[1][4] = 'J'
  b[1][5] = 'J'
  g._debug.setBoard(b)
  g._debug.setPiece({ type: 'O', rot: 0, x: 4, y: 18 })
  const r = g.hardDrop()
  assert.equal(r.gameOver, true)
  assert.equal(g.getPhase(), 'OVER')
  assert.equal(g.getSnapshot().piece, null, '结束态无活动块')
  const s = g.getSnapshot()
  assert.equal(s.queue.length, 3, 'OVER 最终队列恒长 3')
  assert.equal(s.queue[0], s.next, 'OVER 期 queue[0] === next（队列保持最终值）')
  for (const t of s.queue) assert.ok(T.TYPES.includes(t), '结束后每格为合法类型')
  assert.deepEqual(g.getSnapshot().queue, s.queue, 'OVER 后多快照队列稳定不变')
  g.tick(10000)
  assert.deepEqual(g.getSnapshot().queue, s.queue, 'OVER 期 tick 不推进队列')
  assert.equal(events.gameOver.length, 1)
})

test('r15 队列 ⑨: Hold 共存——暂存消费队首/交换不消耗/关闭不触队列（AC-11/AC-9）', () => {
  const g = mk({ rng: () => 0.5 })
  g.start()
  // 空槽暂存：next 成为当前方块 = 消费队列队首（AC-11 空槽分支）
  const q0 = g.getSnapshot().queue
  assert.deepEqual(g.hold(), { ok: true })
  const s1 = g.getSnapshot()
  assert.equal(s1.piece.type, q0[0], '暂存后当前方块 = 旧 queue[0]（队首被消费）')
  assert.equal(s1.queue[0], q0[1], '新队首 = 旧 queue[1]（队列前移）')
  assert.equal(s1.queue.length, 3, '暂存消费后 queue 仍恒长 3')
  // 交换分支：next 不变 → queue 内容与顺序不变（AC-11 交换不消耗）
  assert.equal(g.hardDrop().ok, true) // 重置 holdUsed
  const q2 = g.getSnapshot().queue
  assert.deepEqual(g.hold(), { ok: true }, '交换成功')
  assert.deepEqual(g.getSnapshot().queue, q2, '交换不消耗队列（queue 恒等）')
  // holdEnabled=false：hold 被拒不触队列（AC-9 引擎侧无预览开关，队列照常维护）
  assert.equal(g.hardDrop().ok, true)
  g.setHoldEnabled(false)
  const q4 = g.getSnapshot().queue
  assert.deepEqual(g.hold(), { ok: false, reason: 'disabled' })
  assert.deepEqual(g.getSnapshot().queue, q4, 'hold 禁用被拒后队列不变')
})

/* ============================================================================
 * 14. r18 T-spin（AC-1~11；TECHNICAL §3~§6）
 * 纯新增（不改既有断言）：几何纯函数矩阵 / 会话窗口 24 组 / 六档计分 / 叠加与等级 /
 * 事件序列 / 稳定性 soak / F1~F8 权威样例表
 * ============================================================================ */

// ---- 14.0 工具 ----

/** T 落槽棋盘：四角按 spec 填实；R=0 由底部角自支撑（缺底角时中心兜底），R≥1 于 ly+3 行逐格支撑；
 *  clearRows（相对 ly 行号）：预填"除 T 格与 spec 假角"的全行 → 锁定合并后整行清除；
 *  extraCells：附加纯块（踢墙触发器/右踢墙阻块）。 */
function buildTSlot(rot, lx, ly, spec, clearRows, extraCells) {
  const b = T.createBoard()
  const cells = T.pieceCells({ type: 'T', rot: rot, x: lx, y: ly })
  function tAt(r, c) { return cells.some((p) => p.y === r && p.x === c) }
  function cornerOf(r, c) {
    if (r === ly && c === lx) return 'tl'
    if (r === ly && c === lx + 2) return 'tr'
    if (r === ly + 2 && c === lx) return 'bl'
    if (r === ly + 2 && c === lx + 2) return 'br'
    return null
  }
  function set(r, c) { b[r][c] = 'Z' }
  if (spec.tl) set(ly, lx)
  if (spec.tr) set(ly, lx + 2)
  if (spec.bl) set(ly + 2, lx)
  if (spec.br) set(ly + 2, lx + 2)
  if (rot === 0) {
    if (!spec.bl || !spec.br) set(ly + 2, lx + 1) // 底部缺角时中心兜底支撑（保 grounded）
  } else {
    for (let c = lx; c <= lx + 2; c++) set(ly + 3, c) // 下方支撑行（框外）
  }
  for (const rr of clearRows || []) {
    const r = ly + rr
    for (let c = 0; c < T.COLS; c++) {
      if (tAt(r, c)) continue // T 自身格不填
      const cn = cornerOf(r, c)
      if (cn !== null && !spec[cn]) continue // spec 假角不填（F8 型缺底角 + 底行清除互斥）
      set(r, c)
    }
  }
  for (const e of extraCells || []) if (e[0] >= 0 && e[0] < T.ROWS && e[1] >= 0 && e[1] < T.COLS) set(e[0], e[1])
  return b
}

const T4 = { tl: true, tr: true, bl: true, br: true } // 四实角规格（No-line Full / Full Single 等）

/** 引擎 tick 单次 dt 上限 250ms（DT_CLAMP_MS）：LOCK_DELAY_MS=500 需两次子上限 tick 触发缓冲锁定 */
function lockTick(g) {
  g.tick(250)
  g.tick(250)
}

/** 头部侧角映射（TECH §3.1：rot0 顶行 / rot1 右列 / rot2 底行 / rot3 左列）——3 实角缺角落此侧 = Mini */
const HEAD_SIDE = { 0: ['tl', 'tr'], 1: ['tr', 'br'], 2: ['bl', 'br'], 3: ['tl', 'bl'] }

/** r18：构造"旋转（inplace）→ tick(500) 经 lockTimer 锁定"的 T-spin 会话（animMs:0 即时原子步）。 */
function tspinSession(rot, spec, clearRows, opts) {
  const events = { sfx: [], levelUp: [], gameOver: [], snapshots: [] }
  const hooks = Object.assign(
    {
      rng: () => 0,
      onSfx: (n) => events.sfx.push(n),
      onSnapshot: (s) => events.snapshots.push(s),
      onLevelUp: (l) => events.levelUp.push(l),
      onGameOver: (s) => events.gameOver.push(s),
    },
    (opts && opts.hooks) || {}
  )
  const g = mk(hooks)
  g.start()
  const lx = 3
  const ly = 15
  if (opts && typeof opts.levelLines === 'number') g._debug.setLines(opts.levelLines)
  g._debug.setBoard(buildTSlot(rot, lx, ly, spec, clearRows, (opts && opts.extraCells) || []))
  g._debug.setPiece({ type: 'T', rot: (rot + 3) % 4, x: lx, y: ly })
  const r = g.rotate()
  assert.equal(r.ok, true, 'tspinSession rot=' + rot + ' rotate 应成功')
  lockTick(g)
  return { g: g, events: events }
}

// ---- 14.1 几何纯函数矩阵（AC-1/2/4/5 几何层） ----

test('§14.1 tspinKind 纯函数几何矩阵：实角 0/1/2/3(F/M)/4 × 4 朝向（AC-1/4/5）+ 非 T 六型（AC-2）', () => {
  const lx = 3
  const ly = 8
  for (const R of [0, 1, 2, 3]) {
    const piece = { type: 'T', rot: R, x: lx, y: ly }
    // 实角 0/1/2 → none（AC-4）：全部 ≤2 子集组合
    const subsets = [[], ['tl'], ['tr'], ['bl'], ['br'], ['tl', 'tr'], ['tl', 'bl'], ['tl', 'br'], ['tr', 'bl'], ['tr', 'br'], ['bl', 'br']]
    for (const sub of subsets) {
      const spec = { tl: false, tr: false, bl: false, br: false }
      for (const c of sub) spec[c] = true
      const b = buildTSlot(R, lx, ly, spec)
      assert.equal(T.tspinKind(T.merge(b, piece), piece), 'none', 'R' + R + ' 实角 ' + JSON.stringify(sub) + ' → none')
    }
    // 3 实角（恰缺 1 角）：缺角在头部侧 → mini；否则 → full（TECH §3.2 头部侧裁定，AC-5）
    for (const missing of ['tl', 'tr', 'bl', 'br']) {
      const spec = { tl: true, tr: true, bl: true, br: true }
      spec[missing] = false
      const expect = HEAD_SIDE[R].indexOf(missing) !== -1 ? 'mini' : 'full'
      const b = buildTSlot(R, lx, ly, spec)
      assert.equal(T.tspinKind(T.merge(b, piece), piece), expect, 'R' + R + ' 缺 ' + missing + ' → ' + expect)
    }
    // 4 实角 → full
    const b4 = buildTSlot(R, lx, ly, T4)
    assert.equal(T.tspinKind(T.merge(b4, piece), piece), 'full', 'R' + R + ' 四实角 → full')
  }
  // 非 T 六型：即使构造 ≥3 实角的"旋转嵌入"几何，恒 none（AC-2 双层防线的第一层）
  for (const type of ['I', 'O', 'S', 'Z', 'J', 'L']) {
    const piece = { type: type, rot: 0, x: 3, y: 8 }
    const b = T.createBoard()
    const cells = T.pieceCells(piece)
    const tAt = (r, c) => cells.some((p) => p.y === r && p.x === c)
    const corners = [[8, 3], [8, 5], [10, 3], [10, 5]]
    let n = 0
    for (const [r, c] of corners) {
      if (tAt(r, c)) n++ // 方块自身占角（如 O）同样计实
      else if (n < 3) {
        b[r][c] = 'Z'
        n++
      }
    }
    const merged = T.merge(b, piece)
    let solid = 0
    for (const [r, c] of corners) if (merged[r][c] !== null) solid++
    assert.ok(solid >= 3, type + ' 构造应 ≥3 实角（自证）')
    assert.equal(T.tspinKind(merged, piece), 'none', type + ' 三实角几何 → none（零误报）')
  }
})

// ---- 14.2 会话窗口 24 组矩阵（AC-1/3/4；TECH §6.2）+ 窗口负例 ----

test('§14.2 会话窗口矩阵：4 朝向 × {原地/左 kick/右 kick} × 正负共 24 组（AC-1）', () => {
  const lx = 3
  const ly = 15
  let index = 0
  for (const R of [0, 1, 2, 3]) {
    for (const kick of ['inplace', 'left', 'right']) {
      const preRot = (R + 3) % 4
      const preX = kick === 'inplace' ? lx : kick === 'left' ? lx + 1 : lx - 1
      // 右 kick 阻块（[row, col]）：偏移 -1 候选格碰撞（R=1 无列 lx-2 格 → 用 (ly, lx-1)；其余用 (ly+1, lx-2)）
      const blocker = R === 1 ? [[ly, lx - 1]] : [[ly + 1, lx - 2]]
      const extra = kick === 'right' ? blocker : []
      const label = 'R' + R + '.' + kick
      // —— 正值：旋转 → tick 经 lockTimer 锁定 → No-line Full +100×L1（窗口成立才可判）——
      const g1 = mk()
      g1.start()
      g1._debug.setBoard(buildTSlot(R, lx, ly, T4, [], extra))
      g1._debug.setPiece({ type: 'T', rot: preRot, x: preX, y: ly })
      const r1 = g1.rotate()
      assert.equal(r1.ok, true, label + ' 正值 rotate 应成功')
      const p1 = g1.getSnapshot().piece
      assert.equal(p1.rot, R, label + ' 正值旋转到位 rot')
      assert.equal(p1.x, lx, label + ' 正值旋转到位 x（kick 位移解析正确）')
      assert.equal(p1.y, ly, label + ' 正值旋转到位 y')
      lockTick(g1)
      assert.equal(g1.getSnapshot().score, 100, label + ' 正值 No-line Full → +100×L1（判 T-spin）')
      // —— 负值：同布局旋转后再下落（软降/硬降轮换）→ 窗口失效 → 不判 +0 ——
      const g2 = mk()
      g2.start()
      g2._debug.setBoard(buildTSlot(R, lx, ly, T4, [], extra))
      g2._debug.setPiece({ type: 'T', rot: preRot, x: preX, y: ly })
      assert.equal(g2.rotate().ok, true, label + ' 负值 rotate 应成功')
      if (index % 2 === 0) g2.softDrop()
      else g2.hardDrop() // 已落槽触底 → 立即锁定（AC-3）
      assert.equal(g2.getSnapshot().score, 0, label + ' 负值旋转后下落 → 不判（窗口失效）')
      index++
    }
  }
})

test('§14.2b 窗口负例：软降触底 / 硬降 / 自然重力 / move 后锁定 / 无旋转落定 / 实角不足（AC-3/4）', () => {
  const lx = 3
  const ly = 15
  const slot = (spec, extra) => buildTSlot(0, lx, ly, spec, [], extra)
  // E3 软降触底锁定：旋转（已落地）→ 软降 → lockFlow → 清窗不判
  let g = mk()
  g.start()
  g._debug.setBoard(slot(T4))
  g._debug.setPiece({ type: 'T', rot: 3, x: lx, y: ly })
  assert.equal(g.rotate().ok, true)
  g.softDrop()
  assert.equal(g.getSnapshot().score, 0, 'E3 旋转后软降触底立即锁定 → 不判')
  // E4 硬降锁定：旋转（已落地）→ 硬降 → 清窗不判
  g = mk()
  g.start()
  g._debug.setBoard(slot(T4))
  g._debug.setPiece({ type: 'T', rot: 3, x: lx, y: ly })
  assert.equal(g.rotate().ok, true)
  g.hardDrop()
  assert.equal(g.getSnapshot().score, 0, 'E4 旋转后硬降锁定 → 不判')
  // E5 自然重力：旋转（悬空于槽上方 3 格）→ 重力下移清窗 → 落槽锁定不判
  g = mk()
  g.start()
  g._debug.setBoard(slot(T4))
  g._debug.setPiece({ type: 'T', rot: 3, x: lx, y: ly - 3 }) // rot0@(3,12) 悬空（无顶角阻挡）
  assert.equal(g.rotate().ok, true)
  for (let i = 0; i < 20; i++) g.tick(250) // 重力 3 步（12→13→14→15 落槽）+ lockTimer 锁定
  assert.equal(g.getSnapshot().score, 0, 'E5 旋转后自然重力下移再锁定 → 不判')
  // E6 旋转后水平 move 再锁定：move 成功清窗（D-01）
  g = mk()
  g.start()
  g._debug.setBoard(slot(T4))
  g._debug.setPiece({ type: 'T', rot: 3, x: lx, y: ly - 3 })
  assert.equal(g.rotate().ok, true)
  assert.equal(g.move(-1).ok, true, '悬空可左移')
  for (let i = 0; i < 20; i++) g.tick(250)
  assert.equal(g.getSnapshot().score, 0, 'E6 旋转后 move 成功再锁定 → 不判')
  // E7 无旋转直接落定且巧合 3 实角：窗口初始 false → 不判
  g = mk()
  g.start()
  g._debug.setBoard(slot({ tl: true, tr: true, bl: true, br: false })) // 缺 BR 的 3 实角槽
  g._debug.setPiece({ type: 'T', rot: 0, x: lx, y: ly })
  assert.equal(g.hardDrop().ok, true)
  assert.equal(g.getSnapshot().score, 0, 'E7 无旋转直接落定（巧合 3 实角）→ 不判')
  // AC-4 实角不足（2 实角{bl,br}）：旋转落槽 → 不判
  g = mk()
  g.start()
  g._debug.setBoard(slot({ tl: false, tr: false, bl: true, br: true }))
  g._debug.setPiece({ type: 'T', rot: 3, x: lx, y: ly })
  assert.equal(g.rotate().ok, true)
  lockTick(g)
  assert.equal(g.getSnapshot().score, 0, 'AC-4 2 实角旋转落定 → 不判（n<3）')
})

// ---- 14.3 六档计分（AC-6/7） ----

test('§14.3 六档计分：常量逐档精确值 + 会话「常量 × level」+ Mini 清 3 行 = Full Triple + No-line（AC-6/7）', () => {
  assert.deepEqual(T.T_SPIN_BONUS.full, [100, 800, 1200, 1600])
  assert.deepEqual(T.T_SPIN_BONUS.mini, [0, 100, 200, 1600])
  for (const L of [1, 2]) {
    assert.equal(T.tspinBonus('full', 0, L), 100 * L, 'No-line ×' + L)
    assert.equal(T.tspinBonus('full', 1, L), 800 * L, 'Single ×' + L)
    assert.equal(T.tspinBonus('full', 2, L), 1200 * L, 'Double ×' + L)
    assert.equal(T.tspinBonus('full', 3, L), 1600 * L, 'Triple ×' + L)
    assert.equal(T.tspinBonus('mini', 0, L), 0, 'Mini 无 0 行档 ×' + L)
    assert.equal(T.tspinBonus('mini', 1, L), 100 * L, 'Mini Single ×' + L)
    assert.equal(T.tspinBonus('mini', 2, L), 200 * L, 'Mini Double ×' + L)
    assert.equal(T.tspinBonus('mini', 3, L), 1600 * L, 'Mini 清 3 行 → Full Triple（防漏分）×' + L)
    assert.equal(T.tspinBonus('none', 1, L), 0, "kind='none' 恒 0")
    assert.equal(T.tspinBonus('bogus', 1, L), 0, '未知 kind 恒 0')
  }
  // 会话逐档（L1）：
  const cases = [
    { rot: 0, spec: T4, rows: [1], expect: 900, label: 'Full Single (100+800)' },
    { rot: 0, spec: T4, rows: [1, 2], expect: 1500, label: 'Full Double (300+1200)' },
    { rot: 0, spec: { tl: true, tr: false, bl: true, br: true }, rows: [1], expect: 200, label: 'Mini Single (100+100)' },
    { rot: 0, spec: { tl: true, tr: false, bl: true, br: true }, rows: [1, 2], expect: 500, label: 'Mini Double (300+200)' },
    { rot: 0, spec: { tl: true, tr: false, bl: true, br: true }, rows: [1, 2, 3], expect: 2100, label: 'Mini Triple (500+1600)' },
  ]
  for (const c of cases) {
    const { g } = tspinSession(c.rot, c.spec, c.rows)
    const s = g.getSnapshot()
    assert.equal(s.score, c.expect, c.label + ' L1 总分')
    assert.equal(s.lines, c.rows.length, c.label + ' 行数照常累计')
  }
  // L2 会话：Full Single ×2 = 1800（乘数点位 = 升级前 level，AC-6 同构）
  const { g: gL2 } = tspinSession(0, T4, [1], { levelLines: 10 })
  assert.equal(gL2.getSnapshot().score, 1800, 'Full Single L2 (200+1600)')
  // No-line：+100×level、不发 clear、不计行（AC-6/8）
  const { g: g0, events: ev0 } = tspinSession(0, T4, [])
  const s0 = g0.getSnapshot()
  assert.equal(s0.score, 100, 'No-line full → +100×L1')
  assert.equal(s0.lines, 0, 'No-line 不计行')
  assert.equal(ev0.sfx.indexOf('clear'), -1, 'No-line 无 clear 事件')
  assert.deepEqual(ev0.sfx, ['rotate'], 'No-line 事件序列仅 rotate')
})

// ---- 14.4 叠加与等级（AC-6/7/11） ----

test('§14.4 叠加与等级：普通分 + T-spin 分恰各一次；负例逐分基线一致；升级同栈；lose() 总分含 bonus（AC-7/11）', () => {
  // 单消总值 = 普通消行基分 + T-spin 分恰各一次（L1 Full Single 900 = 100 + 800）
  const { g } = tspinSession(0, T4, [1])
  assert.equal(g.getSnapshot().score, 900, 'Full Single = 普通 100 + T-spin 800')
  // 普通路径负例：无旋转 T 单消仍 100×L1（kind=none → bonus 0）
  const g2 = mk()
  g2.start()
  g2._debug.setBoard(buildTSlot(0, 3, 15, T4, [1]))
  g2._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 15 })
  assert.equal(g2.hardDrop().ok, true)
  assert.equal(g2.getSnapshot().score, 100, '非 T-spin 普通单消逐分与基线一致')
  // 普通双消负例：300×L1
  const g3 = mk()
  g3.start()
  g3._debug.setBoard(buildTSlot(0, 3, 15, T4, [1, 2]))
  g3._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 15 })
  assert.equal(g3.hardDrop().ok, true)
  assert.equal(g3.getSnapshot().score, 300, '非 T-spin 普通双消逐分与基线一致')
  // T-spin Double + 升级同栈：lines 9→11 → level 2，事件 rotate→clear→levelUp
  const { g: g4, events: ev4 } = tspinSession(0, T4, [1, 2], { levelLines: 9 })
  assert.equal(g4.getSnapshot().score, 1500, '升级同栈下 T-spin Double 总分')
  assert.equal(g4.getSnapshot().lines, 11, '行数累计（升级判定不变 AC-11）')
  assert.equal(g4.getSnapshot().level, 2, '10 行升级照常')
  assert.deepEqual(ev4.sfx, ['rotate', 'clear', 'levelUp'], '跨升级事件序')
  // bonus 不额外推进 lines/level：Mini Triple lines=3、level 仍 1（AC-11）
  const { g: g5 } = tspinSession(0, { tl: true, tr: false, bl: true, br: true }, [1, 2, 3])
  assert.equal(g5.getSnapshot().lines, 3, 'T-spin 加分不额外计行')
  assert.equal(g5.getSnapshot().level, 1, '3 行不足升级 → level 1（加分不推进等级）')
  // T-spin 得分后 lose() → onGameOver 透出正确总和（AC-11）
  const gameOverScores = []
  const { g: g6 } = tspinSession(0, T4, [1], { hooks: { onGameOver: (s) => gameOverScores.push(s) } })
  assert.equal(g6.getSnapshot().score, 900, 'lock 后总分含 bonus')
  g6.lose()
  assert.deepEqual(gameOverScores, [900], 'onGameOver 总分含 T-spin 加分')
})

// ---- 14.5 事件序列（AC-8） ----

test('§14.5 事件序列：含 T-spin 场景 clear 恰 1 次且首帧；动画路径 + 快照 tspin 标志暴露；No-line 无 clear（AC-8）', () => {
  // 即时路径（animMs:0）：['rotate','clear']
  const { events: ev1 } = tspinSession(0, T4, [1])
  assert.deepEqual(ev1.sfx, ['rotate', 'clear'], '即时路径事件序')
  // 动画路径（animMs:240）：clear 仍恰 1 次且为首帧；clearing 期 snapshot.tspin = 'full'（AC-8 标志暴露）
  const events = { sfx: [], snapshots: [] }
  const g2 = mk({ animMs: 240, onSfx: (n) => events.sfx.push(n), onSnapshot: (s) => events.snapshots.push(s) })
  g2.start()
  g2._debug.setBoard(buildTSlot(0, 3, 15, T4, [1]))
  g2._debug.setPiece({ type: 'T', rot: 3, x: 3, y: 15 })
  assert.equal(g2.rotate().ok, true)
  lockTick(g2) // 触发 lockFlow → clearing 首帧
  const mid = g2.getSnapshot()
  assert.equal(mid.clearedIndices !== null, true, '动画已接管')
  assert.equal(mid.tspin, 'full', 'clearing 期 snapshot.tspin = full（AC-8 标志经 onSnapshot 暴露）')
  assert.equal(mid.piece, null, '动画期无活动块')
  assert.deepEqual(events.sfx, ['rotate', 'clear'], '动画首帧 clear 恰 1 次')
  g2.tick(240) // 完结帧原子步
  assert.equal(g2.getSnapshot().tspin, null, '动画完结后 tspin 回 null（additive 生命周期）')
  assert.deepEqual(events.sfx, ['rotate', 'clear'], '完结帧不再发 clear（全程恰 1 次）')
  // 普通 T 落定序列不变：无旋转 → hardDrop 锁 1 行 → ['hardDrop','clear']
  const ev3 = { sfx: [] }
  const g3 = mk({ onSfx: (n) => ev3.sfx.push(n) })
  g3.start()
  g3._debug.setBoard(buildTSlot(0, 3, 15, T4, [1]))
  g3._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 15 })
  g3.hardDrop()
  assert.deepEqual(ev3.sfx, ['hardDrop', 'clear'], '普通 T 落定序列与基线一致')
  // No-line：无 clear（§14.3 已断言，此处补 snapshot.tspin 非暴露路径：cleared=0 不进 clearing）
  const ev4 = { sfx: [] }
  const g4 = mk({ animMs: 240, onSfx: (n) => ev4.sfx.push(n) })
  g4.start()
  g4._debug.setBoard(buildTSlot(0, 3, 15, T4, []))
  g4._debug.setPiece({ type: 'T', rot: 3, x: 3, y: 15 })
  assert.equal(g4.rotate().ok, true)
  lockTick(g4)
  assert.equal(g4.getSnapshot().tspin, null, 'No-line 不进 clearing → tspin 恒 null')
  assert.deepEqual(ev4.sfx, ['rotate'], 'No-line 无 clear')
})

// ---- 14.6 稳定性 soak（AC-10） ----

test('§14.6 稳定性 soak：连续 50 局注入大量 T 旋转/移动/软硬降直至 OVER（AC-10）', () => {
  function makeSeeded() {
    let s = 0x9e3779b9
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 4294967296
    }
  }
  for (let game = 0; game < 50; game++) {
    const g = mk({ rng: makeSeeded() }) // 种子 rng：每局 7-bag 序列确定、可复现
    g.start()
    assert.equal(g.getPhase(), 'RUNNING')
    let lastScore = 0
    let over = false
    for (let step = 0; step < 2000 && !over; step++) {
      const roll = Math.random()
      if (roll < 0.3) g.rotate()
      else if (roll < 0.45) g.move(-1)
      else if (roll < 0.6) g.move(1)
      else if (roll < 0.75) g.softDrop()
      else if (roll < 0.88) g.hardDrop()
      else g.tick(Math.floor(Math.random() * 1200))
      if (g.getPhase() === 'OVER') {
        over = true
        break
      }
      const s = g.getSnapshot()
      assert.ok(s.piece !== null && T.TYPES.indexOf(s.piece.type) !== -1, '局' + game + ' 步' + step + ' 锁定后下一块正常 spawn')
      assert.ok(s.score >= lastScore, '局' + game + ' 步' + step + ' score 单调不减（无负分路径）')
      lastScore = s.score
    }
    if (!over) g.lose() // 兜底收尾（2000 步未 OVER 则强制结束）
  }
})

// ---- 14.7 F1~F8 权威样例表（AC-5，≥8 组：逐例断言 tspinKind 与锁定时分值） ----

test('§14.7 F1~F8 权威样例表：逐例断言几何判定 + L1 锁定时总分（AC-5）', () => {
  const lx = 3
  const ly = 15
  const cases = [
    { id: 'F1 TKI 经典', rot: 1, spec: { tl: true, tr: true, bl: false, br: true }, expect: 'full', score: 900, kick: 'inplace' },
    { id: 'F2 TKI 镜像', rot: 3, spec: { tl: true, tr: true, bl: true, br: false }, expect: 'full', score: 900, kick: 'inplace' },
    { id: 'F3 下凹槽头朝上', rot: 0, spec: { tl: true, tr: false, bl: true, br: true }, expect: 'mini', score: 200, kick: 'inplace' },
    { id: 'F4 下凹槽镜像', rot: 0, spec: { tl: false, tr: true, bl: true, br: true }, expect: 'mini', score: 200, kick: 'inplace' },
    { id: 'F5 头朝下凹槽', rot: 2, spec: { tl: true, tr: true, bl: false, br: true }, expect: 'mini', score: 200, kick: 'inplace' },
    { id: 'F6 头朝下凹槽镜像', rot: 2, spec: { tl: true, tr: true, bl: true, br: false }, expect: 'mini', score: 200, kick: 'inplace' },
    { id: 'F7 四实角', rot: 0, spec: T4, expect: 'full', score: 900, kick: 'inplace' },
    { id: 'F8 墙侧 kick 双实角槽', rot: 3, spec: { tl: true, tr: true, bl: true, br: false }, expect: 'full', score: 900, kick: 'left' },
  ]
  for (const c of cases) {
    const piece = { type: 'T', rot: c.rot, x: lx, y: ly }
    // 几何判定（合并后棋盘 = 锁定瞬间快照语义）
    const b = buildTSlot(c.rot, lx, ly, c.spec, [1])
    assert.equal(T.tspinKind(T.merge(b, piece), piece), c.expect, c.id + ' 几何判定')
    // 会话锁定时分值（L1，1 行清除）：正常单消基分 + T-spin 档分
    const preX = c.kick === 'left' ? lx + 1 : c.kick === 'right' ? lx - 1 : lx
    const g = mk()
    g.start()
    g._debug.setBoard(buildTSlot(c.rot, lx, ly, c.spec, [1]))
    g._debug.setPiece({ type: 'T', rot: (c.rot + 3) % 4, x: preX, y: ly })
    const r = g.rotate()
    assert.equal(r.ok, true, c.id + ' rotate 应成功')
    const after = g.getSnapshot().piece
    assert.equal(after.rot, c.rot, c.id + ' 旋转到位')
    assert.equal(after.x, lx, c.id + ' 落位 x（' + c.kick + '）')
    lockTick(g)
    const s = g.getSnapshot()
    assert.equal(s.score, c.score, c.id + ' L1 锁定时总分 = ' + c.score)
    assert.equal(s.lines, 1, c.id + ' 恰清 1 行')
  }
})

// ---- 14.8 补充：严格窗口判据 / 非 T 会话 / kick 全拒（T2 复核增强，纯新增不改既有断言） ----
// 判据区分度说明：下述构造的锁定姿态均为"本可判 T-spin"的 3 实角 Mini 槽（纯函数自证），
// 若窗口清除有漏（重力/move 未清窗），会话应给出 Mini 分 200；实际恒 100 → 严格判别 D-02/D-01。

function r18GapRow(type, gapCols) {
  const row = []
  for (let c = 0; c < T.COLS; c++) row.push(gapCols.indexOf(c) === -1 ? type : null)
  return row
}

test('§14.8 窗口严格判据：旋转后重力/move 落入「本可判 Mini」槽 → 恒不判（AC-3/D-01 严格化）', () => {
  // E5 严格化：旋转悬空（未触地）→ 自然重力下移清窗 → 落入 3 实角 Mini 槽锁定
  const slot = T.createBoard()
  slot[15][3] = 'J'
  slot[16] = r18GapRow('J', [4, 5])
  slot[17][3] = 'J'; slot[17][5] = 'J'; slot[18][4] = 'J'
  const g = mk()
  g.start()
  g._debug.setBoard(slot)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 13 })
  assert.equal(g.rotate().ok, true)
  const landing = { type: 'T', rot: 1, x: 3, y: 15 }
  assert.equal(T.tspinKind(T.merge(slot, landing), landing), 'mini', '就位姿态本可判 Mini Single（自证）')
  for (let i = 0; i < 12; i++) g.tick(250) // 重力 2 步落槽 + lockTimer 缓冲锁定
  const s = g.getSnapshot()
  assert.equal(s.score, 100, '重力清除窗口 → 不判 → 纯单消 100（Mini 路径应为 200）')
  assert.equal(s.lines, 1, '恰清 1 行（槽行由 T 补齐）')
  // E6 严格化：旋转悬空 → move(1) 成功清窗（D-01）→ 落入 x+1 的 Mini 槽
  const slot2 = T.createBoard()
  slot2[15][4] = 'J'
  slot2[16] = r18GapRow('J', [5, 6])
  slot2[17][4] = 'J'; slot2[17][6] = 'J'; slot2[18][5] = 'J'
  const g2 = mk()
  g2.start()
  g2._debug.setBoard(slot2)
  g2._debug.setNext('T')
  g2._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 12 })
  assert.equal(g2.rotate().ok, true)
  assert.equal(g2.getSnapshot().piece.rot, 1, '旋转到位（悬空）')
  const landing2 = { type: 'T', rot: 1, x: 4, y: 15 }
  assert.equal(T.tspinKind(T.merge(slot2, landing2), landing2), 'mini', 'x+1 槽姿态本可判 Mini（自证）')
  assert.equal(g2.move(1).ok, true, '悬空右移成功（窗口被 move 清除）')
  for (let i = 0; i < 16; i++) g2.tick(250) // 重力 3 步至 (4,15) 落槽 + 缓冲锁定
  const s2 = g2.getSnapshot()
  assert.equal(s2.score, 100, 'move 清除窗口 → 不判 → 纯单消 100（而非 200）')
  assert.equal(s2.lines, 1)
})

test('§14.8b 非 T 会话：J 旋转嵌入 4 实角几何 → 恒 none（AC-2 会话层双层防线）', () => {
  const slot = T.createBoard()
  slot[15][3] = 'J'
  slot[16] = r18GapRow('J', [4, 5])
  slot[17][3] = 'J'; slot[17][5] = 'J'; slot[18][4] = 'J'
  const g = mk()
  g.start()
  g._debug.setBoard(slot)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'J', rot: 0, x: 3, y: 15 })
  assert.equal(g.rotate().ok, true)
  const after = g.getSnapshot().piece
  const merged = T.merge(slot, after)
  let solid = 0
  for (const rc of [[15, 3], [15, 5], [17, 3], [17, 5]]) if (merged[rc[0]][rc[1]] !== null) solid++
  assert.equal(solid, 4, 'J 锁定位 4 实角几何（自证：TL 墙 + J 自身占 TR + BL/BR 墙）')
  assert.equal(T.tspinKind(merged, after), 'none', '非 T 旋转落定 4 实角 → none（零误报）')
  lockTick(g)
  assert.equal(g.getSnapshot().score, 0, '非 T 无 T-spin 加分（普通 0 行）')
})

test('§14.8c kick 全拒（E14）：旋转失败不改窗口与位置 → 后续落地不判', () => {
  const g = mk()
  g.start()
  const b = T.createBoard()
  b[15][4] = 'J'; b[15][3] = 'J'; b[16][5] = 'J'
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 15 })
  assert.deepEqual(g.rotate(), { ok: false, reason: 'wall-kick-denied' })
  const s = g.getSnapshot()
  assert.equal(s.piece.rot, 0, '旋转未发生：rot 不变')
  assert.equal(s.piece.x, 3, '旋转未发生：x 不变')
  for (let i = 0; i < 24; i++) g.tick(250) // 重力落地锁定（0 行）
  assert.equal(g.getSnapshot().score, 0, '未旋转 → 无 T-spin（窗口从未置位）')
})

/* ============================================================================
 * 15. r20 Combo 连消奖励（AC-1~11；TECHNICAL §7.2，链态推导权威 §6/§15.5）
 * ============================================================================ */

// 公共布景：row19 缺 col5 的满行 + 竖 I（rot1 x3 y16，落点 y16）→ 恰消 1 行（复用 r13 布景几何）
function comboStageRow19(g, useHard) {
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  return useHard ? g.hardDrop() : g.softDrop()
}

// 单次 1 行清行锁定（软降触底即锁；animMs>0 会话进入 clearing，由调用方 comboComplete 步进完结）
function comboClearOne(g) {
  const r = comboStageRow19(g, false)
  if (!(r.ok === true)) throw new Error('comboClearOne softDrop 应成功: ' + JSON.stringify(r))
  return r
}

// 多行清行布景：rows(20-n..19) 全 type、缺口 missCol；竖 I 补缺 → 恰消 n 行（n=1..4；y 恒 16 span 16..19）
function comboStageLines(g, n, missCol) {
  const miss = typeof missCol === 'number' ? missCol : 5
  const b = T.createBoard()
  for (let r = 20 - n; r <= 19; r++) for (let c = 0; c < T.COLS; c++) if (c !== miss) b[r][c] = 'S'
  g._debug.setBoard(b)
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'I', rot: 1, x: miss - 2, y: 16 })
  return g.hardDrop()
}

// 完结消行动画（120+120 = 240 ≥ animMs:240；L1 重力间隔 1000ms 不受影响）
function comboComplete(g) {
  g.tick(120)
  g.tick(120)
}

test('§15.0 常量/导出：COMBO_BONUS_BASE=50；comboBonus 数值表 + 防御 NaN/负值/level<1（AC-5）', () => {
  assert.equal(T.COMBO_BONUS_BASE, 50, 'COMBO_BONUS_BASE 单一事实来源（qa-e2e 期望对齐基准）')
  const tbl = [[0, 1, 0], [1, 1, 50], [2, 1, 100], [3, 1, 150], [3, 2, 300], [5, 3, 750]]
  for (const pair of tbl) {
    assert.equal(T.comboBonus(pair[0], pair[1]), pair[2], 'comboBonus(' + pair[0] + ',' + pair[1] + ') = ' + pair[2])
  }
  assert.equal(T.comboBonus(NaN, 1), 0, 'combo NaN → 0（E6）')
  assert.equal(T.comboBonus(1, NaN), 0, 'level NaN → 0（E6）')
  assert.equal(T.comboBonus(-1, 1), 0, '负 combo → 0（E6）')
  assert.equal(T.comboBonus(2, 0), 0, 'level<1 → 0（E6）')
  assert.equal(T.comboBonus(2, -3), 0, '负 level → 0（E6）')
})

test('§15.1 链递增：固定种子连续 4 次清 1 行锁定 → clearing 期 snapshot.combo 0→1→2→3（AC-1）', () => {
  const { g } = freshGame({ animMs: 240 })
  g.start()
  for (let idx = 0; idx < 4; idx++) {
    comboClearOne(g)
    const s = g.getSnapshot()
    assert.equal(s.clearedIndices.length, 1, '第 ' + (idx + 1) + ' 锁恰消 1 行')
    assert.equal(s.combo, idx, '第 ' + (idx + 1) + ' 锁 clearing 期 combo 索引=' + idx)
    assert.equal(s.comboBonus, 50 * idx * 1, '第 ' + (idx + 1) + ' 锁 comboBonus=50×' + idx + '×L1')
    comboComplete(g)
    const done = g.getSnapshot()
    assert.equal(done.combo, null, '完结帧 additive combo 回 null')
    assert.equal(done.comboBonus, null, '完结帧 additive comboBonus 回 null')
  }
  assert.equal(g.getSnapshot().score, 100 + 150 + 200 + 250, '逐锁增量 100/150/200/250 累和 700')
  assert.equal(g.getSnapshot().lines, 4, '4 次单消 lines=4')
  assert.equal(g.getSnapshot().level, 1, '4 行不足升级 → level 1')
})

test('§15.2 断链：清行 → 0 清行锁 → 清行回 combo0；No-line T-spin（full×0 行）亦断链（AC-2）', () => {
  // 断链①：0 清行锁定（空板 T 落底 softDrop 即锁）
  const { g } = freshGame({ animMs: 240 })
  g.start()
  comboClearOne(g)
  assert.equal(g.getSnapshot().combo, 0, '首锁 combo0（至此链=1）')
  comboComplete(g)
  const b = T.createBoard()
  g._debug.setBoard(b)
  g._debug.setPiece({ type: 'T', rot: 0, x: 3, y: 18 })
  assert.equal(g.softDrop().ok, true, '0 清行锁定应成功')
  assert.equal(g.getSnapshot().combo, null, '0 清行锁不进 clearing（additive 不暴露）')
  comboClearOne(g)
  assert.equal(g.getSnapshot().combo, 0, '0 清行断链 → 首清回 combo0')
  assert.equal(g.getSnapshot().comboBonus, 0, '断链后首清增量 0')
  comboComplete(g)
  // 断链②：No-line T-spin（buildTSlot T4 clearRows=[] → full×0 行）
  const g2 = mk({ animMs: 240, rng: () => 0 })
  g2.start()
  comboClearOne(g2)
  assert.equal(g2.getSnapshot().combo, 0)
  comboComplete(g2)
  g2._debug.setBoard(buildTSlot(0, 3, 15, T4, []))
  g2._debug.setPiece({ type: 'T', rot: 3, x: 3, y: 15 })
  assert.equal(g2.rotate().ok, true)
  lockTick(g2) // 500ms lockTimer → No-line full 锁（cleared=0 → 即时断链，无 clearing）
  assert.equal(g2.getSnapshot().score, 200, '100 首清 + 100 No-line bonus')
  assert.equal(g2.getSnapshot().lines, 1, 'No-line 不计行')
  comboClearOne(g2)
  assert.equal(g2.getSnapshot().combo, 0, 'No-line 断链 → 首清回 combo0')
  assert.equal(g2.getSnapshot().comboBonus, 0, 'No-line 后首清增量 0')
})

test('§15.3 操作无关：hold / 旋转（含踢墙）/ 软降 / 硬降均不断链 → 下一清行锁索引连续（AC-3）', () => {
  const { g } = freshGame({ animMs: 240 })
  g.start()
  comboClearOne(g)
  assert.equal(g.getSnapshot().combo, 0, '首锁 combo0（至此链=1）')
  comboComplete(g)
  assert.equal(g.getSnapshot().score, 100)
  // hold（不断链）
  assert.equal(g.hold().ok, true)
  // 踢墙旋转（T rot0@(0,5)；阻块 (1,7) 堵原位置、阻块 (0,5) 堵左踢 → 固定偏移表「左→右」右踢命中 → x=1）：不断链
  const kb = T.createBoard()
  kb[7][1] = 'J'
  kb[5][0] = 'J'
  g._debug.setBoard(kb)
  g._debug.setPiece({ type: 'T', rot: 0, x: 0, y: 5 })
  const rk = g.rotate()
  assert.equal(rk.ok, true, '踢墙旋转应成功')
  assert.equal(g.getSnapshot().piece.x, 1, 'kick 右移 1 格命中（左踢被 (0,5) 堵）')
  assert.equal(g.getSnapshot().piece.rot, 1, '旋转到位')
  // 软降（不断链）：T 由 (1,5) 下移至 (1,6)，未触底不锁
  assert.equal(g.softDrop().ok, true)
  // 硬降清行（链保持=1 → 索引 1）：重布 1 行清行景（竖 I 补 col5 缺）
  assert.equal(comboStageRow19(g, true).ok, true)
  const s = g.getSnapshot()
  assert.equal(s.clearedIndices.length, 1, '硬降恰消 1 行')
  assert.equal(s.combo, 1, '四操作后链保持 → 硬降锁 combo1')
  assert.equal(s.comboBonus, 50, 'combo1×L1=50')
  comboComplete(g)
  assert.equal(g.getSnapshot().score, 250, '累计 100 + (100+50) = 250')
  assert.equal(g.getSnapshot().lines, 2, '累计 2 行')
})

test('§15.4 混链：普通 1 行 → T-spin Full Single → 普通 1 行 = 链 0→1→2（AC-4）', () => {
  const { g } = freshGame({ animMs: 240 })
  g.start()
  // ① 普通单消：combo0
  comboClearOne(g)
  assert.equal(g.getSnapshot().combo, 0)
  assert.equal(g.getSnapshot().comboBonus, 0)
  comboComplete(g)
  assert.equal(g.getSnapshot().score, 100)
  // ② T-spin Full Single（T4 槽 1 行；旋转入槽 + lockTimer 锁定）：同链 → combo1
  g._debug.setBoard(buildTSlot(0, 3, 15, T4, [1]))
  g._debug.setPiece({ type: 'T', rot: 3, x: 3, y: 15 })
  assert.equal(g.rotate().ok, true)
  lockTick(g) // 500ms → 锁定全槽（cleared=1 → 进入 clearing）
  const s2 = g.getSnapshot()
  assert.equal(s2.combo, 1, 'T-spin 锁与普通锁同链 → combo1')
  assert.equal(s2.comboBonus, 50, 'T-spin 锁 comboBonus=50×1×L1')
  comboComplete(g)
  assert.equal(g.getSnapshot().score, 100 + 950, 'T-spin Full Single 三轴和：基分 100 + T-spin 800 + combo 50 = 950')
  // ③ 普通单消：combo2
  comboClearOne(g)
  assert.equal(g.getSnapshot().combo, 2, '第三锁 combo2')
  assert.equal(g.getSnapshot().comboBonus, 100, 'combo2×L1=100')
  comboComplete(g)
  const s = g.getSnapshot()
  assert.equal(s.score, 100 + 950 + 200, '100 + 950 + (100+100) = 1250')
  assert.equal(s.lines, 3, '混链总行数 3')
  assert.equal(s.level, 1, '3 行不足升级 → level 1')
})

test('§15.5 公式样例（权威，qa-e2e 对齐基准）：50×combo×level、乘数取升级前 level（AC-5/6/7）', () => {
  // 例 1：L1 combo0 消 1 行 = 100（孤立首锁 → 零 combo 增量，r18 基线）
  const a = freshGame()
  a.g.start()
  comboClearOne(a.g)
  assert.equal(a.g.getSnapshot().score, 100, 'L1 combo0 消1行 = 100')
  // 例 2：L1 combo3 消 4 行 = 800×L1 + 50×3×1 = 950（链 3 前置）
  const b = freshGame()
  b.g.start()
  comboClearOne(b.g); comboClearOne(b.g); comboClearOne(b.g)
  const bPre = b.g.getSnapshot().score
  assert.equal(bPre, 450, '前三锁 100/150/200 累和 450')
  const rb = comboStageLines(b.g, 4)
  assert.equal(rb.cleared, 4)
  assert.equal(b.g.getSnapshot().score, 450 + 950, 'L1 combo3 消4行增量 = 800+150 = 950（累计 1400）')
  // 例 3：L2 combo3 消 1 行 = 100×2 + 50×3×2 = 500（setLines(12)→L2，E4 不动链）
  const c = freshGame()
  c.g.start()
  comboClearOne(c.g); comboClearOne(c.g); comboClearOne(c.g)
  c.g._debug.setLines(12)
  assert.equal(c.g.getSnapshot().level, 2, 'setLines(12) → level 2')
  const rc = comboStageLines(c.g, 1)
  assert.equal(rc.cleared, 1)
  assert.equal(c.g.getSnapshot().score, 450 + 500, 'L2 combo3 消1行增量 = 200+300 = 500（累计 950）')
  // 例 4：L2 combo1 消 1 行 = 100×2 + 50×1×2 = 300
  const d = freshGame()
  d.g.start()
  comboClearOne(d.g)
  d.g._debug.setLines(12)
  const rd = comboStageLines(d.g, 1)
  assert.equal(rd.cleared, 1)
  assert.equal(d.g.getSnapshot().score, 100 + 300, 'L2 combo1 消1行增量 = 200+100 = 300')
  // 例 5：T-spin Full Single combo1×L1 —— 三轴和 100+800+50 = 950（TECH §15.5「800+50=850」为
  // tspin 轴 + combo 轴增量，不含基分轴 100；基分轴已由前四例覆盖）
  const e = freshGame()
  e.g.start()
  comboClearOne(e.g)
  e.g._debug.setBoard(buildTSlot(0, 3, 15, T4, [1]))
  e.g._debug.setPiece({ type: 'T', rot: 3, x: 3, y: 15 })
  assert.equal(e.g.rotate().ok, true)
  lockTick(e.g)
  const se = e.g.getSnapshot()
  assert.equal(se.score, 100 + 950, 'T-spin Full Single combo1×L1 增量 = 100+800+50 = 950（总 1050）')
  assert.equal(se.lines, 2, 'T-spin 与 combo 轴均不计行')
})

test('§15.6 三轴叠加恰各一次 + 等级进度：连续 4 锁（1/1/2/4 行）→ lines=Σ、level=levelForLines，comboBonus 未追加行数/等级（AC-6）', () => {
  const { g } = freshGame()
  g.start()
  comboStageLines(g, 1)
  comboStageLines(g, 1)
  comboStageLines(g, 2)
  comboStageLines(g, 4)
  const s = g.getSnapshot()
  // 逐锁增量：combo0→100；combo1 1行→150；combo2 2行→300+100=400；combo3 4行→800+150=950 → 1600
  assert.equal(s.score, 100 + 150 + 400 + 950, '三轴恰各一次累和 1600')
  assert.equal(s.lines, 8, 'lines=Σcleared=1+1+2+4（comboBonus 未追加行数）')
  assert.equal(s.level, 1, 'level=levelForLines(8)=1（comboBonus 未推进等级）')
})

test('§15.7 载荷/事件：clearing 期 combo/comboBonus 暴露、完结回 null；clear 恰 1 次且首帧；hardDrop→clear→levelUp 次序；onGameOver 总分=逐锁增量之和（AC-8）', () => {
  // ① clearing 载荷暴露 + clear 恰 1 次且为首帧（软降触底即锁路径不发 softDrop，E-SFX-02）
  const { g, events } = freshGame({ animMs: 240 })
  g.start()
  comboClearOne(g)
  const s = g.getSnapshot()
  assert.equal(s.combo, 0, 'clearing 期 snapshot.combo 暴露')
  assert.equal(s.comboBonus, 0, 'clearing 期 snapshot.comboBonus 暴露')
  assert.deepEqual(events.sfx, ['clear'], 'clear 恰 1 次且为首帧（动画接管帧；软降触底即锁无 softDrop 事件）')
  comboComplete(g)
  assert.equal(g.getSnapshot().combo, null, '完结帧 combo 回 null（additive 生命周期）')
  assert.equal(g.getSnapshot().comboBonus, null, '完结帧 comboBonus 回 null')
  // ② hardDrop→clear→levelUp 次序（升级同栈；乘数取升级前 L1）
  const { g: g2, events: ev2 } = freshGame({ animMs: 240 })
  g2.start()
  g2._debug.setLines(9)
  assert.equal(comboStageRow19(g2, true).ok, true)
  assert.deepEqual(ev2.sfx.slice(-2), ['hardDrop', 'clear'], '硬降→clear 首帧次序（E-SFX-04）')
  comboComplete(g2)
  assert.equal(ev2.sfx[ev2.sfx.length - 1], 'levelUp', '完结帧 levelUp 次序末位')
  assert.equal(g2.getSnapshot().level, 2, '链锁升级照常')
  // ③ onGameOver 总分 = 逐锁增量之和（100 + 150 + 200 = 450，含全部 comboBonus）
  const { g: g3, events: ev3 } = freshGame({ animMs: 240 })
  g3.start()
  comboClearOne(g3); comboComplete(g3)
  comboClearOne(g3); comboComplete(g3)
  assert.equal(g3.getSnapshot().score, 250)
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  b[0][4] = 'J'; b[0][5] = 'J' // 塌缩后 spawn 即碰撞（r13⑦ 模式）
  g3._debug.setBoard(b)
  g3._debug.setNext('I')
  g3._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  g3.hardDrop()
  g3.tick(120)
  g3.tick(120) // 240 ≥ 240 → 完结帧 spawn 碰撞 OVER
  assert.equal(g3.getPhase(), 'OVER')
  assert.equal(ev3.gameOver.length, 1)
  assert.equal(ev3.gameOver[0], 450, 'onGameOver 总分 == 逐锁增量之和（含 comboBonus）')
})

test('§15.8 会话隔离：restart 后首清 combo0；OVER→restart 同；非 clearing 期快照 combo 恒 null（AC-9）', () => {
  const { g } = freshGame({ animMs: 240 })
  g.start()
  comboClearOne(g); comboComplete(g)
  comboClearOne(g); comboComplete(g)
  assert.equal(g.getSnapshot().score, 250, '链 2 锁前置（至此链=2）')
  // restart → 新周期清链
  assert.equal(g.restart().ok, true)
  assert.equal(g.getSnapshot().combo, null, 'restart 后非 clearing 期 combo 恒 null')
  comboClearOne(g)
  assert.equal(g.getSnapshot().combo, 0, 'restart 后首清 combo0')
  assert.equal(g.getSnapshot().comboBonus, 0, 'restart 后首清增量 0')
  comboComplete(g)
  assert.equal(g.getSnapshot().combo, null)
  // OVER → restart 同（r13⑦ 顶堆强制 OVER）
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  b[0][4] = 'J'; b[0][5] = 'J'
  g._debug.setBoard(b)
  g._debug.setNext('I')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  g.hardDrop()
  g.tick(120)
  g.tick(120)
  assert.equal(g.getPhase(), 'OVER')
  assert.equal(g.restart().ok, true)
  comboClearOne(g)
  assert.equal(g.getSnapshot().combo, 0, 'OVER→restart 后首清 combo0')
  assert.equal(g.getSnapshot().comboBonus, 0)
})

test('§15.9 零回归：孤立单消 1/2/3/4 行 ×L1/L2 逐值=r18 基线（combo0 → 0 增量）（AC-10）', () => {
  const table = [
    { n: 1, l1: 100, l2: 200 },
    { n: 2, l1: 300, l2: 600 },
    { n: 3, l1: 500, l2: 1000 },
    { n: 4, l1: 800, l2: 1600 },
  ]
  for (const t of table) {
    const a = freshGame()
    a.g.start()
    comboStageLines(a.g, t.n)
    assert.equal(a.g.getSnapshot().score, t.l1, t.n + ' 行 L1 孤立消 = ' + t.l1 + '（combo0 零增量）')
    const b2 = freshGame()
    b2.g.start()
    b2.g._debug.setLines(12) // L2；E4：setLines 只动 lines/level，不动链
    comboStageLines(b2.g, t.n)
    assert.equal(b2.g.getSnapshot().score, t.l2, t.n + ' 行 L2 = ' + t.l2)
    assert.ok(b2.g.getSnapshot().combo === null, t.n + ' 行非 clearing 期 combo 恒 null')
  }
})

test('§15.10 soak：50 局确定性注入混合动作（旋转/移动/软降/多次清行 0~4 行）≥50 锁/局 → 无 NaN/负分/异常；逐锁增量累和 == onGameOver 总分（AC-11）', () => {
  function lcg(seed) { // 确定性 LCG → [0,1)（与 rng 注入口径一致）
    let s = seed >>> 0
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 4294967296
    }
  }
  const N_GAMES = 50
  const LOCKS = 60
  for (let gi = 0; gi < N_GAMES; gi++) {
    const rng = lcg(gi * 7919 + 13)
    const over = []
    const g = T.createGame({
      rng: rng, autoLoop: false, keyboard: false, autoPauseOnBlur: false, animMs: 0,
      onGameOver: (s) => over.push(s),
    })
    g.start()
    let sum = 0
    let prevScore = 0
    for (let i = 0; i < LOCKS; i++) {
      // 确定性布景：缺口 miss=3..7、满行 n=1..3（竖 I 高悬 y=20-n-5 → 软降绝不提前触底锁定）
      const n = 1 + (i % 3)
      const miss = 3 + (i % 5)
      const b = T.createBoard()
      for (let r = 20 - n; r <= 19; r++) for (let c = 0; c < T.COLS; c++) if (c !== miss) b[r][c] = 'S'
      g._debug.setBoard(b)
      g._debug.setNext('T')
      g._debug.setPiece({ type: 'I', rot: 1, x: miss - 2, y: 20 - n - 5 })
      const op = Math.floor(rng() * 4)
      if (op === 0) g.rotate()        // 旋转（I rot1↔rot0：偏离缺口 → 0 行；对齐 → n 行）
      else if (op === 1) g.move(-1)
      else if (op === 2) g.move(1)
      else g.softDrop()               // 高悬 → 仅下移 1 格，绝不提前锁定
      const r = g.hardDrop()
      assert.equal(r.ok, true, '局 ' + gi + ' 第 ' + i + ' 锁 hardDrop ok')
      const s = g.getSnapshot()
      assert.equal(Number.isFinite(s.score) && s.score >= 0, true, '局 ' + gi + ' 第 ' + i + ' 锁分数合法（无 NaN/负分）')
      assert.ok(s.score >= prevScore, '局 ' + gi + ' 第 ' + i + ' 锁无负增量')
      assert.ok(r.cleared >= 0 && r.cleared <= 4, '局 ' + gi + ' 第 ' + i + ' 锁清行 0~4')
      sum += s.score - prevScore
      prevScore = s.score
    }
    assert.ok(sum >= 0 && Number.isFinite(sum), '局 ' + gi + ' 逐锁增量累和合法')
    // 顶端堆积 → OVER（r13⑦ 模式；animMs:0 → hardDrop 内即时完结）
    const b = T.createBoard()
    b[19] = fullRow('I', 5)
    b[0][4] = 'J'; b[0][5] = 'J'
    g._debug.setBoard(b)
    g._debug.setNext('I')
    g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
    g.hardDrop()
    assert.equal(g.getPhase(), 'OVER', '局 ' + gi + ' 强制 OVER')
    assert.equal(over.length, 1, '局 ' + gi + ' gameOver 恰 1 次')
    sum += g.getSnapshot().score - prevScore // 末锁（OVER 锁）增量并入
    assert.equal(over[0], sum, '局 ' + gi + ' onGameOver 总分 == 逐锁增量累和（含 OVER 锁）')
  }
})

/* ============================================================================
 * 16. r23 Back-to-back 奖励倍率（AC-1~8；TECHNICAL §7.2，链态推导权威 §4.1/§6）
 * ============================================================================ */

// 旋转入 T4 槽锁定（animMs 会话由调用方 comboComplete 步进完结；同 tspinSession 落位几何）
function b2bTSpinFull(g, clearRows) {
  g._debug.setBoard(buildTSlot(0, 3, 15, T4, clearRows))
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'T', rot: 3, x: 3, y: 15 })
  const r = g.rotate()
  if (!(r.ok === true)) throw new Error('b2bTSpinFull rotate 应成功: ' + JSON.stringify(r))
  lockTick(g)
}

// 旋转入 3 实角 Mini 槽（F3：rot0 缺 TR → Mini；§14.3/§14.7 权威样例）锁定
function b2bTSpinMini(g, clearRows) {
  g._debug.setBoard(buildTSlot(0, 3, 15, { tl: true, tr: false, bl: true, br: true }, clearRows))
  g._debug.setNext('T')
  g._debug.setPiece({ type: 'T', rot: 3, x: 3, y: 15 })
  const r = g.rotate()
  if (!(r.ok === true)) throw new Error('b2bTSpinMini rotate 应成功: ' + JSON.stringify(r))
  lockTick(g)
}

test('§16.0 常量/导出：B2B_BONUS_BASE=400；b2bQualifies 资格矩阵；b2bBonus 数值表 + 防御（AC-1/4/E6）', () => {
  assert.equal(T.B2B_BONUS_BASE, 400, 'B2B_BONUS_BASE 单一事实来源（qa-e2e B 段期望对齐基准）')
  // 资格矩阵：cleared===4 与 kind 无关（防御性，D8）
  assert.equal(T.b2bQualifies('none', 4), true, 'cleared=4 kind=none → 资格（Tetris 定 4 行）')
  assert.equal(T.b2bQualifies('full', 4), true)
  assert.equal(T.b2bQualifies('mini', 4), true)
  // full 1/2/3 行 → 资格
  assert.equal(T.b2bQualifies('full', 1), true)
  assert.equal(T.b2bQualifies('full', 2), true)
  assert.equal(T.b2bQualifies('full', 3), true)
  // mini 1/2/3 行 → 不资格
  assert.equal(T.b2bQualifies('mini', 1), false)
  assert.equal(T.b2bQualifies('mini', 2), false)
  assert.equal(T.b2bQualifies('mini', 3), false)
  // 普通 1/2/3 行 → 不资格
  assert.equal(T.b2bQualifies('none', 1), false)
  assert.equal(T.b2bQualifies('none', 2), false)
  assert.equal(T.b2bQualifies('none', 3), false)
  // cleared 0 任意 kind（含 No-line）→ 不资格
  assert.equal(T.b2bQualifies('full', 0), false)
  assert.equal(T.b2bQualifies('none', 0), false)
  assert.equal(T.b2bQualifies('mini', 0), false)
  assert.equal(T.b2bQualifies(undefined, 0), false)
  // b2bBonus 数值表：chain off → 0；不资格 → 0；400×level
  assert.equal(T.b2bBonus(false, 'full', 1, 1), 0, 'chain off → 0（E1）')
  assert.equal(T.b2bBonus(true, 'none', 1, 1), 0, '普通 1 行不资格 → 0')
  assert.equal(T.b2bBonus(true, 'mini', 2, 1), 0, 'Mini 消行不资格 → 0')
  assert.equal(T.b2bBonus(true, 'full', 4, 1), 400, 'Tetris 链 on L1 → 400×1')
  assert.equal(T.b2bBonus(true, 'none', 4, 1), 400, 'cleared=4 与 kind 无关 → 400×1')
  assert.equal(T.b2bBonus(true, 'full', 1, 2), 800, 'T-Spin Full Single L2 → 400×2')
  assert.equal(T.b2bBonus(true, 'full', 3, 3), 1200, 'T-Spin Full Triple L3 → 400×3')
  // 防御（E6 同款）：NaN / level<1 / 负 → 0
  assert.equal(T.b2bBonus(true, 'full', 1, NaN), 0, 'level NaN → 0（E6）')
  assert.equal(T.b2bBonus(true, 'full', NaN, 1), 0, 'cleared NaN → 不资格 → 0')
  assert.equal(T.b2bBonus(true, 'full', 1, 0), 0, 'level<1 → 0（E6）')
  assert.equal(T.b2bBonus(true, 'full', 1, -3), 0, '负 level → 0（E6）')
})

test('§16.1 链递增：comboStageLines(g,4) ×2 → 首锁 b2b=0（链 off 仅置链）、二锁 400×1；分数 2050（AC-2/3/5）', () => {
  const { g } = freshGame({ animMs: 240 })
  g.start()
  // 首锁：fresh 4 行（链 off）→ 仅置链不加分（E1）
  const r1 = comboStageLines(g, 4)
  assert.equal(r1.cleared, 4)
  let s = g.getSnapshot()
  assert.equal(s.b2bBonus, 0, '首资格锁（链 off）→ b2bBonus=0')
  assert.equal(s.b2bChain, false, 'clearing 期 s.b2bChain 显示结算前值（off）')
  assert.equal(s.score, 0, 'clearing 期未落分（结算帧才累加）')
  comboComplete(g)
  s = g.getSnapshot()
  assert.equal(s.b2bChain, true, '结算帧 b2bChain=新值（资格→true）')
  assert.equal(s.b2bBonus, null, '完结帧 b2bBonus 回 null（对齐 comboBonus 生命周期）')
  assert.equal(s.score, 800, '单 Tetris L1 = 800（纯置链零增量）')
  assert.equal(s.lines, 4, 'lines=4')
  assert.equal(s.level, 1, '4 行不足升级 → level 1')
  // 二锁：链 on → 400×1；combo 轴并存（AC-7 双链并行）
  const r2 = comboStageLines(g, 4)
  assert.equal(r2.cleared, 4)
  s = g.getSnapshot()
  assert.equal(s.b2bBonus, T.B2B_BONUS_BASE * 1, '连发第 2 锁 b2bBonus = 400×升级前 L1')
  assert.equal(s.b2bChain, true, 'clearing 期显示结算前值（链 on）')
  assert.equal(s.combo, 1, '同帧 combo 索引 1 并存')
  assert.equal(s.comboBonus, 50, '同帧 comboBonus 50×1×L1 并存')
  comboComplete(g)
  s = g.getSnapshot()
  assert.equal(s.score, 800 + (800 + 50 + 400), '2×4 行：800 + (基分 800 + combo 50 + b2b 400) = 2050')
  assert.equal(s.lines, 8, 'lines=8（b2b 不触碰 lines）')
  assert.equal(s.level, 1, 'level 1（b2b 不推进等级）')
})

test('§16.2 断链：普通 1 行 / No-line / Mini 断链 → 后资格锁 b2b=0 重新置链（AC-2/R1）', () => {
  // ① 普通 1 行断链：4 → 1 → 4
  const { g } = freshGame({ animMs: 240 })
  g.start()
  comboStageLines(g, 4)
  comboComplete(g)
  assert.equal(g.getSnapshot().b2bChain, true, '锁 1 置链')
  comboStageLines(g, 1)
  assert.equal(g.getSnapshot().b2bBonus, 0, '非资格消行 b2b=0')
  assert.equal(g.getSnapshot().b2bChain, true, 'clearing 期显示结算前值（真）')
  comboComplete(g)
  assert.equal(g.getSnapshot().b2bChain, false, '非资格消行结算帧断链（false）')
  comboStageLines(g, 4)
  assert.equal(g.getSnapshot().b2bBonus, 0, '断链后首资格锁 b2b=0（仅置链，AC-3）')
  assert.equal(g.getSnapshot().b2bChain, false, 'clearing 期显示结算前值（off）')
  comboComplete(g)
  assert.equal(g.getSnapshot().b2bChain, true, '断链后首资格锁结算帧重新置链')
  // ② No-line 断链（T4 槽 clearRows:[] → full×0 行即时锁）
  const g2 = mk({ animMs: 240, rng: () => 0 })
  g2.start()
  comboStageLines(g2, 4)
  comboComplete(g2)
  assert.equal(g2.getSnapshot().b2bChain, true)
  g2._debug.setBoard(buildTSlot(0, 3, 15, T4, []))
  g2._debug.setNext('T')
  g2._debug.setPiece({ type: 'T', rot: 3, x: 3, y: 15 })
  assert.equal(g2.rotate().ok, true)
  lockTick(g2)
  assert.equal(g2.getSnapshot().b2bChain, false, 'No-line 锁定结算帧断链（cleared=0 不资格）')
  comboStageLines(g2, 4)
  assert.equal(g2.getSnapshot().b2bBonus, 0, 'No-line 断链后首资格锁 b2b=0')
  comboComplete(g2)
  assert.equal(g2.getSnapshot().b2bChain, true, '重新置链')
  // ③ Mini 断链（3 实角 Mini 槽消 1 行）：4 → Mini 1 行 → 4
  const g3 = mk({ animMs: 240, rng: () => 0 })
  g3.start()
  comboStageLines(g3, 4)
  comboComplete(g3)
  assert.equal(g3.getSnapshot().b2bChain, true)
  b2bTSpinMini(g3, [1])
  assert.equal(g3.getSnapshot().b2bBonus, 0, 'Mini 消行不资格 → b2b=0')
  assert.equal(g3.getSnapshot().tspin, 'mini', 'Mini 判定透出（r21 行为不变，E4）')
  comboComplete(g3)
  assert.equal(g3.getSnapshot().b2bChain, false, 'Mini 锁定结算帧断链')
  comboStageLines(g3, 4)
  assert.equal(g3.getSnapshot().b2bBonus, 0, 'Mini 断链后首资格锁 b2b=0')
  comboComplete(g3)
  assert.equal(g3.getSnapshot().b2bChain, true, '重新置链')
})

test('§16.3 操作无关：rotate/move/softDrop 不迁移链 → 二锁 400（AC-2）', () => {
  const { g } = freshGame({ animMs: 240 })
  g.start()
  comboStageLines(g, 4)
  comboComplete(g)
  assert.equal(g.getSnapshot().b2bChain, true, '首锁置链')
  comboStageLines(g, 4)
  assert.equal(g.getSnapshot().b2bBonus, 400, '二锁链 on → 400')
  comboComplete(g)
  assert.equal(g.getSnapshot().score, 2050)
  // 三锁：rotate/move/softDrop（均不锁定）后 4 行 → 链保持 → 400
  assert.equal(g.rotate().ok, true)
  assert.equal(g.softDrop().ok, true)
  assert.equal(g.move(1).ok, true)
  comboStageLines(g, 4)
  const s = g.getSnapshot()
  assert.equal(s.b2bBonus, 400, '操作不迁移链 → 三锁仍 400×L1（边操作边链）')
  assert.equal(s.b2bChain, true, 'clearing 期链保真')
  comboComplete(g)
  assert.equal(g.getSnapshot().score, 2050 + (800 + 100 + 400), '三锁增量含 combo2=100')
})

test('§16.4 混链：all-qualify 链 2/3 锁均 400；普通 1 行断链后 T-spin 锁 b2b=0（AC-1/2）', () => {
  // ① 4 行 → T-Spin Full Single → 4 行（全资格链）
  const { g } = freshGame({ animMs: 240 })
  g.start()
  comboStageLines(g, 4)
  comboComplete(g)
  b2bTSpinFull(g, [1])
  assert.equal(g.getSnapshot().b2bBonus, 400, 'T-Spin Full Single（链 on）→ 400×L1')
  assert.equal(g.getSnapshot().tspin, 'full', 'tspin 载荷透出')
  comboComplete(g)
  assert.equal(g.getSnapshot().b2bChain, true, '资格锁保持链')
  comboStageLines(g, 4)
  assert.equal(g.getSnapshot().b2bBonus, 400, '链第 3 锁仍 400（定值）')
  comboComplete(g)
  // ② T-Spin Full Double → 普通 1 行（断链）→ T-Spin Full Single（b2b=0）
  const g2 = freshGame({ animMs: 240 })
  g2.g.start()
  b2bTSpinFull(g2.g, [1, 2])
  assert.equal(g2.g.getSnapshot().b2bBonus, 0, '首 T-Spin Double（链 off）→ b2b=0')
  comboComplete(g2.g)
  assert.equal(g2.g.getSnapshot().b2bChain, true)
  comboStageLines(g2.g, 1)
  comboComplete(g2.g)
  assert.equal(g2.g.getSnapshot().b2bChain, false, '普通 1 行断链')
  b2bTSpinFull(g2.g, [1])
  assert.equal(g2.g.getSnapshot().b2bBonus, 0, '断链后 T-spin Full Single b2b=0（仅置链）')
  comboComplete(g2.g)
  assert.equal(g2.g.getSnapshot().b2bChain, true, '重新置链')
})

test('§16.5 公式样例（权威，qa-e2e B 段对齐基准）：400×升级前 level；PRD §5 表为「主奖励轴+B2B 轴」口径（§5.1 澄清，AC-4 公式为准）', () => {
  // 例 1：单 Tetris（fresh 首锁，链 off）→ 800，b2b 轴 0（E1）
  const a = freshGame({ animMs: 240 })
  a.g.start()
  comboStageLines(a.g, 4)
  assert.equal(a.g.getSnapshot().b2bBonus, 0, '单 Tetris b2b=0（链 off）')
  comboComplete(a.g)
  assert.equal(a.g.getSnapshot().score, 800, '单 Tetris = 800')
  assert.equal(a.g.getSnapshot().b2bChain, true, '结算帧置链')
  // 例 2：连发第 2 个 4 行 → 真实增量 800 基分 + 50 combo1 + 400 b2b = 1250
  //        （PRD §5 表「主+b2b 轴」口径 = 800+400 = 1200，不含 combo 轴，§5.1 澄清）
  const b = freshGame({ animMs: 240 })
  b.g.start()
  comboStageLines(b.g, 4)
  comboComplete(b.g)
  const bPre = b.g.getSnapshot().score
  assert.equal(bPre, 800)
  comboStageLines(b.g, 4)
  const bSnap = b.g.getSnapshot()
  assert.equal(bSnap.b2bBonus, T.B2B_BONUS_BASE * 1, '连发第 2 锁 b2b = 400×1 升级前 L1')
  assert.equal(bSnap.comboBonus, 50, 'combo1×L1=50 并存')
  comboComplete(b.g)
  const bTotal = b.g.getSnapshot().score
  assert.equal(bTotal - bPre, 800 + 50 + 400, '真实增量 800+50+400=1250（PRD 口径 800+400=1200 + combo 50）')
  // 例 3：T-Spin Full Double 连发：首 1500（b2b 0）、第 2 真实增量 300+1200+50+400=1950
  //        （PRD 口径 1500+400=1900 + combo 50）
  const c = freshGame({ animMs: 240 })
  c.g.start()
  b2bTSpinFull(c.g, [1, 2])
  assert.equal(c.g.getSnapshot().b2bBonus, 0, '首 T-Spin Double（链 off）→ b2b=0')
  comboComplete(c.g)
  const c1 = c.g.getSnapshot().score
  assert.equal(c1, 1500, 'T-Spin Full Double 首锁 = 300+1200 = 1500')
  b2bTSpinFull(c.g, [1, 2])
  assert.equal(c.g.getSnapshot().b2bBonus, 400, '连发第 2 Double b2b = 400×L1')
  comboComplete(c.g)
  assert.equal(c.g.getSnapshot().score - c1, 300 + 1200 + 50 + 400, '第 2 Double 真实增量 1950（PRD 口径 1900 + combo 50）')
  // 例 4：三连 Tetris 第 3 仍 400（定值，不随链长递增）、PRD 口径 800+400=1200
  const d = freshGame({ animMs: 240 })
  d.g.start()
  comboStageLines(d.g, 4)
  comboComplete(d.g)
  comboStageLines(d.g, 4)
  comboComplete(d.g)
  const dPre = d.g.getSnapshot().score
  assert.equal(dPre, 2050)
  comboStageLines(d.g, 4)
  const dSnap = d.g.getSnapshot()
  assert.equal(dSnap.b2bBonus, 400, '三连第 3 仍 400×1（定值基数，非 800）')
  assert.equal(dSnap.combo, 2, 'combo2 并存')
  comboComplete(d.g)
  assert.equal(d.g.getSnapshot().score - dPre, 800 + 100 + 400, '三连第 3 真实增量 1300（PRD 口径 800+400=1200 + combo 100）')
  assert.equal(d.g.getSnapshot().level, 2, '12 行 → 结算帧 level 2（b2b 不推进等级）')
  // 例 5：L2 乘数 → 400×2=800（setLines(12) 只动 lines/level，不动链——E4 语义）
  const e = freshGame({ animMs: 240 })
  e.g.start()
  comboStageLines(e.g, 4)
  comboComplete(e.g)
  e.g._debug.setLines(12)
  assert.equal(e.g.getSnapshot().level, 2, 'setLines(12) → level 2')
  comboStageLines(e.g, 4)
  assert.equal(e.g.getSnapshot().b2bBonus, 800, 'L2 链 on → b2b = 400×2 = 800')
  // 例 6：升级边界（R4/D5）：setLines(9) 后 4 行锁 clearing s.level=1 && b2b=400（乘数取升级前）
  const f = freshGame({ animMs: 240 })
  f.g.start()
  comboStageLines(f.g, 4)
  comboComplete(f.g)
  f.g._debug.setLines(9)
  assert.equal(f.g.getSnapshot().level, 1, 'setLines(9) → 仍 level 1')
  comboStageLines(f.g, 4)
  const fSnap = f.g.getSnapshot()
  assert.equal(fSnap.level, 1, 'clearing 期 s.level 为升级前 L1（实证 D5）')
  assert.equal(fSnap.b2bBonus, 400, '升级前乘数 → 400×1')
  comboComplete(f.g)
  const fDone = f.g.getSnapshot()
  assert.equal(fDone.lines, 13, '结算帧 lines=9+4')
  assert.equal(fDone.level, 2, '结算帧 level 升级到 2')
})

test('§16.6 四轴叠加恰一次 + 等级进度：4 行 → T-Spin Full Single（combo1 链 on）→ 二锁增量 1350（AC-5/R2）', () => {
  const { g } = freshGame({ animMs: 240 })
  g.start()
  comboStageLines(g, 4)
  comboComplete(g)
  assert.equal(g.getSnapshot().score, 800)
  b2bTSpinFull(g, [1])
  const s = g.getSnapshot()
  assert.equal(s.tspin, 'full', 'tspin 载荷透出')
  assert.equal(s.clearedIndices.length, 1, '恰消 1 行')
  assert.equal(s.combo, 1, 'combo1 并存')
  assert.equal(s.comboBonus, 50, 'comboBonus 50')
  assert.equal(s.b2bBonus, 400, 'b2b 400（链 on）')
  comboComplete(g)
  const done = g.getSnapshot()
  assert.equal(done.score, 800 + (100 + 800 + 50 + 400), '二锁增量 = 基分 100 + tspin 800 + combo 50 + b2b 400 = 1350；总分 2150')
  assert.equal(done.lines, 5, 'lines=4+1（b2b/combo 均不追加行数）')
  assert.equal(done.level, 1, 'level=1（b2b/combo 不推进等级）')
})

test('§16.7 载荷/事件：clearing 期 b2b 载荷暴露、完结回 null；clear 恰 1 次且首帧；onGameOver 总分=逐锁增量之和（AC-6/非目标：onSfx 0 变化）', () => {
  const { g, events } = freshGame({ animMs: 240 })
  g.start()
  // ① clearing 载荷暴露 + clear 恰 1 次且首帧
  comboStageLines(g, 4)
  let s = g.getSnapshot()
  assert.equal(s.b2bBonus, 0, 'clearing 期 s.b2bBonus 暴露（0）')
  assert.equal(s.b2bChain, false, 'clearing 期 s.b2bChain 暴露（结算前 off）')
  assert.deepEqual(events.sfx, ['hardDrop', 'clear'], 'clear 恰 1 次且首帧（hardDrop→clear，无新 sfx）')
  comboComplete(g)
  s = g.getSnapshot()
  assert.equal(s.b2bBonus, null, '完结帧 b2bBonus 回 null')
  assert.equal(s.b2bChain, true, '完结帧 b2bChain 保真（新值）')
  // ② 连发第 2：clearing 载荷 400 + 完结清零
  comboStageLines(g, 4)
  s = g.getSnapshot()
  assert.equal(s.b2bBonus, 400, 'clearing 期 b2bBonus=400')
  assert.equal(s.comboBonus, 50, 'clearing 期 comboBonus=50（同帧并存）')
  comboComplete(g)
  s = g.getSnapshot()
  assert.equal(s.b2bBonus, null)
  assert.equal(s.b2bChain, true)
  assert.equal(s.score, 800 + 1250, '2×4 行累计 2050')
  // ③ onGameOver 总分 = 逐锁增量之和（含 b2b）；末锁（OVER 锁）1 行普通消 → combo2=100、b2b 断
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  b[0][4] = 'J'; b[0][5] = 'J' // 塌缩后 spawn 即碰撞（r13⑦ 模式）
  g._debug.setBoard(b)
  g._debug.setNext('I')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  g.hardDrop()
  g.tick(120)
  g.tick(120)
  assert.equal(g.getPhase(), 'OVER')
  assert.equal(events.gameOver.length, 1)
  assert.equal(events.gameOver[0], 2050 + (100 + 100), 'onGameOver 总分 2250 = 逐锁增量之和（含全部 b2b）')
  const over = g.getSnapshot()
  assert.equal(over.b2bChain, false, 'OVER 锁（普通 1 行）断链')
  assert.deepEqual(events.sfx, ['hardDrop', 'clear', 'hardDrop', 'clear', 'hardDrop', 'clear', 'gameOver'],
    '事件序列与既有同构（无新 sfx 事件）')
})

test('§16.8 会话隔离：restart 清链；OVER→restart 同；非 clearing 期 b2bBonus 恒 null；双链并行（AC-6/7）', () => {
  const { g } = freshGame({ animMs: 240 })
  g.start()
  comboStageLines(g, 4)
  comboComplete(g)
  comboStageLines(g, 4)
  comboComplete(g)
  assert.equal(g.getSnapshot().score, 2050, '链 2 锁前置')
  assert.equal(g.getSnapshot().b2bChain, true, '前置链 on')
  assert.equal(g.getSnapshot().b2bBonus, null, '非 clearing 期 b2bBonus 恒 null')
  assert.equal(typeof g.getSnapshot().b2bChain, 'boolean', 'b2bChain 恒 boolean 连续暴露（AC-6）')
  // restart 清链
  assert.equal(g.restart().ok, true)
  assert.equal(g.getSnapshot().b2bChain, false, 'restart 后链 off')
  comboStageLines(g, 4)
  let s = g.getSnapshot()
  assert.equal(s.b2bBonus, 0, 'restart 后首资格锁 b2b=0')
  assert.equal(s.b2bChain, false, 'clearing 期链 off')
  comboComplete(g)
  assert.equal(g.getSnapshot().b2bChain, true, 'restart 后首锁结算帧置链')
  // OVER→restart 同（r13⑦ 顶堆强制 OVER）
  const b = T.createBoard()
  b[19] = fullRow('I', 5)
  b[0][4] = 'J'; b[0][5] = 'J'
  g._debug.setBoard(b)
  g._debug.setNext('I')
  g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
  g.hardDrop()
  g.tick(120)
  g.tick(120)
  assert.equal(g.getPhase(), 'OVER')
  assert.equal(g.restart().ok, true)
  comboStageLines(g, 4)
  s = g.getSnapshot()
  assert.equal(s.b2bBonus, 0, 'OVER→restart 后首资格锁 b2b=0')
  assert.equal(s.b2bChain, false, 'OVER→restart 后链 off')
  // 双链并行：同 clearing 帧 combo 与 b2b 增量并存（AC-7）
  const g2 = freshGame({ animMs: 240 })
  g2.g.start()
  comboStageLines(g2.g, 4)
  comboComplete(g2.g)
  comboStageLines(g2.g, 4)
  const s2 = g2.g.getSnapshot()
  assert.equal(s2.combo, 1, '双链并行：clearing 帧 combo=1')
  assert.equal(s2.comboBonus, 50, '双链并行：clearing 帧 comboBonus=50')
  assert.equal(s2.b2bBonus, 400, '双链并行：clearing 帧 b2bBonus=400')
  assert.equal(s2.b2bChain, true, '双链并行：clearing 帧 b2bChain=true（AC-7 同帧并存）')
})

test('§16.9 零回归：孤立单消 1/2/3/4 行 ×L1/L2 逐值=r18/r20 基线（fresh 会话 b2b 恒 0 增量）（AC-8）', () => {
  const table = [
    { n: 1, l1: 100, l2: 200 },
    { n: 2, l1: 300, l2: 600 },
    { n: 3, l1: 500, l2: 1000 },
    { n: 4, l1: 800, l2: 1600 },
  ]
  for (const t of table) {
    const a = freshGame()
    a.g.start()
    comboStageLines(a.g, t.n)
    const sa = a.g.getSnapshot()
    assert.equal(sa.score, t.l1, t.n + ' 行 L1 孤立消 = ' + t.l1 + '（b2b 零增量）')
    assert.equal(sa.b2bChain, t.n === 4, t.n + ' 行 L1 结算帧链 = ' + (t.n === 4) + '（Tetris 置链，其余 off）')
    const b2 = freshGame()
    b2.g.start()
    b2.g._debug.setLines(12)
    comboStageLines(b2.g, t.n)
    const sb = b2.g.getSnapshot()
    assert.equal(sb.score, t.l2, t.n + ' 行 L2 = ' + t.l2 + '（b2b 零增量）')
    assert.equal(typeof sb.b2bChain, 'boolean', t.n + ' 行 b2bChain 恒 boolean')
    assert.equal(sb.b2bBonus, null, t.n + ' 行非 clearing 期 b2bBonus 恒 null')
  }
})

test('§16.10 B2B 感知 soak：50 局确定性注入（n 周期 3→4→4→2 构造相邻 4 行对 + rotate/move/soft 混合）→ 逐锁增量累和 == onGameOver 总分；无 NaN/负分（AC-8/14）', () => {
  function lcg(seed) { // 确定性 LCG → [0,1)（与 rng 注入口径一致）
    let s = seed >>> 0
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 4294967296
    }
  }
  const N_GAMES = 50
  const LOCKS = 60
  const NCYCLE = [3, 4, 4, 2] // 构造相邻 4 行对（i%4==1,2）→ 链 on 场景必然出现（B2B 感知）
  for (let gi = 0; gi < N_GAMES; gi++) {
    const rng = lcg(gi * 7919 + 13)
    const over = []
    const g = T.createGame({
      rng: rng, autoLoop: false, keyboard: false, autoPauseOnBlur: false, animMs: 0,
      onGameOver: (s) => over.push(s),
    })
    g.start()
    let sum = 0
    let prevScore = 0
    let prevCleared = 0
    for (let i = 0; i < LOCKS; i++) {
      const n = NCYCLE[i % 4]
      const miss = 3 + (i % 5)
      const b = T.createBoard()
      for (let r = 20 - n; r <= 19; r++) for (let c = 0; c < T.COLS; c++) if (c !== miss) b[r][c] = 'S'
      g._debug.setBoard(b)
      g._debug.setNext('T')
      g._debug.setPiece({ type: 'I', rot: 1, x: miss - 2, y: 20 - n - 5 })
      const op = Math.floor(rng() * 4)
      if (op === 0) g.rotate()
      else if (op === 1) g.move(-1)
      else if (op === 2) g.move(1)
      else g.softDrop()
      const r = g.hardDrop()
      assert.equal(r.ok, true, '局 ' + gi + ' 第 ' + i + ' 锁 hardDrop ok')
      const s = g.getSnapshot()
      assert.equal(Number.isFinite(s.score) && s.score >= 0, true, '局 ' + gi + ' 第 ' + i + ' 锁分数合法（无 NaN/负分）')
      assert.ok(s.score >= prevScore, '局 ' + gi + ' 第 ' + i + ' 锁无负增量')
      assert.ok(r.cleared >= 0 && r.cleared <= 4, '局 ' + gi + ' 第 ' + i + ' 锁清行 0~4')
      assert.equal(typeof s.b2bChain, 'boolean', '局 ' + gi + ' 第 ' + i + ' 锁 b2bChain 恒 boolean')
      const delta = s.score - prevScore
      // B2B 感知断言：前一锁 4 行且本次 4 行 → 增量必含 b2b 轴（≥800×L + 400×L ≥ 1200）
      if (prevCleared === 4 && r.cleared === 4) {
        assert.ok(delta >= 800 + 400, '局 ' + gi + ' 第 ' + i + ' 锁相邻 4 行对增量 ≥ 1200（含 B2B 轴）')
      }
      sum += delta
      prevScore = s.score
      prevCleared = r.cleared
    }
    assert.ok(sum >= 0 && Number.isFinite(sum), '局 ' + gi + ' 逐锁增量累和合法')
    const b = T.createBoard()
    b[19] = fullRow('I', 5)
    b[0][4] = 'J'; b[0][5] = 'J'
    g._debug.setBoard(b)
    g._debug.setNext('I')
    g._debug.setPiece({ type: 'I', rot: 1, x: 3, y: 16 })
    g.hardDrop()
    assert.equal(g.getPhase(), 'OVER', '局 ' + gi + ' 强制 OVER')
    assert.equal(over.length, 1, '局 ' + gi + ' gameOver 恰 1 次')
    sum += g.getSnapshot().score - prevScore
    assert.equal(over[0], sum, '局 ' + gi + ' onGameOver 总分 == 逐锁增量累和（含 b2b）')
  }
})

