'use strict'
/*!
 * tetris/scripts/verify-persist.cjs — 持久化层自检（node:test，零依赖）
 * ============================================================================
 * 运行：node scripts/verify-persist.cjs
 *
 * 背景（v2.6 技术驱动改造，变更单 docs/teamflow/technical/changes-persist.md §3）：
 * persist.js 是纯逻辑无 DOM 的独立 UMD 模块，可在 Node 直接 require 单测。
 * 本脚本覆盖变更单 §3 / §5 列出的全部持久化语义：
 *   1. 键读写往返（跨实例共享存储，模拟「刷新后恢复」）；
 *   2. available=false 内存降级（Node 无 localStorage → 会话内读写正常、刷新不清的场景）；
 *   3. 损坏 JSON / 版本不符 → 清键回默认（绝不 throw）；
 *   4. sanitize 边界（最高分负数/NaN/超界、音量越界、布尔非白名单回默认）；
 *   5. saveHighScore 只增不减；
 *   6. dispose 后不再写、load/save* 不抛错。
 * 作为持久化层回归锚点，独立于既有六套验证脚本。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const P = require('../persist.js')

// —— 测试用「真实回写底层」：对齐 Storage API 子集的确定性共享容器（跨实例持久）——
function makeBacking(initial) {
  const m = Object.create(null)
  if (initial) for (const k of Object.keys(initial)) m[k] = String(initial[k])
  return {
    raw: m,
    get: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null },
    set: function (k, v) { m[k] = String(v) },
    remove: function (k) { if (Object.prototype.hasOwnProperty.call(m, k)) delete m[k] },
  }
}

// 直接在底层写入一段原始 JSON（用于伪造坏数据/版本不符）
function seedRaw(backing, key, raw) {
  backing.raw[key] = String(raw)
}

/* ============================================================================
 * 1. 模块导出面（装配审计亦依赖：persist 必须导出 UMD 双面 + 工厂/纯函数）
 * ========================================================================== */
test('persist: 导出契约齐全（VERSION/键/默认值/工厂/sanitize）', () => {
  assert.equal(typeof P.VERSION, 'string')
  assert.equal(typeof P.sanitize, 'function')
  assert.equal(typeof P.createStorage, 'function')
  assert.equal(typeof P.createPersistence, 'function')
  assert.equal(typeof P.TETRIS_PERSIST_KEY, 'string')
  assert.equal(typeof P.PAYLOAD_VERSION, 'number')
  assert.equal(typeof P.DEFAULT_HIGH_SCORE, 'number')
  assert.equal(typeof P.DEFAULT_SETTINGS, 'object')
  // 键名/默认值对齐变更单 §3 与 ui.js 现状语义
  assert.equal(P.TETRIS_PERSIST_KEY, 'tetris.v2')
  assert.equal(P.DEFAULT_SETTINGS.volume, 0.8)
  assert.equal(P.DEFAULT_SETTINGS.muted, false)
  assert.equal(P.DEFAULT_SETTINGS.ghostEnabled, true)
  assert.equal(P.DEFAULT_SETTINGS.bgmEnabled, false)
})

/* ============================================================================
 * 2. 键读写往返（注入共享存储 → 跨实例恢复，等价「刷新后恢复」）
 * ========================================================================== */
test('persist: 最高分/设置键读写往返（跨实例持久）', () => {
  const backing = makeBacking()
  const p1 = P.createPersistence({ storage: backing })
  const loaded1 = p1.load()
  assert.equal(loaded1.highScore, 0, '初始最高分默认 0')
  assert.deepEqual(loaded1.settings, P.DEFAULT_SETTINGS, '初始设置默认值')

  p1.saveHighScore(120)
  p1.saveSettings({ volume: 0.5, muted: true, ghostEnabled: false, bgmEnabled: true })

  // 新实例（等价刷新重开）读回同一底层 → 恢复
  const p2 = P.createPersistence({ storage: backing })
  const loaded2 = p2.load()
  assert.equal(loaded2.highScore, 120, '最高分跨实例恢复')
  assert.deepEqual(loaded2.settings, {
    volume: 0.5,
    muted: true,
    ghostEnabled: false,
    bgmEnabled: true,
  }, '四设置跨实例恢复')
})

/* ============================================================================
 * 2b. 真实 Web Storage API 形状对抗（BUG-P1-1 回归锚点）
 * 原生 window.localStorage 只有 getItem/setItem/removeItem（无 get/set/remove）。
 * 注入完全等价于真实 localStorage 的形状，断言读写/落盘/跨实例恢复全链路正确，
 * 杜绝「探测过、调用炸」的适配器漂移再次出现（单测形状与真实适配形状必须一致）。
 * ========================================================================== */
test('persist: 真实 Web Storage 形状（仅 getItem/setItem/removeItem）全链路正确（BUG-P1-1）', () => {
  // 严格只暴露 Web Storage 三方法，故意不含 get/set/remove —— 正是 BUG-P1-1 的静默源
  const m = Object.create(null)
  const lsShaped = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null },
    setItem: function (k, v) { m[k] = String(v) },
    removeItem: function (k) { if (Object.prototype.hasOwnProperty.call(m, k)) delete m[k] },
  }

  const p1 = P.createPersistence({ storage: lsShaped })
  const initial = p1.load()
  assert.equal(initial.highScore, 0, '初始最高分默认 0')
  assert.deepEqual(initial.settings, P.DEFAULT_SETTINGS, '初始设置默认值')

  p1.saveHighScore(250)
  p1.saveSettings({ volume: 0.6, muted: true, ghostEnabled: false, bgmEnabled: true })

  // 断言真实落盘（经 setItem/getItem 可读回，未走 get/set）
  const raw = lsShaped.getItem(P.TETRIS_PERSIST_KEY)
  assert.equal(typeof raw, 'string', '真实形状下值确实写入底层')
  assert.ok(raw.indexOf('"highScore":250') !== -1, '最高分已落盘')

  // 新实例（等价刷新重开）读回 —— 若适配器漂移此处必丢（BUG-P1-1 复现点）
  const p2 = P.createPersistence({ storage: lsShaped })
  const restored = p2.load()
  assert.equal(restored.highScore, 250, '真实形状跨实例恢复最高分')
  assert.equal(restored.settings.volume, 0.6, '恢复音量')
  assert.equal(restored.settings.muted, true, '恢复静音')
  assert.equal(restored.settings.ghostEnabled, false, '恢复幽灵开关')
  assert.equal(restored.settings.bgmEnabled, true, '恢复 BGM 开关')
})

/* ============================================================================
 * 3. available=false 内存降级（Node 无 localStorage → 会话内读写正常）
 * ========================================================================== */
test('persist: createStorage 在无 localStorage 环境 available=false（内存降级）', () => {
  const storage = P.createStorage()
  assert.equal(storage.available, false, 'Node 无 window.localStorage → 降级内存')

  // 默认 createPersistence（内部用内存存储）：会话内 save→load 往返正常
  const p = P.createPersistence()
  p.saveHighScore(77)
  assert.equal(p.load().highScore, 77, '内存降级下会话内读写往返正常')
  p.saveSettings({ volume: 0.3 })
  assert.equal(p.load().settings.volume, 0.3)
})

/* ============================================================================
 * 4. 损坏 JSON / 版本不符 → 清键回默认（绝不 throw）
 * ========================================================================== */
test('persist: 坏 JSON 清键回默认且清掉键', () => {
  const backing = makeBacking()
  seedRaw(backing, P.TETRIS_PERSIST_KEY, '{ not valid json !!!')
  const p = P.createPersistence({ storage: backing })
  let loaded
  assert.doesNotThrow(() => { loaded = p.load() })
  assert.equal(loaded.highScore, 0, '坏 JSON → 最高分回默认 0')
  assert.deepEqual(loaded.settings, P.DEFAULT_SETTINGS, '坏 JSON → 设置回默认')
  assert.equal(backing.get(P.TETRIS_PERSIST_KEY), null, '坏 JSON 被清键')
})

test('persist: 版本不符清键回默认', () => {
  const backing = makeBacking()
  seedRaw(backing, P.TETRIS_PERSIST_KEY,
    JSON.stringify({ version: 999, highScore: 500, settings: { volume: 1 } }))
  const p = P.createPersistence({ storage: backing })
  const loaded = p.load()
  assert.equal(loaded.highScore, 0, '版本不符 → 最高分回默认')
  assert.deepEqual(loaded.settings, P.DEFAULT_SETTINGS, '版本不符 → 设置回默认')
  assert.equal(backing.get(P.TETRIS_PERSIST_KEY), null, '版本不符被清键')
})

/* ============================================================================
 * 5. sanitize 边界（负数 / NaN / 非布尔 / 超界）
 * ========================================================================== */
test('persist: sanitize integer（最高分）边界', () => {
  const int = (v, def) => P.sanitize(v, { type: 'integer', min: 0, max: Infinity, def })
  assert.equal(int(-5, 0), 0, '负数 → 回默认 0')
  assert.equal(int(NaN, 0), 0, 'NaN → 回默认 0')
  assert.equal(int('abc', 0), 0, '非数值字符串 → 回默认 0')
  assert.equal(int(4.9, 0), 4, '浮点 → floor 取整')
  assert.equal(int('12', 0), 12, '数值字符串 → 归一')
  assert.equal(P.sanitize(10, { type: 'integer', min: 0, max: 8, def: 0 }), 8, '超界 → 收敛上界')
})

test('persist: sanitize float（音量）边界', () => {
  const vol = (v) => P.sanitize(v, { type: 'float', min: 0, max: 1, def: 0.8 })
  assert.equal(vol(-1), 0.8, '负数 → 回默认')
  assert.equal(vol(NaN), 0.8, 'NaN → 回默认')
  assert.equal(vol(5), 1, '超上界 → 收敛 1')
  assert.equal(vol(0.5), 0.5, '区间内保留')
})

test('persist: sanitize boolean（三设置白名单）边界', () => {
  const bool = (v, def) => P.sanitize(v, { type: 'boolean', def })
  assert.equal(bool(true, false), true, 'true 保留')
  assert.equal(bool(false, true), false, 'false 保留')
  assert.equal(bool('1', false), false, '字符串非白名单 → 回默认')
  assert.equal(bool(1, false), false, '数值 1 非布尔 → 回默认')
  assert.equal(bool(0, true), true, '数值 0 非布尔 → 回默认')
  assert.equal(bool(undefined, false), false, 'undefined → 回默认')
})

/* ============================================================================
 * 6. 只增不减（saveHighScore）
 * ========================================================================== */
test('persist: saveHighScore 只增不减', () => {
  const backing = makeBacking()
  const p = P.createPersistence({ storage: backing })
  p.saveHighScore(100)
  assert.equal(p.load().highScore, 100, '首写 100')

  p.saveHighScore(50)
  assert.equal(p.load().highScore, 100, '较小值不覆盖（只增不减）')

  p.saveHighScore(150)
  assert.equal(p.load().highScore, 150, '更大值正常更新')

  p.saveHighScore(-99)
  assert.equal(p.load().highScore, 150, '负值不清零不覆盖（只增不减）')
})

/* ============================================================================
 * 7. dispose 后不再写、load/save* 不抛错
 * ========================================================================== */
test('persist: dispose 后不再写、load/save* 不抛错', () => {
  const backing = makeBacking()
  const p = P.createPersistence({ storage: backing })
  p.saveHighScore(100)
  p.saveSettings({ volume: 0.4 })

  p.dispose()

  let saveRet
  assert.doesNotThrow(() => { saveRet = p.saveHighScore(200) })
  assert.equal(saveRet, false, 'dispose 后 saveHighScore 返回 false（不写）')
  // dispose 后不再写：底层键值应仍为 dispose 前的载荷，未被 200 覆盖
  const stored = backing.get(P.TETRIS_PERSIST_KEY)
  assert.equal(typeof stored, 'string', 'dispose 不删既有键（留给会话内）')
  assert.ok(!stored.includes('"highScore":200'), 'dispose 后未把 200 写进底层')

  let loaded
  assert.doesNotThrow(() => { loaded = p.load() })
  assert.equal(loaded.highScore, 0, 'dispose 后 load 回默认（内存镜像已清）')

  let stRet
  assert.doesNotThrow(() => { stRet = p.saveSettings({ ghostEnabled: false }) })
  assert.equal(stRet, false, 'dispose 后 saveSettings 返回 false（不写）')
})
